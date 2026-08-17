import { describe, it, expect, vi } from "vitest";
import {
  attachClipPlayback,
  type HlsConstructor,
  type HlsErrorData,
} from "../../src/utils/clipPlayback";

const MANIFEST_URL = "blob:https://app.example/manifest";

/**
 * Minimal stand-in for the `<video>` element: enough surface for the
 * attach path, plus `emit` to play the browser's part.
 */
class FakeVideo {
  src = "";
  error: MediaError | null = null;
  play = vi.fn(() => Promise.resolve());
  canPlayType = vi.fn((_type: string) => "");

  private listeners = new Map<string, Set<() => void>>();

  addEventListener(type: string, listener: () => void) {
    const existing = this.listeners.get(type) ?? new Set<() => void>();
    existing.add(listener);
    this.listeners.set(type, existing);
  }

  removeEventListener(type: string, listener: () => void) {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: string) {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener();
  }

  listenerCount(type: string) {
    return this.listeners.get(type)?.size ?? 0;
  }

  asElement() {
    return this as unknown as HTMLVideoElement;
  }
}

function fakeHls(isSupported: boolean) {
  const instance = {
    loadSource: vi.fn(),
    attachMedia: vi.fn(),
    on: vi.fn(),
    destroy: vi.fn(),
  };
  let constructed = 0;
  // A plain function, not `vi.fn`: only a real constructor call hands
  // back `instance` when invoked with `new`.
  function Ctor() {
    constructed += 1;
    return instance;
  }
  Ctor.isSupported = () => isSupported;
  Ctor.Events = { ERROR: "hlsError" };
  const ctor = Ctor as unknown as HlsConstructor;
  return {
    ctor,
    instance,
    constructed: () => constructed,
    loadHls: () => Promise.resolve(ctor),
  };
}

/** Emits the `data` of an hls.js `ERROR` event through the registered handler. */
function emitHlsError(
  instance: { on: ReturnType<typeof vi.fn> },
  data: HlsErrorData
) {
  const handler = instance.on.mock.calls.find(
    ([event]) => event === "hlsError"
  )?.[1] as (evt: unknown, data: HlsErrorData) => void;
  handler(undefined, data);
}

function attach(
  video: FakeVideo,
  overrides: Partial<Parameters<typeof attachClipPlayback>[2]> = {}
) {
  const onReady = vi.fn();
  const onError = vi.fn();
  const playback = attachClipPlayback(video.asElement(), MANIFEST_URL, {
    autoPlay: true,
    onReady,
    onError,
    loadHls: () => Promise.reject(new Error("hls.js not installed")),
    ...overrides,
  });
  return { playback, onReady, onError };
}

describe("attachClipPlayback path selection", () => {
  it("uses hls.js even when the element claims it can play HLS", async () => {
    // Chrome answers "maybe" to `canPlayType` and then fails the load,
    // which is the regression this ordering exists to prevent.
    const video = new FakeVideo();
    video.canPlayType.mockReturnValue("maybe");
    const { instance, loadHls } = fakeHls(true);

    const { onError } = attach(video, { loadHls });
    await vi.waitFor(() => expect(instance.attachMedia).toHaveBeenCalled());

    expect(instance.loadSource).toHaveBeenCalledWith(MANIFEST_URL);
    expect(instance.attachMedia).toHaveBeenCalledWith(video);
    expect(video.src).toBe("");
    expect(onError).not.toHaveBeenCalled();
  });

  it("falls back to native HLS without Media Source Extensions", async () => {
    const video = new FakeVideo();
    video.canPlayType.mockReturnValue("maybe");
    const { constructed, loadHls } = fakeHls(false);

    const { onError } = attach(video, { loadHls });
    await vi.waitFor(() => expect(video.src).toBe(MANIFEST_URL));

    expect(constructed()).toBe(0);
    expect(onError).not.toHaveBeenCalled();
  });

  it("falls back to native HLS when the hls.js peer dep is absent", async () => {
    const video = new FakeVideo();
    video.canPlayType.mockReturnValue("maybe");

    const { onError } = attach(video);
    await vi.waitFor(() => expect(video.src).toBe(MANIFEST_URL));

    expect(onError).not.toHaveBeenCalled();
  });

  it("points at the peer dep when neither path is available", async () => {
    const video = new FakeVideo();

    const { onError } = attach(video);
    await vi.waitFor(() => expect(onError).toHaveBeenCalled());

    expect(onError.mock.calls[0][0].message).toContain("Install `hls.js`");
    expect(video.src).toBe("");
  });

  it("reports an unplayable browser when hls.js is installed but unsupported", async () => {
    const video = new FakeVideo();
    const { loadHls } = fakeHls(false);

    const { onError } = attach(video, { loadHls });
    await vi.waitFor(() => expect(onError).toHaveBeenCalled());

    expect(onError.mock.calls[0][0].message).toBe(
      "This browser cannot play HLS clips. Use Download instead."
    );
  });
});

