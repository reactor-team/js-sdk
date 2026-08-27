"use client";

import { useEffect, useState } from "react";
import {
  ViskoOrbisDistilledMainVideoView,
  useViskoOrbisDistilledGenerationStarted,
  useViskoOrbisDistilledTrack,
} from "@reactor-models/visko-orbis-distilled";

// The whole right side of the screen — black rounded panel with the
// model's main_video track rendered pre-bound via
// <ViskoOrbisDistilledMainVideoView>. No refs, no srcObject, no autoplay
// tricks.
//
// The overlay covers the SR-priming window. The model's FIRST chunk
// emits 0 frames (frames_emitted: 0) while the super-resolution model
// primes, so `generation_started` arrives well before the first picture
// (~2 chunks, ~3.7 s). Rather than let the user stare at a black box and
// assume it broke, we hold a labelled overlay until the track actually
// delivers. StatusBadge reports the same "priming" phase so the two
// never disagree.
//
// AUDIO is deliberately NOT here. main_audio is a real 48 kHz mono track
// rendered by <AudioOutlet />, so this panel is video-only.
export function Video() {
  const [priming, setPriming] = useState(false);
  const videoTrack = useViskoOrbisDistilledTrack("main_video");

  useViskoOrbisDistilledGenerationStarted(() => setPriming(true));

  // Clear the priming overlay once the track is actually flowing (or if
  // the run stops). Doing it in an effect keeps render pure.
  useEffect(() => {
    if (videoTrack) setPriming(false);
  }, [videoTrack]);

  const showPriming = priming && !videoTrack;

  return (
    <div className="relative h-full min-h-[40vh] w-full overflow-hidden rounded-lg border border-zinc-800 bg-black lg:min-h-0">
      <ViskoOrbisDistilledMainVideoView
        className="h-full w-full"
        videoObjectFit="contain"
      />
      {showPriming && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/60">
          <div className="max-w-xs px-6 text-center">
            <p className="text-sm font-medium text-zinc-200">
              Priming the stream…
            </p>
            <p className="mt-1 text-xs leading-snug text-zinc-500">
              The first chunk emits zero frames while super-resolution warms up.
              First picture in a few seconds.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
