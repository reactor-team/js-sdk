"use strict";
"use client";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/react.tsx
var react_exports = {};
__export(react_exports, {
  ViskoOrbisDistilledMainVideoView: () => ViskoOrbisDistilledMainVideoView,
  ViskoOrbisDistilledProvider: () => ViskoOrbisDistilledProvider,
  useViskoOrbisDistilled: () => useViskoOrbisDistilled,
  useViskoOrbisDistilledAudioEnabledAccepted: () => useViskoOrbisDistilledAudioEnabledAccepted,
  useViskoOrbisDistilledAudioPromptAccepted: () => useViskoOrbisDistilledAudioPromptAccepted,
  useViskoOrbisDistilledChunkComplete: () => useViskoOrbisDistilledChunkComplete,
  useViskoOrbisDistilledCommandError: () => useViskoOrbisDistilledCommandError,
  useViskoOrbisDistilledConditionsReady: () => useViskoOrbisDistilledConditionsReady,
  useViskoOrbisDistilledGenerationComplete: () => useViskoOrbisDistilledGenerationComplete,
  useViskoOrbisDistilledGenerationPaused: () => useViskoOrbisDistilledGenerationPaused,
  useViskoOrbisDistilledGenerationReset: () => useViskoOrbisDistilledGenerationReset,
  useViskoOrbisDistilledGenerationResumed: () => useViskoOrbisDistilledGenerationResumed,
  useViskoOrbisDistilledGenerationStarted: () => useViskoOrbisDistilledGenerationStarted,
  useViskoOrbisDistilledImageAccepted: () => useViskoOrbisDistilledImageAccepted,
  useViskoOrbisDistilledMessage: () => useViskoOrbisDistilledMessage,
  useViskoOrbisDistilledPromptAccepted: () => useViskoOrbisDistilledPromptAccepted,
  useViskoOrbisDistilledResolutionAccepted: () => useViskoOrbisDistilledResolutionAccepted,
  useViskoOrbisDistilledState: () => useViskoOrbisDistilledState,
  useViskoOrbisDistilledTrack: () => useViskoOrbisDistilledTrack
});
module.exports = __toCommonJS(react_exports);
var import_js_sdk2 = require("@reactor-team/js-sdk");

// src/core.ts
var import_js_sdk = require("@reactor-team/js-sdk");
var MODEL_NAME = "reactor/visko-orbis-distilled";
var ViskoOrbisDistilledTracks = [
  { name: "main_video", kind: "video", direction: "recvonly" },
  { name: "main_audio", kind: "audio", direction: "recvonly" }
];

