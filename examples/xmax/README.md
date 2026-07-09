# XMAX X2

A Next.js + TypeScript reference frontend for [**XMAX X2**](https://docs.reactor.inc/model-api-reference/xmax/overview) - real-time streaming video **editing** on Reactor.

Where generation models produce video from a prompt alone, X2 edits the video you bring: describe a change in plain text and the model makes that change while everything you don't mention carries through from the source untouched. Point your webcam at it and watch yourself transformed live, or pick a clip and stream it into the model the same way — frame for frame, edited and streamed back next to the source. Re-prompt mid-stream and the new edit lands at the next chunk boundary.

```
┌──────────────────────┬───────────────────────────────────────┐
│  Status / errors     │                                       │
│  Input               │             edited output             │
│   • webcam self-view │   webcam mode shows just this; video    │
│   • or pick a video  │   mode puts your source clip on the    │
│   • start → pause/   │   left and the edit on the right       │
│     resume / reset   ├───────────────────────────────────────┤
│  Prompt + presets    │   status row (idle/streaming/paused    │
│  Snap clip           │            · chunk · prompt)           │
└──────────────────────┴───────────────────────────────────────┘
```

## Quick start

> **Start a standalone project:** `npx create-reactor-app my-app --model=xmax` scaffolds this example into a fresh app — no clone needed. The steps below are for running it in-place from a monorepo checkout.

```bash
cp .env.example .env.local  # then add your REACTOR_API_KEY
pnpm install
pnpm dev                    # http://localhost:3000
```

Get a **production** API key (`rk_...`) from the [Reactor dashboard](https://reactor.inc) - the app targets `https://api.reactor.inc`. The key stays on the server (`REACTOR_API_KEY` is the only required env var); the browser only ever sees a short-lived JWT minted by `app/api/reactor/token/route.ts`.

## What you can do with it

- **Webcam** - your webcam is published to the model's `camera` input track and transformed in real time. Edited frames come back on `main_video`; the model picks its resolution per session from your source stream's aspect ratio.
- **Video** - pick a preset clip or a local file. Instead of uploading it, the app **plays it and streams its frames into the same `camera` track**, so the model edits it on its live path — the source pane and the edited pane share one feed and can't drift apart.
- **Steer the prompt** - re-prompt mid-stream at any time; the new edit lands at the next chunk boundary, with no re-render and no break in the stream. Prompts are editing instructions, not scene descriptions - the [prompt guide](https://docs.reactor.inc/model-api-reference/xmax/prompt-guide) covers how to write edits that land where you aim them.
- **Playback** - once the edit is running, the Input panel turns into pause / resume / reset controls.
- **Snap a clip** - capture the last N seconds of the stream (model-agnostic recording).

## Architecture at a glance

The model is the **source of truth**: only `state` messages mutate local state, and the UI gates entirely off the reduced `XmaxState` (`app/lib/state.ts`). Both input sources stream into the `camera` track, so generation is always the model's live path. Commands out: `set_prompt`, `start`, `pause`, `resume`, `reset`. Tracks: input `camera`, output `main_video`. The full wire surface - every command, message, and the `state` payload - is documented in the [schema reference](https://docs.reactor.inc/model-api-reference/xmax/schema).

> **Streaming a clip, not uploading it.** A selected video is played in a `<video>` element and captured with `captureStream()`; that track is published as `camera`. What you see in the source pane is literally what the model receives.

The app talks to the model through the base [`@reactor-team/js-sdk`](https://www.npmjs.com/package/@reactor-team/js-sdk) surface: `<ReactorProvider modelName="xmax/x2" getJwt={fetchToken}>` for the session, `useReactor()` for status and `sendCommand`, `useReactorMessage()` for the model's messages, and `<ReactorView track="main_video" />` for output.

## Code tour

| Path                                   | What it is                                                                        |
| -------------------------------------- | --------------------------------------------------------------------------------- |
| `app/XmaxApp.tsx`                      | `ReactorProvider` shell + layout + the single model-message subscription          |
| `app/components/ModeInput.tsx`         | The Input panel — source toggle, webcam self-view / video picker, Start, Playback |
| `app/components/WebcamSource.tsx`      | Webcam capture + self-view (in the Input panel); produces the `camera` track      |
| `app/components/VideoSource.tsx`       | Plays a chosen clip and streams it into `camera` via `captureStream()` (stage)    |
| `app/components/VideoPicker.tsx`       | Preset + local-file picker for the video source                                   |
| `app/components/useCameraPublisher.ts` | Publishes whichever source track is current; unpublishes before publishing        |
| `app/components/Playback.tsx`          | Live-phase pause / resume / reset, shown in the Input panel once started          |
| `app/components/Prompt.tsx`            | Prompt textarea + Apply, preset chips, active prompt                              |
| `app/components/Stage.tsx`             | Edited output — single in webcam mode; split with `original` in video mode        |
| `app/lib/state.ts`                     | Type-guards and reduces the `state` message into `XmaxState`                      |
| `app/api/reactor/token/route.ts`       | Mints the short-lived JWT server-side                                             |
| `app/components/SnapClip.tsx`          | Model-agnostic clip recording on `@reactor-team/js-sdk` (drop-in)                 |

## Going further

`skill/SKILL.md` documents the patterns this app uses - the SDK surface, the connection and state model, how webcam and video both stream into the `camera` track, the manual camera publish with `contentHint = "detail"`, and how to extend the example — including the model knobs this starter deliberately leaves out (reference-image conditioning, pointer drags, backlog mode). Point your coding agent at it when you build on top.

The published docs cover the model itself: the [overview](https://docs.reactor.inc/model-api-reference/xmax/overview) for the conceptual model and quick start, the [schema](https://docs.reactor.inc/model-api-reference/xmax/schema) for every command and message, the [prompt guide](https://docs.reactor.inc/model-api-reference/xmax/prompt-guide) for writing edit instructions, and a [tutorial](https://docs.reactor.inc/model-api-reference/xmax/tutorial) built around this app.

## Tech stack

Next.js 15 · React 19 · TypeScript · Tailwind v4 · `@reactor-team/js-sdk` · `@reactor-team/ui`
