// Copyright (c) 2026 Reactor Technologies, Inc. All rights reserved.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { GPUMachineClient } from "../../src/core/GPUMachineClient";

function createMockPeerConnection() {
  return {
    addTransceiver: vi.fn().mockReturnValue({
      sender: { replaceTrack: vi.fn() },
      mid: "0",
    }),
    createOffer: vi.fn().mockResolvedValue({
      type: "offer",
      sdp: [
        "v=0",
        "o=- 0 0 IN IP4 127.0.0.1",
        "s=-",
        "a=group:BUNDLE 0",
        "m=application 9 UDP/DTLS/SCTP webrtc-datachannel",
        "a=mid:0",
        "",
      ].join("\r\n"),
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
    }),
    close: vi.fn(),
    getSenders: vi.fn().mockReturnValue([]),
    getReceivers: vi.fn().mockReturnValue([]),
    getStats: vi.fn().mockResolvedValue(new Map()),
    get localDescription() {
      return {
        sdp: [
          "v=0",
          "o=- 0 0 IN IP4 127.0.0.1",
          "s=-",
          "a=group:BUNDLE 0",
          "m=application 9 UDP/DTLS/SCTP webrtc-datachannel",
          "a=mid:0",
          "",
        ].join("\r\n"),
      };
    },
    signalingState: "have-local-offer",
    connectionState: "new",
    iceGatheringState: "complete",
    onconnectionstatechange: null,
    ontrack: null,
    onicecandidate: null,
    onicecandidateerror: null,
    ondatachannel: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
}

describe("GPUMachineClient", () => {
  let mockPC: ReturnType<typeof createMockPeerConnection>;

  beforeEach(() => {
    mockPC = createMockPeerConnection();
    vi.stubGlobal(
      "RTCPeerConnection",
      vi.fn().mockReturnValue(mockPC),
    );
    vi.stubGlobal(
      "RTCSessionDescription",
      vi.fn().mockImplementation((d: any) => d),
    );
    vi.stubGlobal(
      "RTCIceCandidate",
      vi.fn().mockImplementation((c: any) => c),
    );
    vi.stubGlobal(
      "MediaStream",
      vi.fn().mockImplementation(() => ({ getTracks: () => [] })),
    );
  });

  // ── Initial state ──────────────────────────────────────────────────────

  describe("initial state", () => {
    it("starts in disconnected status", () => {
      const client = new GPUMachineClient({
        iceServers: [{ urls: "stun:stun.example.com" }],
      });
      expect(client.getStatus()).toBe("disconnected");
    });

    it("has no stats", () => {
      const client = new GPUMachineClient({ iceServers: [] });
      expect(client.getStats()).toBeUndefined();
    });

    it("has no local SDP", () => {
      const client = new GPUMachineClient({ iceServers: [] });
      expect(client.getLocalSDP()).toBeUndefined();
    });

    it("isOfferStillValid is false", () => {
      const client = new GPUMachineClient({ iceServers: [] });
      expect(client.isOfferStillValid()).toBe(false);
    });
  });

  // ── Event emitter ──────────────────────────────────────────────────────

  describe("event emitter", () => {
    it("registers and removes listeners", () => {
      const client = new GPUMachineClient({ iceServers: [] });
      const handler = vi.fn();
      client.on("statusChanged", handler);
      client.off("statusChanged", handler);
      // No public way to trigger emit — just verifying no errors
    });
  });

  // ── sendCommand() ──────────────────────────────────────────────────────

  describe("sendCommand()", () => {
    it("throws when data channel is not available", () => {
      const client = new GPUMachineClient({ iceServers: [] });
      expect(() => client.sendCommand("test", {})).toThrow(
        "Data channel not available",
      );
    });
  });

  // ── publishTrack() ─────────────────────────────────────────────────────

  describe("publishTrack()", () => {
    it("throws when peer connection is not initialized", async () => {
      const client = new GPUMachineClient({ iceServers: [] });
      await expect(
        client.publishTrack("webcam", {} as MediaStreamTrack),
      ).rejects.toThrow("not initialized");
    });
  });

  // ── disconnect() ──────────────────────────────────────────────────────

  describe("disconnect()", () => {
    it("is safe to call when not connected", async () => {
      const client = new GPUMachineClient({ iceServers: [] });
      await expect(client.disconnect()).resolves.toBeUndefined();
    });
  });

  // ── createOffer() ─────────────────────────────────────────────────────

  describe("createOffer()", () => {
    it("creates a peer connection and returns an SDP string", async () => {
      const client = new GPUMachineClient({
        iceServers: [{ urls: "stun:stun.example.com" }],
      });

      const sdp = await client.createOffer({
        send: [],
        receive: [{ name: "main_video", kind: "video" }],
      });

      expect(typeof sdp).toBe("string");
      expect(sdp.length).toBeGreaterThan(0);
    });

    it("rejects duplicate track names in receive", async () => {
      const client = new GPUMachineClient({ iceServers: [] });
      await expect(
        client.createOffer({
          send: [],
          receive: [
            { name: "dup", kind: "video" },
            { name: "dup", kind: "video" },
          ],
        }),
      ).rejects.toThrow("Duplicate receive track name");
    });

    it("rejects the same name in receive and send", async () => {
      const client = new GPUMachineClient({ iceServers: [] });
      await expect(
        client.createOffer({
          send: [{ name: "track", kind: "video" }],
          receive: [{ name: "track", kind: "video" }],
        }),
      ).rejects.toThrow("appears in both receive and send");
    });
  });

  // ── connect() ─────────────────────────────────────────────────────────

  describe("connect()", () => {
    it("throws when called before createOffer()", async () => {
      const client = new GPUMachineClient({ iceServers: [] });
      await expect(client.connect("answer")).rejects.toThrow(
        "call createOffer() first",
      );
    });
  });

  // ── getRemoteStream() ─────────────────────────────────────────────────

  describe("getRemoteStream()", () => {
    it("returns undefined when not connected", () => {
      const client = new GPUMachineClient({ iceServers: [] });
      expect(client.getRemoteStream()).toBeUndefined();
    });
  });
});
