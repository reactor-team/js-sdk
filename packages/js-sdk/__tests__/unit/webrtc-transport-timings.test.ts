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
    createDataChannel: vi.fn().mockImplementation((label?: string) => ({
      onopen: null as ((ev: Event) => void) | null,
      onclose: null,
      onerror: null,
      onmessage: null,
      readyState: "connecting",
      close: vi.fn(),
      send: vi.fn(),
      label: label ?? "data",
    })),
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
    vi.stubGlobal(
      "RTCPeerConnection",
      vi.fn(function (this: any) {
        return mockPC;
      })
    );
    vi.stubGlobal(
      "RTCSessionDescription",
      vi.fn(function (this: any, d: any) {
        return d;
      })
    );
    vi.stubGlobal(
      "RTCIceCandidate",
      vi.fn(function (this: any, c: any) {
        return c;
      })
    );
    vi.stubGlobal(
      "MediaStream",
      vi.fn(function (this: any) {
        return { getTracks: () => [] };
      })
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
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: () => Promise.resolve({ connection_id: 1234, track_map: {} }),
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
    await client.prepare(MOCK_TRACKS);
    await client.connect();

    mockPC.connectionState = "connected";
    mockPC.onconnectionstatechange!();

    const channels = mockPC.createDataChannel.mock.results.map(
      (r: any) => r.value
    );
    const dc = channels.find((c: any) => c.label === "data");
    const cc = channels.find((c: any) => c.label === "control");
    dc.readyState = "open";
    dc.onopen(new Event("open"));
    cc.readyState = "open";
    cc.onopen(new Event("open"));

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
    await client.prepare(MOCK_TRACKS);
    await client.connect();

    mockPC.connectionState = "connected";
    mockPC.onconnectionstatechange!();

    expect(client.getTransportTimings()).toBeUndefined();
  });

  it("clears timings on disconnect", async () => {
    const client = createClient();
    setupFullConnect();
    await client.prepare(MOCK_TRACKS);
    await client.connect();

    mockPC.connectionState = "connected";
    mockPC.onconnectionstatechange!();
    const channels = mockPC.createDataChannel.mock.results.map(
      (r: any) => r.value
    );
    const dc = channels.find((c: any) => c.label === "data");
    const cc = channels.find((c: any) => c.label === "control");
    dc.readyState = "open";
    dc.onopen(new Event("open"));
    cc.readyState = "open";
    cc.onopen(new Event("open"));

    expect(client.getTransportTimings()).toBeDefined();

    await client.disconnect();
    expect(client.getTransportTimings()).toBeUndefined();
  });
});
