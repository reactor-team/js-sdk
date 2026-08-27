// src/core.ts
import { Reactor, FileRef } from "@reactor-team/js-sdk";
var MODEL_NAME = "reactor/visko-orbis-distilled";
var MODEL_VERSION = "v2.0.0";
var ViskoOrbisDistilledTracks = [
  { name: "main_video", kind: "video", direction: "recvonly" },
  { name: "main_audio", kind: "audio", direction: "recvonly" }
];
function _unwrapMessage(raw) {
  const env = raw;
  if (env && typeof env === "object" && env.data && typeof env.data === "object") {
    return { ...env.data, type: env.type };
  }
  return raw;
}
var ViskoOrbisDistilledModel = class extends Reactor {
  constructor(options) {
    super({
      ...options,
      modelName: MODEL_NAME,
      modelTracks: [...ViskoOrbisDistilledTracks]
    });
  }
  /** @deprecated The model client now extends `Reactor` directly — call methods on `this` instead. This accessor returns `this` for backwards compatibility and will be removed in a future major release. */
  get reactor() {
    return this;
  }
  /** Pause generation after the current chunk finishes. Frames stop streaming on `main_video` until `resume` is called; the model keeps its place, so resuming continues the same shot rather than starting a new one. Emits `generation_paused` and `state` on success, or `command_error` if not generating or already paused. */
  async pause() {
    await this.sendCommand("pause", {});
  }
  /** Abort the current run, clear the active prompt and starting image, and return to the waiting state. Valid at any time. After `reset`, call `set_prompt` (and optionally `set_image`) again before `start`. Emits `generation_reset` and `state`. */
  async reset() {
    await this.sendCommand("reset", {});
  }
  /** Begin generating video on `main_video`. Requires a prompt (via `set_prompt`); a starting image is optional. Emits `generation_started` and `state` on success, or `command_error` if no prompt is set. Has no effect while already generating. */
  async start() {
    await this.sendCommand("start", {});
  }
  /** Resume generation from a previous `pause`. Requires the session to be paused. Emits `generation_resumed` and `state` on success, or `command_error` if not paused. */
  async resume() {
    await this.sendCommand("resume", {});
  }
  /**
   * Seed for the noise the first chunk is sampled from. Must be a non-negative integer; the model never draws its own seed, so the same seed with the same prompts reproduces the same video. Read once when `start` fires — later changes take effect only after `reset` followed by a new `start`.
   * @param params - Seed for the noise the first chunk is sampled from. Must be a non-negative integer; the model never draws its own seed, so the same seed with the same prompts reproduces the same video. Read once when `start` fires — later changes take effect only after `reset` followed by a new `start`.
   */
  async setSeed(params) {
    await this.sendCommand("set_seed", params);
  }
  /**
   * Provide a starting frame the video grows out of (image-to-video). Optional — with no image the model generates from the prompt alone. Call before `start`; the image anchors the first chunk and every later chunk inherits it through the model's own history, so a change during generation has no effect until `reset` and a new `start`. Emits `image_accepted`, `conditions_ready`, and `state` on success, or `command_error` if the file is missing, is not an image, or cannot be decoded.
   * @param params - Provide a starting frame the video grows out of (image-to-video). Optional — with no image the model generates from the prompt alone. Call before `start`; the image anchors the first chunk and every later chunk inherits it through the model's own history, so a change during generation has no effect until `reset` and a new `start`. Emits `image_accepted`, `conditions_ready`, and `state` on success, or `command_error` if the file is missing, is not an image, or cannot be decoded.
   */
  async setImage(params) {
    await this.sendCommand("set_image", params);
  }
  /**
   * Set the scene prompt. Valid at any time — call before `start` to arm generation, or hot-swap during generation to steer the next chunk. The picture morphs into the new prompt at the next chunk boundary rather than cutting. Emits `prompt_accepted`, `conditions_ready`, and `state` on success.
   * @param params - Set the scene prompt. Valid at any time — call before `start` to arm generation, or hot-swap during generation to steer the next chunk. The picture morphs into the new prompt at the next chunk boundary rather than cutting. Emits `prompt_accepted`, `conditions_ready`, and `state` on success.
   */
  async setPrompt(params) {
    await this.sendCommand("set_prompt", params);
  }
  /**
   * Choose the delivery resolution for `main_video` from this deployment's offered list (`available_resolutions` in the `state` snapshot — e.g. `1080p`, `2k`, `4k`). Session-scoped: read when `start` fires, so the track's geometry never jumps mid-shot — call it before `start`, or any time to arm the next run. Unlike the prompt it survives `reset`. Emits `resolution_accepted` and `state` on success, or `command_error` naming the offered list when the value is not on it.
   * @param params - Choose the delivery resolution for `main_video` from this deployment's offered list (`available_resolutions` in the `state` snapshot — e.g. `1080p`, `2k`, `4k`). Session-scoped: read when `start` fires, so the track's geometry never jumps mid-shot — call it before `start`, or any time to arm the next run. Unlike the prompt it survives `reset`. Emits `resolution_accepted` and `state` on success, or `command_error` naming the offered list when the value is not on it.
   */
  async setResolution(params) {
    await this.sendCommand("set_resolution", params);
  }
  /**
   * Set the sound description the audio is generated from. Valid at any time — call before `start`, or during generation to change the sound from the next chunk on. Pass an empty string to clear it, which switches the audio model to generating sound from the picture alone. Emits `audio_prompt_accepted` and `state` on success; rejected with `command_error` on a deployment that has no audio track.
   * @param params - Set the sound description the audio is generated from. Valid at any time — call before `start`, or during generation to change the sound from the next chunk on. Pass an empty string to clear it, which switches the audio model to generating sound from the picture alone. Emits `audio_prompt_accepted` and `state` on success; rejected with `command_error` on a deployment that has no audio track.
   */
  async setAudioPrompt(params) {
    await this.sendCommand("set_audio_prompt", params);
  }
  /**
   * Enable or disable sound for runs started from now on. When false the audio model is skipped entirely — `main_audio` carries silence and each chunk is cheaper to produce. Session-scoped like `set_resolution`: read when `start` fires, and it survives `reset`. Emits `audio_enabled_accepted` and `state` on success; rejected with `command_error` on a deployment that has no audio track. A client that never wants audio can also simply omit `main_audio` from its track mapping when connecting — that needs no command, but still spends the compute; this command is how the compute is saved.
   * @param params - Enable or disable sound for runs started from now on. When false the audio model is skipped entirely — `main_audio` carries silence and each chunk is cheaper to produce. Session-scoped like `set_resolution`: read when `start` fires, and it survives `reset`. Emits `audio_enabled_accepted` and `state` on success; rejected with `command_error` on a deployment that has no audio track. A client that never wants audio can also simply omit `main_audio` from its track mapping when connecting — that needs no command, but still spends the compute; this command is how the compute is saved.
   */
  async setAudioEnabled(params) {
    await this.sendCommand("set_audio_enabled", params);
  }
  /**
   * Subscribe to typed model messages.
   * @param handler - Called with a discriminated ViskoOrbisDistilledMessage
   * @returns Unsubscribe function
   */
  onMessage(handler) {
    const wrappedHandler = (raw) => {
      handler(_unwrapMessage(raw));
    };
    this.on("message", wrappedHandler);
    return () => this.off("message", wrappedHandler);
  }
  /**
   * Subscribe to "state" messages only.
   * @returns Unsubscribe function
   */
  onState(handler) {
    return this.onMessage((msg) => {
      if (msg.type === "state") handler(msg);
    });
  }
  /**
   * Subscribe to "command_error" messages only.
   * @returns Unsubscribe function
   */
  onCommandError(handler) {
    return this.onMessage((msg) => {
      if (msg.type === "command_error") handler(msg);
    });
  }
  /**
   * Subscribe to "chunk_complete" messages only.
   * @returns Unsubscribe function
   */
  onChunkComplete(handler) {
    return this.onMessage((msg) => {
      if (msg.type === "chunk_complete") handler(msg);
    });
  }
  /**
   * Subscribe to "image_accepted" messages only.
   * @returns Unsubscribe function
   */
  onImageAccepted(handler) {
    return this.onMessage((msg) => {
      if (msg.type === "image_accepted") handler(msg);
    });
  }
  /**
   * Subscribe to "prompt_accepted" messages only.
   * @returns Unsubscribe function
   */
  onPromptAccepted(handler) {
    return this.onMessage((msg) => {
      if (msg.type === "prompt_accepted") handler(msg);
    });
  }
  /**
   * Subscribe to "conditions_ready" messages only.
   * @returns Unsubscribe function
   */
  onConditionsReady(handler) {
    return this.onMessage((msg) => {
      if (msg.type === "conditions_ready") handler(msg);
    });
  }
  /**
   * Subscribe to "generation_reset" messages only.
   * @returns Unsubscribe function
   */
  onGenerationReset(handler) {
    return this.onMessage((msg) => {
      if (msg.type === "generation_reset") handler(msg);
    });
  }
  /**
   * Subscribe to "generation_paused" messages only.
   * @returns Unsubscribe function
   */
  onGenerationPaused(handler) {
    return this.onMessage((msg) => {
      if (msg.type === "generation_paused") handler(msg);
    });
  }
  /**
   * Subscribe to "generation_resumed" messages only.
   * @returns Unsubscribe function
   */
  onGenerationResumed(handler) {
    return this.onMessage((msg) => {
      if (msg.type === "generation_resumed") handler(msg);
    });
  }
  /**
   * Subscribe to "generation_started" messages only.
   * @returns Unsubscribe function
   */
  onGenerationStarted(handler) {
    return this.onMessage((msg) => {
      if (msg.type === "generation_started") handler(msg);
    });
  }
  /**
   * Subscribe to "generation_complete" messages only.
   * @returns Unsubscribe function
   */
  onGenerationComplete(handler) {
    return this.onMessage((msg) => {
      if (msg.type === "generation_complete") handler(msg);
    });
  }
  /**
   * Subscribe to "resolution_accepted" messages only.
   * @returns Unsubscribe function
   */
  onResolutionAccepted(handler) {
    return this.onMessage((msg) => {
      if (msg.type === "resolution_accepted") handler(msg);
    });
  }
  /**
   * Subscribe to "audio_prompt_accepted" messages only.
   * @returns Unsubscribe function
   */
  onAudioPromptAccepted(handler) {
    return this.onMessage((msg) => {
      if (msg.type === "audio_prompt_accepted") handler(msg);
    });
  }
  /**
   * Subscribe to "audio_enabled_accepted" messages only.
   * @returns Unsubscribe function
   */
  onAudioEnabledAccepted(handler) {
    return this.onMessage((msg) => {
      if (msg.type === "audio_enabled_accepted") handler(msg);
    });
  }
  /**
   * Subscribe to the "main_video" recvonly video track the model publishes.
   *
   * The handler fires once the model starts publishing this track; it receives the live MediaStreamTrack and the parent MediaStream (useful for attaching to a `<video>` / `<audio>` element via `srcObject`).
   * @param handler - Called with the received track and its stream
   * @returns Unsubscribe function
   */
  onMainVideo(handler) {
    const wrapped = (name, t, s) => {
      if (name === "main_video") handler(t, s);
    };
    this.on("trackReceived", wrapped);
    return () => this.off("trackReceived", wrapped);
  }
  /**
   * Subscribe to the "main_audio" recvonly audio track the model publishes.
   *
   * The handler fires once the model starts publishing this track; it receives the live MediaStreamTrack and the parent MediaStream (useful for attaching to a `<video>` / `<audio>` element via `srcObject`).
   * @param handler - Called with the received track and its stream
   * @returns Unsubscribe function
   */
  onMainAudio(handler) {
    const wrapped = (name, t, s) => {
      if (name === "main_audio") handler(t, s);
    };
    this.on("trackReceived", wrapped);
    return () => this.off("trackReceived", wrapped);
  }
};

export {
  FileRef,
  MODEL_NAME,
  MODEL_VERSION,
  ViskoOrbisDistilledTracks,
  ViskoOrbisDistilledModel
};
//# sourceMappingURL=chunk-QHLZX4FF.mjs.map