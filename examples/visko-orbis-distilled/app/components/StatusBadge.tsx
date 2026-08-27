"use client";

import { useEffect, useState } from "react";
import {
  useViskoOrbisDistilled,
  useViskoOrbisDistilledGenerationStarted,
  useViskoOrbisDistilledTrack,
} from "@reactor-models/visko-orbis-distilled";

// The status badge surfaces the four-state connection machine:
//   disconnected → connecting → waiting → ready
//
// Every state is shown explicitly so the user sees the transitions
// rather than staring at an unexplained spinner.
//
// TWO slow phases live behind this badge, and both need honest labels
// because they take long enough that a bare spinner reads as "broken":
//
//   - `connecting` / `waiting` — the coordinator is placing the session.
//     On PROD the deployment has ONE schedulable replica (one live
//     session per pod), and Visko Orbis pays a real startup cost: the
//     super-resolution model compiles, then the model runs THREE WARMUP
//     CHUNKS before the session accepts commands. This is MINUTES.
//
//   - "Priming" — after `start` succeeds, the FIRST chunk emits ZERO
//     frames (frames_emitted: 0) while the SR model primes. First
//     picture lands ~2 chunks / ~3.7 s in. We surface it as a real state
//     instead of letting the user stare at a black panel.
const TONE: Record<string, { dot: string; label: string }> = {
  disconnected: { dot: "bg-zinc-500", label: "Disconnected" },
  connecting: { dot: "bg-amber-400 animate-pulse", label: "Placing session…" },
  waiting: {
    dot: "bg-amber-400 animate-pulse",
    label: "Starting up (SR compile + warmup)…",
  },
  priming: {
    dot: "bg-amber-400 animate-pulse",
    label: "Priming stream — first frames incoming…",
  },
  ready: { dot: "bg-active", label: "Connected" },
};

export function StatusBadge() {
  const { status, lastError, connect, disconnect } = useViskoOrbisDistilled();
  const [priming, setPriming] = useState(false);
  const videoTrack = useViskoOrbisDistilledTrack("main_video");

  useViskoOrbisDistilledGenerationStarted(() => setPriming(true));

  // Clear the priming overlay as soon as the video track is actually
  // delivering (or if the session drops).
  useEffect(() => {
    if (videoTrack || status !== "ready") setPriming(false);
  }, [videoTrack, status]);

  const effective = priming && status === "ready" ? "priming" : status;
  const tone = TONE[effective] ?? TONE.disconnected;
  const idle = status === "disconnected";

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${tone.dot}`} />
          <span className="text-sm text-zinc-200">{tone.label}</span>
        </div>
        {idle ? (
          <button
            onClick={() => connect()}
            className="rounded-md bg-brand px-3 py-1 text-xs font-medium text-brand-fg hover:opacity-90"
          >
            Connect
          </button>
        ) : (
          <button
            onClick={() => disconnect()}
            className="rounded-md border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            Disconnect
          </button>
        )}
      </div>

      {(status === "connecting" || status === "waiting") && (
        <p className="mt-2 text-[11px] leading-snug text-zinc-500">
          Cold-starting a GPU session — super-resolution compile plus three
          warmup chunks. Usually a few minutes. PROD runs one live session per
          deployment: if this hangs in{" "}
          <span className="font-mono">waiting</span>, another tab (or a zombie
          session) is holding the pod.
        </p>
      )}

      {lastError && (
        <p className="mt-2 text-xs text-red-400">{lastError.message}</p>
      )}
    </div>
  );
}
