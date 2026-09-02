---
name: fast-h3-livestream
description: Extend the FastH3 livestream example — a Python streamer driving the fast-h3 clip-queue model into a LiveKit room, with a Next.js viewer for playback and chat. Covers the queue contract as the streamer uses it, scene chaining and the hard-cut prompting rule that keeps chained scenes from degrading, capacity and error handling, the pacing/publishing media path, and what is deliberately not built. For the canonical single-app browser starter on this model, see ../../fast-h3 instead.
---

# Extending the FastH3 livestream

You've cloned this folder and want to change what the show does. This guide
carries the contracts and the reasons behind them, so your change lands
without breaking the broadcast — and so the prompting rules that keep the
picture sharp survive your edits.

## Which fast-h3 example am I in?

Two examples build on this model, with different product shapes:

|                      | [`fast-h3`](../../fast-h3)                            | **`fast-h3-livestream` (this one)**                                               |
| -------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------- |
| Shape                | One browser session, private to the person running it | A 24/7 broadcast channel many viewers watch together                              |
| Stack                | Next.js only, `@reactor-models/fast-h3` typed SDK     | Python streamer (`reactor-sdk`) publishing into a LiveKit room + a Next.js viewer |
| Who drives the model | The browser, directly                                 | The Python streamer; viewers only chat                                            |
| Episode source       | A composer UI (AI writer or by hand)                  | Viewer chat ideas + a default scene rotation                                      |

`create-reactor-app` scaffolds **one folder per project** — if you want the
canonical single-app starter instead of a channel, scaffold with
`--model=fast-h3` or clone that folder from this repo. Both skills document
the same model contract; that one owns the browser patterns (typed hooks,
token route, snapshot pattern), this one owns the streamer, the room, and
the broadcast-resilience rules.

## Starting the show ("start this up")

When someone asks you to start this example, start the two components
yourself, in this order. Configuration comes first, and its values come
from the operator.

**1. Configuration.** Both halves read local env files that are gitignored
and never committed: `streamer/.env` (template: `streamer/.env.example`)
and `viewer/.env.local` (template: `viewer/.env.example`). If they don't
exist yet, post this list in the chat and ask the operator for the values —
**never invent, reuse, or scrape keys from elsewhere**:

| Variable                                                | Where    | Required                          | What it is                                                               |
| ------------------------------------------------------- | -------- | --------------------------------- | ------------------------------------------------------------------------ |
| `REACTOR_API_KEY`                                       | streamer | yes                               | `rk_...` from reactor.inc/account/api-keys                               |
| `LIVEKIT_URL`                                           | both     | yes                               | `wss://<project>.livekit.cloud`                                          |
| `LIVEKIT_API_KEY`                                       | both     | yes                               | LiveKit project API key                                                  |
| `LIVEKIT_API_SECRET`                                    | both     | yes                               | LiveKit project API secret                                               |
| `LIVEKIT_ROOM`                                          | both     | no (default `fast-h3-livestream`) | Must be the same on both halves                                          |
| `OPENAI_API_KEY`                                        | streamer | no                                | Enables episode writing; without it, ideas air as single raw-text scenes |
| `OPENAI_BASE_URL` / `OPENAI_MODEL`                      | streamer | no                                | Point the upsampler at any OpenAI-compatible endpoint                    |
| `SCENES_PER_EPISODE` / `SCENE_SECONDS` / `QUEUE_TARGET` | streamer | no                                | The episode shape and idle queue depth                                   |

Then write the files: copy each `.env.example` over and fill the values in
(the viewer's `LIVEKIT_*` values are the streamer's — both halves must
point at the same LiveKit project and room).

**2. The streamer** (start it first; it creates the room):

```sh
cd streamer
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt   # first time
.venv/bin/python main.py        # long-running; background it and keep the log
```

**3. The viewer:**

```sh
cd viewer
pnpm install                    # first time
pnpm dev                        # long-running; -p <port> to pick the port
```

**4. Verify.** Startup is healthy when the streamer logs
`connected, session=…` then `streaming …x…@24fps to room …` and, shortly
after, `[now playing] …` lines from the default rotation; the viewer page
flips its badge to `live` and shows video. A `reconnecting in 5s` loop is
normal while the model is cold or at capacity — the show starts on its own
once a session lands. To stop, interrupt both processes; the streamer
shuts down cleanly on SIGINT.

## The vocabulary (use it consistently)

| Term         | Meaning                                                                                                 |
| ------------ | ------------------------------------------------------------------------------------------------------- |
| **show**     | The whole broadcast: one streamer, one LiveKit room, any number of viewers.                             |
| **streamer** | The Python process (`streamer/`). Drives the model, publishes media, reads and answers chat.            |
| **viewer**   | The web app (`viewer/`), and the people using it. Subscribe-only for media; chat over the data channel. |
| **idea**     | One chat message from a viewer.                                                                         |
| **episode**  | One idea expanded into scenes, played in order as one continuous video.                                 |
| **scene**    | One clip on the model: one prompt, one fixed length.                                                    |

