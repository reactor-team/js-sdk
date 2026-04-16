// Copyright (c) 2026 Reactor Technologies, Inc. All rights reserved.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Reactor, DEFAULT_BASE_URL } from "../../src/core/Reactor";

const MOCK_SESSION_ID = "85ded560-014c-42df-8902-89dfbca8fa00";

const MOCK_INITIAL_RESPONSE = {
  session_id: MOCK_SESSION_ID,
  model: { name: "echo" },
  state: "CREATED",
};

const MOCK_FULL_SESSION_RESPONSE = {
  session_id: MOCK_SESSION_ID,
  model: { name: "echo" },
  state: "ACTIVE",
  selected_transport: { protocol: "webrtc", version: "1.0" },
  capabilities: {
    protocol_version: "1.0",
    tracks: [
      { name: "main_video", kind: "video", direction: "recvonly" as const },
    ],
  },
};

let transportHandlers: Record<string, (...args: any[]) => void> = {};
let mockTransportClient: any;

vi.mock("../../src/core/CoordinatorClient", () => ({
  CoordinatorClient: vi.fn().mockImplementation(() => ({
    createSession: vi.fn().mockResolvedValue(MOCK_INITIAL_RESPONSE),
    pollSessionReady: vi.fn().mockResolvedValue(MOCK_FULL_SESSION_RESPONSE),
    getSession: vi.fn().mockResolvedValue(MOCK_FULL_SESSION_RESPONSE),
    terminateSession: vi.fn().mockResolvedValue(undefined),
    abort: vi.fn(),
    getSessionId: vi.fn().mockReturnValue(MOCK_SESSION_ID),
  })),
}));

vi.mock("../../src/core/LocalCoordinatorClient", () => ({
  LocalCoordinatorClient: vi.fn().mockImplementation(() => ({
    createSession: vi.fn().mockResolvedValue(MOCK_INITIAL_RESPONSE),
    pollSessionReady: vi.fn().mockResolvedValue(MOCK_FULL_SESSION_RESPONSE),
    getSession: vi.fn().mockResolvedValue(MOCK_FULL_SESSION_RESPONSE),
    terminateSession: vi.fn().mockResolvedValue(undefined),
    abort: vi.fn(),
  })),
}));

vi.mock("../../src/core/WebRTCTransportClient", () => ({
  WebRTCTransportClient: vi.fn().mockImplementation(() => {
    transportHandlers = {};
    mockTransportClient = {
      warmup: vi.fn().mockResolvedValue(undefined),
      prepare: vi.fn().mockResolvedValue(undefined),
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      sendCommand: vi.fn(),
      publishTrack: vi.fn().mockResolvedValue(undefined),
      unpublishTrack: vi.fn().mockResolvedValue(undefined),
      on: vi.fn((event: string, handler: any) => {
        transportHandlers[event] = handler;
      }),
      off: vi.fn(),
      getStats: vi.fn().mockReturnValue(undefined),
      getTransportTimings: vi.fn().mockReturnValue(undefined),
      abort: vi.fn(),
    };
    return mockTransportClient;
  }),
}));

