// The input source the client streams into the model. Both publish to the
// `camera` track — "webcam" sends the live webcam, "video" plays a chosen clip
// and streams its frames in. The model edits whatever arrives on `camera`;
// the app never uploads a file, it streams one.
export type XmaxMode = "webcam" | "video";

// The UI's projection of the model's `state` snapshot. The wire message
// carries the full snake_case shape; `reduce` in state.ts narrows it to the
// handful of fields this app gates on, in camelCase.
export interface XmaxState {
  running: boolean;
  started: boolean;
  paused: boolean;
  currentChunk: number;
  currentPrompt: string | null;
}

export const DEFAULT_STATE: XmaxState = {
  running: false,
  started: false,
  paused: false,
  currentChunk: 0,
  currentPrompt: null,
};
