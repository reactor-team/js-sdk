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
 *   fMP4 chunks, optionally remuxes them into a flat MP4 via
 *   `mp4box` (PTS=0, faststart, `major_brand=isom`), and returns a
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
      | "REMUX_UNAVAILABLE"
      | "REMUX_FAILED"
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

// ─────────────────────────────────────────────────────────────────────────────
// HLS playlist fetching + parsing
// ─────────────────────────────────────────────────────────────────────────────

/** Internal — segments referenced by an HLS manifest, in playback order. */
interface ParsedPlaylist {
  initUrl: string;
  segmentUrls: string[];
}

/**
 * Default grace period after `predictedReadyAtMs` before
 * {@link fetchPlaylist} gives up.  Applied from
 * `max(predictedReadyAtMs, pollStart)` so late clicks still get the
 * full window.
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
  /**
   * Coordinator JWT.  When set, attached as `Authorization: Bearer
   * <jwt>` on the manifest GET — the Coordinator hop.  In local mode
   * (HttpRuntime), leave undefined.
   */
  jwt?: string;
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
  // Slack window starts from max(predictedReadyAtMs, now), so late
  // clicks still get the full grace window.
  const startedPollingAt = Date.now();
  const deadlineMs = hasDeadline
    ? Math.max(options.predictedReadyAtMs as number, startedPollingAt) + slackMs
    : undefined;

  const headers = options.jwt
    ? { Authorization: `Bearer ${options.jwt}` }
    : undefined;

  let attempt = 0;
  let lastStatus = 0;

  while (true) {
    let response: Response;
    try {
      response = await fetch(playlistUrl, {
        signal: options.signal,
        headers,
      });
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

/**
 * Wrap an HLS manifest body in a `blob:` URL suitable for `<video src>`
 * or `hls.js`.  Bypasses the "player can't set Authorization headers"
 * problem: the manifest body is served from browser memory, and the
 * chunk URLs inside are already-signed S3 GETs.
 *
 * Path-only / relative chunk URLs in the body are absolutized against
 * ``playlistUrl`` first.  Without this rewrite the browser would
 * resolve them against the ``blob:`` URL's effective base — the page's
 * origin — and a local-dev frontend on (e.g.) port 3000 would issue
 * chunk fetches against its own dev server instead of the
 * HttpRuntime's ``/clips/chunks/...`` endpoint on port 8080.  In
 * production / kind-cluster mode the manifest already carries absolute
 * presigned S3 URLs and `resolveAgainst` is a no-op on them.
 *
 * Caller owns the returned URL — revoke it via `URL.revokeObjectURL`
 * when playback tears down.  Browser-only; throws `INVALID_PLAYLIST`
 * outside a DOM environment.
 */
export function createPlayableManifestUrl(
  manifestBody: string,
  playlistUrl: string
): string {
  if (
    typeof Blob === "undefined" ||
    typeof URL === "undefined" ||
    typeof URL.createObjectURL !== "function"
  ) {
    throw new RecordingError(
      "INVALID_PLAYLIST",
      "createPlayableManifestUrl requires a browser environment with URL.createObjectURL"
    );
  }
  const rewritten = absolutizeManifestUrls(manifestBody, playlistUrl);
  const blob = new Blob([rewritten], {
    type: "application/vnd.apple.mpegurl",
  });
  return URL.createObjectURL(blob);
}

/**
 * Rewrite an HLS manifest body so every chunk URL is absolute.
 *
 * - ``#EXT-X-MAP:URI="<rel>"`` → ``URI="<abs>"`` via ``resolveAgainst``.
 * - Each non-comment, non-empty line is treated as a media segment URL
 *   and absolutized.
 * - Lines that are already absolute (any URL with a scheme — e.g. an S3
 *   presigned GET) pass through unchanged because ``new URL(target,
 *   base)`` returns ``target`` verbatim when ``target`` is absolute.
 * - All other directives (``#EXTM3U``, ``#EXTINF:...``,
 *   ``#EXT-X-VERSION:...``, etc.) and blank lines are preserved as-is.
 * - Original line endings are preserved (``\r\n`` vs ``\n``) so the
 *   playable blob byte-matches the source on non-rewriting platforms.
 */
function absolutizeManifestUrls(
  manifestBody: string,
  playlistUrl: string
): string {
  // Preserve the source's line-ending style so the blob is byte-stable
  // for absolute-only manifests (production path).
  const eol = manifestBody.includes("\r\n") ? "\r\n" : "\n";
  const lines = manifestBody.split(/\r?\n/);
  const out: string[] = [];
  for (const line of lines) {
    if (line.startsWith("#EXT-X-MAP")) {
      out.push(
        line.replace(
          /URI="([^"]+)"/,
          (_, uri) => `URI="${resolveAgainst(uri, playlistUrl)}"`
        )
      );
      continue;
    }
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      out.push(line);
      continue;
    }
    out.push(resolveAgainst(trimmed, playlistUrl));
  }
  return out.join(eol);
}

