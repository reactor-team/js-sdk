---
name: building-happy-oyster-frontends
description: Extend this cloned HappyOyster example app: add worlds, controls, or UI on top of the typed `@reactor-models/happy-oyster` without breaking the patterns the existing code uses. Covers the two-plane architecture (Reactor control plane + direct-edge video), the connect → createWorld/attachWorld → startTravel lifecycle, the authoritative world_state snapshot, the Adventure held-input model and Director transport, the same-origin gateway proxy, the getJwt auth route, and the typed-dependency name and publish.
---

# Building on this HappyOyster app

You've cloned this folder and want to extend it: a new world, a new control, a different UX. This guide is the map: the patterns the code already uses and the rules that keep additions native instead of bolted on. Read it alongside the source, especially [The two planes](#the-two-planes-read-this-first) and [The client surface](#the-client-surface) before touching anything.

## What HappyOyster actually is, in three sentences

HappyOyster is a **real-time interactive world model**. You build a world from a prose prompt (an **Adventure** world you drive like a game, or a **Director** world you steer with text), then **travel** it, streaming live video you keep influencing. Worlds are permanent account assets; a session is a viewport onto one current world at a time.

## The two planes (read this first)

Every other Reactor model streams its video through Reactor on the `main_video` track. **HappyOyster does not.** This one fact drives the whole app, so internalize it before you change anything:

