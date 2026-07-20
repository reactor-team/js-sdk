# HappyOyster

A Next.js + TypeScript reference frontend for **HappyOyster**, a real-time interactive world model on Reactor. Build a world from a prompt (or attach one you built before), then travel it live: **Adventure** worlds you drive like a game with WASD, **Director** worlds you steer with text instructions and pause / rewind transport.

What makes HappyOyster different from the other Reactor models: **the world video never transits Reactor.** The Reactor session is the control plane (it creates worlds, mints short-lived travel credentials, and carries your instructions), and the video streams **directly from the edge into the browser** over the HappyOyster Web SDK. Two planes, one app.

```
┌─────────────────────────┬────────────────────────────────────┐
│  Featured worlds        │                                    │
│  ┌────────┬────────┐    │                                    │
│  │ Meadow │ City    │   │          live world video          │
│  ├────────┼────────┤    │      (direct from the edge,      │
│  │ Forest │ Ruins   │   │       never through Reactor)       │
│  └────────┴────────┘    │                                    │
│  Compose your own       │                                    │
│  Attach by world id     │                                    │
│  ── while traveling ──  │                                    │
│  0:42 countdown         │                                    │
│  WASD · look · verbs    │                                    │
│  (Director: instruct,   │                                    │
│   pause, rewind)        │                                    │
└─────────────────────────┴────────────────────────────────────┘
```

