export type ReactorStatus =
  | "disconnected" // Not connected to anything
  | "connecting" // Establishing connection to coordinator
  | "waiting" // Connected to coordinator, waiting for GPU assignment
  | "ready"; // Connected to GPU machine, can send/receive messages

// Error information
export interface ReactorError {
  code: string;
  message: string;
  timestamp: number;
  recoverable: boolean;
  component: "coordinator" | "gpu" | "livekit";
  retryAfter?: number; // Suggested retry delay in seconds
}

// Enhanced state with metadata
export interface ReactorState {
  status: ReactorStatus;
  lastError?: ReactorError; // Most recent error
}

export type ReactorEvent =
  | "statusChanged" //updates on the reactor status
  | "sessionIdChanged" //updates on the session ID.
  | "newMessage" //new messages from the machine (coordinator handled internally)
  | "streamChanged" //video stream has changed (LiveKit)
  | "error" //error events with ReactorError details
  | "sessionExpirationChanged"; //session expiration has changed
