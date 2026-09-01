"use client";

import { useEffect, useState } from "react";
import {
  useViskoOrbisStable,
  useViskoState,
  sendSetResolution,
  sendSetSeed,
  type StateMessage,
} from "../lib/visko";

// Setup-phase panel: the per-run knobs that are read once when `start`
// fires and SURVIVE `reset` — resolution and seed.
//
// RESOLUTION: state-first. `snapshot.available_resolutions` is the source
// of truth when the deployment publishes it (named tiers like 1080p / 2k /
// 4k). When the list comes back empty, render the documented named tiers
// so the picker teaches the knob; if the deployment starts publishing its
// own list, it silently takes over (state-first is preserved).
//
// One nuance the UI is honest about: these are DELIVERY tiers. The model
// generates at its own internal size (832×480) and the delivery stage
// outputs the picked tier — picking 4k doesn't change what the model
// "dreams", only the output raster.
//
// SEED: the model never draws its own seed — same seed + same prompts
// reproduces the same video. Read once when `start` fires; changing it
// mid-run does nothing until `reset` + a new `start`.
export function SessionOptions() {
  const s = useViskoOrbisStable();
  const status = s.status;
  const [snapshot, setSnapshot] = useState<StateMessage | null>(null);
  const [seedText, setSeedText] = useState("");

  useViskoState((msg: StateMessage) => setSnapshot(msg));

  useEffect(() => {
    if (status !== "ready") setSnapshot(null);
  }, [status]);

  // Mirror the session seed into the box the first time we see it.
  useEffect(() => {
    if (snapshot && seedText === "" && typeof snapshot.seed === "number") {
      setSeedText(String(snapshot.seed));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot?.seed]);

  // Visible from page load. Interactions disabled until ready.

  const ready = status === "ready";

  // The deployment's offered list is the source of truth whenever it's
  // non-empty. When the list comes back empty, render the documented named
  // tiers so the picker teaches the knob; if the deployment starts
  // publishing its own list, it silently takes over (state-first is preserved).
  const DOCUMENTED_FALLBACK_RESOLUTIONS: readonly string[] = [
    "1080p",
    "2k",
    "4k",
  ] as const;

  // Rendered whenever connected (even mid-run) so the user can see what
  // the current run is using — but changing things mid-run only arms the
  // NEXT start, so we say so.
  const started = snapshot?.started ?? false;
  const fromState: string[] = Array.isArray(snapshot?.available_resolutions)
    ? snapshot!.available_resolutions.filter(
        (r: unknown): r is string => typeof r === "string",
      )
    : [];
  const resolutions =
    fromState.length > 0 ? fromState : [...DOCUMENTED_FALLBACK_RESOLUTIONS];
  const listIsFromState = fromState.length > 0;
  const activeResolution =
    typeof snapshot?.resolution === "string" ? snapshot.resolution : "";

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
      <label className="text-[10px] uppercase tracking-wider text-zinc-500">
        Session options
      </label>
      {started && (
        <p className="mt-1 text-[11px] leading-snug text-zinc-600">
          Applying at the next <span className="font-mono">start</span> — the
          running generation keeps what it started with.
        </p>
      )}

      {resolutions.length > 0 && (
        <>
          <span className="mt-3 block text-[11px] text-zinc-400">
            Delivery resolution
          </span>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {resolutions.map((r: string) => {
              const active = r === activeResolution;
              return (
                <button
                  key={r}
                  onClick={() => sendSetResolution(s, r)}
                  className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                    active
                      ? "border-brand bg-zinc-900 text-brand"
                      : "border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-brand"
                  }`}
                  disabled={!ready}
                >
                  {r}
                </button>
              );
            })}
          </div>
        </>
      )}

      <span className="mt-3 block text-[11px] text-zinc-400">Seed</span>
      <div className="mt-1.5 flex gap-1.5">
        <input
          value={seedText}
          onChange={(e) => setSeedText(e.target.value.replace(/[^0-9]/g, ""))}
          inputMode="numeric"
          placeholder="42"
          disabled={!ready}
          className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5 font-mono text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-brand focus:outline-none"
        />
        <button
          disabled={!ready || !seedText.trim()}
          onClick={() => sendSetSeed(s, parseInt(seedText, 10))}
          className="shrink-0 rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
        >
          Set
        </button>
      </div>
      <p className="mt-1.5 text-[10px] leading-snug text-zinc-600">
        Same seed + same prompts reproduces the same video. Applies at the next{" "}
        <span className="font-mono">start</span>.
      </p>
    </div>
  );
}
