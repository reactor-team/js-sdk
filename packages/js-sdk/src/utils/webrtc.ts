/**
 * Stateless WebRTC utility functions for SDP exchange and peer connection management.
 */

import type { IceServer, IceServersResponse } from "../core/types";
import type { MessageScope, ConnectionStats } from "../types";
import { sanitize } from "./sdp";

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
  const initial = await pc.createOffer();
  const sdp = sanitize(initial.sdp ?? "");
  await pc.setLocalDescription(
    new RTCSessionDescription({ type: initial.type, sdp })
  );

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
 * The API uses `uris` and a nested `credentials` object; the browser
 * RTCIceServer interface expects `urls`, `username`, and `credential`.
 */
export function transformIceServers(
  response: IceServersResponse
): RTCIceServer[] {
  return response.ice_servers.map((server: IceServer) => {
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
  maxBytes: number = DEFAULT_MAX_MESSAGE_BYTES,
  uploads?: Record<string, object>
): void {
  if (channel.readyState !== "open") {
    throw new Error(`Data channel not open: ${channel.readyState}`);
  }
  const jsonData = typeof data === "string" ? JSON.parse(data) : data;
  const inner: Record<string, any> = { type: command, data: jsonData };
  if (uploads && Object.keys(uploads).length > 0) {
    inner.uploads = uploads;
  }
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
// SDP Direction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the complementary SDP direction from the remote peer's perspective.
 * sendonly ↔ recvonly; sendrecv and inactive are symmetric.
 */
export function complementDirection(
  direction: RTCRtpTransceiverDirection,
): RTCRtpTransceiverDirection {
  if (direction === "sendonly") return "recvonly";
  if (direction === "recvonly") return "sendonly";
  return direction;
}

/**
 * Replaces the direction attribute inside the m= section identified by `mid`.
 *
 * Splits the SDP on m= section boundaries, locates the section containing
 * `a=mid:<mid>`, and substitutes its direction line. All other sections and
 * the session block are returned unchanged.
 */
export function replaceSdpDirectionForMid(
  sdp: string,
  mid: string,
  direction: RTCRtpTransceiverDirection,
): string {
  // Split on the lookahead so each media section retains its leading \r\n.
  const [session, ...mediaSections] = sdp.split(/(?=\r\nm=)/);

  const updated = mediaSections.map((section) => {
    if (!section.includes(`\r\na=mid:${mid}\r\n`)) return section;
    return section.replace(
      /\r\na=(sendonly|recvonly|sendrecv|inactive)\r\n/,
      `\r\na=${direction}\r\n`,
    );
  });

  return session + updated.join("");
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
 * Creates a function with a captured closure over a set of working variables which are
 * used to compute connection stats from aggregate counters over the sample interval.
 *
 * @returns A function that extracts connection stats from an RTCStatsReport.
 */

type RTCStatsExtractor = (report: RTCStatsReport) => ConnectionStats;

export function createRTCStatsExtractor(): RTCStatsExtractor {
  let lastBytesReceived: number | undefined;
  let lastBytesSent: number | undefined;
  let lastCandPairTimestamp: number | undefined;

  return (report: RTCStatsReport) => {
    let candPairId: string | undefined;
    let rtt: number | undefined;
    let availableOutgoingBitrate: number | undefined;
    let availableIncomingBitrate: number | undefined;
    let incomingBitrate: number | undefined;
    let outgoingBitrate: number | undefined;
    let videoInboundRtpId: string | undefined;
    let framesPerSecond: number | undefined;
    let jitter: number | undefined;
    let packetLossRatio: number | undefined;
    let candidateType: string | undefined;

    report.forEach((stat) => {
      if (
        candPairId === undefined &&
        stat.type === "candidate-pair" &&
        stat.state === "succeeded" &&
        stat.nominated
      ) {
        // Extract stats from the first successful candidate-pair found.
        candPairId = stat.id;
        if (stat.currentRoundTripTime !== undefined) {
          rtt = stat.currentRoundTripTime * 1000;
        }
        if (stat.availableOutgoingBitrate !== undefined) {
          availableOutgoingBitrate = stat.availableOutgoingBitrate;
        }
        if (stat.availableIncomingBitrate != undefined) {
          availableIncomingBitrate = stat.availableIncomingBitrate;
        }
        const localCandidate = report.get(stat.localCandidateId);
        if (localCandidate?.candidateType) {
          candidateType = localCandidate.candidateType;
        }
        const timeDiff: number =
          lastCandPairTimestamp !== undefined
            ? stat.timestamp - lastCandPairTimestamp
            : 0;
        if (stat.bytesReceived !== undefined) {
          if (lastBytesReceived !== undefined && timeDiff > 0) {
            incomingBitrate =
              (((stat.bytesReceived - lastBytesReceived) * 8) / timeDiff) *
              1000; /* Bits/Second */
          }
          lastBytesReceived = stat.bytesReceived;
        }
        if (stat.bytesSent !== undefined) {
          if (lastBytesSent !== undefined && timeDiff > 0) {
            outgoingBitrate =
              (((stat.bytesSent - lastBytesSent) * 8) / timeDiff) *
              1000; /* Bits/Second */
          }
          lastBytesSent = stat.bytesSent;
        }
        lastCandPairTimestamp = stat.timestamp;
      }

      // If there is more than one video stream the stats will be from the first one encountered.
      if (
        videoInboundRtpId === undefined &&
        stat.type === "inbound-rtp" &&
        stat.kind === "video"
      ) {
        videoInboundRtpId = stat.id;
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

    return {
      rtt,
      candidateType,
      availableIncomingBitrate,
      availableOutgoingBitrate,
      incomingBitrate,
      outgoingBitrate,
      framesPerSecond,
      packetLossRatio,
      jitter,
      timestamp: Date.now(),
    };
  };
}
