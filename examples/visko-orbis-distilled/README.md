# Visko Orbis Distilled

A Next.js + TypeScript reference frontend for **Visko Orbis · Distilled** — Reactor's real-time, steerable video generation model (the Distilled tier of the Visko Orbis family).

Connect, send a prompt, and watch the model produce a continuous video stream you can **steer mid-flight**. Start from a curated text prompt, an example image, or your own image — then hot-swap prompts to morph the scene live, no restart, no cut. Built on the typed `@reactor-models/visko-orbis-distilled` SDK.

```
┌──────────────────────┬─────────────────────────────────────┐
│  Status   ▸ ready    │                                     │
│                      │                                     │
│  Try a prompt        │                                     │
│  ┌────────┬────────┐ │         live video output           │
│  │ Coast  │ Desert │ │   (ViskoOrbisDistilledMainVideoView)│
│  └────────┴────────┘ │                                     │
│  Or start from image │                                     │
│  ┌────────┬────────┐ │                                     │
│  │ Citadel│ Neon   │ │         + muted-by-default main_audio│
│  └────────┴────────┘ │                                     │
│  Session ▾ resolution│                                     │
│  Audio    ▸ on       │                                     │
│  [Snap clip]         │                                     │
└──────────────────────┴─────────────────────────────────────┘
```

## Quick start

You'll need a Reactor API key — grab one at [reactor.inc/account/api-keys](https://www.reactor.inc/account/api-keys). It starts with `rk_`.

