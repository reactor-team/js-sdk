import { ViskoOrbisDistilledSetSeedParams, ViskoOrbisDistilledSetImageParams, ViskoOrbisDistilledSetPromptParams, ViskoOrbisDistilledSetResolutionParams, ViskoOrbisDistilledSetAudioPromptParams, ViskoOrbisDistilledSetAudioEnabledParams, ViskoOrbisDistilledAudioEnabledAcceptedMessage, ViskoOrbisDistilledAudioPromptAcceptedMessage, ViskoOrbisDistilledChunkCompleteMessage, ViskoOrbisDistilledCommandErrorMessage, ViskoOrbisDistilledConditionsReadyMessage, ViskoOrbisDistilledGenerationCompleteMessage, ViskoOrbisDistilledGenerationPausedMessage, ViskoOrbisDistilledGenerationResetMessage, ViskoOrbisDistilledGenerationResumedMessage, ViskoOrbisDistilledGenerationStartedMessage, ViskoOrbisDistilledImageAcceptedMessage, ViskoOrbisDistilledMessage, ViskoOrbisDistilledPromptAcceptedMessage, ViskoOrbisDistilledResolutionAcceptedMessage, ViskoOrbisDistilledStateMessage, ViskoOrbisDistilledRecvTrackName } from './core.mjs';
import * as _reactor_team_js_sdk from '@reactor-team/js-sdk';
import { ReactorViewProps, ReactorProvider } from '@reactor-team/js-sdk';
import { ReactElement } from 'react';

/**
 * Props for the {@link ViskoOrbisDistilledProvider} component.
 *
 * Derived from `ReactorProvider`'s own props, with `modelName` and
 * `modelTracks` stripped — those are supplied by this provider.
 */
type ViskoOrbisDistilledProviderProps = Omit<Parameters<typeof ReactorProvider>[0], "modelName" | "modelTracks">;
/**
 * Provider for the ViskoOrbisDistilled model.
 *
 * Wraps {@link ReactorProvider} with `modelName` and `modelTracks` pre-configured from the
 * generated constants. Drop this near the top of your tree, then use
 * {@link useViskoOrbisDistilled} and the `useViskoOrbisDistilled<Message>` hooks below it.
 */
declare function ViskoOrbisDistilledProvider({ children, ...rest }: ViskoOrbisDistilledProviderProps): ReactElement;
/**
 * Access the ViskoOrbisDistilled model as typed commands bound to the nearest
 * {@link ViskoOrbisDistilledProvider}.
 *
 * Returns the full action surface — every public field on the SDK's
 * `ReactorStore` (`status`, `sessionId`, `connect`, `disconnect`,
 * `sendCommand`, `uploadFile`, `publish`, `unpublish`, `reconnect`,
 * …) is exposed automatically, alongside one typed method per
 * model event.
 *
 * Fields are pulled off the store one at a time so Zustand's
 * shallow-equality selector keeps each subscription scoped — a
 * component reading only `status` doesn't re-render when
 * `sessionExpiration` changes. Future SDK releases that add new
 * store fields flow into this hook on the next codegen run with no
 * hand-edit (the field list is derived from `js-sdk`'s d.ts via
 * `loadReactorStoreFieldsFromDts` in `sdk-surface.ts`).
 */
