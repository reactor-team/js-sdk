// Copyright (c) 2026 Reactor Technologies, Inc. All rights reserved.

/**
 * Stateless wire-contract primitives for the Reactor recording feature.
 *
 * This module owns:
 * - Public-facing {@link Clip} type, {@link RecordingError} class, and
 *   the `RuntimeRecordingMessageType` enum.
 * - Wire schemas (`ClipReadyPayloadSchema`, `ClipFailedPayloadSchema`)
 *   plus `clipFromPayload` to convert snake_case wire payloads into
 *   camelCase `Clip` objects.
 * - `rewriteUrlHost` for local-mode URL rewriting.
 *
 * Stateful pieces (FIFO promise correlator, in-flight request
 * lifecycle, integration with Reactor's event bus) live in the
 * `RecordingClient` class in `core/RecordingClient.ts`.
 *
 * Wire contract is documented end-to-end in the *Video Recording
 * Feature* Notion page; the runtime side ships in
 * `reactor_runtime/recording/`.
 */

import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// Runtime message types (mirrors RuntimeMessageType in Python)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Names of the runtime-scoped messages used by the recording feature.
 * Outbound names are sent via `Reactor.sendCommand(name, …, "runtime")`;
 * inbound names appear as `message.type` on `runtimeMessage` events.
 */
export const RuntimeRecordingMessageType = {
  REQUEST_CLIP: "requestClip",
  REQUEST_RECORDING: "requestRecording",
  CLIP_READY: "clipReady",
  CLIP_FAILED: "clipFailed",
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

/** Discriminator on a {@link Clip}. `"snap"` from `requestClip`, `"recording"` from `requestRecording`. */
export type ClipKind = "snap" | "recording";

/**
 * Resolved outcome of a {@link Reactor.requestClip} / {@link Reactor.requestRecording} call.
 *
 * The runtime returns immediately on every request — it does *not*
 * block until the in-progress chunk has been finalised. The response
 * is a *promise*: `endMarker` reflects wall-clock at request time
 * and may point inside a chunk ffmpeg is still writing. The
 * `/clips` manifest endpoint returns `202 Retry-After` while that
 * chunk is in flight; the SDK polls until `200`.
 *
 * - `startMarker` / `endMarker` / `nowMarker` are session-relative
 *   seconds since recorder start.
 * - `predictedReadyAtMs` is a **Unix epoch in milliseconds** — the
 *   runtime's estimate of when the boundary chunk will be servable
 *   by `/clips`. Compare against `Date.now()` to drive a "ready in
 *   Ns" indicator. The SDK uses this as the polling deadline: past
 *   `predictedReadyAtMs + slackMs` and still 202, the SDK fails with
 *   `CLIP_NOT_READY` on the assumption the runtime crashed.
 * - `playlistUrl` is short-lived in production (the embedded chunk
 *   URLs are presigned for a few minutes). Re-issuing the request
 *   produces a fresh URL with fresh presigning.
 */
export interface Clip {
  sessionId: string;
  kind: ClipKind;
  startMarker: number;
  endMarker: number;
  nowMarker: number;
  predictedReadyAtMs: number;
  playlistUrl: string;
}

/**
 * Error thrown when a recording request cannot be served.
 *
 * `code` is a stable, machine-readable identifier; `reason` is the
 * raw string the runtime / manifest endpoint returned (passed through
 * verbatim from `clipFailed.reason`, the `/clips` HTTP body, or the
 * SDK's pre-flight check).
 */
export class RecordingError extends Error {
  constructor(
    public readonly code:
      | "RECORDER_DISABLED"
      | "INVALID_DURATION"
      | "REQUEST_TIMEOUT"
      | "DISCONNECTED"
      | "CLIP_GONE"
      | "CLIP_NOT_READY"
      | "PLAYLIST_FETCH_FAILED"
      | "CHUNK_FETCH_FAILED"
      | "INVALID_PLAYLIST"
      | "DOWNLOAD_UNSUPPORTED"
      | "INTERNAL_ERROR",
    public readonly reason: string
  ) {
    super(`${code}: ${reason}`);
    this.name = "RecordingError";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Wire schemas
// ─────────────────────────────────────────────────────────────────────────────

/** `clipReady.data` payload as serialised by `ClipResult.to_dict()`. */
export const ClipReadyPayloadSchema = z
  .object({
    session_id: z.string(),
    kind: z.enum(["snap", "recording"]),
    start_marker: z.number(),
    end_marker: z.number(),
    now_marker: z.number(),
    predicted_ready_at_ms: z.number(),
    playlist_url: z.string(),
  })
  .passthrough();

export type ClipReadyPayload = z.infer<typeof ClipReadyPayloadSchema>;

/** `clipFailed.data` payload — short reason string from the runtime. */
export const ClipFailedPayloadSchema = z
  .object({
    reason: z.string().default("unknown"),
  })
  .passthrough();

export type ClipFailedPayload = z.infer<typeof ClipFailedPayloadSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Wire → public type conversion
// ─────────────────────────────────────────────────────────────────────────────

/** Options for {@link clipFromPayload}. */
export interface ParseClipOptions {
  /**
   * Coordinator base URL.  When set, resolves `payload.playlist_url`
   * against this base — used to convert the runtime's path-only
   * playlist URL (``/clips?session_id=…``) into an absolute URL the
   * browser/SDK can fetch.  Also handles the legacy case where an
   * older runtime emits an absolute URL bound to its own
   * ``0.0.0.0`` listener: the host/port are rewritten onto the
   * coordinator.
   */
  coordinatorBaseUrl?: string;
}

/**
 * Convert a validated {@link ClipReadyPayload} into the public {@link Clip}.
 * Pure: no IO, no side effects.
 */
export function clipFromPayload(
  payload: ClipReadyPayload,
  options: ParseClipOptions = {}
): Clip {
  const playlistUrl = options.coordinatorBaseUrl
    ? rewriteUrlHost(payload.playlist_url, options.coordinatorBaseUrl)
    : payload.playlist_url;
  return {
    sessionId: payload.session_id,
    kind: payload.kind,
    startMarker: payload.start_marker,
    endMarker: payload.end_marker,
    nowMarker: payload.now_marker,
    predictedReadyAtMs: payload.predicted_ready_at_ms,
    playlistUrl,
  };
}

/**
 * Resolve `target` against `base`, returning an absolute URL.
 *
 * Two cases:
 *
 * * **Path-only / relative target** (no scheme — e.g. the
 *   runtime's current ``/clips?session_id=…`` shape): joined
 *   against ``base`` via ``new URL(target, base)``, preserving
 *   path, query, and fragment.
 * * **Absolute target** (``http://…`` / ``https://…``, e.g. a legacy
 *   runtime emitting a URL bound to its own ``0.0.0.0`` listener):
 *   scheme, hostname, and port are replaced with ``base``'s,
 *   preserving path, query, and fragment.
 *
 * Returns the original ``target`` on any parse failure rather than
 * throwing — the SDK consumes the URL eagerly and shouldn't break
 * a session over a malformed clip envelope.
 */
export function rewriteUrlHost(target: string, base: string): string {
  try {
    // Path-only / scheme-less → resolve against base.
    if (!/^[a-z][a-z0-9+.-]*:/i.test(target)) {
      return new URL(target, base).toString();
    }
    // Absolute → rewrite scheme/host/port, keep path/query/fragment.
    const baseUrl = new URL(base);
    const parsed = new URL(target);
    parsed.protocol = baseUrl.protocol;
    parsed.hostname = baseUrl.hostname;
    parsed.port = baseUrl.port;
    return parsed.toString();
  } catch {
    return target;
  }
}
