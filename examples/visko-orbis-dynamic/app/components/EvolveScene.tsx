"use client";

import { useEffect, useState } from "react";
import {
  useViskoOrbisDynamic,
  useViskoState,
  sendSetPrompt,
  preferredPrompt,
  type StateMessage,
} from "../lib/visko";
import { findSceneForPrompt } from "../lib/prompts";

// Live-phase panel — the hero surface for this model.
//
// Visko Orbis Stable prompts are PER-CHUNK: calling `set_prompt`
// mid-run morphs the picture into the new description at the next chunk
// boundary (~1.8 s), with no restart and no cut. This is the capability
// the model is being productized around, so it gets the most prominent
// live-phase panel.
//
// We look up which scene the session belongs to by matching the active
// `current_prompt` against our curated library (see `app/lib/prompts.ts`).
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
  const s = useViskoOrbisDynamic();
  const status = s.status;
  const [snapshot, setSnapshot] = useState<StateMessage | null>(null);
  const [custom, setCustom] = useState("");
  // A morph that doesn't visibly land within one chunk boundary can
  // read as "didn't work". Track the in-flight morph: set on click, cleared
  // when the awaited set_prompt resolves — on js-sdk 3.0.0 that resolution
  // IS `prompt_accepted` (the schema's 200 → a correlated reply to this
  // connection only), so it's acknowledged, not just sent. NowPlaying
  // stamps the confirmed chunk alongside.
  //
  // INTENTIONAL SILENCE: there is deliberately NO `on('prompt_accepted')`
  // listener here. On 3.0.0 ack messages are correlated replies, not
  // broadcasts — a listener would compile, subscribe, and never fire.
  // That's 3.0's ack semantics working as designed, not a bug.
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);

  useViskoState((msg) => setSnapshot(msg));

  useEffect(() => {
    if (status !== "ready") {
      setSnapshot(null);
      setPendingPrompt(null);
    }
  }, [status]);

  if (status !== "ready" || !snapshot?.started) return null;

  // Match on preferredPrompt() — the user's own words, pinned at send-time
  // in app/lib/visko.ts — never the enhanced rewrite. Passing null because
  // the 1.4.0 schema doesn't put current_prompt on the state snapshot;
  // the user's own words are the only honest match key, so the evolution
  // chips return mid-run.
  const currentPrompt = preferredPrompt(null);
  const scene = findSceneForPrompt(currentPrompt);
  const pending = pendingPrompt !== null;

  async function steer(prompt: string) {
    const p = prompt.trim();
    if (!p) return;
    setPendingPrompt(p);
    // Awaited set_prompt resolves with `prompt_accepted` (correlated reply
    // on 3.0.0), so by here the model has taken the morph.
    await sendSetPrompt(s, p);
    setPendingPrompt(null);
  }

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
      <label className="text-[10px] uppercase tracking-wider text-zinc-500">
        Steer the scene live
      </label>
      {pending && (
        <p className="mt-2 text-[11px] leading-snug text-brand">
          Morphing… lands at the next chunk boundary (confirmed in Now playing).
        </p>
      )}

      {scene && (
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          {scene.evolutions.map((evolution) => {
            const active = currentPrompt === evolution.text;
            return (
              <button
                key={evolution.title}
                onClick={() => steer(evolution.text)}
                disabled={active || pending}
                className={`group rounded-md border p-2 text-left transition-colors ${
                  active
                    ? "border-brand bg-zinc-900"
                    : "border-zinc-800 bg-zinc-950 hover:border-brand disabled:opacity-40"
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
        disabled={!custom.trim() || pending}
        onClick={async () => {
          await steer(custom);
          setCustom("");
        }}
        className="mt-2 w-full rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-brand-fg hover:opacity-90 disabled:opacity-40"
      >
        {pending ? "Morphing…" : "Morph to this scene"}
      </button>
    </div>
  );
}
