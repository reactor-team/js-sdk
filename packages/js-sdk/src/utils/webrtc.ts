// Copyright (c) 2026 Reactor Technologies, Inc. All rights reserved.

/**
 * Stateless WebRTC utility functions for SDP exchange and peer connection management.
 */

import type { IceServersResponse } from "../core/types";
import type { MessageScope, ConnectionStats } from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

export interface WebRTCConfig {
  iceServers: RTCIceServer[];
  dataChannelLabel?: string;
}

const DEFAULT_DATA_CHANNEL_LABEL = "data";

const FORCE_RELAY_MODE = false;

/**
 * Safe cross-browser default for the maximum data channel message size (bytes).
 * Most browsers negotiate 256 KiB via SCTP; we use a slightly lower value to
 * leave room for framing overhead.
 */
const DEFAULT_MAX_MESSAGE_BYTES = 256 * 1024; // 256 KiB

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
 * Creates an SDP offer on the peer connection.
 * No MID munging — track identity is conveyed via track_mapping metadata.
 * @returns The SDP offer string with gathered ICE candidates.
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
 * Transforms ICE servers from the API response to RTCIceServer format.
 * The new API format uses standard WebRTC field names so this is nearly
 * a direct mapping.
 */
export function transformIceServers(
  response: IceServersResponse
): RTCIceServer[] {
  return response.ice_servers.map((server) => {
    const rtcServer: RTCIceServer = {
      urls: server.urls,
    };
    if (server.username) {
      rtcServer.username = server.username;
    }
    if (server.credential) {
      rtcServer.credential = server.credential;
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
export function removeTrack(
  pc: RTCPeerConnection,
  sender: RTCRtpSender
): void {
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
 * @param channel      The RTCDataChannel to send on.
 * @param command      Inner command/message type (e.g. "set_prompt", "requestCapabilities").
 * @param data         Payload for the command.
 * @param scope        Outer envelope scope – defaults to "application".
 * @param maxBytes     Max allowed serialized message size in bytes.
 *                     Defaults to {@link DEFAULT_MAX_MESSAGE_BYTES} (256 KiB).
 *                     Pass the negotiated SCTP limit when available.
 */
export function sendMessage(
  channel: RTCDataChannel,
  command: string,
  data: any,
  scope: MessageScope = "application",
  maxBytes: number = DEFAULT_MAX_MESSAGE_BYTES
): void {
  if (channel.readyState !== "open") {
    throw new Error(`Data channel not open: ${channel.readyState}`);
  }
  const jsonData = typeof data === "string" ? JSON.parse(data) : data;
  const inner = { type: command, data: jsonData };
  const payload = { scope, data: inner };
  const serialized = JSON.stringify(payload);

  const byteLength = new TextEncoder().encode(serialized).byteLength;
  if (byteLength > maxBytes) {
    throw new Error(
      `Data channel message too large: ${byteLength} bytes exceeds ` +
        `limit of ${maxBytes} bytes (command: "${command}")`
    );
  }

  channel.send(serialized);
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
