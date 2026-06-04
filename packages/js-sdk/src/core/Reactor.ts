import {
  type ReactorEvent,
  type ReactorStatus,
  type ReactorState,
  type ReactorError,
  type MessageScope,
  type ConnectOptions,
  type ConnectionStats,
  type ConnectionTimings,
  isAbortError,
} from "../types";
import { type JwtResolver, type JwtSource, normalizeJwtSource } from "./auth";
import { CoordinatorClient } from "./CoordinatorClient";
import { LocalCoordinatorClient } from "./LocalCoordinatorClient";
import { type TransportClient, type TransportStatus } from "./TransportClient";
import { WebRTCTransportClient } from "./WebRTCTransportClient";
import {
  type Capabilities,
  type SessionResponse,
  type TrackCapability,
  REACTOR_WEBRTC_VERSION,
} from "./types";
import { z } from "zod";

const LOCAL_COORDINATOR_URL = "http://localhost:8080";
export const DEFAULT_BASE_URL = "https://api.reactor.inc";

const TrackHintSchema = z.object({
  name: z.string(),
  kind: z.enum(["video", "audio"]),
  direction: z.enum(["recvonly", "sendonly"]),
});

const OptionsSchema = z.object({
  apiUrl: z.string().default(DEFAULT_BASE_URL),
  modelName: z.string(),
  local: z.boolean().default(false),
  modelTracks: z.array(TrackHintSchema).optional(),
});
export type Options = z.input<typeof OptionsSchema>;

export { FileRef } from "./FileRef";
import { FileRef } from "./FileRef";
import { RecordingClient } from "./RecordingClient";
import type { Clip, DownloadClipOptions } from "../utils/recording";

type EventHandler = (...args: any[]) => void;

export class Reactor {
  private coordinatorClient: CoordinatorClient | undefined;
  private transportClient: TransportClient | undefined;
  private status: ReactorStatus = "disconnected";
  private coordinatorUrl: string;
  private lastError?: ReactorError;
  private model: string;
  private sessionExpiration?: number;
  private local: boolean;
  private sessionId?: string;
  /**
   * True only when the active session was created by THIS connect flow
   * (via `createSession()`). False when the session was adopted via
   * `connect({ sessionId })`. We must never DELETE a session we did not
   * create — another client (or the backend that created it) owns its
   * lifecycle, so on disconnect/teardown/error an adopting client tears
   * down its own transport but leaves the session alive.
   */
  private createdSession = false;
  private connectStartTime?: number;
  private connectionTimings?: ConnectionTimings;

  private capabilities?: Capabilities;
  private tracks: TrackCapability[] = [];
  private presetTracks?: TrackCapability[];
  private autoResumeTracks = false;
  private sessionResponse?: SessionResponse;
  // Cached so clip surfaces (player, download button, hook) can
  // reach the same token source without re-threading `getJwt`.
  // Outlives `disconnect()` because captured clips can still be
  // downloaded after the session has ended.
  private jwtResolver?: JwtResolver;

  /** Per-Reactor recording client. See {@link RecordingClient}. */
  readonly recording: RecordingClient;

  constructor(options: Options) {
    const validatedOptions = OptionsSchema.parse(options);
    this.coordinatorUrl = validatedOptions.apiUrl;
    this.model = validatedOptions.modelName;
    this.local = validatedOptions.local;
    if (this.local && options.apiUrl === undefined) {
      this.coordinatorUrl = LOCAL_COORDINATOR_URL;
    }
    if (validatedOptions.modelTracks) {
      this.presetTracks = validatedOptions.modelTracks;
    }

    this.recording = new RecordingClient({
      onRuntimeMessage: (handler) => {
        this.on("runtimeMessage", handler);
        return () => this.off("runtimeMessage", handler);
      },
      onStatusChanged: (handler) => {
        this.on("statusChanged", handler);
        return () => this.off("statusChanged", handler);
      },
      sendRuntimeCommand: (command, data) =>
        this.sendCommand(command, data, "runtime"),
      getStatus: () => this.status,
      getCoordinatorBaseUrl: () => this.coordinatorUrl,
    });
  }

