// Copyright (c) 2026 Reactor Technologies, Inc. All rights reserved.

/**
 * Per-Reactor recording client.  Owns the FIFO promise correlator for
 * inbound `clipReady` / `clipFailed` runtime messages and the
 * lifecycle hooks (subscribe on construct, reject pending requests
 * on disconnect).  Reactor exposes thin delegations for the common
 * case; this class is exported for advanced consumers and isolated
 * testing.
 */

import type { ReactorStatus } from "../types";
import {
  ClipFailedPayloadSchema,
  ClipReadyPayloadSchema,
  RecordingError,
  RuntimeRecordingMessageType,
  clipFromPayload,
  createPlayableManifestUrl,
  downloadClipAsFile as downloadClipAsFileFn,
  fetchPlaylist as fetchPlaylistFn,
  type Clip,
  type DownloadClipOptions,
  type FetchPlaylistOptions,
} from "../utils/recording";

/** Default per-request timeout for `clipReady` / `clipFailed`. */
export const DEFAULT_CLIP_REQUEST_TIMEOUT_MS = 10_000;

/** Slim adapter the {@link RecordingClient} requires from its host. */
export interface RecordingClientHost {
  /**
   * Subscribe to runtime-scoped messages on the data channel.
   * Returns an unsubscribe function. Mirrors the
   * `reactor.on("runtimeMessage", …)` pattern.
   */
  onRuntimeMessage: (handler: (message: unknown) => void) => () => void;
  /**
   * Subscribe to status changes (so the client can reject pending
   * requests on disconnect). Returns an unsubscribe function.
   */
  onStatusChanged: (handler: (status: ReactorStatus) => void) => () => void;
  /**
   * Send a runtime-scoped command on the data channel. The
   * `RecordingClient` uses this to fire `requestClip` /
   * `requestRecording`.
   */
  sendRuntimeCommand: (
    command: string,
    data: Record<string, unknown>
  ) => Promise<void>;
  /** Current connection status — guards `requestClip` before it goes on the wire. */
  getStatus: () => ReactorStatus;
  /**
   * Coordinator base URL used to resolve `clip.playlistUrl` against.
   *
   * The runtime now emits a path-only ``playlist_url`` (e.g.
   * ``/clips?session_id=…``) so the SDK is the absolute-origin owner
   * for both local-dev (HttpRuntime on the SDK's ``apiUrl``) and
   * production (Coordinator on the SDK's ``apiUrl``).  We always
   * resolve against the ``Reactor``'s coordinator URL — there is no
   * remote-vs-local divergence on the read path.
   *
   * For backwards-compat with older runtimes that emitted absolute
   * URLs (scheme + host bound to the runtime's own listener,
   * e.g. ``http://0.0.0.0:8080/clips?…``), the same URL is also used
   * to rewrite the host onto the coordinator — see
   * ``rewriteUrlHost`` in ``utils/recording.ts``.
   */
  getCoordinatorBaseUrl: () => string | undefined;
}

/** Internal — one entry per in-flight `requestClip` / `requestRecording`. */
type PendingClipRequest = {
  resolve: (clip: Clip) => void;
  reject: (error: RecordingError) => void;
  timeoutHandle?: ReturnType<typeof setTimeout>;
};

export class RecordingClient {
  // FIFO queue: the runtime processes requests in receipt order and
  // `clipFailed` carries no discriminator, so FIFO matching is the
  // simplest correct correlator.
  private pendingClipRequests: PendingClipRequest[] = [];

  /** Timeout applied per request; configurable for tests. */
  private readonly requestTimeoutMs: number;

  /** Cleanup handles for the host event subscriptions. */
  private readonly unsubscribers: Array<() => void> = [];

