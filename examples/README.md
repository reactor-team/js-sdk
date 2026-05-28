# Reactor JS SDK examples

Self-contained, runnable Next.js apps built on `@reactor-team/js-sdk` and the typed per-model packages. These are the same templates that `npx create-reactor-app` scaffolds — each folder here can be cloned, installed, and run independently.

| Example                 | Model                                                                              | Highlights                                                                                                                                                                                                                                        |
| ----------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`helios/`](./helios)   | [`@reactor-models/helios`](https://www.npmjs.com/package/@reactor-models/helios)   | Continuous prompt-driven video generation. Curated text and image scenes, mid-stream prompt hot-swap via `setPrompt`, atomic `setConditioning({ prompt, image })` for image-to-video, snap-clip recording, design tokens from `@reactor-team/ui`. |
| [`lingbot/`](./lingbot) | [`@reactor-models/lingbot`](https://www.npmjs.com/package/@reactor-models/lingbot) | Interactive world model. Pick a starting image, drive the scene with WASD, layer in curated dynamic events (rain, fog, …) as live prompt swaps, snap-clip recording.                                                                              |

## Running an example

Each folder is a standalone pnpm project — it does **not** join the root workspace, so you can `cp -R examples/helios my-app && cd my-app && pnpm install` and it works the same way `npx create-reactor-app` does.

```bash
cd examples/helios
cp .env.example .env.local
# add REACTOR_API_KEY=rk_...

pnpm install
pnpm dev
```

API keys come from [reactor.inc/dashboard](https://www.reactor.inc/dashboard/account?section=api-keys). The example mints short-lived JWTs server-side via `app/api/reactor/token/route.ts` and hands the resolver to `<ModelProvider getJwt={fetchToken}>` — see each example's `skill/SKILL.md` for the design rationale.

## Scaffolding from these templates

```bash
npx create-reactor-app my-app --model helios
npx create-reactor-app my-app --model lingbot
```

`create-reactor-app` pulls from this folder on `main`, so anything that lands here ships to the CLI on the next release of `create-reactor-app`.

## Conventions

- Standalone Next.js 15 + React 19 + Tailwind v4 + TypeScript projects.
- Pinned to `@reactor-team/js-sdk` ^2.10.1 (the `getJwt` resolver + flat-MP4 clip download patterns).
- Each example carries a `skill/SKILL.md` — a self-contained agent skill that captures every design decision, gotcha, and extension pattern needed to grow the example into a real product. Read it before changing the example.
- One model per folder. Folder name = model identifier used by `create-reactor-app --model <name>`.
