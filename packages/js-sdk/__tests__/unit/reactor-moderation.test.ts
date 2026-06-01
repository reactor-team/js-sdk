import { describe, it, expect, vi, beforeEach } from "vitest";
import { Reactor } from "../../src/core/Reactor";
import type { ModerationEvent } from "../../src/types";

// Moderation events arrive as the inner payload of an existing
// `runtimeMessage` envelope — no dedicated `'moderation'` event.
// Callers discriminate on `m.type === "moderation"` and cast the
// payload to `ModerationEvent`.

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

async function newConnectedReactor(): Promise<Reactor> {
  const r = new Reactor({ modelName: "echo" });
  await r.connect("jwt-token");
  transportHandlers["statusChanged"]?.("connected");
  return r;
}

/**
 * Mirrors WebRTCTransportClient.onmessage: emits `("message", inner, scope)`
 * with `scope = "runtime"` for platform-control payloads.
 */
function emitRuntimeMessage(message: unknown): void {
  transportHandlers["message"]?.(message, "runtime");
}

describe("Reactor moderation events on runtimeMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transportHandlers = {};
  });

  it("delivers a moderation terminate via runtimeMessage", async () => {
    const r = await newConnectedReactor();
    const handler = vi.fn();
    r.on("runtimeMessage", handler);

    const payload: ModerationEvent = {
      action: "terminate",
      input_kind: "text",
      command: "set_prompt",
      categories: ["violence", "violence/graphic"],
      message: "Session terminated due to policy violation.",
    };
    emitRuntimeMessage({ type: "moderation", data: payload });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({
      type: "moderation",
      data: payload,
    });
  });

  it("delivers a moderation warn via runtimeMessage", async () => {
    const r = await newConnectedReactor();
    const handler = vi.fn();
    r.on("runtimeMessage", handler);

    emitRuntimeMessage({
      type: "moderation",
      data: {
        action: "warn",
        input_kind: "text",
        command: "set_prompt",
        categories: ["harassment"],
        message: "Content was flagged for potential policy violations.",
      },
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].type).toBe("moderation");
    expect(handler.mock.calls[0][0].data.action).toBe("warn");
  });

  it("non-moderation runtimeMessages also pass through unchanged", async () => {
    // Existing consumers (e.g. RecordingClient) keep working — there is
    // no SDK-level filtering of which runtime types reach the listener.
    const r = await newConnectedReactor();
    const handler = vi.fn();
    r.on("runtimeMessage", handler);

    emitRuntimeMessage({
      type: "modelCapabilities",
      data: { protocol_version: "1.0", tracks: [], commands: [] },
    });
    emitRuntimeMessage({ type: "ping", data: {} });

    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler.mock.calls[0][0].type).toBe("modelCapabilities");
    expect(handler.mock.calls[1][0].type).toBe("ping");
  });

  it("does not emit a dedicated 'moderation' event", async () => {
    // Design check: the SDK deliberately doesn't expose a separate
    // `'moderation'` event surface — consumers filter `runtimeMessage`
    // by `type`, so the SDK doesn't need a parallel event per type.
    const r = await newConnectedReactor();
    const moderationHandler = vi.fn();
    // Subscribe to the event name we do NOT have; should never fire.
    (r as any).on("moderation", moderationHandler);

    emitRuntimeMessage({
      type: "moderation",
      data: {
        action: "terminate",
        input_kind: "text",
        command: "set_prompt",
        categories: ["sexual"],
        message: "Session terminated due to policy violation.",
      },
    });

    expect(moderationHandler).not.toHaveBeenCalled();
  });

  it("typed filter idiom: caller checks `type === 'moderation'`", async () => {
    // The recommended pattern: subscribe to runtimeMessage, narrow on
    // the `type` discriminant, then treat `data` as ModerationEvent.
    const r = await newConnectedReactor();
    const moderationCallbacks: ModerationEvent[] = [];
    r.on("runtimeMessage", (m: any) => {
      if (m?.type === "moderation") {
        moderationCallbacks.push(m.data as ModerationEvent);
      }
    });

    emitRuntimeMessage({ type: "ping", data: {} });
    emitRuntimeMessage({
      type: "moderation",
      data: {
        action: "terminate",
        input_kind: "image",
        command: "set_image",
        categories: ["sexual"],
        message: "Session terminated due to policy violation.",
      },
    });
    emitRuntimeMessage({
      type: "modelCapabilities",
      data: { protocol_version: "1.0" },
    });

    expect(moderationCallbacks).toHaveLength(1);
    expect(moderationCallbacks[0].action).toBe("terminate");
    expect(moderationCallbacks[0].input_kind).toBe("image");
  });
});
