import type { XmaxState } from "./types";

// XMAX has no typed `@reactor-models/xmax` package yet, so `state`
// snapshots arrive untyped through `useReactorMessage`. This module owns
// the type guard and the projection so the rest of the app stays on a
// small, typed XmaxState. When the typed package ships, the guard is
// replaced by the generated `XmaxStateMessage` and a `useXmaxState` hook.
export interface StateMessage {
  type: "state";
  running?: boolean;
  started?: boolean;
  paused?: boolean;
  current_chunk?: number;
  current_prompt?: unknown;
}

export function isStateMessage(m: unknown): m is StateMessage {
  return (
    typeof m === "object" &&
    m !== null &&
    (m as { type?: unknown }).type === "state"
  );
}

// Projects model `state` snapshots into XmaxState. Returns the previous
// object when nothing changed so React can bail out of re-rendering the
// whole tree on the model's frequent identical echoes.
export function reduce(state: XmaxState, msg: StateMessage): XmaxState {
  const next: XmaxState = {
    running: msg.running ?? false,
    started: msg.started ?? false,
    paused: msg.paused ?? false,
    currentChunk: msg.current_chunk ?? 0,
    // current_prompt is free-form on the wire; the model only ever sends a
    // string or null.
    currentPrompt:
      typeof msg.current_prompt === "string" ? msg.current_prompt : null,
  };
  const changed = (Object.keys(next) as (keyof XmaxState)[]).some(
    (k) => next[k] !== state[k],
  );
  return changed ? next : state;
}
