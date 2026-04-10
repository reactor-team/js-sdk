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
      fetchIceServers: vi.fn().mockResolvedValue([]),
      connect: vi.fn().mockResolvedValue(undefined),
      reconnect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      sendCommand: vi.fn(),
      publishTrack: vi.fn().mockResolvedValue(undefined),
      unpublishTrack: vi.fn().mockResolvedValue(undefined),
      on: vi.fn((event: string, handler: any) => {
        transportHandlers[event] = handler;
      }),
      off: vi.fn(),
      getStats: vi.fn().mockReturnValue(undefined),
      getTransportTimings: vi.fn().mockReturnValue({
        protocol: "webrtc",
        sdpPollingMs: 100,
        sdpPollingAttempts: 1,
        iceNegotiationMs: 50,
        dataChannelMs: 60,
      }),
      abort: vi.fn(),
    };
    return mockTransportClient;
  }),
}));

const { LocalCoordinatorClient } =
  await import("../../src/core/LocalCoordinatorClient");

async function connectAndReady(r: Reactor, jwt = "jwt") {
  await r.connect(jwt);
  transportHandlers["statusChanged"]("connected");
}

describe("Reactor (extended)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transportHandlers = {};
    mockTransportClient = undefined;
  });

  // ── Constructor ──────────────────────────────────────────────────────────

  describe("constructor", () => {
    it("local mode defaults to LOCAL_COORDINATOR_URL", async () => {
      const r = new Reactor({ modelName: "echo", local: true });
      await r.connect();
      expect(LocalCoordinatorClient).toHaveBeenCalledWith(
        "http://localhost:8080",
        "echo"
      );
      await r.disconnect();
    });
  });

  // ── sendCommand (when ready) ─────────────────────────────────────────────

  describe("sendCommand (when ready)", () => {
    it("delegates to transportClient when ready", async () => {
      const r = new Reactor({ modelName: "echo" });
      await connectAndReady(r);

      await r.sendCommand("set_effect", { effect: "blur" });
      expect(mockTransportClient.sendCommand).toHaveBeenCalledWith(
        "set_effect",
        { effect: "blur" },
        "application"
      );
      await r.disconnect();
    });

    it("emits MESSAGE_SEND_FAILED on error", async () => {
      const r = new Reactor({ modelName: "echo" });
      await connectAndReady(r);

      mockTransportClient.sendCommand.mockImplementation(() => {
        throw new Error("channel closed");
      });

      const errorHandler = vi.fn();
      r.on("error", errorHandler);
      vi.spyOn(console, "error").mockImplementation(() => {});

      await r.sendCommand("boom", {});

      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({ code: "MESSAGE_SEND_FAILED" })
      );
      await r.disconnect();
    });
  });

  // ── publishTrack (when ready) ────────────────────────────────────────────

  describe("publishTrack (when ready)", () => {
    it("delegates to transportClient when ready", async () => {
      const r = new Reactor({ modelName: "echo" });
      await connectAndReady(r);

      const fakeTrack = {} as MediaStreamTrack;
      await r.publishTrack("webcam", fakeTrack);
      expect(mockTransportClient.publishTrack).toHaveBeenCalledWith(
        "webcam",
        fakeTrack
      );
      await r.disconnect();
    });

    it("emits TRACK_PUBLISH_FAILED on error", async () => {
      const r = new Reactor({ modelName: "echo" });
      await connectAndReady(r);

      mockTransportClient.publishTrack.mockRejectedValue(
        new Error("publish error")
      );

      const errorHandler = vi.fn();
      r.on("error", errorHandler);
      vi.spyOn(console, "error").mockImplementation(() => {});

      await r.publishTrack("webcam", {} as MediaStreamTrack);

      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({ code: "TRACK_PUBLISH_FAILED" })
      );
      await r.disconnect();
    });
  });

  // ── unpublishTrack ───────────────────────────────────────────────────────

  describe("unpublishTrack", () => {
    it("delegates to transportClient", async () => {
      const r = new Reactor({ modelName: "echo" });
      await connectAndReady(r);

      await r.unpublishTrack("webcam");
      expect(mockTransportClient.unpublishTrack).toHaveBeenCalledWith("webcam");
      await r.disconnect();
    });

    it("emits TRACK_UNPUBLISH_FAILED on error", async () => {
      const r = new Reactor({ modelName: "echo" });
      await connectAndReady(r);

      mockTransportClient.unpublishTrack.mockRejectedValue(
        new Error("unpublish error")
      );

      const errorHandler = vi.fn();
      r.on("error", errorHandler);
      vi.spyOn(console, "error").mockImplementation(() => {});

      await r.unpublishTrack("webcam");

      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({ code: "TRACK_UNPUBLISH_FAILED" })
      );
      await r.disconnect();
    });
  });

  // ── setupTransportHandlers ───────────────────────────────────────────────

  describe("setupTransportHandlers", () => {
    it("routes application messages", async () => {
      const r = new Reactor({ modelName: "echo" });
      await r.connect("jwt");

      const msgHandler = vi.fn();
      r.on("message", msgHandler);

      transportHandlers["message"]({ cmd: "data" }, "application");
      expect(msgHandler).toHaveBeenCalledWith({ cmd: "data" });
      await r.disconnect();
    });

    it("routes runtime messages", async () => {
      const r = new Reactor({ modelName: "echo" });
      await r.connect("jwt");

      const rtHandler = vi.fn();
      r.on("runtimeMessage", rtHandler);

      transportHandlers["message"]({ caps: true }, "runtime");
      expect(rtHandler).toHaveBeenCalledWith({ caps: true });
      await r.disconnect();
    });

    it("transitions to ready on connected status", async () => {
      const r = new Reactor({ modelName: "echo" });
      await r.connect("jwt");

      transportHandlers["statusChanged"]("connected");
      expect(r.getStatus()).toBe("ready");
      await r.disconnect();
    });

    it("triggers recoverable disconnect on disconnected status", async () => {
      const r = new Reactor({ modelName: "echo" });
      await r.connect("jwt");

      transportHandlers["statusChanged"]("disconnected");
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(r.getStatus()).toBe("disconnected");
      expect(r.getSessionId()).toBe(MOCK_SESSION_ID);
    });

    it("emits GPU_CONNECTION_ERROR on error status", async () => {
      const r = new Reactor({ modelName: "echo" });
      await r.connect("jwt");

      const errorHandler = vi.fn();
      r.on("error", errorHandler);

      transportHandlers["statusChanged"]("error");
      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({ code: "GPU_CONNECTION_ERROR" })
      );
    });

    it("forwards trackReceived events", async () => {
      const r = new Reactor({ modelName: "echo" });
      await r.connect("jwt");

      const trackHandler = vi.fn();
      r.on("trackReceived", trackHandler);

      transportHandlers["trackReceived"]("name", "track", "stream");
      expect(trackHandler).toHaveBeenCalledWith("name", "track", "stream");
      await r.disconnect();
    });

    it("forwards statsUpdate events with connectionTimings", async () => {
      const r = new Reactor({ modelName: "echo" });
      await r.connect("jwt");

      const statsHandler = vi.fn();
      r.on("statsUpdate", statsHandler);

      transportHandlers["statsUpdate"]({ rtt: 25 });
      expect(statsHandler).toHaveBeenCalledWith(
        expect.objectContaining({ rtt: 25 })
      );
      await r.disconnect();
    });

    it("ignores events from stale transportClient", async () => {
      const r = new Reactor({ modelName: "echo" });
      await r.connect("jwt");

      const staleHandlers = { ...transportHandlers };

      await r.disconnect(false);

      await r.connect("jwt");

      const msgHandler = vi.fn();
      r.on("message", msgHandler);

      staleHandlers["message"]({ old: true }, "application");
      expect(msgHandler).not.toHaveBeenCalled();
      await r.disconnect();
    });
  });

  // ── reconnect ────────────────────────────────────────────────────────────

  describe("reconnect", () => {
    it("reconnects using transport client", async () => {
      const r = new Reactor({ modelName: "echo" });
      await r.connect("jwt");
      transportHandlers["statusChanged"]("connected");

      await r.disconnect(true);
      expect(r.getSessionId()).toBe(MOCK_SESSION_ID);

      await r.reconnect();
      expect(mockTransportClient.reconnect).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ name: "main_video" }),
        ])
      );
      await r.disconnect();
    });

    it("warns when already ready", async () => {
      const r = new Reactor({ modelName: "echo" });
      await connectAndReady(r);

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      await r.reconnect();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Already connected")
      );
      await r.disconnect();
    });
  });

  // ── disconnect ───────────────────────────────────────────────────────────

  describe("disconnect", () => {
    it("calls abort() on coordinator", async () => {
      const r = new Reactor({ modelName: "echo" });
      await r.connect("jwt");

      const { CoordinatorClient } =
        await import("../../src/core/CoordinatorClient");
      const coordInstance = (CoordinatorClient as any).mock.results.at(
        -1
      )!.value;

      await r.disconnect();
      expect(coordInstance.abort).toHaveBeenCalled();
    });

    it("terminates session on non-recoverable disconnect", async () => {
      const r = new Reactor({ modelName: "echo" });
      await r.connect("jwt");

      const { CoordinatorClient } =
        await import("../../src/core/CoordinatorClient");
      const coordInstance = (CoordinatorClient as any).mock.results.at(
        -1
      )!.value;

      await r.disconnect(false);
      expect(coordInstance.terminateSession).toHaveBeenCalled();
    });

    it("preserves session on recoverable disconnect", async () => {
      const r = new Reactor({ modelName: "echo" });
      await r.connect("jwt");

      await r.disconnect(true);
      expect(r.getSessionId()).toBe(MOCK_SESSION_ID);
    });

    it("clears transportClient on non-recoverable disconnect", async () => {
      const r = new Reactor({ modelName: "echo" });
      await r.connect("jwt");

      await r.disconnect(false);
      expect(r.getSessionId()).toBeUndefined();
      expect(r.getStats()).toBeUndefined();
      expect(r.getCapabilities()).toBeUndefined();
      expect(r.getSessionInfo()).toBeUndefined();
    });

    it("continues cleanup if transportClient.disconnect throws", async () => {
      const r = new Reactor({ modelName: "echo" });
      await r.connect("jwt");

      mockTransportClient.disconnect.mockRejectedValue(
        new Error("peer closed")
      );
      vi.spyOn(console, "error").mockImplementation(() => {});

      await r.disconnect(false);
      expect(r.getStatus()).toBe("disconnected");
    });
  });

  // ── setStatus dedup ──────────────────────────────────────────────────────

  describe("setStatus dedup", () => {
    it("does not emit when status is same", async () => {
      const r = new Reactor({ modelName: "echo" });
      const statusHandler = vi.fn();
      r.on("statusChanged", statusHandler);

      await r.connect("jwt");
      const connectingCount = statusHandler.mock.calls.filter(
        ([s]: [string]) => s === "connecting"
      ).length;
      expect(connectingCount).toBe(1);
      await r.disconnect();
    });
  });

  // ── setSessionId ─────────────────────────────────────────────────────────

  describe("setSessionId", () => {
    it("emits sessionIdChanged", async () => {
      const r = new Reactor({ modelName: "echo" });
      const sessionHandler = vi.fn();
      r.on("sessionIdChanged", sessionHandler);

      await r.connect("jwt");
      expect(sessionHandler).toHaveBeenCalledWith(MOCK_SESSION_ID);
      await r.disconnect();
    });
  });

  // ── createError ──────────────────────────────────────────────────────────

  describe("createError", () => {
    it("populates all error fields", async () => {
      const r = new Reactor({ modelName: "echo" });
      await r.connect("jwt");

      transportHandlers["statusChanged"]("error");

      const err = r.getLastError();
      expect(err).toBeDefined();
      expect(err!.code).toBe("GPU_CONNECTION_ERROR");
      expect(err!.message).toBeTruthy();
      expect(err!.timestamp).toBeGreaterThan(0);
      expect(typeof err!.recoverable).toBe("boolean");
      expect(err!.component).toBe("gpu");
    });
  });
});
