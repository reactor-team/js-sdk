---
name: building-sana-streaming-frontends
description: Extend this cloned SANA-Streaming example app — add controls, modes, presets, or stage features on top of `@reactor-models/sana-streaming` without breaking the patterns the existing code uses. Covers the SDK connection / events / messages model, the live-webcam vs file-upload modes, the single model-driven reducer fed by the typed `state` hook, mid-stream re-prompting (~1 chunk latency), and the two small behaviors to preserve — the camera publish hint and the set_video retry.
---

# Building on this SANA-Streaming app

This is a reference frontend for sana-streaming, Reactor's real-time video-to-video editor. Read this before extending it so you keep the patterns the code already uses.

## What sana-streaming is

A continuous video editor you steer with text. You give it a source — your **webcam** (live) or an **uploaded clip** (file) — and a prompt describing a change; the model applies that change while everything you don't mention carries through from the source. Edited frames stream back on the `main_video` track in 24-frame chunks (~1–1.5s each).

The prompt is **optional**: with no prompt the model streams the source back nearly untouched; set or change one — at any time, including mid-stream — to steer the edit. A mid-stream prompt change lands at the next chunk boundary, about one chunk later. The source video is the only hard requirement to start in file mode; live mode needs only the published camera.

## The two input modes

|        | **live**                                     | **file**                                                       |
| ------ | -------------------------------------------- | -------------------------------------------------------------- |
| Source | webcam published to the `camera` track       | uploaded clip, **at least 33 frames**                          |
| Flow   | publish → `setMode({mode:"live"})` → `start` | `uploadFile` → `setVideo` → `setMode({mode:"file"})` → `start` |
| Stage  | single `<SanaStreamingMainVideoView>`        | side-by-side: local source `<video>` + the same view           |

The **Input panel** (`ModeInput`) is phase-aware, driven by the model's `started` flag: before `start` it shows the mode toggle, the webcam/file picker, the Start button, and the seed; once `started` is true it keeps the input slot mounted (so live mode keeps publishing the camera) and swaps the setup controls for `Playback` (pause / resume / reset). Reset returns it to the setup phase. Gate new controls on `started` / `paused` the same way, rather than disabling them in place.

## The four concepts

| Concept                    | API                                                                                                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Connection**             | `useSanaStreaming()` → `status`, `connect()`, `disconnect()`, `lastError`. Four states: disconnected → connecting → waiting → ready.                                     |
| **Events (you send)**      | `useSanaStreaming()` → `setMode`, `setVideo`, `setPrompt`, `setSeed`, `setAnchorInterval`, `start`, `pause`, `resume`, `reset` (+ `uploadFile`, `publish`, `unpublish`). |
| **Messages (you receive)** | `useSanaStreamingState((msg) => …)`, `useSanaStreamingCommandError((msg) => …)`, `useSanaStreamingGenerationReset((msg) => …)`, and a hook per other message.            |
| **Tracks**                 | `<SanaStreamingMainVideoView />` — pre-bound `<ReactorView track="main_video">`. Input is the `camera` track (live mode).                                                |

The provider is `<SanaStreamingProvider getJwt={fetchToken}>` (`app/SanaStreamingApp.tsx`): the model name and tracks are baked in, and every base-provider prop (`getJwt`, `connectOptions`, `apiUrl`, …) passes straight through.

## The model is the source of truth

The browser sends commands and renders model-reported state; it never tracks generation state optimistically.

- The typed `state` snapshot (`useSanaStreamingState`) is the **only** thing that mutates the reducer. The model sends it on connect, after every accepted command, and at each chunk boundary, so the UI renders from one message instead of accumulating individual events. `app/lib/state.ts:reduce` projects it into `SanaState` (`app/lib/types.ts`): `running`, `started`, `paused`, `currentChunk`, `currentPrompt`, `hasVideo`, `seed`. Every gate in the UI — the Input panel's setup-vs-playback phase (`started`), pause-vs-resume (`paused`), Start enablement (`hasVideo`) — keys off this state, not local guesses.
- Other messages are handled imperatively in the `Workspace` shell, each via its own typed hook: `useSanaStreamingCommandError` → a transient 6s banner (`<CommandError>`), except the retried decode case below; `useSanaStreamingGenerationReset` → clear the source object URL, bump `resetNonce` (children clear their local UI in step), and black out the stage until generation runs again.
- Reset local state to `DEFAULT_STATE` on full disconnect so a reconnect starts clean.

No `autoConnect` — `<StatusBadge>` surfaces the four-state machine with Connect/Disconnect buttons so the lifecycle is visible. Flip on `connectOptions={{ autoConnect: true }}` for a production app.

## Sending events — rules

