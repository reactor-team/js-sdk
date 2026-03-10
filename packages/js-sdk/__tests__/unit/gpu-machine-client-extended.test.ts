// Copyright (c) 2026 Reactor Technologies, Inc. All rights reserved.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GPUMachineClient } from "../../src/core/GPUMachineClient";

function createMockPC() {
  return {
    addTransceiver: vi.fn().mockReturnValue({
      sender: { replaceTrack: vi.fn().mockResolvedValue(undefined) },
      receiver: { track: null },
      mid: "0",
      direction: "recvonly",
    }),
    createOffer: vi.fn().mockResolvedValue({
      type: "offer",
      sdp: "v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=-\r\na=group:BUNDLE 0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\na=mid:0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\na=mid:1\r\n",
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
        sdp: "v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=-\r\na=group:BUNDLE 0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\na=mid:0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\na=mid:1\r\n",
      };
    },
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

describe("GPUMachineClient (extended)", () => {
  let mockPC: ReturnType<typeof createMockPC>;

  beforeEach(() => {
    vi.useFakeTimers();
    mockPC = createMockPC();
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
      vi.fn().mockImplementation((tracks?: any[]) => ({
        getTracks: () => tracks ?? [],
      }))
    );
    vi.stubGlobal("MediaStreamTrack", vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function setupClient(
    tracks: {
      send: { name: string; kind: "audio" | "video" }[];
      receive: { name: string; kind: "audio" | "video" }[];
    } = {
      send: [],
      receive: [{ name: "main_video", kind: "video" }],
    }
  ) {
    const client = new GPUMachineClient({ iceServers: [] });
    await client.createOffer(tracks);
    return client;
  }

  function getDataChannel() {
    return mockPC.createDataChannel.mock.results[0].value;
  }

  function simulateConnected() {
    const dc = getDataChannel();
    mockPC.connectionState = "connected";
    mockPC.onconnectionstatechange();
    dc.onopen();
  }

  // ── connect() ──────────────────────────────────────────────────────────

  describe("connect()", () => {
    it("throws on invalid signaling state", async () => {
      const client = await setupClient();
      mockPC.signalingState = "stable";

      await expect(client.connect("v=0\r\nanswer")).rejects.toThrow(
        "Invalid signaling state"
      );
    });

    it("sets status to connecting", async () => {
      const client = await setupClient();
      const handler = vi.fn();
      client.on("statusChanged", handler);

      await client.connect("v=0\r\nanswer");

      expect(handler).toHaveBeenCalledWith("connecting");
    });

    it("sets status to error on failure", async () => {
      const client = await setupClient();
      mockPC.setRemoteDescription.mockRejectedValueOnce(
        new Error("SDP parse failed")
      );

      await expect(client.connect("bad-sdp")).rejects.toThrow(
        "SDP parse failed"
      );
      expect(client.getStatus()).toBe("error");
    });
  });

  // ── sendCommand() ──────────────────────────────────────────────────────

  describe("sendCommand()", () => {
    it("delegates to webrtc.sendMessage", async () => {
      const client = await setupClient();
      const dc = getDataChannel();
      dc.readyState = "open";

      client.sendCommand("set_prompt", { text: "hello" });

      expect(dc.send).toHaveBeenCalledOnce();
      const payload = JSON.parse(dc.send.mock.calls[0][0]);
      expect(payload.scope).toBe("application");
      expect(payload.data.type).toBe("set_prompt");
      expect(payload.data.data).toEqual({ text: "hello" });
    });
  });

  // ── publishTrack() guards ─────────────────────────────────────────────

  describe("publishTrack() guards", () => {
    it("throws when not connected (status !== connected)", async () => {
      const client = await setupClient();

      await expect(
        client.publishTrack("main_video", {} as MediaStreamTrack)
      ).rejects.toThrow("not connected");
    });

    it("throws when no transceiver found", async () => {
      const client = await setupClient({
        send: [],
        receive: [{ name: "main_video", kind: "video" }],
      });
      simulateConnected();

      await expect(
        client.publishTrack("unknown_track", {} as MediaStreamTrack)
      ).rejects.toThrow("no transceiver");
    });

    it("throws when transceiver is recvonly", async () => {
      const client = await setupClient({
        send: [],
        receive: [{ name: "main_video", kind: "video" }],
      });
      simulateConnected();

      await expect(
        client.publishTrack("main_video", {} as MediaStreamTrack)
      ).rejects.toThrow("recvonly");
    });
  });

  // ── unpublishTrack() ──────────────────────────────────────────────────

  describe("unpublishTrack()", () => {
    it("is no-op when track not published", async () => {
      const client = await setupClient();
      await expect(client.unpublishTrack("unknown")).resolves.toBeUndefined();
    });

    it("calls replaceTrack(null) on published track", async () => {
      const client = await setupClient({
        send: [{ name: "webcam", kind: "video" }],
        receive: [],
      });
      simulateConnected();

      const transceiver = mockPC.addTransceiver.mock.results[0].value;
      await client.publishTrack("webcam", {} as MediaStreamTrack);
      await client.unpublishTrack("webcam");

      expect(transceiver.sender.replaceTrack).toHaveBeenLastCalledWith(null);
    });
  });

  // ── disconnect() ──────────────────────────────────────────────────────

  describe("disconnect()", () => {
    it("closes data channel and peer connection", async () => {
      const client = await setupClient();
      const dc = getDataChannel();

      await client.disconnect();

      expect(dc.close).toHaveBeenCalled();
      expect(mockPC.close).toHaveBeenCalled();
    });

    it("sets status to disconnected", async () => {
      const client = await setupClient();
      await client.disconnect();
      expect(client.getStatus()).toBe("disconnected");
    });
  });

  // ── setupPeerConnectionHandlers ───────────────────────────────────────

  describe("setupPeerConnectionHandlers", () => {
    it("onconnectionstatechange connected triggers checkFullyConnected", async () => {
      const client = await setupClient();
      const handler = vi.fn();
      client.on("statusChanged", handler);

      // Open data channel first so checkFullyConnected will transition
      getDataChannel().onopen();

      mockPC.connectionState = "connected";
      mockPC.onconnectionstatechange();

      expect(handler).toHaveBeenCalledWith("connected");
    });

    it("onconnectionstatechange disconnected sets disconnected", async () => {
      const client = await setupClient();

      mockPC.connectionState = "disconnected";
      mockPC.onconnectionstatechange();

      expect(client.getStatus()).toBe("disconnected");
    });

    it("onconnectionstatechange failed sets error", async () => {
      const client = await setupClient();

      mockPC.connectionState = "failed";
      mockPC.onconnectionstatechange();

      expect(client.getStatus()).toBe("error");
    });
  });

  // ── setupDataChannelHandlers ──────────────────────────────────────────

  describe("setupDataChannelHandlers", () => {
    it("onopen sets dataChannelOpen and starts ping", async () => {
      const client = await setupClient();
      const handler = vi.fn();
      client.on("statusChanged", handler);

      const dc = getDataChannel();
      dc.onopen();

      // Data channel open alone is insufficient
      expect(client.getStatus()).not.toBe("connected");

      // Once peer is also connected, status transitions
      mockPC.connectionState = "connected";
      mockPC.onconnectionstatechange();

      expect(client.getStatus()).toBe("connected");
    });

    it("onclose stops ping", async () => {
      const client = await setupClient();
      const dc = getDataChannel();
      dc.readyState = "open";

      dc.onopen();
      vi.advanceTimersByTime(5_000);
      expect(dc.send).toHaveBeenCalled();

      dc.onclose();
      dc.send.mockClear();

      vi.advanceTimersByTime(10_000);
      expect(dc.send).not.toHaveBeenCalled();
    });

    it("onmessage routes application messages", async () => {
      const client = await setupClient();
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
      const client = await setupClient();
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

    it("onmessage handles legacy format", async () => {
      const client = await setupClient();
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
    it("only becomes connected when both peer and data channel ready", async () => {
      const client = await setupClient();
      const handler = vi.fn();
      client.on("statusChanged", handler);

      // Peer connected first — not enough on its own
      mockPC.connectionState = "connected";
      mockPC.onconnectionstatechange();
      expect(client.getStatus()).not.toBe("connected");

      // Data channel open second — now both are ready
      getDataChannel().onopen();
      expect(client.getStatus()).toBe("connected");
      expect(handler).toHaveBeenCalledWith("connected");
    });
  });

  // ── getRemoteStream ───────────────────────────────────────────────────

  describe("getRemoteStream", () => {
    it("returns MediaStream when receivers have tracks", async () => {
      const client = await setupClient();
      const mockTrack = { id: "track-1", kind: "video" };
      mockPC.getReceivers.mockReturnValue([{ track: mockTrack }]);

      const stream = client.getRemoteStream();
      expect(stream).toBeDefined();
      expect(MediaStream).toHaveBeenCalledWith([mockTrack]);
    });

    it("returns undefined when no tracks", async () => {
      const client = await setupClient();
      mockPC.getReceivers.mockReturnValue([{ track: null }]);

      expect(client.getRemoteStream()).toBeUndefined();
    });
  });
});
