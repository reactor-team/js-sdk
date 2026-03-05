/**
 * Handles the direct WebRTC connection to a GPU machine instance.
 *
 * Transceivers are created from the declared `receive` and `send` track
 * arrays and keyed by track name so that publish/unpublish/receive all
 * route by name.
 */

import * as webrtc from "../utils/webrtc";
import type { MessageScope, TrackConfig, ConnectionStats } from "../types";

type EventHandler = (...args: any[]) => void;

export type GPUMachineEvent =
  | "statusChanged"
  | "trackReceived"
  | "trackRemoved"
  | "message"
  | "statsUpdate";

export type GPUMachineStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

/**
 * Interval (ms) at which the client sends runtime-channel "ping" messages
 * to the server so the runtime can detect stale connections quickly.
 */
const PING_INTERVAL_MS = 5_000;

interface TransceiverEntry {
  name: string;
  kind: "audio" | "video";
  direction: RTCRtpTransceiverDirection;
  transceiver?: RTCRtpTransceiver;
}
const STATS_INTERVAL_MS = 2_000;

export class GPUMachineClient {
  private eventListeners: Map<GPUMachineEvent, Set<EventHandler>> = new Map();
  private peerConnection: RTCPeerConnection | undefined;
  private dataChannel: RTCDataChannel | undefined;
  private status: GPUMachineStatus = "disconnected";
  private config: webrtc.WebRTCConfig;
  private pingInterval: ReturnType<typeof setInterval> | undefined;

  private transceiverMap: Map<string, TransceiverEntry> = new Map();
  private publishedTracks: Map<string, MediaStreamTrack> = new Map();
  private statsInterval: ReturnType<typeof setInterval> | undefined;
  private stats: ConnectionStats | undefined;
  private peerConnected = false;
  private dataChannelOpen = false;

  constructor(config: webrtc.WebRTCConfig) {
    this.config = config;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Event Emitter API
  // ─────────────────────────────────────────────────────────────────────────────

  on(event: GPUMachineEvent, handler: EventHandler): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(handler);
  }

  off(event: GPUMachineEvent, handler: EventHandler): void {
    this.eventListeners.get(event)?.delete(handler);
  }

