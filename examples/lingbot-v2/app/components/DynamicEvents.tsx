"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  useLingbotV2,
  useLingbotV2State,
  type LingbotV2StateMessage,
} from "@reactor-models/lingbot-v2";
import { DYNAMIC_EVENTS } from "../lib/dynamic-events";

// Live-phase panel — lets the user hot-swap the world by appending a
// preset environmental sentence to the active prompt and re-sending
// via `set_prompt`. Lingbot picks up the new prompt on the next chunk
// and the scene visibly shifts (rain begins, fog rolls in, etc.) —
// no restart, no flash, the reference image stays untouched. This
// is Lingbot's signature mid-stream prompt-swap capability put on a
// surface a non-author can press.
//
// State model (kept deliberately small):
//
//   - basePromptRef holds the "scene base" — the prompt the user
//     started the session with (or selected via the live custom-
//     prompt path, if you add one). We capture it the first time we
//     see a `started === true` snapshot and never overwrite it while
//     the session runs, because the snapshot's `current_prompt` will
//     reflect OUR composed prompts after the first event lands.
//
//   - activeId tracks which event is currently appended. Re-clicking
//     the same event toggles it off (back to the base scene). Picking
//     a different event swaps which sentence is appended. There is no
//     stacking — each press fully determines the next prompt the
//     model sees, which keeps the wire output unambiguous.
//
// On `reset()` (snapshot.started flips back to false), or on
// disconnect, we drop the captured base so the next session starts
// fresh.
export function DynamicEvents() {
  const { status, setPrompt } = useLingbotV2();
  const [snapshot, setSnapshot] = useState<LingbotV2StateMessage | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const basePromptRef = useRef<string | null>(null);

  useLingbotV2State((msg) => setSnapshot(msg));

  // Standard snapshot-clear on disconnect. Also drops the captured
  // base prompt so a reconnect doesn't reuse stale state from the
  // previous session.
  useEffect(() => {
    if (status !== "ready") {
      setSnapshot(null);
      basePromptRef.current = null;
      setActiveId(null);
    }
  }, [status]);

  // Capture the base prompt on first "started" snapshot. We
  // deliberately do NOT update `basePromptRef.current` again while
  // the session is running — once the user clicks an event, the
  // snapshot's `current_prompt` will be OUR composed prompt, and
  // re-capturing would lock in the augmented version as the new
  // "base", making toggle-off impossible.
  useEffect(() => {
    if (!snapshot) return;
    if (!snapshot.started) {
      // Reset / not-yet-started — drop captured base so the next
      // `start` re-captures from the new scene.
      basePromptRef.current = null;
      setActiveId(null);
      return;
    }
    if (
      basePromptRef.current === null &&
      typeof snapshot.current_prompt === "string"
    ) {
      basePromptRef.current = snapshot.current_prompt;
    }
  }, [snapshot]);

  // Toggle/swap an event by id — the shared path for both clicks and the
  // number-key shortcuts. Re-selecting the active event reverts to the
  // pristine base; selecting another swaps which sentence is appended.
  // Memoized so the keyboard effect below keeps a stable handler and only
  // re-binds when the active selection changes.
  const apply = useCallback(
    async (id: string) => {
      const base = basePromptRef.current;
      if (!base) return;

      if (activeId === id) {
        // Toggle off — back to the pristine scene.
        setActiveId(null);
        await setPrompt({ prompt: base });
        return;
      }

      const event = DYNAMIC_EVENTS.find((e) => e.id === id);
      if (!event) return;
      setActiveId(id);
      await setPrompt({ prompt: `${base} ${event.text}` });
    },
    [activeId, setPrompt],
  );

  // Number keys 1–N trigger the first N events (N = DYNAMIC_EVENTS.length)
  // with the same toggle/swap semantics as clicking. It's a discrete
  // press, not a hold, so we drop key-repeat — otherwise holding a number
  // would flap the event on and off on every repeat tick.
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
      const n = Number.parseInt(e.key, 10);
      if (Number.isNaN(n) || n < 1 || n > DYNAMIC_EVENTS.length) return;
      e.preventDefault();
      void apply(DYNAMIC_EVENTS[n - 1].id);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [status, snapshot?.started, apply]);

  if (status !== "ready" || !snapshot?.started) return null;

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
      <label className="text-[10px] uppercase tracking-wider text-zinc-500">
        World events
      </label>

      <p className="mt-1 text-[11px] leading-snug text-zinc-500">
        Hot-swap the world. Click a button or press its number key — the model
        picks up the fresh prompt on the next chunk. Trigger the active one
        again to revert.
      </p>

      <div className="mt-2 grid grid-cols-2 gap-1.5">
        {DYNAMIC_EVENTS.map((event, index) => {
          const active = activeId === event.id;
          return (
            <button
              key={event.id}
              onClick={() => apply(event.id)}
              className={`group flex items-center gap-2 rounded-md border p-2 text-left transition-colors ${
                active
                  ? "border-brand bg-zinc-900"
                  : "border-zinc-800 bg-zinc-950 hover:border-brand"
              }`}
              title={event.text}
            >
              <span aria-hidden className="text-base leading-none">
                {event.icon}
              </span>
              <span
                className={`text-[11px] font-medium ${
                  active ? "text-brand" : "text-zinc-200 group-hover:text-brand"
                }`}
              >
                {event.label}
              </span>
              {index < 9 && (
                <kbd
                  aria-hidden
                  className={`ml-auto rounded border px-1 font-mono text-[9px] leading-tight ${
                    active
                      ? "border-brand/50 text-brand"
                      : "border-zinc-700 text-zinc-500"
                  }`}
                >
                  {index + 1}
                </kbd>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