  constructor(
    private readonly host: RecordingClientHost,
    options: { requestTimeoutMs?: number } = {}
  ) {
    this.requestTimeoutMs =
      options.requestTimeoutMs ?? DEFAULT_CLIP_REQUEST_TIMEOUT_MS;

    this.unsubscribers.push(
      this.host.onRuntimeMessage((message) => this.onRuntimeMessage(message))
    );
    this.unsubscribers.push(
      this.host.onStatusChanged((status) => this.onStatusChanged(status))
    );
  }

  /**
   * Request a clip covering the last `durationSeconds` of the live
   * session.  See {@link Reactor.requestClip}.
   */
  async requestClip(durationSeconds: number): Promise<Clip> {
    if (
      typeof durationSeconds !== "number" ||
      !Number.isFinite(durationSeconds) ||
      durationSeconds <= 0
    ) {
      throw new RecordingError(
        "INVALID_DURATION",
        "durationSeconds must be a positive finite number"
      );
    }
    const status = this.host.getStatus();
    if (status !== "ready") {
      throw new RecordingError(
        "DISCONNECTED",
        `Cannot request clip while status is "${status}"`
      );
    }
    return this.dispatchClipRequest(RuntimeRecordingMessageType.REQUEST_CLIP, {
      duration_seconds: durationSeconds,
    });
  }

  /**
   * Request a clip covering the entire session up to "now".  See
   * {@link Reactor.requestRecording}.
   */
  async requestRecording(): Promise<Clip> {
    const status = this.host.getStatus();
    if (status !== "ready") {
      throw new RecordingError(
        "DISCONNECTED",
        `Cannot request recording while status is "${status}"`
      );
    }
    return this.dispatchClipRequest(
      RuntimeRecordingMessageType.REQUEST_RECORDING,
      {}
    );
  }

  /**
   * Poll `/clips` and return the raw manifest body.  Same polling
   * semantics as the bare {@link fetchPlaylist} helper; the caller is
   * responsible for supplying the Coordinator JWT via `options.jwt`
   * (origin-scoped to `clip.playlistUrl`).  In local mode against the
   * HttpRuntime, `options.jwt` should be omitted.
   */
  async fetchPlaylist(
    clip: Clip,
    options: FetchPlaylistOptions = {}
  ): Promise<string> {
    return fetchPlaylistFn(clip.playlistUrl, {
      predictedReadyAtMs: clip.predictedReadyAtMs,
      ...options,
    });
  }

  /**
   * Fetch the manifest and return a `blob:` URL suitable for
   * `<video src>` / `hls.js`.  The player reads the manifest from
   * browser memory; chunk URLs inside are presigned S3 GETs.
   *
   * Caller owns the returned URL — revoke it via `URL.revokeObjectURL`
   * when playback tears down.  Pass `options.jwt` for production
   * `/clips` (the Coordinator hop) — see {@link FetchPlaylistOptions}.
   */
  async getPlayableManifestUrl(
    clip: Clip,
    options: FetchPlaylistOptions = {}
  ): Promise<string> {
    const body = await this.fetchPlaylist(clip, options);
    // clip.playlistUrl is the absolute base needed to resolve any
    // path-only chunk URLs in the manifest body (local HttpRuntime
    // emits relative chunks; production S3 presigned URLs are
    // already absolute and pass through untouched).
    return createPlayableManifestUrl(body, clip.playlistUrl);
  }

  /**
   * Thin delegation to {@link downloadClipAsFile}.  Caller must pass
   * `options.jwt` in production — see {@link DownloadClipOptions}.
   */
  async downloadClipAsFile(
    clip: Clip,
    filename: string | null = "reactor-clip.mp4",
    options?: DownloadClipOptions
  ): Promise<Blob> {
    return downloadClipAsFileFn(clip, filename, options);
  }

  /**
   * Drop every pending request and unsubscribe from host events.
   * Safe to call multiple times; further `requestClip` /
   * `requestRecording` calls after `destroy()` will hang waiting for
   * a response that will never arrive — host should not call into
   * the client after destroy.
   */
  destroy(): void {
    this.rejectPending("RecordingClient destroyed");
    while (this.unsubscribers.length > 0) {
      const off = this.unsubscribers.pop();
      try {
        off?.();
      } catch {
        // Best-effort cleanup — ignore handler removal errors.
      }
    }
  }

