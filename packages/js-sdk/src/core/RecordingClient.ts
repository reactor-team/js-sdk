// Copyright (c) 2026 Reactor Technologies, Inc. All rights reserved.

/**
 * `RecordingClient` — per-Reactor handler for the recording feature.
 *
 * Stateful complement to the stateless primitives in
 * `utils/recording.ts`. Owns the FIFO promise correlator that turns
 * inbound `clipReady` / `clipFailed` runtime messages into resolved
 * promises, plus the lifecycle hooks (subscribe to Reactor's event
 * bus on construct, reject pending requests on disconnect).
 *
 * Created by `Reactor` in its constructor and lifetime-bound to it.
 * Reactor exposes thin delegations (`Reactor.requestClip`,
 * `Reactor.requestRecording`) so app code never touches the client
 * directly — but it's exported for advanced consumers and isolated
 * testing.
 */

import type { ReactorStatus } from "../types";
import {
  ClipFailedPayloadSchema,
  ClipReadyPayloadSchema,
  RecordingError,
  RuntimeRecordingMessageType,
  clipFromPayload,
  type Clip,
} from "../utils/recording";

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * How long to wait for a `clipReady` / `clipFailed` envelope before
 * giving up. Marker computation + URL build is sub-ms on the runtime;
 * 10 s leaves ample headroom for a bad data-channel state without
 * letting requests hang indefinitely.
 */
export const DEFAULT_CLIP_REQUEST_TIMEOUT_MS = 10_000;

/**
 * Slim adapter the {@link RecordingClient} requires from its host
 * Reactor. Keeps the recording subsystem decoupled from the full
 * Reactor surface — easy to test in isolation with a fake adapter,
 * and the only public API surface added to Reactor itself is the
 * three thin delegation methods.
 */
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
   * Coordinator base URL used to rewrite `playlist_url` when the
   * runtime hands back a URL bound to its own bind address (e.g.
   * `http://0.0.0.0:8080/clips?…`) in local mode. Returns
   * `undefined` in remote mode.
   */
  getLocalCoordinatorBaseUrl: () => string | undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// RecordingClient
// ─────────────────────────────────────────────────────────────────────────────

/** Internal — one entry per in-flight {@link RecordingClient.requestClip} / `.requestRecording`. */
type PendingClipRequest = {
  resolve: (clip: Clip) => void;
  reject: (error: RecordingError) => void;
  timeoutHandle?: ReturnType<typeof setTimeout>;
};

export class RecordingClient {
  // FIFO queue of pending recording requests. The runtime processes
  // `requestClip` / `requestRecording` messages in receipt order on
  // a single async dispatcher, so we correlate responses by FIFO
  // without extra request IDs on the wire. `clipFailed` carries no
  // discriminator, which forces FIFO matching anyway.
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

  // ─── Public API ────────────────────────────────────────────────────────

  /**
   * Asks the runtime to mint a clip covering the last `durationSeconds`
   * of the live session. See {@link Reactor.requestClip} for the
   * full contract — this is the implementation it delegates to.
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
   * Asks the runtime to mint a clip covering the entire session up
   * to "now". See {@link Reactor.requestRecording} for the full
   * contract.
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

  // ─── Internals ─────────────────────────────────────────────────────────

  /**
   * Shared core of {@link requestClip} / {@link requestRecording}:
   * registers a pending FIFO entry, sends the runtime message via
   * the host, and resolves when the next `clipReady` / `clipFailed`
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

      // Fire-and-forget — host.sendRuntimeCommand is async only
      // because of the FileRef extraction the underlying sendCommand
      // does for application messages, neither of which fires for
      // a runtime-scoped command.
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
   * Inbound runtime-message handler. Matches `clipReady` /
   * `clipFailed` to the next pending request FIFO; ignores every
   * other type so the runtime channel can grow new platform
   * messages without breaking existing SDK consumers.
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
          coordinatorBaseUrl: this.host.getLocalCoordinatorBaseUrl(),
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

  /**
   * Reject every in-flight request with a typed disconnect error.
   * Called from {@link destroy} and from the host's status-change
   * handler so consumers awaiting a clip don't hang forever when
   * the session goes away.
   */
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
