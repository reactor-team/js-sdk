// Copyright (c) 2026 Reactor Technologies, Inc. All rights reserved.

/**
 * Generic transport interface for connecting to a Reactor session.
 *
 * A TransportClient encapsulates the full transport lifecycle: signaling,
 * connection establishment, media track management, and data channel
 * messaging. Implementations handle protocol specifics (WebRTC, MOQ, etc.)
 * while the Reactor orchestrator works only through this interface.
 */

import type { TrackCapability, ConnectionStats, MessageScope } from "../types";
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
   * Optional early work the transport can do before tracks are known.
   *
   * For example, fetching signaling credentials that only require the
   * session_id. Results are cached internally and reused by
   * {@link prepare}. Safe to call in parallel with session polling.
   *
   * Calling this is optional — {@link prepare} will do the work itself
   * if `warmup()` was not called.
   */
  warmup(): Promise<void>;

  /**
   * Phase 1: Prepare the transport for connection.
   *
   * Performs all setup that can happen before the Runtime is confirmed
   * ready — e.g. creating the local connection object and configuring
   * media tracks. If {@link warmup} was called, reuses its cached
   * results (e.g. signaling credentials). This phase can run in
   * parallel with session polling since it only requires the
   * session_id and cluster assignment, not full Runtime readiness.
   *
   * Must be called before {@link connect}.
   */
  prepare(tracks: TrackCapability[]): Promise<void>;

  /**
   * Phase 2: Complete the transport connection.
   *
   * Sends the prepared signaling data to the server, waits for the
   * server's response, and finishes the connection handshake. Must only
   * be called after the Runtime is confirmed ready (i.e. after
   * {@link prepare} and session polling have both completed).
   *
   * @param reconnect If true, signals a reconnection to an existing
   *   session rather than an initial connection.
   */
  connect(reconnect?: boolean): Promise<void>;

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
  sendCommand(
    command: string,
    data: any,
    scope: MessageScope,
    uploads?: Record<string, object>
  ): void;

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
