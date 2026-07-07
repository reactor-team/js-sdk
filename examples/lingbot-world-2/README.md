# LingBot World 2 Interactive

A Next.js + TypeScript reference frontend for [**LingBot World 2**](https://reactor.inc) — the next version of Reactor's real-time interactive world model.

Pick a starting image, watch it come alive as a continuous video stream, and drive the scene with WASD. LingBot World 2 is image-to-video: it anchors the generation to a reference image, then accepts realtime movement and camera commands that flow into the output a fraction of a second later.

> **Typed SDK.** This app runs on the published [`@reactor-models/lingbot-world-2`](https://www.npmjs.com/package/@reactor-models/lingbot-world-2) package — the strongly-typed client for the model. It re-exports both the plain-JavaScript client and the React bindings from its root, so every component imports the typed provider, hooks, and message types straight from `@reactor-models/lingbot-world-2`.

```
┌──────────────────────┬─────────────────────────────────────┐
│  Status   ▸ ready    │                                     │
│                      │                                     │
│  Now playing · run   │                                     │
│  chunk 12/48 · w+a   │                                     │
│  [Pause]   [Reset]   │         live video output           │
│                      │         (LingbotWorld2MainVideoView)    │
│  Drive the scene     │                                     │
│         W            │                                     │
│      A  ·  D         │                                     │
│         S            │                                     │
│      ←     →   (yaw) │                                     │
│      ↑  ·  ↓   (pitch│                                     │
│  Rotation: ▬▬▬▬▬─    │                                     │
│                      │                                     │
│  Camera moves        │                                     │
│  [Orbit][Push][Crane]│                                     │
│  [Arc 2/6][Whip][Rev]│                                     │
└──────────────────────┴─────────────────────────────────────┘
```

## Quick start

> **Start a standalone project:** `npx create-reactor-app my-app --model=lingbot-world-2` scaffolds this example into a fresh app — no clone needed. The steps below are for running it in-place from a monorepo checkout.

You'll need a Reactor API key — grab one at [reactor.inc/account/api-keys](https://www.reactor.inc/account/api-keys). It starts with `rk_`.

```bash
cp .env.example .env
# add your key: REACTOR_API_KEY=rk_...

pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000), click **Connect**, pick a scene, and drive.

## What you can do with it

- **Start from a curated scene.** Four hand-tuned scenes ship in the sidebar — a first-person paraglider soaring above a green valley, a macro shot of an ant on a dirt path, a SWAT officer in a noir rain alley, and a mounted warrior over a muddy battlefield. Each one bundles a reference image and a paragraph-length prompt that frames both the subject and the camera, so a single click begins generating a coherent scene. Every prompt is a real LingBot World 2 lab eval case, used verbatim.
- **Bring your own.** Upload any image, write any paragraph-length prompt, and start. The same fast path the curated scenes use.
- **Drive the scene with WASD — diagonals included.** Once it's live, the on-screen pad (and the global keyboard listener) sends `set_move_longitudinal` (W/S), `set_move_lateral` (A/D), `set_look_horizontal`, and `set_look_vertical`. Movement is two independent axes in v2, so holding W+A drives diagonally. The model picks commands up at chunk boundaries and the output video reflects them a fraction of a second later. Arrow keys turn the subject, a rotation-speed slider tweaks how fast.
- **Direct the camera with preset moves.** A "Camera moves" panel drives LingBot World 2's native `set_camera_pose` layer — per-frame 6-float motion deltas. Sustained moves (orbit, push-in, crane-up) hold their velocity until re-clicked; one-shot moves (arc, whip pan, reveal) stream an eased multi-chunk velocity envelope — one slice per `chunk_complete` — and release the camera automatically when they finish. Each move also composes a matching `promptHint` sentence onto the active prompt for its duration, so the text conditioning and the pose conditioning tell the model the same story (pose alone fights the scene prompts' subject-tracked camera, and the subject tends to get dragged along). While a move is active its rotation overrides the arrow-key look and its translation adds to WASD. A collapsible readout shows the exact float array behind the active move, so the presets double as documentation for authoring your own.
- **Change the world on the fly.** A "World events" panel sits alongside the WASD pad. The featured Paraglider carries its own lab-authored event set (an eagle soaring past, a golden-hour shift, a jump — on F / G / Space); every other scene and any custom prompt gets a global fallback set (fog, golden sunset, night, storm, jump). Hold a button or its key and the panel hot-swaps the prompt mid-stream via `set_prompt` — either the lab's finished full-scene rewrite verbatim (`finalPrompt`) or the event composed onto the base scene; the model picks it up on the next chunk and the scene visibly shifts without restarting or losing the reference image. Release and the pristine base prompt is re-sent immediately, so the event lasts exactly as long as the hold — the same press → rewrite, release → direct-switch interaction the LingBot World 2 lab runtime uses.
- **Watch run progress.** `generation_started` announces how many chunks the run will produce (`chunk_num`); the Now Playing panel shows `chunk 12 / 48` so you can see where the run is and when the auto-restart will land.
- **Snap a clip.** A "Capture" panel sits at the bottom of the sidebar. Click once and the SDK grabs the last 10 seconds of the live stream, opens a preview modal, and offers an MP4 download — no recording stack to wire up, no extra services.
- **Pause / Resume / Reset.** Real-time transport controls. Reset clears the session and brings the setup panel back.

## Architecture at a glance

The sidebar UI has two phases driven by the model's `state` snapshot:

| Phase     | When                          | What's visible                                                                                                                                            |
| --------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Setup** | before generation has started | scene picker, custom-upload + custom-prompt                                                                                                               |
| **Live**  | while generating or paused    | active prompt, chunk / action counter, Pause / Resume / Reset, the WASD + look pad, rotation-speed slider, the Camera moves panel, the World events panel |

Each component subscribes to the snapshot itself and self-hides when it's not in its phase. No central orchestrator.

## Code tour

The interesting bits, in roughly the order you'd read them:

| File                                                                         | What's in it                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`app/page.tsx`](app/page.tsx)                                               | Server Component. Checks `REACTOR_API_KEY` is set, otherwise renders [`SetupRequired.tsx`](app/SetupRequired.tsx).                                                                                                                                                                                                                                                                                           |
| [`app/api/reactor/token/route.ts`](app/api/reactor/token/route.ts)           | GET route that mints a Reactor JWT and sets `Cache-Control: private, max-age=<token lifetime>`. The browser handles caching transparently — no localStorage, no JWT parsing in client code.                                                                                                                                                                                                                  |
| [`app/LingBotWorld2App.tsx`](app/LingBotWorld2App.tsx)                       | First `"use client"` boundary. Wires `<LingbotWorld2Provider getJwt={fetchToken}>` with a resolver pointing at the cacheable token route (`@reactor-team/js-sdk` ≥ 2.10.1 pattern), lays out the sidebar + video pane.                                                                                                                                                                                           |
| [`app/lib/scenes.ts`](app/lib/scenes.ts)                                     | The scene library. Every curated starting point — image + paragraph prompt, plus an optional scene-specific `events` set — lives here. Adding a new scene is one entry plus an image in `public/images/`.                                                                                                                                                                                                    |
| [`app/lib/dynamic-events.ts`](app/lib/dynamic-events.ts)                     | Curated hold-to-apply world events plus the composition rule. Each entry is an onset clause and a hold key; `composeEventPrompt` joins it onto the base scene as "And suddenly, …" — the same narrative register the lab runtime's prompt rewriter produces. Adding a new world event is one entry — no component changes.                                                                                   |
| [`app/lib/camera-moves.ts`](app/lib/camera-moves.ts)                         | Curated camera-pose presets for `set_camera_pose`, named after the cinematographic move. Sustained moves are constant `[rx, ry, rz, tx, ty, tz]` velocities; one-shot moves are per-frame profiles under a sin² easing envelope, sliced chunk by chunk. Every move carries a `promptHint` sentence that aligns the text conditioning with the pose. Adding a preset is one entry — no component changes.     |
| [`app/components/ScenePicker.tsx`](app/components/ScenePicker.tsx)           | Setup phase. Curated scene cards → `uploadFile` → `setImage` → `setPrompt` → `start`. Waits for `image_accepted` between `setImage` and `start` so the first chunk includes the image conditioning.                                                                                                                                                                                                          |
| [`app/components/CustomStart.tsx`](app/components/CustomStart.tsx)           | Setup phase. Custom image upload + free-text prompt → `start`.                                                                                                                                                                                                                                                                                                                                               |
| [`app/components/NowPlaying.tsx`](app/components/NowPlaying.tsx)             | Live phase. Current prompt, `chunk N / total` run progress (total captured from `generation_started`), `current_action`, transport controls.                                                                                                                                                                                                                                                                 |
| [`app/components/MovementControls.tsx`](app/components/MovementControls.tsx) | Live phase, signature feature. On-screen WASD + look pad, global keyboard listener, rotation-speed slider. Two independent movement axes (longitudinal + lateral) tracked as separate press states so W+A drives diagonally.                                                                                                                                                                                 |
| [`app/components/CameraPose.tsx`](app/components/CameraPose.tsx)             | Live phase. Curated `set_camera_pose` presets as single-active buttons, plus two load-bearing patterns: prompt coupling (compose the move's `promptHint` on activation, strip it on release) and chunk clocking (`chunk_complete` advances a cursor that streams each one-shot move's next slice, with on-button progress). Empty-list send releases the camera; reads `camera_pose_active` as a safety net. |
| [`app/components/DynamicEvents.tsx`](app/components/DynamicEvents.tsx)       | Live phase. Captures the session's "base prompt" on the first `started` snapshot, then drives hold-to-apply events: keydown / pointerdown sends the composed event prompt via `setPrompt`, keyup / pointerup / window blur re-sends the pristine base. Single hold at a time — a second press swaps (last press wins), and only the owning key can release.                                                  |
| [`app/components/SnapClip.tsx`](app/components/SnapClip.tsx)                 | Model-agnostic. Captures the last N seconds of the live stream via `requestClip(...)` and opens a preview modal with the SDK's `<ClipPlayer>` + `<ClipDownloadButton>`. Drop-in for any Reactor example.                                                                                                                                                                                                     |
| [`app/components/StatusBadge.tsx`](app/components/StatusBadge.tsx)           | The four-state connection lifecycle (`disconnected → connecting → waiting → ready`) plus Connect / Disconnect.                                                                                                                                                                                                                                                                                               |
| [`app/components/CommandError.tsx`](app/components/CommandError.tsx)         | Surfaces `command_error` messages from the model so failed preconditions are never silent.                                                                                                                                                                                                                                                                                                                   |
| [`app/components/Video.tsx`](app/components/Video.tsx)                       | One line: `<LingbotWorld2MainVideoView />`. The SDK component handles the `<video>` element, the `srcObject` wiring, and browser autoplay policies.                                                                                                                                                                                                                                                              |

## Going further

For the full design rationale, prompt-engineering rules, and every gotcha the app exists to teach, read **[`skill/SKILL.md`](skill/SKILL.md)** — the SDK guide you can hand to an AI agent (or a human) to scaffold their own LingBot World 2 frontend on the same patterns.

A few things this demo deliberately leaves out so the patterns stay clean:

- **Seed control.** `useLingbotWorld2().setSeed({ seed })` is one extra Setup-phase component.
- **Free-form mid-stream prompt textarea.** `DynamicEvents` ships a curated picker; if you want to let the user type any prompt mid-flight, drop a textarea next to it that calls `setPrompt` with the user's text composed onto the captured base prompt.
- **LLM prompt rewriting.** The lab runtime passes a held event's addendum through an LLM that restates the whole scene as one narrative before applying it. The demo approximates that rewrite deterministically (`composeEventPrompt`); wiring a real rewriter is a server-side route plus swapping one function.
- **Recorded camera trajectories.** The bundled moves are authored curves. The natural next layer is a "record" mode that captures a live WASD/look session as per-chunk deltas for replay — the data is already in the model's frame and units.
- **Scheduled prompt changes.** No chunk-level schedule is built in; emulate it by reacting to `useLingbotWorld2ChunkComplete` and sending the next `setPrompt` when the target chunk fires.
- **Gamepad / stick input.** Same shape as the keyboard handler — fire-and-forget typed methods on press, `"idle"` on release.

Extending is mostly additive — drop new components into the sidebar phases, or add new scenes to `app/lib/scenes.ts` (or new world events to `app/lib/dynamic-events.ts`, or new camera presets to `app/lib/camera-moves.ts`) and they show up automatically.

## Tech stack

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · [`@reactor-models/lingbot-world-2`](https://www.npmjs.com/package/@reactor-models/lingbot-world-2) (typed model SDK) · [`@reactor-team/js-sdk`](https://www.npmjs.com/package/@reactor-team/js-sdk) (transport + recording primitives) · [`@reactor-team/ui`](https://www.npmjs.com/package/@reactor-team/ui) (design tokens only) · [`hls.js`](https://www.npmjs.com/package/hls.js) (Chromium/Firefox clip preview)
