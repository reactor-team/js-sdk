"use client";

import { useContext, useEffect, useRef, useState } from "react";
import React from "react";
import { ReactorContext } from "../core/store";
import {
  RecordingError,
  createPlayableManifestUrl,
  fetchPlaylist,
  type Clip,
} from "../utils/recording";

/**
 * Video preview for a captured {@link Clip}.
 *
 * Renders an HLS manifest through the browser's native
 * ``<video controls>`` element.  On Safari / iOS the manifest is
 * attached directly (native HLS support).  On Chrome / Firefox / Edge
 * ``hls.js`` is dynamically imported — declared as an **optional peer
 * dependency** so consumers who don't use this component aren't billed
 * the ~80 KB.  If ``hls.js`` isn't installed and native HLS isn't
 * available the player surfaces an inline error overlay; the
 * underlying chunks remain downloadable via {@link useClipDownload} /
 * {@link ClipDownloadButton} (which don't depend on hls.js at all).
 *
 * **Preview only.**  This component intentionally does *not* render a
 * download UI.  Compose it with {@link ClipDownloadButton} or build
 * your own download surface around {@link useClipDownload} — the
 * separation keeps both pieces independently extendible and avoids
 * baking layout decisions into the SDK.
 *
 * Unlike {@link ReactorView} / {@link WebcamStream} this component
 * **does not require a ``ReactorProvider``** in the tree.  It
 * operates on the ``Clip`` value alone, so it stays usable after
 * ``reactor.disconnect()`` and works with clips loaded from
 * fixtures, server logs, or any other source. When a
 * ``ReactorProvider`` is mounted above, an omitted ``getJwt``
 * inherits the provider's resolver.
 *
 * @example Compose with the download button (explicit `getJwt`):
 * ```tsx
 * <div>
 *   <ClipPlayer clip={clip} getJwt={() => jwt} />
 *   <ClipDownloadButton clip={clip} getJwt={() => jwt} />
 * </div>
 * ```
 *
 * @example Local dev (HttpRuntime, no auth on /clips):
 * ```tsx
 * <ClipPlayer clip={clip} />
 * ```
 */
export interface ClipPlayerProps {
  /**
   * The captured clip to play.  When this prop changes by reference
   * the player re-fetches the manifest and re-attaches the player.
   */
  clip: Clip;
  /**
   * Lazy resolver for the Coordinator JWT used on the ``/clips``
   * manifest GET. Called at request time so token refreshes are
   * picked up automatically.
   *
   * - **Production:** required outside a ``<ReactorProvider>``;
   *   optional inside one (inherits the provider's resolver).
   * - **Local-dev (HttpRuntime):** omit — ``/clips`` is auth-free.
   *
   * Chunk URLs inside the manifest are presigned (prod) or
   * unauthenticated (local) and are fetched without
   * ``Authorization`` in either case.
   */
  getJwt?: () => string | Promise<string>;
  /**
   * Opt into a *bounded* wait: give up polling the ``/clips`` manifest
   * endpoint with ``CLIP_NOT_READY`` once
   * ``max(clip.predictedReadyAtMs, pollStart) + slackMs`` passes.  By
   * default this is **unset** — the player polls indefinitely until the
   * clip is ready, and stops only when it unmounts or ``clip`` changes
   * (both abort the in-flight poll).  Set a value when you want a hard
   * ceiling (e.g. ``120_000`` for a two-minute cap).  Forwarded
   * directly to {@link fetchPlaylist}'s ``slackMs`` option — see that
   * helper for the polling semantics.
   */
  slackMs?: number;
  /** Play automatically once the manifest is attached. Default ``true``. */
  autoPlay?: boolean;
  /**
   * Start muted.  Default ``true`` because browser autoplay policies
   * block audio-bearing video from playing without a user gesture;
   * the user can unmute via the native ``<video controls>``.
   */
  muted?: boolean;
  className?: string;
  style?: React.CSSProperties;
  /**
   * Fires when the player enters its inline error state.  Receives
   * the originating error: a ``RecordingError`` for manifest-fetch
   * failures, a plain ``Error`` for hls.js / native playback or
   * missing-peer-dep cases.
   */
  onError?: (error: Error) => void;
}