declare function useViskoOrbisDistilled(): {
    connect: (jwtToken?: _reactor_team_js_sdk.JwtSource, options?: _reactor_team_js_sdk.ConnectOptions) => Promise<void>;
    connectOptions: _reactor_team_js_sdk.ConnectOptions | undefined;
    disconnect: (recoverable?: boolean) => Promise<void>;
    downloadClipAsFile: (clip: _reactor_team_js_sdk.Clip, filename?: string | null, options?: _reactor_team_js_sdk.DownloadClipOptions) => Promise<Blob>;
    jwtToken: _reactor_team_js_sdk.JwtSource | undefined;
    lastError: _reactor_team_js_sdk.ReactorError | undefined;
    publish: (name: string, track: MediaStreamTrack) => Promise<void>;
    reconnect: (options?: _reactor_team_js_sdk.ConnectOptions) => Promise<void>;
    requestClip: (durationSeconds: number) => Promise<_reactor_team_js_sdk.Clip>;
    requestRecording: () => Promise<_reactor_team_js_sdk.Clip>;
    sendCommand: (command: string, data: any, scope?: _reactor_team_js_sdk.MessageScope) => Promise<void>;
    sessionExpiration: number | undefined;
    sessionId: string | undefined;
    status: _reactor_team_js_sdk.ReactorStatus;
    tracks: Record<string, MediaStreamTrack>;
    unpublish: (name: string) => Promise<void>;
    uploadFile: (file: File | Blob, options?: {
        name?: string;
    }) => Promise<_reactor_team_js_sdk.FileRef>;
    pause: () => Promise<void>;
    reset: () => Promise<void>;
    start: () => Promise<void>;
    resume: () => Promise<void>;
    setSeed: (params: ViskoOrbisDistilledSetSeedParams) => Promise<void>;
    setImage: (params: ViskoOrbisDistilledSetImageParams) => Promise<void>;
    setPrompt: (params: ViskoOrbisDistilledSetPromptParams) => Promise<void>;
    setResolution: (params: ViskoOrbisDistilledSetResolutionParams) => Promise<void>;
    setAudioPrompt: (params: ViskoOrbisDistilledSetAudioPromptParams) => Promise<void>;
    setAudioEnabled: (params: ViskoOrbisDistilledSetAudioEnabledParams) => Promise<void>;
};
/**
 * Subscribe to any ViskoOrbisDistilled message with a fully-typed handler.
 * The handler receives a discriminated ViskoOrbisDistilledMessage.
 */
declare function useViskoOrbisDistilledMessage(handler: (message: ViskoOrbisDistilledMessage) => void): void;
/**
 * Subscribe to "state" messages only.
 * Handler receives a fully-typed ViskoOrbisDistilledStateMessage.
 */
declare function useViskoOrbisDistilledState(handler: (message: ViskoOrbisDistilledStateMessage) => void): void;
/**
 * Subscribe to "command_error" messages only.
 * Handler receives a fully-typed ViskoOrbisDistilledCommandErrorMessage.
 */
declare function useViskoOrbisDistilledCommandError(handler: (message: ViskoOrbisDistilledCommandErrorMessage) => void): void;
/**
 * Subscribe to "chunk_complete" messages only.
 * Handler receives a fully-typed ViskoOrbisDistilledChunkCompleteMessage.
 */
declare function useViskoOrbisDistilledChunkComplete(handler: (message: ViskoOrbisDistilledChunkCompleteMessage) => void): void;
/**
 * Subscribe to "image_accepted" messages only.
 * Handler receives a fully-typed ViskoOrbisDistilledImageAcceptedMessage.
 */
declare function useViskoOrbisDistilledImageAccepted(handler: (message: ViskoOrbisDistilledImageAcceptedMessage) => void): void;
/**
 * Subscribe to "prompt_accepted" messages only.
 * Handler receives a fully-typed ViskoOrbisDistilledPromptAcceptedMessage.
 */
declare function useViskoOrbisDistilledPromptAccepted(handler: (message: ViskoOrbisDistilledPromptAcceptedMessage) => void): void;
/**
 * Subscribe to "conditions_ready" messages only.
 * Handler receives a fully-typed ViskoOrbisDistilledConditionsReadyMessage.
 */
declare function useViskoOrbisDistilledConditionsReady(handler: (message: ViskoOrbisDistilledConditionsReadyMessage) => void): void;
/**
 * Subscribe to "generation_reset" messages only.
 * Handler receives a fully-typed ViskoOrbisDistilledGenerationResetMessage.
 */
declare function useViskoOrbisDistilledGenerationReset(handler: (message: ViskoOrbisDistilledGenerationResetMessage) => void): void;
/**
 * Subscribe to "generation_paused" messages only.
 * Handler receives a fully-typed ViskoOrbisDistilledGenerationPausedMessage.
 */
