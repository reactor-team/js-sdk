import { Reactor, FileRef } from '@reactor-team/js-sdk';
export { FileRef } from '@reactor-team/js-sdk';

declare const MODEL_NAME: "reactor/visko-orbis-distilled";
declare const MODEL_VERSION: "v2.0.0";
/**
 * Preset media tracks for the ViskoOrbisDistilled model.
 *
 * Declared in the model's OpenAPI schema and passed to the SDK as
 * `modelTracks` so the transport can prepare the SDP offer in
 * parallel with session polling (faster first-frame latency).
 */
declare const ViskoOrbisDistilledTracks: readonly [{
    readonly name: "main_video";
    readonly kind: "video";
    readonly direction: "recvonly";
}, {
    readonly name: "main_audio";
    readonly kind: "audio";
    readonly direction: "recvonly";
}];
/** Track names the client can subscribe to (recvonly, from the client's perspective). */
type ViskoOrbisDistilledRecvTrackName = "main_video" | "main_audio";
/** Seed for the noise the first chunk is sampled from. Must be a non-negative integer; the model never draws its own seed, so the same seed with the same prompts reproduces the same video. Read once when `start` fires — later changes take effect only after `reset` followed by a new `start`. */
interface ViskoOrbisDistilledSetSeedParams {
    /**
     * Seed for the noise the first chunk is sampled from. Must be a non-negative integer; the model never draws its own seed, so the same seed with the same prompts reproduces the same video. Read once when `start` fires — later changes take effect only after `reset` followed by a new `start`.
     * @minimum 0
     * @default 42
     */
    seed?: number;
}
/** Provide a starting frame the video grows out of (image-to-video). Optional — with no image the model generates from the prompt alone. Call before `start`; the image anchors the first chunk and every later chunk inherits it through the model's own history, so a change during generation has no effect until `reset` and a new `start`. Emits `image_accepted`, `conditions_ready`, and `state` on success, or `command_error` if the file is missing, is not an image, or cannot be decoded. */
interface ViskoOrbisDistilledSetImageParams {
    /**
     * Reference to a file uploaded via the Reactor upload protocol.
     * @default null
     */
    image?: FileRef;
}
/** Set the scene prompt. Valid at any time — call before `start` to arm generation, or hot-swap during generation to steer the next chunk. The picture morphs into the new prompt at the next chunk boundary rather than cutting. Emits `prompt_accepted`, `conditions_ready`, and `state` on success. */
interface ViskoOrbisDistilledSetPromptParams {
    /**
     * Natural-language description of the scene to generate. Replaces the previously active prompt. Applied on the next chunk when generating; otherwise takes effect when `start` fires.
     * @default ""
     */
    prompt?: string;
}
/** Choose the delivery resolution for `main_video` from this deployment's offered list (`available_resolutions` in the `state` snapshot — e.g. `1080p`, `2k`, `4k`). Session-scoped: read when `start` fires, so the track's geometry never jumps mid-shot — call it before `start`, or any time to arm the next run. Unlike the prompt it survives `reset`. Emits `resolution_accepted` and `state` on success, or `command_error` naming the offered list when the value is not on it. */
interface ViskoOrbisDistilledSetResolutionParams {
    /**
     * One of the deployment's offered resolutions, exactly as listed in the `state` snapshot's `available_resolutions` — named delivery tiers (1080p = 1920x1080, 2k = 2560x1440, 4k = 3840x2160).
     * @default ""
     */
    resolution?: string;
}
/** Set the sound description the audio is generated from. Valid at any time — call before `start`, or during generation to change the sound from the next chunk on. Pass an empty string to clear it, which switches the audio model to generating sound from the picture alone. Emits `audio_prompt_accepted` and `state` on success; rejected with `command_error` on a deployment that has no audio track. */
interface ViskoOrbisDistilledSetAudioPromptParams {
    /**
     * What the scene should SOUND like — instruments, voices, materials, ambience. Not a description of what is on screen: sending a scene description here makes the audio worse than leaving it empty. Keep it to about one sentence; roughly the first 128 tokens are used and the rest is dropped without warning. Example: "Acoustic guitar strums a rhythmic melody, with soft finger noise on the strings and quiet room ambience." Empty clears it, and the audio is then generated from the picture alone.
     * @default ""
     */
    prompt?: string;
}
/** Enable or disable sound for runs started from now on. When false the audio model is skipped entirely — `main_audio` carries silence and each chunk is cheaper to produce. Session-scoped like `set_resolution`: read when `start` fires, and it survives `reset`. Emits `audio_enabled_accepted` and `state` on success; rejected with `command_error` on a deployment that has no audio track. A client that never wants audio can also simply omit `main_audio` from its track mapping when connecting — that needs no command, but still spends the compute; this command is how the compute is saved. */
interface ViskoOrbisDistilledSetAudioEnabledParams {
    /**
     * True to generate sound on `main_audio` (the default), false to skip the audio model and deliver silence from the next `start` on.
     * @default true
     */
    audio_enabled?: boolean;
}
/**
 * Snapshot of the session's observable state.
 *
 * Emitted on connect, after every command that mutates session state (`set_prompt`, `set_audio_prompt`, `set_image`, `set_seed`, `set_resolution`, `set_audio_enabled`, `start`, `pause`, `resume`, `reset`), and after each `chunk_complete`. A client can treat this as the single source of truth for driving UI instead of tracking every individual message.
 */
