"use client";

import { useEffect, useState } from "react";
import {
  useViskoOrbisDynamic,
  useViskoState,
  useGenerationComplete,
  sendStart,
  sendPause,
  sendResume,
  sendReset,
  preferredPrompt,
  type StateMessage,
} from "../lib/visko";

// Live-phase panel. The transport + current-run readout a reader reaches
// for once a generation is going.
//
// Reads the model's `state` message — after every command and every chunk
// the model emits the WHOLE current state; never aggregate chunk counts
// yourself. This component holds the latest snapshot and self-hides when
// nothing's generating (the PromptComposer / ImageStarter setup surface
// takes over instead — that's the phase switch).
//
// One extra lifecycle this model handles that others don't: when a run
// hits `max_chunks` the model emits `generation_complete` and returns to
// WAITING — it does NOT auto-restart (a surprise new run would be a hard
// cut). The "Run finished" CTA below exists for exactly that moment.
export function NowPlaying() {
  const s = useViskoOrbisDynamic();
  const status = s.status;
  const [snapshot, setSnapshot] = useState<StateMessage | null>(null);
  const [finished, setFinished] = useState(false);
  const [morphedAt, setMorphedAt] = useState<number | null>(null);

  useViskoState((msg) => setSnapshot(msg));
  useGenerationComplete(() => setFinished(true));

  // Confirm a mid-run morph actually landed (the hero feature reads as
  // "didn't work" if the visual doesn't shift in one chunk boundary).
  //
  // INTENTIONAL SILENCE: no `on('prompt_accepted')` listener. On js-sdk
  // 3.0.0 ack messages are correlated replies to the caller's await and
  // never broadcast — a listener would compile, subscribe, and never fire.
  // We don't need it: the `state` snapshot (emitted after every
  // set_prompt) flips current_prompt with the chunk already counted — and,
  // unlike the old broadcast which fired BEFORE the state snapshot, it
  // marks the settled chunk index. Stamp once per change.
  //
  // `current_prompt` was dropped from 1.4.0's state snapshot, so the
  // user's own words (pinned at send-time) are the only honest display.
  const currentPrompt = preferredPrompt(null);
  useEffect(() => {
    if (snapshot?.started && currentPrompt) {
      setMorphedAt(snapshot.current_chunk ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPrompt]);

  useEffect(() => {
    if (status !== "ready") {
      setSnapshot(null);
      setFinished(false);
      setMorphedAt(null);
    }
  }, [status]);
  useEffect(() => {
    if (snapshot?.started) setFinished(false);
    else setMorphedAt(null);
  }, [snapshot?.started]);

  if (status !== "ready" || !snapshot?.started) return null;

  const runState = snapshot.running
    ? "running"
    : snapshot.paused
      ? "paused"
      : "idle";

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
      <span className="text-[10px] uppercase tracking-wider text-zinc-500">
        Now playing · {runState}
      </span>

      <p className="mt-2 line-clamp-3 text-sm leading-snug text-zinc-200">
        {currentPrompt || "(no prompt yet)"}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-500">
        <span>chunk {snapshot.current_chunk}</span>
        {morphedAt !== null && (
          <>
            <span>·</span>
            <span className="text-brand">morphed @ chunk {morphedAt}</span>
          </>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {snapshot.running ? (
          <button
            onClick={() => sendPause(s)}
            className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-800"
          >
            Pause
          </button>
        ) : (
          <button
            onClick={() => sendResume(s)}
            className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-brand-fg hover:opacity-90"
          >
            Resume
          </button>
        )}
        <button
          onClick={() => sendReset(s)}
          className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm font-medium text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
        >
          Reset
        </button>
      </div>

      {finished && (
        <div className="mt-3 rounded-md border border-amber-900/50 bg-amber-950/20 p-3">
          <p className="text-xs font-medium text-amber-300">Run finished</p>
          <p className="mt-1 text-[11px] leading-snug text-amber-200/70">
            The model returned to waiting — it doesn&apos;t roll into a new run
            on its own.
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              onClick={() => sendStart(s)}
              className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-brand-fg hover:opacity-90"
            >
              Start again
            </button>
            <button
              onClick={() => sendReset(s)}
              className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
            >
              Reset scene
            </button>
          </div>
          <p className="mt-2 text-[10px] leading-snug text-zinc-600">
            Start again keeps the same prompt, image, resolution &amp; audio —
            they all survive a finished run. Reset clears prompt + image.
          </p>
        </div>
      )}
    </div>
  );
}
