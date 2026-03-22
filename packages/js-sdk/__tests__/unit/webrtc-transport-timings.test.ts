// Copyright (c) 2026 Reactor Technologies, Inc. All rights reserved.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WebRTCTransportClient } from "../../src/core/WebRTCTransportClient";
import type { TrackCapability } from "../../src/core/types";

function createMockPeerConnection() {
  return {
    addTransceiver: vi.fn().mockReturnValue({
      sender: { replaceTrack: vi.fn() },
      mid: "0",
    }),
    createOffer: vi.fn().mockResolvedValue({
      type: "offer",
      sdp: "v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=-\r\na=group:BUNDLE 0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\na=mid:0\r\n",
    }),
    setLocalDescription: vi.fn(),
    setRemoteDescription: vi.fn(),
    createDataChannel: vi.fn().mockReturnValue({
      onopen: null as ((ev: Event) => void) | null,
      onclose: null,
      onerror: null,
      onmessage: null,
      readyState: "connecting",
      close: vi.fn(),
      send: vi.fn(),
    }),
    close: vi.fn(),
    getSenders: vi.fn().mockReturnValue([]),
    getReceivers: vi.fn().mockReturnValue([]),
    getStats: vi.fn().mockResolvedValue(new Map()),
    get localDescription() {
      return {
        sdp: "v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=-\r\na=group:BUNDLE 0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\na=mid:0\r\n",
      };
    },
    sctp: { maxMessageSize: 262144 },
    signalingState: "have-local-offer",
    connectionState: "new",
    iceGatheringState: "complete",
    onconnectionstatechange: null as (() => void) | null,
    ontrack: null,
    onicecandidate: null,
    onicecandidateerror: null,
    ondatachannel: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
}

const MOCK_TRACKS: TrackCapability[] = [];
const ICE_SERVERS_RESPONSE = { ice_servers: [] };

describe("WebRTCTransportClient connection timings", () => {
  let mockPC: ReturnType<typeof createMockPeerConnection>;
  const mockFetch = vi.fn();

  beforeEach(() => {
    mockPC = createMockPeerConnection();
    vi.stubGlobal("RTCPeerConnection", vi.fn().mockReturnValue(mockPC));
    vi.stubGlobal(
      "RTCSessionDescription",
      vi.fn().mockImplementation((d: any) => d)
    );
    vi.stubGlobal(
      "RTCIceCandidate",
      vi.fn().mockImplementation((c: any) => c)
    );
    vi.stubGlobal(
      "MediaStream",
      vi.fn().mockImplementation(() => ({ getTracks: () => [] }))
    );
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function createClient() {
    return new WebRTCTransportClient({
      baseUrl: "https://api.test.com",
      sessionId: "test-session-id",
      jwtToken: "test-jwt",
      maxPollAttempts: 2,
    });
  }

  function setupFullConnect() {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(ICE_SERVERS_RESPONSE),
    });
    mockFetch.mockResolvedValueOnce({ ok: true, status: 202 });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ sdp_answer: "v=0\r\nanswer" }),
    });
  }

  it("returns undefined before connect", () => {
    const client = createClient();
    expect(client.getTransportTimings()).toBeUndefined();
  });

  it("records ICE and data channel durations after connection", async () => {
    const client = createClient();
    setupFullConnect();
    await client.connect(MOCK_TRACKS);

    mockPC.connectionState = "connected";
    mockPC.onconnectionstatechange!();

    const dc = mockPC.createDataChannel.mock.results[0].value;
    dc.readyState = "open";
    dc.onopen(new Event("open"));

    const timings = client.getTransportTimings();
    expect(timings).toBeDefined();
    expect(timings!.protocol).toBe("webrtc");
    expect(timings!.iceNegotiationMs).toBeGreaterThanOrEqual(0);
    expect(timings!.dataChannelMs).toBeGreaterThanOrEqual(0);
    expect(timings!.sdpPollingMs).toBeGreaterThanOrEqual(0);
    expect(timings!.sdpPollingAttempts).toBeGreaterThanOrEqual(1);
  });

  it("returns undefined when only ICE connected but data channel not open", async () => {
    const client = createClient();
    setupFullConnect();
    await client.connect(MOCK_TRACKS);

    mockPC.connectionState = "connected";
    mockPC.onconnectionstatechange!();

    expect(client.getTransportTimings()).toBeUndefined();
  });

  it("clears timings on disconnect", async () => {
    const client = createClient();
    setupFullConnect();
    await client.connect(MOCK_TRACKS);

    mockPC.connectionState = "connected";
    mockPC.onconnectionstatechange!();
    const dc = mockPC.createDataChannel.mock.results[0].value;
    dc.readyState = "open";
    dc.onopen(new Event("open"));

    expect(client.getTransportTimings()).toBeDefined();

    await client.disconnect();
    expect(client.getTransportTimings()).toBeUndefined();
  });
});
