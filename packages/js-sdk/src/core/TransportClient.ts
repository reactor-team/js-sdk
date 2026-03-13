// Copyright (c) 2026 Reactor Technologies, Inc. All rights reserved.

/**
 * Generic transport interface for connecting to a Reactor session.
 *
 * A TransportClient encapsulates the full transport lifecycle: signaling,
 * connection establishment, media track management, and data channel
 * messaging. Implementations handle protocol specifics (WebRTC, MOQ, etc.)
 * while the Reactor orchestrator works only through this interface.
 */

import type {
  TrackCapability,
  ConnectionStats,
  MessageScope,
} from "../types";
import type { WebRTCTransportTimings } from "./WebRTCTransportClient";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Discriminated union of all transport-specific timing types.
 * Each member carries a `protocol` tag for narrowing.
 * Extend this union when adding new transport implementations.
 */
export type TransportTimings = WebRTCTransportTimings; // | MOQTransportTimings | ...

export type TransportStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

export type TransportEvent =
  | "statusChanged"
  | "trackReceived"
  | "trackRemoved"
  | "message"
  | "statsUpdate";

type EventHandler = (...args: any[]) => void;

export interface TransportClientConfig {
  baseUrl: string;
  sessionId: string;
  jwtToken: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Interface
// ─────────────────────────────────────────────────────────────────────────────

export interface TransportClient {
  /**
   * Establishes the transport connection using server-declared tracks.
   *
   * Internally handles: signaling (ICE servers, SDP offer/answer),
   * connection negotiation, and transceiver setup. For sendonly tracks,
   * no media flows until {@link publishTrack} is called.
   */
  connect(tracks: TrackCapability[]): Promise<void>;

  /**
   * Reconnects an existing session with a fresh transport negotiation.
   * Uses the same tracks as the original connection.
   */
  reconnect(tracks: TrackCapability[]): Promise<void>;

  /**
   * Tears down the transport connection and releases all resources.
   */
  disconnect(): Promise<void>;

  /**
   * Returns the current transport connection status.
   */
  getStatus(): TransportStatus;

  /**
   * Sends a command to the model via the data channel.
   *
   * @param command The command name.
   * @param data The command payload.
   * @param scope "application" for model commands, "runtime" for platform messages.
   */
  sendCommand(command: string, data: any, scope: MessageScope): void;

  /**
   * Publishes a MediaStreamTrack to a named sendonly track.
   * The transceiver must already exist (declared by capabilities).
   * Uses replaceTrack() — no renegotiation needed.
   */
  publishTrack(name: string, track: MediaStreamTrack): Promise<void>;

  /**
   * Stops sending media on a named track.
   */
  unpublishTrack(name: string): Promise<void>;

  /**
   * Subscribes to transport events.
   *
   * Events:
   * - "statusChanged" (status: TransportStatus)
   * - "trackReceived" (name: string, track: MediaStreamTrack, stream: MediaStream)
   * - "trackRemoved" (name: string)
   * - "message" (message: any, scope: MessageScope)
   * - "statsUpdate" (stats: ConnectionStats)
   */
  on(event: TransportEvent, handler: EventHandler): void;

  /**
   * Unsubscribes from transport events.
   */
  off(event: TransportEvent, handler: EventHandler): void;

  /**
   * Returns current connection statistics, or undefined if not connected.
   */
  getStats(): ConnectionStats | undefined;

  /**
   * Returns transport-specific timing breakdown of the most recent
   * connection attempt. Narrow on the `protocol` discriminant to
   * access implementation-specific fields.
   */
  getTransportTimings(): TransportTimings | undefined;

  /**
   * Cancels any in-flight signaling (HTTP polling, pending fetches).
   */
  abort(): void;
}
