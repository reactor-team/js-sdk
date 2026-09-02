---
name: fast-h3
description: Extend the FastH3 Episodes starter — a Next.js app on @reactor-models/fast-h3 that composes multi-scene episodes and plays them as one continuous video via chained clips. Covers the model's queue contract, the hard-cut prompting rule that keeps chained scenes from degrading, the auth pattern, the state-snapshot pattern, capacity/error handling, and every model knob deliberately not shipped. For the multi-viewer LiveKit broadcast version of fast-h3, see ../../fast-h3-livestream instead.
---

# Extending FastH3 Episodes

You've cloned this folder and want to build on it. This guide carries the
model's contract, the app's patterns, and the prompting rules that keep the
output looking right — so your change lands without re-learning any of it.

## Which fast-h3 example am I in?

Two examples build on this model, with different product shapes:

|                      | **`fast-h3` (this app)**                              | [`fast-h3-livestream`](../../fast-h3-livestream)                                  |
| -------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------- |
| Shape                | One browser session, private to the person running it | A 24/7 broadcast channel many viewers watch together                              |
| Stack                | Next.js only, `@reactor-models/fast-h3` typed SDK     | Python streamer (`reactor-sdk`) publishing into a LiveKit room + a Next.js viewer |
| Who drives the model | The browser, directly                                 | The Python streamer; viewers only chat                                            |
| Episode source       | The composer UI (AI writer or by hand)                | Viewer chat ideas + a default scene rotation                                      |

`create-reactor-app` scaffolds **one folder per project** —
`--model=fast-h3` gives you this app. If what you actually want is the
channel (a stream that keeps running with an audience), scaffold or clone
`fast-h3-livestream` instead; its own `skill/SKILL.md` is the guide there.
Both skills document the same model contract; this one owns the browser
patterns, that one owns the streamer/room patterns.

## The model in three sentences

fast-h3 is a **queue of clip generations with an explicit player**: you
enqueue prompt-driven scenes, the model builds them in the background, and
built clips play on demand (or on their own with autoplay). A scene can
open from text alone or from an existing clip's last frame
(`continue_from_clip_id`) — chaining scenes into one continuous video is
the model's signature capability, and this app's whole flow is built
around it. The frontend's job reduces to: compose scene prompts, enqueue
them chained, and mirror the model's state.

## The four concepts

| Concept    | What it is here                                                                                  | API                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| Connection | `disconnected → connecting → waiting → ready`; commands need `ready`                             | `useFastH3().status / connect / disconnect`                               |
| Commands   | `enqueue`, `play`, `stop`, `pop`, `move`, `reset`, `set_*`, `get_*`                              | typed methods on `useFastH3()`, each resolving with its reply             |
| Messages   | `state_update` (the snapshot), `queue_update` (both queues), `clip_*` lifecycle, `command_error` | `useFastH3StateUpdate`, `useFastH3QueueUpdate`, `useFastH3ClipStarted`, … |
| Tracks     | `main_video` (24 fps) + `main_audio` (48 kHz, synced)                                            | `<FastH3MainVideoView audioTrack="main_audio" />`                         |

## The queue contract (what the UI mirrors)

A clip passes three stages: enqueued (the **generation queue**, `ready:
false`), built (the **playout queue**, `ready: true`), consumed (played or
popped). What the app relies on:

- **`enqueue`** replies `clip_queued` with the clip's UUID immediately —
  building happens in the background. Params: `prompt` (≤ 800 chars),
  `metadata` (opaque, echoed back untouched on every message referencing
  the clip), optional `seconds`, `seed`, `position` (0 = next build), and
  `continue_from_clip_id`.
- **Builds consume the generation queue front-first, always**, pausing only
  while the playout queue is full; a chained clip whose source isn't built
  yet waits without blocking others. `clip_generated` announces each build
  crossing into the playout queue.
