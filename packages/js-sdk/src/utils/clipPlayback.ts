/**
 * Attaches an HLS manifest to a `<video>` element for clip preview.
 *
 * Playback goes through `hls.js` on every browser that has Media
 * Source Extensions, and falls back to the element's own HLS support
 * only where they are absent — today that means iOS Safari, plus any
 * browser where the consumer skipped the optional `hls.js` peer
 * dependency.  `canPlayType("application/vnd.apple.mpegurl")` is not a
 * usable signal on its own: Chrome answers `"maybe"` and then fails the
 * load with `MediaError` 4, so the element is asked only after
 * `Hls.isSupported()` has said no.
 *
 * The element is the single source of truth for readiness and failure:
 * `loadedmetadata` is what marks playback ready (a manifest parsed by
 * `hls.js` says nothing about the element having decodable media yet),
 * and the element's `error` event carries the `MediaError` that would
 * otherwise leave the viewer looking at a black frame.
 *
 * Rendering, state, and manifest fetching live in the `ClipPlayer`
 * React component; this module owns nothing but the attach.
 *
 * @internal
 */

const HLS_MIME_TYPE = "application/vnd.apple.mpegurl";

/** Wired up by {@link attachClipPlayback}. */
export interface ClipPlaybackOptions {
  /** Start playing as soon as the element has metadata. */
  autoPlay: boolean;
  /** Called once the element has loaded the clip's metadata. */
  onReady: () => void;
  /** Called at most once, with a message suitable for display. */
  onError: (error: Error) => void;
  /**
   * Resolves the optional `hls.js` peer dependency.  Defaults to a
   * dynamic `import()`, which bundlers keep in its own chunk so
   * consumers who never render a player aren't billed for it.
   */
  loadHls?: () => Promise<HlsConstructor>;
}

export interface ClipPlayback {
  /** Detaches every listener and tears down `hls.js`. */
  destroy: () => void;
}

/**
 * Play `manifestUrl` on `video`.
 *
 * Returns as soon as the element is wired up: choosing a playback path
 * involves loading `hls.js`, so it happens in the background and the
 * handle is destroyable throughout, including while that load is still
 * in flight.  Playback becoming available is reported through
 * {@link ClipPlaybackOptions.onReady}.
 */
export function attachClipPlayback(
  video: HTMLVideoElement,
  manifestUrl: string,
  {
    autoPlay,
    onReady,
    onError,
    loadHls = () =>
      import("hls.js").then(
        (mod) => (mod as { default: HlsConstructor }).default
      ),
  }: ClipPlaybackOptions
): ClipPlayback {
  let destroyed = false;
  let failed = false;
  let hls: HlsInstance | null = null;

  const fail = (message: string) => {
    if (destroyed || failed) return;
    failed = true;
    onError(new Error(message));
  };

  const handleLoadedMetadata = () => {
    if (destroyed) return;
    onReady();
    if (autoPlay) {
      video.play().catch(() => {
        // Autoplay may be blocked by the browser; native controls still work.
      });
    }
  };

  const handleElementError = () => {
    fail(describeMediaError(video.error));
  };

  video.addEventListener("loadedmetadata", handleLoadedMetadata);
  video.addEventListener("error", handleElementError);

  const handle: ClipPlayback = {
    destroy: () => {
      destroyed = true;
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("error", handleElementError);
      hls?.destroy();
      hls = null;
    },
  };

  const selectPath = async () => {
    const HlsCtor = await loadHls().catch(() => null);
    if (destroyed) return;

    if (HlsCtor?.isSupported()) {
      const instance = new HlsCtor();
      instance.loadSource(manifestUrl);
      instance.attachMedia(video);
      instance.on(HlsCtor.Events.ERROR, (_evt: unknown, data: HlsErrorData) => {
        if (destroyed) return;
        if (data.fatal) {
          fail(`Playback error: ${data.details ?? "unknown"}`);
          return;
        }
        // Non-fatal errors are the usual explanation for a "fetches but
        // nothing renders" symptom (`bufferAppendingError`,
        // `fragParsingError`, `levelLoadError`), which the user-facing
        // overlay would otherwise hide.
        console.warn("[Reactor.ClipPlayer] hls.js non-fatal error", data);
      });
      hls = instance;
      return;
    }

    if (video.canPlayType(HLS_MIME_TYPE) !== "") {
      video.src = manifestUrl;
      return;
    }

    fail(
      HlsCtor
        ? "This browser cannot play HLS clips. Use Download instead."
        : "HLS playback unavailable in this browser. Install `hls.js` as a peer dependency, or use Download."
    );
  };

  selectPath().catch((err: unknown) => {
    fail(err instanceof Error ? err.message : String(err));
  });

  return handle;
}

const MEDIA_ERROR_MESSAGES: Record<number, string> = {
  1: "Playback was aborted.",
  2: "A network error interrupted playback.",
  3: "This clip could not be decoded.",
  4: "This browser cannot play this clip. Use Download instead.",
};

/**
 * Turn the element's `MediaError` into displayable text, keeping the
 * browser's own diagnostic (`DEMUXER_ERROR_...` and friends) when it
 * provides one.
 */
function describeMediaError(error: MediaError | null): string {
  const message =
    (error && MEDIA_ERROR_MESSAGES[error.code]) ??
    "This clip failed to play in this browser. Use Download instead.";
  return error?.message ? `${message} (${error.message})` : message;
}

// ─────────────────────────────────────────────────────────────────────────────
// Minimal local typings for the optional `hls.js` peer dep.  We
// can't `import type { Hls } from "hls.js"` because the dep is
// optional — that import would fail in environments where it
// isn't installed.  The structural types below cover exactly the
// surface this module uses.
// ─────────────────────────────────────────────────────────────────────────────

export interface HlsInstance {
  loadSource: (url: string) => void;
  attachMedia: (el: HTMLMediaElement) => void;
  on: (event: string, cb: (evt: unknown, data: HlsErrorData) => void) => void;
  destroy: () => void;
}

export interface HlsConstructor {
  new (): HlsInstance;
  isSupported: () => boolean;
  readonly Events: {
    readonly ERROR: string;
  };
}

export interface HlsErrorData {
  fatal?: boolean;
  details?: string;
}
