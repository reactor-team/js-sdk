"use client";

import React from "react";
import type { Clip } from "../utils/recording";
import { useClipDownload, type ClipDownloadState } from "./useClipDownload";

/**
 * Standalone download button for a captured {@link Clip}.
 *
 * Drops anywhere in your UI — modal headers, list rows, hover menus,
 * floating action buttons — and is responsible for nothing more than
 * triggering a download and reflecting its state.  Internally wraps
 * {@link useClipDownload}; for completely custom UIs (progress bars,
 * menu items, post-download blob handling) call that hook directly.
 *
 * Styling is intentionally minimal.  Override via ``className``,
 * ``style``, or replace the inner content with the ``children``
 * render-prop.  No CSS file is shipped — every default style is
 * inline so it loses to anything the consumer provides.
 *
 * @example Inside a `ReactorProvider` (JWT inherited from provider):
 * ```tsx
 * <ReactorProvider getJwt={() => clerk.getToken({ template: "reactor" })}>
 *   <ClipDownloadButton clip={clip} />
 * </ReactorProvider>
 * ```
 *
 * @example Default label, state-aware (explicit getJwt):
 * ```tsx
 * <ClipDownloadButton clip={clip} getJwt={() => jwt} />
 * ```
 *
 * @example Custom label that follows the state:
 * ```tsx
 * <ClipDownloadButton clip={clip} getJwt={() => jwt}>
 *   {(s) => (s.kind === "downloading" ? `${s.fetched}/${s.total}` : "Save MP4")}
 * </ClipDownloadButton>
 * ```
 *
 * @example Static label:
 * ```tsx
 * <ClipDownloadButton clip={clip} getJwt={() => jwt}>Save</ClipDownloadButton>
 * ```
 */
export interface ClipDownloadButtonProps {
  /** The clip to download. */
  clip: Clip;
  /**
   * Lazy JWT resolver. Optional when rendered inside a
   * ``<ReactorProvider>`` — the button falls back to the
   * provider's resolver via {@link useClipDownload}'s context
   * fallback. See {@link ClipPlayerProps.getJwt} for the
   * production / local-dev distinction. Omit in local-dev mode.
   */
  getJwt?: () => string | Promise<string>;
  /** Filename for the saved MP4.  Default ``"reactor-clip.mp4"``. */
  filename?: string;
  /**
   * Inner content of the button.  Three forms:
   *
   * - **Omitted** — renders a sensible default label that follows
   *   the state (``"Download"`` / ``"Downloading 3/8…"`` / etc.).
   * - **`ReactNode`** — static label.  No state-driven text.
   * - **`(state) => ReactNode`** — state-aware render function;
   *   use for custom progress strings, spinners, etc.
   */
  children?: React.ReactNode | ((state: ClipDownloadState) => React.ReactNode);
  /** Forwarded to the underlying ``<button>``. */
  className?: string;
  /** Forwarded to the underlying ``<button>`` — merges *after* the defaults so each property overrides. */
  style?: React.CSSProperties;
  /** Forwarded to the underlying ``<button>``.  ORed with the internal "downloading" state. */
  disabled?: boolean;
}

export function ClipDownloadButton({
  clip,
  getJwt,
  filename = "reactor-clip.mp4",
  children,
  className,
  style,
  disabled,
}: ClipDownloadButtonProps) {
  const { state, download } = useClipDownload(clip, { filename, getJwt });
  const downloading = state.kind === "downloading";
  const isDisabled = downloading || !!disabled;

  const content =
    typeof children === "function"
      ? children(state)
      : children !== undefined
        ? children
        : defaultLabel(state);

  return (
    <button
      type="button"
      onClick={() => {
        void download();
      }}
      disabled={isDisabled}
      title={state.kind === "error" ? state.message : undefined}
      className={className}
      style={{
        padding: "5px 12px",
        borderRadius: 4,
        border: "1px solid rgba(255,255,255,0.15)",
        background: "rgba(255,255,255,0.05)",
        color: "#fff",
        font: "11px ui-monospace, SFMono-Regular, Menlo, monospace",
        cursor: isDisabled ? "default" : "pointer",
        opacity: isDisabled ? 0.6 : 1,
        transition: "background-color 120ms ease",
        ...style,
      }}
    >
      {content}
    </button>
  );
}

function defaultLabel(state: ClipDownloadState): React.ReactNode {
  if (state.kind === "downloading") {
    if (state.total > 0) {
      return `Downloading ${state.fetched}/${state.total}…`;
    }
    return "Downloading…";
  }
  return "Download";
}