// src/react.tsx
var import_jsx_runtime = require("react/jsx-runtime");
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
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    import_js_sdk2.ReactorProvider,
    {
      ...rest,
      modelName: MODEL_NAME,
      modelTracks: [...ViskoOrbisDistilledTracks],
      children
    }
  );
}
function useViskoOrbisDistilled() {
  const connect = (0, import_js_sdk2.useReactor)((s) => s.connect);
  const connectOptions = (0, import_js_sdk2.useReactor)((s) => s.connectOptions);
  const disconnect = (0, import_js_sdk2.useReactor)((s) => s.disconnect);
  const downloadClipAsFile = (0, import_js_sdk2.useReactor)((s) => s.downloadClipAsFile);
  const jwtToken = (0, import_js_sdk2.useReactor)((s) => s.jwtToken);
  const lastError = (0, import_js_sdk2.useReactor)((s) => s.lastError);
  const publish = (0, import_js_sdk2.useReactor)((s) => s.publish);
  const reconnect = (0, import_js_sdk2.useReactor)((s) => s.reconnect);
  const requestClip = (0, import_js_sdk2.useReactor)((s) => s.requestClip);
  const requestRecording = (0, import_js_sdk2.useReactor)((s) => s.requestRecording);
  const sendCommand = (0, import_js_sdk2.useReactor)((s) => s.sendCommand);
  const sessionExpiration = (0, import_js_sdk2.useReactor)((s) => s.sessionExpiration);
  const sessionId = (0, import_js_sdk2.useReactor)((s) => s.sessionId);
  const status = (0, import_js_sdk2.useReactor)((s) => s.status);
  const tracks = (0, import_js_sdk2.useReactor)((s) => s.tracks);
  const unpublish = (0, import_js_sdk2.useReactor)((s) => s.unpublish);
  const uploadFile = (0, import_js_sdk2.useReactor)((s) => s.uploadFile);
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
  (0, import_js_sdk2.useReactorMessage)(
    (msg) => handler(_unwrapMessage(msg))
  );
}
function useViskoOrbisDistilledState(handler) {
  (0, import_js_sdk2.useReactorMessage)((msg) => {
    const m = _unwrapMessage(msg);
    if (m.type === "state") {
      handler(m);
    }
  });
}
function useViskoOrbisDistilledCommandError(handler) {
  (0, import_js_sdk2.useReactorMessage)((msg) => {
    const m = _unwrapMessage(msg);
    if (m.type === "command_error") {
      handler(m);
    }
  });
}
function useViskoOrbisDistilledChunkComplete(handler) {
  (0, import_js_sdk2.useReactorMessage)((msg) => {
    const m = _unwrapMessage(msg);
    if (m.type === "chunk_complete") {
      handler(m);
    }
  });
}
function useViskoOrbisDistilledImageAccepted(handler) {
  (0, import_js_sdk2.useReactorMessage)((msg) => {
    const m = _unwrapMessage(msg);
    if (m.type === "image_accepted") {
      handler(m);
    }
  });
}
function useViskoOrbisDistilledPromptAccepted(handler) {
  (0, import_js_sdk2.useReactorMessage)((msg) => {
    const m = _unwrapMessage(msg);
    if (m.type === "prompt_accepted") {
      handler(m);
    }
  });
}
function useViskoOrbisDistilledConditionsReady(handler) {
  (0, import_js_sdk2.useReactorMessage)((msg) => {
    const m = _unwrapMessage(msg);
    if (m.type === "conditions_ready") {
      handler(m);
    }
  });
}
function useViskoOrbisDistilledGenerationReset(handler) {
  (0, import_js_sdk2.useReactorMessage)((msg) => {
    const m = _unwrapMessage(msg);
    if (m.type === "generation_reset") {
      handler(m);
    }
  });
}
function useViskoOrbisDistilledGenerationPaused(handler) {
  (0, import_js_sdk2.useReactorMessage)((msg) => {
    const m = _unwrapMessage(msg);
    if (m.type === "generation_paused") {
      handler(m);
    }
  });
}
function useViskoOrbisDistilledGenerationResumed(handler) {
  (0, import_js_sdk2.useReactorMessage)((msg) => {
    const m = _unwrapMessage(msg);
    if (m.type === "generation_resumed") {
      handler(m);
    }
  });
}
function useViskoOrbisDistilledGenerationStarted(handler) {
  (0, import_js_sdk2.useReactorMessage)((msg) => {
    const m = _unwrapMessage(msg);
    if (m.type === "generation_started") {
      handler(m);
    }
  });
}
function useViskoOrbisDistilledGenerationComplete(handler) {
  (0, import_js_sdk2.useReactorMessage)((msg) => {
    const m = _unwrapMessage(msg);
    if (m.type === "generation_complete") {
      handler(m);
    }
  });
}
function useViskoOrbisDistilledResolutionAccepted(handler) {
  (0, import_js_sdk2.useReactorMessage)((msg) => {
    const m = _unwrapMessage(msg);
    if (m.type === "resolution_accepted") {
      handler(m);
    }
  });
}
function useViskoOrbisDistilledAudioPromptAccepted(handler) {
  (0, import_js_sdk2.useReactorMessage)((msg) => {
    const m = _unwrapMessage(msg);
    if (m.type === "audio_prompt_accepted") {
      handler(m);
    }
  });
}
function useViskoOrbisDistilledAudioEnabledAccepted(handler) {
  (0, import_js_sdk2.useReactorMessage)((msg) => {
    const m = _unwrapMessage(msg);
    if (m.type === "audio_enabled_accepted") {
      handler(m);
    }
  });
}
function useViskoOrbisDistilledTrack(name) {
  return (0, import_js_sdk2.useReactor)((s) => s.tracks[name]);
}
function ViskoOrbisDistilledMainVideoView(props) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_js_sdk2.ReactorView, { ...props, track: "main_video" });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ViskoOrbisDistilledMainVideoView,
  ViskoOrbisDistilledProvider,
  useViskoOrbisDistilled,
  useViskoOrbisDistilledAudioEnabledAccepted,
  useViskoOrbisDistilledAudioPromptAccepted,
  useViskoOrbisDistilledChunkComplete,
  useViskoOrbisDistilledCommandError,
  useViskoOrbisDistilledConditionsReady,
  useViskoOrbisDistilledGenerationComplete,
  useViskoOrbisDistilledGenerationPaused,
  useViskoOrbisDistilledGenerationReset,
  useViskoOrbisDistilledGenerationResumed,
  useViskoOrbisDistilledGenerationStarted,
  useViskoOrbisDistilledImageAccepted,
  useViskoOrbisDistilledMessage,
  useViskoOrbisDistilledPromptAccepted,
  useViskoOrbisDistilledResolutionAccepted,
  useViskoOrbisDistilledState,
  useViskoOrbisDistilledTrack
});
//# sourceMappingURL=react.js.map