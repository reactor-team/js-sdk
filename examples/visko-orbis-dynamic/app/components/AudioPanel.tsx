"use client";

import { useEffect, useState } from "react";
import {
  useViskoOrbisDynamic,
  useViskoState,
  sendSetAudioEnabled,
  type StateMessage,
} from "../lib/visko";

// Audio controls.
//
// main_audio is a REAL track — 48 kHz mono, samples chunk-aligned with
// main_video — so this example actually surfaces it instead of dropping
// it. Two distinct things are controlled here, and the panel keeps them
// separate because they live on different lifecycles:
//
//   1. GENERATE sound (set_audio_enabled). When off, the audio model is
//      skipped entirely and each chunk is cheaper to produce. Read once
//      when `start` fires → applies at the NEXT start, survives `reset`.
//
//   2. HEAR sound. Playback is LOCAL (the <video> element's mute) and by
//      default it just plays — starting a run always goes through a click
//      (a preset or "Start"), which is the gesture browser autoplay policies
//      need for sound. The rare no-gesture case (restored session) shows a
//      "Tap to enable audio" button in the video panel instead of failing
//      silently.
//
// DELIBERATELY ABSENT: a free-form `set_audio_prompt` box. Measured
// guidance is that feeding the scene description into the audio model
// makes the audio WORSE than leaving it unset (unset = audio generated
// from the picture alone). Exposing the box would invite exactly that
// mistake, so the example leaves it out and says why.
export function AudioPanel() {
  const s = useViskoOrbisDynamic();
  const status = s.status;
  const [snapshot, setSnapshot] = useState<StateMessage | null>(null);

  useViskoState((msg) => setSnapshot(msg));

  useEffect(() => {
    if (status !== "ready") setSnapshot(null);
  }, [status]);

  // Visible from page load. Interactions disabled until ready.

  const ready = status === "ready";
  const started = snapshot?.started ?? false;
  const audioOn = snapshot?.audio_enabled !== false; // default true

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
      <label className="text-[10px] uppercase tracking-wider text-zinc-500">
        Audio
      </label>

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-xs text-zinc-400">Generate sound</span>
        <button
          disabled={!ready}
          onClick={() => sendSetAudioEnabled(s, !audioOn)}
          className={`rounded-md border px-3 py-1 text-xs font-medium transition-colors ${
            audioOn
              ? "border-brand bg-zinc-900 text-brand"
              : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700"
          }`}
        >
          {audioOn ? "On" : "Off"}
        </button>
      </div>

      {started && (
        <p className="mt-1.5 text-[10px] leading-snug text-zinc-600">
          Applies at the next <span className="font-mono">start</span> — the
          current run keeps its audio setting.
        </p>
      )}
    </div>
  );
}
