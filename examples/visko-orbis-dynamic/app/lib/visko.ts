"use client";

import {
  ViskoOrbisDynamicProvider,
  useViskoOrbisDynamic,
  useViskoOrbisDynamicState,
  useViskoOrbisDynamicMessage,
  useViskoOrbisDynamicCommandError,
  useViskoOrbisDynamicGenerationStarted,
  useViskoOrbisDynamicGenerationComplete,
  useViskoOrbisDynamicChunkComplete,
  FileRef,
  MODEL_NAME,
  type ViskoOrbisDynamicStateMessage,
  type ViskoOrbisDynamicMessage,
} from "@reactor-models/visko-orbis-dynamic";

// The model this example drives on PROD — the launch target.
export { MODEL_NAME };
export { ViskoOrbisDynamicProvider };

// Per-type hooks the downstream components bind to (terse local aliases over
// the typed SDK ones). Subscribing to each message type once here means
// components get a stable import surface and this file stays the one place
// that knows the long typed names.
export const useViskoState = useViskoOrbisDynamicState;
export const useCommandError = useViskoOrbisDynamicCommandError;
export const useGenerationStarted = useViskoOrbisDynamicGenerationStarted;
export const useGenerationComplete = useViskoOrbisDynamicGenerationComplete;
export const useChunkComplete = useViskoOrbisDynamicChunkComplete;
// The per-component typed store access — returns the whole typed Model store.
// Aliased here so components import from one place.
export { useViskoOrbisDynamic };

// ─────────────────────────────────────────────────────────────────────────────
// Typed SDK, resolved from the published npm package `@reactor-models/visko-orbis-dynamic`.
//
// The typed client supplies the Provider and all the hooks this file re-wraps
// once so the app's components stay terse. One migration caveat: no
// `on("prompt_accepted")` listeners — see NowPlaying/EvolveScene for what
// replaced them. There is no generic "message-of-type" helper in the package
// — per-type consumers use the typed per-type hooks directly; the one
// catch-all still used here is `useViskoOrbisDynamicMessage` (StatusBadge's
// `command_error` filter).
// ─────────────────────────────────────────────────────────────────────────────

export type StateMessage = ViskoOrbisDynamicStateMessage;
export type AnyMsg = ViskoOrbisDynamicMessage;
export type { FileRef };

// Widened view of the typed store used by components. Fields match
// useViskoOrbisDynamic()'s output exactly; declared as an indexable type so
// existing `(st) => st` whole-object reads keep working.
export type S = Record<string, unknown> &
  ReturnType<typeof useViskoOrbisDynamic>;

// Model-side store type used by the send* helpers — the underlying object with
// the typed command methods on it (that same useViskoOrbisDynamic() shape).
export type ReactorStore = S;

// ── Prompt display helpers ──────────────────────────────────────────────────
// The model may rewrite incoming prompts before generation, so the UI pins
// the user's own words at send-time (below) rather than echoing back
// whatever the snapshot reports.
let lastAcceptedPrompt: string | null = null;

/** True when a string carries the model's structured markup tags. */
export function isEnhancedPrompt(text: string): boolean {
  return /<(?:header|event)\b/i.test(text);
}

/** What to show/match on instead of raw `state.current_prompt`. See above. */
export function preferredPrompt(currentPrompt: string | null): string {
  return typeof currentPrompt === "string"
    ? (lastAcceptedPrompt ?? currentPrompt)
    : (lastAcceptedPrompt ?? "");
}

export function getLastAcceptedPrompt(): string | null {
  return lastAcceptedPrompt;
}

// ── Command senders — thin wrappers over the typed Model's own methods ─────
// The awaited call IS the ack on js-sdk 3.0.0 (correlated reply). Reply types
// come from the schema (e.g. setImage → ImageAccepted, setPrompt → PromptAccepted);
// start/pause/resume/reset resolve undefined because the schema declares no payload.
export const sendSetPrompt = async (s: ReactorStore, prompt: string) => {
  const reply = await s.setPrompt({ prompt });
  // A resolved await means the model took the prompt (3.0 correlated ack), so
  // this is the earliest point the text is known-good to pin for display.
  lastAcceptedPrompt = prompt;
  return reply;
};
export const sendSetImage = (s: ReactorStore, image: FileRef) =>
  s.setImage({ image });
export const sendSetSeed = (s: ReactorStore, seed: number) =>
  s.setSeed({ seed });
export const sendSetResolution = (s: ReactorStore, resolution: string) =>
  s.setResolution({ resolution });
export const sendSetAudioPrompt = (s: ReactorStore, prompt: string) =>
  s.setAudioPrompt({ prompt });
export const sendSetAudioEnabled = (s: ReactorStore, audio_enabled: boolean) =>
  s.setAudioEnabled({ audio_enabled });
export const sendStart = (s: ReactorStore) => s.start();
export const sendPause = (s: ReactorStore) => s.pause();
export const sendResume = (s: ReactorStore) => s.resume();
export const sendReset = (s: ReactorStore) => s.reset();
