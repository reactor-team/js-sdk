// Copyright (c) 2024-2026 Reactor Technologies, Inc.
// SPDX-License-Identifier: Apache-2.0
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  RecordingError,
  downloadClipAsFile,
  type Clip,
} from "../utils/recording";

/**
 * State machine for an in-progress clip download.
 *
 * - ``idle``: no download in flight (initial state, and what the hook
 *   returns to after a successful save).
 * - ``downloading``: chunks are being fetched.  ``fetched`` and
 *   ``total`` count the number of chunks (init segment + media
 *   segments) — useful for a progress bar.  ``total`` is 0 until the
 *   manifest is parsed and the chunk count is known.
 * - ``error``: most recent attempt failed; the ``message`` is suitable
 *   for surfacing inline.  ``RecordingError`` instances are formatted
 *   as ``"<CODE>: <reason>"`` for grep-ability.
 */
export type ClipDownloadState =
  | { kind: "idle" }
  | { kind: "downloading"; fetched: number; total: number }
  | { kind: "error"; message: string };

export interface UseClipDownloadOptions {
  /**
   * Filename used when the browser save dialog opens.  Pass ``null``
   * to skip the ``<a download>`` trigger entirely — the returned
   * Blob is still resolved so the caller can ``URL.createObjectURL``
   * it or re-upload it.  Default ``"reactor-clip.mp4"``.
   */
  filename?: string | null;
  /**
   * Lazy resolver for the Coordinator JWT used on the ``/clips``
   * manifest GET.  Called on every {@link download} invocation, so
   * token refreshes are picked up automatically.  Omit in local-dev
   * mode (HttpRuntime has no auth on ``/clips``).  See
   * {@link ClipPlayerProps.getJwt} for the production / local
   * distinction.
   */
  getJwt?: () => string | Promise<string>;
}

export interface UseClipDownloadResult {
  /** Current state of the most recent download attempt. */
  state: ClipDownloadState;
  /**
   * Trigger a download.  Resolves with the assembled fragmented-MP4
   * Blob, or ``undefined`` if a download was already in flight (the
   * call is a no-op in that case — guarding against double-click is
   * the hook's responsibility, not the caller's).
   *
   * Errors are caught and surfaced via {@link state} — the returned
   * Promise still resolves to ``undefined`` rather than rejecting,
   * because the typical caller is a click handler that doesn't await.
   * Use ``state.kind === "error"`` to drive failure UI.
   */
  download: () => Promise<Blob | undefined>;
  /** Reset to ``idle``.  Does *not* cancel an in-flight download. */
  reset: () => void;
}

/**
 * Headless download primitive for a {@link Clip}.
 *
 * Wraps {@link downloadClipAsFile} in a React state machine so the
 * consumer can render any button they want, anywhere they want, and
 * still get progress + error feedback.  Used internally by
 * {@link ClipPlayer}'s built-in download button — when you need
 * custom placement or styling, set ``showDownloadButton={false}`` on
 * the player and call this hook directly.
 *
 * Stable callback identity: ``download`` and ``reset`` are the same
 * function reference across renders, so they're safe to pass through
 * memoized children without forcing re-renders.
 *
 * @example Render a download button anywhere in your tree:
 * ```tsx
 * function ClipCard({ clip }: { clip: Clip }) {
 *   const jwt = useReactor((s) => s.jwtToken);
 *   const { state, download } = useClipDownload(clip, {
 *     filename: `snap-${clip.sessionId}.mp4`,
 *     getJwt: jwt ? () => jwt : undefined,
 *   });
 *   return (
 *     <button onClick={download} disabled={state.kind === "downloading"}>
 *       {state.kind === "downloading"
 *         ? `${state.fetched}/${state.total}`
 *         : state.kind === "error"
 *           ? "Retry"
 *           : "Download"}
 *     </button>
 *   );
 * }
 * ```
 */
export function useClipDownload(
  clip: Clip,
  options: UseClipDownloadOptions = {}
): UseClipDownloadResult {
  const [state, setState] = useState<ClipDownloadState>({ kind: "idle" });

  // Latest-value refs so `download` can be a stable callback (empty
  // deps) without forcing the caller to memoize `clip` / `options`.
  // This is the same pattern the SDK uses elsewhere (see
  // useReactorMessage in hooks.ts).
  const clipRef = useRef(clip);
  const filenameRef = useRef<string | null>(
    options.filename ?? "reactor-clip.mp4"
  );
  const getJwtRef = useRef(options.getJwt);
  useEffect(() => {
    clipRef.current = clip;
    filenameRef.current =
      options.filename === undefined ? "reactor-clip.mp4" : options.filename;
    getJwtRef.current = options.getJwt;
  });

  // Re-entrancy guard.  Lives in a ref (not state) so back-to-back
  // synchronous clicks before the first `setState` flushes are still
  // handled correctly.
  const inFlightRef = useRef(false);

  const download = useCallback(async (): Promise<Blob | undefined> => {
    if (inFlightRef.current) return undefined;
    inFlightRef.current = true;
    setState({ kind: "downloading", fetched: 0, total: 0 });
    try {
      const jwt = getJwtRef.current ? await getJwtRef.current() : undefined;
      const blob = await downloadClipAsFile(
        clipRef.current,
        filenameRef.current,
        {
          jwt,
          onProgress: ({ fetched, total }) =>
            setState({ kind: "downloading", fetched, total }),
        }
      );
      setState({ kind: "idle" });
      return blob;
    } catch (err) {
      const message =
        err instanceof RecordingError
          ? `${err.code}: ${err.reason}`
          : err instanceof Error
            ? err.message
            : String(err);
      setState({ kind: "error", message });
      return undefined;
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  const reset = useCallback(() => setState({ kind: "idle" }), []);

  return { state, download, reset };
}
