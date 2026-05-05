// Copyright (c) 2026 Reactor Technologies, Inc. All rights reserved.

/**
 * Stateless WebRTC utility functions for SDP exchange and peer connection management.
 */

import type { IceServersResponse } from "../core/types";
import type { MessageScope, ConnectionStats } from "../types";
import type { MediaDescription } from "sdp-transform";
import { parse, parsePayloads, write } from "sdp-transform";

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

/** RTP dynamic payload type range (RFC 3551). */
const DYNAMIC_PT_MIN = 96;
const DYNAMIC_PT_MAX = 127;

function isHevcRtpmapEncoding(name: string): boolean {
  const u = name.toUpperCase();
  return /^(H265|HEVC|HEV1|HVC1)/.test(u);
}

function isHevcMimeType(mimeType: string): boolean {
  const t = mimeType.toLowerCase();
  return (
    t.includes("h265") ||
    t.includes("hevc") ||
    t.includes("hev1") ||
    t.includes("hvc1")
  );
}

/** Fields from RTCRtpCodecCapability used for setCodecPreferences. */
type VideoCodecPreference = {
  mimeType: string;
  clockRate: number;
  sdpFmtpLine?: string;
  channels?: number;
};

function collectVideoCodecCapabilities(): VideoCodecPreference[] {
  const seen = new Set<string>();
  const out: VideoCodecPreference[] = [];
  const add = (codecs: ReadonlyArray<VideoCodecPreference> | undefined) => {
    if (!codecs) return;
    for (const c of codecs) {
      const key = `${c.mimeType}|${c.sdpFmtpLine ?? ""}|${c.clockRate}|${
        c.channels ?? 0
      }`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(c);
    }
  };
  if (typeof RTCRtpSender !== "undefined" && RTCRtpSender.getCapabilities) {
    add(RTCRtpSender.getCapabilities?.("video")?.codecs);
  }
  if (typeof RTCRtpReceiver !== "undefined" && RTCRtpReceiver.getCapabilities) {
    add(RTCRtpReceiver.getCapabilities?.("video")?.codecs);
  }
  return out;
}

function transceiverIsVideo(t: RTCRtpTransceiver): boolean {
  const extended = t as RTCRtpTransceiver & { kind?: string };
  if (extended.kind === "video") return true;
  if (extended.kind === "audio") return false;
  return (
    t.sender.track?.kind === "video" || t.receiver.track?.kind === "video"
  );
}

/**
 * Restricts all video transceivers to H.265/HEVC codecs only (no VP8/VP9/AV1 fallback).
 * Throws if a video transceiver exists but the browser advertises no HEVC codec.
 */
function preferHevcOnlyVideoCodecs(pc: RTCPeerConnection): void {
  if (typeof pc.getTransceivers !== "function") {
    return;
  }
  const videoTransceivers = pc
    .getTransceivers()
    .filter((t) => transceiverIsVideo(t));
  if (videoTransceivers.length === 0) {
    return;
  }
  const hevc = collectVideoCodecCapabilities().filter((c) =>
    isHevcMimeType(c.mimeType)
  );
  if (hevc.length === 0) {
    throw new Error(
      "No H.265/HEVC video codec available; cannot create HEVC-only offer"
    );
  }
  for (const tx of videoTransceivers) {
    if (typeof tx.setCodecPreferences === "function") {
      tx.setCodecPreferences(
        hevc as Parameters<RTCRtpTransceiver["setCodecPreferences"]>[0]
      );
    }
  }
}

function parseFmtpApt(fmtpValue: string): number | null {
  const apt = fmtpValue.match(/(?:^|;)apt=(\d+)/i);
  if (!apt) return null;
  return Number.parseInt(apt[1]!, 10);
}

function mediaMLinePayloadTypes(media: MediaDescription): number[] {
  return parsePayloads(String(media.payloads ?? ""));
}

/**
 * HEVC primary payload types plus rtx entries whose apt= references a kept HEVC PT.
 * Returns null when the section has no HEVC rtpmap.
 */
function collectHevcVideoPayloadSet(
  media: MediaDescription
): Set<number> | null {
  if (media.type !== "video") {
    return null;
  }
  const rtpList = media.rtp ?? [];
  const rtpmap = new Map<number, string>();
  for (const r of rtpList) {
    rtpmap.set(Number(r.payload), String(r.codec));
  }
  const hevcPts = new Set<number>();
  for (const [pt, enc] of rtpmap) {
    if (isHevcRtpmapEncoding(enc)) hevcPts.add(pt);
  }
  if (hevcPts.size === 0) {
    return null;
  }
  let changed = true;
  while (changed) {
    changed = false;
    const before = hevcPts.size;
    for (const f of media.fmtp ?? []) {
      const pt = Number(f.payload);
      const enc = rtpmap.get(pt);
      if (!enc || enc.toLowerCase() !== "rtx") continue;
      const apt = parseFmtpApt(f.config);
      if (apt !== null && hevcPts.has(apt) && !hevcPts.has(pt)) {
        hevcPts.add(pt);
        changed = true;
      }
    }
    if (hevcPts.size === before && !changed) break;
  }
  return hevcPts;
}