interface ViskoOrbisDistilledStateMessage {
    type: "state";
    /** Current value of the `seed` input field. The seed actually driving a running generation was captured when `start` fired — later changes take effect only after `reset` and a new `start`. */
    seed: number;
    /** True while generation is paused via `pause`. */
    paused: boolean;
    /** True while the chunk loop is actively producing frames — equivalent to `started and not paused`. False both before `start` and while paused; read `started` to tell those apart. */
    running: boolean;
    /** True once `start` has been accepted. Stays true while paused; cleared by `reset`. */
    started: boolean;
    /** True once a reference image has been set for the session. */
    has_image: boolean;
    /** True once a prompt has been set for the session. */
    has_prompt: boolean;
    /** The delivery resolution the next `start` will use — the client's `set_resolution` choice, or the deployment's default if it has not spoken. Like `seed`, the value driving a RUNNING generation was captured when `start` fired. */
    resolution: string;
    /** The sound description currently conditioning the audio, or null. Null means one of two things and the distinction does not matter to a client: either no `set_audio_prompt` has been sent, so this deployment's configured default is in force, or the caption was cleared and the audio is generated from the picture alone. Always null on a deployment with no `main_audio` track. */
    audio_prompt: string | null;
    /** Whether the next `start` will generate sound — the client's `set_audio_enabled` choice, or true if it has not spoken. Like `seed`, the value driving a RUNNING generation was captured when `start` fired. Always false on a deployment with no `main_audio` track. */
    audio_enabled: boolean;
    /** Zero-based index of the last completed chunk. 0 before the first chunk has completed, and back to 0 on `reset`. */
    current_chunk: number;
    /** The prompt currently driving generation, or null if no prompt has been set for the session. */
    current_prompt: string | null;
    /** The delivery resolutions this deployment offers, in its configured order — the valid inputs to `set_resolution`. Fixed at startup; the named tiers are upscaler-delivered (1080p = 1920x1080, 2k = 2560x1440, 4k = 3840x2160). */
    available_resolutions: string[];
}
/** Emitted when a command is rejected because its preconditions are not met, or its arguments could not be processed. */
interface ViskoOrbisDistilledCommandErrorMessage {
    type: "command_error";
    /** Human-readable explanation of why the command was rejected. */
    reason: string;
    /** Name of the command that was rejected. */
    command: string;
}
/** Emitted once per completed chunk of `main_video`. */
interface ViskoOrbisDistilledChunkCompleteMessage {
    type: "chunk_complete";
    /** Zero-based index of the chunk that just completed. */
    chunk_index: number;
    /** The prompt that was active while this chunk was generated. */
    active_prompt: string;
    /** Number of audio samples emitted on `main_audio` for this chunk, at 48 kHz mono, or null when this deployment has no audio track. Always equals `frames_emitted / fps * 48000` rounded, so a client can check A/V alignment without decoding anything. */
    audio_samples: number | null;
    /** Number of pixel frames emitted by this chunk. */
    frames_emitted: number;
}
/** Emitted after `set_image` successfully decodes the uploaded file. */
interface ViskoOrbisDistilledImageAcceptedMessage {
    type: "image_accepted";
    /** Width in pixels of the decoded reference image. */
    width: number;
    /** Height in pixels of the decoded reference image. */
    height: number;
}
/** Emitted after `set_prompt` is accepted. */
interface ViskoOrbisDistilledPromptAcceptedMessage {
    type: "prompt_accepted";
    /** The prompt text that was accepted. */
    prompt: string;
}
/** Emitted after `set_prompt` or `set_image` so the client can tell at a glance whether `start` will succeed. */
interface ViskoOrbisDistilledConditionsReadyMessage {
    type: "conditions_ready";
    /** True once a reference image has been set for the session. Optional — with no image the model generates from the prompt alone (text-to-video). */
    has_image: boolean;
    /** True once a prompt has been set for the session. */
    has_prompt: boolean;
}
/** Emitted after `reset` clears session state and returns to the waiting state. */
interface ViskoOrbisDistilledGenerationResetMessage {
    type: "generation_reset";
    /** Short human-readable reason the reset was issued. */
    reason: string;
}
/** Emitted in response to `pause`, once the current chunk finishes. */
interface ViskoOrbisDistilledGenerationPausedMessage {
    type: "generation_paused";
    /** Index of the last completed chunk before pausing. */
    chunk_index: number;
}
/** Emitted in response to `resume` when leaving the paused state. */
interface ViskoOrbisDistilledGenerationResumedMessage {
    type: "generation_resumed";
    /** Index of the last completed chunk before resuming. */
    chunk_index: number;
}
/** Emitted once when `start` succeeds and frames begin streaming. */
interface ViskoOrbisDistilledGenerationStartedMessage {
    type: "generation_started";
    /** Frame rate the video is generated at. */
    fps: number;
    /** Width in pixels of every frame this run emits on `main_video`. */
    width: number;
    /** Height in pixels of every frame this run emits on `main_video`. */
    height: number;
    /** The prompt active at the start of generation. */
    prompt: string;
    /** Maximum number of chunks this run will produce before `generation_complete` fires. */
    max_chunks: number;
    /** The delivery resolution this run generates at — a named tier such as `1080p`, `2k`, `4k`. Fixed for the run; `set_resolution` applies from the next `start`. */
    resolution: string;
    /** Whether this run generates sound. False either because the session set `set_audio_enabled(false)` — `main_audio` then carries silence — or because this deployment has no `main_audio` track at all; read the schema to tell the two apart. Fixed for the run, like `resolution`. */
    audio_enabled: boolean;
    /** Number of pixel frames each chunk emits on `main_video`. */
    frames_per_chunk: number;
    /** True when a reference image anchors this run (image-to-video); false for text-to-video. */
    image_conditioned: boolean;
}
/**
 * Emitted when the run reaches `max_chunks`.
 *
 * The session returns to the waiting state rather than rolling straight into another run — a new run begins at chunk 0, which is a hard visual cut, and issuing one unasked would be a surprise. Call `start` again to continue, or `reset` to clear the conditions first.
 */
