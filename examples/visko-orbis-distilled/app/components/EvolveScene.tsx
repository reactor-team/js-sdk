"use client";

import { useEffect, useState } from "react";
import {
  useViskoOrbisDistilled,
  useViskoOrbisDistilledState,
  type ViskoOrbisDistilledStateMessage,
} from "@reactor-models/visko-orbis-distilled";
import { findSceneForPrompt } from "../lib/prompts";

// Live-phase panel — the hero surface for this model.
//
// Visko Orbis Distilled prompts are PER-CHUNK: calling `set_prompt`
// mid-run morphs the picture into the new description at the next chunk
// boundary (~1.8 s), with no restart and no cut. This is the capability
// the model is being productized around, so it gets the most prominent
// live-phase panel.
//
// We look up which scene the session belongs to by matching the active
// `current_prompt` against our curated library (see `lib/prompts.ts`).
// If it matches a known scene's `initial` or any of its `evolutions`,
// we render that scene's evolution list as one-click morphs. Each
// evolution keeps the SAME setting/subject and shifts conditions (time
// of day, weather, light) — continuity is what makes the morph read as
// cinematography instead of a glitch.
//
// If the user typed a custom prompt we don't recognise, the curated
// list disappears — but the user can still steer free-form, so we keep
// a small free-form box at the bottom for that.
export function EvolveScene() {
  const { status, setPrompt } = useViskoOrbisDistilled();
  const [snapshot, setSnapshot] =
    useState<ViskoOrbisDistilledStateMessage | null>(null);
  const [custom, setCustom] = useState("");

  useViskoOrbisDistilledState((msg) => setSnapshot(msg));

  useEffect(() => {
    if (status !== "ready") setSnapshot(null);
  }, [status]);

  if (status !== "ready" || !snapshot?.started) return null;

  const currentPrompt =
    typeof snapshot.current_prompt === "string" ? snapshot.current_prompt : "";
  const scene = findSceneForPrompt(currentPrompt);

  async function steer(prompt: string) {
    const p = prompt.trim();
    if (!p) return;
    await setPrompt({ prompt: p });
  }

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
      <label className="text-[10px] uppercase tracking-wider text-zinc-500">
        Steer the scene live
      </label>
      <p className="mt-1 text-[11px] leading-snug text-zinc-600">
        Morphs at the next chunk boundary — no restart, no cut.
      </p>

      {scene && (
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          {scene.evolutions.map((evolution) => {
            const active = currentPrompt === evolution.text;
            return (
              <button
                key={evolution.title}
                onClick={() => steer(evolution.text)}
                disabled={active}
                className={`group rounded-md border p-2 text-left transition-colors ${
                  active
                    ? "border-brand bg-zinc-900"
                    : "border-zinc-800 bg-zinc-950 hover:border-brand"
                }`}
                title={evolution.text}
              >
                <div
                  className={`text-[11px] font-medium ${
                    active
                      ? "text-brand"
                      : "text-zinc-200 group-hover:text-brand"
                  }`}
                >
                  {evolution.title}
                </div>
                <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-zinc-500">
                  {evolution.text}
                </p>
              </button>
            );
          })}
        </div>
      )}

      <textarea
        value={custom}
        onChange={(e) => setCustom(e.target.value)}
        placeholder="…or type any new scene and morph to it"
        rows={2}
        className="mt-2 w-full resize-none rounded-md border border-zinc-800 bg-zinc-950 p-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-brand focus:outline-none"
      />
      <button
        disabled={!custom.trim()}
        onClick={async () => {
          await steer(custom);
          setCustom("");
        }}
        className="mt-2 w-full rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-brand-fg hover:opacity-90 disabled:opacity-40"
      >
        Morph to this scene
      </button>
    </div>
  );
}
