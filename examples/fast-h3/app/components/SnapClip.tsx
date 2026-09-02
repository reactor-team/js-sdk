"use client";

import { useState } from "react";
import { useFastH3 } from "@reactor-models/fast-h3";

// Capture the last N seconds of the live stream as an MP4 download. The
// recording surface (requestClip / downloadClipAsFile) is model-agnostic —
// the typed hook re-exports it from the base SDK, so no direct
// @reactor-team/js-sdk import is needed. Clip URLs are short-lived (a few
// minutes); the download is the artifact, not the URL.
const CLIP_SECONDS = 10;

export function SnapClip() {
  const { status, requestClip, downloadClipAsFile } = useFastH3();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status !== "ready") return null;

  async function capture() {
    setBusy(true);
    setError(null);
    try {
      const clip = await requestClip(CLIP_SECONDS);
      await downloadClipAsFile(clip, "fast-h3-clip.mp4");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Snap a clip
        </h2>
        <button
          onClick={() => void capture()}
          disabled={busy}
          className="rounded-md border border-zinc-700 px-3 py-1 text-xs text-zinc-300 disabled:opacity-40"
        >
          {busy ? "Capturing…" : `Capture last ${CLIP_SECONDS}s`}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}
