// Copyright (c) 2026 Reactor Technologies, Inc. All rights reserved.

/**
 * Stateless primitives for the Reactor recording feature.
 *
 * This module owns:
 * - Public-facing {@link Clip} type, {@link RecordingError} class, and
 *   the `RuntimeRecordingMessageType` enum.
 * - Wire schemas (`ClipReadyPayloadSchema`, `ClipFailedPayloadSchema`)
 *   plus `clipFromPayload` to convert snake_case wire payloads into
 *   camelCase `Clip` objects.
 * - HTTP helpers `fetchPlaylist` (deadline-driven polling) and
 *   `parsePlaylist` (HLS `.m3u8` parser).
 * - The `downloadClipAsFile` helper that streams the referenced
 *   fMP4 chunks and byte-concatenates them into a fragmented-MP4
 *   Blob for browser download.
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

/**
 * `clipReady.data` payload as serialised by `ClipResult.to_dict()` on
 * the runtime side. Required fields mirror the Python dataclass; extra
 * fields are tolerated so the wire can grow without breaking old SDKs.
 */
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

/**
 * Optional URL rewrite hook. In local development the runtime fills
 * `playlist_url` from its own bind address (typically `0.0.0.0:8080`),
 * which isn't routable from the browser when port-forwarding is in
 * play. The SDK passes the same coordinator base URL it's already
 * talking to so the host/port get rewritten in-place. Production URLs
 * (`https://api.reactor.inc/clips?…`) are passed through unchanged when
 * `coordinatorBaseUrl` is `undefined`.
 */
