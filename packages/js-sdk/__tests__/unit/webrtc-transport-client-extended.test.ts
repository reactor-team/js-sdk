import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WebRTCTransportClient } from "../../src/core/WebRTCTransportClient";
import type { TrackCapability } from "../../src/core/types";

function makeMockChannel(label: string) {
  return {
    onopen: null as any,
    onclose: null as any,
    onerror: null as any,
    onmessage: null as any,
    readyState: "connecting" as RTCDataChannelState,
    close: vi.fn(),
    send: vi.fn(),
    label,
  };
}

function createMockPC() {
  const dataChannel = makeMockChannel("data");
  const controlChannel = makeMockChannel("control");
  return {
    addTransceiver: vi.fn().mockReturnValue({
      sender: { replaceTrack: vi.fn().mockResolvedValue(undefined) },
      receiver: { track: null },
      mid: "0",
      direction: "recvonly",
    }),
    createOffer: vi.fn().mockResolvedValue({
      type: "offer",
      sdp: "v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=-\r\na=group:BUNDLE 0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\na=mid:0\r\n",
    }),
    setLocalDescription: vi.fn(),
    setRemoteDescription: vi.fn(),
    createDataChannel: vi
      .fn()
      .mockReturnValueOnce(dataChannel)
      .mockReturnValueOnce(controlChannel),
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

const SENDONLY_TRACKS: TrackCapability[] = [
  { name: "webcam", kind: "video", direction: "sendonly" },
];

const ICE_SERVERS_RESPONSE = {
  ice_servers: [{ uris: ["stun:stun.example.com:3478"] }],
};

describe("WebRTCTransportClient (extended)", () => {
  let mockPC: ReturnType<typeof createMockPC>;
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    mockPC = createMockPC();
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
    vi.stubGlobal("MediaStreamTrack", vi.fn());
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function createClient() {
    return new WebRTCTransportClient({
      baseUrl: "https://api.test.com",
      sessionId: "test-session-id",
      jwtToken: "test-jwt",
      maxPollAttempts: 3,
    });
  }

  function setupFullConnect(connectionId = 1234) {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(ICE_SERVERS_RESPONSE),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: () =>
        Promise.resolve({ connection_id: connectionId, track_map: {} }),
    });
    mockFetch.mockResolvedValueOnce({ ok: true, status: 202 });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ sdp_answer: "v=0\r\nanswer" }),
    });
  }

  function getDataChannel() {
    return mockPC.createDataChannel.mock.results[0].value;
  }

  function getControlChannel() {
    return mockPC.createDataChannel.mock.results[1].value;
  }

  function simulateConnected() {
    const dc = getDataChannel();
    const cc = getControlChannel();
    mockPC.connectionState = "connected";
    mockPC.onconnectionstatechange();
    dc.readyState = "open";
    dc.onopen();
    cc.readyState = "open";
    cc.onopen();
  }

  async function connectClient(client: WebRTCTransportClient) {
    setupFullConnect();
    await client.prepare(MOCK_TRACKS);
    await client.connect();
  }

  // ── publishTrack() guards ─────────────────────────────────────────────

  describe("publishTrack() guards", () => {
    it("throws when not connected", async () => {
      const client = createClient();
      await connectClient(client);

      await expect(
        client.publishTrack("main_video", {} as MediaStreamTrack)
      ).rejects.toThrow("not connected");
    });

    it("throws when no transceiver found", async () => {
      const client = createClient();
      await connectClient(client);
      simulateConnected();

      await expect(
        client.publishTrack("unknown_track", {} as MediaStreamTrack)
      ).rejects.toThrow("no transceiver");
    });

    it("throws when transceiver is recvonly", async () => {
      const client = createClient();
      await connectClient(client);
      simulateConnected();

      await expect(
        client.publishTrack("main_video", {} as MediaStreamTrack)
      ).rejects.toThrow("recvonly");
    });
  });

  // ── unpublishTrack() ──────────────────────────────────────────────────

  describe("unpublishTrack()", () => {
    it("is no-op when track not published", async () => {
      const client = createClient();
      await connectClient(client);
      await expect(client.unpublishTrack("unknown")).resolves.toBeUndefined();
    });
  });

  // ── disconnect() ──────────────────────────────────────────────────────

  describe("disconnect()", () => {
    it("closes data channel and peer connection", async () => {
      const client = createClient();
      await connectClient(client);
      const dc = getDataChannel();

      await client.disconnect();

      expect(dc.close).toHaveBeenCalled();
      expect(mockPC.close).toHaveBeenCalled();
    });

    it("sets status to disconnected", async () => {
      const client = createClient();
      await connectClient(client);
      await client.disconnect();
      expect(client.getStatus()).toBe("disconnected");
    });
  });

  // ── sendCommand() ──────────────────────────────────────────────────────

  describe("sendCommand()", () => {
    it("delegates to webrtc.sendMessage after connect", async () => {
      const client = createClient();
      await connectClient(client);
      const dc = getDataChannel();
      dc.readyState = "open";

      client.sendCommand("set_prompt", { text: "hello" }, "application");

      expect(dc.send).toHaveBeenCalledOnce();
      const payload = JSON.parse(dc.send.mock.calls[0][0]);
      expect(payload.scope).toBe("application");
      expect(payload.data.type).toBe("set_prompt");
      expect(payload.data.data).toEqual({ text: "hello" });
    });
  });

  // ── setupPeerConnectionHandlers ───────────────────────────────────────

  describe("peer connection state changes", () => {
    it("connected triggers checkFullyConnected", async () => {
      const client = createClient();
      await connectClient(client);
      const handler = vi.fn();
      client.on("statusChanged", handler);

      const dc = getDataChannel();
      const cc = getControlChannel();
      dc.readyState = "open";
      dc.onopen();
      cc.readyState = "open";
      cc.onopen();

      mockPC.connectionState = "connected";
      mockPC.onconnectionstatechange();

      expect(handler).toHaveBeenCalledWith("connected");
    });

    it("disconnected sets disconnected", async () => {
      const client = createClient();
      await connectClient(client);

      mockPC.connectionState = "disconnected";
      mockPC.onconnectionstatechange();

      expect(client.getStatus()).toBe("disconnected");
    });

    it("failed sets error", async () => {
      const client = createClient();
      await connectClient(client);

      mockPC.connectionState = "failed";
      mockPC.onconnectionstatechange();

      expect(client.getStatus()).toBe("error");
    });
  });

  // ── setupDataChannelHandlers ──────────────────────────────────────────

  describe("data channel handlers", () => {
    it("onopen + peer connected triggers connected status", async () => {
      const client = createClient();
      await connectClient(client);
      const handler = vi.fn();
      client.on("statusChanged", handler);

      mockPC.connectionState = "connected";
      mockPC.onconnectionstatechange();

      const dc = getDataChannel();
      const cc = getControlChannel();
      dc.readyState = "open";
      dc.onopen();
      cc.readyState = "open";
      cc.onopen();

      expect(client.getStatus()).toBe("connected");
    });

    it("onclose stops ping", async () => {
      const client = createClient();
      await connectClient(client);
      simulateConnected();
      const dc = getDataChannel();

      vi.advanceTimersByTime(5_000);
      expect(dc.send).toHaveBeenCalled();

      dc.onclose();
      dc.send.mockClear();

      vi.advanceTimersByTime(10_000);
      expect(dc.send).not.toHaveBeenCalled();
    });

    it("onmessage routes application messages", async () => {
      const client = createClient();
      await connectClient(client);
      const handler = vi.fn();
      client.on("message", handler);

      getDataChannel().onmessage({
        data: JSON.stringify({
          scope: "application",
          data: { type: "cmd", data: {} },
        }),
      });

      expect(handler).toHaveBeenCalledWith(
        { type: "cmd", data: {} },
        "application"
      );
    });

    it("onmessage routes runtime messages", async () => {
      const client = createClient();
      await connectClient(client);
      const handler = vi.fn();
      client.on("message", handler);

      getDataChannel().onmessage({
        data: JSON.stringify({
          scope: "runtime",
          data: { type: "capabilities", data: { version: 1 } },
        }),
      });

      expect(handler).toHaveBeenCalledWith(
        { type: "capabilities", data: { version: 1 } },
        "runtime"
      );
    });

    it("onmessage handles legacy format (no envelope)", async () => {
      const client = createClient();
      await connectClient(client);
      const handler = vi.fn();
      client.on("message", handler);

      getDataChannel().onmessage({
        data: JSON.stringify({ type: "old_format", value: 42 }),
      });

      expect(handler).toHaveBeenCalledWith(
        { type: "old_format", value: 42 },
        "application"
      );
    });
  });

  // ── checkFullyConnected ───────────────────────────────────────────────

  describe("checkFullyConnected", () => {
    it("only transitions when both peer and data channel ready", async () => {
      const client = createClient();
      await connectClient(client);
      const handler = vi.fn();
      client.on("statusChanged", handler);

      // Peer connected first — not enough
      mockPC.connectionState = "connected";
      mockPC.onconnectionstatechange();
      expect(client.getStatus()).not.toBe("connected");

      // Data + control channels open — now all three conditions met
      const dc = getDataChannel();
      const cc = getControlChannel();
      dc.readyState = "open";
      dc.onopen();
      cc.readyState = "open";
      cc.onopen();
      expect(client.getStatus()).toBe("connected");
      expect(handler).toHaveBeenCalledWith("connected");
    });
  });

  // ── reconnect via prepare + connect("PUT") ─────────────

  describe("reconnect (prepare + connect PUT)", () => {
    it("reuses existing connection_id and sends PUT without re-registering", async () => {
      const client = createClient();
      await connectClient(client);
      simulateConnected();

      // Re-prepare and reconnect: ICE + PUT sdp_params + GET sdp_params (no registration)
      mockFetch.mockReset();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(ICE_SERVERS_RESPONSE),
      });
      mockFetch.mockResolvedValueOnce({ ok: true, status: 202 });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ sdp_answer: "v=0\r\nnew-answer" }),
      });

      await client.prepare(MOCK_TRACKS);
      await client.connect(true);

      // call[0] = ICE, call[1] = PUT sdp_params (skips registration)
      expect(mockFetch.mock.calls[1][0]).toContain(
        "/connections/1234/sdp_params"
      );
      expect(mockFetch.mock.calls[1][1].method).toBe("PUT");
    });
  });

  // ── publishTrack() / unpublishTrack() control messages ───────────────

  describe("publishTrack() and unpublishTrack() control messages", () => {
    async function connectSendonly(client: WebRTCTransportClient) {
      setupFullConnect();
      await client.prepare(SENDONLY_TRACKS);
      await client.connect();
      simulateConnected();
    }

    function getControlMessages(cc: ReturnType<typeof getControlChannel>) {
      return cc.send.mock.calls.map((c: any) => JSON.parse(c[0]));
    }

    function drainMicrotasks() {
      return Promise.resolve().then(() => Promise.resolve());
    }

    function sendResponse(
      cc: ReturnType<typeof getControlChannel>,
      requestId: string,
      method: string,
      accepted: boolean,
      reason?: string
    ) {
      const msg: any = { type: "response", method, request_id: requestId };
      if (accepted) {
        msg.data = {};
      } else {
        msg.error = {
          code: "PUBLISHER_SLOT_TAKEN",
          message: reason ?? "publisher slot already taken",
        };
      }
      cc.onmessage({ data: JSON.stringify(msg) });
    }

    it("sends publish_track as request and resolves when backend accepts", async () => {
      const client = createClient();
      await connectSendonly(client);

      const cc = getControlChannel();
      cc.send.mockClear();

      const publishPromise = client.publishTrack(
        "webcam",
        {} as MediaStreamTrack
      );
      await drainMicrotasks();

      const msgs = getControlMessages(cc);
      const msg = msgs.find(
        (m: any) => m.type === "request" && m.method === "publish_track"
      );
      expect(msg).toBeDefined();
      expect(msg.data).toEqual({ name: "webcam" });
      expect(msg.request_id).toBeDefined();

      sendResponse(cc, msg.request_id, "publish_track", true);
      await publishPromise;
    });

    it("rejects and rolls back when backend returns error response", async () => {
      const client = createClient();
      await connectSendonly(client);

      const cc = getControlChannel();
      const publishPromise = client.publishTrack(
        "webcam",
        {} as MediaStreamTrack
      );
      await drainMicrotasks();

      const msg = getControlMessages(cc).find(
        (m: any) => m.type === "request" && m.method === "publish_track"
      );
      sendResponse(
        cc,
        msg.request_id,
        "publish_track",
        false,
        "publisher slot already taken"
      );

      await expect(publishPromise).rejects.toThrow(
        "publisher slot already taken"
      );
    });

    it("sends unpublish_track as notification after unpublishing", async () => {
      const client = createClient();
      await connectSendonly(client);

      const cc = getControlChannel();

      // First publish (with response)
      const publishPromise = client.publishTrack(
        "webcam",
        {} as MediaStreamTrack
      );
      await drainMicrotasks();
      const publishMsg = getControlMessages(cc).find(
        (m: any) => m.type === "request" && m.method === "publish_track"
      );
      sendResponse(cc, publishMsg.request_id, "publish_track", true);
      await publishPromise;

      cc.send.mockClear();

      await client.unpublishTrack("webcam");

      const msg = getControlMessages(cc).find(
        (m: any) => m.type === "notification" && m.event === "unpublish_track"
      );
      expect(msg).toBeDefined();
      expect(msg.data).toEqual({ name: "webcam" });
    });

    it("does not send unpublish_track when unpublishing a track that was never published", async () => {
      const client = createClient();
      await connectSendonly(client);

      const cc = getControlChannel();
      cc.send.mockClear();

      await client.unpublishTrack("webcam");

      const msgs = getControlMessages(cc);
      expect(
        msgs.find((m: any) => m.event === "unpublish_track")
      ).toBeUndefined();
    });

    it("rejects with timeout when no ack is received", async () => {
      const client = createClient();
      await connectSendonly(client);

      const publishPromise = client.publishTrack(
        "webcam",
        {} as MediaStreamTrack
      );
      await drainMicrotasks();

      vi.advanceTimersByTime(11_000);

      await expect(publishPromise).rejects.toThrow("timed out");
    });
  });

  // ── version mismatch ──────────────────────────────────────────────────

  describe("version mismatch", () => {
    it("throws on 426 during ICE server fetch", async () => {
      const client = createClient();
      mockFetch.mockResolvedValueOnce({ ok: false, status: 426 });

      await expect(client.prepare(MOCK_TRACKS)).rejects.toThrow(
        "CLIENT_VERSION_TOO_OLD"
      );
    });

    it("throws on 501 during ICE server fetch", async () => {
      const client = createClient();
      mockFetch.mockResolvedValueOnce({ ok: false, status: 501 });

      await expect(client.prepare(MOCK_TRACKS)).rejects.toThrow(
        "SERVER_VERSION_TOO_OLD"
      );
    });
  });
});
