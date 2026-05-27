import { useReactorStore } from "./ReactorProvider";
import type { ReactorStore } from "../core/store";
import type { ConnectionStats, ReactorError } from "../types";
import type { Clip, DownloadClipOptions } from "../utils/recording";
import { useShallow } from "zustand/shallow";
import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Generic hook for accessing selected parts of the Reactor store.
 *
 * @param selector - A function that selects part of the store state.
 * @returns The selected slice from the store.
 */
export function useReactor<T>(selector: (state: ReactorStore) => T): T {
  return useReactorStore(useShallow(selector));
}

/**
 * Hook for receiving model application messages.
 *
 * Only fires for messages sent by the model via `get_ctx().send()`.
 * Internal platform-level messages (e.g. capabilities) are NOT delivered here.
 *
 * @param handler - Callback invoked with each application message payload.
 */
export function useReactorMessage(handler: (message: any) => void): void {
  const reactor = useReactor((state) => state.internal.reactor);
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    const stableHandler = (message: any) => {
      handlerRef.current(message);
    };

    reactor.on("message", stableHandler);

    return () => {
      reactor.off("message", stableHandler);
    };
  }, [reactor]);
}

/**
 * Hook for receiving internal platform-level (runtime) messages.
 *
 * This is intended for advanced use cases that need access to the runtime
 * control layer, such as capabilities negotiation. Model application messages
 * sent via `get_ctx().send()` are NOT delivered through this hook — use
 * {@link useReactorMessage} for those.
 *
 * @param handler - Callback invoked with each runtime message payload.
 */
export function useReactorInternalMessage(
  handler: (message: any) => void
): void {
  const reactor = useReactor((state) => state.internal.reactor);
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    const stableHandler = (message: any) => {
      handlerRef.current(message);
    };

    reactor.on("runtimeMessage", stableHandler);

    return () => {
      reactor.off("runtimeMessage", stableHandler);
    };
  }, [reactor]);
}

/**
 * Hook that returns the current connection stats (RTT, etc.).
 * Updates every ~2s while connected. Returns undefined when disconnected.
 */
export function useStats(): ConnectionStats | undefined {
  const reactor = useReactor((state) => state.internal.reactor);
  const [stats, setStats] = useState<ConnectionStats | undefined>(undefined);

  useEffect(() => {
    const handler = (newStats: ConnectionStats) => {
      setStats(newStats);
    };

    reactor.on("statsUpdate", handler);

    return () => {
      reactor.off("statsUpdate", handler);
      setStats(undefined);
    };
  }, [reactor]);

  return stats;
}

/**
 * Hook for receiving {@link ReactorError} events from the underlying
 * Reactor as they happen — the push counterpart of
 * `useReactor((s) => s.lastError)`.
 *
 * Use this when you need to react to every error (e.g. fire a toast,
 * send telemetry) rather than just render the most recent one.  Same
 * stable-handler-via-ref idiom as {@link useReactorMessage}; the
 * supplied handler doesn't need to be memoised.
 *
 * @param handler - Callback invoked with each new {@link ReactorError}.
 */
export function useReactorError(handler: (error: ReactorError) => void): void {
  const reactor = useReactor((state) => state.internal.reactor);
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    const stableHandler = (error: ReactorError) => {
      handlerRef.current(error);
    };

    reactor.on("error", stableHandler);

    return () => {
      reactor.off("error", stableHandler);
    };
  }, [reactor]);
}

/**
 * Hook that returns the live `MediaStreamTrack` for a named recvonly
 * track, or `undefined` if the model hasn't published that track yet
 * (or the session is disconnected).
 *
 * Equivalent to `useReactor((s) => s.tracks[name])`, but reads better
 * at the call site and gives the SDK a single place to evolve track
 * delivery semantics in the future.
 *
 * @example Attach to a custom `<video>` element:
 * ```tsx
 * const track = useTrack("main_video");
 * useEffect(() => {
 *   if (!videoRef.current || !track) return;
 *   videoRef.current.srcObject = new MediaStream([track]);
 * }, [track]);
 * ```
 */
export function useTrack(name: string): MediaStreamTrack | undefined {
  return useReactor((state) => state.tracks[name]);
}

/**
 * Bundle of the three imperative recording actions —
 * `requestClip`, `requestRecording`, `downloadClipAsFile` — typed
 * against the underlying {@link Reactor} so consumers don't have to
 * thread `internal.reactor` through every clip-capture hook they
 * write.
 *
 * The returned object identity is stable across renders for as long
 * as the underlying Reactor instance is — safe to drop into
 * `useEffect` / `useCallback` dep arrays without re-running the
 * effect on every render.
 *
 * @example Capture a clip on demand and immediately download it:
 * ```tsx
 * const { requestClip, downloadClipAsFile } = useReactorRecording();
 *
 * const snap = useCallback(async () => {
 *   const clip = await requestClip(30);
 *   await downloadClipAsFile(clip, `snap-${Date.now()}.mp4`);
 * }, [requestClip, downloadClipAsFile]);
 * ```
 */
export interface ReactorRecording {
  /** See {@link Reactor.requestClip}. */
  requestClip: (durationSeconds: number) => Promise<Clip>;
  /** See {@link Reactor.requestRecording}. */
  requestRecording: () => Promise<Clip>;
  /** See {@link Reactor.downloadClipAsFile}. */
  downloadClipAsFile: (
    clip: Clip,
    filename?: string | null,
    options?: DownloadClipOptions
  ) => Promise<Blob>;
}

export function useReactorRecording(): ReactorRecording {
  const reactor = useReactor((state) => state.internal.reactor);
  return useMemo<ReactorRecording>(
    () => ({
      requestClip: (durationSeconds) => reactor.requestClip(durationSeconds),
      requestRecording: () => reactor.requestRecording(),
      downloadClipAsFile: (clip, filename, options) =>
        reactor.downloadClipAsFile(clip, filename, options),
    }),
    [reactor]
  );
}
