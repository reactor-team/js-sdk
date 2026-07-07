"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useLingbotWorld2,
  useLingbotWorld2State,
  type LingbotWorld2StateMessage,
} from "@reactor-models/lingbot-world-2";
import {
  DYNAMIC_EVENTS,
  composeEventPrompt,
  findEventByKey,
  type DynamicEvent,
} from "../lib/dynamic-events";
import { findSceneByPrompt } from "../lib/scenes";

// Live-phase panel — lets the user throw transient "world events" at
// the scene by HOLDING a key or button. Keydown hot-swaps the prompt
// mid-stream via `set_prompt` with the event's prompt (a finished
// rewrite applied verbatim, or the addendum composed onto the base);
// keyup re-sends the pristine base so the scene settles back. LingBot
// picks up each swap on the next chunk — no restart, no flash, the
// reference image stays untouched. This mirrors the lab runtime's
// current interaction model (press → rewrite applied, release → direct
// switch back to base); see app/lib/dynamic-events.ts for the full story.
//
// Which events show: scenes can carry their own event set (the lab
// authors events per scene — see `Scene.events` in lib/scenes.ts), and
// we recover the scene from the captured base prompt via exact match.
// Scenes without one, and custom prompts, get the global fallback set.
//
// State model (kept deliberately small):
//
//   - basePrompt holds the "scene base" — the prompt the user started
//     the session with. We capture it the first time we see a
//     `started === true` snapshot and never overwrite it while the
//     session runs, because the snapshot's `current_prompt` will
//     reflect OUR composed prompts after the first event lands. State
//     (not just a ref) because the event list derives from it.
//
//   - heldId tracks which event is currently held. One event at a
//     time — pressing a second key while one is held swaps to it (last
//     press wins), and releasing a key only reverts if it's the one
//     that owns the current hold. There is no stacking — each press
//     fully determines the next prompt the model sees, which keeps the
//     wire output unambiguous.
//
// On `reset()` (snapshot.started flips back to false), or on
// disconnect, we drop the captured base so the next session starts
// fresh.
export function DynamicEvents() {
  const { status, setPrompt } = useLingbotWorld2();
  const [snapshot, setSnapshot] = useState<LingbotWorld2StateMessage | null>(null);
  const [heldId, setHeldId] = useState<string | null>(null);
  const [basePrompt, setBasePrompt] = useState<string | null>(null);
  // Ref mirrors for the window-level listeners and the async press/
  // release handlers, so they see live values without re-binding on
  // every change. Written imperatively wherever the state changes —
  // syncing from render would lag a keyup that lands before React
  // re-renders.
  const heldIdRef = useRef<string | null>(null);
  const basePromptRef = useRef<string | null>(null);
  const setHeld = useCallback((id: string | null) => {
    heldIdRef.current = id;
    setHeldId(id);
  }, []);
  const setBase = useCallback((prompt: string | null) => {
    basePromptRef.current = prompt;
    setBasePrompt(prompt);
  }, []);

  useLingbotWorld2State((msg) => setSnapshot(msg));

  // The active event set: the scene's own, when the captured base
  // prompt exactly matches a curated scene that has one; otherwise the
  // global fallback events.
  const events = useMemo<ReadonlyArray<DynamicEvent>>(() => {
    const scene = findSceneByPrompt(basePrompt);
    return scene?.events?.length ? scene.events : DYNAMIC_EVENTS;
  }, [basePrompt]);

  // Standard snapshot-clear on disconnect. Also drops the captured
  // base prompt so a reconnect doesn't reuse stale state from the
  // previous session.
  useEffect(() => {
    if (status !== "ready") {
      setSnapshot(null);
      setBase(null);
      setHeld(null);
    }
  }, [status, setBase, setHeld]);

  // Capture the base prompt on first "started" snapshot. We
  // deliberately do NOT update it again while the session is running —
  // once the user holds an event, the snapshot's `current_prompt` will
  // be OUR composed prompt, and re-capturing would lock in the
  // augmented version as the new "base", making release-to-revert
  // impossible.
  useEffect(() => {
    if (!snapshot) return;
    if (!snapshot.started) {
      // Reset / not-yet-started — drop captured base so the next
      // `start` re-captures from the new scene.
      setBase(null);
      setHeld(null);
      return;
    }
    if (
      basePromptRef.current === null &&
      typeof snapshot.current_prompt === "string"
    ) {
      setBase(snapshot.current_prompt);
    }
  }, [snapshot, setBase, setHeld]);

  // Begin holding an event — the shared path for keydown and
  // pointerdown. Pressing while another event is held swaps to the new
  // one (last press wins).
  const press = useCallback(
    async (event: DynamicEvent) => {
      const base = basePromptRef.current;
      if (!base) return;
      if (heldIdRef.current === event.id) return;

      setHeld(event.id);
      await setPrompt({ prompt: composeEventPrompt(base, event) });
    },
    [setPrompt, setHeld],
  );

  // Release an event — snap straight back to the pristine base (the
  // lab's `direct_switch`). Only the event that owns the current hold
  // may release it, so letting go of a swapped-away key is a no-op.
  const release = useCallback(
    async (id: string) => {
      if (heldIdRef.current !== id) return;
      setHeld(null);
      const base = basePromptRef.current;
      if (!base) return;
      await setPrompt({ prompt: base });
    },
    [setPrompt, setHeld],
  );

  // Hold keys, per the active event set's slot layout (digits, F, G,
  // O, Space) — keydown applies, keyup reverts. Key-repeat is dropped
  // (the press is already latched). Window blur releases too, otherwise
  // alt-tabbing away mid-hold would leave the event stuck on.
  useEffect(() => {
    const ready = status === "ready" && snapshot?.started === true;
    if (!ready) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      // Don't hijack keys while the user is typing into a field.
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      const event = findEventByKey(events, e.key);
      if (!event) return;
      e.preventDefault();
      void press(event);
    };

    // No typing-guard on keyup: if focus lands in a field mid-hold,
    // the release must still get through or the event sticks.
    const onKeyUp = (e: KeyboardEvent) => {
      const event = findEventByKey(events, e.key);
      if (!event) return;
      void release(event.id);
    };

    const onBlur = () => {
      const held = heldIdRef.current;
      if (held) void release(held);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [status, snapshot?.started, events, press, release]);

  if (status !== "ready" || !snapshot?.started) return null;

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
      <label className="text-[10px] uppercase tracking-wider text-zinc-500">
        World events
      </label>

      <p className="mt-1 text-[11px] leading-snug text-zinc-500">
        Hold a button or its key to throw an event at the scene — the model
        picks up the swapped prompt on the next chunk. Release to snap back to
        the base scene.
      </p>

      <div className="mt-2 grid grid-cols-2 gap-1.5">
        {events.map((event) => {
          const held = heldId === event.id;
          return (
            <button
              key={event.id}
              onPointerDown={() => void press(event)}
              onPointerUp={() => void release(event.id)}
              onPointerLeave={() => void release(event.id)}
              onPointerCancel={() => void release(event.id)}
              className={`group flex touch-none select-none items-center gap-2 rounded-md border p-2 text-left transition-colors ${
                held
                  ? "border-brand bg-zinc-900"
                  : "border-zinc-800 bg-zinc-950 hover:border-brand"
              }`}
              title={event.addendum}
            >
              {event.icon && (
                <span aria-hidden className="text-base leading-none">
                  {event.icon}
                </span>
              )}
              <span
                className={`text-[11px] font-medium ${
                  held ? "text-brand" : "text-zinc-200 group-hover:text-brand"
                }`}
              >
                {event.label}
              </span>
              {event.keyLabel && (
                <kbd
                  aria-hidden
                  className={`ml-auto shrink-0 rounded border px-1 font-mono text-[9px] leading-tight ${
                    held
                      ? "border-brand/50 text-brand"
                      : "border-zinc-700 text-zinc-500"
                  }`}
                >
                  {event.keyLabel}
                </kbd>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
