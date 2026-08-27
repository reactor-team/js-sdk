"use client";

import { useEffect, useRef } from "react";
import { useViskoOrbisDistilledTrack } from "@reactor-models/visko-orbis-distilled";

// Renders the model's main_audio track as a hidden, MUTED-BY-DEFAULT
// <audio> element and keeps it fed with the live MediaStream.
//
// main_audio is a real recvonly track (48 kHz mono, samples emitted
// chunk-aligned with main_video). A client that never wants audio can
// omit it from the track mapping at connect time — but this example
// subscribes so the AudioPanel's mute/unmute hint has something real
// behind it.
//
// Why a separate element and not audio on the <video>? The two are
// independent tracks on one peer connection; attaching the audio stream
// to its own <audio> element is the reliable cross-browser pattern (and
// lets us keep `muted` entirely under the user's control).
//
// Autoplay: `autoPlay` on a muted element is allowed by every browser's
// autoplay policy, so playback starts silently and the user unmutes via
// the element's native volume UI once we expose controls. We expose
// `controls` so the unmute affordance is the browser's own.
export function AudioOutlet() {
  const audioTrack = useViskoOrbisDistilledTrack("main_audio");
  const ref = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !audioTrack) return;
    const stream = new MediaStream([audioTrack]);
    el.srcObject = stream;
    el.play().catch(() => {
      // Autoplay hiccups are benign here — the element is muted anyway;
      // the next user gesture will let play() resolve.
    });
    return () => {
      el.srcObject = null;
    };
  }, [audioTrack]);

  return (
    <audio
      ref={ref}
      autoPlay
      playsInline
      muted
      className="hidden"
      aria-hidden="true"
    />
  );
}
