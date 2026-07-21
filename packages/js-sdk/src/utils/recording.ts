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
 *   fMP4 chunks, remuxes them into a flat social-media-ready MP4
 *   via `mp4box` (PTS=0, faststart, `major_brand=isom`), and
 *   returns a Blob for browser download.
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
 *   Ns" indicator. It is only an estimate: the SDK polls `/clips`
 *   until the manifest is actually ready and does not give up when
 *   this epoch passes (see {@link fetchPlaylist} for the polling and
 *   cancellation model).
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

// ─────────────────────────────────────────────────────────────────────────────
// HLS playlist fetching + parsing
// ─────────────────────────────────────────────────────────────────────────────

/** Internal — segments referenced by an HLS manifest, in playback order. */
interface ParsedPlaylist {
  initUrl: string;
  segmentUrls: string[];
}

/**
 * Suggested grace period for callers that opt into a *bounded* wait by
 * passing it as {@link FetchPlaylistOptions.slackMs}.  It is **not** a
 * default: {@link fetchPlaylist} polls indefinitely unless a bound is
 * supplied.  Provided so callers who do want the old ~15 s ceiling can
 * ask for it by name rather than hard-coding a magic number.
 */
export const DEFAULT_PLAYLIST_POLL_SLACK_MS = 15_000;

