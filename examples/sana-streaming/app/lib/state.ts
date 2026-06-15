import type { SanaStreamingStateMessage } from "@reactor-models/sana-streaming";
import type { SanaState } from "./types";

// Projects model `state` snapshots into SanaState. Returns the previous
// object when nothing changed so React can bail out of re-rendering the
// whole tree on the model's frequent identical echoes.
export function reduce(
  state: SanaState,
  msg: SanaStreamingStateMessage,
): SanaState {
  const next: SanaState = {
    running: msg.running,
    started: msg.started,
    paused: msg.paused,
    currentChunk: msg.current_chunk,
    // current_prompt is typed `unknown` on the wire (free-form); the model
    // only ever sends a string or null.
    currentPrompt: (msg.current_prompt as string | null) ?? null,
    seed: msg.seed,
  };
  const changed = (Object.keys(next) as (keyof SanaState)[]).some(
    (k) => next[k] !== state[k],
  );
  return changed ? next : state;
}

// Typed slice of useSanaStreaming() the start flow needs.
interface StartControls {
  setMode: (params: { mode: "file" | "live" }) => Promise<void>;
  start: () => Promise<void>;
}

// Both input sources stream into the `camera` track, so generation is always
// the model's live path. We still send set_mode("live") explicitly: the
// deployed 0.1.x model defaults to the file path and would reject `start`
// without an upload otherwise. Drop the set_mode call once the live-only
// model (no set_mode/set_video) is deployed.
export async function startGeneration(model: StartControls): Promise<void> {
  await model.setMode({ mode: "live" });
  await model.start();
}
