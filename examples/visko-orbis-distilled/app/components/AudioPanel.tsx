"use client";

import { useEffect, useState } from "react";
import {
  useViskoOrbisDistilled,
  useViskoOrbisDistilledState,
  type ViskoOrbisDistilledStateMessage,
} from "@reactor-models/visko-orbis-distilled";

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
//   2. HEAR sound (the <audio> element's muted flag). Purely local playback,
//      no command. Starts MUTED (browsers block unmuted autoplay anyway,
//      and the user opts in to sound).
//
// DELIBERATELY ABSENT: a free-form `set_audio_prompt` box. Measured
// guidance is that feeding the scene description into the audio model
// makes the audio WORSE than leaving it unset (unset = audio generated
// from the picture alone). Exposing the box would invite exactly that
// mistake, so the example leaves it out and says why.
export function AudioPanel() {
  const { status, setAudioEnabled } = useViskoOrbisDistilled();
  const [snapshot, setSnapshot] =
    useState<ViskoOrbisDistilledStateMessage | null>(null);

  useViskoOrbisDistilledState((msg) => setSnapshot(msg));

  useEffect(() => {
    if (status !== "ready") setSnapshot(null);
  }, [status]);

  if (status !== "ready") return null;

  const started = snapshot?.started === true;
  const audioOn = snapshot?.audio_enabled !== false; // default true

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
      <label className="text-[10px] uppercase tracking-wider text-zinc-500">
        Audio
      </label>

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-xs text-zinc-400">Generate sound on runs</span>
        <button
          onClick={() => setAudioEnabled({ audio_enabled: !audioOn })}
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

      <p className="mt-2 text-[11px] leading-snug text-zinc-600">
        Playback starts <span className="text-zinc-400">muted</span> — use your
        browser&apos;s volume control on the stream to listen. We don&apos;t set
        an audio prompt: measured to sound better generated from the picture
        alone.
      </p>
    </div>
  );
}
