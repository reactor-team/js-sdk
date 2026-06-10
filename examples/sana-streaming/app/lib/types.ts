export type SanaMode = "file" | "live";

export interface SanaState {
  running: boolean;
  started: boolean;
  paused: boolean;
  currentChunk: number;
  currentPrompt: string | null;
  hasPrompt: boolean;
  hasVideo: boolean;
  numSourceFrames: number;
  seed: number;
}

export const DEFAULT_STATE: SanaState = {
  running: false,
  started: false,
  paused: false,
  currentChunk: 0,
  currentPrompt: null,
  hasPrompt: false,
  hasVideo: false,
  numSourceFrames: 0,
  seed: 0,
};

// Inbound messages (snake_case from the model). Only fields the UI reads.
export type SanaMessage =
  | {
      type: "state";
      data: {
        running: boolean;
        started: boolean;
        paused: boolean;
        current_chunk: number;
        current_prompt: string | null;
        has_prompt: boolean;
        has_video: boolean;
        num_source_frames: number;
        seed: number;
      };
    }
  | { type: "command_error"; data: { command: string; reason: string } }
  | {
      type: "chunk_complete";
      data: {
        chunk_index: number;
        frames_emitted: number;
        active_prompt: string;
      };
    }
  | {
      type: "video_accepted";
      data: {
        width: number;
        height: number;
        num_frames: number;
        num_latent_frames: number;
      };
    }
  | { type: "prompt_accepted"; data: { prompt: string } }
  | {
      type: "generation_started";
      data: { prompt: string; chunk_num: number; frame_num: number };
    }
  | { type: "generation_complete"; data: { total_chunks: number } }
  | { type: "generation_reset"; data: { reason: string } }
  | { type: string; data: Record<string, unknown> };