- **Control plane: the Reactor session.** `@reactor-team/js-sdk` opens a data channel to the `happy-oyster` model. Over it: `create_world`, `attach_world`, `get_credentials`, Adventure control commands, Director `instruct`/`pause`/`resume`/`rewind`. The model answers with one authoritative `world_state` snapshot (and, during travel, a `travel_state` snapshot). Billing and JWTs live here too.
- **Video plane: direct from the edge.** `startTravel()` asks the model for short-lived, single-use credentials (a `token`, a `ticket`, and the gateway's `api_base_url`, all minted per session), then hands them to the HappyOyster Web SDK (`@happy-oyster/js-sdk`), which opens a WebRTC stream **straight from the edge into a plain `<video>`**. This video **never transits Reactor**. `<HappyOysterVideo>` is the element it renders into; it is HappyOyster's answer to `ReactorView`.

Consequence: anything that wants "the world video" reaches for `<HappyOysterVideo>` (a `<video>` fed by the edge SDK), never a `ReactorView`. The edge SDK's own HTTP calls go straight to the `api_base_url` the credentials carry (see [The gateway is runtime-delivered](#the-gateway-is-runtime-delivered-not-configured)); the browser is never told the gateway host by config.

## The client surface

Every screen talks to **one** surface (`useHappyOysterClient()` from [`components/happy-oyster/ho-client.tsx`](../components/happy-oyster/ho-client.tsx)), and never imports the SDK hook directly. That indirection keeps every screen decoupled from the SDK hook itself.

| Concept       | What it is                                                                                  | On the client surface                                                                 |
| ------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **Lifecycle** | Client phase `idle → connecting → connected → starting_stream → streaming → ended / failed` | `phase`, `connect()`, `disconnect()`                                                  |
| **World**     | The session's current world, from the model's snapshot                                      | `worldState` (`phase`, `mode`, `prompt`, `first_frame`, `encrypted_world_id`)         |
| **Setup**     | Make a world current                                                                        | `createWorld(params)`, `attachWorld(encryptedWorldId)`                                |
| **Travel**    | Open / close the direct video stream                                                        | `startTravel()`, `endTravelSession()`, `streaming`                                    |
| **Adventure** | Held movement + world verbs (mode 1)                                                        | `hold(cmd)`, `interact(verb)`, `release(axes)`, `stop()`                              |
| **Director**  | Text steering + transport (mode 2)                                                          | `instruct(text)`, `pause()`, `resume()`, `rewind(sec)`, `travelState`, `travelStatus` |

`LiveClientProvider` (in `ho-client.tsx`) implements this surface: it mounts the real `<HappyOysterProvider>` and adapts `useHappyOyster()` onto the surface above. Its video slot is `<HappyOysterVideo>`.

**When you add a screen, consume `useHappyOysterClient()`, not `useHappyOyster()`.** That keeps `ho-client.tsx` the only place that touches the SDK hook directly.

## The lifecycle, and why it's phase-driven

[`use-world-session.ts`](../components/happy-oyster/use-world-session.ts) runs one `WorldIntent` through a session. It does **not** script the steps imperatively; it reacts to `phase`:

```
idle/ended/failed → connect()
connected + no world → createWorld(params)  |  attachWorld(id)
connected + world ready → startTravel()      (auto, once per intent)
```

Why: React StrictMode's phantom mount/unmount disconnects the model mid-connect, so a one-shot "run the flow" effect would strand the session. Reacting to the phase means any aborted step just gets retried on the next render. **Keep new orchestration phase-driven and idempotent**; never assume a step ran exactly once.

The model is the single source of truth: it broadcasts one `world_state` snapshot on every change, and the client mirrors it verbatim. **Render from `worldState`; never derive world state locally.** That is what keeps client, runtime, and world from drifting.

### Build cost: the shape to design around

`createWorld()` runs on the **live, connected session** and an Adventure build takes ~30s (Director similar; the upstream cap is ~120s). `attachWorld()` on a pre-built world is **instant (no build)**. So:

- Featured worlds with a pinned `encryptedWorldId` attach (cheapest, fastest). The rest create from their prompt.
- Surface the build honestly: `worldState.phase` moves `creating → building → ready`, and the ready snapshot carries the `first_frame` and the `encrypted_world_id` you should save.

## Setup: create vs attach

- **`createWorld(params)`** takes `params.prompt` (≤2000 chars) plus a mode-discriminated shape: Adventure (`mode: 1`, optional `perspective`) or Director (`mode: 2`, optional `resolution`/`layout`/`narrative`). Optionally a first frame: `firstFrameImageUrl` (a public URL the edge fetches) **or** `firstFrameImage` (a `File`/`Blob` ≤2MB, uploaded to the session first), never both.
- **`attachWorld(encryptedWorldId)`** makes an existing world current with no build. The id is an opaque **capability** you saved from an earlier `createWorld`; there is no listing and no read-only peek. Save it (this app shows it as a copyable chip on the ready screen), and it re-opens the exact world later.

Both are **locked while a travel is live**; end the travel before re-pointing the world.

## Adventure input: held state, re-sent every chunk

The most important rule in [`AdventureControls.tsx`](../components/happy-oyster/AdventureControls.tsx): **controls are held state, not one-shot events.** HappyOyster consumes a command per generation chunk, so a single send stops applying after one chunk. The SDK owns a 300ms re-send loop: you just tell it the current held command via `hold()`, and it keeps the button applying until you `release()` it.

- **Wire DOM events to `hold` / `interact` / `release`, never per-frame.** `keydown` → `hold({ translation: "Front" })`, `keyup` → `release({ translation: true })`. Don't send on a timer; the SDK does that.
- **Chords compose.** Each key is tracked in a per-axis stack; the app resolves W+A to the protocol's `Front_Left` diagonal, Shift+W to sprint, and falls back to whatever's still held when one key releases. Push/pop the stack; don't send raw values from a new handler.
- **Clear everything on blur.** Releasing a key outside the window (cmd-tab, focus loss) never delivers `keyup`, so the app clears all axes on `blur`. Copy that guard into any new binding, or a phantom key keeps steering.
- **World verbs are advertised, not guessed.** `travelState.character_actions` / `environment_actions` list the verbs a world understands. Offer those (the app renders them as buttons); the channel accepts any string but the world no-ops most things outside its vocabulary. A verb press holds ~1200ms then releases.
- **Keyboard handlers ignore typing.** Every handler early-returns when the event target is an `INPUT`/`TEXTAREA`/contentEditable, and `preventDefault()`s handled keys so arrows don't scroll. Keep that.

## Director transport

[`DirectorControls.tsx`](../components/happy-oyster/DirectorControls.tsx): `instruct(text)` injects a steering instruction into the **live** world (it does not rebuild). `pause()` / `resume()` gate generation; `rewind(sec)` needs the session **paused** and snaps to multiples of 4s (the server rounds down). Debounce sends and disable transport while a call is in flight; the app tracks a `busy` flag. The instruction timeline and auto-detected chapters come off `travelState` (`user_instructions`, `chapters`); render them, don't invent them.

Mode is fixed at `createWorld` and cannot switch mid-world. The composer picks the mode; the in-session surface branches on `worldState.mode`.

## The gateway is runtime-delivered, not configured

There is no gateway env var and no proxy route in this example, and that is deliberate: the browser is never told where the gateway is by config. The model delivers it. Every `world_state` snapshot and every `travel_credentials` message carries `api_base_url` (the gateway app base URL), minted per session by the runtime. `startTravel()` reads `credentials.api_base_url` and hands it straight to the edge SDK, whose HTTP control plane (start, instruct, poll) and WebRTC signaling both talk to that host directly. Point-out for extenders: **read the gateway from the credentials the model sends; never hardcode it.** It is a single stable host today, but treating it as runtime data is what keeps the app correct if that ever stops being true.

If you are running the edge SDK somewhere a cross-origin browser call is blocked (a gateway fronted without CORS headers), the SDK's `startTravel` accepts an `apiBaseUrl` override so you can route through your own CORS-adding front; the default, and what this example uses, is the `api_base_url` the model delivered.

## Auth: `getJwt` resolver + cacheable route

Same pattern as every Reactor example, and the same model documented at [docs.reactor.inc/authentication](https://docs.reactor.inc/authentication): the `rk_...` API key (`REACTOR_API_KEY`) stays server-side and is exchanged for a short-lived JWT; only the JWT ever reaches the browser. [`app/api/reactor/token/route.ts`](../app/api/reactor/token/route.ts) is a **GET** route (browsers cache GET, not POST) that POSTs to Reactor's `/tokens` endpoint internally (API key in the `Reactor-API-Key` header) and returns the JWT with `Cache-Control: private, max-age=<until-expiry>`. Tokens live **at most 6 hours**; the server silently clamps larger `expires_after` requests, so the route derives the cache window from the `expires_at` the server actually granted, never from what it asked for. The client's `fetchToken` resolver (in `ho-client.tsx`) is handed to the SDK, which re-invokes it on every Coordinator hop, so a token aging out mid-session can't 401 uploads or renegotiation, and 99% of calls come back from the browser's HTTP cache. Wiring a Clerk/Auth0 token instead is a one-liner: return their token from the resolver.

## Connecting (and session-attach)

The example creates its own Reactor session: the client's `connect()` calls `ho.connect(fetchToken)`, which mints a session and syncs the first `world_state`. Nothing is stubbed. The sidebar's `StatusBadge` (the same connection panel every Reactor example puts at the top of its sidebar) exposes `connect()`/`disconnect()` directly; pre-connecting there is optional, because `useWorldSession()` connects on demand when an intent runs. If you instead need to attach to a session a backend or queue created, `ConnectOptions` (`{ sessionId, connectionId }`) is threaded end-to-end through the base `@reactor-team/js-sdk` (`Reactor.connect(jwt, options)` and the `connectOptions` prop on `<ReactorProvider>`); pass them by reaching the model's `connect(jwt, options)` via `useHappyOyster().model`. This example does not need that path.

## Errors worth handling

| Failure                         | Where it shows                | What to do                                                         |
| ------------------------------- | ----------------------------- | ------------------------------------------------------------------ |
| Build failed                    | `worldState.phase==="failed"` | Offer "try another prompt". Worlds are cheap.                      |
| First-frame content policy      | action error `403005`         | Return to the composer with the message.                           |
| Stale / not-yours pinned world  | action error `403001`         | Fall back to the create path.                                      |
| Transient gateway 5xx / no-gRPC | `startTravel()`               | The SDK retries 3× with a fresh single-use ticket; then error out. |
| Ticket expired (idle > 30min)   | `startTravel()`               | Just call `startTravel()` again; it re-requests credentials.       |
| Session drop                    | `phase === "ended"`           | Leave the travel view; no reconnect in this example.               |

Client-side travel caps live in [`lib/worlds.ts`](../lib/worlds.ts) (`TRAVEL_SECONDS`: 60s Adventure, 180s Director); the timer auto-ends the travel at zero and the world stays ready for another run.

## The typed SDK dependency, and the name

`@reactor-models/happy-oyster` is the typed SDK this example is built on, imported at `@reactor-models/happy-oyster` and `@reactor-models/happy-oyster/react`. It is **not on npm yet** (it publishes with the launch, REA-4015), so `pnpm install` resolves the pinned `^0.1.0` range only once it is live. To develop before then, build the SDK from its source (the `sdk/` package in `reactor-team/happy-oyster-demo`) and point the dependency at that build with a temporary, uncommitted `file:` link or a pnpm `override`; `STAGING.md` has the commands. Never commit that link, the committed dependency stays the published range.

The published **name** is locked: `@reactor-models/happy-oyster` (REA-4015 landed distribution on the `@reactor-models` scope; the publish workflow in `reactor-team/happy-oyster-demo` ships that exact name).

## Adding a featured world

One entry in [`lib/featured-worlds.json`](../lib/featured-worlds.json): `key`, `title`, `mode` (1 or 2), a paragraph `prompt`, and a `gradient` for the bubble. No component changes. To make it attach instantly instead of building, add its `encryptedWorldId` to [`lib/world-pins.json`](../lib/world-pins.json) (the shipped entries are `REPLACE_WITH_...` placeholders, treated as unpinned until you drop in a real id). Keep prompts paragraph-length with explicit setting and camera framing; short prompts produce unstable worlds.

## Brand alignment

The app maps Reactor's design tokens from `@reactor-team/ui`'s stylesheet into shadcn theme variables in [`app/globals.css`](../app/globals.css). Use the theme utilities (`bg-primary`, `text-primary-foreground`, `border-border`, `font-mono`); don't invent parallel color systems with raw hex. Don't import `@reactor-team/ui` **React** components into Server Components; the stylesheet import is all you need. The app is dark-only via the `dark` class on `<html>`.

## Common mistakes

1. **Treating controls as events.** Adventure input is held state re-sent per chunk. Pair every `hold` with a `release`, use the key stacks, and clear on blur.
2. **Deriving world state locally.** Mirror `worldState`; the model is authoritative.
3. **Importing `useHappyOyster()` in a screen.** Go through `useHappyOysterClient()` instead so the SDK hook stays isolated to `ho-client.tsx`.
4. **Making the gateway a rewrite, or widening its header allowlist.** Cookie-stripping is load-bearing.
5. **Committing the local `file:`/override link.** It is dev-only; the committed dependency stays the published `@reactor-models/happy-oyster` range.
6. **Rebuilding a world to change it.** Director steering is `instruct()` on the live world, not a new `createWorld`.
7. **Rewind while running.** It needs the session paused and snaps to 4s multiples.
8. **Assuming video comes through Reactor.** It comes from the edge into `<HappyOysterVideo>`; the recorder/anything that wants pixels reads that element, not a `ReactorView`.

## Checklist for new components

- [ ] Consumes `useHappyOysterClient()`, not the SDK hook directly
- [ ] Interactive controls gate on `streaming` (and `worldState.phase` where relevant)
- [ ] Adventure inputs go through `hold`/`interact`/`release` with the key stacks; blur clears them
- [ ] Keyboard handlers ignore inputs/textareas and `preventDefault()` handled keys
- [ ] World state read from `worldState` / `travelState`, never derived
- [ ] Colors via theme utilities, not raw hex
- [ ] No local `file:`/override link committed (the dependency stays the published range)