  private emit(event: GPUMachineEvent, ...args: unknown[]): void {
    this.eventListeners.get(event)?.forEach((handler) => handler(...args));
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SDP & Connection
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Creates an SDP offer based on the declared tracks.
   *
   * **RECEIVE** = client receives from the model (model → client) → `recvonly`
   * **SEND**    = client sends to the model (client → model)     → `sendonly`
   *
   * Track names must be unique across both arrays. A name that appears in
   * both `receive` and `send` will throw — use distinct names instead.
   *
   * The data channel is always created first (before transceivers).
   * Must be called before connect().
   */
  async createOffer(tracks: {
    send: TrackConfig[];
    receive: TrackConfig[];
  }): Promise<string> {
    // Create peer connection if not exists
    if (!this.peerConnection) {
      this.peerConnection = webrtc.createPeerConnection(this.config);
      this.setupPeerConnectionHandlers();
    }

    // Create data channel before offer (offerer creates the channel)
    this.dataChannel = webrtc.createDataChannel(
      this.peerConnection,
      this.config.dataChannelLabel
    );
    this.setupDataChannelHandlers();

    this.transceiverMap.clear();

    const entries = this.buildTransceiverEntries(tracks);

    for (const entry of entries) {
      const transceiver = this.peerConnection.addTransceiver(entry.kind, {
        direction: entry.direction,
      });
      entry.transceiver = transceiver;
      this.transceiverMap.set(entry.name, entry);

      console.debug(
        `[GPUMachineClient] Transceiver added: "${entry.name}" (${entry.kind}, ${entry.direction})`
      );
    }

    const trackNames = entries.map((e) => e.name);
    const offer = await webrtc.createOffer(this.peerConnection, trackNames);
    console.debug(
      "[GPUMachineClient] Created SDP offer with MIDs:",
      trackNames
    );
    return offer;
  }

  /**
   * Builds an ordered list of transceiver entries from the receive/send arrays.
   *
   * Each track produces exactly one transceiver — `recvonly` for receive,
   * `sendonly` for send.  Bidirectional (`sendrecv`) transceivers are not
   * supported; the same track name in both arrays is an error.
   */
  private buildTransceiverEntries(tracks: {
    send: TrackConfig[];
    receive: TrackConfig[];
  }): TransceiverEntry[] {
    const map = new Map<string, TransceiverEntry>();

    for (const t of tracks.receive) {
      if (map.has(t.name)) {
        throw new Error(
          `Duplicate receive track name "${t.name}". Track names must be unique.`
        );
      }
      map.set(t.name, { name: t.name, kind: t.kind, direction: "recvonly" });
    }

    for (const t of tracks.send) {
      if (map.has(t.name)) {
        throw new Error(
          `Track name "${t.name}" appears in both receive and send. ` +
            `Bidirectional tracks are not supported — use distinct names ` +
            `for the inbound and outbound directions (e.g. "${t.name}_in" and "${t.name}_out").`
        );
      }
      map.set(t.name, { name: t.name, kind: t.kind, direction: "sendonly" });
    }

    return Array.from(map.values());
  }

  /**
   * Connects to the GPU machine using the provided SDP answer.
   * createOffer() must be called first.
   * @param sdpAnswer The SDP answer from the GPU machine
   */
  async connect(sdpAnswer: string): Promise<void> {
    if (!this.peerConnection) {
      throw new Error(
        "[GPUMachineClient] Cannot connect - call createOffer() first"
      );
    }

    if (this.peerConnection.signalingState !== "have-local-offer") {
      throw new Error(
        `[GPUMachineClient] Invalid signaling state: ${this.peerConnection.signalingState}`
      );
    }

    this.setStatus("connecting");

    try {
      await webrtc.setRemoteDescription(this.peerConnection, sdpAnswer);
      console.debug("[GPUMachineClient] Remote description set");
    } catch (error) {
      console.error("[GPUMachineClient] Failed to connect:", error);
      this.setStatus("error");
      throw error;
    }
  }

  /**
   * Disconnects from the GPU machine and cleans up resources.
   */
  async disconnect(): Promise<void> {
    this.stopPing();
    this.stopStatsPolling();

    for (const name of Array.from(this.publishedTracks.keys())) {
      await this.unpublishTrack(name);
    }

    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = undefined;
    }

    if (this.peerConnection) {
      webrtc.closePeerConnection(this.peerConnection);
      this.peerConnection = undefined;
    }

    this.transceiverMap.clear();
    this.peerConnected = false;
    this.dataChannelOpen = false;
    this.setStatus("disconnected");
    console.debug("[GPUMachineClient] Disconnected");
  }

  /**
   * Returns the current connection status.
   */
  getStatus(): GPUMachineStatus {
    return this.status;
  }

  /**
   * Gets the current local SDP description.
   */
  getLocalSDP(): string | undefined {
    if (!this.peerConnection) return undefined;
    return webrtc.getLocalDescription(this.peerConnection);
  }

