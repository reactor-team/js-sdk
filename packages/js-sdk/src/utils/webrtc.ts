/**
 * Stateless WebRTC utility functions for SDP exchange and peer connection management.
 * Uses @roamhq/wrtc for stable Node.js WebRTC support.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

export interface WebRTCConfig {
  iceServers?: RTCIceServer[];
  dataChannelLabel?: string;
}

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

const DEFAULT_DATA_CHANNEL_LABEL = "data";

// ─────────────────────────────────────────────────────────────────────────────
// Peer Connection Creation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a new RTCPeerConnection with the specified configuration.
 */
export function createPeerConnection(config?: WebRTCConfig): RTCPeerConnection {
  return new RTCPeerConnection({
    iceServers: config?.iceServers ?? DEFAULT_ICE_SERVERS,
  });
}

/**
 * Creates a data channel on the peer connection.
 */
export function createDataChannel(
  pc: RTCPeerConnection,
  label?: string
): RTCDataChannel {
  return pc.createDataChannel(label ?? DEFAULT_DATA_CHANNEL_LABEL);
}

// ─────────────────────────────────────────────────────────────────────────────
// SDP Offer/Answer
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates an SDP offer on the peer connection.
 * Waits for ICE gathering to complete before returning.
 */
export async function createOffer(pc: RTCPeerConnection): Promise<string> {
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  await waitForIceGathering(pc);

  const localDescription = pc.localDescription;
  if (!localDescription) {
    throw new Error("Failed to create local description");
  }

  return localDescription.sdp;
}

/**
 * Creates an SDP answer in response to a received offer.
 * Waits for ICE gathering to complete before returning.
 */
export async function createAnswer(
  pc: RTCPeerConnection,
  offer: string
): Promise<string> {
  await setRemoteDescription(pc, offer);

  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  await waitForIceGathering(pc);

  const localDescription = pc.localDescription;
  if (!localDescription) {
    throw new Error("Failed to create local description");
  }

  return localDescription.sdp;
}

/**
 * Sets the remote description on the peer connection.
 */
export async function setRemoteDescription(
  pc: RTCPeerConnection,
  sdp: string
): Promise<void> {
  const sessionDescription = new RTCSessionDescription({
    sdp: sdp,
    type: "answer",
  });
  await pc.setRemoteDescription(sessionDescription);
}

/**
 * Gets the local SDP description from the peer connection.
 */
export function getLocalDescription(pc: RTCPeerConnection): string | undefined {
  const desc = pc.localDescription;
  if (!desc) return undefined;
  return desc.sdp;
}

// ─────────────────────────────────────────────────────────────────────────────
// ICE Handling
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Adds an ICE candidate to the peer connection.
 */
export async function addIceCandidate(
  pc: RTCPeerConnection,
  candidate: RTCIceCandidateInit
): Promise<void> {
  await pc.addIceCandidate(new RTCIceCandidate(candidate));
}

/**
 * Waits for ICE gathering to complete with a timeout.
 */
export function waitForIceGathering(
  pc: RTCPeerConnection,
  timeoutMs: number = 5000
): Promise<void> {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === "complete") {
      resolve();
      return;
    }

    const onGatheringStateChange = () => {
      if (pc.iceGatheringState === "complete") {
        pc.removeEventListener(
          "icegatheringstatechange",
          onGatheringStateChange
        );
        resolve();
      }
    };

    pc.addEventListener("icegatheringstatechange", onGatheringStateChange);

    // Timeout to prevent hanging forever
    setTimeout(() => {
      pc.removeEventListener("icegatheringstatechange", onGatheringStateChange);
      resolve();
    }, timeoutMs);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Track Management
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Adds a track to the peer connection.
 */
export function addTrack(
  pc: RTCPeerConnection,
  track: MediaStreamTrack,
  stream?: MediaStream
): RTCRtpSender {
  const mediaStream = stream ?? new MediaStream([track]);
  return pc.addTrack(track, mediaStream);
}

/**
 * Removes a track from the peer connection by its sender.
 */
export function removeTrack(pc: RTCPeerConnection, sender: RTCRtpSender): void {
  pc.removeTrack(sender);
}

/**
 * Finds the sender for a specific track.
 */
export function findSenderForTrack(
  pc: RTCPeerConnection,
  track: MediaStreamTrack
): RTCRtpSender | undefined {
  return pc.getSenders().find((sender) => sender.track === track);
}

/**
 * Removes all tracks from the peer connection.
 */
export function removeAllTracks(pc: RTCPeerConnection): void {
  for (const sender of pc.getSenders()) {
    pc.removeTrack(sender);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Data Channel Messaging
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sends a message through a data channel.
 */
export function sendMessage(
  channel: RTCDataChannel,
  command: string,
  data: any
): void {
  if (channel.readyState !== "open") {
    throw new Error(`Data channel not open: ${channel.readyState}`);
  }
  const jsonData = typeof data === "string" ? JSON.parse(data) : data;
  const payload = { type: command, data: jsonData };
  channel.send(JSON.stringify(payload));
}

/**
 * Parses a received data channel message, attempting JSON parse.
 */
export function parseMessage(data: unknown): unknown {
  if (typeof data === "string") {
    try {
      return JSON.parse(data);
    } catch {
      return data;
    }
  }
  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Connection State
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Checks if the peer connection is in a connected state.
 */
export function isConnected(pc: RTCPeerConnection): boolean {
  return pc.connectionState === "connected";
}

/**
 * Checks if the peer connection is closed or failed.
 */
export function isClosed(pc: RTCPeerConnection): boolean {
  return pc.connectionState === "closed" || pc.connectionState === "failed";
}

/**
 * Closes the peer connection and cleans up.
 */
export function closePeerConnection(pc: RTCPeerConnection): void {
  pc.close();
}