## The model, from where this streamer sits

fast-h3 is a **queue of clip generations with a player**. The streamer
enqueues scene prompts; the model builds them in the background (the
**generation queue**), parks built clips in the **playout queue**, and —
with autoplay on, this streamer's mode — plays the playout front the
instant the stream idles. Between unrelated scenes the stream cuts to
black; a scene that _continues_ another hands over seamlessly.

What the streamer relies on:

- **`enqueue`** takes `prompt` (≤ 800 chars), `metadata` (opaque, echoed
  back untouched on every message that references the clip), `seconds`
  (clamped to the live bounds from `state_update`), `position` (0 = next
  build), and `continue_from_clip_id` — the clip the new scene's first
  frame continues from.
- **`state_update`** carries the live capacities (`generation_capacity`,
  `playout_capacity`), the clip length bounds, and the canvas size. Read
  them from there; never hardcode a capacity or a bound.
- **`queue_update`** mirrors both queues in full. The streamer derives
  everything from this mirror and its metadata echoes — it keeps no local
  scheduling state a restart could lose.
- **`command_error`** is broadcast when a command is refused; the refused
  command answers with an empty reply. The streamer treats "reply without
  `clip`" as a refusal.

The metadata echo is the correlation channel: the director writes
`{episode_id, title, scene, scenes, author, default}` at enqueue time and
reconstructs "now playing scene 2/3 of _X_ by _Y_" from a `clip_started`
alone. Anything you add downstream (an overlay, a rundown panel) should
read the echo the same way, never client-side state.

## Scene chaining, and the rule that keeps it watchable

An episode's scenes are enqueued with `continue_from_clip_id` naming the
previous scene's clip: each clip opens on the exact final frame of the one
before it, and autoplay chains them with no cut to black — the episode airs
as one uninterrupted video.

**The one rule that keeps chains sharp: every chained scene's prompt must
open on a described hard cut.** A continued clip generates forward from a
generated frame. Write the chain as one continuous take — "the camera
keeps following…", "still on her face…" — and small generation errors
compound scene over scene until the picture visibly smears, repeats
itself, and degrades beyond use. A hard cut to a fully described **new
shot** — a clearly different camera angle, distance, or location — makes
the model re-establish the whole image, so a chain stays sharp
indefinitely while the story continues across the cut.

The upsampler's system prompt (`streamer/upsampler.py`) enforces this:

- Every scene after the first opens with the cut itself: _"Hard cut to a
  wide shot of …"_, _"Cut to: inside the lighthouse, a close-up of …"_.
- Extending the previous shot is forbidden — no "the camera continues",
  "the shot lingers", "we keep following".
- Every scene stays fully self-contained: the model reads only that
  scene's text, so setting, subjects, lighting, palette, and style are
  re-described verbatim in every scene. The inherited frame carries the
  picture over; the text is what keeps it from mutating.
- Scenes must be **dynamic and different** — vary the shot, the action,
  the framing. A chain of near-identical scenes degrades and repeats even
  with cuts written in.

If you rewrite the system prompt, keep these rules intact — an unguided
LLM writes continuous takes by default, and the degradation shows up on
air, not in your logs. The same applies to prompts you write by hand
(`default.json`, or ideas staged without an LLM key): the default rotation
is unchained on purpose, so those scenes are simply self-contained; the
moment you chain hand-written scenes, open each one on a cut.

Two structural choices reinforce the rule:

- **The episode shape is the operator's.** `SCENES_PER_EPISODE` fixes the
  scene count and `SCENE_SECONDS` the length; the LLM only writes the
  prompts. Letting the LLM pick counts made shapes drift; a fixed shape
  keeps queue math predictable.
- **A broken chain degrades, never stalls.** A chained enqueue refused
  twice (a reconnect loses the source clip server-side) drops the
  continuation and retries the scene standalone — the prompts are
  self-contained cuts, so only the seamless handover is lost.

## Capacity and errors: surface everything in chat

The deployment has real limits, and the streamer's policy is _tell the
viewer, never stall_:

| Condition                               | How it shows                                                                    | What the streamer does                                                                                           |
| --------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Model unreachable / at session capacity | Viewer sees "offline / waiting for the streamer"; the room holds the last frame | `reactor_link.run` retries forever on a fixed delay; the pacer and publisher never restart                       |
| Generation queue full for a new episode | Chat: "the show's queue is at capacity — '…' was dropped"                       | Pops waiting default scenes first (`default: true` only); drops the idea only when episode scenes fill the queue |
| One scene's enqueue refused             | Chat: "the queue refused scene N of '…'"                                        | Bounded retries (3), chain dropped after 2, then the rest of the episode is dropped                              |
| A scene's render fails                  | Chat: "scene N of '…' failed to render"                                         | The model's queue moves on by itself; chained scenes waiting on the failed one fail with it                      |
| Idea backlog full                       | Chat: "the idea backlog is full right now"                                      | The pending queue is bounded (8); refusal is instant and visible                                                 |

