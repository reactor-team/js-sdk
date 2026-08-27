import {
  MODEL_NAME,
  ViskoOrbisDistilledTracks
} from "./chunk-QHLZX4FF.mjs";

// src/react.tsx
import {
  ReactorProvider,
  useReactor,
  useReactorMessage,
  ReactorView
} from "@reactor-team/js-sdk";
import { jsx } from "react/jsx-runtime";
function _unwrapMessage(raw) {
  const env = raw;
  if (env && typeof env === "object" && env.data && typeof env.data === "object") {
    return { ...env.data, type: env.type };
  }
  return raw;
}
function ViskoOrbisDistilledProvider({
  children,
  ...rest
}) {
  return /* @__PURE__ */ jsx(
    ReactorProvider,
    {
      ...rest,
      modelName: MODEL_NAME,
      modelTracks: [...ViskoOrbisDistilledTracks],
      children
    }
  );
}
function useViskoOrbisDistilled() {
  const connect = useReactor((s) => s.connect);
  const connectOptions = useReactor((s) => s.connectOptions);
  const disconnect = useReactor((s) => s.disconnect);
  const downloadClipAsFile = useReactor((s) => s.downloadClipAsFile);
  const jwtToken = useReactor((s) => s.jwtToken);
  const lastError = useReactor((s) => s.lastError);
  const publish = useReactor((s) => s.publish);
  const reconnect = useReactor((s) => s.reconnect);
  const requestClip = useReactor((s) => s.requestClip);
  const requestRecording = useReactor((s) => s.requestRecording);
  const sendCommand = useReactor((s) => s.sendCommand);
  const sessionExpiration = useReactor((s) => s.sessionExpiration);
  const sessionId = useReactor((s) => s.sessionId);
  const status = useReactor((s) => s.status);
  const tracks = useReactor((s) => s.tracks);
  const unpublish = useReactor((s) => s.unpublish);
  const uploadFile = useReactor((s) => s.uploadFile);
  return {
    connect,
    connectOptions,
    disconnect,
    downloadClipAsFile,
    jwtToken,
    lastError,
    publish,
    reconnect,
    requestClip,
    requestRecording,
    sendCommand,
    sessionExpiration,
    sessionId,
    status,
    tracks,
    unpublish,
    uploadFile,
    pause: () => sendCommand("pause", {}),
    reset: () => sendCommand("reset", {}),
    start: () => sendCommand("start", {}),
    resume: () => sendCommand("resume", {}),
    setSeed: (params) => sendCommand("set_seed", params),
    setImage: (params) => sendCommand("set_image", params),
    setPrompt: (params) => sendCommand("set_prompt", params),
    setResolution: (params) => sendCommand("set_resolution", params),
    setAudioPrompt: (params) => sendCommand("set_audio_prompt", params),
    setAudioEnabled: (params) => sendCommand("set_audio_enabled", params)
  };
}
function useViskoOrbisDistilledMessage(handler) {
  useReactorMessage(
    (msg) => handler(_unwrapMessage(msg))
  );
}
function useViskoOrbisDistilledState(handler) {
  useReactorMessage((msg) => {
    const m = _unwrapMessage(msg);
    if (m.type === "state") {
      handler(m);
    }
  });
}
function useViskoOrbisDistilledCommandError(handler) {
  useReactorMessage((msg) => {
    const m = _unwrapMessage(msg);
    if (m.type === "command_error") {
      handler(m);
    }
  });
}
function useViskoOrbisDistilledChunkComplete(handler) {
  useReactorMessage((msg) => {
    const m = _unwrapMessage(msg);
    if (m.type === "chunk_complete") {
      handler(m);
    }
  });
}
function useViskoOrbisDistilledImageAccepted(handler) {
  useReactorMessage((msg) => {
    const m = _unwrapMessage(msg);
    if (m.type === "image_accepted") {
      handler(m);
    }
  });
}
function useViskoOrbisDistilledPromptAccepted(handler) {
  useReactorMessage((msg) => {
    const m = _unwrapMessage(msg);
    if (m.type === "prompt_accepted") {
      handler(m);
    }
  });
}
function useViskoOrbisDistilledConditionsReady(handler) {
  useReactorMessage((msg) => {
    const m = _unwrapMessage(msg);
    if (m.type === "conditions_ready") {
      handler(m);
    }
  });
}
function useViskoOrbisDistilledGenerationReset(handler) {
  useReactorMessage((msg) => {
    const m = _unwrapMessage(msg);
    if (m.type === "generation_reset") {
      handler(m);
    }
  });
}
function useViskoOrbisDistilledGenerationPaused(handler) {
  useReactorMessage((msg) => {
    const m = _unwrapMessage(msg);
    if (m.type === "generation_paused") {
      handler(m);
    }
  });
}
function useViskoOrbisDistilledGenerationResumed(handler) {
  useReactorMessage((msg) => {
    const m = _unwrapMessage(msg);
    if (m.type === "generation_resumed") {
      handler(m);
    }
  });
}
function useViskoOrbisDistilledGenerationStarted(handler) {
  useReactorMessage((msg) => {
    const m = _unwrapMessage(msg);
    if (m.type === "generation_started") {
      handler(m);
    }
  });
}
function useViskoOrbisDistilledGenerationComplete(handler) {
  useReactorMessage((msg) => {
    const m = _unwrapMessage(msg);
    if (m.type === "generation_complete") {
      handler(m);
    }
  });
}
function useViskoOrbisDistilledResolutionAccepted(handler) {
  useReactorMessage((msg) => {
    const m = _unwrapMessage(msg);
    if (m.type === "resolution_accepted") {
      handler(m);
    }
  });
}
function useViskoOrbisDistilledAudioPromptAccepted(handler) {
  useReactorMessage((msg) => {
    const m = _unwrapMessage(msg);
    if (m.type === "audio_prompt_accepted") {
      handler(m);
    }
  });
}
function useViskoOrbisDistilledAudioEnabledAccepted(handler) {
  useReactorMessage((msg) => {
    const m = _unwrapMessage(msg);
    if (m.type === "audio_enabled_accepted") {
      handler(m);
    }
  });
}
function useViskoOrbisDistilledTrack(name) {
  return useReactor((s) => s.tracks[name]);
}
function ViskoOrbisDistilledMainVideoView(props) {
  return /* @__PURE__ */ jsx(ReactorView, { ...props, track: "main_video" });
}

export {
  ViskoOrbisDistilledProvider,
  useViskoOrbisDistilled,
  useViskoOrbisDistilledMessage,
  useViskoOrbisDistilledState,
  useViskoOrbisDistilledCommandError,
  useViskoOrbisDistilledChunkComplete,
  useViskoOrbisDistilledImageAccepted,
  useViskoOrbisDistilledPromptAccepted,
  useViskoOrbisDistilledConditionsReady,
  useViskoOrbisDistilledGenerationReset,
  useViskoOrbisDistilledGenerationPaused,
  useViskoOrbisDistilledGenerationResumed,
  useViskoOrbisDistilledGenerationStarted,
  useViskoOrbisDistilledGenerationComplete,
  useViskoOrbisDistilledResolutionAccepted,
  useViskoOrbisDistilledAudioPromptAccepted,
  useViskoOrbisDistilledAudioEnabledAccepted,
  useViskoOrbisDistilledTrack,
  ViskoOrbisDistilledMainVideoView
};
//# sourceMappingURL=chunk-SNICM6QO.mjs.map