function videoSectionNeedsTransform(media: MediaDescription): boolean {
  if (media.type !== "video") {
    return false;
  }
  const mPts = mediaMLinePayloadTypes(media);
  if (mPts.some((p) => p < DYNAMIC_PT_MIN || p > DYNAMIC_PT_MAX)) {
    return true;
  }
  const hevcPts = collectHevcVideoPayloadSet(media);
  if (!hevcPts) {
    return false;
  }
  const orderedKeep = mPts.filter((p) => hevcPts.has(p));
  return (
    orderedKeep.length !== mPts.length || orderedKeep.length !== hevcPts.size
  );
}

/**
 * Keeps only H.265/HEVC payload types and rtx bound to them. No-op if no HEVC rtpmap.
 */
function stripNonHevcVideoMedia(media: MediaDescription): void {
  if (media.type !== "video") {
    return;
  }
  const hevcPts = collectHevcVideoPayloadSet(media);
  if (!hevcPts) {
    return;
  }
  const mPts = mediaMLinePayloadTypes(media);
  const orderedKeep = mPts.filter((p) => hevcPts.has(p));
  if (
    orderedKeep.length === mPts.length &&
    orderedKeep.length === hevcPts.size
  ) {
    return;
  }
  const drop = new Set(mPts.filter((p) => !hevcPts.has(p)));
  media.payloads = orderedKeep.join(" ");
  media.rtp = (media.rtp ?? []).filter((r) => hevcPts.has(Number(r.payload)));
  media.fmtp = (media.fmtp ?? []).filter((f) => hevcPts.has(Number(f.payload)));
  if (media.rtcpFb) {
    media.rtcpFb = media.rtcpFb.filter((f) => {
      if (f.payload === "*") return true;
      return hevcPts.has(Number(f.payload));
    });
  }
  if (media.rtcpFbTrrInt) {
    media.rtcpFbTrrInt = media.rtcpFbTrrInt.filter((f) => {
      if (f.payload === "*") return true;
      return hevcPts.has(Number(f.payload));
    });
  }
  if (media.imageattrs) {
    media.imageattrs = media.imageattrs.filter((ia) => {
      if (ia.pt === "*") return true;
      return hevcPts.has(Number(ia.pt));
    });
  }
  if (media.invalid) {
    media.invalid = media.invalid.filter((inv) => {
      const v = inv.value;
      const rtpM = /^rtpmap:(\d+)/i.exec(v);
      if (rtpM) return !drop.has(Number(rtpM[1]));
      const fmtpM = /^fmtp:(\d+)/i.exec(v);
      if (fmtpM) return !drop.has(Number(fmtpM[1]));
      const rfbM = /^rtcp-fb:(\d+)/i.exec(v);
      if (rfbM) return !drop.has(Number(rfbM[1]));
      return true;
    });
  }
}

/**
 * Picks `count` distinct payload types in [96, 127] that are not in `forbidden`.
 */
function allocateDynamicPayloadTypes(
  count: number,
  forbidden: ReadonlySet<number>
): number[] {
  if (count > DYNAMIC_PT_MAX - DYNAMIC_PT_MIN + 1) {
    throw new Error(
      "Too many video payload types to map into the dynamic PT range [96,127]"
    );
  }
  const out: number[] = [];
  for (
    let p = DYNAMIC_PT_MIN;
    p <= DYNAMIC_PT_MAX && out.length < count;
    p++
  ) {
    if (!forbidden.has(p)) out.push(p);
  }
  if (out.length < count) {
    throw new Error(
      "Cannot allocate enough unique payload types in [96,127] without collision"
    );
  }
  return out;
}

function remapFmtpConfigForPayloadMap(
  config: string,
  remap: Map<number, number>
): string {
  let s = config;
  const pairs = [...remap.entries()].sort((a, b) => b[0] - a[0]);
  for (const [oldP, newP] of pairs) {
    if (oldP === newP) continue;
    s = s.replace(
      new RegExp(`apt=${oldP}([^0-9]|$)`, "g"),
      `apt=${newP}$1`
    );
  }
  return s;
}

/**
 * Remaps video payload types into [96, 127], avoiding `forbidden`.
 * No-op if every payload type is already in the dynamic range.
 */