interface ViskoOrbisDistilledGenerationCompleteMessage {
    type: "generation_complete";
    /** Total number of chunks produced by the run. */
    total_chunks: number;
}
/** Emitted after `set_resolution` is accepted. */
interface ViskoOrbisDistilledResolutionAcceptedMessage {
    type: "resolution_accepted";
    /** Width in pixels `main_video` will deliver at once a run starts with this tier — so a client can size its canvas without a name-to-size lookup table. */
    width: number;
    /** Height in pixels `main_video` will deliver at once a run starts with this tier. */
    height: number;
    /** The delivery resolution that was accepted. Applies from the next `start` — a running generation keeps the resolution it started with. */
    resolution: string;
}
/** Emitted after `set_audio_prompt` is accepted. */
interface ViskoOrbisDistilledAudioPromptAcceptedMessage {
    type: "audio_prompt_accepted";
    /** The sound description that was accepted, or null if it was cleared — which puts the audio model in its video-only mode, generating sound from the picture alone. */
    audio_prompt: string | null;
}
/** Emitted after `set_audio_enabled` is accepted. */
interface ViskoOrbisDistilledAudioEnabledAcceptedMessage {
    type: "audio_enabled_accepted";
    /** The value that was accepted. False means runs started from now on skip the audio model and `main_audio` carries silence; applies from the next `start` — a running generation keeps the setting it started with. */
    audio_enabled: boolean;
}
type ViskoOrbisDistilledMessage = ViskoOrbisDistilledStateMessage | ViskoOrbisDistilledCommandErrorMessage | ViskoOrbisDistilledChunkCompleteMessage | ViskoOrbisDistilledImageAcceptedMessage | ViskoOrbisDistilledPromptAcceptedMessage | ViskoOrbisDistilledConditionsReadyMessage | ViskoOrbisDistilledGenerationResetMessage | ViskoOrbisDistilledGenerationPausedMessage | ViskoOrbisDistilledGenerationResumedMessage | ViskoOrbisDistilledGenerationStartedMessage | ViskoOrbisDistilledGenerationCompleteMessage | ViskoOrbisDistilledResolutionAcceptedMessage | ViskoOrbisDistilledAudioPromptAcceptedMessage | ViskoOrbisDistilledAudioEnabledAcceptedMessage;
/**
 * Options for creating a ViskoOrbisDistilledModel (model name is set automatically).
 *
 * Derived from `Reactor`'s own constructor options with `modelName`
 * and `modelTracks` removed — those are supplied by this class.
 * Any new option the SDK adds appears here automatically on the
 * next `defaultSdkVersion` bump.
 */