- **Autoplay** (a session condition, off by default) starts the playout
  front whenever nothing is playing — and when that clip continues the one
  just finished, the handover is **seamless**: no black, no cut. This app
  turns it on when queueing an episode; that plus chaining is what makes an
  episode one continuous video.
- **`state_update`** is the one snapshot: capacities, clip-length bounds,
  canvas, autoplay, what's playing, and `valid_commands` (what the session
  would accept right now). **`queue_update`** carries both queues in full
  plus `history` — built clips that already played but can still be
  continued from.
- **`command_error`** is broadcast on every refusal; the refused typed call
  resolves `undefined`. Both must surface in the UI.
- Between non-continuing clips the stream cuts to black (configurable via
  `set_flush_on_clip_end`); that hold is the model's contract, not a bug.

The **metadata echo** is the correlation channel: the composer writes
`{episode, title, scene, scenes}` (see `app/lib/tag.ts`) at enqueue time,
and the queue panel and now-playing panel reconstruct everything from the
echo — no client-side bookkeeping that a reconnect could lose. Extend the
tag rather than adding local state.

## The hard-cut rule (the one thing you must not soften)

A chained clip generates forward from the previous clip's **final frame**.
Write the chain as one continuous take — "the camera continues…", "still
on her face…" — and generation errors compound scene over scene until the
picture visibly smears and repeats. Two rules keep an episode sharp end to
end, and they are encoded in three places (keep all three in step):

1. **Every scene is fully self-contained.** The model reads only that
   scene's text; setting, subjects, style, and light are re-described
   verbatim in every scene. The inherited frame carries the picture over;
   the text is what keeps it from mutating.
2. **Every scene after the first opens on a described hard cut** — a new
   shot with a clearly different camera angle, distance, or location,
   opened with the cut itself: _"Hard cut to a wide shot of …"_. Scenes
   must stay dynamic and different; near-identical scenes degrade and
   repeat even with cuts written in.

Where they live: the AI writer's system prompt
(`app/api/upsample/route.ts`), the composer's guidance text and
placeholders (`EpisodeComposer.tsx`), and the hand-written example episode
(`app/lib/prompts.ts`) that demonstrates the shape. If you rewrite any of
them, keep the rules intact — an unguided LLM writes continuous takes by
default, and the degradation shows on the output, not in a console.

## Auth: the no-store route + the memoized resolver

Four rules, all load-bearing (see `app/api/reactor/token/route.ts` and the
resolver in `FastH3App.tsx`):

1. The route returns `{ jwt, expires_at }` — the client memoizes the token
   for exactly its lifetime, never decoding the JWT.
2. `Cache-Control: private, no-store` — the browser's HTTP cache must never
   hold the token. A session can only be operated by the exact token that
   created it, and a dropped-then-refetched cache entry 403s every later
   hop.
3. `authorization_details` scopes the token to `reactor/fast-h3` with a
   bounded `max_sessions` — never mint an unscoped token for a browser.
4. The scope's model name must equal the name the provider connects with,
   account-qualified.

The resolver memoizes in module scope and coalesces parallel calls; the
provider re-calls it on every later hop (uploads, clip manifests, ICE
refreshes), so it must return the _same_ token until close to expiry.

## The state snapshot pattern

Every component that renders session state holds the snapshot itself:

```tsx
const { status } = useFastH3();
const [snapshot, setSnapshot] = useState<FastH3StateUpdateMessage | null>(null);
useFastH3StateUpdate((msg) => setSnapshot(msg));

useEffect(() => {
  if (status !== "ready") setSnapshot(null);
}, [status]);
```

The `useEffect` is **mandatory**: the SDK sends no final snapshot on
disconnect, so without it the UI shows the previous session's state after a
reconnect. Don't centralize this into a context — three lines per component
keeps each one self-contained for readers.

Never aggregate `clip_started` / `clip_generated` / `clip_finished` into
your own queue state; `queue_update` and `state_update` are the truth. The
lifecycle hooks are for one-shot reactions (labels, toasts, sounds).

