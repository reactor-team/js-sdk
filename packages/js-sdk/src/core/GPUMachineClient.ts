/**
 * The GPUMachineClient is responsible for handling the direct connection to the machine instance
 * after the coordinator has assigned a machine.
 */

import * as webrtc from "../utils/webrtc";
import type { MessageChannel } from "../types";

type EventHandler = (...args: any[]) => void;

export type GPUMachineEvent =
  | "statusChanged"
  | "trackReceived"
  | "trackRemoved"
  | "message";

export type GPUMachineStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

export class GPUMachineClient {
  private eventListeners: Map<GPUMachineEvent, Set<EventHandler>> = new Map();
  private peerConnection: RTCPeerConnection | undefined;
  private dataChannel: RTCDataChannel | undefined;
  private status: GPUMachineStatus = "disconnected";
  private publishedTrack: MediaStreamTrack | undefined;
  private videoTransceiver: RTCRtpTransceiver | undefined;
  private config: webrtc.WebRTCConfig;

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
   * Creates an SDP offer for initiating a connection.
   * Must be called before connect().
   */
  async createOffer(): Promise<string> {
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

    // Add sendrecv video transceiver for bidirectional video
    this.videoTransceiver = this.peerConnection.addTransceiver("video", {
      direction: "sendrecv",
    });

    const offer = await webrtc.createOffer(this.peerConnection);
    console.debug("[GPUMachineClient] Created SDP offer");
    return offer;
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
    if (this.publishedTrack) {
      await this.unpublishTrack();
    }

    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = undefined;
    }

    if (this.peerConnection) {
      webrtc.closePeerConnection(this.peerConnection);
      this.peerConnection = undefined;
    }

    this.videoTransceiver = undefined;
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
   * Sends a command to the GPU machine via the data channel.
   * @param command The command to send
   * @param data The data to send with the command. These are the parameters for the command, matching the scheme in the capabilities dictionary.
   * @param channel The message channel envelope – "application" (default) for model commands, "runtime" for platform-level messages.
   */
  sendCommand(
    command: string,
    data: any,
    channel: MessageChannel = "application"
  ): void {
    if (!this.dataChannel) {
      throw new Error("[GPUMachineClient] Data channel not available");
    }

    try {
      webrtc.sendMessage(this.dataChannel, command, data, channel);
    } catch (error) {
      console.warn("[GPUMachineClient] Failed to send message:", error);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Track Publishing
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Publishes a track to the GPU machine.
   * Only one track can be published at a time.
   * Uses the existing transceiver's sender to replace the track.
   * @param track The MediaStreamTrack to publish
   */
  async publishTrack(track: MediaStreamTrack): Promise<void> {
    if (!this.peerConnection) {
      throw new Error(
        "[GPUMachineClient] Cannot publish track - not initialized"
      );
    }

    if (this.status !== "connected") {
      throw new Error(
        "[GPUMachineClient] Cannot publish track - not connected"
      );
    }

    if (!this.videoTransceiver) {
      throw new Error(
        "[GPUMachineClient] Cannot publish track - no video transceiver"
      );
    }

    try {
      // Use replaceTrack on the existing transceiver's sender
      // This doesn't require renegotiation
      await this.videoTransceiver.sender.replaceTrack(track);
      this.publishedTrack = track;
      console.debug(
        "[GPUMachineClient] Track published successfully:",
        track.kind
      );
    } catch (error) {
      console.error("[GPUMachineClient] Failed to publish track:", error);
      throw error;
    }
  }

  /**
   * Unpublishes the currently published track.
   */
  async unpublishTrack(): Promise<void> {
    if (!this.videoTransceiver || !this.publishedTrack) return;

    try {
      // Replace with null to stop sending without renegotiation
      await this.videoTransceiver.sender.replaceTrack(null);
      console.debug("[GPUMachineClient] Track unpublished successfully");
    } catch (error) {
      console.error("[GPUMachineClient] Failed to unpublish track:", error);
      throw error;
    } finally {
      this.publishedTrack = undefined;
    }
  }

  /**
   * Returns the currently published track.
   */
  getPublishedTrack(): MediaStreamTrack | undefined {
    return this.publishedTrack;
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
  // Private Helpers
  // ─────────────────────────────────────────────────────────────────────────────

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
            this.setStatus("connected");
            break;
          case "disconnected":
          case "closed":
            this.setStatus("disconnected");
            break;
          case "failed":
            this.setStatus("error");
            break;
        }
      }
    };

    this.peerConnection.ontrack = (event) => {
      console.debug("[GPUMachineClient] Track received:", event.track.kind);
      const stream = event.streams[0] ?? new MediaStream([event.track]);
      this.emit("trackReceived", event.track, stream);
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
    };

    this.dataChannel.onclose = () => {
      console.debug("[GPUMachineClient] Data channel closed");
    };

    this.dataChannel.onerror = (error) => {
      console.error("[GPUMachineClient] Data channel error:", error);
    };

    this.dataChannel.onmessage = (event) => {
      const rawData = webrtc.parseMessage(event.data) as any;
      console.debug("[GPUMachineClient] Received message:", rawData);

      try {
        // Parse the outer envelope { type: "application"|"runtime", data: ... }
        if (
          rawData?.type === "application" &&
          rawData?.data !== undefined
        ) {
          this.emit("message", rawData.data, "application" as MessageChannel);
        } else if (
          rawData?.type === "runtime" &&
          rawData?.data !== undefined
        ) {
          this.emit("message", rawData.data, "runtime" as MessageChannel);
        } else {
          // Legacy / unknown format – treat as application
          console.warn(
            "[GPUMachineClient] Received message without envelope, treating as application"
          );
          this.emit("message", rawData, "application" as MessageChannel);
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