declare function useViskoOrbisDistilledGenerationPaused(handler: (message: ViskoOrbisDistilledGenerationPausedMessage) => void): void;
/**
 * Subscribe to "generation_resumed" messages only.
 * Handler receives a fully-typed ViskoOrbisDistilledGenerationResumedMessage.
 */
declare function useViskoOrbisDistilledGenerationResumed(handler: (message: ViskoOrbisDistilledGenerationResumedMessage) => void): void;
/**
 * Subscribe to "generation_started" messages only.
 * Handler receives a fully-typed ViskoOrbisDistilledGenerationStartedMessage.
 */
declare function useViskoOrbisDistilledGenerationStarted(handler: (message: ViskoOrbisDistilledGenerationStartedMessage) => void): void;
/**
 * Subscribe to "generation_complete" messages only.
 * Handler receives a fully-typed ViskoOrbisDistilledGenerationCompleteMessage.
 */
declare function useViskoOrbisDistilledGenerationComplete(handler: (message: ViskoOrbisDistilledGenerationCompleteMessage) => void): void;
/**
 * Subscribe to "resolution_accepted" messages only.
 * Handler receives a fully-typed ViskoOrbisDistilledResolutionAcceptedMessage.
 */
declare function useViskoOrbisDistilledResolutionAccepted(handler: (message: ViskoOrbisDistilledResolutionAcceptedMessage) => void): void;
/**
 * Subscribe to "audio_prompt_accepted" messages only.
 * Handler receives a fully-typed ViskoOrbisDistilledAudioPromptAcceptedMessage.
 */
declare function useViskoOrbisDistilledAudioPromptAccepted(handler: (message: ViskoOrbisDistilledAudioPromptAcceptedMessage) => void): void;
/**
 * Subscribe to "audio_enabled_accepted" messages only.
 * Handler receives a fully-typed ViskoOrbisDistilledAudioEnabledAcceptedMessage.
 */
declare function useViskoOrbisDistilledAudioEnabledAccepted(handler: (message: ViskoOrbisDistilledAudioEnabledAcceptedMessage) => void): void;
/**
 * Subscribe to a recvonly MediaStreamTrack the model publishes, by name.
 *
 * Returns `undefined` until the model emits the track, then the live track for the lifetime of the connection. `name` is constrained to the model's declared recvonly channels — use one of `ViskoOrbisDistilledRecvTrackName`.
 * @param name - A recvonly track name declared by the model
 * @returns The live MediaStreamTrack, or `undefined` until received
 */
declare function useViskoOrbisDistilledTrack(name: ViskoOrbisDistilledRecvTrackName): MediaStreamTrack | undefined;
type ViskoOrbisDistilledMainVideoViewProps = Omit<ReactorViewProps, "track">;
/**
 * Render the model's "main_video" recvonly video track in a `<video>` element.
 *
 * Thin wrapper around `<ReactorView>` with `track` pre-bound. Accepts every other `ReactorViewProps` (`audioTrack`, `className`, `style`, `videoObjectFit`, `muted`, …). Must be rendered inside `<ViskoOrbisDistilledProvider>`.
 */
declare function ViskoOrbisDistilledMainVideoView(props: ViskoOrbisDistilledMainVideoViewProps): ReactElement;

export { ViskoOrbisDistilledMainVideoView, type ViskoOrbisDistilledMainVideoViewProps, ViskoOrbisDistilledProvider, type ViskoOrbisDistilledProviderProps, useViskoOrbisDistilled, useViskoOrbisDistilledAudioEnabledAccepted, useViskoOrbisDistilledAudioPromptAccepted, useViskoOrbisDistilledChunkComplete, useViskoOrbisDistilledCommandError, useViskoOrbisDistilledConditionsReady, useViskoOrbisDistilledGenerationComplete, useViskoOrbisDistilledGenerationPaused, useViskoOrbisDistilledGenerationReset, useViskoOrbisDistilledGenerationResumed, useViskoOrbisDistilledGenerationStarted, useViskoOrbisDistilledImageAccepted, useViskoOrbisDistilledMessage, useViskoOrbisDistilledPromptAccepted, useViskoOrbisDistilledResolutionAccepted, useViskoOrbisDistilledState, useViskoOrbisDistilledTrack };