describe("attachClipPlayback readiness", () => {
  it("reports ready only once the element has metadata", async () => {
    const video = new FakeVideo();
    const { loadHls } = fakeHls(true);

    const { onReady } = attach(video, { loadHls });
    await vi.waitFor(() =>
      expect(video.listenerCount("loadedmetadata")).toBe(1)
    );
    expect(onReady).not.toHaveBeenCalled();

    video.emit("loadedmetadata");

    expect(onReady).toHaveBeenCalledTimes(1);
    expect(video.play).toHaveBeenCalledTimes(1);
  });

  it("leaves playback to the user when autoPlay is off", () => {
    const video = new FakeVideo();

    const { onReady } = attach(video, { autoPlay: false });
    video.emit("loadedmetadata");

    expect(onReady).toHaveBeenCalledTimes(1);
    expect(video.play).not.toHaveBeenCalled();
  });
});

describe("attachClipPlayback failure reporting", () => {
  it("surfaces the element's MediaError with the browser's diagnostic", () => {
    const video = new FakeVideo();

    const { onError } = attach(video);
    video.error = {
      code: 4,
      message: "DEMUXER_ERROR_COULD_NOT_OPEN",
    } as MediaError;
    video.emit("error");

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].message).toBe(
      "This browser cannot play this clip. Use Download instead. (DEMUXER_ERROR_COULD_NOT_OPEN)"
    );
  });

  it("describes a MediaError the browser left unexplained", () => {
    const video = new FakeVideo();

    const { onError } = attach(video);
    video.error = { code: 2, message: "" } as MediaError;
    video.emit("error");

    expect(onError.mock.calls[0][0].message).toBe(
      "A network error interrupted playback."
    );
  });

  it("reports the first failure only", () => {
    const video = new FakeVideo();

    const { onError } = attach(video);
    video.error = { code: 3, message: "" } as MediaError;
    video.emit("error");
    video.emit("error");

    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("fails on fatal hls.js errors and logs the rest", async () => {
    const video = new FakeVideo();
    const { instance, loadHls } = fakeHls(true);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { onError } = attach(video, { loadHls });
    await vi.waitFor(() => expect(instance.on).toHaveBeenCalled());

    emitHlsError(instance, { fatal: false, details: "bufferAppendingError" });
    expect(onError).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();

    emitHlsError(instance, { fatal: true, details: "manifestLoadError" });
    expect(onError.mock.calls[0][0].message).toBe(
      "Playback error: manifestLoadError"
    );

    warn.mockRestore();
  });
});

describe("attachClipPlayback teardown", () => {
  it("detaches listeners and destroys hls.js", async () => {
    const video = new FakeVideo();
    const { instance, loadHls } = fakeHls(true);

    const { playback, onReady, onError } = attach(video, { loadHls });
    await vi.waitFor(() => expect(instance.attachMedia).toHaveBeenCalled());

    playback.destroy();

    expect(instance.destroy).toHaveBeenCalledTimes(1);
    expect(video.listenerCount("loadedmetadata")).toBe(0);
    expect(video.listenerCount("error")).toBe(0);
    video.emit("loadedmetadata");
    video.emit("error");
    expect(onReady).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("never starts playback when destroyed while hls.js is loading", async () => {
    const video = new FakeVideo();
    video.canPlayType.mockReturnValue("maybe");
    const { ctor, constructed } = fakeHls(true);
    let resolveHls: (ctor: HlsConstructor) => void = () => {};
    const loadHls = () =>
      new Promise<HlsConstructor>((resolve) => {
        resolveHls = resolve;
      });

    const { playback, onError } = attach(video, { loadHls });
    playback.destroy();
    resolveHls(ctor);
    await Promise.resolve();

    expect(constructed()).toBe(0);
    expect(video.src).toBe("");
    expect(onError).not.toHaveBeenCalled();
  });
});
