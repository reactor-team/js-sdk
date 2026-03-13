import {
  type ReactorEvent,
  type ReactorStatus,
  type ReactorState,
  type ReactorError,
  type MessageScope,
  type ConnectOptions,
  type TrackConfig,
  type ConnectionStats,
  type ConnectionTimings,
  isAbortError,
  ConflictError,
} from "../types";
import { CoordinatorClient } from "./CoordinatorClient";
import { LocalCoordinatorClient } from "./LocalCoordinatorClient";
import { GPUMachineClient, GPUMachineStatus } from "./GPUMachineClient";
import { z } from "zod";

const LOCAL_COORDINATOR_URL = "http://localhost:8080";
export const DEFAULT_BASE_URL = "https://api.reactor.inc";

const TrackConfigSchema = z.object({
  name: z.string(),
  kind: z.enum(["audio", "video"]),
});

const OptionsSchema = z.object({
  apiUrl: z.string().default(DEFAULT_BASE_URL),
  modelName: z.string(),
  local: z.boolean().default(false),
  /**
   * Tracks the client **RECEIVES** from the model (model → client).
   * Each entry produces a `recvonly` transceiver.
   * Names must be unique across both `receive` and `send`.
   *
   * When omitted, defaults to a single video track named `"main_video"`.
   * Pass an explicit empty array to opt out of the default.
   */
  receive: z
    .array(TrackConfigSchema)
    .default([{ name: "main_video", kind: "video" }]),
  /**
   * Tracks the client **SENDS** to the model (client → model).
   * Each entry produces a `sendonly` transceiver.
   * Names must be unique across both `receive` and `send`.
   */
  send: z.array(TrackConfigSchema).default([]),
});
export type Options = z.input<typeof OptionsSchema>;

type EventHandler = (...args: any[]) => void;

export class Reactor {
  private coordinatorClient: CoordinatorClient | undefined;
  private machineClient: GPUMachineClient | undefined;
  private status: ReactorStatus = "disconnected";
  private coordinatorUrl: string;
  private lastError?: ReactorError;
  private model: string;
  private sessionExpiration?: number;
  private local: boolean;
  /** Tracks the client RECEIVES from the model (model → client). */
  private receive: TrackConfig[];
  /** Tracks the client SENDS to the model (client → model). */
  private send: TrackConfig[];
  private sessionId?: string;
  private connectStartTime?: number;
  private connectionTimings?: ConnectionTimings;

  constructor(options: Options) {
    const validatedOptions = OptionsSchema.parse(options);
    this.coordinatorUrl = validatedOptions.apiUrl;

    // TODO(REA-146) Properly accept version from parameter.
    this.model = validatedOptions.modelName;
    this.local = validatedOptions.local;
    this.receive = validatedOptions.receive;
    this.send = validatedOptions.send;
    if (this.local && options.apiUrl === undefined) {
      this.coordinatorUrl = LOCAL_COORDINATOR_URL;
    }
  }

  // Generic event map
  private eventListeners: Map<ReactorEvent, Set<EventHandler>> = new Map();

  // Event Emitter API
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
   * @param command The command name.
   * @param data The command payload.
   * @param scope "application" (default) for model commands, "runtime" for platform messages.
   */
  async sendCommand(
    command: string,
    data: any,
    scope: MessageScope = "application"
  ): Promise<void> {
    // Synchronous validation - throw immediately
    if (process.env.NODE_ENV !== "development" && this.status !== "ready") {
      const errorMessage = `Cannot send message, status is ${this.status}`;
      console.warn("[Reactor]", errorMessage);
      return;
    }

    try {
      this.machineClient?.sendCommand(command, data, scope);
    } catch (error) {
      // Async operational error - emit event only
      console.error("[Reactor] Failed to send message:", error);
      this.createError(
        "MESSAGE_SEND_FAILED",
        `Failed to send message: ${error}`,
        "gpu",
        true
      );
      // Don't re-throw - let the error event handle it
    }
  }

  /**
   * Publishes a MediaStreamTrack to a named send track.
   *
   * @param name The declared send track name (e.g. "webcam").
   * @param track The MediaStreamTrack to publish.
   */
  async publishTrack(name: string, track: MediaStreamTrack): Promise<void> {
    if (process.env.NODE_ENV !== "development" && this.status !== "ready") {
      console.warn(
        `[Reactor] Cannot publish track "${name}", status is ${this.status}`
      );
      return;
    }

    try {
      await this.machineClient?.publishTrack(name, track);
    } catch (error) {
      console.error(`[Reactor] Failed to publish track "${name}":`, error);
      this.createError(
        "TRACK_PUBLISH_FAILED",
        `Failed to publish track "${name}": ${error}`,
        "gpu",
        true
      );
    }
  }

