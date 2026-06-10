import { SanaState, SanaMessage } from "./types";
export function reduce(state: SanaState, msg: SanaMessage): SanaState {
  if (msg.type !== "state") return state;
  const d = msg.data as Extract<SanaMessage, { type: "state" }>["data"];
  return { running: d.running, started: d.started, paused: d.paused,
    currentChunk: d.current_chunk, currentPrompt: d.current_prompt,
    hasPrompt: d.has_prompt, hasVideo: d.has_video,
    numSourceFrames: d.num_source_frames, seed: d.seed };
}
