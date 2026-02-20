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

// Error information
export interface ReactorError {
  code: string;
  message: string;
  timestamp: number;
  recoverable: boolean;
  component: "coordinator" | "gpu" | "livekit";
  retryAfter?: number; // Suggested retry delay in seconds
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
  }
}

// Enhanced state with metadata
export interface ReactorState {
  status: ReactorStatus;
  lastError?: ReactorError; // Most recent error
}

/**
 * Options for configuring the connect polling behavior.
 */
export interface ConnectOptions {
  /** Maximum number of SDP polling attempts before giving up. Default: 6. */
  maxAttempts?: number;
}

export type ReactorEvent =
  | "statusChanged" //updates on the reactor status
  | "sessionIdChanged" //updates on the session ID.
  | "newMessage" //new messages from the machine (coordinator handled internally)
  | "streamChanged" //video stream has changed (LiveKit)
  | "error" //error events with ReactorError details
  | "sessionExpirationChanged"; //session expiration has changed
