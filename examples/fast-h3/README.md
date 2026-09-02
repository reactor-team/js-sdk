# FastH3 Episodes — multi-scene video on the fast-h3 clip queue

A clean Next.js + TypeScript starting point built on
[`@reactor-models/fast-h3`](https://www.npmjs.com/package/@reactor-models/fast-h3).
You compose an **episode** — one idea, a scene count you pick — and the app
queues it on the model as **chained scenes** (`continue_from_clip_id`), so
the whole episode plays as one continuous video with no cuts to black
between scenes. Scenes are written by an optional server-side AI writer
(your own OpenAI-compatible key) or by hand, with the app guiding you
through the prompting rules that keep chained video sharp.

```
┌──────────────────────────────┬──────────────────────────────────────┐
│  Status · Connect            │                                      │
│  Now playing · autoplay      │                                      │
│  ┌────────────────────────┐  │            main_video                │
│  │ Compose an episode     │  │        (+ synced main_audio)         │
│  │  idea → scenes (1-6)   │  │                                      │
│  │  AI writer / by hand   │  │                                      │
│  └────────────────────────┘  │                                      │
│  Queue (building · ready)    │                                      │
│  Snap a clip                 │                                      │
└──────────────────────────────┴──────────────────────────────────────┘
```

## Quick start

```bash
cp .env.example .env.local   # add REACTOR_API_KEY=rk_... (+ OPENAI_API_KEY, optional)
pnpm install
pnpm dev                     # http://localhost:3000
```

Get an API key at
[reactor.inc/account/api-keys](https://www.reactor.inc/account/api-keys).

## What you can do with it

- **Compose episodes.** Pick a scene count (1-6), type an idea (or use a
  preset), and either let the AI writer draft the scenes or write each one
  yourself. Every scene is editable before anything is queued.
- **Play them as one continuous video.** Scenes are enqueued chained — each
  clip opens on the previous clip's last frame — and autoplay hands each
  scene over seamlessly.
- **Compose offline, connect on demand.** Nothing touches the model until
  you click "Queue episode"; the session starts right then.
- **See the queues live.** The queue panel mirrors the model's generation
  (building) and playout (ready) queues, with per-clip remove; capacity
  limits are checked before queueing and refusals are surfaced, never
  silent.
- **Snap a clip.** Capture the last 10 seconds of the live stream as an
  MP4 download.

## Looking for the livestream version?

This example is the **canonical single-app starting point**: one browser
session, private to you. Its sibling,
[`../fast-h3-livestream`](../fast-h3-livestream), is a different product
shape — a **24/7 broadcast channel**: a Python streamer drives the same
model into a LiveKit room, viewers watch a shared stream on a web app, and
their chat pitches the episodes. `create-reactor-app` scaffolds one folder
per project (`--model=fast-h3` gives you this one), so if you want the
channel instead, scaffold or clone `fast-h3-livestream` from this repo.

## Code tour

| File                                                                       | Owns                                                                                                           |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| [`app/FastH3App.tsx`](app/FastH3App.tsx)                                   | The provider + the memoized in-memory token resolver.                                                          |
| [`app/api/reactor/token/route.ts`](app/api/reactor/token/route.ts)         | Mints a session-scoped, no-store JWT from your server-held API key.                                            |
| [`app/api/upsample/route.ts`](app/api/upsample/route.ts)                   | The optional AI writer: idea in, exactly N chained-ready scene prompts out. Holds the hard-cut system prompt.  |
| [`app/components/EpisodeComposer.tsx`](app/components/EpisodeComposer.tsx) | The signature flow: compose → (AI or by hand) → edit → connect on demand → chained enqueue.                    |
| [`app/components/QueuePanel.tsx`](app/components/QueuePanel.tsx)           | Both model queues live from `queue_update`, with pop.                                                          |
| [`app/components/NowPlaying.tsx`](app/components/NowPlaying.tsx)           | On-air state from the metadata echo, autoplay toggle, skip.                                                    |
| [`app/components/StatusBadge.tsx`](app/components/StatusBadge.tsx)         | The four-state connection lifecycle, read-only by design: queueing an episode is the only thing that connects. |
| [`app/components/CommandError.tsx`](app/components/CommandError.tsx)       | Every refused command, visibly.                                                                                |
| [`app/components/SnapClip.tsx`](app/components/SnapClip.tsx)               | Last-N-seconds capture via the recording surface.                                                              |
| [`app/lib/prompts.ts`](app/lib/prompts.ts)                                 | Curated episode ideas + a hand-written example episode that models the hard-cut rules.                         |
| [`app/lib/tag.ts`](app/lib/tag.ts)                                         | The metadata tag written on every scene and read back off the echo.                                            |

## Going further

[`skill/SKILL.md`](skill/SKILL.md) is the deep dive for extending the app:
the model's queue contract, the chaining rules and why hard cuts are
load-bearing, the auth pattern, and a table of every model knob this app
deliberately doesn't ship (seeds, clip lengths, canvas, starting images,
flush behaviour) with the typed method to add each one.

Stack: **Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS v4
· `@reactor-models/fast-h3` · `@reactor-team/ui` (design tokens)**.
