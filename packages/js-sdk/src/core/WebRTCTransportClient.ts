/**
 * WebRTC implementation of the TransportClient interface.
 *
 * Handles the full WebRTC lifecycle: signaling (ICE servers, SDP exchange
 * via the transport REST endpoints), RTCPeerConnection management, data
 * channel messaging, track publishing, and stats collection.
 */

import * as webrtc from "../utils/webrtc";
import type {
  TransportClient,
  TransportClientConfig,
  TransportStatus,
  TransportEvent,
} from "./TransportClient";
import type { MessageScope, ConnectionStats } from "../types";
import { AbortError } from "../types";
import { type JwtResolver, normalizeJwtSource } from "./auth";
import {
  type TrackCapability,
  type TrackMappingEntry,
  type WebRTCSdpOfferRequest,
  type WebRTCSdpAnswerResponse,
  type IceCandidate,
  type IceCandidatesRequest,
  IceServersResponseSchema,
  WebRTCSdpOfferResponseSchema,
  WebRTCSdpAnswerResponseSchema,
  REACTOR_WEBRTC_VERSION,
  REACTOR_SDK_VERSION,
  REACTOR_SDK_TYPE,
  WEBRTC_VERSION_HEADER,
  VERSION_ERROR_CODES,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

type EventHandler = (...args: any[]) => void;

const PING_INTERVAL_MS = 5_000;
const STATS_INTERVAL_MS = 2_000;

const INITIAL_BACKOFF_MS = 200;
const MAX_BACKOFF_MS = 15_000;
const BACKOFF_MULTIPLIER = 2;
const DEFAULT_MAX_POLL_ATTEMPTS = 6;

/**
 * Debounce window for coalescing trickle ICE candidates into a single
 * POST. Browsers fire {@link RTCPeerConnection.onicecandidate} in bursts
 * (host candidates land together, then srflx, then relay); buffering for
 * a few tens of milliseconds collapses each burst into one request
 * without adding noticeable latency to the connection. The
 * gathering-complete event ({@link RTCPeerConnectionIceEvent.candidate}
 * === ``null``) bypasses the debounce and flushes immediately.
 */
const ICE_CANDIDATE_BATCH_WINDOW_MS = 25;

export interface WebRTCTransportConfig extends TransportClientConfig {
  webrtcVersion?: string;
  maxPollAttempts?: number;
}

/**
 * WebRTC-specific timing breakdown of the transport connection.
 * Recorded once per connection and accessible via {@link WebRTCTransportClient.getTransportTimings}.
 */
export interface WebRTCTransportTimings {
  protocol: "webrtc";
  /** Time spent polling for the SDP answer (POST offer → GET answer 200) */
  sdpPollingMs: number;
  /** Number of SDP poll requests made (1 = answered on first try) */
  sdpPollingAttempts: number;
  /** setRemoteDescription → RTCPeerConnection connectionState "connected" */
  iceNegotiationMs: number;
  /** setRemoteDescription → RTCDataChannel "open" */
  dataChannelMs: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Transceiver bookkeeping
// ─────────────────────────────────────────────────────────────────────────────

interface TransceiverEntry {
  name: string;
  kind: "audio" | "video";
  direction: RTCRtpTransceiverDirection;
  transceiver?: RTCRtpTransceiver;
}

// ─────────────────────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────────────────────

export class WebRTCTransportClient implements TransportClient {
  private eventListeners: Map<TransportEvent, Set<EventHandler>> = new Map();
  private peerConnection: RTCPeerConnection | undefined;
  private dataChannel: RTCDataChannel | undefined;
  private controlChannel: RTCDataChannel | undefined;
  private status: TransportStatus = "disconnected";
  private pingInterval: ReturnType<typeof setInterval> | undefined;
  private statsInterval: ReturnType<typeof setInterval> | undefined;
  private stats: ConnectionStats | undefined;

  private transceiverMap: Map<string, TransceiverEntry> = new Map();
  private publishedTracks: Map<string, MediaStreamTrack> = new Map();
  // Serializes local pause/resume renegotiations so they never overlap — see
  // enqueueDirectionChange.
  private directionChangeChain: Promise<void> = Promise.resolve();
  private pendingControlRequests = new Map<string, {
    resolve: () => void;
    reject: (err: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  }>();
  private controlRequestCounter = 0;
  private peerConnected = false;
  private dataChannelOpen = false;
  private controlChannelOpen = false;

  private iceStartTime?: number;
  private iceNegotiationMs?: number;
  private dataChannelMs?: number;
  private sdpPollingMs?: number;
  private sdpPollingAttempts?: number;

  private connectionId: number | undefined;
  private pendingSdpOffer?: string;
  private pendingTrackMapping?: TrackMappingEntry[];
  private cachedIceServers?: Promise<RTCIceServer[]>;

  // Trickle ICE batching
  private pendingIceCandidates: IceCandidate[] = [];
  private iceCandidateFlushTimer?: ReturnType<typeof setTimeout>;

  private readonly baseUrl: string;
  private readonly sessionId: string;
  private readonly resolveJwt: JwtResolver;
  webrtcVersion: string;
  private readonly maxPollAttempts: number;
  private abortController: AbortController;

  constructor(config: WebRTCTransportConfig) {
    this.baseUrl = config.baseUrl;
    this.sessionId = config.sessionId;
    this.resolveJwt = normalizeJwtSource(config.jwtToken);
    this.webrtcVersion = config.webrtcVersion ?? REACTOR_WEBRTC_VERSION;
    this.maxPollAttempts = config.maxPollAttempts ?? DEFAULT_MAX_POLL_ATTEMPTS;
    this.abortController = new AbortController();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Event Emitter
  // ─────────────────────────────────────────────────────────────────────────

  on(event: TransportEvent, handler: EventHandler): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(handler);
  }

  off(event: TransportEvent, handler: EventHandler): void {
    this.eventListeners.get(event)?.delete(handler);
  }

  private emit(event: TransportEvent, ...args: unknown[]): void {
    this.eventListeners.get(event)?.forEach((handler) => handler(...args));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // HTTP Helpers
  // ─────────────────────────────────────────────────────────────────────────

  private get signal(): AbortSignal {
    return this.abortController.signal;
  }

  private get transportBaseUrl(): string {
    return `${this.baseUrl}/sessions/${this.sessionId}/transport/webrtc`;
  }

  // Async so the JWT resolver can fetch a fresh token if needed; an
  // empty token suppresses the `Authorization` header.
  private async getHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      [WEBRTC_VERSION_HEADER]: this.webrtcVersion,
    };
    const jwt = await this.resolveJwt();
    if (jwt) {
      headers.Authorization = `Bearer ${jwt}`;
    }
    return headers;
  }

  private async checkVersionMismatch(response: Response): Promise<void> {
    if (response.status === 426) {
      const msg =
        `Client WebRTC version (${this.webrtcVersion}) is too old. ` +
        `Server requires a newer version. Please upgrade @reactor-team/js-sdk.`;
      console.error(`[WebRTCTransport]`, msg);
      throw new Error(`${VERSION_ERROR_CODES[426]}: ${msg}`);
    }

    if (response.status === 501) {
      const msg =
        `Server does not support WebRTC version ${this.webrtcVersion}. ` +
        `The server may need to be updated.`;
      console.error(`[WebRTCTransport]`, msg);
      throw new Error(`${VERSION_ERROR_CODES[501]}: ${msg}`);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const { signal } = this;
      if (signal.aborted) {
        reject(new AbortError("Sleep aborted"));
        return;
      }
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", onAbort);
        resolve();
      }, ms);
      const onAbort = () => {
        clearTimeout(timer);
        reject(new AbortError("Sleep aborted"));
      };
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Transport Signaling (HTTP)
  // ─────────────────────────────────────────────────────────────────────────

  private async fetchIceServers(): Promise<RTCIceServer[]> {
    console.debug("[WebRTCTransport] Fetching ICE servers...");

    const response = await fetch(`${this.transportBaseUrl}/ice_servers`, {
      method: "GET",
      headers: await this.getHeaders(),
      signal: this.signal,
    });

    await this.checkVersionMismatch(response);

    if (!response.ok) {
      throw new Error(`Failed to fetch ICE servers: ${response.status}`);
    }

    const data = await response.json();
    const parsed = IceServersResponseSchema.parse(data);
    const iceServers = webrtc.transformIceServers(parsed);

    console.debug("[WebRTCTransport] Received ICE servers:", iceServers.length);
    return iceServers;
  }

  private async registerConnection(): Promise<number> {
    console.debug("[WebRTCTransport] Registering connection...");

    const response = await fetch(`${this.transportBaseUrl}/connections`, {
      method: "POST",
      headers: await this.getHeaders(),
      signal: this.signal,
    });

    await this.checkVersionMismatch(response);

    if (response.status !== 201) {
      const errorText = await response.text();
      throw new Error(`Failed to register connection: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    const connectionId: number = data.connection_id;
    console.debug(`[WebRTCTransport] Connection registered: id=${connectionId}`);
    return connectionId;
  }

  private async sendSdpOffer(
    connectionId: number,
    sdpOffer: string,
    trackMapping: TrackMappingEntry[],
    reconnect: boolean = false
  ): Promise<void> {
    const method = reconnect ? "PUT" : "POST";
    console.debug(
      `[WebRTCTransport] Sending SDP offer (${method}) connection=${connectionId}`
    );

    const requestBody: WebRTCSdpOfferRequest = {
      sdp_offer: sdpOffer,
      client_info: {
        sdk_version: REACTOR_SDK_VERSION,
        sdk_type: REACTOR_SDK_TYPE,
      },
      track_mapping: trackMapping,
    };

    const response = await fetch(
      `${this.transportBaseUrl}/connections/${connectionId}/sdp_params`,
      {
        method,
        headers: {
          ...(await this.getHeaders()),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: this.signal,
      }
    );

    await this.checkVersionMismatch(response);

    if (response.status !== 202) {
      const errorText = await response.text();
      throw new Error(`Failed to send SDP offer: ${response.status} ${errorText}`);
    }

    console.debug("[WebRTCTransport] SDP offer accepted (202)");
  }

  private async sendIceCandidates(
    candidates: IceCandidate[],
    is_final: boolean
  ): Promise<void> {
    if (this.connectionId === undefined) {
      console.debug("[WebRTCTransport] ICE candidates dropped: no active connection");
      return;
    }

    console.debug(
      `[WebRTCTransport] Sending ICE candidates (count=${candidates.length}, is_final=${is_final})`
    );

    const requestBody: IceCandidatesRequest = {
      candidates,
      is_final,
      client_info: {
        sdk_version: REACTOR_SDK_VERSION,
        sdk_type: REACTOR_SDK_TYPE,
      },
    };

    const response = await fetch(
      `${this.transportBaseUrl}/connections/${this.connectionId}/ice_candidates`,
      {
        method: "POST",
        headers: {
          ...(await this.getHeaders()),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: this.signal,
      }
    );

    await this.checkVersionMismatch(response);

    if (response.status !== 202) {
      const errorText = await response.text();
      throw new Error(`Failed to send ICE candidates: ${response.status} ${errorText}`);
    }

    console.debug("[WebRTCTransport] ICE candidates accepted (202)");
  }

  /**
   * Drain the pending ICE candidates buffer and POST them as a single
   * batch. Called either by the debounce timer (collected candidates so
   * far) or directly by the gathering-complete handler (with
   * ``isFinal=true``).
   *
   * Errors are logged at debug level — trickle ICE is fire-and-forget,
   * and the connection can still succeed even if some candidate batches
   * are lost (host/srflx candidates from the other side are usually
   * sufficient).
   */
  private flushPendingIceCandidates(isFinal: boolean): void {
    if (this.iceCandidateFlushTimer !== undefined) {
      clearTimeout(this.iceCandidateFlushTimer);
      this.iceCandidateFlushTimer = undefined;
    }

    const batch = this.pendingIceCandidates;
    this.pendingIceCandidates = [];

    if (batch.length === 0 && !isFinal) {
      return;
    }

    this.sendIceCandidates(batch, isFinal).catch((err) => {
      console.debug("[WebRTCTransport] ICE candidate flush failed:", err);
    });
  }

  private cancelPendingIceCandidates(): void {
    if (this.iceCandidateFlushTimer !== undefined) {
      clearTimeout(this.iceCandidateFlushTimer);
      this.iceCandidateFlushTimer = undefined;
    }
    this.pendingIceCandidates = [];
  }

  private async pollSdpAnswer(
    connectionId: number
  ): Promise<WebRTCSdpAnswerResponse> {
    console.debug("[WebRTCTransport] Polling for SDP answer...");

    const pollUrl = `${this.transportBaseUrl}/connections/${connectionId}/sdp_params`;

    const pollStart = performance.now();
    let backoffMs = INITIAL_BACKOFF_MS;
    let attempt = 0;

    while (true) {
      if (this.signal.aborted) {
        throw new AbortError("SDP polling aborted");
      }

      if (attempt >= this.maxPollAttempts) {
        throw new Error(
          `SDP polling exceeded maximum attempts (${this.maxPollAttempts})`
        );
      }

      attempt++;
      console.debug(
        `[WebRTCTransport] SDP poll attempt ${attempt}/${this.maxPollAttempts}`
      );

      const response = await fetch(pollUrl, {
        method: "GET",
        headers: await this.getHeaders(),
        signal: this.signal,
      });

      await this.checkVersionMismatch(response);

      if (response.status === 200) {
        const data = await response.json();
        const parsed = WebRTCSdpAnswerResponseSchema.parse(data);
        this.sdpPollingMs = performance.now() - pollStart;
        this.sdpPollingAttempts = attempt;
        console.debug(
          `[WebRTCTransport] Received SDP answer via polling (${attempt} attempt(s), ${this.sdpPollingMs.toFixed(0)}ms)`
        );
        return parsed;
      }

      if (response.status === 202) {
        console.debug(
          `[WebRTCTransport] SDP answer pending, retrying in ${backoffMs}ms...`
        );
        await this.sleep(backoffMs);
        backoffMs = Math.min(backoffMs * BACKOFF_MULTIPLIER, MAX_BACKOFF_MS);
        continue;
      }

      const errorText = await response.text();
      throw new Error(
        `Failed to poll SDP answer: ${response.status} ${errorText}`
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Connection Lifecycle
  // ─────────────────────────────────────────────────────────────────────────

  async warmup(): Promise<void> {
    if (!this.cachedIceServers) {
      this.cachedIceServers = this.fetchIceServers();
      this.cachedIceServers.catch(() => {});
    }
    await this.cachedIceServers;
  }

  async prepare(tracks: TrackCapability[]): Promise<void> {
    this.setStatus("connecting");
    this.resetTransportTimings();

    this.stopPing();
    this.stopStatsPolling();
    this.cancelPendingIceCandidates();

    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = undefined;
    }
    if (this.controlChannel) {
      this.controlChannel.close();
      this.controlChannel = undefined;
    }
    if (this.peerConnection) {
      webrtc.closePeerConnection(this.peerConnection);
      this.peerConnection = undefined;
    }
    this.peerConnected = false;
    this.dataChannelOpen = false;
    this.controlChannelOpen = false;

    const iceServers = this.cachedIceServers
      ? await this.cachedIceServers
      : await this.fetchIceServers();
    this.cachedIceServers = undefined;

    this.peerConnection = webrtc.createPeerConnection({ iceServers });
    this.setupPeerConnectionHandlers();

    this.dataChannel = webrtc.createDataChannel(this.peerConnection);
    this.setupDataChannelHandlers();

    this.controlChannel = webrtc.createDataChannel(this.peerConnection, "control");
    this.setupControlChannelHandlers();

    this.transceiverMap.clear();
    for (const track of tracks) {
      const transceiver = this.peerConnection.addTransceiver(track.kind, {
        direction: track.direction,
      });
      this.transceiverMap.set(track.name, {
        name: track.name,
        kind: track.kind,
        direction: track.direction,
        transceiver,
      });
      console.debug(
        `[WebRTCTransport] Transceiver added: "${track.name}" (${track.kind}, ${track.direction})`
      );
    }

    this.pendingSdpOffer = await webrtc.createOffer(this.peerConnection);
    this.pendingTrackMapping = this.buildTrackMapping(tracks);

    console.debug("[WebRTCTransport] SDP offer prepared");
  }

  async connect(reconnect: boolean = false): Promise<void> {
    if (!this.pendingSdpOffer || !this.pendingTrackMapping) {
      throw new Error(
        "[WebRTCTransport] No prepared connection. Call prepare() first."
      );
    }

    const sdpOffer = this.pendingSdpOffer;
    const trackMapping = this.pendingTrackMapping;
    this.pendingSdpOffer = undefined;
    this.pendingTrackMapping = undefined;

    // For a fresh connection, register to obtain an integer connection id.
    // For a reconnect, reuse the existing id (PUT replaces the SDP on the same slot).
    if (!reconnect || this.connectionId === undefined) {
      this.connectionId = await this.registerConnection();
    }

    await this.sendSdpOffer(this.connectionId, sdpOffer, trackMapping, reconnect);

    const answerResponse = await this.pollSdpAnswer(this.connectionId);

    this.iceStartTime = performance.now();
    await webrtc.setRemoteDescription(
      this.peerConnection!,
      answerResponse.sdp_answer
    );
    console.debug("[WebRTCTransport] Remote description set");
  }

  async disconnect(): Promise<void> {
    this.stopPing();
    this.stopStatsPolling();
    this.cancelPendingIceCandidates();

    for (const name of Array.from(this.publishedTracks.keys())) {
      await this.unpublishTrack(name);
    }

    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = undefined;
    }

    if (this.controlChannel) {
      this.controlChannel.close();
      this.controlChannel = undefined;
    }

    if (this.peerConnection) {
      webrtc.closePeerConnection(this.peerConnection);
      this.peerConnection = undefined;
    }

    for (const [, pending] of this.pendingControlRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error("[WebRTCTransport] Disconnected while waiting for response"));
    }
    this.pendingControlRequests.clear();

    this.connectionId = undefined;
    this.transceiverMap.clear();
    this.peerConnected = false;
    this.dataChannelOpen = false;
    this.controlChannelOpen = false;
    this.resetTransportTimings();
    this.setStatus("disconnected");
    console.debug("[WebRTCTransport] Disconnected");
  }

  abort(): void {
    this.abortController.abort();
    this.abortController = new AbortController();
  }

  getStatus(): TransportStatus {
    return this.status;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Track Mapping
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Builds the track_mapping array from capabilities + transceiver MIDs.
   * Must be called after createOffer + setLocalDescription so that
   * transceiver.mid is assigned.
   */
  private buildTrackMapping(tracks: TrackCapability[]): TrackMappingEntry[] {
    return tracks.map((track) => {
      const entry = this.transceiverMap.get(track.name);
      const mid = entry?.transceiver?.mid;
      if (mid == null) {
        throw new Error(
          `Cannot build track mapping: transceiver "${track.name}" has no MID. ` +
            `Was createOffer() called?`
        );
      }
      return {
        mid,
        name: track.name,
        kind: track.kind,
        direction: track.direction,
      };
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Messaging
  // ─────────────────────────────────────────────────────────────────────────

  private get maxMessageBytes(): number | undefined {
    return this.peerConnection?.sctp?.maxMessageSize ?? undefined;
  }

  sendCommand(
    command: string,
    data: any,
    scope: MessageScope = "application",
    uploads?: Record<string, object>
  ): void {
    if (!this.dataChannel) {
      throw new Error("[WebRTCTransport] Data channel not available");
    }

    try {
      webrtc.sendMessage(
        this.dataChannel,
        command,
        data,
        scope,
        this.maxMessageBytes,
        uploads
      );
    } catch (error) {
      console.warn("[WebRTCTransport] Failed to send message:", error);
    }
  }

  private sendControlMessage(command: string, data: any, reqId?: string): void {
    if (!this.controlChannel) {
      console.warn("[WebRTCTransport] Control channel not available");
      return;
    }
    try {
      if (this.controlChannel.readyState !== "open") {
        throw new Error(`Control channel not open: ${this.controlChannel.readyState}`);
      }
      this.controlChannel.send(JSON.stringify({ type: "notification", event: command, data }));
    } catch (error) {
      console.warn("[WebRTCTransport] Failed to send control message:", error);
    }
  }

  private sendControlRequest(method: string, data: any, timeoutMs: number = 10_000): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const requestId = `ctrl_${++this.controlRequestCounter}`;
      const timeout = setTimeout(() => {
        this.pendingControlRequests.delete(requestId);
        reject(new Error(`[WebRTCTransport] Request "${method}" timed out`));
      }, timeoutMs);
      this.pendingControlRequests.set(requestId, { resolve, reject, timeout });
      try {
        if (!this.controlChannel || this.controlChannel.readyState !== "open") {
          throw new Error("Control channel not available");
        }
        this.controlChannel.send(
          JSON.stringify({ type: "request", method, request_id: requestId, data })
        );
      } catch (error) {
        clearTimeout(timeout);
        this.pendingControlRequests.delete(requestId);
        reject(error);
      }
    });
  }

  pauseTrack(name: string): void {
    const entry = this.transceiverMap.get(name);
    if (entry?.transceiver?.mid) {
      entry.transceiver.direction = "inactive";
      this.enqueueDirectionChange(entry.transceiver.mid, "inactive").catch((e) => {
        console.warn("[WebRTCTransport] Failed to apply pause direction:", e);
      });
    }
    this.sendControlMessage("pause_track", { name });
  }

  resumeTrack(name: string): void {
    if (this.status !== "connected") {
      console.log("[WebRTCTransport] Cannot resume track", name, " - not connected, skipping");
      return;
    }

    const entry = this.transceiverMap.get(name);
    if (entry?.transceiver?.mid) {
      entry.transceiver.direction = entry.direction;
      this.enqueueDirectionChange(entry.transceiver.mid, entry.direction).catch((e) => {
        console.warn("[WebRTCTransport] Failed to apply resume direction:", e);
      });
    }
    this.sendControlMessage("resume_track", { name });
  }

  /**
   * Serializes local pause/resume renegotiations. Each direction change munges
   * the local offer + remote answer and re-applies both; auto-resume fires one
   * per recvonly track (and re-fires on every `trackReceived`), so several land
   * at once. Run concurrently they read each other's half-applied SDP and drop
   * `setRemoteDescription()` into the `stable` state — the
   * "Called in wrong state: stable" error — leaving the track flagged resumed
   * but never actually renegotiated, so no frames arrive. Chaining keeps each
   * offer/answer pair atomic; a failure is swallowed on the chain so it can't
   * wedge later changes.
   */
  private enqueueDirectionChange(
    mid: string,
    localDirection: RTCRtpTransceiverDirection,
  ): Promise<void> {
    const run = this.directionChangeChain
      .catch(() => {})
      .then(() => this.applyDirectionLocally(mid, localDirection));
    this.directionChangeChain = run.catch(() => {});
    return run;
  }

  private async applyDirectionLocally(
    mid: string,
    localDirection: RTCRtpTransceiverDirection,
  ): Promise<void> {
    const pc = this.peerConnection;
    if (!pc) return;

    // Idempotent: if the transceiver already negotiated this direction there's
    // nothing to do. This collapses the repeated auto-resume calls (one per
    // track, re-fired on every `trackReceived`) into at most one real
    // renegotiation instead of a storm of same-direction re-offers.
    const tx = pc.getTransceivers().find((t) => t.mid === mid);
    if (tx && tx.currentDirection === localDirection) return;

    // The chain guarantees the previous change settled back to "stable"; if
    // something left us mid-negotiation, bail rather than throw — the next
    // queued change retries from a clean state.
    if (pc.signalingState !== "stable") return;

    const localSdp = pc.localDescription?.sdp;
    const remoteSdp = pc.remoteDescription?.sdp;
    if (!localSdp || !remoteSdp) return;

    const modifiedLocal = webrtc.replaceSdpDirectionForMid(localSdp, mid, localDirection);
    const modifiedRemote = webrtc.replaceSdpDirectionForMid(
      remoteSdp,
      mid,
      webrtc.complementDirection(localDirection),
    );

    try {
      await pc.setLocalDescription(
        new RTCSessionDescription({ type: "offer", sdp: modifiedLocal }),
      );
      await pc.setRemoteDescription(
        new RTCSessionDescription({ type: "answer", sdp: modifiedRemote }),
      );
    } catch (e) {
      // Roll back a half-applied offer so the connection returns to "stable"
      // and the next queued direction change can proceed cleanly.
      if (pc.signalingState === "have-local-offer") {
        try {
          await pc.setLocalDescription({ type: "rollback" });
        } catch {
          // Best-effort; nothing more we can do here.
        }
      }
      throw e;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Track Publishing
  // ─────────────────────────────────────────────────────────────────────────

  async publishTrack(name: string, track: MediaStreamTrack): Promise<void> {
    if (!this.peerConnection) {
      throw new Error(
        `[WebRTCTransport] Cannot publish track "${name}" - not initialized`
      );
    }

    if (this.status !== "connected") {
      throw new Error(
        `[WebRTCTransport] Cannot publish track "${name}" - not connected`
      );
    }

    const entry = this.transceiverMap.get(name);
    if (!entry || !entry.transceiver) {
      throw new Error(
        `[WebRTCTransport] Cannot publish track "${name}" - no transceiver ` +
          `(was it declared in capabilities?)`
      );
    }

    if (entry.direction === "recvonly") {
      throw new Error(
        `[WebRTCTransport] Cannot publish track "${name}" - transceiver is recvonly`
      );
    }

    await this.sendControlRequest("publish_track", { name });
    await entry.transceiver.sender.replaceTrack(track);
    this.publishedTracks.set(name, track);
    console.debug(`[WebRTCTransport] Track "${name}" published successfully`);
  }

  async unpublishTrack(name: string): Promise<void> {
    const entry = this.transceiverMap.get(name);
    if (!entry?.transceiver || !this.publishedTracks.has(name)) return;

    try {
      await entry.transceiver.sender.replaceTrack(null);
      this.sendControlMessage("unpublish_track", { name });
      console.debug(
        `[WebRTCTransport] Track "${name}" unpublished successfully`
      );
    } catch (error) {
      console.error(
        `[WebRTCTransport] Failed to unpublish track "${name}":`,
        error
      );
      throw error;
    } finally {
      this.publishedTracks.delete(name);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Stats
  // ─────────────────────────────────────────────────────────────────────────

  getStats(): ConnectionStats | undefined {
    return this.stats;
  }

  getTransportTimings(): WebRTCTransportTimings | undefined {
    if (this.iceNegotiationMs == null || this.dataChannelMs == null) {
      return undefined;
    }
    return {
      protocol: "webrtc",
      sdpPollingMs: this.sdpPollingMs ?? 0,
      sdpPollingAttempts: this.sdpPollingAttempts ?? 0,
      iceNegotiationMs: this.iceNegotiationMs,
      dataChannelMs: this.dataChannelMs,
    };
  }

  private resetTransportTimings(): void {
    this.iceStartTime = undefined;
    this.iceNegotiationMs = undefined;
    this.dataChannelMs = undefined;
    this.sdpPollingMs = undefined;
    this.sdpPollingAttempts = undefined;
  }

  private startStatsPolling(): void {
    this.stopStatsPolling();
    const statsExtractor = webrtc.createRTCStatsExtractor();
    this.statsInterval = setInterval(async () => {
      if (!this.peerConnection) return;
      try {
        const report = await this.peerConnection.getStats();
        this.stats = statsExtractor(report);
        this.emit("statsUpdate", this.stats);
      } catch {
        // Connection may be closing
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

  // ─────────────────────────────────────────────────────────────────────────
  // Ping (Client Liveness)
  // ─────────────────────────────────────────────────────────────────────────

  private startPing(): void {
    this.stopPing();
    this.pingInterval = setInterval(() => {
      if (this.dataChannel?.readyState === "open") {
        try {
          webrtc.sendMessage(this.dataChannel, "ping", {}, "runtime");
        } catch {
          // Data channel may be closing
        }
      }
    }, PING_INTERVAL_MS);
  }

  private stopPing(): void {
    if (this.pingInterval !== undefined) {
      clearInterval(this.pingInterval);
      this.pingInterval = undefined;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Internal Helpers
  // ─────────────────────────────────────────────────────────────────────────

  private checkFullyConnected(): void {
    if (this.peerConnected && this.dataChannelOpen && this.controlChannelOpen) {
      this.setStatus("connected");
      this.startStatsPolling();
    }
  }

  private setStatus(newStatus: TransportStatus): void {
    if (this.status !== newStatus) {
      this.status = newStatus;
      this.emit("statusChanged", newStatus);
    }
  }

  private setupPeerConnectionHandlers(): void {
    if (!this.peerConnection) return;

    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection?.connectionState;
      console.debug("[WebRTCTransport] Connection state:", state);

      if (state) {
        switch (state) {
          case "connected":
            if (this.iceStartTime != null && this.iceNegotiationMs == null) {
              this.iceNegotiationMs = performance.now() - this.iceStartTime;
            }
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
      let trackName: string | undefined;
      for (const [name, entry] of this.transceiverMap) {
        if (entry.transceiver === event.transceiver) {
          trackName = name;
          break;
        }
      }
      trackName ??= event.transceiver.mid ?? `unknown-${event.track.id}`;

      console.debug(
        `[WebRTCTransport] Track received: "${trackName}" (${event.track.kind}, mid=${event.transceiver.mid})`
      );
      const stream = event.streams[0] ?? new MediaStream([event.track]);
      this.emit("trackReceived", trackName, event.track, stream);
    };

    this.peerConnection.onicecandidate = (event) => {
      // Browsers fire onicecandidate in tight bursts (host -> srflx ->
      // relay). Buffer each candidate and flush after a small debounce
      // window so we POST one batch per burst instead of one POST per
      // candidate. The end-of-candidates marker (event.candidate ===
      // null) bypasses the debounce and flushes immediately.
      if (event.candidate) {
        this.pendingIceCandidates.push({
          candidate: event.candidate.candidate,
          sdp_mid: event.candidate.sdpMid ?? undefined,
          sdp_mline_index: event.candidate.sdpMLineIndex ?? undefined,
        });
        if (this.iceCandidateFlushTimer === undefined) {
          this.iceCandidateFlushTimer = setTimeout(
            () => this.flushPendingIceCandidates(false),
            ICE_CANDIDATE_BATCH_WINDOW_MS
          );
        }
      } else {
        this.flushPendingIceCandidates(true);
      }
    };

    this.peerConnection.onicecandidateerror = (event) => {
      // ICE candidate errors are part of the normal WebRTC lifecycle:
      // STUN/TURN servers frequently fail to allocate candidates
      // (host blocked by NAT, server unreachable, auth not yet ready,
      // etc.) without affecting the final connection.  Log at debug
      // level so they don't drown out actionable warnings.
      console.debug("[WebRTCTransport] ICE candidate error:", event);
    };

    this.peerConnection.ondatachannel = (event) => {
      console.debug("[WebRTCTransport] Data channel received from remote");
      this.dataChannel = event.channel;
      this.setupDataChannelHandlers();
    };
  }

  private setupDataChannelHandlers(): void {
    if (!this.dataChannel) return;

    this.dataChannel.onopen = () => {
      console.debug("[WebRTCTransport] Data channel open");
      if (this.iceStartTime != null && this.dataChannelMs == null) {
        this.dataChannelMs = performance.now() - this.iceStartTime;
      }
      this.dataChannelOpen = true;
      this.startPing();
      this.checkFullyConnected();
    };

    this.dataChannel.onclose = () => {
      console.debug("[WebRTCTransport] Data channel closed");
      this.dataChannelOpen = false;
      this.stopPing();
    };

    this.dataChannel.onerror = (error) => {
      console.error("[WebRTCTransport] Data channel error:", error);
    };

    this.dataChannel.onmessage = (event) => {
      const rawData = webrtc.parseMessage(event.data) as any;
      console.debug("[WebRTCTransport] Received message:", rawData);

      try {
        if (rawData?.scope === "application" && rawData?.data !== undefined) {
          this.emit("message", rawData.data, "application" as MessageScope);
        } else if (
          rawData?.scope === "runtime" &&
          rawData?.data !== undefined
        ) {
          this.emit("message", rawData.data, "runtime" as MessageScope);
        } else {
          console.warn(
            "[WebRTCTransport] Received message without envelope, treating as application"
          );
          this.emit("message", rawData, "application" as MessageScope);
        }
      } catch (error) {
        console.error(
          "[WebRTCTransport] Failed to parse/validate message:",
          error
        );
      }
    };
  }

  private setupControlChannelHandlers(): void {
    if (!this.controlChannel) return;

    this.controlChannel.onopen = () => {
      console.debug("[WebRTCTransport] Control channel open");
      this.controlChannelOpen = true;
      this.checkFullyConnected();
    };

    this.controlChannel.onclose = () => {
      console.debug("[WebRTCTransport] Control channel closed");
      this.controlChannelOpen = false;
    };

    this.controlChannel.onerror = (error) => {
      console.error("[WebRTCTransport] Control channel error:", error);
    };

    this.controlChannel.onmessage = (event) => {
      const raw = webrtc.parseMessage(event.data) as any;
      if (raw?.type === "response") {
        const requestId = raw?.request_id as string | undefined;
        if (requestId) {
          const pending = this.pendingControlRequests.get(requestId);
          if (pending) {
            clearTimeout(pending.timeout);
            this.pendingControlRequests.delete(requestId);
            if (raw?.error) {
              pending.reject(new Error(
                `[WebRTCTransport] ${raw.method ?? "request"} failed: ${raw.error.message ?? "unknown error"}`
              ));
            } else {
              pending.resolve();
            }
          }
        }
        return;
      }

      console.debug("[WebRTCTransport] Received control message:", raw);
    };
  }
}
