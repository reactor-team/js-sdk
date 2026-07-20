# Reactor JS SDK examples

Self-contained, runnable Next.js apps built on `@reactor-team/js-sdk` and the typed per-model packages. These are the same templates that `npx create-reactor-app` scaffolds — each folder here can be cloned, installed, and run independently.

| Example                                 | Model                                                                                                       | Highlights                                                                                                                                                                                                                                                                         |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`happy-oyster/`](./happy-oyster)       | `@reactor-models/happy-oyster` (publishes with launch)                                                      | Interactive world model with **direct-edge video**: world video streams straight from the edge to the browser, never through Reactor. Build a world from a prompt or attach a permanent one, then travel it: WASD in Adventure, text `instruct` + pause/rewind in Director.        |
| [`helios/`](./helios)                   | [`@reactor-models/helios`](https://www.npmjs.com/package/@reactor-models/helios)                            | Continuous prompt-driven video generation. Curated text and image scenes, mid-stream prompt hot-swap via `setPrompt`, atomic `setConditioning({ prompt, image })` for image-to-video, snap-clip recording, design tokens from `@reactor-team/ui`.                                  |
| [`lingbot/`](./lingbot)                 | [`@reactor-models/lingbot`](https://www.npmjs.com/package/@reactor-models/lingbot)                          | Interactive world model. Pick a starting image, drive the scene with WASD, layer in curated dynamic events (rain, fog, …) as live prompt swaps, snap-clip recording.                                                                                                               |
| [`lingbot-world-2/`](./lingbot-world-2) | [`@reactor-models/lingbot-world-2`](https://www.npmjs.com/package/@reactor-models/lingbot-world-2)          | Interactive world model you drive like a game. Two-axis WASD driving, per-latent `set_camera_pose` motion (mouse-look, roll, orbit, jump arcs, crouch dips), hold-key world events, a layered prompt workbench with live editor + inspector, attn-window / KV-cache knobs.         |
| [`longlive-v2/`](./longlive-v2)         | [`@reactor-models/longlive-v2`](https://www.npmjs.com/package/@reactor-models/longlive-v2)                  | Multi-shot **director's storyboard**. Compose shots (`set_shot`) and cuts (`scene_cut`) on a chunk timeline, schedule beats with `schedule_shot` / `schedule_scene_cut`, then direct live. Surfaces the per-scene 48-chunk budget and how cuts extend length. Snap-clip recording. |
| [`sana-streaming/`](./sana-streaming)   | [`@reactor-models/sana-streaming`](https://www.npmjs.com/package/@reactor-models/sana-streaming)            | Streaming **V2V editor**. Live webcam transform via manual `camera` publish, file-clip editing with side-by-side compare, mid-stream re-prompting, seed control, snap-clip recording.                                                                                              |
| [`x2/`](./x2)                           | [`@reactor-team/js-sdk`](https://www.npmjs.com/package/@reactor-team/js-sdk) (typed client vendored in-app) | Streaming **V2V editor** on XMAX X2. Webcam, file-clip, or still-image sources on one `source` track, side-by-side compare, mid-stream re-prompting, reference-image conditioning via `uploadFile`, drag-to-steer pointer on the output, keep-backlog toggle, snap-clip recording. |

## Running an example

Each folder is a standalone pnpm project — it does **not** join the root workspace, so you can `cp -R examples/helios my-app && cd my-app && pnpm install` and it works the same way `npx create-reactor-app` does.

```bash
cd examples/helios
cp .env.example .env.local
# add REACTOR_API_KEY=rk_...

pnpm install
pnpm dev
```

API keys come from [reactor.inc/account/api-keys](https://www.reactor.inc/account/api-keys). The example mints short-lived, **session-scoped** JWTs server-side via `app/api/reactor/token/route.ts` — each token is pinned to the example's model via `authorization_details` and can only operate sessions it created itself — and hands the resolver to `<ModelProvider getJwt={fetchToken}>`. See each example's `skill/SKILL.md` for the design rationale.

## Scaffolding from these templates

```bash
npx create-reactor-app my-app --model happy-oyster
npx create-reactor-app my-app --model helios
npx create-reactor-app my-app --model lingbot
npx create-reactor-app my-app --model lingbot-world-2
npx create-reactor-app my-app --model longlive-v2
npx create-reactor-app my-app --model sana-streaming
npx create-reactor-app my-app --model x2
```

`create-reactor-app` pulls from this folder on `main`, so anything that lands here ships to the CLI on the next release of `create-reactor-app`.

## Conventions

- Standalone Next.js 15 + React 19 + Tailwind v4 + TypeScript projects.
- Pinned to `@reactor-team/js-sdk` ^2.12.0.
- Each example carries a `skill/SKILL.md` — a self-contained agent skill that captures every design decision, gotcha, and extension pattern needed to grow the example into a real product. Read it before changing the example.
- One model per folder. Folder name = model identifier used by `create-reactor-app --model <name>`.