  /**
   * Unpublishes the track with the given name.
   *
   * @param name The declared send track name to unpublish.
   */
  async unpublishTrack(name: string): Promise<void> {
    try {
      await this.machineClient?.unpublishTrack(name);
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

  /**
   * Public method for reconnecting to an existing session, that may have been interrupted but can be recovered.
   * @param options Optional connect options (e.g. maxAttempts for SDP polling)
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

    this.setStatus("connecting");

    if (!this.machineClient) {
      // Get ICE servers from coordinator
      const iceServers = await this.coordinatorClient.getIceServers();
      this.machineClient = new GPUMachineClient({ iceServers });
      this.setupMachineClientHandlers();
    }

    const sdpOffer = await this.machineClient.createOffer({
      send: this.send,
      receive: this.receive,
    });

    // Send offer to coordinator and get answer.
    try {
      const { sdpAnswer } = await this.coordinatorClient.connect(
        this.sessionId,
        sdpOffer,
        options?.maxAttempts
      );
      // Connect to GPU machine with the answer.
      // Status transitions to "ready" via the statusChanged handler once
      // the peer connection and data channel are fully open.
      await this.machineClient.connect(sdpAnswer);
    } catch (error) {
      // disconnect() already aborted the polling and cleaned up state — nothing to do.
      if (isAbortError(error)) return;

      let recoverable = false;
      if (error instanceof ConflictError) {
        recoverable = true;
      }
      console.error("[Reactor] Failed to reconnect:", error);
      // Disconnect without recovery, as the session "connect" call on the coordinator failed
      this.disconnect(recoverable);
      this.createError(
        "RECONNECTION_FAILED",
        `Failed to reconnect: ${error}`,
        "api",
        true
      );
    }
  }

  /**
   * Connects to the coordinator and waits for a GPU to be assigned.
   * Once a GPU is assigned, the Reactor will connect to the gpu machine via WebRTC.
   * If no authentication is provided and not in local mode, an error is thrown.
   * @param jwtToken Optional JWT token for authentication
   * @param options Optional connect options (e.g. maxAttempts for SDP polling)
   */
  async connect(jwtToken?: string, options?: ConnectOptions): Promise<void> {
    console.debug("[Reactor] Connecting, status:", this.status);

    if (jwtToken == undefined && !this.local) {
      throw new Error("No authentication provided and not in local mode");
    }

    if (this.status !== "disconnected") {
      throw new Error("Already connected or connecting");
    }
    this.setStatus("connecting");

    this.connectStartTime = performance.now();

    try {
      console.debug(
        "[Reactor] Connecting to coordinator with authenticated URL"
      );

      this.coordinatorClient = this.local
        ? new LocalCoordinatorClient(this.coordinatorUrl)
        : new CoordinatorClient({
            baseUrl: this.coordinatorUrl,
            jwtToken: jwtToken!, // Safe: validated above
            model: this.model,
          });

      // Get ICE servers from coordinator
      const iceServers = await this.coordinatorClient.getIceServers();

      // Create GPUMachineClient and generate SDP offer
      this.machineClient = new GPUMachineClient({ iceServers });
      this.setupMachineClientHandlers();

      const sdpOffer = await this.machineClient.createOffer({
        send: this.send,
        receive: this.receive,
      });

      // Create session passing SDP offer. We will get the answer polling the sdp_offer endpoint.
      const tSession = performance.now();
      const sessionId = await this.coordinatorClient.createSession(sdpOffer);
      const sessionCreationMs = performance.now() - tSession;
      this.setSessionId(sessionId);

      // Connect to coordinator and get SDP Answer.
      // We don't pass the sdp offer here because we passed it already when creating the session.
      const tSdp = performance.now();
      const { sdpAnswer, sdpPollingAttempts } =
        await this.coordinatorClient.connect(
          sessionId,
          undefined,
          options?.maxAttempts
        );
      const sdpPollingMs = performance.now() - tSdp;

      this.connectionTimings = {
        sessionCreationMs,
        sdpPollingMs,
        sdpPollingAttempts,
        iceNegotiationMs: 0,
        dataChannelMs: 0,
        totalMs: 0,
      };

      // Connect to GPU machine with the answer
      await this.machineClient.connect(sdpAnswer);
    } catch (error) {
      // disconnect() already aborted the polling and cleaned up state — nothing to do.
      if (isAbortError(error)) return;

      console.error("[Reactor] Connection failed:", error);
      this.createError(
        "CONNECTION_FAILED",
        `Connection failed: ${error}`,
        "api",
        true
      );
      // Non-recoverable disconnect: terminates the server-side session (DELETE)
      // and cleans up all local state (machine client, session ID, etc.)
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
   * Sets up event handlers for the machine client.
   *
   * Each handler captures the client reference at registration time and
   * ignores events if this.machineClient has since changed (e.g. after
   * disconnect + reconnect), preventing stale WebRTC teardown events from
   * interfering with a new connection.
   */
  private setupMachineClientHandlers(): void {
    if (!this.machineClient) return;
    const client = this.machineClient;

    client.on("message", (message: any, scope: MessageScope) => {
      if (this.machineClient !== client) return;
      if (scope === "application") {
        this.emit("message", message);
      } else if (scope === "runtime") {
        this.emit("runtimeMessage", message);
      }
    });

    client.on("statusChanged", (status: GPUMachineStatus) => {
      if (this.machineClient !== client) return;
      switch (status) {
        case "connected":
          this.finalizeConnectionTimings(client);
          this.setStatus("ready");
          break;
        case "disconnected":
          this.disconnect(true);
          break;
        case "error":
          this.createError(
            "GPU_CONNECTION_ERROR",
            "GPU machine connection failed",
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
        if (this.machineClient !== client) return;
        this.emit("trackReceived", name, track, stream);
      }
    );

    client.on("statsUpdate", (stats: ConnectionStats) => {
      if (this.machineClient !== client) return;
      this.emit("statsUpdate", {
        ...stats,
        connectionTimings: this.connectionTimings,
      });
    });
  }

  /**
   * Disconnects from the coordinator and the gpu machine.
   * Ensures cleanup completes even if individual disconnections fail.
   */
  async disconnect(recoverable: boolean = false) {
    if (this.status === "disconnected" && !this.sessionId) {
      console.warn("[Reactor] Already disconnected");
      return;
    }

    // Abort any in-flight coordinator requests (SDP polling, pending fetches)
    // before tearing down. abort() resets the controller so terminateSession()
    // below can still make its own HTTP call.
    this.coordinatorClient?.abort();

    if (this.coordinatorClient && !recoverable) {
      try {
        await this.coordinatorClient.terminateSession();
      } catch (error) {
        console.error("[Reactor] Error terminating session:", error);
      }
      this.coordinatorClient = undefined;
    }

    // Disconnect machine client with error handling
    if (this.machineClient) {
      try {
        await this.machineClient.disconnect();
      } catch (error) {
        console.error("[Reactor] Error disconnecting from GPU machine:", error);
        // Continue with cleanup even if machine disconnect fails
      }
      if (!recoverable) {
        this.machineClient = undefined;
      }
    }

    this.setStatus("disconnected");
    this.resetConnectionTimings();
    if (!recoverable) {
      this.setSessionExpiration(undefined);
      this.setSessionId(undefined);
    }
  }

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

  getSessionId(): string | undefined {
    return this.sessionId;
  }

  private setStatus(newStatus: ReactorStatus) {
    console.debug("[Reactor] Setting status:", newStatus, "from", this.status);
    if (this.status !== newStatus) {
      this.status = newStatus;
      this.emit("statusChanged", newStatus);
    }
  }

  getStatus(): ReactorStatus {
    return this.status;
  }

  /**
   * Set the session expiration time.
   * @param newSessionExpiration The new session expiration time in seconds.
   */
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

  /**
   * Get the current state including status, error, and waiting info
   */
  getState(): ReactorState {
    return {
      status: this.status,
      lastError: this.lastError,
    };
  }

  /**
   * Get the last error that occurred
   */
  getLastError(): ReactorError | undefined {
    return this.lastError;
  }

  getStats(): ConnectionStats | undefined {
    const stats = this.machineClient?.getStats();
    if (!stats) return undefined;
    return { ...stats, connectionTimings: this.connectionTimings };
  }

  private resetConnectionTimings(): void {
    this.connectStartTime = undefined;
    this.connectionTimings = undefined;
  }

  private finalizeConnectionTimings(client: GPUMachineClient): void {
    if (!this.connectionTimings || this.connectStartTime == null) return;

    const webrtcTimings = client.getConnectionTimings();
    this.connectionTimings.iceNegotiationMs =
      webrtcTimings?.iceNegotiationMs ?? 0;
    this.connectionTimings.dataChannelMs = webrtcTimings?.dataChannelMs ?? 0;
    this.connectionTimings.totalMs = performance.now() - this.connectStartTime;
    this.connectStartTime = undefined;

    console.debug("[Reactor] Connection timings:", this.connectionTimings);
  }

  /**
   * Create and store an error
   */
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

    // Emit error event
    this.emit("error", this.lastError);
  }
}