function remapVideoPayloadTypesMedia(
  media: MediaDescription,
  forbidden: ReadonlySet<number>
): void {
  if (media.type !== "video") {
    return;
  }
  const oldPts = mediaMLinePayloadTypes(media);
  if (oldPts.length === 0) {
    return;
  }
  if (
    oldPts.every(
      (p) => p >= DYNAMIC_PT_MIN && p <= DYNAMIC_PT_MAX
    )
  ) {
    return;
  }
  const newPts = allocateDynamicPayloadTypes(oldPts.length, forbidden);
  const remap = new Map<number, number>();
  oldPts.forEach((p, i) => remap.set(p, newPts[i]!));

  media.payloads = oldPts.map((p) => String(remap.get(p)!)).join(" ");

  for (const r of media.rtp ?? []) {
    const oldP = Number(r.payload);
    const np = remap.get(oldP);
    if (np !== undefined) r.payload = np;
  }
  for (const f of media.fmtp ?? []) {
    const oldP = Number(f.payload);
    const np = remap.get(oldP);
    if (np !== undefined) {
      f.payload = np;
      f.config = remapFmtpConfigForPayloadMap(f.config, remap);
    } else {
      f.config = remapFmtpConfigForPayloadMap(f.config, remap);
    }
  }
  for (const f of media.rtcpFb ?? []) {
    if (f.payload === "*") continue;
    const oldP = Number(f.payload);
    const np = remap.get(oldP);
    if (np !== undefined) f.payload = np;
  }
  for (const f of media.rtcpFbTrrInt ?? []) {
    if (f.payload === "*") continue;
    const oldP = Number(f.payload);
    const np = remap.get(oldP);
    if (np !== undefined) f.payload = np;
  }
  for (const ia of media.imageattrs ?? []) {
    if (ia.pt === "*") continue;
    const oldP = Number(ia.pt);
    const np = remap.get(oldP);
    if (np !== undefined) ia.pt = np;
  }
  for (const inv of media.invalid ?? []) {
    let s = inv.value;
    const pairs = [...remap.entries()].sort((a, b) => b[0] - a[0]);
    for (const [oldP, newP] of pairs) {
      if (oldP === newP) continue;
      s = s.replace(
        new RegExp(`^rtpmap:${oldP}([\\s/])`, "i"),
        `rtpmap:${newP}$1`
      );
      s = s.replace(
        new RegExp(`^fmtp:${oldP}(\\s)`, "i"),
        `fmtp:${newP}$1`
      );
      s = s.replace(
        new RegExp(`^rtcp-fb:${oldP}(\\s)`, "i"),
        `rtcp-fb:${newP}$1`
      );
      s = s.replace(
        new RegExp(`apt=${oldP}([^0-9]|$)`, "g"),
        `apt=${newP}$1`
      );
    }
    inv.value = s;
  }
}

/**
 * Post-processes an SDP offer: video is H.265/HEVC-only when HEVC rtpmaps are present,
 * and video payload types are remapped into [96,127] when any would fall outside.
 * Remapped values never collide with payload types already used on other m-lines
 * (or on video m-lines processed earlier in document order).
 *
 * When no such change applies, returns the input string unchanged (avoids sdp-transform
 * normalizing session fields such as an implicit `s=` line).
 */
export function transformOfferSdpHevcDynamicPts(sdp: string): string {
  const session = parse(sdp);
  if (!session.media.some(videoSectionNeedsTransform)) {
    return sdp;
  }

  const forbidden = new Set<number>();
  for (const media of session.media) {
    if (media.type !== "video") {
      for (const p of mediaMLinePayloadTypes(media)) {
        forbidden.add(p);
      }
    }
  }

  for (const media of session.media) {
    if (media.type !== "video") {
      continue;
    }
    stripNonHevcVideoMedia(media);
    remapVideoPayloadTypesMedia(media, forbidden);
    for (const p of mediaMLinePayloadTypes(media)) {
      forbidden.add(p);
    }
  }

  return write(session);
}

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
  preferHevcOnlyVideoCodecs(pc);
  const initial = await pc.createOffer();
  const sdp = transformOfferSdpHevcDynamicPts(initial.sdp ?? "");
  await pc.setLocalDescription(
    new RTCSessionDescription({ type: initial.type, sdp })
  );
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
 * The API uses `uris` and a nested `credentials` object; the browser
 * RTCIceServer interface expects `urls`, `username`, and `credential`.
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
    report.forEach((stat, id) => {
      if (id === localCandidateId && stat.type === "local-candidate") {
        const ct = (stat as RTCStats & { candidateType?: string })
          .candidateType;
        if (ct) candidateType = ct;
      }
    });
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