Keep this property when extending: every failure a viewer caused answers
_that viewer_ in chat. Silent failures are the #1 confusion source in a
chat-driven show.

## The media path (don't break these)

- **The pacer is not optional.** The model emits 24 fps _while a scene
  plays_ and nothing between scenes or during reconnects; a live room
  needs a frame and audio every period forever. The pacer fills gaps with
  repeated frames and silence, and buffers video and audio symmetrically —
  that symmetry is A/V sync.
- **The pacer and publisher outlive Reactor reconnects.** They are created
  once, after the first `state_update` (the canvas size comes from there),
  and never torn down mid-run. That is what keeps the room-side broadcast
  unbroken while sessions churn.
- **The model's queues die with a session.** After a reconnect, queued
  scenes are gone; the default rotation refills on the next poll, and
  ideas still in the pending queue survive client-side.
- **Never block the event loop in the media path.** `send_video` is a
  non-blocking FFI call; audio goes through a queue to a pump task because
  the LiveKit `AudioSource` awaits buffer room.
- Frame handlers register **by wire name before connect** (`main_video`,
  `main_audio`); querying the track list right after connect races the
  session's track declaration.

## Chat protocol

JSON on the LiveKit data channel, topic `show.chat`:
`{"author": "<name>", "text": "<message>"}`. The streamer answers as the
author `show` and ignores its own packets. Senders don't receive their own
data packets, so the viewer echoes locally on send. Both sides truncate
author (32) and text (500) on receive — treat inbound packets as untrusted
input. If you add message kinds (reactions, a rundown), add a new topic
rather than overloading `show.chat`.

## What's deliberately not built (and where it would go)

| Extension                              | Where                                              | Notes                                                                                                                                                  |
| -------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Moderation of viewer ideas             | `director.submit_idea`, before the pending queue   | This example is a private show for people you invited. Anything public needs a moderation gate in front of the upsampler; fail closed.                 |
| Playout-front curation                 | a small loop over `queue_update` + `move`          | Today playout order = build order. To play viewer episodes before already-built defaults, `move` the desired clip to position 0 while something plays. |
| Scenes opened from an image            | `enqueue`'s `starting_frame` upload                | The wire supports image-to-video; this show is text-driven on purpose. At most one of `starting_frame` and `continue_from_clip_id` per scene.          |
| An RTMP mirror                         | a second consumer beside `publisher.py`            | The pacer's output is sink-agnostic; feed a second destination the same ticks. Never let one sink block another.                                       |
| A rundown / "up next" panel            | a new data-channel topic fed from the queue mirror | Build it from metadata echoes only, so it survives streamer restarts.                                                                                  |
| Per-viewer cooldowns                   | `director.submit_idea`                             | The bounded pending queue is the only throttle today.                                                                                                  |
| Multi-scene chat control (`!scenes 5`) | parse in `director.submit_idea`                    | Clamp to what the generation queue can hold; the episode shape staying operator-fixed is a feature.                                                    |

## Common mistakes when extending

1. **Softening the hard-cut rules** in the upsampler's system prompt "to
   make stories flow". The flow you gain is the degradation you ship: a
   chained continuous take smears within a few scenes.
2. **Letting the LLM choose the scene count or lengths.** The shape is
   env-fixed so queue math and capacity handling stay predictable — parse
   operator intent from env, not model output.
3. **Hardcoding capacities or clip bounds.** Both queues' capacities and
   the length bounds arrive live in `state_update`; deployments resize
   them without notice.
4. **Keeping scheduling state outside the queue mirror.** A restart or
   reconnect must reconcile from `queue_update` + metadata echoes alone.
5. **Sending `continue_from_clip_id` without checking support.** Gate on
   `link.supports_continuation`; against a deployment without it, chained
   enqueues are refused.
6. **Blocking the pacer's tick** (a synchronous encode, a network call in
   `send_video`). The broadcast stutters for every viewer at once.
7. **Trusting chat input.** Truncate and sanitize both ends; prompts are
   hard-capped at 800 chars server-side either way.
8. **Two writers on the model's queue.** The director's lock is the only
   serialization; a second enqueue path interleaves episodes.

## Checklist for a change

- [ ] `python -m py_compile streamer/*.py` clean; `pnpm build` clean in `viewer/`.
- [ ] The upsampler's hard-cut and self-containment rules are intact.
- [ ] Scene count and length still come from env, clamped to `state_update` bounds.
- [ ] Every new failure path answers the affected viewer in chat.
- [ ] The pacer and publisher are still created once and never torn down mid-run.
- [ ] New config landed in the right `.env.example`, and no `.env` is committed.
