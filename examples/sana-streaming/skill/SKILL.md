---
name: building-sana-streaming-frontends
description: Extend this cloned SANA-Streaming example app - add controls, modes, presets, or stage features on top of the generic `@reactor-team/js-sdk` (no typed model package exists for sana-streaming) without breaking the patterns the existing code uses. Covers the connection / state model (one model-driven reducer, status-gated commands), live webcam mode vs file-upload mode, mid-stream re-prompting (~1 chunk latency), the exact-2.11.2 SDK pin and why bumping it breaks camera publish against the deployed runtime, and the manual camera-publish path with contentHint="detail" that keeps the model pod alive.
---

# Building on this SANA-Streaming app

This is a reference frontend for sana-streaming, Reactor's SANA V2V streaming video editor. Read this before extending it so you keep the patterns the code already uses, and so you do not "fix" the three constraints at the bottom.

## What sana-streaming is

A continuous video-to-video editor driven over WebRTC. Input track is `camera` (live mode), output track is `main_video`. Transformed frames stream back in 24-frame chunks (one chunk every ~1-1.5s). Two input modes:

|        | **live**                                     | **file**                                             |
| ------ | -------------------------------------------- | ---------------------------------------------------- |
| Source | webcam published to the `camera` track       | uploaded clip, **at least 33 frames**                |
| Flow   | publish → `set_mode {mode:"live"}` → `start` | `uploadFile` → `set_video` → `set_mode` → `start`    |
| Stage  | single `<ReactorView track="main_video">`    | side-by-side: local source `<video>` + `ReactorView` |

Prompts can be changed at any time mid-stream via `set_prompt`; the model applies them at the next chunk boundary, about one chunk later.

## Why this app uses the generic SDK

There is no `@reactor-models/sana-streaming` package on npm, so unlike the sibling examples (which use typed `@reactor-models/<model>` packages) this app drives `@reactor-team/js-sdk` directly: `<ReactorProvider getJwt={fetchToken} modelName="sana-streaming">` in `app/SanaStreamingApp.tsx`, `useReactor` selectors for `status` / `sendCommand` / `publish` / `uploadFile`, `useReactorMessage` for inbound messages, and `<ReactorView track="main_video">` for output.

## The model is the source of truth

The browser sends commands and renders model-reported state; it never tracks generation state optimistically.

- `type: "state"` (snake_case wire shape) is the **only** message that mutates the reducer. `app/lib/state.ts:reduce` projects it into `SanaState` (`app/lib/types.ts`): `running`, `started`, `paused`, `currentChunk`, `currentPrompt`, `hasPrompt`, `hasVideo`, `numSourceFrames`, `seed`. Everything the UI gates on - Start buttons, the mode-toggle disable, transport buttons - keys off this state, not local guesses.
- Other message types are handled imperatively in the `Workspace` shell (`SanaStreamingApp.tsx`): `command_error` → transient 6s banner (`<CommandError>`), **except** `set_video` "decode failed", which `FileInput` retries silently; `generation_reset` → clear the source object URL, bump `resetNonce` (children clear their local UI in step), and black out the stage until generation runs again (the WebRTC view would otherwise freeze on the last frame).
- Local state resets to `DEFAULT_STATE` on full disconnect so a reconnect starts clean.

## Connection and auth

No `autoConnect`. `<StatusBadge>` surfaces the four-state machine, disconnected → connecting → waiting → ready, with Connect/Disconnect buttons and `lastError`. JWTs come from `app/api/reactor/token/route.ts`: a GET route that POSTs to the coordinator `/tokens` with the server-only `REACTOR_API_KEY` and returns the JWT with `Cache-Control: private, max-age=<until expiry>`, so the browser caches it until it actually expires. The key never reaches the browser.

## Commands (you send)

All mutations go through `sendCommand(cmd, data)` from `useReactor((s) => s.sendCommand)`, and **only when `status === "ready"`**.

| Command      | Data                 | When / why                                                                                                                  |
| ------------ | -------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `set_mode`   | `{ mode }`           | On toggle change and again inside every start flow. **Idempotent** - re-sending keeps start flows self-contained.           |
| `set_video`  | `{ video: FileRef }` | File mode, after `uploadFile`. Model replies `video_accepted` + a `state` with `has_video: true`.                           |
| `set_prompt` | `{ prompt }`         | Any time, including mid-stream. Applies at the next chunk boundary.                                                         |
| `set_seed`   | `{ seed }`           | Any time; useful before the first start.                                                                                    |
| `start`      | `{}`                 | Begin generation. **The start flow is always `set_mode` then `start`** (see `LiveInput.startLive` / `FileInput.startFile`). |
| `pause`      | `{}`                 | While started.                                                                                                              |
| `resume`     | `{}`                 | While started and paused.                                                                                                   |
| `reset`      | `{}`                 | Any time; clears the model's video, prompt, and progress, triggers `generation_reset`.                                      |