export interface FetchPlaylistOptions {
  /**
   * Unix epoch (ms) when the runtime predicts the boundary chunk will
   * be servable. Pass `clip.predictedReadyAtMs` here. On its own it
   * does *not* stop polling — it only anchors the optional `slackMs`
   * deadline. Use it to drive a "ready in Ns" indicator.
   */
  predictedReadyAtMs?: number;
  /**
   * Opt-in grace period that turns polling into a *bounded* wait. When
   * set to a finite value, a stuck `202` produces `CLIP_NOT_READY` once
   * `max(predictedReadyAtMs, pollStart) + slackMs` passes. Omit (the
   * default) to poll indefinitely until the manifest is ready or the
   * caller aborts via `signal`. See {@link DEFAULT_PLAYLIST_POLL_SLACK_MS}
   * for a sensible value if you want the old ~15 s ceiling.
   */
  slackMs?: number;
  /**
   * Hard cap on the per-poll wait. The server's `Retry-After` header is
   * honored but clamped. Default 2000 ms keeps pending UI snappy.
   */
  maxRetryDelayMs?: number;
  /** Floor on the per-poll wait so we don't hot-loop on cheap networks. Default 200 ms. */
  minRetryDelayMs?: number;
  /**
   * Opt-in cap on the number of `202` responses tolerated before
   * `CLIP_NOT_READY`. Omit (the default) to poll indefinitely; set it
   * for a simple attempt-count ceiling when you don't have a
   * `predictedReadyAtMs` to anchor a `slackMs` deadline.
   */
  maxRetries?: number;
  /**
   * Aborts in-flight fetches and the inter-poll sleep. Because polling
   * is unbounded by default, this is the primary way a caller ends a
   * wait that is taking too long (a timeout, a user "cancel", a React
   * unmount).
   */
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
 * Polling is **unbounded by default** — it keeps retrying on `202`
 * until the manifest is ready or the caller aborts via `signal`. This
 * matches the reality that a clip's boundary chunk can take arbitrarily
 * long to land (a paused model closes no chunks; a long recording's
 * final chunk is large). Callers own the give-up policy: pass `signal`
 * to cancel, or opt into a ceiling with `slackMs` / `maxRetries`.
 *
 * - `200` → returns the manifest body.
 * - `410` / `404` → throws `CLIP_GONE`.
 * - `5xx`/other → throws `PLAYLIST_FETCH_FAILED` (no retry).
 * - `202` past an opt-in `slackMs` deadline or `maxRetries` cap →
 *   throws `CLIP_NOT_READY`.
 * - aborted `signal` → rejects with the fetch/`sleep` `AbortError`.
 */
export async function fetchPlaylist(
  playlistUrl: string,
  options: FetchPlaylistOptions = {}
): Promise<string> {
  const minDelay = Math.max(0, options.minRetryDelayMs ?? 200);
  const maxDelay = Math.max(minDelay, options.maxRetryDelayMs ?? 2_000);

  // Polling is unbounded by default: on `202` we keep polling until the
  // manifest is ready (`200`), a terminal status arrives (`410`/`404`/
  // other), or the caller aborts via `signal`. The clip's boundary
  // chunk may take arbitrarily long to land (a paused model closes no
  // chunks, a long recording's final chunk is large), so a fixed
  // give-up window would fail clips that were only slow. Two bounds are
  // opt-in for callers who want a ceiling: a wall-clock deadline
  // (`slackMs`, anchored at `predictedReadyAtMs`) and a poll count
  // (`maxRetries`). Neither is applied unless the caller sets it.
  const hasDeadline =
    typeof options.slackMs === "number" && Number.isFinite(options.slackMs);
  // Deadline anchors at max(predictedReadyAtMs, now) so a late click
  // (polling started well after the predicted-ready epoch) still gets
  // the full grace window rather than a deadline already in the past.
  const startedPollingAt = Date.now();
  const deadlineMs = hasDeadline
    ? Math.max(
        options.predictedReadyAtMs ?? startedPollingAt,
        startedPollingAt
      ) + (options.slackMs as number)
    : undefined;
  const maxRetries =
    typeof options.maxRetries === "number" ? options.maxRetries : undefined;

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
      // Give up only against a caller-supplied bound; otherwise poll on.
      if (deadlineMs !== undefined && Date.now() >= deadlineMs) {
        throw new RecordingError(
          "CLIP_NOT_READY",
          `Boundary chunk still pending after ${options.slackMs}ms grace (predicted ready ${new Date(
            options.predictedReadyAtMs ?? startedPollingAt
          ).toISOString()}). Runtime may have crashed mid-clip.`
        );
      }
      if (maxRetries !== undefined && attempt >= maxRetries) {
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
      // Don't sleep past a deadline (if any); clamp so the next loop
      // observes it promptly.
      const clampedDelay =
        deadlineMs !== undefined
          ? Math.min(delay, Math.max(0, deadlineMs - Date.now()))
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
}

/**
 * Stream the chunks referenced by `clip.playlistUrl`, remux the
 * assembled bytes into a flat social-media-ready MP4, and (when
 * `filename` is non-null) trigger a browser-native `<a download>`.
 * Pass `filename: null` to skip the download trigger and just
 * receive the Blob.
 *
 * The remux step rewrites the container only — H.264 NAL units and
 * AAC packets pass through unchanged — so `start_time=0`,
 * `+faststart`, and `major_brand=isom` come for free without any
 * re-encode cost.  See {@link maybeRemux} for the fallback
 * semantics on the rare parse failure.
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

  const finalBytes = await maybeRemux(parts);
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
 * Concatenate `parts` and pipe the result through
 * {@link remuxFragmentedToFlat}.  Remux failures (`mp4box` import
 * blocked by exotic bundler / CSP, corrupt input, unsupported
 * codec, internal assertion) are funneled through a single path:
 * a `console.warn` and a return of the unmodified concatenation,
 * so the download still succeeds end-to-end with the (worse, but
 * still playable) fragmented MP4 the runtime emitted.
 */
async function maybeRemux(parts: Uint8Array[]): Promise<Uint8Array> {
  const input = concatUint8Arrays(parts);
  try {
    const MP4Box = await loadMp4Box();
    return await remuxFragmentedToFlat(input, MP4Box);
  } catch (error) {
    console.warn(
      "[Reactor] Clip remux failed, returning fragmented MP4 instead.",
      error
    );
    return input;
  }
}

/**
 * Indirection so tests can stub the dynamic `mp4box` import without
 * pulling the real bytes through every test that calls
 * `downloadClipAsFile`.
 *
 * @internal
 */
export const __remuxInternals = {
  loadMp4Box: (): Promise<typeof import("mp4box")> => import("mp4box"),
};

function loadMp4Box(): Promise<typeof import("mp4box")> {
  return __remuxInternals.loadMp4Box();
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
        // The sample carries the parsed input SampleEntry (avc1 /
        // mp4a / …) whose child boxes are the actual codec config
        // (avcC, esds, …).  `addTrack` creates a fresh empty
        // SampleEntry of the requested `type`, so we have to pass
        // the input's child boxes via `description_boxes`: they
        // become direct children of the new SampleEntry, where
        // decoders expect them.  Passing the whole input
        // SampleEntry as `description` instead would nest it
        // (`stsd > avc1 > avc1 > avcC`) and decoders would fail to
        // find avcC and render black.
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
          // `boxes` is typed as `Box[]` but `description_boxes`
          // wants the narrower `BoxKind[]` union — at runtime they
          // are the same concrete instances, just typed loosely.
          description_boxes:
            sampleEntry.boxes as unknown as import("mp4box").IsoFileOptions["description_boxes"],
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