type Phase =
  | { kind: "waiting" }
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "error"; message: string; error: Error };

export function ClipPlayer({
  clip,
  getJwt,
  slackMs,
  autoPlay = true,
  muted = true,
  className,
  style,
  onError,
}: ClipPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "waiting" });

  // `undefined` outside a `<ReactorProvider>`; used to inherit the
  // provider's JWT resolver when `getJwt` is omitted.
  const store = useContext(ReactorContext);

  // The playback effect intentionally depends only on `clip`.  Callers
  // typically pass an inline `getJwt={() => token}` that changes
  // identity on every render — using it directly in the effect deps
  // would tear down the player and re-fetch the manifest on every
  // parent re-render (visible to the user as "keeps fetching, never
  // shows").  Same reasoning for `autoPlay`: it's only read at the
  // moment of attach.  Refs keep the latest values reachable from
  // inside the effect without forcing it to re-run.
  const getJwtRef = useRef(getJwt);
  const autoPlayRef = useRef(autoPlay);
  const slackMsRef = useRef(slackMs);
  const onErrorRef = useRef(onError);
  // Same ref pattern: the resolver is looked up inside `setup` at
  // request time, so a provider swap is picked up on next attach
  // without tearing the player down.
  const storeRef = useRef(store);
  useEffect(() => {
    getJwtRef.current = getJwt;
    autoPlayRef.current = autoPlay;
    slackMsRef.current = slackMs;
    onErrorRef.current = onError;
    storeRef.current = store;
  });

  // Re-fires per error transition: each new `clip` resets through
  // `waiting` / `loading` before potentially re-entering `error`.
  useEffect(() => {
    if (phase.kind === "error") {
      onErrorRef.current?.(phase.error);
    }
  }, [phase]);

  // Playback pipeline: fetch manifest (with optional JWT) → wrap in
  // blob URL → attach via native HLS (Safari) or hls.js (everyone
  // else).  Re-runs only when `clip` changes by reference.  The
  // cleanup closure tears every piece down deterministically.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const abort = new AbortController();
    let cancelled = false;
    let hlsInstance: { destroy: () => void } | null = null;
    let manifestBlobUrl: string | null = null;

    const fail = (error: Error) => {
      if (cancelled) return;
      const message =
        error instanceof RecordingError
          ? `${error.code}: ${error.reason}`
          : error.message;
      setPhase({ kind: "error", message, error });
    };

    const attachPlayer = async (manifestUrl: string) => {
      const canPlayNative =
        video.canPlayType("application/vnd.apple.mpegurl") !== "";
      if (canPlayNative) {
        // Safari / iOS path — attach the blob: URL and let the
        // browser parse HLS natively.
        video.src = manifestUrl;
        if (autoPlayRef.current) {
          video.play().catch(() => {
            // Autoplay may be blocked by the browser; native controls still work.
          });
        }
        if (!cancelled) setPhase({ kind: "ready" });
        return;
      }

      // Non-Safari path — dynamic import of the optional peer
      // dependency.  Bundlers preserve `import()` so the chunk is
      // only fetched when this branch executes.
      let HlsCtor: HlsConstructor;
      try {
        const mod = (await import("hls.js")) as { default: HlsConstructor };
        HlsCtor = mod.default;
      } catch {
        fail(
          new Error(
            "HLS playback unavailable in this browser. Install `hls.js` as a peer dependency, or use Download."
          )
        );
        return;
      }
      if (cancelled) return;
      if (!HlsCtor.isSupported()) {
        fail(
          new Error("This browser cannot play HLS clips. Use Download instead.")
        );
        return;
      }
      const hls = new HlsCtor();
      hls.loadSource(manifestUrl);
      hls.attachMedia(video);
      hls.on(HlsCtor.Events.MANIFEST_PARSED, () => {
        if (cancelled) return;
        setPhase({ kind: "ready" });
        if (autoPlayRef.current) {
          video.play().catch(() => {
            // Autoplay may be blocked.
          });
        }
      });
      hls.on(HlsCtor.Events.ERROR, (_evt: unknown, data: HlsErrorData) => {
        if (cancelled) return;
        // Surface non-fatal errors via `console.warn` — they often
        // explain "fetches but nothing renders" symptoms (e.g.
        // `bufferAppendingError`, `fragParsingError`,
        // `levelLoadError`) that the user-facing overlay would
        // otherwise hide.  Fatal errors still hard-fail the player.
        if (data.fatal) {
          fail(new Error(`Playback error: ${data.details ?? "unknown"}`));
          return;
        }
        console.warn("[Reactor.ClipPlayer] hls.js non-fatal error", data);
      });
      hlsInstance = hls;
    };

    const setup = async () => {
      try {
        setPhase({ kind: "waiting" });
        // Explicit `getJwt` wins; fall back to the provider's resolver.
        const explicit = getJwtRef.current;
        const fallback = storeRef.current
          ?.getState()
          .internal.reactor.getJwtResolver();
        const resolver = explicit ?? fallback;
        const jwt = resolver ? await resolver() : undefined;
        if (cancelled) return;
        const body = await fetchPlaylist(clip.playlistUrl, {
          predictedReadyAtMs: clip.predictedReadyAtMs,
          slackMs: slackMsRef.current,
          jwt,
          signal: abort.signal,
        });
        if (cancelled) return;
        setPhase({ kind: "loading" });
        manifestBlobUrl = createPlayableManifestUrl(body, clip.playlistUrl);
        await attachPlayer(manifestBlobUrl);
      } catch (err) {
        if (cancelled) return;
        // `AbortError` from teardown is expected — don't paint it as
        // a failure to the user.
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        fail(err instanceof Error ? err : new Error(String(err)));
      }
    };

    setup();

    return () => {
      cancelled = true;
      abort.abort();
      hlsInstance?.destroy();
      video.pause();
      video.removeAttribute("src");
      video.load();
      if (manifestBlobUrl) URL.revokeObjectURL(manifestBlobUrl);
    };
  }, [clip]);

  const overlayText =
    phase.kind === "waiting"
      ? "Waiting for clip…"
      : phase.kind === "loading"
        ? "Loading player…"
        : null;

  return (
    <div
      className={className}
      style={{
        position: "relative",
        background: "#000",
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        ...style,
      }}
    >
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        ref={videoRef}
        controls
        playsInline
        muted={muted}
        style={{
          display: "block",
          width: "100%",
          height: "auto",
          maxHeight: "100%",
        }}
      />

      {overlayText && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "rgba(255,255,255,0.6)",
            font: "11px ui-monospace, SFMono-Regular, Menlo, monospace",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            pointerEvents: "none",
          }}
        >
          {overlayText}
        </div>
      )}

      {phase.kind === "error" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            background: "rgba(0,0,0,0.8)",
            color: "#ef4444",
            font: "11px ui-monospace, SFMono-Regular, Menlo, monospace",
            textAlign: "center",
          }}
        >
          {phase.message}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Minimal local typings for the optional `hls.js` peer dep.  We
// can't `import type { Hls } from "hls.js"` because the dep is
// optional — that import would fail in environments where it
// isn't installed.  The structural type below covers exactly the
// surface this component uses.
// ─────────────────────────────────────────────────────────────────────────────

interface HlsInstance {
  loadSource: (url: string) => void;
  attachMedia: (el: HTMLMediaElement) => void;
  on: (event: string, cb: (evt: unknown, data: HlsErrorData) => void) => void;
  destroy: () => void;
}

interface HlsConstructor {
  new (): HlsInstance;
  isSupported: () => boolean;
  readonly Events: {
    readonly MANIFEST_PARSED: string;
    readonly ERROR: string;
  };
}

interface HlsErrorData {
  fatal?: boolean;
  details?: string;
}
