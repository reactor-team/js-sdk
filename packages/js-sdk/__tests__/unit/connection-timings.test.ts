// Copyright (c) 2026 Reactor Technologies, Inc. All rights reserved.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Reactor } from "../../src/core/Reactor";

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
    terminateSession: vi.fn().mockResolvedValue(undefined),
    abort: vi.fn(),
  })),
}));

vi.mock("../../src/core/LocalCoordinatorClient", () => ({
  LocalCoordinatorClient: vi.fn().mockImplementation(() => ({
    createSession: vi.fn().mockResolvedValue(MOCK_INITIAL_RESPONSE),
    pollSessionReady: vi.fn().mockResolvedValue(MOCK_FULL_SESSION_RESPONSE),
    terminateSession: vi.fn().mockResolvedValue(undefined),
    abort: vi.fn(),
  })),
}));

vi.mock("../../src/core/WebRTCTransportClient", () => ({
  WebRTCTransportClient: vi.fn().mockImplementation(() => {
    transportHandlers = {};
    mockTransportClient = {
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
      getStats: vi.fn().mockReturnValue({ rtt: 10, timestamp: Date.now() }),
      getTransportTimings: vi.fn().mockReturnValue({
        protocol: "webrtc",
        sdpPollingMs: 100,
        sdpPollingAttempts: 2,
        iceNegotiationMs: 45,
        dataChannelMs: 55,
      }),
      abort: vi.fn(),
    };
    return mockTransportClient;
  }),
}));

describe("Reactor connection timings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transportHandlers = {};
    mockTransportClient = undefined;
  });

  async function connectAndReady(r: Reactor, jwt = "jwt") {
    await r.connect(jwt);
    transportHandlers["statusChanged"]("connected");
  }

  it("populates connectionTimings after reaching ready", async () => {
    const r = new Reactor({ modelName: "echo" });
    await connectAndReady(r);

    const stats = r.getStats();
    expect(stats).toBeDefined();
    expect(stats!.connectionTimings).toBeDefined();

    const t = stats!.connectionTimings!;
    expect(t.sessionCreationMs).toBeGreaterThanOrEqual(0);
    expect(t.transportConnectingMs).toBeGreaterThanOrEqual(0);
    expect(t.totalMs).toBeGreaterThanOrEqual(0);

    await r.disconnect();
  });

  it("merges connectionTimings into statsUpdate events", async () => {
    const r = new Reactor({ modelName: "echo" });
    await connectAndReady(r);

    const statsHandler = vi.fn();
    r.on("statsUpdate", statsHandler);

    transportHandlers["statsUpdate"]({ rtt: 25, timestamp: Date.now() });

    expect(statsHandler).toHaveBeenCalledTimes(1);
    const emitted = statsHandler.mock.calls[0][0];
    expect(emitted.rtt).toBe(25);
    expect(emitted.connectionTimings).toBeDefined();
    expect(emitted.connectionTimings.sessionCreationMs).toBeGreaterThanOrEqual(
      0
    );

    await r.disconnect();
  });

  it("clears connectionTimings on disconnect (getStats)", async () => {
    const r = new Reactor({ modelName: "echo" });
    await connectAndReady(r);

    expect(r.getStats()!.connectionTimings).toBeDefined();

    await r.disconnect();
    expect(r.getStats()).toBeUndefined();
  });

  it("clears connectionTimings from statsUpdate events after disconnect", async () => {
    const r = new Reactor({ modelName: "echo" });
    await connectAndReady(r);

    const statsHandler = vi.fn();
    r.on("statsUpdate", statsHandler);
    transportHandlers["statsUpdate"]({ rtt: 10, timestamp: Date.now() });
    expect(statsHandler.mock.calls[0][0].connectionTimings).toBeDefined();

    await r.disconnect();
    expect(r.getStats()).toBeUndefined();
  });

  it("has connectionTimings with zero totalMs before transport emits connected", async () => {
    const r = new Reactor({ modelName: "echo" });
    await r.connect("jwt");

    const stats = r.getStats();
    expect(stats).toBeDefined();
    const t = stats!.connectionTimings!;
    expect(t.sessionCreationMs).toBeGreaterThanOrEqual(0);
    expect(t.transportConnectingMs).toBeGreaterThanOrEqual(0);
    expect(t.totalMs).toBe(0);

    await r.disconnect();
  });
});
