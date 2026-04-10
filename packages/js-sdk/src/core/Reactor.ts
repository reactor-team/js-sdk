// Copyright (c) 2026 Reactor Technologies, Inc. All rights reserved.

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

const OptionsSchema = z.object({
  apiUrl: z.string().default(DEFAULT_BASE_URL),
  modelName: z.string(),
  local: z.boolean().default(false),
});
export type Options = z.input<typeof OptionsSchema>;

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
  private connectStartTime?: number;
  private connectionTimings?: ConnectionTimings;

  private capabilities?: Capabilities;
  private tracks: TrackCapability[] = [];
  private sessionResponse?: SessionResponse;

  constructor(options: Options) {
    const validatedOptions = OptionsSchema.parse(options);
    this.coordinatorUrl = validatedOptions.apiUrl;
    this.model = validatedOptions.modelName;
    this.local = validatedOptions.local;
    if (this.local && options.apiUrl === undefined) {
      this.coordinatorUrl = LOCAL_COORDINATOR_URL;
    }
  }

  private eventListeners: Map<ReactorEvent, Set<EventHandler>> = new Map();

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
   */
  async sendCommand(
    command: string,
    data: any,
    scope: MessageScope = "application"
  ): Promise<void> {
    if (process.env.NODE_ENV !== "development" && this.status !== "ready") {
      const errorMessage = `Cannot send message, status is ${this.status}`;
      console.warn("[Reactor]", errorMessage);
      return;
    }

    try {
      this.transportClient?.sendCommand(command, data, scope);
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

      await this.transportClient.reconnect(this.tracks);
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
   * the transport using server-declared capabilities.
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
      this.coordinatorClient = this.local
        ? new LocalCoordinatorClient(this.coordinatorUrl, this.model)
        : new CoordinatorClient({
            baseUrl: this.coordinatorUrl,
            jwtToken: jwtToken!,
            model: this.model,
          });

      // 1. Create session — slim response with session_id and status
      const tSession = performance.now();
      const initialResponse = await this.coordinatorClient.createSession();
      const sessionCreationMs = performance.now() - tSession;

      this.setSessionId(initialResponse.session_id);

      console.debug(
        "[Reactor] Session created:",
        initialResponse.session_id,
        "state:",
        initialResponse.state
      );

      // 2. Poll capabilities and prefetch ICE servers in parallel.
      //    ICE servers only need the session_id (available now), so we can
      //    start that fetch while waiting for the runtime to report capabilities.
      this.setStatus("waiting");

      this.transportClient = new WebRTCTransportClient({
        baseUrl: this.coordinatorUrl,
        sessionId: initialResponse.session_id,
        jwtToken: this.local ? "local" : jwtToken!,
        webrtcVersion: REACTOR_WEBRTC_VERSION,
        maxPollAttempts: options?.maxAttempts,
      });

      const iceServersPromise = (
        this.transportClient as WebRTCTransportClient
      ).fetchIceServers();
      iceServersPromise.catch(() => {});

      const tPoll = performance.now();
      const sessionResponse = await this.coordinatorClient.pollSessionReady();
      const sessionPollingMs = performance.now() - tPoll;

      this.sessionResponse = sessionResponse;

      // 3. Store capabilities and tracks
      this.capabilities = sessionResponse.capabilities!;
      this.tracks = sessionResponse.capabilities!.tracks;
      this.emit("capabilitiesReceived", this.capabilities);

      console.debug(
        "[Reactor] Session ready, transport:",
        sessionResponse.selected_transport!.protocol,
        "tracks:",
        this.tracks.length
      );

      // 4. Validate transport and update negotiated version
      const protocol = sessionResponse.selected_transport!.protocol;
      if (protocol !== "webrtc") {
        throw new Error(`Unsupported transport protocol: ${protocol}`);
      }

      if (sessionResponse.selected_transport?.version) {
        (this.transportClient as WebRTCTransportClient).webrtcVersion =
          sessionResponse.selected_transport.version;
      }
      this.setupTransportHandlers();

      // 5. Connect transport, reusing the already-inflight ICE servers fetch
      const tTransport = performance.now();
      await this.transportClient.connect(this.tracks, iceServersPromise);
      const transportConnectingMs = performance.now() - tTransport;

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
        this.emit("runtimeMessage", message);
      }
    });

    client.on("statusChanged", (status: TransportStatus) => {
      if (this.transportClient !== client) return;
      switch (status) {
        case "connected":
          this.finalizeConnectionTimings();
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
        if (this.transportClient !== client) return;
        this.emit("trackReceived", name, track, stream);
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
      try {
        await this.coordinatorClient.terminateSession();
      } catch (error) {
        console.error("[Reactor] Error terminating session:", error);
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
