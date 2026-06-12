export type SanaMode = "file" | "live";

export interface SanaState {
  running: boolean;
  started: boolean;
  paused: boolean;
  currentChunk: number;
  currentPrompt: string | null;
  hasVideo: boolean;
  seed: number;
}

export const DEFAULT_STATE: SanaState = {
  running: false,
  started: false,
  paused: false,
  currentChunk: 0,
  currentPrompt: null,
  hasVideo: false,
  seed: 0,
};

// Inbound messages the UI handles (snake_case from the model). The model
// sends more types (video_accepted, chunk_complete, ...; see skill/SKILL.md
// for the full table) - handlers ignore them by switching on `type`.
export type SanaMessage =
  | {
      type: "state";
      data: {
        running: boolean;
        started: boolean;
        paused: boolean;
        current_chunk: number;
        current_prompt: string | null;
        has_video: boolean;
        seed: number;
      };
    }
  | { type: "command_error"; data: { command: string; reason: string } }
  | { type: "generation_reset"; data: { reason: string } };