## Messages (you receive)

Subscribe with `useReactorMessage`; the union of fields the UI reads is `SanaMessage` in `app/lib/types.ts`.

| Message                                      | Role                                                                                                            |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `state`                                      | **The only reducer input.** Full snapshot, snake_case.                                                          |
| `command_error`                              | `{ command, reason }`. Surface it (banner), except the FileInput-retried decode case.                           |
| `video_accepted`                             | Upload probe succeeded (`width`, `height`, `num_frames`, ...). Informational; gate on `state.hasVideo` instead. |
| `prompt_accepted`                            | Informational ack of `set_prompt`.                                                                              |
| `chunk_complete`                             | Per-chunk progress (`chunk_index`, `frames_emitted`, `active_prompt`). Informational.                           |
| `generation_started` / `generation_complete` | Informational lifecycle markers.                                                                                |
| `generation_reset`                           | Handled imperatively in the shell: clear source URL, bump `resetNonce`, black out stage.                        |

## The three carried constraints - do NOT "fix" these

### 1. SDK pinned exactly `2.11.2`. Do not bump it.

SDK 2.12.0+ changed `publishTrack` to send a `publish_track` control-channel request and await a runtime ack (10s timeout), which requires the runtime's `publish_track` responder, added in runtime 2.7.10. The deployed sana-streaming image (v0.1.2) pins runtime `2.7.9-0`, which predates it: the pod drops the message as an unrecognized scope and the publish times out with `TRACK_PUBLISH_FAILED`. 2.11.x publishes via a bare `replaceTrack()` on the pre-negotiated sendonly transceiver, which works against both old and new runtimes. Unpin only after the deployed image is rebuilt on runtime >= 2.7.10. Keep the lockfile committed.

### 2. `LiveInput` uses the manual `publish()` path, not `<WebcamStream/>`.

The component owns `getUserMedia` so it can set `track.contentHint = "detail"` **before** `publish("camera", track)`. Chrome's encoder ramps resolution at stream start and on bandwidth dips; the model's live session does `np.stack` over a chunk of decoded frames and the pod crashes (`ValueError: all input arrays must have the same shape`) on any mid-chunk resolution change. `"detail"` pins the encode resolution and degrades framerate instead. Any client publishing an unhinted camera track can crash the pod, so do not swap this for the declarative component. Switching to file mode unmounts `LiveInput`, which unpublishes and stops the camera.

### 3. `FileInput` auto-retries `set_video` on transient "decode failed".

The model's video probe forks an ffmpeg subprocess; a race with background gRPC threads in the pod intermittently corrupts the probe and yields a spurious "decode failed" for valid uploads. `FileInput` resends `set_video` with the same upload ref up to `DECODE_RETRIES` times before surfacing the error inline, and the shell suppresses the banner for exactly this case (`command === "set_video" && reason.startsWith("decode failed")`) so the retry is invisible. The real fix is model-side; remove the band-aid only when it lands.

## Verified against

| Component      | Version                                                     |
| -------------- | ----------------------------------------------------------- |
| SDK            | `@reactor-team/js-sdk` exactly `2.11.2`                     |
| Deployed image | sana-streaming `v0.1.2`                                     |
| Runtime        | `2.7.9-0`                                                   |
| Coordinator    | `https://api.reactor.inc` (prod; needs a prod `rk_...` key) |

Dev and prod keys are not interchangeable. To point at dev, pass `apiUrl="https://api.rea.live"` on the `ReactorProvider` in `SanaStreamingApp.tsx` and use a dev key.

## Extending this app

- **New controls** are new `sendCommand` calls, gated on `status === "ready"`, with enable/disable driven by the reduced `SanaState` (see `Transport` for the smallest example). Never gate on local optimism.
- **New message types**: informational ones can be consumed anywhere via `useReactorMessage` (see `FileInput`'s decode-retry listener); anything that should change what the UI shows belongs in the reducer, fed only by `state`.
- **Local UI that mirrors model state** (drafts, file selections) should reset on `resetNonce` so it tracks `generation_reset`.
- **`<SnapClip>`** is model-agnostic base-SDK recording (`useReactor((s) => s.requestClip)`, `ClipPlayer`, `ClipDownloadButton`); drop it into any example unchanged. Failures route to an inline error line, so a runtime without recording degrades gracefully.
- Brand colors via the `bg-brand` / `text-active` Tailwind tokens (from `@reactor-team/ui`).