## Sending commands

- Await every typed call; a resolved `undefined` on a command with a
  declared reply means **refused** — `command_error` carries the reason.
- Gate capacity _before_ multi-scene enqueues: read a fresh snapshot
  (`getState()`) and compare `generation_capacity - generation_queued`
  against the episode length. A half-queued episode is worse than a clear
  refusal (`EpisodeComposer.queueEpisode` is the reference).
- Chain by threading the previous reply's `clip.clip_id` into the next
  `enqueue`'s `continue_from_clip_id`. Scene order in the queue equals
  enqueue order, so the chain's source always builds first.
- Connection is lazy on purpose, and queueing is the **only** connect path:
  compose offline, `connect()` inside the queue action, no Connect button
  anywhere. Keep that property — it's the example's UX thesis (a session
  should only run while it has work). If your extension needs an earlier
  connection (say, reading live clip-length bounds while composing), weigh
  it against holding a GPU session open through the whole composing flow.

## What's intentionally not exposed

Each of these is one small component in the composer's or now-playing's
phase; the typed method is ready.

| Knob                             | Typed method                                 | Where it belongs    | Note                                                                  |
| -------------------------------- | -------------------------------------------- | ------------------- | --------------------------------------------------------------------- |
| Per-scene length                 | `enqueue({ seconds })` / `setClipSeconds`    | composer, per scene | Bounds live in `state_update.clip_seconds_min/max` — never hardcode   |
| Seeds                            | `enqueue({ seed })` / `setSeed`              | composer            | Reproduction is close, not bit-exact                                  |
| Canvas / aspect                  | `setCanvas`                                  | setup only          | Refused while clips are queued or playing                             |
| Starting images (image-to-video) | `enqueue({ starting_frame })` + `uploadFile` | a new composer path | At most one of `starting_frame` and `continue_from_clip_id` per scene |
| Flush behaviour                  | `setFlushOnClipEnd`                          | now-playing         | Off = boundaries hold the last frame instead of black                 |
| Queue reordering                 | `move`                                       | queue panel         | 0 = front; clips never cross queues except by building                |
| Explicit playback                | `play({ clip_id })`                          | queue panel         | This app leans on autoplay instead                                    |
| Full reset                       | `reset`                                      | status badge        | Drops both queues and the retained history                            |

## Common mistakes when extending

1. **Softening the hard-cut rules** in the writer prompt or the composer's
   guidance "so stories flow" — the flow you gain is degradation you ship.
2. **Sending the next scene before the previous reply resolves** — you need
   its `clip_id` to chain; parallel enqueues break the chain order.
3. **Skipping the capacity gate** on multi-scene enqueues and leaving the
   user with half an episode queued.
4. **Missing the clear-on-disconnect `useEffect`** in a new
   snapshot-holding component — stale "now playing" from a dead session.
5. **Hardcoding capacities or clip bounds** — deployments resize them; read
   `state_update`.
6. **Keeping episode bookkeeping in client state** instead of the metadata
   echo — a reconnect loses it; the echo survives.
7. **Importing `@reactor-team/ui` React components into Server
   Components** — they use hooks and die at runtime; use the CSS design
   tokens (`bg-brand`, `font-mono`) instead.
8. **Minting unscoped or cacheable tokens** — see the auth section's four
   rules.

## Checklist for a change

- [ ] `pnpm build` and `pnpm tsc --noEmit` clean.
- [ ] New snapshot-holding components clear on disconnect.
- [ ] Multi-scene enqueues stay sequential, chained, and capacity-gated.
- [ ] The hard-cut and self-containment rules survive any prompt edit, in
      all three places they live.
- [ ] Refusals stay visible (`CommandError` mounted, inline errors kept).
- [ ] New config landed in `.env.example`; no `.env.local` committed.
