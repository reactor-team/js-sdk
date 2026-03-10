// Copyright (c) 2026 Reactor Technologies, Inc. All rights reserved.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Reactor } from "../../src/core/Reactor";

let machineClientHandlers: Record<string, (...args: any[]) => void> = {};
let mockMachineClient: any;

vi.mock("../../src/core/CoordinatorClient", () => ({
  CoordinatorClient: vi.fn().mockImplementation(() => ({
    getIceServers: vi.fn().mockResolvedValue([]),
    createSession: vi.fn().mockResolvedValue("test-session-id"),
    connect: vi.fn().mockResolvedValue({
      sdpAnswer: "mock-sdp-answer",
      sdpPollingAttempts: 2,
    }),
    terminateSession: vi.fn().mockResolvedValue(undefined),
    abort: vi.fn(),
  })),
}));

vi.mock("../../src/core/LocalCoordinatorClient", () => ({
  LocalCoordinatorClient: vi.fn().mockImplementation(() => ({
    getIceServers: vi.fn().mockResolvedValue([]),
    createSession: vi.fn().mockResolvedValue("local"),
    connect: vi.fn().mockResolvedValue({
      sdpAnswer: "mock-sdp-answer",
      sdpPollingAttempts: 0,
    }),
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
      getStats: vi.fn().mockReturnValue({ rtt: 10, timestamp: Date.now() }),
      getConnectionTimings: vi
        .fn()
        .mockReturnValue({ iceNegotiationMs: 45, dataChannelMs: 55 }),
      resetConnectionTimings: vi.fn(),
    };
    return mockMachineClient;
  }),
}));

describe("Reactor connection timings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    machineClientHandlers = {};
    mockMachineClient = undefined;
  });

  async function connectAndReady(r: Reactor, jwt = "jwt") {
    await r.connect(jwt);
    machineClientHandlers["statusChanged"]("connected");
  }

  it("populates connectionTimings after reaching ready", async () => {
    const r = new Reactor({ modelName: "echo" });
    await connectAndReady(r);

    const stats = r.getStats();
    expect(stats).toBeDefined();
    expect(stats!.connectionTimings).toBeDefined();

    const t = stats!.connectionTimings!;
    expect(t.sessionCreationMs).toBeGreaterThanOrEqual(0);
    expect(t.sdpPollingMs).toBeGreaterThanOrEqual(0);
    expect(t.sdpPollingAttempts).toBe(2);
    expect(t.iceNegotiationMs).toBe(45);
    expect(t.dataChannelMs).toBe(55);
    expect(t.totalMs).toBeGreaterThanOrEqual(0);

    await r.disconnect();
  });

  it("merges connectionTimings into statsUpdate events", async () => {
    const r = new Reactor({ modelName: "echo" });
    await connectAndReady(r);

    const statsHandler = vi.fn();
    r.on("statsUpdate", statsHandler);

    machineClientHandlers["statsUpdate"]({ rtt: 25, timestamp: Date.now() });

    expect(statsHandler).toHaveBeenCalledTimes(1);
    const emitted = statsHandler.mock.calls[0][0];
    expect(emitted.rtt).toBe(25);
    expect(emitted.connectionTimings).toBeDefined();
    expect(emitted.connectionTimings.sdpPollingAttempts).toBe(2);

    await r.disconnect();
  });

  it("clears connectionTimings on disconnect (getStats)", async () => {
    const r = new Reactor({ modelName: "echo" });
    await connectAndReady(r);

    expect(r.getStats()!.connectionTimings).toBeDefined();

    await r.disconnect();
    expect(r.getStats()).toBeUndefined();
  });

  it("clears connectionTimings from statsUpdate events after disconnect and reconnect", async () => {
    const r = new Reactor({ modelName: "echo" });
    await connectAndReady(r);

    // Timings present after first connection
    const statsHandler = vi.fn();
    r.on("statsUpdate", statsHandler);
    machineClientHandlers["statsUpdate"]({ rtt: 10, timestamp: Date.now() });
    expect(statsHandler.mock.calls[0][0].connectionTimings).toBeDefined();
    expect(
      statsHandler.mock.calls[0][0].connectionTimings.sdpPollingAttempts
    ).toBe(2);

    await r.disconnect();

    // After disconnect, getStats returns undefined (machineClient cleared)
    expect(r.getStats()).toBeUndefined();
  });

  it("has partial connectionTimings before machine client emits connected", async () => {
    const r = new Reactor({ modelName: "echo" });
    await r.connect("jwt");

    const stats = r.getStats();
    expect(stats).toBeDefined();
    const t = stats!.connectionTimings!;
    expect(t.sessionCreationMs).toBeGreaterThanOrEqual(0);
    expect(t.sdpPollingMs).toBeGreaterThanOrEqual(0);
    // ICE/data-channel/total are placeholder zeros until finalized
    expect(t.iceNegotiationMs).toBe(0);
    expect(t.dataChannelMs).toBe(0);
    expect(t.totalMs).toBe(0);

    await r.disconnect();
  });
});