Everything model-specific runs through the typed
[`@reactor-models/happy-oyster`](#the-typed-sdk-dependency-pending-publish) package, which wraps the base
[`@reactor-team/js-sdk`](https://www.npmjs.com/package/@reactor-team/js-sdk)
with a typed `connect → createWorld / attachWorld → startTravel` flow, live controls, and the `<HappyOysterVideo>` element the direct stream renders into.

## Quick start

> **Heads up:** the typed `@reactor-models/happy-oyster` package is not on npm yet (it publishes with the launch, REA-4015), so `pnpm install` will not resolve until then. To run the example before the publish, link a local build first: see [The typed SDK dependency](#the-typed-sdk-dependency-pending-publish).

```bash
cp .env.example .env.local
# add your key: REACTOR_API_KEY=rk_...   (grab one at reactor.inc/account/api-keys)

pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000), pick a featured world or compose your own, and the app connects a Reactor session, builds (or attaches) the world, and drops you into the live travel.

The API key never reaches the browser: the server route [`app/api/reactor/token/route.ts`](app/api/reactor/token/route.ts) exchanges it for a short-lived JWT (see [docs.reactor.inc/authentication](https://docs.reactor.inc/authentication)), and the SDK re-fetches it (through the browser's HTTP cache) on every Coordinator call via the `getJwt` resolver.

## What you can do with it

- **Featured worlds.** Six curated worlds: four Adventure, two Director. A world with a pinned id **attaches** instantly; the rest **create** from their prompt (a ~30s build).
- **Compose your own.** Free-text prompt, an Adventure/Director mode toggle, an optional first-frame image upload (≤2MB), and the knobs that apply to the chosen mode: perspective for Adventure; resolution, camera motion, and narrative for Director.
- **Attach by id.** Worlds are permanent; paste an `encrypted_world_id` you saved earlier to jump straight back in, no build.
- **Drive Adventure worlds.** WASD moves, arrows (or the on-screen pad) look, chords compose (W+A strafes, Shift+W sprints), and the world's advertised action verbs appear as buttons.
- **Direct Director worlds.** Type instructions to steer the next scene, pause / resume, and rewind (multiples of 4s, while paused). The instruction timeline and auto-detected chapters render live.

## How it works: the two planes

HappyOyster splits cleanly into a control plane and a video plane, and this example keeps them visibly separate.

**Control plane.** The Reactor session (`@reactor-team/js-sdk` data channel). `connect()` opens it; `createWorld()` / `attachWorld()` set the session's current world; `startTravel()` asks the model for short-lived, single-use travel credentials; Adventure `hold()`/`interact()` and Director `instruct()`/`pause()`/`rewind()` ride this channel. The model broadcasts one authoritative `world_state` snapshot the app mirrors and never derives from.

**Video plane.** The model broadcasts a `travel_credentials` message over the session, carrying a short-lived `token`, a single-use `ticket`, and the gateway's `api_base_url`, all minted per session. `startTravel()` hands those to the HappyOyster Web SDK, which opens a WebRTC stream **directly against the edge** and renders it into `<HappyOysterVideo>`. The SDK's own HTTP control calls (start, instruct, poll) go straight to the `api_base_url` the credentials carry. Nothing on this plane is client config and nothing routes through Reactor: the model tells the browser where its gateway is, at runtime.

## The typed SDK dependency (pending publish)

Everything model-specific runs through the typed **`@reactor-models/happy-oyster`** package (imported at `@reactor-models/happy-oyster` and `@reactor-models/happy-oyster/react`). It wraps the base `@reactor-team/js-sdk` with the `connect → createWorld / attachWorld → startTravel` flow, the live controls, and `<HappyOysterVideo>`. Two caveats for launch:

- **Not on npm yet.** The package publishes with the launch (REA-4015), so `pnpm install` resolves the pinned `^0.1.0` range only once it is live. To run before then, build the SDK from its source (the `sdk/` package in `reactor-team/happy-oyster-demo`) and point the dependency at that build with a temporary, uncommitted `file:` link or a pnpm `override`. Exact commands are in [`STAGING.md`](STAGING.md).
- **The published name is locked: `@reactor-models/happy-oyster`.** REA-4015 landed distribution on the `@reactor-models` scope, and the publish workflow in `reactor-team/happy-oyster-demo` ships exactly that name (its distribution switch flips on at launch, happy-oyster-demo#8).

## Configuration

| Env var                        | Required   | What it does                                                                                                                                                       |
| ------------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `REACTOR_API_KEY`              | yes (live) | Server-side key exchanged for session JWTs by `app/api/reactor/token/route.ts`.                                                                                    |
| `NEXT_PUBLIC_COORDINATOR_URL`  | no         | Reactor API base URL. Defaults to `https://api.reactor.inc` (`http://localhost:8080` in local-runtime mode).                                                       |
| `NEXT_PUBLIC_HO_LOCAL_RUNTIME` | no         | Set to `1` to talk straight to a runtime-served model (e.g. a local backend on `:8080`), skipping the Coordinator: no `REACTOR_API_KEY`, `connect()` takes no JWT. |

If `REACTOR_API_KEY` is missing, the app renders a friendly setup landing instead of erroring (see [`app/SetupRequired.tsx`](app/SetupRequired.tsx)).

## Code tour

| File                                                                                                                                  | What's in it                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`app/page.tsx`](app/page.tsx)                                                                                                        | Server Component gate: live app or the setup landing.                                                                                                                                               |
| [`app/HappyOysterApp.tsx`](app/HappyOysterApp.tsx)                                                                                    | The fixed shell: header on top, control sidebar beside the content screen. Mounts the client provider; nothing navigates.                                                                           |
| [`components/happy-oyster/ho-client.tsx`](components/happy-oyster/ho-client.tsx)                                                      | The `useHappyOysterClient()` surface adapting the live SDK. Start here.                                                                                                                             |
| [`components/happy-oyster/use-world-session.ts`](components/happy-oyster/use-world-session.ts)                                        | The session driver: owns the pending `WorldIntent` and walks connect → create/attach → auto-travel, phase-driven and StrictMode-safe.                                                               |
| [`lib/view.ts`](lib/view.ts)                                                                                                          | The app's one reducer: SDK snapshot in, `AppView` out — plus the four-step loading journey the screen traces live.                                                                                  |
| [`components/happy-oyster/Sidebar.tsx`](components/happy-oyster/Sidebar.tsx)                                                          | The control rail, topped by the `StatusBadge` connection panel: browse surfaces, then the build card, ready card, travel deck (countdown + mode-matched controls), or error card as the view moves. |
| [`components/happy-oyster/Screen.tsx`](components/happy-oyster/Screen.tsx)                                                            | The content screen the travel video plays in: the journey pane while loading, then the live stream, then the end scene with the world id.                                                           |
| [`components/happy-oyster/Gallery.tsx`](components/happy-oyster/Gallery.tsx) + [`Composer.tsx`](components/happy-oyster/Composer.tsx) | The browse surfaces: featured worlds, custom compose (prompt, mode toggle, ≤2MB first-frame upload), and attach-by-id.                                                                              |
| [`components/happy-oyster/AdventureControls.tsx`](components/happy-oyster/AdventureControls.tsx)                                      | WASD + arrows + chords → `hold` / `interact` / `release`; world-advertised verbs.                                                                                                                   |
| [`components/happy-oyster/DirectorControls.tsx`](components/happy-oyster/DirectorControls.tsx)                                        | Text `instruct`, pause / resume / rewind transport, the instruction + chapter timeline.                                                                                                             |
| [`app/api/reactor/token/route.ts`](app/api/reactor/token/route.ts)                                                                    | Cacheable GET route that exchanges `REACTOR_API_KEY` for a short-lived JWT.                                                                                                                         |
| [`lib/worlds.ts`](lib/worlds.ts) + [`lib/featured-worlds.json`](lib/featured-worlds.json)                                             | Featured world data, travel-time caps, and the `WorldIntent` type.                                                                                                                                  |
| [`skill/SKILL.md`](skill/SKILL.md)                                                                                                    | The extension guide: the two planes, the client surface, the input models, the credentials, auth, the dependency name/swap, and every gotcha.                                                       |

## Going further

Read [`skill/SKILL.md`](skill/SKILL.md) before extending. Deferred features you could add: touch/pointer control pads for mobile, snap-clip recording of the direct stream, a shareable `?world=` deep link, and prompt upsampling in the composer.

## Tech stack

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · `@reactor-models/happy-oyster` (typed HappyOyster SDK, publishes with the launch) · [`@reactor-team/js-sdk`](https://www.npmjs.com/package/@reactor-team/js-sdk) · [`@happy-oyster/js-sdk`](https://www.npmjs.com/package/@happy-oyster/js-sdk) (direct-edge video, loaded only when a live travel starts) · [`@reactor-team/ui`](https://www.npmjs.com/package/@reactor-team/ui) (design tokens)