describe("Reactor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transportHandlers = {};
    mockTransportClient = undefined;
  });

  // ── Constructor ──────────────────────────────────────────────────────────

  describe("constructor", () => {
    it("accepts valid options with only modelName", () => {
      expect(() => new Reactor({ modelName: "echo" })).not.toThrow();
    });

    it("throws when modelName is missing", () => {
      expect(() => new Reactor({} as any)).toThrow();
    });

    it("throws when modelName is not a string", () => {
      expect(() => new Reactor({ modelName: 123 } as any)).toThrow();
    });

    it("exports DEFAULT_BASE_URL", () => {
      expect(DEFAULT_BASE_URL).toBe("https://api.reactor.inc");
    });
  });

  // ── Event emitter ──────────────────────────────────────────────────────

  describe("event emitter", () => {
    it("calls registered handlers on emit", () => {
      const r = new Reactor({ modelName: "echo" });
      const handler = vi.fn();
      r.on("statusChanged", handler);
      r.emit("statusChanged", "connecting");
      expect(handler).toHaveBeenCalledWith("connecting");
    });

    it("removes a handler via off()", () => {
      const r = new Reactor({ modelName: "echo" });
      const handler = vi.fn();
      r.on("statusChanged", handler);
      r.off("statusChanged", handler);
      r.emit("statusChanged", "connecting");
      expect(handler).not.toHaveBeenCalled();
    });

    it("supports multiple listeners for the same event", () => {
      const r = new Reactor({ modelName: "echo" });
      const h1 = vi.fn();
      const h2 = vi.fn();
      r.on("message", h1);
      r.on("message", h2);
      r.emit("message", { data: 1 });
      expect(h1).toHaveBeenCalled();
      expect(h2).toHaveBeenCalled();
    });

    it("does not throw when emitting an event with no listeners", () => {
      const r = new Reactor({ modelName: "echo" });
      expect(() => r.emit("message", {})).not.toThrow();
    });
  });

  // ── Getters ────────────────────────────────────────────────────────────

  describe("getters", () => {
    let r: Reactor;
    beforeEach(() => {
      r = new Reactor({ modelName: "echo" });
    });

    it("getStatus() returns disconnected initially", () => {
      expect(r.getStatus()).toBe("disconnected");
    });

    it("getState() returns status and no error", () => {
      const state = r.getState();
      expect(state.status).toBe("disconnected");
      expect(state.lastError).toBeUndefined();
    });

    it("getSessionId() returns undefined initially", () => {
      expect(r.getSessionId()).toBeUndefined();
    });

    it("getLastError() returns undefined initially", () => {
      expect(r.getLastError()).toBeUndefined();
    });

    it("getStats() returns undefined when not connected", () => {
      expect(r.getStats()).toBeUndefined();
    });

    it("getCapabilities() returns undefined initially", () => {
      expect(r.getCapabilities()).toBeUndefined();
    });

    it("getSessionInfo() returns undefined initially", () => {
      expect(r.getSessionInfo()).toBeUndefined();
    });
  });

  // ── connect() validation ──────────────────────────────────────────────

  describe("connect()", () => {
    it("throws when no JWT is provided and not in local mode", async () => {
      const r = new Reactor({ modelName: "echo" });
      await expect(r.connect()).rejects.toThrow(
        "No authentication provided and not in local mode"
      );
    });

    it("throws when called while already connecting", async () => {
      const r = new Reactor({ modelName: "echo" });
      await r.connect("jwt-token");

      await expect(r.connect("jwt-token")).rejects.toThrow(
        "Already connected or connecting"
      );

      await r.disconnect();
    });

    it("does not throw when local mode is used without JWT", async () => {
      const r = new Reactor({ modelName: "echo", local: true });
      await r.connect();
      await r.disconnect();
    });

    it("emits capabilitiesReceived after session ready", async () => {
      const r = new Reactor({ modelName: "echo" });
      const capHandler = vi.fn();
      r.on("capabilitiesReceived", capHandler);

      await r.connect("jwt-token");

      expect(capHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          protocol_version: "1.0",
          tracks: expect.arrayContaining([
            expect.objectContaining({ name: "main_video" }),
          ]),
        })
      );
      await r.disconnect();
    });

    it("stores capabilities after connect", async () => {
      const r = new Reactor({ modelName: "echo" });
      await r.connect("jwt-token");

      const caps = r.getCapabilities();
      expect(caps).toBeDefined();
      expect(caps!.tracks).toHaveLength(1);
      expect(caps!.tracks[0].name).toBe("main_video");
      await r.disconnect();
    });

    it("stores session info after connect", async () => {
      const r = new Reactor({ modelName: "echo" });
      await r.connect("jwt-token");

      const info = r.getSessionInfo();
      expect(info).toBeDefined();
      expect(info!.session_id).toBe(MOCK_SESSION_ID);
      await r.disconnect();
    });

    it("uses parallel path when tracks are preset", async () => {
      const r = new Reactor({
        modelName: "echo",
        modelTracks: [
          { name: "main_video", kind: "video", direction: "recvonly" },
        ],
      });
      await r.connect("jwt-token");

      expect(mockTransportClient.prepare).toHaveBeenCalledWith([
        { name: "main_video", kind: "video", direction: "recvonly" },
      ]);
      expect(mockTransportClient.connect).toHaveBeenCalled();
      await r.disconnect();
    });

    it("uses sequential path when tracks are not preset", async () => {
      const r = new Reactor({ modelName: "echo" });
      await r.connect("jwt-token");

      expect(mockTransportClient.prepare).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ name: "main_video" }),
        ])
      );
      expect(mockTransportClient.connect).toHaveBeenCalled();
      await r.disconnect();
    });

    it("calls warmup in sequential path (no preset tracks)", async () => {
      const r = new Reactor({ modelName: "echo" });
      await r.connect("jwt-token");

      expect(mockTransportClient.warmup).toHaveBeenCalled();
      await r.disconnect();
    });

    it("does not call warmup in parallel path (preset tracks)", async () => {
      const r = new Reactor({
        modelName: "echo",
        modelTracks: [
          { name: "main_video", kind: "video", direction: "recvonly" },
        ],
      });
      await r.connect("jwt-token");

      expect(mockTransportClient.warmup).not.toHaveBeenCalled();
      await r.disconnect();
    });
  });

  // ── disconnect() ──────────────────────────────────────────────────────

  describe("disconnect()", () => {
    it("is a no-op when already disconnected", async () => {
      const r = new Reactor({ modelName: "echo" });
      const handler = vi.fn();
      r.on("statusChanged", handler);

      await r.disconnect();
      expect(handler).not.toHaveBeenCalled();
    });

    it("transitions to disconnected after connect", async () => {
      const r = new Reactor({ modelName: "echo" });
      await r.connect("jwt");

      await r.disconnect();
      expect(r.getStatus()).toBe("disconnected");
      expect(r.getSessionId()).toBeUndefined();
    });
  });

  // ── sendCommand() guard ───────────────────────────────────────────────

  describe("sendCommand()", () => {
    it("warns and returns when not ready", async () => {
      const r = new Reactor({ modelName: "echo" });
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      await r.sendCommand("set_effect", { effect: "grayscale" });

      expect(warnSpy).toHaveBeenCalledWith(
        "[Reactor]",
        expect.stringContaining("Cannot send message")
      );
    });
  });

  // ── publishTrack() guard ──────────────────────────────────────────────

  describe("publishTrack()", () => {
    it("warns when not ready", async () => {
      const r = new Reactor({ modelName: "echo" });
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      await r.publishTrack("webcam", {} as MediaStreamTrack);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Cannot publish track")
      );
    });
  });

  // ── reconnect() guard ─────────────────────────────────────────────────

  describe("reconnect()", () => {
    it("warns when no active session exists", async () => {
      const r = new Reactor({ modelName: "echo" });
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      await r.reconnect();

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("No active session")
      );
    });
  });
});
