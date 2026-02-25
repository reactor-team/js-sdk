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

/**
 * Describes a single named media track for SDP negotiation.
 *
 * Track names must exactly match the class attribute names defined on the
 * model's Python code.  The name is encoded as the SDP MID so both sides
 * can route media by name rather than by positional index.
 *
 * Use the {@link video} and {@link audio} helper functions to create
 * instances instead of constructing this interface directly.
 */
export interface TrackConfig {
  name: string;
  kind: "audio" | "video";
}

/**
 * Optional configuration for a video track (reserved for future use).
 */
export interface VideoTrackOptions {
  /** Maximum framerate constraint for the video track. */
  maxFramerate?: number;
}

/**
 * Optional configuration for an audio track (reserved for future use).
 */
export interface AudioTrackOptions {
  /** Sample rate constraint for the audio track. */
  sampleRate?: number;
}

/**
 * Creates a **video** {@link TrackConfig}.
 *
 * A track declared in the **`receive`** array means the client will
 * **RECEIVE** video frames **from the model** (model → client).
 *
 * A track declared in the **`send`** array means the client will
 * **SEND** video frames **to the model** (client → model).
 *
 * Track names must be unique across both arrays — the same name cannot
 * appear in `receive` and `send`.
 *
 * @param name    - The track name.  Must match the model's declared track attribute name.
 * @param options - Reserved for future constraints (e.g. `maxFramerate`).
 *
 * @example
 * ```ts
 * receive: [video("main_video")]          // receive video from the model
 * send:    [video("webcam")]              // send webcam video to the model
 * ```
 */
export function video(name: string, _options?: VideoTrackOptions): TrackConfig {
  return { name, kind: "video" };
}

/**
 * Creates an **audio** {@link TrackConfig}.
 *
 * A track declared in the **`receive`** array means the client will
 * **RECEIVE** audio samples **from the model** (model → client).
 *
 * A track declared in the **`send`** array means the client will
 * **SEND** audio samples **to the model** (client → model).
 *
 * Track names must be unique across both arrays — the same name cannot
 * appear in `receive` and `send`.
 *
 * @param name    - The track name.  Must match the model's declared track attribute name.
 * @param options - Reserved for future constraints (e.g. `sampleRate`).
 *
 * @example
 * ```ts
 * receive: [audio("main_audio")]          // receive audio from the model
 * send:    [audio("mic")]                 // send microphone audio to the model
 * ```
 */
export function audio(name: string, _options?: AudioTrackOptions): TrackConfig {
  return { name, kind: "audio" };
}

export interface ReactorError {
  code: string;
  message: string;
  timestamp: number;
  recoverable: boolean;
  component: "coordinator" | "gpu" | "livekit";
  retryAfter?: number;
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
  }
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
  | "statsUpdate"; //WebRTC stats update (RTT, etc.)
