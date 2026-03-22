// Copyright (c) 2026 Reactor Technologies, Inc. All rights reserved.

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
  TransportDeclaration,
  CreateSessionResponse as SessionInfo,
} from "./core/types";

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
  /** Estimated available outgoing bitrate in bits/second */
  availableOutgoingBitrate?: number;
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
  | "runtimeMessage" //internal platform-level control messages (e.g. capabilities)
  | "trackReceived" // (name: string, track: MediaStreamTrack, stream: MediaStream)
  | "error" //error events with ReactorError details
  | "sessionExpirationChanged" //session expiration has changed
  | "capabilitiesReceived" //server capabilities received after session creation
  | "statsUpdate"; //WebRTC stats update (RTT, etc.)
