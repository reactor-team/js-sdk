/**
 * Verifies the `NotReadyError` guard on imperative methods that
 * require an active session — `sendCommand`, `publishTrack`,
 * `uploadFile`.  Previously these silently warned-and-returned in
 * production and *bypassed* the guard entirely in development;
 * callers had no way to know a command was dropped.
 *
 * `unpublishTrack` is intentionally exempt — teardown paths need to
 * be safe to call mid-disconnect — so it's covered by a regression
 * test here too.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Reactor } from "../../src/core/Reactor";
import { NotReadyError } from "../../src/types";

let transportHandlers: Record<string, (...args: any[]) => void> = {};
let mockTransportClient: any;

vi.mock("../../src/core/CoordinatorClient", () => ({
  CoordinatorClient: vi.fn(function (this: any) {
    return {
      createSession: vi.fn().mockResolvedValue({
        session_id: "sid",
        model: { name: "echo" },
        state: "CREATED",
      }),
      pollSessionReady: vi.fn().mockResolvedValue({
        session_id: "sid",
        model: { name: "echo" },
        state: "ACTIVE",
        selected_transport: { protocol: "webrtc", version: "1.0" },
        capabilities: { protocol_version: "1.0", tracks: [] },
      }),
      terminateSession: vi.fn().mockResolvedValue(undefined),
      abort: vi.fn(),
    };
  }),
}));

vi.mock("../../src/core/WebRTCTransportClient", () => ({
  WebRTCTransportClient: vi.fn(function (this: any) {
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
      abort: vi.fn(),
    };
    return mockTransportClient;
  }),
}));

describe("NotReadyError guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transportHandlers = {};
    mockTransportClient = undefined;
  });

  describe("sendCommand", () => {
    it("throws NotReadyError before connect", async () => {
      const r = new Reactor({ modelName: "echo" });
      await expect(r.sendCommand("set_prompt", { p: "x" })).rejects.toThrow(
        NotReadyError
      );
    });

    it("carries the observed status on the thrown error", async () => {
      const r = new Reactor({ modelName: "echo" });
      try {
        await r.sendCommand("set_prompt", { p: "x" });
      } catch (err) {
        expect(err).toBeInstanceOf(NotReadyError);
        const e = err as NotReadyError;
        expect(e.code).toBe("NOT_READY");
        expect(e.status).toBe("disconnected");
        expect(e.operation).toBe("sendCommand");
        expect(e.message).toContain("disconnected");
        return;
      }
      throw new Error("expected sendCommand to reject");
    });

    it("throws NotReadyError while connecting (status='waiting')", async () => {
      const r = new Reactor({ modelName: "echo" });
      // Don't await connect() — leaves status pending past the synchronous
      // 'waiting' set inside connect(). Issue sendCommand here.
      const connectPromise = r.connect("jwt");
      // The implementation sets status to 'connecting' synchronously then
      // awaits createSession. Either of those non-ready statuses must throw.
      await expect(r.sendCommand("x", {})).rejects.toBeInstanceOf(
        NotReadyError
      );
      // Let the connect resolve so the test cleans up.
      await connectPromise;
      transportHandlers["statusChanged"]?.("connected");
      await r.disconnect();
    });

    it("succeeds once status flips to 'ready'", async () => {
      const r = new Reactor({ modelName: "echo" });
      await r.connect("jwt");
      transportHandlers["statusChanged"]("connected");

      await r.sendCommand("ping", { v: 1 });
      expect(mockTransportClient.sendCommand).toHaveBeenCalledWith(
        "ping",
        { v: 1 },
        "application",
        undefined
      );
      await r.disconnect();
    });
  });

  describe("publishTrack", () => {
    it("throws NotReadyError before connect", async () => {
      const r = new Reactor({ modelName: "echo" });
      await expect(
        r.publishTrack("webcam", {} as MediaStreamTrack)
      ).rejects.toThrow(NotReadyError);
    });

    it("includes the track name in the operation field", async () => {
      const r = new Reactor({ modelName: "echo" });
      try {
        await r.publishTrack("webcam", {} as MediaStreamTrack);
      } catch (err) {
        expect(err).toBeInstanceOf(NotReadyError);
        expect((err as NotReadyError).operation).toContain("webcam");
        return;
      }
      throw new Error("expected publishTrack to reject");
    });
  });

  describe("uploadFile", () => {
    it("throws NotReadyError (not a bare Error) before connect", async () => {
      const r = new Reactor({ modelName: "echo" });
      const file = new File(["x"], "x.txt", { type: "text/plain" });
      await expect(r.uploadFile(file)).rejects.toBeInstanceOf(NotReadyError);
    });
  });

  describe("unpublishTrack (regression: stays safe-on-any-status)", () => {
    it("does NOT throw NotReadyError before connect", async () => {
      const r = new Reactor({ modelName: "echo" });
      // No transport yet, so the call is a no-op — the contract is just
      // 'don't blow up on teardown paths'. Whatever this resolves to must
      // not be a NotReadyError.
      await expect(r.unpublishTrack("webcam")).resolves.toBeUndefined();
    });
  });
});
