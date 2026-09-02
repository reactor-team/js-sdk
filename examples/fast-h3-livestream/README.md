# FastH3 Livestream — a self-served AI TV channel

> Looking for the canonical single-app starter on this model — one browser
> session, compose-and-play, no LiveKit? That's
> [`../fast-h3`](../fast-h3) (`create-reactor-app --model=fast-h3`). This
> example is the **broadcast channel** shape: one streamer, many viewers.

A private, always-on AI show you run yourself. A Python **streamer** drives
the [fast-h3](https://docs.reactor.inc) video model over `reactor-sdk` and
broadcasts into a LiveKit room; a Next.js **viewer** plays the room and
carries its chat. Anything a viewer types in chat is an **idea**: the
streamer expands it into an **episode** of N **scenes** with your own
OpenAI-compatible key, chains the scenes on the model so the episode plays
as one uninterrupted video, and answers in chat — queued, at capacity, now
playing. While chat is quiet, a rotation of default scenes keeps the show
on air.

```
                     ideas (room chat, data channel)
        ┌──────────────────────────────────────────────────┐
        ▼                                                  │
┌───────────────┐   enqueue: episodes, scene-chained   ┌───┴────────┐
│   streamer/   │ ◀──────────────────────────────────▶ │  viewer/   │
│  (Python)     │        fast-h3 on Reactor            │ (Next.js)  │
│ upsampler ·   │                                      │ player ·   │
│ director ·    │   24 fps video + 48 kHz audio        │ chat       │
│ pacer         │ ────────▶ LiveKit room ────────────▶ │            │
└───────────────┘         (the broadcast)              └────────────┘
```

## Quick start

You need a [Reactor API key](https://www.reactor.inc/account/api-keys), a
[LiveKit](https://livekit.io) project (Cloud's free tier works), and —
optionally — an OpenAI-compatible API key for episode writing.

**1. The streamer** (broadcasts, drives the model, reads chat):

```bash
cd streamer
python -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env       # add REACTOR_API_KEY + LIVEKIT_* (+ OPENAI_API_KEY)
.venv/bin/python main.py
```

**2. The viewer** (plays the room, sends chat):

```bash
cd viewer
cp .env.example .env.local # the same LIVEKIT_* values and room name
pnpm install
pnpm dev                   # http://localhost:3000
```

Open the page, set a name, and type an idea — e.g. _a lighthouse keeper
discovers the light attracts whales_. The show answers in chat when the
episode is queued and again when it starts playing.

## What you can do with it

- **Watch an unattended broadcast.** The streamer connects to the model in
  a loop, and default scenes (`streamer/default.json`) keep the show on air
  before the first idea arrives and between ideas.
- **Pitch episodes from chat.** Every chat message becomes an episode of
  `SCENES_PER_EPISODE` scenes, written by your own LLM key against the
  show's style, inserted ahead of the default rotation.
- **Watch scenes flow into each other.** Each scene's clip opens on the
  previous scene's last frame (`continue_from_clip_id`), so an episode airs
  as one uninterrupted video — every scene opening on a written hard cut,
  which is what keeps a chain sharp (see the skill).
- **See errors where viewers live.** Capacity limits, refused scenes, and
  failed renders are answered in the room chat by the author `show` —
  never a silent failure.
- **Run it without an LLM key.** With no `OPENAI_API_KEY`, an idea becomes
  a single scene of its raw text and everything else works the same.

## Architecture at a glance

The streamer is one asyncio process: a supervised Reactor connection
([`reactor_link.py`](streamer/reactor_link.py)) feeds a constant-rate
[`pacer.py`](streamer/pacer.py) that outlives every reconnect, into the
room's only media publisher ([`publisher.py`](streamer/publisher.py)). The
[`director.py`](streamer/director.py) is the model queue's only writer:
ideas from chat are expanded by [`upsampler.py`](streamer/upsampler.py) and
enqueued chained; the default rotation stands down whenever an idea is
waiting. The viewer is a subscribe-only LiveKit client whose token comes
from its own server route — the LiveKit secret never reaches a browser.

## Code tour

| File                                                                             | Owns                                                                                                         |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| [`streamer/main.py`](streamer/main.py)                                           | Wiring and task lifecycle; nothing else.                                                                     |
| [`streamer/config.py`](streamer/config.py)                                       | The only reader of `.env` / environment.                                                                     |
| [`streamer/reactor_link.py`](streamer/reactor_link.py)                           | Everything `reactor-sdk`: connect/reconnect loop, queue mirrors, command sending, media → pacer.             |
| [`streamer/director.py`](streamer/director.py)                                   | Scheduling: ideas → episodes → chained enqueue; the default rotation; capacity handling; chat announcements. |
| [`streamer/upsampler.py`](streamer/upsampler.py)                                 | The LLM call and the system prompt — including the hard-cut rules that keep chained scenes sharp.            |
| [`streamer/pacer.py`](streamer/pacer.py)                                         | The 24 fps metronome between clip-shaped model output and the room's need for a frame every period, forever. |
| [`streamer/publisher.py`](streamer/publisher.py)                                 | The LiveKit room: media publishing, reconnects, and chat on the data channel.                                |
| [`streamer/default.json`](streamer/default.json)                                 | The default scene rotation.                                                                                  |
| [`viewer/app/ShowApp.tsx`](viewer/app/ShowApp.tsx)                               | The room client: join loop, tracks, chat state.                                                              |
| [`viewer/app/api/livekit/token/route.ts`](viewer/app/api/livekit/token/route.ts) | Mints subscribe-plus-chat viewer tokens server-side.                                                         |
| [`viewer/app/components/`](viewer/app/components)                                | Player (tracks → media elements), Chat, Header.                                                              |

## Configuration

Every knob is an environment variable, documented in
[`streamer/.env.example`](streamer/.env.example) and
[`viewer/.env.example`](viewer/.env.example). The load-bearing ones:
`SCENES_PER_EPISODE` (the episode shape — fixed by you, never decided by
the LLM), `SCENE_SECONDS` (every scene's length, clamped to the model's
live bounds), and `LIVEKIT_ROOM` (both halves must name the same room).
`.env` files hold real keys and are gitignored — never commit them.

## Going further

[`skill/SKILL.md`](skill/SKILL.md) is the deep dive for extending this
example — the fast-h3 queue contract as this streamer uses it, the
scene-chaining rules (and why every chained scene must open on a described
hard cut), capacity behaviour, and a table of what is deliberately not
built (moderation, an RTMP mirror, playout-front curation, image-opened
scenes).

Stack: Python 3.11+ · `reactor-sdk` · `livekit` / `livekit-api` · any
OpenAI-compatible endpoint · Next.js 15 · React 19 · Tailwind CSS v4 ·
`livekit-client` / `livekit-server-sdk` · `@reactor-team/ui` (design
tokens).
