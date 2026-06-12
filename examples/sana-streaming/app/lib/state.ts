import type { SanaMessage, SanaMode, SanaState } from "./types";

// Projects model `state` snapshots into SanaState. Returns the previous
// object when nothing changed so React can bail out of re-rendering the
// whole tree on the model's frequent identical echoes.
export function reduce(state: SanaState, msg: SanaMessage): SanaState {
  if (msg.type !== "state") return state;
  const d = msg.data;
  const next: SanaState = {
    running: d.running,
    started: d.started,
    paused: d.paused,
    currentChunk: d.current_chunk,
    currentPrompt: d.current_prompt,
    hasVideo: d.has_video,
    seed: d.seed,
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
// exactly one definition. Plain boolean on purpose: a type predicate
// would let `!isTransientDecodeFailure(msg)` narrow an already-narrowed
// command_error message to `never`.
export function isTransientDecodeFailure(msg: SanaMessage): boolean {
  return (
    msg.type === "command_error" &&
    msg.data.command === "set_video" &&
    msg.data.reason.startsWith("decode failed")
  );
}

// The start flow is always set_mode -> start. Re-sending set_mode keeps the
// flow self-contained regardless of which mode the model is in; the model
// treats a repeated set_mode as idempotent.
export async function startGeneration(
  sendCommand: (
    command: string,
    data: Record<string, unknown>,
  ) => Promise<void>,
  mode: SanaMode,
): Promise<void> {
  await sendCommand("set_mode", { mode });
  await sendCommand("start", {});
}