type ViskoOrbisDistilledOptions = Omit<ConstructorParameters<typeof Reactor>[0], "modelName" | "modelTracks">;
/**
 * Strongly-typed client for the ViskoOrbisDistilled model.
 *
 * Extends {@link Reactor} with the model name (and modelTracks) baked into the
 * constructor, so every public method on Reactor — `connect`, `disconnect`,
 * `sendCommand`, `on`/`off`, `getStats`, `publishTrack`/`unpublishTrack`,
 * etc. — is reachable directly on the instance. The schema-derived sugar
 * below adds typed wrappers for every declared event, message, and track.
 */
declare class ViskoOrbisDistilledModel extends Reactor {
    constructor(options?: ViskoOrbisDistilledOptions);
    /** @deprecated The model client now extends `Reactor` directly — call methods on `this` instead. This accessor returns `this` for backwards compatibility and will be removed in a future major release. */
    get reactor(): this;
    /** Pause generation after the current chunk finishes. Frames stop streaming on `main_video` until `resume` is called; the model keeps its place, so resuming continues the same shot rather than starting a new one. Emits `generation_paused` and `state` on success, or `command_error` if not generating or already paused. */
    pause(): Promise<void>;
    /** Abort the current run, clear the active prompt and starting image, and return to the waiting state. Valid at any time. After `reset`, call `set_prompt` (and optionally `set_image`) again before `start`. Emits `generation_reset` and `state`. */
    reset(): Promise<void>;
    /** Begin generating video on `main_video`. Requires a prompt (via `set_prompt`); a starting image is optional. Emits `generation_started` and `state` on success, or `command_error` if no prompt is set. Has no effect while already generating. */
    start(): Promise<void>;
    /** Resume generation from a previous `pause`. Requires the session to be paused. Emits `generation_resumed` and `state` on success, or `command_error` if not paused. */
    resume(): Promise<void>;
    /**
     * Seed for the noise the first chunk is sampled from. Must be a non-negative integer; the model never draws its own seed, so the same seed with the same prompts reproduces the same video. Read once when `start` fires — later changes take effect only after `reset` followed by a new `start`.
     * @param params - Seed for the noise the first chunk is sampled from. Must be a non-negative integer; the model never draws its own seed, so the same seed with the same prompts reproduces the same video. Read once when `start` fires — later changes take effect only after `reset` followed by a new `start`.
     */
    setSeed(params: ViskoOrbisDistilledSetSeedParams): Promise<void>;
    /**
     * Provide a starting frame the video grows out of (image-to-video). Optional — with no image the model generates from the prompt alone. Call before `start`; the image anchors the first chunk and every later chunk inherits it through the model's own history, so a change during generation has no effect until `reset` and a new `start`. Emits `image_accepted`, `conditions_ready`, and `state` on success, or `command_error` if the file is missing, is not an image, or cannot be decoded.
     * @param params - Provide a starting frame the video grows out of (image-to-video). Optional — with no image the model generates from the prompt alone. Call before `start`; the image anchors the first chunk and every later chunk inherits it through the model's own history, so a change during generation has no effect until `reset` and a new `start`. Emits `image_accepted`, `conditions_ready`, and `state` on success, or `command_error` if the file is missing, is not an image, or cannot be decoded.
     */
    setImage(params: ViskoOrbisDistilledSetImageParams): Promise<void>;
    /**
     * Set the scene prompt. Valid at any time — call before `start` to arm generation, or hot-swap during generation to steer the next chunk. The picture morphs into the new prompt at the next chunk boundary rather than cutting. Emits `prompt_accepted`, `conditions_ready`, and `state` on success.
     * @param params - Set the scene prompt. Valid at any time — call before `start` to arm generation, or hot-swap during generation to steer the next chunk. The picture morphs into the new prompt at the next chunk boundary rather than cutting. Emits `prompt_accepted`, `conditions_ready`, and `state` on success.
     */
    setPrompt(params: ViskoOrbisDistilledSetPromptParams): Promise<void>;
    /**
     * Choose the delivery resolution for `main_video` from this deployment's offered list (`available_resolutions` in the `state` snapshot — e.g. `1080p`, `2k`, `4k`). Session-scoped: read when `start` fires, so the track's geometry never jumps mid-shot — call it before `start`, or any time to arm the next run. Unlike the prompt it survives `reset`. Emits `resolution_accepted` and `state` on success, or `command_error` naming the offered list when the value is not on it.
     * @param params - Choose the delivery resolution for `main_video` from this deployment's offered list (`available_resolutions` in the `state` snapshot — e.g. `1080p`, `2k`, `4k`). Session-scoped: read when `start` fires, so the track's geometry never jumps mid-shot — call it before `start`, or any time to arm the next run. Unlike the prompt it survives `reset`. Emits `resolution_accepted` and `state` on success, or `command_error` naming the offered list when the value is not on it.
     */
    setResolution(params: ViskoOrbisDistilledSetResolutionParams): Promise<void>;
    /**
     * Set the sound description the audio is generated from. Valid at any time — call before `start`, or during generation to change the sound from the next chunk on. Pass an empty string to clear it, which switches the audio model to generating sound from the picture alone. Emits `audio_prompt_accepted` and `state` on success; rejected with `command_error` on a deployment that has no audio track.
     * @param params - Set the sound description the audio is generated from. Valid at any time — call before `start`, or during generation to change the sound from the next chunk on. Pass an empty string to clear it, which switches the audio model to generating sound from the picture alone. Emits `audio_prompt_accepted` and `state` on success; rejected with `command_error` on a deployment that has no audio track.
     */
    setAudioPrompt(params: ViskoOrbisDistilledSetAudioPromptParams): Promise<void>;
    /**
     * Enable or disable sound for runs started from now on. When false the audio model is skipped entirely — `main_audio` carries silence and each chunk is cheaper to produce. Session-scoped like `set_resolution`: read when `start` fires, and it survives `reset`. Emits `audio_enabled_accepted` and `state` on success; rejected with `command_error` on a deployment that has no audio track. A client that never wants audio can also simply omit `main_audio` from its track mapping when connecting — that needs no command, but still spends the compute; this command is how the compute is saved.
     * @param params - Enable or disable sound for runs started from now on. When false the audio model is skipped entirely — `main_audio` carries silence and each chunk is cheaper to produce. Session-scoped like `set_resolution`: read when `start` fires, and it survives `reset`. Emits `audio_enabled_accepted` and `state` on success; rejected with `command_error` on a deployment that has no audio track. A client that never wants audio can also simply omit `main_audio` from its track mapping when connecting — that needs no command, but still spends the compute; this command is how the compute is saved.
     */
    setAudioEnabled(params: ViskoOrbisDistilledSetAudioEnabledParams): Promise<void>;
    /**
     * Subscribe to typed model messages.
     * @param handler - Called with a discriminated ViskoOrbisDistilledMessage
     * @returns Unsubscribe function
     */
    onMessage(handler: (message: ViskoOrbisDistilledMessage) => void): () => void;
    /**
     * Subscribe to "state" messages only.
     * @returns Unsubscribe function
     */
    onState(handler: (message: ViskoOrbisDistilledStateMessage) => void): () => void;
    /**
     * Subscribe to "command_error" messages only.
     * @returns Unsubscribe function
     */
    onCommandError(handler: (message: ViskoOrbisDistilledCommandErrorMessage) => void): () => void;
    /**
     * Subscribe to "chunk_complete" messages only.
     * @returns Unsubscribe function
     */
    onChunkComplete(handler: (message: ViskoOrbisDistilledChunkCompleteMessage) => void): () => void;
    /**
     * Subscribe to "image_accepted" messages only.
     * @returns Unsubscribe function
     */
    onImageAccepted(handler: (message: ViskoOrbisDistilledImageAcceptedMessage) => void): () => void;
    /**
     * Subscribe to "prompt_accepted" messages only.
     * @returns Unsubscribe function
     */
    onPromptAccepted(handler: (message: ViskoOrbisDistilledPromptAcceptedMessage) => void): () => void;
    /**
     * Subscribe to "conditions_ready" messages only.
     * @returns Unsubscribe function
     */
    onConditionsReady(handler: (message: ViskoOrbisDistilledConditionsReadyMessage) => void): () => void;
    /**
     * Subscribe to "generation_reset" messages only.
     * @returns Unsubscribe function
     */
    onGenerationReset(handler: (message: ViskoOrbisDistilledGenerationResetMessage) => void): () => void;
    /**
     * Subscribe to "generation_paused" messages only.
     * @returns Unsubscribe function
     */
    onGenerationPaused(handler: (message: ViskoOrbisDistilledGenerationPausedMessage) => void): () => void;
    /**
     * Subscribe to "generation_resumed" messages only.
     * @returns Unsubscribe function
     */
    onGenerationResumed(handler: (message: ViskoOrbisDistilledGenerationResumedMessage) => void): () => void;
    /**
     * Subscribe to "generation_started" messages only.
     * @returns Unsubscribe function
     */
    onGenerationStarted(handler: (message: ViskoOrbisDistilledGenerationStartedMessage) => void): () => void;
    /**
     * Subscribe to "generation_complete" messages only.
     * @returns Unsubscribe function
     */
    onGenerationComplete(handler: (message: ViskoOrbisDistilledGenerationCompleteMessage) => void): () => void;
    /**
     * Subscribe to "resolution_accepted" messages only.
     * @returns Unsubscribe function
     */
    onResolutionAccepted(handler: (message: ViskoOrbisDistilledResolutionAcceptedMessage) => void): () => void;
    /**
     * Subscribe to "audio_prompt_accepted" messages only.
     * @returns Unsubscribe function
     */
    onAudioPromptAccepted(handler: (message: ViskoOrbisDistilledAudioPromptAcceptedMessage) => void): () => void;
    /**
     * Subscribe to "audio_enabled_accepted" messages only.
     * @returns Unsubscribe function
     */
    onAudioEnabledAccepted(handler: (message: ViskoOrbisDistilledAudioEnabledAcceptedMessage) => void): () => void;
    /**
     * Subscribe to the "main_video" recvonly video track the model publishes.
     *
     * The handler fires once the model starts publishing this track; it receives the live MediaStreamTrack and the parent MediaStream (useful for attaching to a `<video>` / `<audio>` element via `srcObject`).
     * @param handler - Called with the received track and its stream
     * @returns Unsubscribe function
     */
    onMainVideo(handler: (track: MediaStreamTrack, stream: MediaStream) => void): () => void;
    /**
     * Subscribe to the "main_audio" recvonly audio track the model publishes.
     *
     * The handler fires once the model starts publishing this track; it receives the live MediaStreamTrack and the parent MediaStream (useful for attaching to a `<video>` / `<audio>` element via `srcObject`).
     * @param handler - Called with the received track and its stream
     * @returns Unsubscribe function
     */
    onMainAudio(handler: (track: MediaStreamTrack, stream: MediaStream) => void): () => void;
}

