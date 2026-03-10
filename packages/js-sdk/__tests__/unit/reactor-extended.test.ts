// Copyright (c) 2026 Reactor Technologies, Inc. All rights reserved.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Reactor, PROD_COORDINATOR_URL } from "../../src/core/Reactor";
import { GPUMachineStatus } from "../../src/core/GPUMachineClient";

let machineClientHandlers: Record<string, (...args: any[]) => void> = {};
let mockMachineClient: any;

vi.mock("../../src/core/CoordinatorClient", () => ({
  CoordinatorClient: vi.fn().mockImplementation(() => ({
    getIceServers: vi.fn().mockResolvedValue([]),
    createSession: vi.fn().mockResolvedValue("test-session-id"),
    connect: vi.fn().mockResolvedValue("mock-sdp-answer"),
    terminateSession: vi.fn().mockResolvedValue(undefined),
    abort: vi.fn(),
    getSessionId: vi.fn().mockReturnValue("test-session-id"),
  })),
}));

vi.mock("../../src/core/LocalCoordinatorClient", () => ({
  LocalCoordinatorClient: vi.fn().mockImplementation(() => ({
    getIceServers: vi.fn().mockResolvedValue([]),
    createSession: vi.fn().mockResolvedValue("local"),
    connect: vi.fn().mockResolvedValue("mock-sdp-answer"),
    terminateSession: vi.fn().mockResolvedValue(undefined),
    abort: vi.fn(),
  })),
}));

vi.mock("../../src/core/GPUMachineClient", () => ({
  GPUMachineClient: vi.fn().mockImplementation(() => {
    machineClientHandlers = {};
    mockMachineClient = {
      createOffer: vi.fn().mockResolvedValue("mock-sdp-offer"),
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      sendCommand: vi.fn(),
      publishTrack: vi.fn().mockResolvedValue(undefined),
      unpublishTrack: vi.fn().mockResolvedValue(undefined),
      on: vi.fn((event: string, handler: any) => {
        machineClientHandlers[event] = handler;
      }),
      off: vi.fn(),
      getStats: vi.fn().mockReturnValue(undefined),
    };
    return mockMachineClient;
  }),
  GPUMachineStatus: {
    connected: "connected",
    disconnected: "disconnected",
    error: "error",
  },
}));

const { LocalCoordinatorClient } = await import(
  "../../src/core/LocalCoordinatorClient"
);

async function connectAndReady(r: Reactor, jwt = "jwt") {
  await r.connect(jwt);
  machineClientHandlers["statusChanged"]("connected");
}

