export * from "./core/Reactor";
export * from "./react/ReactorProvider";
export * from "./react/ReactorView";
export * from "./react/ReactorController";
export * from "./react/WebcamStream";
export * from "./react/ClipPlayer";
export * from "./react/ClipDownloadButton";
export * from "./react/useClipDownload";
export * from "./react/hooks";
export * from "./types";
// Stateless recording primitives (helpers, types, schemas).
export {
  DEFAULT_PLAYLIST_POLL_SLACK_MS,
  RecordingError,
  RuntimeRecordingMessageType,
  clipFromPayload,
  createPlayableManifestUrl,
  downloadClipAsFile,
  fetchPlaylist,
  parsePlaylist,
  rewriteUrlHost,
} from "./utils/recording";
export type {
  Clip,
  ClipKind,
  ClipReadyPayload,
  ClipFailedPayload,
  DownloadClipOptions,
  FetchPlaylistOptions,
  ParseClipOptions,
} from "./utils/recording";
// Stateful recording client + its host adapter.
export {
  DEFAULT_CLIP_REQUEST_TIMEOUT_MS,
  RecordingClient,
} from "./core/RecordingClient";
export type { RecordingClientHost } from "./core/RecordingClient";
export type { ReactorStore } from "./core/store";
// JWT resolver types — pass a resolver to ReactorProvider / Reactor.connect()
// when the token is short-lived (e.g. Clerk session JWTs) so each Coordinator
// HTTP call picks up a fresh token. See REA-2512.
export type { JwtResolver, JwtSource } from "./core/auth";
export { normalizeJwtSource } from "./core/auth";
