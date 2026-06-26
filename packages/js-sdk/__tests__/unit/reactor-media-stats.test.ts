import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Reactor } from "../../src/core/Reactor";
import {
  DEFAULT_SUSTAINED_DEGRADATION_MS,
  RuntimeMediaStatsMessageType,
} from "../../src/utils/mediaStats";

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
    tracks: [],
  },
};

let transportHandlers: Record<string, (...args: any[]) => void> = {};

vi.mock("../../src/core/CoordinatorClient", () => ({
  CoordinatorClient: vi.fn(function (this: any) {
    return {
      createSession: vi.fn().mockResolvedValue(MOCK_INITIAL_RESPONSE),
      pollSessionReady: vi.fn().mockResolvedValue(MOCK_FULL_SESSION_RESPONSE),
      getSession: vi.fn().mockResolvedValue(MOCK_FULL_SESSION_RESPONSE),
      terminateSession: vi.fn().mockResolvedValue(undefined),
      abort: vi.fn(),
      getSessionId: vi.fn().mockReturnValue(MOCK_SESSION_ID),
    };
  }),
}));

vi.mock("../../src/core/WebRTCTransportClient", () => ({
  WebRTCTransportClient: vi.fn(function (this: any) {
    transportHandlers = {};
    return {
      warmup: vi.fn().mockResolvedValue(undefined),
      prepare: vi.fn().mockResolvedValue(undefined),
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      sendCommand: vi.fn(),
      publishTrack: vi.fn().mockResolvedValue(undefined),
      unpublishTrack: vi.fn().mockResolvedValue(undefined),
      pauseTrack: vi.fn(),
      resumeTrack: vi.fn(),
      on: vi.fn((event: string, handler: any) => {
        transportHandlers[event] = handler;
      }),
      off: vi.fn(),
      getStats: vi.fn().mockReturnValue(undefined),
      getTransportTimings: vi.fn().mockReturnValue(undefined),
      abort: vi.fn(),
    };
  }),
}));

async function newConnectedReactor(
  options: ConstructorParameters<typeof Reactor>[0] = { modelName: "echo" }
): Promise<Reactor> {
  const r = new Reactor(options);
  await r.connect("jwt-token");
  transportHandlers["statusChanged"]?.("connected");
  return r;
}

function emitRuntimeMessage(message: unknown): void {
  transportHandlers["message"]?.(message, "runtime");
}

function buildMediaStats(aggregateQos: number): {
  type: string;
  data: { video: { aggregateQos: number } };
} {
  return {
    type: RuntimeMediaStatsMessageType.MEDIA_STATS,
    data: { video: { aggregateQos } },
  };
}

describe("Reactor mediaStats interception", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    transportHandlers = {};
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not forward mediaStats to runtimeMessage when monitor is enabled", async () => {
    const r = await newConnectedReactor();
    const handler = vi.fn();
    r.on("runtimeMessage", handler);

    emitRuntimeMessage(buildMediaStats(2));

    expect(handler).not.toHaveBeenCalled();
    await r.disconnect();
  });

  it("forwards mediaStats to runtimeMessage when monitor is disabled", async () => {
    const r = await newConnectedReactor({
      modelName: "echo",
      mediaStatsMonitor: { enabled: false },
    });
    const handler = vi.fn();
    r.on("runtimeMessage", handler);

    const msg = buildMediaStats(2);
    emitRuntimeMessage(msg);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(msg);
    await r.disconnect();
  });

  it("synthesizes alert on runtimeMessage after sustained low QoS", async () => {
    const r = await newConnectedReactor();
    const handler = vi.fn();
    r.on("runtimeMessage", handler);

    emitRuntimeMessage(buildMediaStats(1));
    vi.advanceTimersByTime(DEFAULT_SUSTAINED_DEGRADATION_MS);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({
      type: RuntimeMediaStatsMessageType.ALERT,
      data: {
        level: "warn",
        message: expect.any(String),
      },
    });
    await r.disconnect();
  });

  it("does not affect other runtime message types", async () => {
    const r = await newConnectedReactor();
    const handler = vi.fn();
    r.on("runtimeMessage", handler);

    emitRuntimeMessage({ type: "ping", data: {} });
    emitRuntimeMessage({
      type: "moderation",
      data: {
        action: "warn",
        input_kind: "text",
        command: "set_prompt",
        categories: ["harassment"],
        message: "Flagged.",
      },
    });

    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler.mock.calls[0][0].type).toBe("ping");
    expect(handler.mock.calls[1][0].type).toBe("moderation");
    await r.disconnect();
  });
});
