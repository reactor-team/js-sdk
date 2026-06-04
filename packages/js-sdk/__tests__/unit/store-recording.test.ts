/**
 * Verifies that `requestClip` / `requestRecording` / `downloadClipAsFile`
 * are exposed as top-level actions on the React store and delegate to
 * the underlying {@link Reactor} instance, so consumers don't have to
 * reach through `state.internal.reactor`.
 *
 * The wire-level behaviour of the underlying methods is covered by
 * `reactor-recording.test.ts`; this file only checks the store-layer
 * passthrough.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createReactorStore } from "../../src/core/store";
import type { Clip } from "../../src/utils/recording";

// Same minimal mocks as the reactor unit suites: the store constructs
// a Reactor in its initialiser which in turn constructs these clients
// lazily on `connect()`, but the constructor itself doesn't touch the
// network — we still mock them so a future change can't accidentally
// trip an outbound request from the test.
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

const FAKE_CLIP: Clip = {
  sessionId: "rec-1",
  kind: "snap",
  startMarker: 120,
  endMarker: 150,
  nowMarker: 150,
  predictedReadyAtMs: 9_999_999_999_999,
  playlistUrl: "https://api.reactor.inc/clips?session_id=rec-1",
};

function makeStore() {
  return createReactorStore({ modelName: "echo", local: true });
}

describe("ReactorStore recording actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exposes requestClip / requestRecording / downloadClipAsFile on the public surface", () => {
    const state = makeStore().getState();
    expect(typeof state.requestClip).toBe("function");
    expect(typeof state.requestRecording).toBe("function");
    expect(typeof state.downloadClipAsFile).toBe("function");
  });

  it("requestClip delegates to internal.reactor.requestClip with the same arg", async () => {
    const store = makeStore();
    const reactor = store.getState().internal.reactor;
    const spy = vi.spyOn(reactor, "requestClip").mockResolvedValue(FAKE_CLIP);

    const result = await store.getState().requestClip(45);

    expect(spy).toHaveBeenCalledWith(45);
    expect(result).toBe(FAKE_CLIP);
  });

  it("requestRecording delegates to internal.reactor.requestRecording", async () => {
    const store = makeStore();
    const reactor = store.getState().internal.reactor;
    const spy = vi
      .spyOn(reactor, "requestRecording")
      .mockResolvedValue(FAKE_CLIP);

    const result = await store.getState().requestRecording();

    expect(spy).toHaveBeenCalledOnce();
    expect(result).toBe(FAKE_CLIP);
  });

  it("downloadClipAsFile forwards clip, filename and options unchanged", async () => {
    const store = makeStore();
    const reactor = store.getState().internal.reactor;
    const fakeBlob = new Blob(["x"], { type: "video/mp4" });
    const spy = vi
      .spyOn(reactor, "downloadClipAsFile")
      .mockResolvedValue(fakeBlob);

    const onProgress = vi.fn();
    const result = await store
      .getState()
      .downloadClipAsFile(FAKE_CLIP, "out.mp4", { onProgress });

    expect(spy).toHaveBeenCalledWith(FAKE_CLIP, "out.mp4", { onProgress });
    expect(result).toBe(fakeBlob);
  });

  it("downloadClipAsFile propagates errors from the underlying reactor", async () => {
    const store = makeStore();
    const reactor = store.getState().internal.reactor;
    vi.spyOn(reactor, "downloadClipAsFile").mockRejectedValue(
      new Error("nope")
    );

    await expect(
      store.getState().downloadClipAsFile(FAKE_CLIP)
    ).rejects.toThrow("nope");
  });
});