// ─────────────────────────────────────────────────────────────────────────────
// downloadClipAsFile
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Controls how `downloadClipAsFile` packages the assembled chunks into
 * the final `Blob`.
 *
 * The runtime serves recordings as fragmented MP4 (fMP4): an
 * `init.mp4` followed by a series of `.m4s` chunks. Byte-concatenating
 * those gives a *playable* fMP4 (Safari, hls.js, ffmpeg all handle
 * it), but social-media uploaders and most desktop tools expect a
 * **flat MP4** — one `ftyp + moov + mdat` with `start_time=0` and
 * `+faststart` layout. A mid-session clip carries the session
 * timeline in its `tfdt baseMediaDecodeTime`, so the concatenated
 * output has `start_time=32.0` (or wherever the clip starts) and
 * QuickLook / Twitter / Instagram either show 32 s of black or reject
 * the upload outright.
 *
 * `mp4box` is loaded dynamically when remux is requested — it is
 * declared as an **optional peer dependency**, mirroring how `hls.js`
 * is configured for {@link ClipPlayer}. Consumers who don't install
 * it stay on the concat path; consumers who do, get a social-ready
 * MP4 out of the box.
 *
 * - `"auto"` *(default)* — remux when `mp4box` is available; fall
 *   back to byte-concat with a one-shot `console.warn` when it
 *   isn't. Safe to ship without further changes; users who want the
 *   improved output `pnpm add mp4box`.
 * - `"force"` — remux unconditionally. Throws
 *   `RecordingError("REMUX_UNAVAILABLE", …)` if `mp4box` can't be
 *   loaded (caller wants a hard guarantee, e.g. before uploading to
 *   Twitter from a server-side context).
 * - `"off"` — never remux. Returns the byte-concatenated fragmented
 *   MP4 verbatim. Use when you specifically want the raw fMP4 (e.g.
 *   to feed it into your own pipeline).
 */
export type RemuxMode = "auto" | "force" | "off";

export interface DownloadClipOptions {
  /**
   * Coordinator JWT.  Attached on the manifest GET only; the chunks
   * referenced inside the manifest are S3 presigned URLs and are
   * fetched unauthenticated.
   */
  jwt?: string;
  /** Forwarded to every request. Cancels both the playlist poll and any in-flight chunk fetches. */
  signal?: AbortSignal;
  /** Called after each chunk completes — useful for progress UI. */
  onProgress?: (info: {
    fetched: number;
    total: number;
    bytes: number;
  }) => void;
  /**
   * Whether to remux the assembled fragmented MP4 into a flat MP4
   * via the optional `mp4box` peer dependency.  Defaults to
   * `"auto"`.  See {@link RemuxMode} for the full semantics and the
   * rationale.
   */
  remux?: RemuxMode;
}

/**
 * Stream the chunks referenced by `clip.playlistUrl`, optionally
 * remux them into a flat social-media-compatible MP4 (default), and
 * (when `filename` is non-null) trigger a browser-native
 * `<a download>`.  Pass `filename: null` to skip the download trigger
 * and just receive the Blob.
 *
 * @see {@link DownloadClipOptions.remux} for the remux mode + the
 *   optional `mp4box` peer dependency.
 */