describe("Reactor (extended)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    machineClientHandlers = {};
    mockMachineClient = undefined;
  });

  // ── Constructor ──────────────────────────────────────────────────────────

  describe("constructor", () => {
    it("local mode defaults to LOCAL_COORDINATOR_URL", async () => {
      const r = new Reactor({ modelName: "echo", local: true });
      await r.connect();
      expect(LocalCoordinatorClient).toHaveBeenCalledWith(
        "http://localhost:8080"
      );
      await r.disconnect();
    });

    it("default receive track is main_video", async () => {
      const r = new Reactor({ modelName: "echo" });
      await r.connect("jwt");
      expect(mockMachineClient.createOffer).toHaveBeenCalledWith({
        send: [],
        receive: [{ name: "main_video", kind: "video" }],
      });
      await r.disconnect();
    });
  });

  // ── sendCommand (when ready) ─────────────────────────────────────────────

  describe("sendCommand (when ready)", () => {
    it("delegates to machineClient when ready", async () => {
      const r = new Reactor({ modelName: "echo" });
      await connectAndReady(r);

      await r.sendCommand("set_effect", { effect: "blur" });
      expect(mockMachineClient.sendCommand).toHaveBeenCalledWith(
        "set_effect",
        { effect: "blur" },
        "application"
      );
      await r.disconnect();
    });

    it("emits MESSAGE_SEND_FAILED on error", async () => {
      const r = new Reactor({ modelName: "echo" });
      await connectAndReady(r);

      mockMachineClient.sendCommand.mockImplementation(() => {
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
    it("delegates to machineClient when ready", async () => {
      const r = new Reactor({ modelName: "echo" });
      await connectAndReady(r);

      const fakeTrack = {} as MediaStreamTrack;
      await r.publishTrack("webcam", fakeTrack);
      expect(mockMachineClient.publishTrack).toHaveBeenCalledWith(
        "webcam",
        fakeTrack
      );
      await r.disconnect();
    });

    it("emits TRACK_PUBLISH_FAILED on error", async () => {
      const r = new Reactor({ modelName: "echo" });
      await connectAndReady(r);

      mockMachineClient.publishTrack.mockRejectedValue(
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
    it("delegates to machineClient", async () => {
      const r = new Reactor({ modelName: "echo" });
      await connectAndReady(r);

      await r.unpublishTrack("webcam");
      expect(mockMachineClient.unpublishTrack).toHaveBeenCalledWith("webcam");
      await r.disconnect();
    });

    it("emits TRACK_UNPUBLISH_FAILED on error", async () => {
      const r = new Reactor({ modelName: "echo" });
      await connectAndReady(r);

      mockMachineClient.unpublishTrack.mockRejectedValue(
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

  // ── setupMachineClientHandlers ───────────────────────────────────────────

  describe("setupMachineClientHandlers", () => {
    it("routes application messages", async () => {
      const r = new Reactor({ modelName: "echo" });
      await r.connect("jwt");

      const msgHandler = vi.fn();
      r.on("message", msgHandler);

      machineClientHandlers["message"]({ cmd: "data" }, "application");
      expect(msgHandler).toHaveBeenCalledWith({ cmd: "data" });
      await r.disconnect();
    });

    it("routes runtime messages", async () => {
      const r = new Reactor({ modelName: "echo" });
      await r.connect("jwt");

      const rtHandler = vi.fn();
      r.on("runtimeMessage", rtHandler);

      machineClientHandlers["message"]({ caps: true }, "runtime");
      expect(rtHandler).toHaveBeenCalledWith({ caps: true });
      await r.disconnect();
    });

    it("transitions to ready on connected status", async () => {
      const r = new Reactor({ modelName: "echo" });
      await r.connect("jwt");

      machineClientHandlers["statusChanged"]("connected");
      expect(r.getStatus()).toBe("ready");
      await r.disconnect();
    });

    it("triggers recoverable disconnect on disconnected status", async () => {
      const r = new Reactor({ modelName: "echo" });
      await r.connect("jwt");

      // The handler calls this.disconnect(true) without await, so flush microtasks
      machineClientHandlers["statusChanged"]("disconnected");
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(r.getStatus()).toBe("disconnected");
      // Session should be preserved (recoverable)
      expect(r.getSessionId()).toBe("test-session-id");
    });

    it("emits GPU_CONNECTION_ERROR on error status", async () => {
      const r = new Reactor({ modelName: "echo" });
      await r.connect("jwt");

      const errorHandler = vi.fn();
      r.on("error", errorHandler);

      machineClientHandlers["statusChanged"]("error");
      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({ code: "GPU_CONNECTION_ERROR" })
      );
    });

    it("forwards trackReceived events", async () => {
      const r = new Reactor({ modelName: "echo" });
      await r.connect("jwt");

      const trackHandler = vi.fn();
      r.on("trackReceived", trackHandler);

      machineClientHandlers["trackReceived"]("name", "track", "stream");
      expect(trackHandler).toHaveBeenCalledWith("name", "track", "stream");
      await r.disconnect();
    });

    it("forwards statsUpdate events", async () => {
      const r = new Reactor({ modelName: "echo" });
      await r.connect("jwt");

      const statsHandler = vi.fn();
      r.on("statsUpdate", statsHandler);

      machineClientHandlers["statsUpdate"]({ rtt: 25 });
      expect(statsHandler).toHaveBeenCalledWith({ rtt: 25 });
      await r.disconnect();
    });

    it("ignores events from stale machineClient", async () => {
      const r = new Reactor({ modelName: "echo" });
      await r.connect("jwt");

      const staleHandlers = { ...machineClientHandlers };

      // Non-recoverable disconnect clears machineClient reference
      await r.disconnect(false);

      // New connect() creates a fresh machineClient — stale closures
      // captured the old instance, so their `client !== this.machineClient` guard fires
      await r.connect("jwt");

      const msgHandler = vi.fn();
      r.on("message", msgHandler);

      // Fire the stale handler — Reactor should ignore it
      staleHandlers["message"]({ old: true }, "application");
      expect(msgHandler).not.toHaveBeenCalled();
      await r.disconnect();
    });
  });

  // ── reconnect ────────────────────────────────────────────────────────────

  describe("reconnect", () => {
    it("reconnects with new SDP exchange", async () => {
      const r = new Reactor({ modelName: "echo" });
      await r.connect("jwt");
      machineClientHandlers["statusChanged"]("connected");

      await r.disconnect(true);
      expect(r.getSessionId()).toBe("test-session-id");

      await r.reconnect();
      expect(mockMachineClient.createOffer).toHaveBeenCalled();
      expect(mockMachineClient.connect).toHaveBeenCalledWith(
        "mock-sdp-answer"
      );
      await r.disconnect();
    });

    it("warns when already ready", async () => {
      const r = new Reactor({ modelName: "echo" });
      await connectAndReady(r);

      const warnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {});

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

      const { CoordinatorClient } = await import(
        "../../src/core/CoordinatorClient"
      );
      const coordInstance = (CoordinatorClient as any).mock.results.at(
        -1
      )!.value;

      await r.disconnect();
      expect(coordInstance.abort).toHaveBeenCalled();
    });

    it("terminates session on non-recoverable disconnect", async () => {
      const r = new Reactor({ modelName: "echo" });
      await r.connect("jwt");

      const { CoordinatorClient } = await import(
        "../../src/core/CoordinatorClient"
      );
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
      expect(r.getSessionId()).toBe("test-session-id");
    });

    it("clears machineClient on non-recoverable disconnect", async () => {
      const r = new Reactor({ modelName: "echo" });
      await r.connect("jwt");

      await r.disconnect(false);
      expect(r.getSessionId()).toBeUndefined();
      expect(r.getStats()).toBeUndefined();
    });

    it("continues cleanup if machineClient.disconnect throws", async () => {
      const r = new Reactor({ modelName: "echo" });
      await r.connect("jwt");

      mockMachineClient.disconnect.mockRejectedValue(
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
      // connect() sets status to "connecting" once
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
      expect(sessionHandler).toHaveBeenCalledWith("test-session-id");
      await r.disconnect();
    });
  });

  // ── createError ──────────────────────────────────────────────────────────

  describe("createError", () => {
    it("populates all error fields", async () => {
      const r = new Reactor({ modelName: "echo" });
      await r.connect("jwt");

      machineClientHandlers["statusChanged"]("error");

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
