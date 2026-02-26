/**
 * Stateless WebRTC utility functions for SDP exchange and peer connection management.
 * Uses @roamhq/wrtc for stable Node.js WebRTC support.
 */

import { IceServersResponse } from "../core/types";
import type { MessageScope, ConnectionStats } from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

export interface WebRTCConfig {
  iceServers: RTCIceServer[];
  dataChannelLabel?: string;
}

const DEFAULT_DATA_CHANNEL_LABEL = "data";

// Force relay mode for testing TURN servers - set to true to force all traffic through TURN
const FORCE_RELAY_MODE = false;

// ─────────────────────────────────────────────────────────────────────────────
// Peer Connection Creation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a new RTCPeerConnection with the specified configuration.
 * @param config WebRTC configuration with required iceServers
 */
export function createPeerConnection(config: WebRTCConfig): RTCPeerConnection {
  return new RTCPeerConnection({
    iceServers: config.iceServers,
    iceTransportPolicy: FORCE_RELAY_MODE ? "relay" : "all",
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
 * Rewrites the `a=mid:` values in an SDP string so that each media
 * transceiver uses the corresponding track name as its MID.
 *
 * The data-channel `m=application` section is left untouched.
 * The `a=group:BUNDLE` line is updated to reflect the new MIDs.
 */
export function rewriteMids(sdp: string, trackNames: string[]): string {
  const lines = sdp.split("\r\n");
  let mediaIdx = 0;
  const replacements = new Map<string, string>();
  let inApplication = false;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("m=")) {
      inApplication = lines[i].startsWith("m=application");
    }
    if (!inApplication && lines[i].startsWith("a=mid:")) {
      const oldMid = lines[i].substring("a=mid:".length);
      if (mediaIdx < trackNames.length) {
        const newMid = trackNames[mediaIdx];
        replacements.set(oldMid, newMid);
        lines[i] = `a=mid:${newMid}`;
        mediaIdx++;
      }
    }
  }

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("a=group:BUNDLE ")) {
      const parts = lines[i].split(" ");
      for (let j = 1; j < parts.length; j++) {
        const replacement = replacements.get(parts[j]);
        if (replacement !== undefined) {
          parts[j] = replacement;
        }
      }
      lines[i] = parts.join(" ");
      break;
    }
  }

  return lines.join("\r\n");
}

/**
 * Creates an SDP offer on the peer connection.
 *
 * When `trackNames` is provided, the media MIDs in the SDP are
 * rewritten to use those names before `setLocalDescription` is called.
 * This allows the remote side to identify transceivers by name rather
 * than by positional index.
 *
 * Waits for ICE gathering to complete before returning.
 */
export async function createOffer(
  pc: RTCPeerConnection,
  trackNames?: string[]
): Promise<string> {
  const offer = await pc.createOffer();

  if (trackNames && trackNames.length > 0 && offer.sdp) {
    const munged = rewriteMids(offer.sdp, trackNames);
    const mungedOffer = new RTCSessionDescription({ type: "offer", sdp: munged });
    await pc.setLocalDescription(mungedOffer);
  } else {
    await pc.setLocalDescription(offer);
  }

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
 * Transforms ICE servers from the coordinator API format to RTCIceServer format.
 * @param response The parsed IceServersResponse from the coordinator
 * @returns Array of RTCIceServer objects for WebRTC peer connection configuration
 */
export function transformIceServers(
  response: IceServersResponse
): RTCIceServer[] {
  return response.ice_servers.map((server) => {
    const rtcServer: RTCIceServer = {
      urls: server.uris,
    };
    if (server.credentials) {
      rtcServer.username = server.credentials.username;
      rtcServer.credential = server.credentials.password;
    }
    return rtcServer;
  });
}

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
 * Sends a message through a data channel wrapped in the two-level envelope.
 *
 * Wire format:
 *   { scope: "application"|"runtime", data: { type: <command>, data: <payload> } }
 *
 * @param channel     The RTCDataChannel to send on.
 * @param command     Inner command/message type (e.g. "set_prompt", "requestCapabilities").
 * @param data        Payload for the command.
 * @param scope       Outer envelope scope – defaults to "application".
 */
export function sendMessage(
  channel: RTCDataChannel,
  command: string,
  data: any,
  scope: MessageScope = "application"
): void {
  if (channel.readyState !== "open") {
    throw new Error(`Data channel not open: ${channel.readyState}`);
  }
  const jsonData = typeof data === "string" ? JSON.parse(data) : data;
  const inner = { type: command, data: jsonData };
  const payload = { scope, data: inner };
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

// ─────────────────────────────────────────────────────────────────────────────
// Stats Extraction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extracts ConnectionStats from an RTCStatsReport.
 * Reads candidate-pair, local-candidate, and inbound-rtp (video) reports.
 */
export function extractConnectionStats(
  report: RTCStatsReport
): ConnectionStats {
  let rtt: number | undefined;
  let availableOutgoingBitrate: number | undefined;
  let localCandidateId: string | undefined;
  let framesPerSecond: number | undefined;
  let jitter: number | undefined;
  let packetLossRatio: number | undefined;

  report.forEach((stat) => {
    if (stat.type === "candidate-pair" && stat.state === "succeeded") {
      if (stat.currentRoundTripTime !== undefined) {
        rtt = stat.currentRoundTripTime * 1000;
      }
      if (stat.availableOutgoingBitrate !== undefined) {
        availableOutgoingBitrate = stat.availableOutgoingBitrate;
      }
      localCandidateId = stat.localCandidateId;
    }

    if (stat.type === "inbound-rtp" && stat.kind === "video") {
      if (stat.framesPerSecond !== undefined) {
        framesPerSecond = stat.framesPerSecond;
      }
      if (stat.jitter !== undefined) {
        jitter = stat.jitter;
      }
      if (
        stat.packetsReceived !== undefined &&
        stat.packetsLost !== undefined &&
        stat.packetsReceived + stat.packetsLost > 0
      ) {
        packetLossRatio =
          stat.packetsLost / (stat.packetsReceived + stat.packetsLost);
      }
    }
  });

  let candidateType: string | undefined;
  if (localCandidateId) {
    const localCandidate = report.get(localCandidateId);
    if (localCandidate?.candidateType) {
      candidateType = localCandidate.candidateType;
    }
  }

  return {
    rtt,
    candidateType,
    availableOutgoingBitrate,
    framesPerSecond,
    packetLossRatio,
    jitter,
    timestamp: Date.now(),
  };
}
