"use client";

import { FastH3MainVideoView } from "@reactor-models/fast-h3";

// The output surface: fast-h3's `main_video` with its synchronized
// `main_audio` attached. Between clips the model holds the stream on black —
// that's the contract, not a bug.
export function Video() {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-800 bg-black">
      <FastH3MainVideoView
        audioTrack="main_audio"
        className="aspect-video w-full"
      />
    </div>
  );
}
