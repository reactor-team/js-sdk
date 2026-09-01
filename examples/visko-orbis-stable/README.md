# Visko Orbis Stable — dev example

Clone this folder and read top-to-bottom: you should understand the model's entire API surface in under five minutes — and have a working frontend to build from.

**Visko Orbis · Stable** is Reactor's real-time, steerable video generation model. You give it a prompt (and optionally an image to anchor the first frame), it produces a continuous video stream, and you can **change the prompt mid-flight** — the picture morphs into the new description at the next chunk boundary instead of cutting. That mid-flight morph is the hero feature, and most of this example exists to teach it.

## Quick start

1. Grab a Reactor API key at [reactor.inc/account/api-keys](https://www.reactor.inc/account/api-keys) (starts with `rk_`).
2. Save it to `.env` in this folder: `cp .env.example .env` then add `REACTOR_API_KEY=rk_...`
3. `pnpm install && pnpm dev` and open the URL the dev server prints.

Click **Connect**, type a prompt (or tap a curated image card), and the video starts in a few seconds. The example reads all of the model's state from its `state` message — the one thing to remember as you read the code.

### Reality check (things that look wrong but aren't)

- **Connect is quick on a warm pod — slower from a cold one.** After an idle pod starts up (SR compile + warmup), subsequent connections place in seconds — measured ~10 s in this week's runs. First-time startup is the slow case, not the usual one.
- **A "429 no capacity" is busy, not broken.** One live session per deployment; Connect retries automatically.
- **The first chunk emits 0 frames** (SR priming). First picture ~2 chunks / ~4 s in.
- **The UI shows your own words, not the model's processing.** The snapshot carries no readable copy of the prompt as you wrote it, so the example pins what you sent (off the accepted `set_prompt` in `app/lib/visko.ts` as `preferredPrompt()`) and displays that. The model's rewritten prompt text stays inspectable in the dev console, where every data-channel message is debug-logged under `NODE_ENV=development`.

## What the example shows (the four behaviors to learn)

1. **Text-to-video (T2V).** `PromptComposer` — pick a preset or type your own → `setPrompt` → `start`. No image needed.
2. **Image-to-video (I2V).** `ImageStarter` — a curated image card or your own upload → upload → `setImage` → `setPrompt` → `start`. (This model has no atomic "set conditioning"; the chain is explicit.) The awaited `setImage` IS the decoded gate on js-sdk 3.0.0 — no separate `image_accepted` listener needed. The image anchors the first chunk; later chunks inherit it through the model's history.
3. **Live scene morphing (the hero).** `EvolveScene` — while a run is going, the same panel your prompt came from lists its curated "evolutions" (same setting, shifted conditions) plus a free-form box. Clicking one calls `setPrompt` mid-run — no restart. `NowPlaying` confirms it landed with a "morphed @ chunk N" stamp.
4. **State-driven UI.** Every component subscribes to one `state` message and drives off it alone. No top-down phase logic, no event aggregation to reconstruct state, no guessing what the model thinks it's doing.

Plus the model's ancillary surface, deliberate and small: **resolution** (a picker that's state-first — it renders from `state.available_resolutions` when the deployment publishes them, and falls back to the documented `1080p` / `2k` / `4k` tiers while PROD's list is empty today (labelled as such; applies at the next start)), **seed** (same seed + same prompts = same video), and **audio** (a real 48 kHz mono track that rides the video element; a "generate sound" toggle whose only honest copy is "applies at the next start"; no audio prompt, measured to sound better unset).

## Read it in this order

| File                                                   | Why                                                                                                                                                                                                      |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| `app/ViskoOrbisStableApp.tsx`                          | The whole mental model: one Provider (`jwtToken` resolver wired), a two-phase sidebar that self-organizes off the `state` snapshot, one video pane. Read it first.                                       |
| `app/components/StatusBadge.tsx`                       | The connection lifecycle + the 429-capacity truth. "Is it working?" lives here.                                                                                                                          |
| `app/components/PromptComposer.tsx`                    | T2V entry: presets + free-text → `setPrompt` → `start`.                                                                                                                                                  |
| `app/components/ImageStarter.tsx`                      | I2V entry: the explicit upload→setImage→`start` chain — the awaited `setImage` IS the "decoded" gate on 3.0.0 (no broadcast to wait for).                                                                |
| `app/components/EvolveScene.tsx`                       | The hero: morph the scene mid-run. Watch the button pending state while the awaited `set_prompt` is in flight.                                                                                           |
| `app/lib/prompts.ts`                                   | The scene library — starter presets and per-scene evolutions. State-law: each evolution re-establishes the same setting/subject before shifting conditions, so the morph reads as cinematography.        |
| `app/components/SessionOptions.tsx` + `AudioPanel.tsx` | The small training-wheels surface: resolution picker (state-first with a documented fallback while PROD's offered list is empty), seed, audio toggle. All apply at the next `start` and survive `reset`. |
| `app/components/Video.tsx`                             | The view — `ViskoOrbisStableMainVideoView audioTrack="main_audio"` so audio rides the same element as video.                                                                                             |     |
| `app/api/reactor/token/route.ts`                       | The scoped-JWT mint the SDK's `jwtToken` resolver calls. Server-side; the browser only ever holds a short-lived credential for this one model + its own sessions.                                        |

## Build on this

- **Change a scene, add a preset.** `app/lib/prompts.ts` — one entry per scene. Image-backed scenes need a 16:9 frame in `public/images/`.
- **Drop this into your own app.** Take `ViskoOrbisStableApp.tsx` + the `components/` you need. The Provider + `jwtToken` wiring is self-contained; every component reads from `state` alone and self-hides when out of phase.
- **Common pitfalls this example is built to teach you past:**
  - `pnpm dev` prints the actual port (it may not be 3000).
  - Any phase-reading outside of `state` (e.g. counting `chunk_complete` to track progress) will drift — read the snapshot.
  - Sound doesn't always need a click to start — but if the model ran without one (restored session) the "Tap to enable audio" button is how to recover.
  - Resolution/seed/audio are **start-time** settings; change them before `start`, not mid-run.
  - A non-16:9 reference image squashes to 832×480 with no crop.
- **Add an audio prompt later on purpose** only if you've measured it. The example leaves `set_audio_prompt` unset on purpose (feeding a scene description makes audio worse than omitting it).
- **Acks are the awaited call, not a listener (js-sdk 3.0.0+).** The per-command confirmations — `prompt_accepted`, `image_accepted`, `resolution_accepted`, `audio_enabled_accepted`, generation pause/resume — are the correlated reply the **awaited** `sendCommand(...)` resolves with, delivered to the calling connection only. They do not broadcast as `message` events anymore; `state` / `chunk_complete` / `generation_started` / `generation_complete` / `command_error` still do. So `await sendSetPrompt(s, p)` resolving IS the ack — don't listen for it.

## Talking to the model

This example runs on the generic **`@reactor-team/js-sdk` 3.0.0** (`ReactorProvider` + `useReactor` + `useReactorMessage`). Model commands go out as raw `sendCommand("<wire_name>", {...})` frames — `set_prompt`, `set_image`, `set_seed`, `set_resolution`, `set_audio_enabled`, `start`, `pause`, `resume`, `reset` — and model messages (`state`, `generation_started`, `prompt_accepted`, …) arrive on the `message` channel. The thin helpers in `app/lib/visko.ts` (`useViskoState`, `useModelMessageOfType`, `sendSetPrompt`, …) are sugar over the generic store, nothing more. That's the entire SDK surface the app uses — no other package is required.

Stuck? The deeper guide to every pattern here — connection model, snapshot lifecycle, I2V ack chain, prompt design rules, every gotcha this example is trying to teach — is [`skill/SKILL.md`](skill/SKILL.md).

## Sibling example

This is one of a paired launch: a second dev example for **`reactor/visko-orbis-dynamic`** lives at [`../visko-orbis-dynamic`](../visko-orbis-dynamic). Same Next.js + js-sdk 3.0.0 shape and the same ancillary surface — its `AudioPanel` has the same generate-sound toggle (`set_audio_enabled`) and its SessionOptions the same `available_resolutions` picker (stable's list is named delivery tiers; dynamic's also offers `native`). The remaining difference is the prompt pipeline: dynamic has no structured-caption echo message, so this example's "Painting" caption line has no dynamic counterpart.