- **Status-gate every control.** Only call command methods when `status === "ready"`.
- **The start flow is always `setMode` then `start`** — `lib/state.ts:startGeneration` encapsulates it; `LiveInput` and `FileInput` both call it. `setMode` is idempotent, so re-sending it keeps each start flow self-contained.
- **`setPrompt` is valid any time, including mid-stream.** It applies at the next chunk boundary; the prompt is an editing instruction, not a scene description.
- **A new control is a new typed method off `useSanaStreaming()`**, gated on `status === "ready"`, enabled/disabled off the reduced `SanaState` (see `Playback` for the smallest example). `setAnchorInterval` is the most obvious not-yet-surfaced knob — it periodically re-grounds the edit on the source clip to limit drift over long runs (every N chunks, `0` to disable); each re-ground may show a brief visible refresh.

## Receiving messages

Each message has its own typed hook; subscribe to only the ones you care about, and the handler gets the fully-typed message (flat fields, no `.data` envelope).

| Message (hook)                                         | Role                                                                                                                                              |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `state` (`useSanaStreamingState`)                      | **The only reducer input.** Full snapshot.                                                                                                        |
| `command_error` (`useSanaStreamingCommandError`)       | `{ command, reason }`. Always surface it, except the retried decode case.                                                                         |
| `video_accepted` (`useSanaStreamingVideoAccepted`)     | Source clip accepted (instantly, whatever its length — it's consumed as the edit streams). Informational; gate Start on `state.hasVideo` instead. |
| `prompt_accepted` (`useSanaStreamingPromptAccepted`)   | Informational ack of `setPrompt`.                                                                                                                 |
| `chunk_complete` (`useSanaStreamingChunkComplete`)     | Per-chunk progress. Informational.                                                                                                                |
| `generation_started` / `_complete` (matching hooks)    | Informational lifecycle markers.                                                                                                                  |
| `generation_reset` (`useSanaStreamingGenerationReset`) | Handled imperatively in the shell (clear source, reset children, blank stage).                                                                    |

Anything that should change what the UI shows belongs in the reducer, fed only by `state`. Informational messages can be consumed anywhere (see `FileInput`'s retry listener). `useSanaStreamingMessage` is a catch-all over the whole `SanaStreamingMessage` union (handy for devtools).

## Two behaviors to preserve

### 1. Live mode publishes the camera with a content hint — keep the manual path.

`LiveInput` acquires the webcam itself and sets `track.contentHint = "detail"` **before** `publish("camera", track)`. The model expects a stable camera resolution; `"detail"` tells the browser to hold resolution steady and trade framerate instead of ramping resolution up and down. The declarative `<SanaStreamingCameraView>` acquires and publishes for you but gives no hook to set the hint, so this component uses the manual `publish` / `unpublish` path. Switching to file mode unmounts `LiveInput`, which unpublishes and stops the camera.

### 2. `FileInput` retries `setVideo` on a transient "decode failed".

An uploaded clip occasionally comes back with a one-off `command_error` whose reason starts with `"decode failed"`. `FileInput` (via `useSanaStreamingCommandError`) just re-sends `setVideo` with the same upload ref up to `DECODE_RETRIES` times before surfacing the error inline, and the shell hides the banner for exactly this case (`isTransientDecodeFailure` in `lib/state.ts`) so the retry is invisible.

## Capturing clips

`<SnapClip>` uses the base `@reactor-team/js-sdk` (`useReactor`, `ClipPlayer`, `ClipDownloadButton`) — recording is model-agnostic and not re-exported by the typed package. `useReactor` works because `<SanaStreamingProvider>` wraps the base `ReactorProvider`. Drop the file into any model example unchanged.

## Common mistakes

- Reaching for the base SDK for sana-streaming-specific calls — use the typed `useSanaStreaming()` methods. The recording surface in `<SnapClip>` is the one intentional exception.
- Sending a command before `status === "ready"`.
- Gating Start on a local "I uploaded a file" flag instead of the model's `state.hasVideo`.
- Swapping `LiveInput` for `<SanaStreamingCameraView>` and losing the `contentHint` (see behavior 1).
- Forgetting to reset local state on disconnect, so a reconnect shows stale data.
- Single-line prompts — write a clear edit instruction (what changes, and what stays).

## Checklist for a new control

1. Decide its mode/phase and gate visibility off the reduced `SanaState`.
2. Status-gate every command on `status === "ready"`.
3. Use the typed `useSanaStreaming()` methods; subscribe via the per-message hooks.
4. Keep model state in the reducer (fed only by `state`); keep local UI drafts resettable on `resetNonce`.
5. Surface failures via `command_error` (`<CommandError>`).
6. Brand colors via the `bg-brand` / `text-active` Tailwind tokens (from `@reactor-team/ui`).