  isOfferStillValid(): boolean {
    if (!this.peerConnection) return false;
    return this.peerConnection.signalingState === "have-local-offer";
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Messaging
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Returns the negotiated SCTP max message size (bytes) if available,
   * otherwise `undefined` so `sendMessage` falls back to its built-in default.
   */
  private get maxMessageBytes(): number | undefined {
    return this.peerConnection?.sctp?.maxMessageSize ?? undefined;
  }

  /**
   * Sends a command to the GPU machine via the data channel.
   * @param command The command to send
   * @param data The data to send with the command. These are the parameters for the command, matching the schema in the capabilities dictionary.
   * @param scope The message scope – "application" (default) for model commands, "runtime" for platform-level messages.
   */
  sendCommand(
    command: string,
    data: any,
    scope: MessageScope = "application"
  ): void {
    if (!this.dataChannel) {
      throw new Error("[GPUMachineClient] Data channel not available");
    }

    try {
      webrtc.sendMessage(
        this.dataChannel,
        command,
        data,
        scope,
        this.maxMessageBytes
      );
    } catch (error) {
      console.warn("[GPUMachineClient] Failed to send message:", error);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Track Publishing
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Publishes a MediaStreamTrack to the named send track.
   *
   * @param name The declared track name (must exist in transceiverMap with a sendable direction).
   * @param track The MediaStreamTrack to publish.
   */
  async publishTrack(name: string, track: MediaStreamTrack): Promise<void> {
    if (!this.peerConnection) {
      throw new Error(
        `[GPUMachineClient] Cannot publish track "${name}" - not initialized`
      );
    }

    if (this.status !== "connected") {
      throw new Error(
        `[GPUMachineClient] Cannot publish track "${name}" - not connected`
      );
    }

    const entry = this.transceiverMap.get(name);
    if (!entry || !entry.transceiver) {
      throw new Error(
        `[GPUMachineClient] Cannot publish track "${name}" - no transceiver (was it declared in tracks.send?)`
      );
    }

    if (entry.direction === "recvonly") {
      throw new Error(
        `[GPUMachineClient] Cannot publish track "${name}" - transceiver is recvonly`
      );
    }

    try {
      // Use replaceTrack on the existing transceiver's sender.
      // This doesn't require renegotiation.
      await entry.transceiver.sender.replaceTrack(track);
      this.publishedTracks.set(name, track);
      console.debug(
        `[GPUMachineClient] Track "${name}" published successfully`
      );
    } catch (error) {
      console.error(
        `[GPUMachineClient] Failed to publish track "${name}":`,
        error
      );
      throw error;
    }
  }

  /**
   * Unpublishes the track with the given name.
   */
  async unpublishTrack(name: string): Promise<void> {
    const entry = this.transceiverMap.get(name);
    if (!entry?.transceiver || !this.publishedTracks.has(name)) return;

    try {
      // Replace with null to stop sending without renegotiation
      await entry.transceiver.sender.replaceTrack(null);
      console.debug(
        `[GPUMachineClient] Track "${name}" unpublished successfully`
      );
    } catch (error) {
      console.error(
        `[GPUMachineClient] Failed to unpublish track "${name}":`,
        error
      );
      throw error;
    } finally {
      this.publishedTracks.delete(name);
    }
  }

  /**
   * Returns the currently published track for the given name.
   */
  getPublishedTrack(name: string): MediaStreamTrack | undefined {
    return this.publishedTracks.get(name);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Getters
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Returns the remote media stream from the GPU machine.
   */
  getRemoteStream(): MediaStream | undefined {
    if (!this.peerConnection) return undefined;

    const receivers = this.peerConnection.getReceivers();
    const tracks = receivers
      .map((r) => r.track)
      .filter((t): t is MediaStreamTrack => t !== null);

    if (tracks.length === 0) return undefined;
    return new MediaStream(tracks);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Ping (Client Liveness)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Starts sending periodic "ping" messages on the runtime channel so the
   * server can detect stale connections quickly.
   */
  private startPing(): void {
    this.stopPing();
    this.pingInterval = setInterval(() => {
      if (this.dataChannel?.readyState === "open") {
        try {
          webrtc.sendMessage(this.dataChannel, "ping", {}, "runtime");
        } catch {
          // Silently ignore -- data channel may be closing
        }
      }
    }, PING_INTERVAL_MS);
  }

  /**
   * Stops the periodic ping.
   */
  private stopPing(): void {
    if (this.pingInterval !== undefined) {
      clearInterval(this.pingInterval);
      this.pingInterval = undefined;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Stats Polling (RTT)
  // ─────────────────────────────────────────────────────────────────────────────

  getStats(): ConnectionStats | undefined {
    return this.stats;
  }

  private startStatsPolling(): void {
    this.stopStatsPolling();
    this.statsInterval = setInterval(async () => {
      if (!this.peerConnection) return;
      try {
        const report = await this.peerConnection.getStats();
        this.stats = webrtc.extractConnectionStats(report);
        this.emit("statsUpdate", this.stats);
      } catch {
        // Silently ignore – connection may be closing
      }
    }, STATS_INTERVAL_MS);
  }

  private stopStatsPolling(): void {
    if (this.statsInterval !== undefined) {
      clearInterval(this.statsInterval);
      this.statsInterval = undefined;
    }
    this.stats = undefined;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Private Helpers
  // ─────────────────────────────────────────────────────────────────────────────

  private checkFullyConnected(): void {
    if (this.peerConnected && this.dataChannelOpen) {
      this.setStatus("connected");
      this.startStatsPolling();
    }
  }

  private setStatus(newStatus: GPUMachineStatus): void {
    if (this.status !== newStatus) {
      this.status = newStatus;
      this.emit("statusChanged", newStatus);
    }
  }

  private setupPeerConnectionHandlers(): void {
    if (!this.peerConnection) return;

    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection?.connectionState;
      console.debug("[GPUMachineClient] Connection state:", state);

      if (state) {
        switch (state) {
          case "connected":
            this.peerConnected = true;
            this.checkFullyConnected();
            break;
          case "disconnected":
          case "closed":
            this.peerConnected = false;
            this.setStatus("disconnected");
            break;
          case "failed":
            this.peerConnected = false;
            this.setStatus("error");
            break;
        }
      }
    };

    this.peerConnection.ontrack = (event) => {
      const mid = event.transceiver.mid;
      const trackName = mid ?? `unknown-${event.track.id}`;

      console.debug(
        `[GPUMachineClient] Track received: "${trackName}" (${event.track.kind}, mid=${mid})`
      );
      const stream = event.streams[0] ?? new MediaStream([event.track]);
      this.emit("trackReceived", trackName, event.track, stream);
    };

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.debug("[GPUMachineClient] ICE candidate:", event.candidate);
      }
    };

    this.peerConnection.onicecandidateerror = (event) => {
      console.warn("[GPUMachineClient] ICE candidate error:", event);
    };

    // Handle data channel created by remote peer (if we're the answerer)
    this.peerConnection.ondatachannel = (event) => {
      console.debug("[GPUMachineClient] Data channel received from remote");
      this.dataChannel = event.channel;
      this.setupDataChannelHandlers();
    };
  }

  private setupDataChannelHandlers(): void {
    if (!this.dataChannel) return;

    this.dataChannel.onopen = () => {
      console.debug("[GPUMachineClient] Data channel open");
      this.dataChannelOpen = true;
      this.startPing();
      this.checkFullyConnected();
    };

    this.dataChannel.onclose = () => {
      console.debug("[GPUMachineClient] Data channel closed");
      this.dataChannelOpen = false;
      this.stopPing();
    };

    this.dataChannel.onerror = (error) => {
      console.error("[GPUMachineClient] Data channel error:", error);
    };

    this.dataChannel.onmessage = (event) => {
      const rawData = webrtc.parseMessage(event.data) as any;
      console.debug("[GPUMachineClient] Received message:", rawData);

      try {
        // Parse the outer envelope { scope: "application"|"runtime", data: ... }
        if (rawData?.scope === "application" && rawData?.data !== undefined) {
          this.emit("message", rawData.data, "application" as MessageScope);
        } else if (
          rawData?.scope === "runtime" &&
          rawData?.data !== undefined
        ) {
          this.emit("message", rawData.data, "runtime" as MessageScope);
        } else {
          // Legacy / unknown format – treat as application
          console.warn(
            "[GPUMachineClient] Received message without envelope, treating as application"
          );
          this.emit("message", rawData, "application" as MessageScope);
        }
      } catch (error) {
        console.error(
          "[GPUMachineClient] Failed to parse/validate message:",
          error
        );
      }
    };
  }
}
