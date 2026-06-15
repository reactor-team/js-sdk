import type {
  SanaStreamingCommandErrorMessage,
  SanaStreamingStateMessage,
} from "@reactor-models/sana-streaming";
import type { SanaMode, SanaState } from "./types";

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
    hasVideo: msg.has_video,
    seed: msg.seed,
  };
  const changed = (Object.keys(next) as (keyof SanaState)[]).some(
    (k) => next[k] !== state[k],
  );
  return changed ? next : state;
}

// The model's video probe intermittently fails with a spurious
// "decode failed" for valid uploads (ffmpeg fork race; see SKILL.md).
// FileInput retries these silently and the shell suppresses the error
// banner for them - both sides must agree on the predicate, so it has
// exactly one definition.
export function isTransientDecodeFailure(
  msg: SanaStreamingCommandErrorMessage,
): boolean {
  return msg.command === "set_video" && msg.reason.startsWith("decode failed");
}

// Typed slice of useSanaStreaming() the start flow needs.
interface StartControls {
  setMode: (params: { mode: SanaMode }) => Promise<void>;
  start: () => Promise<void>;
}

// The start flow is always set_mode -> start. Re-sending set_mode keeps the
// flow self-contained regardless of which mode the model is in; the model
// treats a repeated set_mode as idempotent.
export async function startGeneration(
  model: StartControls,
  mode: SanaMode,
): Promise<void> {
  await model.setMode({ mode });
  await model.start();
}
