import type {
  ReactorEvent,
  ReactorStatus,
  ReactorState,
  ReactorError,
} from "../types";
import { CoordinatorClient } from "./CoordinatorClient";
import { LocalCoordinatorClient } from "./LocalCoordinatorClient";
import { GPUMachineClient, GPUMachineStatus } from "./GPUMachineClient";
import { z } from "zod";

const LOCAL_COORDINATOR_URL = "http://localhost:8080";
export const PROD_COORDINATOR_URL = "https://api.reactor.inc";

const OptionsSchema = z.object({
  coordinatorUrl: z.string().default(PROD_COORDINATOR_URL),
  modelName: z.string(),
  local: z.boolean().default(false),
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
  private sessionId?: string;

  constructor(options: Options) {
    const validatedOptions = OptionsSchema.parse(options);
    this.coordinatorUrl = validatedOptions.coordinatorUrl;

    // TODO(REA-146) Properly accept version from parameter.
    this.model = validatedOptions.modelName;
    this.local = validatedOptions.local;
    if (this.local) {
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
   * Public method to send a message to the machine.
   * Automatically wraps the message in an application message.
   * @param message The message to send to the machine.
   * @throws Error if not in ready state
   */
  async sendCommand(command: string, data: any): Promise<void> {
    // Synchronous validation - throw immediately
    if (process.env.NODE_ENV !== "development" && this.status !== "ready") {
      const errorMessage = `Cannot send message, status is ${this.status}`;
      console.warn("[Reactor]", errorMessage);
      return;
    }

    try {
      this.machineClient?.sendCommand(command, data);
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
   * Public method to publish a track to the machine.
   * @param track The track to send to the machine.
   */
  async publishTrack(track: MediaStreamTrack): Promise<void> {
    // Synchronous validation - throw immediately
    if (process.env.NODE_ENV !== "development" && this.status !== "ready") {
      const errorMessage = `Cannot publish track, status is ${this.status}`;
      console.warn("[Reactor]", errorMessage);
      return;
    }

    try {
      await this.machineClient?.publishTrack(track);
    } catch (error) {
      console.error("[Reactor] Failed to publish track:", error);
      this.createError(
        "TRACK_PUBLISH_FAILED",
        `Failed to publish track: ${error}`,
        "gpu",
        true
      );
    }
  }

  /**
   * Public method to unpublish the currently published track.
   */
  async unpublishTrack(): Promise<void> {
    try {
      await this.machineClient?.unpublishTrack();
    } catch (error) {
      console.error("[Reactor] Failed to unpublish track:", error);
      this.createError(
        "TRACK_UNPUBLISH_FAILED",
        `Failed to unpublish track: ${error}`,
        "gpu",
        true
      );
    }
  }

  /**
   * Public method for reconnecting to an existing session, that may have been interrupted but can be recovered.
   */
  async reconnect(): Promise<void> {
    if (!this.sessionId || !this.coordinatorClient) {
      console.warn("[Reactor] No active session to reconnect to.");
      return;
    }

    this.setStatus("connecting");

    if (!this.machineClient) {
      this.machineClient = new GPUMachineClient();
      this.setupMachineClientHandlers();
    }

    // We always calculate a new offer for reconnection.
    const sdpOffer = await this.machineClient.createOffer();

    // Send offer to coordinator and get answer.
    try {
      const sdpAnswer = await this.coordinatorClient.connect(
        this.sessionId,
        sdpOffer
      );

      // Connect to GPU machine with the answer
      await this.machineClient.connect(sdpAnswer);
      this.setStatus("ready");
    } catch (error) {
      console.error("[Reactor] Failed to reconnect:", error);
      // disconnect without recovery, as the session "connect" call on the coordinator failed
      this.disconnect(false);
      this.createError(
        "RECONNECTION_FAILED",
        `Failed to reconnect: ${error}`,
        "coordinator",
        true
      );
    }
  }

  /**
   * Connects to the coordinator and waits for a GPU to be assigned.
   * Once a GPU is assigned, the Reactor will connect to the gpu machine via WebRTC.
   * If no authentication is provided and not in local mode, an error is thrown.
   */
  async connect(jwtToken?: string): Promise<void> {
    console.debug("[Reactor] Connecting, status:", this.status);

    if (jwtToken == undefined && !this.local) {
      throw new Error("No authentication provided and not in local mode");
    }

    // Synchronous validation - throw immediately
    if (this.status !== "disconnected") {
      throw new Error("Already connected or connecting");
    }
    this.setStatus("connecting");

    try {
      console.debug(
        "[Reactor] Connecting to coordinator with authenticated URL"
      );

      this.coordinatorClient = this.local
        ? new LocalCoordinatorClient(this.coordinatorUrl)
        : new CoordinatorClient({
            baseUrl: this.coordinatorUrl,
            jwtToken: jwtToken!, // Safe: validated on line 186-188
            model: this.model,
          });

      // Create GPUMachineClient and generate SDP offer
      this.machineClient = new GPUMachineClient();
      this.setupMachineClientHandlers();

      const sdpOffer = await this.machineClient.createOffer();

      // Create session passing sdp offer. We will get the answer polling the sdp_offer endpoint.
      const sessionId = await this.coordinatorClient.createSession(sdpOffer);
      this.setSessionId(sessionId);

      // Connect to coordinator and get SDP Answer.
      // We don't pass the sdp offer here because we passed it already when creating the session.
      const sdpAnswer = await this.coordinatorClient.connect(sessionId);

      // Connect to GPU machine with the answer
      await this.machineClient.connect(sdpAnswer);
    } catch (error) {
      console.error("[Reactor] Connection failed:", error);
      this.createError(
        "CONNECTION_FAILED",
        `Connection failed: ${error}`,
        "coordinator",
        true
      );
      this.setStatus("disconnected");
      throw error;
    }
  }

  /**
   * Sets up event handlers for the machine client.
   */
  private setupMachineClientHandlers(): void {
    if (!this.machineClient) return;

    this.machineClient.on("application", (message: any) => {
      this.emit("newMessage", message);
    });

    this.machineClient.on("statusChanged", (status: GPUMachineStatus) => {
      switch (status) {
        case "connected":
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

    this.machineClient.on(
      "trackReceived",
      (track: MediaStreamTrack, stream: MediaStream) => {
        this.emit("streamChanged", track, stream);
      }
    );
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

    if (this.coordinatorClient && !recoverable) {
      await this.coordinatorClient.terminateSession();
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

  /**
   * Create and store an error
   */
  private createError(
    code: string,
    message: string,
    component: "coordinator" | "gpu" | "livekit",
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