export { MODEL_NAME, MODEL_VERSION, type ViskoOrbisDistilledAudioEnabledAcceptedMessage, type ViskoOrbisDistilledAudioPromptAcceptedMessage, type ViskoOrbisDistilledChunkCompleteMessage, type ViskoOrbisDistilledCommandErrorMessage, type ViskoOrbisDistilledConditionsReadyMessage, type ViskoOrbisDistilledGenerationCompleteMessage, type ViskoOrbisDistilledGenerationPausedMessage, type ViskoOrbisDistilledGenerationResetMessage, type ViskoOrbisDistilledGenerationResumedMessage, type ViskoOrbisDistilledGenerationStartedMessage, type ViskoOrbisDistilledImageAcceptedMessage, type ViskoOrbisDistilledMessage, ViskoOrbisDistilledModel, type ViskoOrbisDistilledOptions, type ViskoOrbisDistilledPromptAcceptedMessage, type ViskoOrbisDistilledRecvTrackName, type ViskoOrbisDistilledResolutionAcceptedMessage, type ViskoOrbisDistilledSetAudioEnabledParams, type ViskoOrbisDistilledSetAudioPromptParams, type ViskoOrbisDistilledSetImageParams, type ViskoOrbisDistilledSetPromptParams, type ViskoOrbisDistilledSetResolutionParams, type ViskoOrbisDistilledSetSeedParams, type ViskoOrbisDistilledStateMessage, ViskoOrbisDistilledTracks };
