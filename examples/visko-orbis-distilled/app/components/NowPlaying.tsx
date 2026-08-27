"use client";

import { useEffect, useState } from "react";
import {
  useViskoOrbisDistilled,
  useViskoOrbisDistilledState,
  useViskoOrbisDistilledGenerationComplete,
  type ViskoOrbisDistilledStateMessage,
} from "@reactor-models/visko-orbis-distilled";

// Live-phase panel. Renders only once a run has started.
//
// Visko Orbis Distilled emits a `state` snapshot after every command and
// every completed chunk — the single source of truth for driving UI. We
// hold the latest in useState and read fields off it.
//
// The panel models one extra state the other examples don't: RUN
// COMPLETE. When the run reaches max_chunks the model emits
// `generation_complete` and returns to WAITING with `started: false` —
// it does NOT auto-restart (a new run begins at chunk 0, which is a hard
// visual cut, so issuing one unasked would be a surprise). At that point
// this panel shows a "Run finished" call-to-action: `start` again (same
// conditions) or `reset` to clear the prompt/image first.
export function NowPlaying() {
  const { status, start, pause, resume, reset } = useViskoOrbisDistilled();
  const [snapshot, setSnapshot] =
    useState<ViskoOrbisDistilledStateMessage | null>(null);
  const [finished, setFinished] = useState(false);

  useViskoOrbisDistilledState((msg) => setSnapshot(msg));

  useViskoOrbisDistilledGenerationComplete(() => setFinished(true));

  // Clear on disconnect, and clear the "finished" flag the moment a new
  // run starts (started flips true again).
  useEffect(() => {
    if (status !== "ready") {
      setSnapshot(null);
      setFinished(false);
    }
  }, [status]);
  useEffect(() => {
    if (snapshot?.started) setFinished(false);
  }, [snapshot?.started]);

  if (status !== "ready" || !snapshot?.started) return null;

  const currentPrompt =
    typeof snapshot.current_prompt === "string" ? snapshot.current_prompt : "";
  const runState = snapshot.running
    ? "running"
    : snapshot.paused
      ? "paused"
      : "idle";

  const res =
    typeof snapshot.resolution === "string" && snapshot.resolution
      ? snapshot.resolution
      : null;

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
      <span className="text-[10px] uppercase tracking-wider text-zinc-500">
        Now playing · {runState}
      </span>

      <p className="mt-2 line-clamp-3 text-sm leading-snug text-zinc-200">
        {currentPrompt || "(no prompt yet)"}
      </p>

      <div className="mt-3 flex gap-3 text-[11px] text-zinc-500">
        <span>chunk {snapshot.current_chunk}</span>
        {res && (
          <>
            <span>·</span>
            <span className="font-mono">{res}</span>
          </>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {snapshot.running ? (
          <button
            onClick={() => pause()}
            className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-800"
          >
            Pause
          </button>
        ) : (
          <button
            onClick={() => resume()}
            className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-brand-fg hover:opacity-90"
          >
            Resume
          </button>
        )}
        <button
          onClick={() => reset()}
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
              onClick={() => start()}
              className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-brand-fg hover:opacity-90"
            >
              Start again
            </button>
            <button
              onClick={() => reset()}
              className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
            >
              Reset scene
            </button>
          </div>
          <p className="mt-2 text-[10px] leading-snug text-zinc-600">
            Start again keeps the same prompt, image, resolution &amp; audio —
            they all survive a finished run. Reset clears prompt + image
            (resolution &amp; audio survive reset too).
          </p>
        </div>
      )}
    </div>
  );
}
