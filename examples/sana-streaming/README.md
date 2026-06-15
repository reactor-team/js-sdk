# SANA-Streaming

A Next.js + TypeScript reference frontend for [**SANA-Streaming**](https://docs.reactor.inc/model-api-reference/sana-streaming/overview) - Reactor's real-time video **editing** model.

Where Reactor's other models generate video from a prompt, SANA-Streaming edits the video you bring: describe a change in plain text and the model makes that change while everything you don't mention carries through from the source untouched. Point your webcam at it and watch yourself transformed in real time, or upload a clip and have it edited and streamed back chunk by chunk next to the original. Re-prompt mid-stream and the new edit lands at the next chunk boundary, about a second later. Built on the typed [`@reactor-models/sana-streaming`](https://www.npmjs.com/package/@reactor-models/sana-streaming) SDK, so every command, message, and track is checked at compile time.

```
┌──────────────────────┬─────────────────────────────────────┐
│  Status / errors     │                                     │
│                      │         transformed video           │
│  Mode: file · live   │    (side-by-side with the original  │
│   • webcam / upload  │          in file mode)              │
│                      ├─────────────────────────────────────┤
│  Prompt + presets    │  status row (idle/streaming/paused  │
│  Transport + seed    │          · chunk · prompt)          │
│  Snap clip           │                                     │
└──────────────────────┴─────────────────────────────────────┘
```

## Quick start

```bash
cp .env.example .env.local  # then add your REACTOR_API_KEY
pnpm install
pnpm dev                    # http://localhost:3000
```

Get a **production** API key (`rk_...`) from the [Reactor dashboard](https://reactor.inc) - the app targets `https://api.reactor.inc`. The key stays on the server (`REACTOR_API_KEY` is the only env var); the browser only ever sees a short-lived JWT minted by `app/api/reactor/token/route.ts`.

## What you can do with it

- **Live mode** - your webcam is published to the model's `camera` input track and transformed in real time. Edited frames come back on `main_video` at 1280 × 704 in 24-frame chunks, one every ~1-1.5s.
- **File mode** - upload a clip of at least 33 frames. The model edits it according to your prompt and streams the result back chunk by chunk, shown side by side with the original.
- **Steer the prompt** - re-prompt mid-stream at any time; the new edit lands at the next chunk boundary, with no re-render and no break in the stream. Prompts are editing instructions, not scene descriptions - the [prompt guide](https://docs.reactor.inc/model-api-reference/sana-streaming/prompt-guide) covers how to write edits that land where you aim them.
- **Transport + seed** - pause / resume / reset the generation, and set a seed.
- **Snap a clip** - capture the last N seconds of the stream (model-agnostic recording).

## Architecture at a glance

The model is the **source of truth**: only `state` messages mutate local state, and the UI gates entirely off the reduced `SanaState` (`app/lib/state.ts`). Commands out: `set_mode`, `set_video`, `set_prompt`, `set_seed`, `start`, `pause`, `resume`, `reset`. Tracks: input `camera` (live mode), output `main_video`. The full wire surface - every command, message, and the `state` payload - is documented in the [schema reference](https://docs.reactor.inc/model-api-reference/sana-streaming/schema).

The app talks to the model through the typed SDK: `<SanaStreamingProvider getJwt={fetchToken}>` (model name + tracks baked in), the `useSanaStreaming()` hook for status and one typed method per command (`setMode`, `setVideo`, `setPrompt`, `start`, …), per-message hooks like `useSanaStreamingState` / `useSanaStreamingCommandError`, and `<SanaStreamingMainVideoView />` for output. The one exception is `app/components/SnapClip.tsx`, which uses `@reactor-team/js-sdk` directly for model-agnostic clip recording.

## Code tour

| Path                             | What it is                                                                 |
| -------------------------------- | -------------------------------------------------------------------------- |
| `app/SanaStreamingApp.tsx`       | `SanaStreamingProvider` shell + layout + the typed message subscriptions   |
| `app/components/ModeInput.tsx`   | File/live mode toggle + the active input panel                             |
| `app/components/LiveInput.tsx`   | Webcam capture, manual `publish()` to the `camera` track                   |
| `app/components/FileInput.tsx`   | Clip upload (at least 33 frames) via `uploadFile` + `setVideo`, with retry |
| `app/components/Prompt.tsx`      | Prompt textarea + Apply, preset chips, active prompt                       |
| `app/components/Transport.tsx`   | Pause / resume / reset + seed                                              |
| `app/components/Stage.tsx`       | `<SanaStreamingMainVideoView>`, side-by-side compare in file mode          |
| `app/lib/state.ts`               | Reduces the typed `state` message into `SanaState`                         |
| `app/api/reactor/token/route.ts` | Mints the short-lived JWT server-side                                      |
| `app/components/SnapClip.tsx`    | Model-agnostic clip recording on `@reactor-team/js-sdk` (drop-in)          |

## Going further

`skill/SKILL.md` documents the patterns this app uses - the typed-SDK surface, the connection and state model, the file/live mode model, the carried constraints (manual camera publish with `contentHint = "detail"`, the `set_video` retry), and how to extend the example. Point your coding agent at it when you build on top.

The published docs cover the model itself: the [overview](https://docs.reactor.inc/model-api-reference/sana-streaming/overview) for the conceptual model and quick start, the [schema](https://docs.reactor.inc/model-api-reference/sana-streaming/schema) for every command and message, the [prompt guide](https://docs.reactor.inc/model-api-reference/sana-streaming/prompt-guide) for writing edit instructions, and a [tutorial](https://docs.reactor.inc/model-api-reference/sana-streaming/tutorial) built around this app.

## Tech stack

Next.js 15 · React 19 · TypeScript · Tailwind v4 · `@reactor-models/sana-streaming` (typed SDK) · `@reactor-team/js-sdk` (recording primitives) · `@reactor-team/ui`
