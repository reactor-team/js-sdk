export type SanaMode = "file" | "live";

// The UI's projection of the model's `state` snapshot. The typed
// SanaStreamingStateMessage carries the full wire shape (snake_case);
// `reduce` in state.ts narrows it to the handful of fields this app
// gates on, in camelCase.
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