  private eventListeners: Map<ReactorEvent, Set<EventHandler>> = new Map();

  /**
   * Returns the JWT resolver supplied to the most recent
   * {@link connect} call, or `undefined` if none was set (pre-connect
   * or local mode). Used by clip surfaces as a fallback when their
   * own `getJwt` prop is omitted.
   */
  getJwtResolver(): JwtResolver | undefined {
    return this.jwtResolver;
  }

  on(event: ReactorEvent, handler: EventHandler) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(handler);
  }

  off(event: ReactorEvent, handler: EventHandler) {
    this.eventListeners.get(event)?.delete(handler);
  }

  emit(event: ReactorEvent, ...args: any[]) {
    this.eventListeners.get(event)?.forEach((handler) => handler(...args));
  }

  /**
   * Sends a command to the model via the data channel.
   *
   * When any value in `data` is a {@link FileRef}, it is automatically
   * extracted and serialized into a separate `uploads` section on the
   * wire, keyed by the parameter name.  Scalar values remain in `data`.
   */
  async sendCommand(
    command: string,
    data: any,
    scope: MessageScope = "application"
  ): Promise<void> {
    // Pre-flight failure: reported through `lastError` so unawaited
    // callers observe it without a `try/catch`.
    if (this.status !== "ready") {
      this.createError(
        "NOT_READY",
        `Cannot send command "${command}" while status is "${this.status}". Must be "ready".`,
        "api",
        true
      );
      return;
    }

    try {
      let uploads: Record<string, object> | undefined;

      if (data && typeof data === "object" && !Array.isArray(data)) {
        const scalarData: Record<string, unknown> = {};
        const extractedUploads: Record<string, object> = {};

        for (const [key, value] of Object.entries(data)) {
          if (value instanceof FileRef) {
            extractedUploads[key] = {
              upload_id: value.uploadId,
              name: value.name,
              mime_type: value.mimeType,
              size: value.size,
            };
          } else {
            scalarData[key] = value;
          }
        }

        if (Object.keys(extractedUploads).length > 0) {
          uploads = extractedUploads;
          data = scalarData;
        }
      }

      this.transportClient?.sendCommand(command, data, scope, uploads);
    } catch (error) {
      console.error("[Reactor] Failed to send message:", error);
      this.createError(
        "MESSAGE_SEND_FAILED",
        `Failed to send message: ${error}`,
        "gpu",
        true
      );
    }
  }

  /**
   * Uploads a file to the session's object store and returns a {@link FileRef}.
   *
   * Flow:
   *  1. POST /sessions/{id}/uploads → allocate presigned PUT URL
   *  2. PUT file bytes to the presigned URL
   *  3. Send `fileUploaded` notification on the runtime data channel
   *     (fires `@file_uploaded` on the model if registered)
   *  4. Return a `FileRef` to pass into {@link sendCommand}
   *
   * In local mode, the presigned URL returned by the runtime is rewritten
   * to use the SDK-configured base URL (scheme + host), so port-forwarded
   * setups work correctly (REA-1573).
   */
  async uploadFile(
    file: File | Blob,
    options?: { name?: string }
  ): Promise<FileRef> {
    if (this.status !== "ready") {
      throw new Error(
        `Cannot upload file, status is "${this.status}". Must be "ready".`
      );
    }
    if (!this.coordinatorClient || !this.sessionId) {
      throw new Error("No active session. Call connect() first.");
    }

    const name = options?.name ?? (file instanceof File ? file.name : "upload");
    const mimeType = file.type || "application/octet-stream";
    const size = file.size;

    if (size <= 0) {
      throw new Error("File is empty");
    }

    const slot = await this.coordinatorClient.createUpload(this.sessionId, {
      name,
      size,
      mime_type: mimeType,
    });

    let presignedUrl = slot.presigned_url;
    if (this.local) {
      const target = new URL(this.coordinatorUrl);
      const parsed = new URL(presignedUrl);
      parsed.protocol = target.protocol;
      parsed.hostname = target.hostname;
      parsed.port = target.port;
      presignedUrl = parsed.toString();
    }

    const putResponse = await fetch(presignedUrl, {
      method: "PUT",
      body: file,
      headers: {
        "Content-Length": String(size),
      },
    });
    if (!putResponse.ok) {
      throw new Error(
        `File upload failed: ${putResponse.status} ${putResponse.statusText}`
      );
    }

    await this.sendCommand(
      "fileUploaded",
      {
        upload_id: slot.presigned_id,
        name,
        mime_type: mimeType,
        size,
      },
      "runtime"
    );

    console.debug("[Reactor] File uploaded:", {
      uploadId: slot.presigned_id,
      name,
      mimeType,
      size,
    });

    return new FileRef(slot.presigned_id, name, mimeType, size);
  }

  /**
   * Request a clip covering the last `durationSeconds` of the live
   * session. Capped server-side at `recording.clip_max_seconds`
   * (default 5 minutes). Resolves with a {@link Clip} whose
   * `playlistUrl` can be handed to any HLS-capable player.
   *
   * @throws {RecordingError} on invalid input, transport failure,
   *   timeout, runtime-side `clipFailed`, or disconnect mid-request.
   */
  async requestClip(durationSeconds: number): Promise<Clip> {
    return this.recording.requestClip(durationSeconds);
  }

  /**
   * Request a clip covering the entire session up to "now". Same
   * mechanics as {@link requestClip} with `start = 0`; only the
   * resolved {@link Clip.kind} discriminator differs.
   */
  async requestRecording(): Promise<Clip> {
    return this.recording.requestRecording();
  }

  /**
   * Stream the chunks referenced by `clip.playlistUrl` and trigger a
   * native browser download of the assembled fragmented-MP4 Blob.
   * Pass `filename: null` to skip the download trigger and receive
   * the Blob (useful for non-DOM consumers and tests).
   */
  async downloadClipAsFile(
    clip: Clip,
    filename: string | null = "reactor-clip.mp4",
    options?: DownloadClipOptions
  ): Promise<Blob> {
    return this.recording.downloadClipAsFile(clip, filename, options);
  }

  /**
   * Publishes a MediaStreamTrack to a named sendonly track.
   * The transceiver is already set up from capabilities — this just
   * calls replaceTrack() on the sender.
   */
  async publishTrack(name: string, track: MediaStreamTrack): Promise<void> {
    if (process.env.NODE_ENV !== "development" && this.status !== "ready") {
      console.warn(
        `[Reactor] Cannot publish track "${name}", status is ${this.status}`
      );
      return;
    }

    try {
      await this.transportClient?.publishTrack(name, track);
    } catch (error) {
      console.error(`[Reactor] Failed to publish track "${name}":`, error);
      this.createError(
        "TRACK_PUBLISH_FAILED",
        `Failed to publish track "${name}": ${error}`,
        "gpu",
        true
      );
      throw error;
    }
  }

  async unpublishTrack(name: string): Promise<void> {
    try {
      await this.transportClient?.unpublishTrack(name);
    } catch (error) {
      console.error(`[Reactor] Failed to unpublish track "${name}":`, error);
      this.createError(
        "TRACK_UNPUBLISH_FAILED",
        `Failed to unpublish track "${name}": ${error}`,
        "gpu",
        true
      );
    }
  }

  pauseTrack(name: string): void {
    this.transportClient?.pauseTrack(name);
  }

  resumeTrack(name: string): void {
    this.transportClient?.resumeTrack(name);
  }

  /**
   * Reconnects to an existing session with a fresh transport.
   */
  async reconnect(options?: ConnectOptions): Promise<void> {
    if (!this.sessionId || !this.coordinatorClient) {
      console.warn("[Reactor] No active session to reconnect to.");
      return;
    }

    if (this.status === "ready") {
      console.warn("[Reactor] Already connected, no need to reconnect.");
      return;
    }

    if (this.tracks.length === 0) {
      console.warn("[Reactor] No tracks available for reconnect.");
      return;
    }

    this.setStatus("connecting");

    try {
      if (!this.transportClient) {
        this.transportClient = new WebRTCTransportClient({
          baseUrl: this.coordinatorUrl,
          sessionId: this.sessionId,
          jwtToken: this.local ? "local" : "",
          maxPollAttempts: options?.maxAttempts,
        });
        this.setupTransportHandlers();
      }

      await this.transportClient.prepare(this.tracks);
      await this.transportClient.connect(true);
    } catch (error) {
      if (isAbortError(error)) return;

      console.error("[Reactor] Failed to reconnect:", error);
      this.disconnect(true);
      this.createError(
        "RECONNECTION_FAILED",
        `Failed to reconnect: ${error}`,
        "api",
        true
      );
    }
  }

  /**
   * Connects to the coordinator, creates a session, then establishes
   * the transport using server-declared capabilities. `jwtToken` may
   * be a static string or a {@link JwtSource} resolver; pass a
   * resolver when the token is short-lived so each Coordinator HTTP
   * hop sees a fresh value.
   *
   * Pass `options.sessionId` to attach to a session that already exists
   * (e.g. one created by a backend) instead of creating a new one — session
   * creation is skipped and the transport is brought up against that id. The
   * `jwtToken` must be valid for the account that owns the session. Works in
   * local mode too (it looks the session up by id rather than starting one).
   */
  async connect(jwtToken?: JwtSource, options?: ConnectOptions): Promise<void> {
    console.debug("[Reactor] Connecting, status:", this.status);

    if (jwtToken == undefined && !this.local) {
      throw new Error("No authentication provided and not in local mode");
    }

    if (this.status !== "disconnected") {
      throw new Error("Already connected or connecting");
    }
    this.setStatus("connecting");

    this.connectStartTime = performance.now();

    // Cache the resolver so clip surfaces can reuse it via
    // `getJwtResolver()`. Local mode is auth-free, leave it unset.
    if (!this.local && jwtToken !== undefined) {
      this.jwtResolver = normalizeJwtSource(jwtToken);
    }

    try {
      this.coordinatorClient = this.local
        ? new LocalCoordinatorClient(this.coordinatorUrl, this.model)
        : new CoordinatorClient({
            baseUrl: this.coordinatorUrl,
            jwtToken: jwtToken!,
            model: this.model,
          });

      // 1. Resolve the session — either attach to a caller-supplied session
      //    (created elsewhere, e.g. by a backend) or create a fresh one. In
      //    the attach path there's no POST /sessions, so `sessionCreationMs`
      //    stays 0.
      let sessionCreationMs = 0;
      let sessionId: string;
      if (options?.sessionId) {
        await this.coordinatorClient.adoptSession(options.sessionId);
        sessionId = options.sessionId;
        // Adopted, not created — we don't own this session's lifecycle.
        this.createdSession = false;
        console.debug("[Reactor] Attaching to existing session:", sessionId);
      } else {
        const tSession = performance.now();
        const initialResponse = await this.coordinatorClient.createSession();
        sessionCreationMs = performance.now() - tSession;
        sessionId = initialResponse.session_id;
        // We created it, so we own teardown (DELETE) of this session.
        this.createdSession = true;
        console.debug(
          "[Reactor] Session created:",
          sessionId,
          "state:",
          initialResponse.state
        );
      }

      this.setSessionId(sessionId);

      this.setStatus("waiting");

      this.transportClient = new WebRTCTransportClient({
        baseUrl: this.coordinatorUrl,
        sessionId,
        jwtToken: this.local ? "local" : jwtToken!,
        webrtcVersion: REACTOR_WEBRTC_VERSION,
        maxPollAttempts: options?.maxAttempts,
      });
      this.setupTransportHandlers();

      let sessionPollingMs: number;
      let transportConnectingMs: number;

      this.autoResumeTracks = options?.autoResumeTracks ?? false;

      if (this.presetTracks) {
        // 2a. Parallel path: tracks are known at build time, so we can
        //     prepare the transport while waiting for the Runtime.
        this.tracks = this.presetTracks;

        const tParallel = performance.now();
        const [sessionResponse] = await Promise.all([
          this.coordinatorClient.pollSessionReady(),
          this.transportClient.prepare(this.tracks),
        ]);
        sessionPollingMs = performance.now() - tParallel;

        this.sessionResponse = sessionResponse;
        this.capabilities = { ...sessionResponse.capabilities!, tracks: this.tracks };
        this.emit("capabilitiesReceived", this.capabilities);

        const tConnect = performance.now();
        await this.transportClient.connect();
        transportConnectingMs = performance.now() - tConnect;
      } else {
        // 2b. Sequential path: tracks come from the poll response, but
        //     we can still warm up the transport (ICE fetch) in parallel.
        this.transportClient.warmup();

        const tPoll = performance.now();
        const sessionResponse = await this.coordinatorClient.pollSessionReady();
        sessionPollingMs = performance.now() - tPoll;

        this.sessionResponse = sessionResponse;
        this.tracks = sessionResponse.capabilities!.tracks;
        this.capabilities = { ...sessionResponse.capabilities!, tracks: this.tracks };
        this.emit("capabilitiesReceived", this.capabilities);

        const protocol = sessionResponse.selected_transport!.protocol;
        if (protocol !== "webrtc") {
          throw new Error(`Unsupported transport protocol: ${protocol}`);
        }

        const tTransport = performance.now();
        await this.transportClient.prepare(this.tracks);
        await this.transportClient.connect();
        transportConnectingMs = performance.now() - tTransport;
      }

      console.debug("[Reactor] Session ready, tracks:", this.tracks.length);

      this.connectionTimings = {
        sessionCreationMs: sessionCreationMs + sessionPollingMs,
        transportConnectingMs,
        totalMs: 0,
      };
    } catch (error) {
      if (isAbortError(error)) return;

      console.error("[Reactor] Connection failed:", error);
      this.createError(
        "CONNECTION_FAILED",
        `Connection failed: ${error}`,
        "api",
        true
      );
      try {
        await this.disconnect(false);
      } catch (disconnectError) {
        console.error(
          "[Reactor] Failed to clean up after connection failure:",
          disconnectError
        );
      }
      throw error;
    }
  }

  /**
   * Sets up event handlers for the transport client.
   * Each handler captures the client reference to ignore stale events.
   */
  private setupTransportHandlers(): void {
    if (!this.transportClient) return;
    const client = this.transportClient;

    client.on("message", (message: any, scope: MessageScope) => {
      if (this.transportClient !== client) return;
      if (scope === "application") {
        this.emit("message", message);
      } else if (scope === "runtime") {
        // Just emit — `RecordingClient` and any app-level
        // `runtimeMessage` listeners are subscribers via `on()`.
        // Content moderation events arrive as `{ type: "moderation",
        // data: ModerationEvent }`; apps filter on `type` rather than
        // subscribing to a dedicated SDK event.
        this.emit("runtimeMessage", message);
      }
    });

    client.on("statusChanged", (status: TransportStatus) => {
      if (this.transportClient !== client) return;
      switch (status) {
        case "connected":
          this.finalizeConnectionTimings();

          if (this.autoResumeTracks) {
            for (const track of this.tracks) {``
              if (track.direction === "recvonly") {
                this.resumeTrack(track.name);
              }
            }
          }

          this.setStatus("ready");
          break;
        case "disconnected":
          this.disconnect(true);
          break;
        case "error":
          this.createError(
            "GPU_CONNECTION_ERROR",
            "Transport connection failed",
            "gpu",
            true
          );
          this.disconnect();
          break;
      }
    });

    client.on(
      "trackReceived",
      (name: string, track: MediaStreamTrack, stream: MediaStream) => {
        console.log("[Reactor] trackReceived", name, track, stream);
        if (this.transportClient !== client) return;
        this.emit("trackReceived", name, track, stream);

        if (this.autoResumeTracks) {
          for (const track of this.tracks) {
            if (track.direction === "recvonly") {
              this.resumeTrack(track.name);
            }
          }
        }
      }
    );

    client.on("statsUpdate", (stats: ConnectionStats) => {
      if (this.transportClient !== client) return;
      this.emit("statsUpdate", {
        ...stats,
        connectionTimings: this.connectionTimings,
      });
    });
  }

  /**
   * Disconnects from both the transport and the coordinator.
   */
  async disconnect(recoverable: boolean = false) {
    if (this.status === "disconnected" && !this.sessionId) {
      console.warn("[Reactor] Already disconnected");
      return;
    }

    this.coordinatorClient?.abort();
    this.transportClient?.abort();

    if (this.coordinatorClient && !recoverable) {
      // Only the session's creator may DELETE it. A client that adopted an
      // existing session (connect({ sessionId })) tears down its own
      // transport but must leave the session running for its real owner —
      // this guard applies to every non-recoverable path (explicit
      // disconnect, transport error, connect-failure cleanup, unmount).
      if (this.createdSession) {
        try {
          await this.coordinatorClient.terminateSession();
        } catch (error) {
          console.error("[Reactor] Error terminating session:", error);
        }
      } else {
        console.debug(
          "[Reactor] Adopted session (not the creator) — skipping DELETE, leaving it alive"
        );
      }
      this.coordinatorClient = undefined;
    }

    if (this.transportClient) {
      try {
        await this.transportClient.disconnect();
      } catch (error) {
        console.error("[Reactor] Error disconnecting transport:", error);
      }
      if (!recoverable) {
        this.transportClient = undefined;
      }
    }

    this.setStatus("disconnected");
    this.resetConnectionTimings();
    if (!recoverable) {
      this.setSessionExpiration(undefined);
      this.setSessionId(undefined);
      this.capabilities = undefined;
      this.tracks = [];
      this.sessionResponse = undefined;
      this.createdSession = false;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Getters
  // ─────────────────────────────────────────────────────────────────────────

  getSessionId(): string | undefined {
    return this.sessionId;
  }

  getStatus(): ReactorStatus {
    return this.status;
  }

  getState(): ReactorState {
    return {
      status: this.status,
      lastError: this.lastError,
    };
  }

  getLastError(): ReactorError | undefined {
    return this.lastError;
  }

  getCapabilities(): Capabilities | undefined {
    return this.capabilities;
  }

  getSessionInfo(): SessionResponse | undefined {
    return this.sessionResponse;
  }

  getStats(): ConnectionStats | undefined {
    const stats = this.transportClient?.getStats();
    if (!stats) return undefined;
    return { ...stats, connectionTimings: this.connectionTimings };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private State Management
  // ─────────────────────────────────────────────────────────────────────────

  private setSessionId(newSessionId: string | undefined) {
    console.debug(
      "[Reactor] Setting session ID:",
      newSessionId,
      "from",
      this.sessionId
    );
    if (this.sessionId !== newSessionId) {
      this.sessionId = newSessionId;
      this.emit("sessionIdChanged", newSessionId);
    }
  }

  private setStatus(newStatus: ReactorStatus) {
    console.debug("[Reactor] Setting status:", newStatus, "from", this.status);
    if (this.status !== newStatus) {
      this.status = newStatus;
      this.emit("statusChanged", newStatus);
    }
  }

  private setSessionExpiration(newSessionExpiration: number | undefined) {
    console.debug(
      "[Reactor] Setting session expiration:",
      newSessionExpiration
    );
    if (this.sessionExpiration !== newSessionExpiration) {
      this.sessionExpiration = newSessionExpiration;
      this.emit("sessionExpirationChanged", newSessionExpiration);
    }
  }

  private resetConnectionTimings(): void {
    this.connectStartTime = undefined;
    this.connectionTimings = undefined;
  }

  private finalizeConnectionTimings(): void {
    if (!this.connectionTimings || this.connectStartTime == null) return;

    this.connectionTimings.totalMs = performance.now() - this.connectStartTime;
    this.connectStartTime = undefined;

    console.debug("[Reactor] Connection timings:", this.connectionTimings);
  }

  private createError(
    code: string,
    message: string,
    component: "api" | "gpu",
    recoverable: boolean,
    retryAfter?: number
  ) {
    this.lastError = {
      code,
      message,
      timestamp: Date.now(),
      recoverable,
      component,
      retryAfter,
    };
    this.emit("error", this.lastError);
  }
}
