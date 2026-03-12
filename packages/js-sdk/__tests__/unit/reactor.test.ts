// Copyright (c) 2026 Reactor Technologies, Inc. All rights reserved.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Reactor, PROD_COORDINATOR_URL } from "../../src/core/Reactor";

vi.mock("../../src/core/CoordinatorClient", () => ({
  CoordinatorClient: vi.fn().mockImplementation(() => ({
    getIceServers: vi.fn().mockResolvedValue([]),
    createSession: vi.fn().mockResolvedValue("test-session-id"),
    connect: vi.fn().mockResolvedValue("mock-sdp-answer"),
    terminateSession: vi.fn().mockResolvedValue(undefined),
    abort: vi.fn(),
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
  GPUMachineClient: vi.fn().mockImplementation(() => ({
    createOffer: vi.fn().mockResolvedValue("mock-sdp-offer"),
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    sendCommand: vi.fn(),
    publishTrack: vi.fn().mockResolvedValue(undefined),
    unpublishTrack: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    off: vi.fn(),
    getStats: vi.fn().mockReturnValue(undefined),
  })),
}));

describe("Reactor", () => {
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

    it("exports PROD_COORDINATOR_URL", () => {
      expect(PROD_COORDINATOR_URL).toBe("https://api.reactor.inc");
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
      // First connect completes the SDP exchange (all mocked) but status
      // stays "connecting" because no GPUMachineClient events fire.
      await r.connect("jwt-token");

      await expect(r.connect("jwt-token")).rejects.toThrow(
        "Already connected or connecting"
      );

      await r.disconnect();
    });

    it("does not throw when local mode is used without JWT", async () => {
      const r = new Reactor({ modelName: "echo", local: true });
      // Should not throw authentication error
      await r.connect();
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

      // No status transition should fire
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