  /**
   * Register a pending FIFO entry, send the runtime message via
   * the host, and resolve when the next `clipReady` / `clipFailed`
   * arrives.
   */
  private dispatchClipRequest(
    messageType:
      | typeof RuntimeRecordingMessageType.REQUEST_CLIP
      | typeof RuntimeRecordingMessageType.REQUEST_RECORDING,
    payload: Record<string, unknown>
  ): Promise<Clip> {
    return new Promise<Clip>((resolve, reject) => {
      const pending: PendingClipRequest = { resolve, reject };
      pending.timeoutHandle = setTimeout(() => {
        const idx = this.pendingClipRequests.indexOf(pending);
        if (idx === -1) return;
        this.pendingClipRequests.splice(idx, 1);
        reject(
          new RecordingError(
            "REQUEST_TIMEOUT",
            `No clipReady/clipFailed within ${this.requestTimeoutMs}ms`
          )
        );
      }, this.requestTimeoutMs);

      this.pendingClipRequests.push(pending);

      try {
        void this.host.sendRuntimeCommand(messageType, payload);
      } catch (error) {
        const idx = this.pendingClipRequests.indexOf(pending);
        if (idx !== -1) this.pendingClipRequests.splice(idx, 1);
        if (pending.timeoutHandle) clearTimeout(pending.timeoutHandle);
        reject(
          new RecordingError(
            "INTERNAL_ERROR",
            `Failed to send ${messageType}: ${(error as Error).message}`
          )
        );
      }
    });
  }

  /**
   * Match inbound `clipReady` / `clipFailed` to the next pending
   * request FIFO; ignore every other runtime message type.
   */
  private onRuntimeMessage(message: unknown): void {
    if (!message || typeof message !== "object") return;
    const msg = message as { type?: unknown; data?: unknown };
    const type = msg.type;
    if (
      type !== RuntimeRecordingMessageType.CLIP_READY &&
      type !== RuntimeRecordingMessageType.CLIP_FAILED
    ) {
      return;
    }
    const pending = this.pendingClipRequests.shift();
    if (!pending) {
      console.warn("[Reactor] Received", type, "with no pending request");
      return;
    }
    if (pending.timeoutHandle) clearTimeout(pending.timeoutHandle);

    if (type === RuntimeRecordingMessageType.CLIP_READY) {
      const parsed = ClipReadyPayloadSchema.safeParse(msg.data);
      if (!parsed.success) {
        pending.reject(
          new RecordingError(
            "INTERNAL_ERROR",
            `Malformed clipReady payload: ${parsed.error.message}`
          )
        );
        return;
      }
      pending.resolve(
        clipFromPayload(parsed.data, {
          coordinatorBaseUrl: this.host.getCoordinatorBaseUrl(),
        })
      );
      return;
    }

    const parsedFail = ClipFailedPayloadSchema.safeParse(msg.data ?? {});
    const reason = parsedFail.success ? parsedFail.data.reason : "unknown";
    pending.reject(
      new RecordingError(
        reason === "recorder disabled" ||
          reason === "recorder disabled or encoder crashed"
          ? "RECORDER_DISABLED"
          : "INTERNAL_ERROR",
        reason
      )
    );
  }

  private onStatusChanged(status: ReactorStatus): void {
    if (status === "disconnected") {
      this.rejectPending("Reactor disconnected");
    }
  }

  /** Reject every in-flight request with a typed disconnect error. */
  private rejectPending(reason: string): void {
    if (this.pendingClipRequests.length === 0) return;
    const pending = this.pendingClipRequests;
    this.pendingClipRequests = [];
    for (const entry of pending) {
      if (entry.timeoutHandle) clearTimeout(entry.timeoutHandle);
      entry.reject(new RecordingError("DISCONNECTED", reason));
    }
  }
}
