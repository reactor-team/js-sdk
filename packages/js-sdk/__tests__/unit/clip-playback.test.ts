import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  attachClipPlayback,
  type HlsConstructor,
  type HlsErrorData,
} from "../../src/utils/clipPlayback";
import { RecordingError } from "../../src/utils/recording";

const MANIFEST_URL = "blob:https://app.example/manifest";
const OBJECT_URL = "blob:https://app.example/assembled-mp4";

// Node has no `URL.createObjectURL`; the assembled-MP4 path needs one.
const originalObjectUrlApi = {
  create: URL.createObjectURL,
  revoke: URL.revokeObjectURL,
};
let revokeObjectURL: ReturnType<typeof vi.fn>;

/**
 * Node has no `MediaSource`, so every test would otherwise look like
 * iOS 16 to the module.  Browsers that can run `hls.js` are the norm,
 * so they're the default here; {@link withoutMediaSource} plays the
 * browser that can't.
 */
const scope = globalThis as Record<string, unknown>;

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => OBJECT_URL);
  revokeObjectURL = vi.fn();
  URL.revokeObjectURL = revokeObjectURL;
  scope.MediaSource = class {};
});

afterEach(() => {
  URL.createObjectURL = originalObjectUrlApi.create;
  URL.revokeObjectURL = originalObjectUrlApi.revoke;
  delete scope.MediaSource;
  delete scope.ManagedMediaSource;
});

function withoutMediaSource() {
  delete scope.MediaSource;
  delete scope.ManagedMediaSource;
}

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
  overrides: Partial<
    Parameters<typeof attachClipPlayback>[1] &
      Parameters<typeof attachClipPlayback>[2]
  > = {}
) {
  const onReady = vi.fn();
  const onError = vi.fn();
  const assembleMp4 = vi.fn(
    async () => new Blob([new Uint8Array([1, 2, 3])], { type: "video/mp4" })
  );
  const playback = attachClipPlayback(
    video.asElement(),
    {
      manifestUrl: MANIFEST_URL,
      assembleMp4,
      ...overrides,
    },
    {
      autoPlay: true,
      onReady,
      onError,
      loadHls: () => Promise.reject(new Error("hls.js not installed")),
      ...overrides,
    }
  );
  return { playback, onReady, onError, assembleMp4 };
}

describe("attachClipPlayback path selection", () => {
  it("streams with hls.js even when the element claims it can play HLS", async () => {
    // Every browser answers "maybe" to `canPlayType` and then fails
    // the load, which is the regression this ordering prevents.
    const video = new FakeVideo();
    video.canPlayType.mockReturnValue("maybe");
    const { instance, loadHls } = fakeHls(true);

    const { onError, assembleMp4 } = attach(video, { loadHls });
    await vi.waitFor(() => expect(instance.attachMedia).toHaveBeenCalled());

    expect(instance.loadSource).toHaveBeenCalledWith(MANIFEST_URL);
    expect(instance.attachMedia).toHaveBeenCalledWith(video);
    expect(assembleMp4).not.toHaveBeenCalled();
    expect(video.src).toBe("");
    expect(onError).not.toHaveBeenCalled();
  });

  it("plays an assembled MP4 without Media Source Extensions", async () => {
    const video = new FakeVideo();
    video.canPlayType.mockReturnValue("maybe");
    const { constructed, loadHls } = fakeHls(false);

    const { onError, assembleMp4 } = attach(video, { loadHls });
    await vi.waitFor(() => expect(video.src).toBe(OBJECT_URL));

    expect(assembleMp4).toHaveBeenCalledTimes(1);
    expect(constructed()).toBe(0);
    expect(onError).not.toHaveBeenCalled();
    // Never the manifest: an element can't load a clip's chunks itself.
    expect(video.src).not.toBe(MANIFEST_URL);
  });

  it("plays an assembled MP4 when the hls.js chunk fails to load", async () => {
    const video = new FakeVideo();

    const { onError, assembleMp4 } = attach(video);
    await vi.waitFor(() => expect(video.src).toBe(OBJECT_URL));

    expect(assembleMp4).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it("doesn't fetch hls.js on a browser with no MediaSource", async () => {
    // iOS before 17.1: hls.js has nothing to drive, so downloading it
    // would cost the viewer a chunk that can only answer "no".
    withoutMediaSource();
    const video = new FakeVideo();
    const loadHls = vi.fn(() => Promise.resolve(fakeHls(true).ctor));

    const { onError, assembleMp4 } = attach(video, { loadHls });
    await vi.waitFor(() => expect(video.src).toBe(OBJECT_URL));

    expect(loadHls).not.toHaveBeenCalled();
    expect(assembleMp4).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it("streams when only the Managed MediaSource exists", async () => {
    // iOS 17.1 and later expose that variant and nothing else.
    withoutMediaSource();
    scope.ManagedMediaSource = class {};
    const video = new FakeVideo();
    const { instance, loadHls } = fakeHls(true);

    const { assembleMp4 } = attach(video, { loadHls });
    await vi.waitFor(() => expect(instance.attachMedia).toHaveBeenCalled());

    expect(instance.loadSource).toHaveBeenCalledWith(MANIFEST_URL);
    expect(assembleMp4).not.toHaveBeenCalled();
  });

  it("surfaces an assembly failure as the player's error", async () => {
    const video = new FakeVideo();
    const failure = new RecordingError(
      "CHUNK_FETCH_FAILED",
      "Chunk 2 returned HTTP 403"
    );

    const { onError } = attach(video, {
      assembleMp4: vi.fn(() => Promise.reject(failure)),
    });
    await vi.waitFor(() => expect(onError).toHaveBeenCalled());

    // Handed over intact so the player can format it as `CODE: reason`.
    expect(onError.mock.calls[0][0]).toBe(failure);
    expect(video.src).toBe("");
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

  it("reports readiness once however often metadata arrives", () => {
    const video = new FakeVideo();

    const { onReady } = attach(video);
    video.emit("loadedmetadata");
    video.emit("loadedmetadata");

    expect(onReady).toHaveBeenCalledTimes(1);
    expect(video.play).toHaveBeenCalledTimes(1);
  });

  it("stays failed when metadata arrives after an error", () => {
    const video = new FakeVideo();

    const { onReady } = attach(video);
    video.error = { code: 4, message: "" } as MediaError;
    video.emit("error");
    video.emit("loadedmetadata");

    expect(onReady).not.toHaveBeenCalled();
    expect(video.play).not.toHaveBeenCalled();
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

  it("frees the assembled MP4", async () => {
    const video = new FakeVideo();
    const { loadHls } = fakeHls(false);

    const { playback } = attach(video, { loadHls });
    await vi.waitFor(() => expect(video.src).toBe(OBJECT_URL));

    playback.destroy();

    expect(revokeObjectURL).toHaveBeenCalledWith(OBJECT_URL);
  });

  it("drops an MP4 that finishes assembling after teardown", async () => {
    const video = new FakeVideo();
    const { loadHls } = fakeHls(false);
    let finishAssembly: (blob: Blob) => void = () => {};
    const assembleMp4 = vi.fn(
      () =>
        new Promise<Blob>((resolve) => {
          finishAssembly = resolve;
        })
    );

    const { playback } = attach(video, { loadHls, assembleMp4 });
    await vi.waitFor(() => expect(assembleMp4).toHaveBeenCalled());
    playback.destroy();
    finishAssembly(new Blob([new Uint8Array([1])], { type: "video/mp4" }));
    await Promise.resolve();

    expect(video.src).toBe("");
    expect(URL.createObjectURL).not.toHaveBeenCalled();
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
