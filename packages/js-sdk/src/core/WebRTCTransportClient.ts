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
import {
  type TrackCapability,
  type TrackMappingEntry,
  type WebRTCSdpOfferRequest,
  type WebRTCSdpAnswerResponse,
  type IceCandidate,
  type IceCandidatesRequest,
  IceServersResponseSchema,
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
  private status: TransportStatus = "disconnected";
  private pingInterval: ReturnType<typeof setInterval> | undefined;
  private statsInterval: ReturnType<typeof setInterval> | undefined;
  private stats: ConnectionStats | undefined;

  private transceiverMap: Map<string, TransceiverEntry> = new Map();
  private publishedTracks: Map<string, MediaStreamTrack> = new Map();
  private peerConnected = false;
  private dataChannelOpen = false;

  private iceStartTime?: number;
  private iceNegotiationMs?: number;
  private dataChannelMs?: number;
  private sdpPollingMs?: number;
  private sdpPollingAttempts?: number;

  private pendingSdpOffer?: string;
  private pendingTrackMapping?: TrackMappingEntry[];
  private cachedIceServers?: Promise<RTCIceServer[]>;

  // Trickle ICE batching
  private pendingIceCandidates: IceCandidate[] = [];
  private iceCandidateFlushTimer?: ReturnType<typeof setTimeout>;

  private readonly baseUrl: string;
  private readonly sessionId: string;
  private readonly jwtToken: string;
  webrtcVersion: string;
  private readonly maxPollAttempts: number;
  private abortController: AbortController;

  constructor(config: WebRTCTransportConfig) {
    this.baseUrl = config.baseUrl;
    this.sessionId = config.sessionId;
    this.jwtToken = config.jwtToken;
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

  private getHeaders(): HeadersInit {
    return {
      Authorization: `Bearer ${this.jwtToken}`,
      [WEBRTC_VERSION_HEADER]: this.webrtcVersion,
    };
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
      headers: this.getHeaders(),
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

  private async sendSdpOffer(
    sdpOffer: string,
    trackMapping: TrackMappingEntry[],
    method: "POST" | "PUT" = "POST"
  ): Promise<void> {
    console.debug(
      `[WebRTCTransport] Sending SDP offer (${method}) for session:`,
      this.sessionId
    );

    const requestBody: WebRTCSdpOfferRequest = {
      sdp_offer: sdpOffer,
      client_info: {
        sdk_version: REACTOR_SDK_VERSION,
        sdk_type: REACTOR_SDK_TYPE,
      },
      track_mapping: trackMapping,
    };

    const response = await fetch(`${this.transportBaseUrl}/sdp_params`, {
      method,
      headers: {
        ...this.getHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
      signal: this.signal,
    });

    await this.checkVersionMismatch(response);

    if (response.status !== 202) {
      const errorText = await response.text();
      throw new Error(
        `Failed to send SDP offer: ${response.status} ${errorText}`
      );
    }

    console.debug("[WebRTCTransport] SDP offer accepted (202)");
  }

  private async sendIceCandidates(
    candidates: IceCandidate[],
    is_final: boolean
  ): Promise<void> {
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

    const response = await fetch(`${this.transportBaseUrl}/ice_candidates`, {
      method: "POST",
      headers: {
        ...this.getHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
      signal: this.signal,
    });

    await this.checkVersionMismatch(response);

    if (response.status !== 202) {
      const errorText = await response.text();
      throw new Error(
        `Failed to send ICE candidates: ${response.status} ${errorText}`
      );
    }

    console.debug("[WebRTCTransport] ICE candidates accepted (202)");
    return;
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

  private async pollSdpAnswer(): Promise<WebRTCSdpAnswerResponse> {
    console.debug("[WebRTCTransport] Polling for SDP answer...");

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

      const response = await fetch(`${this.transportBaseUrl}/sdp_params`, {
        method: "GET",
        headers: this.getHeaders(),
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
    if (this.peerConnection) {
      webrtc.closePeerConnection(this.peerConnection);
      this.peerConnection = undefined;
    }
    this.peerConnected = false;
    this.dataChannelOpen = false;

    const iceServers = this.cachedIceServers
      ? await this.cachedIceServers
      : await this.fetchIceServers();
    this.cachedIceServers = undefined;

    this.peerConnection = webrtc.createPeerConnection({ iceServers });
    this.setupPeerConnectionHandlers();

    this.dataChannel = webrtc.createDataChannel(this.peerConnection);
    this.setupDataChannelHandlers();

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

    const method = reconnect ? "PUT" : "POST";

    const sdpOffer = this.pendingSdpOffer;
    const trackMapping = this.pendingTrackMapping;
    this.pendingSdpOffer = undefined;
    this.pendingTrackMapping = undefined;

    await this.sendSdpOffer(sdpOffer, trackMapping, method);

    const answerResponse = await this.pollSdpAnswer();

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

    if (this.peerConnection) {
      webrtc.closePeerConnection(this.peerConnection);
      this.peerConnection = undefined;
    }

    this.transceiverMap.clear();
    this.peerConnected = false;
    this.dataChannelOpen = false;
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

    await entry.transceiver.sender.replaceTrack(track);
    this.publishedTracks.set(name, track);
    console.debug(`[WebRTCTransport] Track "${name}" published successfully`);
  }

  async unpublishTrack(name: string): Promise<void> {
    const entry = this.transceiverMap.get(name);
    if (!entry?.transceiver || !this.publishedTracks.has(name)) return;

    try {
      await entry.transceiver.sender.replaceTrack(null);
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
    if (this.peerConnected && this.dataChannelOpen) {
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
}
