export type ReactorStatus =
  | "disconnected" // Not connected to anything
  | "connecting" // Establishing connection to coordinator
  | "waiting" // Connected to coordinator, waiting for GPU assignment
  | "ready"; // Connected to GPU machine, can send/receive messages

/**
 * The message scope identifies the envelope layer a data channel message belongs to.
 * - "application": model-defined commands (client->runtime) and model-emitted payloads (runtime->client).
 * - "runtime": platform-level control messages (e.g., capabilities exchange).
 */
export type MessageScope = "application" | "runtime";

// Re-export core types that users may need
export type {
  TrackCapability,
  CommandCapability,
  Capabilities,
  SessionResponse,
} from "./core/types";

export { FileRef } from "./core/FileRef";

export interface ReactorError {
  code: string;
  message: string;
  timestamp: number;
  recoverable: boolean;
  component: "api" | "gpu";
  retryAfter?: number;
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class AbortError extends Error {
  constructor(message: string) {
    super(message);
  }
}

/** Matches both our custom AbortError and the native DOMException thrown by fetch(). */
export function isAbortError(error: unknown): boolean {
  return (
    error instanceof AbortError ||
    (error instanceof Error && error.name === "AbortError")
  );
}

export interface ReactorState {
  status: ReactorStatus;
  lastError?: ReactorError;
}

/**
 * Options for configuring the connect polling behavior.
 */
export interface ConnectOptions {
  /** Maximum number of SDP polling attempts before giving up. Default: 6. */
  maxAttempts?: number;
  /**
   * When true (default), sends `resume_track` for every recvonly track
   * immediately after the connection is established, causing the backend to
   * begin streaming those tracks — this preserves the pre-multi-connection
   * behaviour where output tracks flow automatically on connect. Set to false
   * to keep recvonly tracks paused on connect and resume them individually via
   * `resumeTrack()` (e.g. multi-connection apps that only subscribe to a
   * subset of peers).
   */
  autoResumeTracks?: boolean;
  /**
   * Attach to a session that already exists (e.g. one created by a backend)
   * instead of creating a new one. When set, `connect()` skips `POST /sessions`
   * and brings up the transport directly against this id. The JWT passed to
   * `connect()` must be valid for the account that owns the session.
   */
  sessionId?: string;
}

/**
 * Transport-agnostic timing breakdown of the connect() handshake, recorded
 * once per connection and included in every subsequent {@link ConnectionStats}
 * update. All durations are in milliseconds (from `performance.now()`).
 *
 * For transport-specific timings (e.g. ICE negotiation, data channel open),
 * see the relevant transport stats type (e.g. {@link WebRTCTransportTimings}).
 */
export interface ConnectionTimings {
  /** POST /sessions round-trip time */
  sessionCreationMs: number;
  /** Total time spent in transport.connect() (signaling, negotiation, etc.) */
  transportConnectingMs: number;
  /** End-to-end: connect() invocation → status "ready" */
  totalMs: number;
}

export interface ConnectionStats {
  /** ICE candidate-pair round-trip time in milliseconds */
  rtt?: number;
  /** ICE candidate type: "host", "srflx", "prflx", or "relay" (TURN) */
  candidateType?: string;
  /** Estimated available incoming bitrate in bits/second */
  availableIncomingBitrate?: number;
  /** Estimated available outgoing bitrate in bits/second */
  availableOutgoingBitrate?: number;
  /** Real-time Incoming bitrate in bits/second */
  incomingBitrate?: number;
  /** Real-time Outgoing bitrate in bits/second */
  outgoingBitrate?: number;
  /** Received video frames per second */
  framesPerSecond?: number;
  /** Ratio of packets lost (0-1) */
  packetLossRatio?: number;
  /** Network jitter in seconds (from inbound-rtp) */
  jitter?: number;
  /** Timing breakdown of the initial connection handshake (set once, persisted until disconnect) */
  connectionTimings?: ConnectionTimings;
  timestamp: number;
}

export type ReactorEvent =
  | "statusChanged" //updates on the reactor status
  | "sessionIdChanged" //updates on the session ID.
  | "message" //application-scoped messages from the model
  | "runtimeMessage" //internal platform-level control messages (e.g. capabilities, moderation)
  | "trackReceived" // (name: string, track: MediaStreamTrack, stream: MediaStream)
  | "error" //error events with ReactorError details
  | "sessionExpirationChanged" //session expiration has changed
  | "capabilitiesReceived" //server capabilities received after session creation
  | "statsUpdate"; //WebRTC stats update (RTT, etc.)

/**
 * Severity tier of a content moderation event delivered as the inner
 * payload of a `runtimeMessage` with `type === "moderation"`.
 *
 * - `"warn"`: the input scored above the warn threshold but below the
 *   terminate threshold. The session continues; this is informational
 *   only.
 * - `"terminate"`: the input crossed the terminate threshold. The
 *   session will be ended shortly after this message is dispatched.
 */
export type ModerationAction = "warn" | "terminate";

/**
 * Inner payload of a `runtimeMessage` with `type === "moderation"`.
 *
 * Surfaces a content-moderation outcome to the client app. Fires on
 * any moderatable input (free-text fields, file uploads) that the
 * configured moderation policy flags. Apps receive it by subscribing
 * to the existing `runtimeMessage` event and filtering on `type`:
 *
 *     reactor.on("runtimeMessage", (m) => {
 *       if (m?.type === "moderation") {
 *         const payload = m.data as ModerationEvent;
 *         // ...render banner, log, etc.
 *       }
 *     });
 */
export interface ModerationEvent {
  /** Severity tier — `"warn"` continues the session, `"terminate"` ends it. */
  action: ModerationAction;
  /**
   * Modality of the flagged input. `"text"` for string fields,
   * `"image"` for `UploadedFile` payloads with an image MIME type.
   */
  input_kind: "text" | "image";
  /**
   * Name of the inbound command/event whose payload was flagged
   * (e.g. `"set_prompt"`, `"set_image"`, `"fileUploaded"`).
   */
  command: string;
  /** Category labels that flagged (e.g. `["sexual"]`, `["violence/graphic"]`). */
  categories: string[];
  /** Short human-readable summary suitable for UI rendering. */
  message: string;
}
