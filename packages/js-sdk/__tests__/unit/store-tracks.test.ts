/**
 * Verifies that `pauseTrack` / `resumeTrack` are exposed as top-level
 * actions on the React store and delegate to the underlying
 * {@link Reactor} instance, so consumers don't have to reach through
 * `state.internal.reactor` (as `publish` / `unpublish` already do).
 *
 * The wire-level behaviour of the underlying methods is covered by the
 * reactor / transport suites; this file only checks the store-layer
 * passthrough.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createReactorStore } from "../../src/core/store";

vi.mock("../../src/core/CoordinatorClient", () => ({
  CoordinatorClient: vi.fn(function (this: unknown) {
    return {};
  }),
}));
vi.mock("../../src/core/LocalCoordinatorClient", () => ({
  LocalCoordinatorClient: vi.fn(function (this: unknown) {
    return {};
  }),
}));
vi.mock("../../src/core/WebRTCTransportClient", () => ({
  WebRTCTransportClient: vi.fn(function (this: unknown) {
    return { on: vi.fn(), off: vi.fn() };
  }),
}));

function makeStore() {
  return createReactorStore({ modelName: "echo", local: true });
}

describe("ReactorStore track actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exposes pauseTrack / resumeTrack on the public surface", () => {
    const state = makeStore().getState();
    expect(typeof state.pauseTrack).toBe("function");
    expect(typeof state.resumeTrack).toBe("function");
  });

  it("pauseTrack delegates to internal.reactor.pauseTrack with the same name", () => {
    const store = makeStore();
    const reactor = store.getState().internal.reactor;
    const spy = vi.spyOn(reactor, "pauseTrack").mockReturnValue(undefined);

    store.getState().pauseTrack("main_video");

    expect(spy).toHaveBeenCalledWith("main_video");
  });

  it("resumeTrack delegates to internal.reactor.resumeTrack with the same name", () => {
    const store = makeStore();
    const reactor = store.getState().internal.reactor;
    const spy = vi.spyOn(reactor, "resumeTrack").mockReturnValue(undefined);

    store.getState().resumeTrack("main_audio");

    expect(spy).toHaveBeenCalledWith("main_audio");
  });
});