export interface ParseClipOptions {
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
 * Replace the scheme + host + port of `target` with the ones from
 * `base`, preserving path + query + fragment. Used to repoint a
 * `playlist_url` minted with the runtime's bind address at the SDK's
 * actual coordinator URL.
 *
 * Falls back to the original URL on any parse failure rather than
 * throwing — the worst case is the request fails on fetch, which is
 * a louder, more debuggable failure mode than a silent rewrite.
 */
export function rewriteUrlHost(target: string, base: string): string {
  try {
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

// ─────────────────────────────────────────────────────────────────────────────
// HLS playlist fetching + parsing
// ─────────────────────────────────────────────────────────────────────────────

/** Internal — segments referenced by an HLS manifest, in playback order. */
interface ParsedPlaylist {
  initUrl: string;
  segmentUrls: string[];
}

/**
 * Default grace period before {@link fetchPlaylist} gives up.
 *
 * Counted from `max(predictedReadyAtMs, startedPollingAt)` so a user
 * who reads the "ready in Ns" pill for a few seconds before clicking
 * Download still gets the full grace window from the moment polling
 * actually starts. 15 s comfortably covers cold-start S3 PUT
 * variability without making a real recorder crash hang the UI.
 */
export const DEFAULT_PLAYLIST_POLL_SLACK_MS = 15_000;

export interface FetchPlaylistOptions {
  /**
   * Unix epoch (ms) when the runtime predicts the boundary chunk will
   * be servable. Pass `clip.predictedReadyAtMs` here. When set, polling
   * continues until `predictedReadyAtMs + slackMs`; once past, a
   * stuck `202` produces `CLIP_NOT_READY` (assume runtime crashed).
   */
  predictedReadyAtMs?: number;
  /** Grace period after `predictedReadyAtMs`. Default {@link DEFAULT_PLAYLIST_POLL_SLACK_MS}. */
  slackMs?: number;
  /**
   * Hard cap on the per-poll wait. The server's `Retry-After` header is
   * honored but clamped. Default 2000 ms keeps pending UI snappy.
   */
  maxRetryDelayMs?: number;
  /** Floor on the per-poll wait so we don't hot-loop on cheap networks. Default 200 ms. */
  minRetryDelayMs?: number;
  /**
   * Fallback retry count used when `predictedReadyAtMs` is omitted
   * (e.g. someone calls `fetchPlaylist` directly with a saved URL,
   * outside of a fresh `Clip`). Default 5.
   */
  maxRetries?: number;
  /** Aborts in-flight fetches and the inter-poll sleep. */
  signal?: AbortSignal;
}

/**
 * Fetch the playlist URL, polling on `202 Accepted` (which the manifest
 * endpoint returns while the boundary chunk is still uploading).
 *
 * Polling deadline is driven by `predictedReadyAtMs + slackMs` when a
 * `Clip` was just minted by the runtime; without that field the
 * function falls back to `maxRetries` attempts. Either way:
 * - `200` → returns the manifest body.
 * - `410` / `404` → throws `CLIP_GONE`.
 * - `5xx`/other → throws `PLAYLIST_FETCH_FAILED` (no retry).
 * - Past the deadline / retries with stuck `202` → throws
 *   `CLIP_NOT_READY` (the runtime probably crashed mid-chunk).
 */
export async function fetchPlaylist(
  playlistUrl: string,
  options: FetchPlaylistOptions = {}
): Promise<string> {
  const slackMs = options.slackMs ?? DEFAULT_PLAYLIST_POLL_SLACK_MS;
  const minDelay = Math.max(0, options.minRetryDelayMs ?? 200);
  const maxDelay = Math.max(minDelay, options.maxRetryDelayMs ?? 2_000);
  const fallbackMaxRetries = options.maxRetries ?? 5;

  const hasDeadline = typeof options.predictedReadyAtMs === "number";
  // Apply the slack from the LATER of (a) the runtime's prediction
  // and (b) when we actually started polling. This means a user who
  // reads the "ready in Ns" pill for a few seconds before clicking
  // Download still gets the full grace window — without this, slow
  // first-chunk uploads + late clicks racing the deadline would
  // CLIP_NOT_READY immediately on a clip that's about to land.
  const startedPollingAt = Date.now();
  const deadlineMs = hasDeadline
    ? Math.max(options.predictedReadyAtMs as number, startedPollingAt) + slackMs
    : undefined;

  let attempt = 0;
  let lastStatus = 0;

  while (true) {
    let response: Response;
    try {
      response = await fetch(playlistUrl, { signal: options.signal });
    } catch (error) {
      throw new RecordingError(
        "PLAYLIST_FETCH_FAILED",
        `Network error fetching playlist: ${(error as Error).message}`
      );
    }
    lastStatus = response.status;

    // Order matters: 202 is in the 2xx range so it would match
    // ``response.ok`` if we didn't branch on it first.
    if (response.status === 202) {
      // Decide whether to keep polling.
      if (hasDeadline) {
        if (Date.now() >= (deadlineMs as number)) {
          throw new RecordingError(
            "CLIP_NOT_READY",
            `Boundary chunk still pending after ${slackMs}ms grace (predicted ready ${new Date(
              options.predictedReadyAtMs as number
            ).toISOString()}). Runtime may have crashed mid-clip.`
          );
        }
      } else if (attempt >= fallbackMaxRetries) {
        throw new RecordingError(
          "CLIP_NOT_READY",
          `Manifest still pending after ${attempt + 1} attempts (last status ${lastStatus})`
        );
      }

      const headerDelay = parseRetryAfter(
        response.headers.get("Retry-After"),
        minDelay
      );
      const delay = Math.min(maxDelay, Math.max(minDelay, headerDelay));
      // Don't sleep past the deadline; clamp so the next loop sees it.
      const clampedDelay = hasDeadline
        ? Math.min(delay, Math.max(0, (deadlineMs as number) - Date.now()))
        : delay;
      await sleep(clampedDelay, options.signal);
      attempt++;
      continue;
    }

    if (response.status === 200) {
      return await response.text();
    }
    if (response.status === 410) {
      throw new RecordingError(
        "CLIP_GONE",
        "Clip is no longer available (chunks aged out or session unknown)"
      );
    }
    if (response.status === 404) {
      throw new RecordingError(
        "CLIP_GONE",
        "Session not found for clip playlist"
      );
    }
    throw new RecordingError(
      "PLAYLIST_FETCH_FAILED",
      `Manifest endpoint returned HTTP ${response.status}`
    );
  }
}

/**
 * Parse an HLS `.m3u8` body into the init segment URL plus the ordered
 * list of media segment URLs. Resolves relative URLs against the
 * playlist URL itself.
 */
export function parsePlaylist(
  manifestBody: string,
  playlistUrl: string
): ParsedPlaylist {
  let initUrl: string | undefined;
  const segments: string[] = [];

  const lines = manifestBody.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith("#EXT-X-MAP")) {
      const match = trimmed.match(/URI="([^"]+)"/);
      if (match) {
        initUrl = resolveAgainst(match[1], playlistUrl);
      }
      continue;
    }
    if (trimmed.startsWith("#")) {
      continue;
    }
    segments.push(resolveAgainst(trimmed, playlistUrl));
  }