```bash
cp .env.example .env
# add your key: REACTOR_API_KEY=rk_...

pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000), click **Connect**, and pick a starting point.

> **Typed package — read this if `@reactor-models/visko-orbis-distilled` 404s on npm.**
> This example ships with the typed SDK **vendored** at [`vendor/visko-orbis-distilled/`](vendor/visko-orbis-distilled) and wired in via a `pnpm` override (`link:./vendor/visko-orbis-distilled`). That's a pre-publication shim: the package is generated from the model's live PROD schema but isn't on the public registry yet. `package.json` declares `"@reactor-models/visko-orbis-distilled": "^2.0.0"`, so once the real package is published you can drop the `pnpm.overrides` block and `pnpm up` — nothing else changes. See [`vendor/README.md`](vendor/README.md).

## What you can do with it

- **Start a scene from text alone (T2V).** Curated prompt presets in the sidebar, plus free-text. No image required — the model invents the opening frame.
- **Start from an image (I2V).** Curated image+prompt cards, or upload your own. The image anchors the first chunk; every later chunk inherits it through the model's history.
- **Steer the scene live — the hero feature.** Prompts are **per-chunk**: send a new prompt mid-run and the picture morphs into it at the next chunk boundary (~1.8 s). One-click "evolutions" keep the same world and shift its mood (golden hour → storm, calm sea → night fog), or type any new scene.
- **Pick a delivery resolution.** Rendered from the deployment's `available_resolutions` (e.g. 1080p / 2k / 4k) — never hard-coded. Applies at the next `start`; survives `reset`.
- **Audio on/off + muted playback.** `main_audio` is a real 48 kHz mono track, chunk-aligned with the video. Playback starts muted; the "generate sound" toggle saves compute and applies at the next `start`.
- **Reproducible runs.** `set_seed` — same seed + same prompts reproduces the same video. Applies at the next `start`.
- **Pause / Resume / Reset.** Real-time transport. `generation_complete` returns to waiting (no auto-restart) — "Start again" re-runs with the same conditions, "Reset" clears prompt + image.
- **Snap a clip.** Capture the last 10 s of the live stream and download an MP4 — base-SDK recording, no extra services.

## Reality notes (things that will look "broken" but aren't)

These are measured behaviours of the deployed model, surfaced so you don't misread them:

- **Connect takes MINUTES.** There's one live session per deployment, and startup pays for SR-model compile + three warmup chunks. The StatusBadge labels `waiting` honestly — it's not stuck. If it hangs in `waiting`, another tab (or a zombie session) is holding the pod.
- **The first chunk emits zero frames.** The super-resolution model primes on chunk 1 (`frames_emitted: 0`); first picture lands ~2 chunks / ~3.7 s in. The video panel holds a "Priming the stream…" overlay over this window instead of a black box.
- **The resolution picker changes the DELIVERED raster, not the dream.** The model generates at 832×480 and SparkVSR upscales to the picked tier. Picking 4k doesn't change what the model invents — only the output size.
- **Resolution, seed, and audio settings apply at the NEXT `start`** and survive `reset`; the prompt and image do not.
- **Non-16:9 images squash.** The reference image is resized to 832×480 with no crop. Use a 16:9 frame (the curated images are).
- **No audio prompt box on purpose.** Feeding a scene description into `set_audio_prompt` makes the audio measurably worse than leaving it unset (unset = sound generated from the picture alone). The example deliberately doesn't expose it.

## Architecture at a glance

The sidebar UI has two phases driven by the model's `state` snapshot (the single source of truth — never re-derive it from other messages):

| Phase     | When                          | What's visible                                                                        |
| --------- | ----------------------------- | ------------------------------------------------------------------------------------- |
| **Setup** | before generation has started | prompt presets, example images, custom upload, free-text textarea, session options    |
| **Live**  | while generating or paused    | active prompt, chunk counter, Pause / Resume / Reset, live steering, run-finished CTA |

Each component subscribes to the snapshot itself and self-hides when it's not in its phase. No central orchestrator.

## Code tour

The interesting bits, in roughly the order you'd read them:

| File                                                                     | What's in it                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`app/page.tsx`](app/page.tsx)                                           | Server Component. Checks `REACTOR_API_KEY` is set, otherwise renders [`SetupRequired.tsx`](app/SetupRequired.tsx).                                                                                                                                                 |
| [`app/api/reactor/token/route.ts`](app/api/reactor/token/route.ts)       | GET route that mints a session-scoped Reactor JWT (pinned to `reactor/visko-orbis-distilled` via `authorization_details`) and sets `Cache-Control: private, max-age=<token lifetime>`. The browser handles caching transparently.                                  |
| [`app/ViskoOrbisDistilledApp.tsx`](app/ViskoOrbisDistilledApp.tsx)       | First `"use client"` boundary. Wires `<ViskoOrbisDistilledProvider getJwt={fetchToken}>`, lays out the sidebar + video pane, mounts the hidden `<AudioOutlet />`.                                                                                                  |
| [`app/lib/prompts.ts`](app/lib/prompts.ts)                               | The scene library. Every prompt the app suggests — starting prompts and mid-stream evolutions — lives here. Same source feeds the setup presets, the example image cards, and the live steering picker.                                                            |
| [`app/components/PromptComposer.tsx`](app/components/PromptComposer.tsx) | Setup phase. Preset prompts + free-text input → `setPrompt` + `start`. Works text-only (T2V).                                                                                                                                                                      |
| [`app/components/ImageStarter.tsx`](app/components/ImageStarter.tsx)     | Setup phase. Curated image scenes run `uploadFile` → `setImage` → **wait for `image_accepted`** → `setPrompt` → `start` (no atomic `setConditioning` on this model, so the chain is explicit). Custom uploads just call `setImage`. Surfaces the 16:9 squash note. |
| [`app/components/EvolveScene.tsx`](app/components/EvolveScene.tsx)       | **Live phase — the hero.** Matches the active prompt against the scene library and renders evolutions as one-click morphs, plus a free-form morph box. `setPrompt` only — no restart.                                                                              |
| [`app/components/SessionOptions.tsx`](app/components/SessionOptions.tsx) | Resolution picker (from `available_resolutions`, never hard-coded) + seed. Both apply at the next `start`.                                                                                                                                                         |
| [`app/components/AudioPanel.tsx`](app/components/AudioPanel.tsx)         | "Generate sound" toggle (`set_audio_enabled`) + why playback starts muted and there's no audio-prompt box.                                                                                                                                                         |
| [`app/components/AudioOutlet.tsx`](app/components/AudioOutlet.tsx)       | Renders `main_audio` as a hidden, muted-by-default `<audio>` element fed by the live `MediaStream`.                                                                                                                                                                |
| [`app/components/NowPlaying.tsx`](app/components/NowPlaying.tsx)         | Live phase. Current prompt, chunk counter, transport controls, and the **run-finished** call-to-action (`generation_complete` → waiting).                                                                                                                          |
| [`app/components/SnapClip.tsx`](app/components/SnapClip.tsx)             | Model-agnostic. Captures the last N seconds of the live stream and offers an MP4 download. Drop-in for any Reactor example.                                                                                                                                        |
| [`app/components/StatusBadge.tsx`](app/components/StatusBadge.tsx)       | The connection lifecycle plus Connect / Disconnect, with honest labels for the slow `waiting` (SR compile + warmup) and `priming` (first-chunk-zero-frames) phases.                                                                                                |
| [`app/components/CommandError.tsx`](app/components/CommandError.tsx)     | Surfaces `command_error` messages so failed preconditions are never silent.                                                                                                                                                                                        |
| [`app/components/Video.tsx`](app/components/Video.tsx)                   | `<ViskoOrbisDistilledMainVideoView />` plus the SR-priming overlay.                                                                                                                                                                                                |

## Going further

For the full design rationale, prompt-engineering rules, and every gotcha the app exists to teach, read **[`skill/SKILL.md`](skill/SKILL.md)** — the SDK guide you can hand to an AI agent (or a human) to scaffold a Visko Orbis Distilled frontend on the same patterns.

## Tech stack

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · `@reactor-models/visko-orbis-distilled` (vendored pre-publication — see above) · [`@reactor-team/js-sdk`](https://www.npmjs.com/package/@reactor-team/js-sdk) (recording primitives) · [`@reactor-team/ui`](https://www.npmjs.com/package/@reactor-team/ui) (design tokens only) · [`hls.js`](https://www.npmjs.com/package/hls.js) (Chromium/Firefox clip preview)
