import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WebRTCTransportClient } from "../../src/core/WebRTCTransportClient";
import type { TrackCapability } from "../../src/core/types";

function createMockPeerConnection() {
  return {
    addTransceiver: vi.fn().mockReturnValue({
      sender: { replaceTrack: vi.fn().mockResolvedValue(undefined) },
      mid: "0",
      direction: "recvonly",
    }),
    createOffer: vi.fn().mockResolvedValue({
      type: "offer",
      sdp: "v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=-\r\na=group:BUNDLE 0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\na=mid:0\r\n",
    }),
    setLocalDescription: vi.fn(),
    setRemoteDescription: vi.fn(),
    createDataChannel: vi.fn().mockReturnValue({
      onopen: null,
      onclose: null,
      onerror: null,
      onmessage: null,
      readyState: "connecting",
      close: vi.fn(),
      send: vi.fn(),
      label: "data",
    }),
    close: vi.fn(),
    getSenders: vi.fn().mockReturnValue([]),
    getReceivers: vi.fn().mockReturnValue([]),
    getStats: vi.fn().mockResolvedValue(new Map()),
    get localDescription() {
      return {
        sdp: "v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=-\r\na=group:BUNDLE 0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\na=mid:0\r\n",
      };
    },
    sctp: { maxMessageSize: 262144 },
    signalingState: "have-local-offer",
    connectionState: "new",
    iceGatheringState: "complete",
    onconnectionstatechange: null as any,
    ontrack: null as any,
    onicecandidate: null as any,
    onicecandidateerror: null as any,
    ondatachannel: null as any,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
}

const MOCK_TRACKS: TrackCapability[] = [
  { name: "main_video", kind: "video", direction: "recvonly" },
];

const ICE_SERVERS_RESPONSE = {
  ice_servers: [
    {
      uris: ["stun:stun.example.com:3478"],
      credentials: { username: "u", password: "p" },
    },
  ],
};

describe("WebRTCTransportClient", () => {
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
      vi.fn(function (this: any, tracks?: any[]) {
        return { getTracks: () => tracks ?? [] };
      })
    );
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function createClient(overrides: Record<string, any> = {}) {
    return new WebRTCTransportClient({
      baseUrl: "https://api.test.com",
      sessionId: "test-session-id",
      jwtToken: "test-jwt",
      maxPollAttempts: 2,
      ...overrides,
    });
  }

  function mockIceServersFetch() {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(ICE_SERVERS_RESPONSE),
    });
  }

  function mockRegisterConnection(connectionId = 1234) {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: () =>
        Promise.resolve({ connection_id: connectionId, track_map: {} }),
    });
  }

  function mockSdpOfferAccepted() {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 202 });
  }

  function mockSdpAnswerReady() {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ sdp_answer: "v=0\r\nanswer" }),
    });
  }

  function setupFullConnect() {
    mockIceServersFetch();
    mockRegisterConnection();
    mockSdpOfferAccepted();
    mockSdpAnswerReady();
  }

  // ── Initial state ──────────────────────────────────────────────────────

  describe("initial state", () => {
    it("starts in disconnected status", () => {
      const client = createClient();
      expect(client.getStatus()).toBe("disconnected");
    });

    it("has no stats", () => {
      const client = createClient();
      expect(client.getStats()).toBeUndefined();
    });

    it("has no transport timings", () => {
      const client = createClient();
      expect(client.getTransportTimings()).toBeUndefined();
    });
  });

  // ── warmup() ──────────────────────────────────────────────────────────

  describe("warmup()", () => {
    it("prefetches ICE servers so prepare() reuses them", async () => {
      const client = createClient();
      mockIceServersFetch();

      await client.warmup();

      mockRegisterConnection();
      mockSdpOfferAccepted();
      mockSdpAnswerReady();

      await client.prepare(MOCK_TRACKS);
      await client.connect();

      // ICE servers fetched only once (by warmup), not again by prepare
      const iceServerCalls = mockFetch.mock.calls.filter(
        (c: any) => typeof c[0] === "string" && c[0].includes("ice_servers")
      );
      expect(iceServerCalls).toHaveLength(1);
    });

    it("prepare() fetches ICE servers itself when warmup() was not called", async () => {
      const client = createClient();
      mockIceServersFetch();

      await client.prepare(MOCK_TRACKS);

      const iceServerCalls = mockFetch.mock.calls.filter(
        (c: any) => typeof c[0] === "string" && c[0].includes("ice_servers")
      );
      expect(iceServerCalls).toHaveLength(1);
    });
  });

  // ── Event emitter ──────────────────────────────────────────────────────

  describe("event emitter", () => {
    it("registers and removes listeners", () => {
      const client = createClient();
      const handler = vi.fn();
      client.on("statusChanged", handler);
      client.off("statusChanged", handler);
    });
  });

  // ── sendCommand() ──────────────────────────────────────────────────────

  describe("sendCommand()", () => {
    it("throws when data channel is not available", () => {
      const client = createClient();
      expect(() => client.sendCommand("test", {}, "application")).toThrow(
        "Data channel not available"
      );
    });
  });

  // ── publishTrack() ─────────────────────────────────────────────────────

  describe("publishTrack()", () => {
    it("throws when peer connection is not initialized", async () => {
      const client = createClient();
      await expect(
        client.publishTrack("webcam", {} as MediaStreamTrack)
      ).rejects.toThrow("not initialized");
    });
  });

  // ── disconnect() ──────────────────────────────────────────────────────

  describe("disconnect()", () => {
    it("is safe to call when not connected", async () => {
      const client = createClient();
      await expect(client.disconnect()).resolves.toBeUndefined();
    });
  });

  // ── prepare() ──────────────────────────────────────────────────────

  describe("prepare()", () => {
    it("fetches ICE servers and creates PeerConnection with transceivers", async () => {
      const client = createClient();
      mockIceServersFetch();

      await client.prepare(MOCK_TRACKS);

      expect(mockFetch.mock.calls[0][0]).toBe(
        "https://api.test.com/sessions/test-session-id/transport/webrtc/ice_servers"
      );
      expect(mockPC.addTransceiver).toHaveBeenCalledWith("video", {
        direction: "recvonly",
      });
      expect(mockPC.createOffer).toHaveBeenCalled();
    });

    it("sets status to connecting", async () => {
      const client = createClient();
      mockIceServersFetch();

      const handler = vi.fn();
      client.on("statusChanged", handler);

      await client.prepare(MOCK_TRACKS);
      expect(handler).toHaveBeenCalledWith("connecting");
    });

    it("creates transceivers for each track", async () => {
      const client = createClient();
      mockIceServersFetch();

      const tracks: TrackCapability[] = [
        { name: "main_video", kind: "video", direction: "recvonly" },
        { name: "webcam", kind: "video", direction: "sendonly" },
      ];

      await client.prepare(tracks);
      expect(mockPC.addTransceiver).toHaveBeenCalledTimes(2);
      expect(mockPC.addTransceiver).toHaveBeenCalledWith("video", {
        direction: "recvonly",
      });
      expect(mockPC.addTransceiver).toHaveBeenCalledWith("video", {
        direction: "sendonly",
      });
    });

    it("throws when ICE server fetch fails", async () => {
      const client = createClient();
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

      await expect(client.prepare(MOCK_TRACKS)).rejects.toThrow(
        "Failed to fetch ICE servers"
      );
    });
  });

  // ── connect() ───────────────────────────────────────────────

  describe("connect()", () => {
    it("registers a connection then sends the SDP offer and polls for the answer", async () => {
      const client = createClient();
      mockIceServersFetch();
      await client.prepare(MOCK_TRACKS);

      mockRegisterConnection(5001);
      mockSdpOfferAccepted();
      mockSdpAnswerReady();
      await client.connect();

      // call[0] = ICE servers, call[1] = register, call[2] = SDP offer, call[3] = SDP poll
      expect(mockFetch.mock.calls[1][0]).toBe(
        "https://api.test.com/sessions/test-session-id/transport/webrtc/connections"
      );
      expect(mockFetch.mock.calls[1][1].method).toBe("POST");

      expect(mockFetch.mock.calls[2][0]).toBe(
        "https://api.test.com/sessions/test-session-id/transport/webrtc/connections/5001/sdp_params"
      );
      expect(mockFetch.mock.calls[2][1].method).toBe("POST");

      const body = JSON.parse(mockFetch.mock.calls[2][1].body);
      expect(body.sdp_offer).toBeDefined();
      expect(body.track_mapping).toHaveLength(1);
      expect(body.track_mapping[0].name).toBe("main_video");

      expect(mockFetch.mock.calls[3][0]).toBe(
        "https://api.test.com/sessions/test-session-id/transport/webrtc/connections/5001/sdp_params"
      );
      expect(mockFetch.mock.calls[3][1].method).toBe("GET");
    });

    it("uses PUT method for reconnections (reuses existing connection_id)", async () => {
      const client = createClient();
      // First connect to establish a connection_id
      setupFullConnect();
      await client.prepare(MOCK_TRACKS);
      await client.connect();

      // Reconnect: re-prepare, then connect(true) — skips registration, uses PUT
      mockFetch.mockReset();
      mockIceServersFetch();
      await client.prepare(MOCK_TRACKS);

      mockSdpOfferAccepted();
      mockSdpAnswerReady();
      await client.connect(true);

      // call[0] = ICE servers, call[1] = SDP offer PUT (no registration)
      expect(mockFetch.mock.calls[1][0]).toContain(
        "/connections/1234/sdp_params"
      );
      expect(mockFetch.mock.calls[1][1].method).toBe("PUT");
    });

    it("throws when called without prepare", async () => {
      const client = createClient();

      await expect(client.connect()).rejects.toThrow("No prepared connection");
    });

    it("throws when SDP offer is rejected", async () => {
      const client = createClient();
      mockIceServersFetch();
      await client.prepare(MOCK_TRACKS);

      mockRegisterConnection();
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve("server error"),
      });

      await expect(client.connect()).rejects.toThrow(
        "Failed to send SDP offer"
      );
    });

    it("polls SDP answer when 202 is returned", async () => {
      const client = createClient({ maxPollAttempts: 3 });
      mockIceServersFetch();
      await client.prepare(MOCK_TRACKS);

      mockRegisterConnection();
      mockSdpOfferAccepted();
      mockFetch.mockResolvedValueOnce({ ok: true, status: 202 });
      mockSdpAnswerReady();

      await client.connect();
      // ICE + register + POST + GET(202) + GET(200) = 5
      expect(mockFetch).toHaveBeenCalledTimes(5);
    });

    it("throws after exhausting SDP poll attempts", async () => {
      const client = createClient({ maxPollAttempts: 2 });
      mockIceServersFetch();
      await client.prepare(MOCK_TRACKS);

      mockRegisterConnection();
      mockSdpOfferAccepted();
      mockFetch.mockResolvedValue({ ok: true, status: 202 });

      await expect(client.connect()).rejects.toThrow(
        "exceeded maximum attempts"
      );
    });
  });

  // ── connect() with a provided connectionId ────────────────────────────

  describe("connect() with a provided connectionId", () => {
    it("adopts the id, skips registration, and posts the offer to that connection", async () => {
      const client = createClient();
      mockIceServersFetch();
      await client.prepare(MOCK_TRACKS);

      mockSdpOfferAccepted();
      mockSdpAnswerReady();
      await client.connect(false, 7777);

      // No POST .../connections registration call was made.
      const registerCall = mockFetch.mock.calls.find((c) =>
        String(c[0]).endsWith("/connections")
      );
      expect(registerCall).toBeUndefined();

      // call[0] = ICE servers (prepare); call[1] = SDP offer POST to the id.
      expect(mockFetch.mock.calls[1][0]).toBe(
        "https://api.test.com/sessions/test-session-id/transport/webrtc/connections/7777/sdp_params"
      );
      expect(mockFetch.mock.calls[1][1].method).toBe("POST");
    });

    it("rejects an out-of-range connectionId before any network call", async () => {
      const client = createClient();
      mockIceServersFetch();
      await client.prepare(MOCK_TRACKS);
      const callsAfterPrepare = mockFetch.mock.calls.length;

      await expect(client.connect(false, 999)).rejects.toThrow(
        "Invalid connectionId"
      );
      expect(mockFetch.mock.calls.length).toBe(callsAfterPrepare);
    });

    it("surfaces a clear error when the connection is not found (404)", async () => {
      const client = createClient();
      mockIceServersFetch();
      await client.prepare(MOCK_TRACKS);

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: () => Promise.resolve('{"error":"connection"}'),
      });

      await expect(client.connect(false, 7777)).rejects.toThrow(
        /Connection 7777 not found/
      );
    });
  });

  // ── abort() ───────────────────────────────────────────────────────────

  describe("abort()", () => {
    it("does not throw", () => {
      const client = createClient();
      expect(() => client.abort()).not.toThrow();
    });
  });
});