  if (!initUrl) {
    throw new RecordingError(
      "INVALID_PLAYLIST",
      "Playlist is missing an #EXT-X-MAP init segment URI"
    );
  }
  if (segments.length === 0) {
    throw new RecordingError(
      "INVALID_PLAYLIST",
      "Playlist contains no media segments"
    );
  }

  return { initUrl, segmentUrls: segments };
}

// ─────────────────────────────────────────────────────────────────────────────
// downloadClipAsFile
// ─────────────────────────────────────────────────────────────────────────────

export interface DownloadClipOptions {
  /** Override the HTTP client used to fetch the playlist + chunks. Defaults to global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Forwarded to every request. Cancels both the playlist poll and any in-flight chunk fetches. */
  signal?: AbortSignal;
  /** Called after each chunk completes — useful for progress UI. */
  onProgress?: (info: {
    fetched: number;
    total: number;
    bytes: number;
  }) => void;
}

/**
 * Stream the chunks referenced by `clip.playlistUrl`, byte-concatenate
 * them into a fragmented-MP4 Blob, and trigger a browser-native
 * `<a download>`.
 *
 * The output is a *fragmented* MP4 (init segment ‖ media segments) which
 * plays correctly in browsers, QuickTime, VLC, Discord/Slack uploads,
 * and most NLEs. Tools that require a non-fragmented MP4 can remux
 * locally with `ffmpeg -i clip.mp4 -c copy -movflags +faststart`.
 *
 * Returns the assembled `Blob` so non-DOM consumers (Node tests,
 * server-side workers) can use the function without the download
 * trigger — pass `filename: null` to skip the download step entirely.
 */
export async function downloadClipAsFile(
  clip: Clip,
  filename: string | null = "reactor-clip.mp4",
  options: DownloadClipOptions = {}
): Promise<Blob> {
  const fetchImpl = options.fetchImpl ?? fetch;

  const manifestBody = await fetchPlaylist(clip.playlistUrl, {
    predictedReadyAtMs: clip.predictedReadyAtMs,
    signal: options.signal,
  });
  const { initUrl, segmentUrls } = parsePlaylist(
    manifestBody,
    clip.playlistUrl
  );

  const orderedUrls = [initUrl, ...segmentUrls];
  const parts: BlobPart[] = [];
  let bytes = 0;

  for (let i = 0; i < orderedUrls.length; i++) {
    const url = orderedUrls[i];
    let response: Response;
    try {
      response = await fetchImpl(url, { signal: options.signal });
    } catch (error) {
      throw new RecordingError(
        "CHUNK_FETCH_FAILED",
        `Network error fetching chunk ${i}: ${(error as Error).message}`
      );
    }
    if (!response.ok) {
      throw new RecordingError(
        "CHUNK_FETCH_FAILED",
        `Chunk ${i} returned HTTP ${response.status}`
      );
    }
    const data = await response.arrayBuffer();
    parts.push(data);
    bytes += data.byteLength;
    options.onProgress?.({
      fetched: i + 1,
      total: orderedUrls.length,
      bytes,
    });
  }

  const blob = new Blob(parts, { type: "video/mp4" });

  if (filename === null) {
    return blob;
  }
  if (
    typeof document === "undefined" ||
    typeof URL.createObjectURL !== "function"
  ) {
    throw new RecordingError(
      "DOWNLOAD_UNSUPPORTED",
      "downloadClipAsFile requires a DOM environment; pass filename=null to skip the download trigger"
    );
  }

  triggerBrowserDownload(blob, filename);
  return blob;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

function resolveAgainst(target: string, base: string): string {
  try {
    return new URL(target, base).toString();
  } catch {
    return target;
  }
}

function parseRetryAfter(header: string | null, fallbackMs: number): number {
  if (!header) return fallbackMs;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }
  const dateMs = Date.parse(header);
  if (!Number.isNaN(dateMs)) {
    return Math.max(0, dateMs - Date.now());
  }
  return fallbackMs;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function triggerBrowserDownload(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