export async function downloadClipAsFile(
  clip: Clip,
  filename: string | null = "reactor-clip.mp4",
  options: DownloadClipOptions = {}
): Promise<Blob> {
  // Two distinct hops: the manifest GET hits the Coordinator (JWT
  // required) and goes through `fetchPlaylist`; the chunks are S3
  // presigned URLs carrying their own SigV4 query auth and are
  // fetched directly with plain `fetch`.
  const manifestBody = await fetchPlaylist(clip.playlistUrl, {
    predictedReadyAtMs: clip.predictedReadyAtMs,
    signal: options.signal,
    jwt: options.jwt,
  });
  const { initUrl, segmentUrls } = parsePlaylist(
    manifestBody,
    clip.playlistUrl
  );

  const orderedUrls = [initUrl, ...segmentUrls];
  const parts: Uint8Array[] = [];
  let bytes = 0;

  for (let i = 0; i < orderedUrls.length; i++) {
    const url = orderedUrls[i];
    let response: Response;
    try {
      response = await fetch(url, { signal: options.signal });
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
    const data = new Uint8Array(await response.arrayBuffer());
    parts.push(data);
    bytes += data.byteLength;
    options.onProgress?.({
      fetched: i + 1,
      total: orderedUrls.length,
      bytes,
    });
  }

  const finalBytes = await maybeRemux(parts, options.remux ?? "auto");
  const blob = new Blob([finalBytes as BlobPart], { type: "video/mp4" });

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
// Fragmented MP4 → flat MP4 remux
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Concatenate `parts` and, based on `mode`, optionally pipe the
 * result through {@link remuxFragmentedToFlat}.
 *
 * The `"auto"` path swallows a missing-peer-dep `ImportError`,
 * surfaces it once via `console.warn`, and returns the unmodified
 * concatenation — i.e. existing behaviour for users who haven't
 * installed `mp4box`. The `"force"` path turns the same condition
 * into a typed `RecordingError("REMUX_UNAVAILABLE")` for callers
 * that need a hard guarantee. Any other failure inside `mp4box`
 * (corrupt input, unsupported codec, internal assertion) becomes
 * `REMUX_FAILED`.
 */
async function maybeRemux(
  parts: Uint8Array[],
  mode: RemuxMode
): Promise<Uint8Array> {
  if (mode === "off") {
    return concatUint8Arrays(parts);
  }

  let mp4boxModule: typeof import("mp4box");
  try {
    mp4boxModule = await loadMp4Box();
  } catch (error) {
    if (mode === "force") {
      throw new RecordingError(
        "REMUX_UNAVAILABLE",
        `mp4box is not available: ${(error as Error).message}. ` +
          `Install it with \`pnpm add mp4box\` (or your package ` +
          `manager's equivalent), or pass \`remux: "off"\` to skip ` +
          `remux.`
      );
    }
    warnRemuxFallbackOnce();
    return concatUint8Arrays(parts);
  }

  const input = concatUint8Arrays(parts);
  try {
    return await remuxFragmentedToFlat(input, mp4boxModule);
  } catch (error) {
    if (mode === "force") {
      throw new RecordingError(
        "REMUX_FAILED",
        `mp4box remux failed: ${(error as Error).message}`
      );
    }
    console.warn(
      "[Reactor] Clip remux failed, returning fragmented MP4 instead.",
      error
    );
    return input;
  }
}

/**
 * Indirection so tests can stub the dynamic import without depending
 * on whether `mp4box` is actually installed in the test environment,
 * and reset the once-per-process fallback warning latch between
 * cases.
 *
 * @internal
 */
export const __remuxInternals = {
  loadMp4Box: (): Promise<typeof import("mp4box")> => import("mp4box"),
  resetFallbackWarning: (): void => {
    remuxFallbackWarned = false;
  },
};

function loadMp4Box(): Promise<typeof import("mp4box")> {
  return __remuxInternals.loadMp4Box();
}

let remuxFallbackWarned = false;
function warnRemuxFallbackOnce(): void {
  if (remuxFallbackWarned) return;
  remuxFallbackWarned = true;
  console.warn(
    "[Reactor] `mp4box` is not installed; clip downloads will return a " +
      "fragmented MP4 that some uploaders (Twitter, Instagram, ...) " +
      "reject. Run `pnpm add mp4box` to get social-media-compatible " +
      'downloads, or pass `remux: "off"` to silence this warning.'
  );
}

/**
 * The actual fMP4 → flat MP4 conversion.  No re-encode: every NAL
 * unit and AAC packet passes through unchanged.  Only the container
 * framing (boxes) and decode timestamps get rewritten.
 *
 * The output file is initialised with `["isom", "mp42", "avc1", "iso2"]`
 * as compatible brands so the major brand is `isom` (not `iso5`,
 * which is what byte-concatenated fragments default to) and the
 * sample tables are written ahead of `mdat` — i.e. the file is
 * implicitly faststart.  Per-track decode times are shifted by the
 * first sample's DTS so the output starts at `0.000000` regardless
 * of where the clip sits on the session timeline.
 */
async function remuxFragmentedToFlat(
  input: Uint8Array,
  MP4Box: typeof import("mp4box")
): Promise<Uint8Array> {
  return new Promise<Uint8Array>((resolve, reject) => {
    const inFile = MP4Box.createFile();
    const outFile = MP4Box.createFile();
    outFile.init({ brands: ["isom", "mp42", "avc1", "iso2"] });

    const inToOutTrack = new Map<number, number>();
    const trackBaselineDts = new Map<number, number>();
    let settled = false;

    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      reject(err);
    };

    inFile.onError = (_module: string, message: string) => {
      fail(new Error(message));
    };

    inFile.onReady = (info) => {
      if (!info.tracks.length) {
        fail(new Error("no tracks in input"));
        return;
      }
      for (const track of info.tracks) {
        // setExtractionOptions delivers samples in batches via
        // onSamples; nbSamples controls batch size only, not total.
        inFile.setExtractionOptions(track.id, null, { nbSamples: 1000 });
      }
      inFile.start();
    };

    inFile.onSamples = (id, _user, samples) => {
      if (settled || samples.length === 0) return;

      let outId = inToOutTrack.get(id);
      let baseline = trackBaselineDts.get(id);
      if (outId === undefined) {
        // The sample carries the parsed SampleEntry (avc1 / mp4a / …)
        // including avcC / esds; addTrack reuses it verbatim so the
        // bitstream stays bit-identical.  The `description` union
        // includes SampleGroupEntry for sample-group descriptions,
        // but onSamples only ever hands us a SampleEntry here — the
        // cast skips a narrowing dance the types aren't expressive
        // enough to handle.
        const firstSample = samples[0];
        const sampleEntry =
          firstSample.description as import("mp4box").SampleEntry;
        const inputTrack = trackInfoById(inFile, id);
        outId = outFile.addTrack({
          type: sampleEntry.type as import("mp4box").SampleEntryFourCC,
          timescale: firstSample.timescale,
          width: inputTrack?.track_width,
          height: inputTrack?.track_height,
          language: inputTrack?.language,
          hdlr: inputTrack?.video
            ? "vide"
            : inputTrack?.audio
              ? "soun"
              : undefined,
          description: sampleEntry,
        });
        baseline = firstSample.dts;
        inToOutTrack.set(id, outId);
        trackBaselineDts.set(id, baseline);
      }
      const dtsShift = baseline as number;

      for (const sample of samples) {
        if (!sample.data) continue;
        outFile.addSample(outId, sample.data, {
          duration: sample.duration,
          dts: sample.dts - dtsShift,
          cts: sample.cts - dtsShift,
          is_sync: sample.is_sync,
        });
      }
    };

    let buf: import("mp4box").MP4BoxBuffer;
    try {
      buf = MP4Box.MP4BoxBuffer.fromArrayBuffer(
        input.buffer.slice(
          input.byteOffset,
          input.byteOffset + input.byteLength
        ),
        0
      );
    } catch (error) {
      fail(error as Error);
      return;
    }

    try {
      inFile.appendBuffer(buf);
      inFile.flush();
    } catch (error) {
      fail(error as Error);
      return;
    }

    if (settled) return;
    if (inToOutTrack.size === 0) {
      fail(new Error("no samples extracted from input"));
      return;
    }

    let output: Uint8Array;
    try {
      const stream = outFile.getBuffer();
      output = new Uint8Array(
        stream.buffer.slice(0, stream.byteLength) as ArrayBuffer
      );
    } catch (error) {
      fail(error as Error);
      return;
    }

    settled = true;
    resolve(output);
  });
}

function trackInfoById(
  file: import("mp4box").ISOFile,
  id: number
): import("mp4box").Track | undefined {
  const info = file.getInfo();
  return info.tracks.find((t) => t.id === id);
}

function concatUint8Arrays(parts: Uint8Array[]): Uint8Array {
  if (parts.length === 1) return parts[0];
  let total = 0;
  for (const p of parts) total += p.byteLength;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.byteLength;
  }
  return out;
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
