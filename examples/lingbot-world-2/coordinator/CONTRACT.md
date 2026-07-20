# Coordinator Contracts

The lingbot-world-2 "two-brain" system (Player renders video, Director steers it)
is glued together by five contracts. Everything else is an implementation of one
of these. Change a contract → all implementers must change together.

---

## Architecture at a glance

```
┌──────────────────────────── BROWSER (localhost:3000) ────────────────────────────┐
│                                                                                   │
│   Player controls        DirectorPanel          FrameTap        <video>           │
│   (WASD, events)         (manual fires)          (grab ~2s)      (cloud stream)    │
│        │                      │                     │                ▲             │
│        │ ops                  │ ops                 │ JPEG           │ WebRTC       │
└────────┼──────────────────────┼─────────────────────┼────────────────┼─────────────┘
         │  scene_events         │                     ▼                │
         │  (+ requires,         │            POST /api/frame-tap       │
         │   available)          │                     │                │
         ▼                       ▼                     ▼                │
┌─────────────────────────────────────────┐   ┌──────────────┐   ┌─────┴────────────┐
│   COORDINATOR  (ws://8090)               │   │ frame.png    │   │ Reactor cloud    │
│                                          │   │ (the tap)    │   │  OR local engine │
│   ★ THE ONE HISTORY ★                    │   └──────┬───────┘   └──────────────────┘
│   • facts (scene:<slug> = what fired)    │          │  frame sources, priority:
│   • vitals · count · objective · mode    │          │   1 live local tap (engine.py)
│   • directorMode (default: human)        │          │   2 live browser tap (FrameTap)
│                                          │          │   3 self-feed (scene still, fallback)
│   broadcasts:  facts · state · activity  │          │
└───────▲───────────────────────┬─────────┘          │ watch mtime
        │ ops (assert/vital/…)   │ type:"state"       ▼
        │                        │ (facts[])   ┌────────────────────────────────────┐
        │              shared_fired ◄───────────┤   AI DIRECTOR (python, NVIDIA NIM) │
        │  assert (role ai)      │             │  every new frame:                  │
        └────────────────────────┼─────────────┤   ┌ probe (EYES, vision) ─┐        │
                                 │             │   │  gate-valid Qs only    │        │
                                 │             │   └────────────────────────┘        │
                                 │             │   ┌ decide (BRAIN, TEXT) ──┐        │
                                 │             │   │  reasons from STATE     │        │
                                 │             │   │  /History — NO frame    │        │
                                 │             │   └─────────────────────────┘       │
                                 │             │  fire (gate-open + cooldown)        │
                                 └─────────────┤  activity: "new frame — …" + timing │
                                               └────────────────────────────────────┘
```

> Default mode is **rules-decide**: the `decide` box above is opt-in (`--vlm-decide`). Normally
> the coordinator's `json-rules-engine` is the brain and the director runs only the `probe`.

**Three flows that define the system:**

1. **Gating — one History, everyone's fires count.** An event fires (player / human panel /
   AI) → `assert scene:<slug>` into THE History. The director rebuilds `shared_fired` from the
   `type:"state"` broadcast, and `_gate_ok` reads *that* — so a predecessor fired by anyone
   unlocks a gate (`requires: {fired:[Gunman]}` → Police Car unlocks once Gunman ∈ shared_fired).

2. **Frames — real when available, still as fallback.** A live tap (local `engine.py` or the
   browser `FrameTap`) wins; when neither has written for a few seconds the director self-feeds
   the scene's own still so it is never blind. Cloud video only exists in the browser, so
   `FrameTap` is the cloud path's only real-frame source.

3. **Perception vs decision — the observer and the state machine.** By default
   (**rules-decide**, the norm now that the VLM decide is off) the AI director is
   PERCEPTION-ONLY: the **probe** — the sole vision call, frame → observations, gate-valid
   questions only — posts `op:"observe"`, and the coordinator's **`json-rules-engine`** is the
   brain that decides which authored event fires (paced by `RULE_COOLDOWN`, and **frozen while
   the director's model is disconnected** so it never fires blind). An `"unknown"` probe answer
   updates NO state — the machine never acts on a guess. The VLM **decide** brain is opt-in
   (`--vlm-decide`): text-only, reasoning from state/History in its system prompt, never pixels.

**Invariants:** exactly one History (§6); the coordinator touches no video (ops in, clauses
out); gates read the shared History so human + AI + win-clock fires all unlock alike; the probe
is an OBSERVER — it never mutates History, only the state machine does; switching games wipes the
prior game's accumulated state (facts / chunks / vitals) so nothing leaks across.

---

## Game Cartridge mapping (Roblox "Worlds Research Station", Hojel 2026)

This system is a **Game Cartridge**: a programmable code harness wrapped around a video world
model, with a VLM observer grounding pixels back into abstract state.

| Roblox Game Cartridge          | this app                                                    |
| ------------------------------ | ----------------------------------------------------------- |
| Luau state machine (engine)    | coordinator + `json-rules-engine` over `history.ts`         |
| Video World Model (VWM)        | the Reactor/local video model the browser renders           |
| VLM observer / visual triggers | the AI director **probe** (`scene_probes.derive_probes`)    |
| Decomposed conditioning        | scene layers: `base` (World) · `player` (Character) · `movement` (Actions) · `camera` (Dynamics) |
| Prompt invariance              | landmark-anchored placement (`at the base of the tree`, `at a fixed position`) — never player-relative |
| Quest progression              | gated director events (`requires`) + objective `reward` (win) |

The **`agent-test`** scene (`lib/lingbot-cases/agent-test.json`) is the reference fixture for
these mechanics; `coordinator/aidirector/test_agent_cartridge.py` (via `run_test_agent_cartridge.bat`)
asserts them — decomposition, invariance, player/director split, gated progression, VLM triggers,
and video-only prose.

---

## 1. AI Director backend interface — `decide()`  _[AI-only]_

A pluggable VLM backend supplies exactly one function:

```
decide(frame: PIL.Image, system_prompt: str) -> str   # raw model reply
```

- Input: the latest frame + the invariant-bounded system prompt (built by
  `director_common.build_system`).
- Output: raw text, expected to contain a JSON object (Contract 2).
- Implementer: `aidirector/director_nim.py` (NVIDIA inference hub, OpenAI-compatible).
- The loop that consumes it: `director_common.run_director(decide, …)`.

## 2. AI Director reply schema (VLM output)  _[AI-only]_

```json
{ "events": ["<exact authored director-event name>", ...] }
```

- 0–2 names, each MUST match a scene director event by name (case-insensitive).
- No free-form prose, no invented events. Unparseable/foreign names are dropped.
- This is the AI Director's whole charter: same action set as the human.

## 3. Coordinator WebSocket protocol — `ws://localhost:${COORDINATOR_PORT:-8090}`  _[shared: player + human + AI]_

**client → server (ops)** — each may carry `role: "player" | "human" | "ai"`:

| op | payload | effect |
|----|---------|--------|
| `assert` | `fact` | add/refresh a History fact |
| `retract` | `key` | drop a fact |
| `clear` | — | drop all (scene switch / reset) |
| `tick` | — | age one chunk; advances win clock |
| `vital` | `change: VitalChange` | mutate health/inventory |
| `mode` | `mode: both\|human\|ai` | which director's ops are accepted |
| `scene_events` | `events: SceneEvent[]` | Player publishes the active scene's director events |
| `objective` | `objective` | set active objective (restarts win clock) |
| `count` | `delta` \| `set` | signed spawn/kill or absolute entity count (clamp ≥0) |
| `log` | `cmd`, `detail` | record-only (audit); no state change |
| `observe` | `obs: {predicate: bool}` | AI director posts the probe's latest reads → MERGED into the `observations` fact (an `"unknown"`/omitted key keeps its prior value); no History change |
| `hello` | `role:"ai"`, `model`, `modelOk`, `decides` | AI director registers; `decides:false` = rules-decide (rules stay active); `modelOk` seeds the model-connect state |
| `model` | `role:"ai"`, `ok: bool` | live model up/down ping — `false` freezes rule firing (director's eyes shut), `true` resumes |
| `game` | `role`, `slug` | set/switch/unload the active game; a switch wipes the prior game's accumulated state |

**server → client (broadcasts):**

| type | payload |
|------|---------|
| `facts` | `prompt` — `History.project()` string appended to the Player prompt |
| `vitals` | `health, maxHealth, inventory` |
| `mode` | `mode` |
| `scene_events` | `events` |
| `objective` | `objective` |
| `count` | `count` |
| `state` | full snapshot (mode, vitals, count, objective, facts, sceneEvents) |

**Types:**
```
Fact        = { key, clause, weight, life: { kind: "sustained" | … } }
VitalChange = { health?, setHealth?, addItem?, removeItem?, reset? }
SceneEvent  = { name, clause, health?, addItem? }
```

Mode gate: `assert|retract|vital|count` from `human`/`ai` are dropped unless
`directorMode` is `both` or that role. Player/system ops always apply.

## 4. Scene JSON → director action set (`director_common.load_scene`)  _[shared: human + AI]_

From a `lib/lingbot-cases/*.json` scene, the director reads:
- `scene.base.default` → world identity (never contradicted).
- `scene.events[*]` where `actor == "director"` → `{name, clause = detail(.static), health,
  addItem, count, requires, chance, win, baseVersion/cameraVersion/movementVersion}`.
- `objective.director || objective.summary` → the standing goal.

The AI and human directors fire from this SAME list. Player-actor events are the
human player's hold-keys and are NOT in the director set.

**Per-event fields that shape when/how an event fires:**

| field | meaning |
|---|---|
| `requires.minChunks` | earliest chunk it can fire (see chunk↔time below) |
| `requires.fired` | AND — every listed event must already be in shared History |
| `requires.firedAny` | OR — at least one listed event must have fired |
| `requires.notFired` | none of the listed events may have fired (mutex ring: N events each `notFired` the other N−1 → exactly one of the group ever fires) |
| `requires.minHealth` / `maxHealth` | health floor / ceiling gate |
| `requires.hasItem` | item must be in inventory |
| `chance` | per-tick fire probability once the gate is open (`0.2` = 20%/tick → randomized arrival, not the instant the gate opens) |
| `count` | fire-once when `1` (and signed spawn/kill Δ on the entity count) |
| `win` | terminal — firing sets `won=true` and sends `{type:"won"}` |
| `baseVersion`/…`= "empty"` | scene-replace ending; `"downed"`/`"overboard"` = consequence state |

**Chunk ↔ time.** One chunk ≈ **3 latents ≈ 12 frames ≈ ~0.75 s** of video (`CHUNK_LATENTS=3`,
backend `chunk_size=3`). So authoring gates in real time: **≈1.3 chunks/sec** →
`minChunks: 24` ≈ 18 s, `minChunks: 160` ≈ 2 min, `minChunks: 240` ≈ 3 min. Endings are
floored at `minChunks: 160` so no run resolves before ~2 min.

## 5. Frame handoff  _[AI-only]_

The director watches ONE file (default `coordinator/frame.png`, override `LINGBOT_FRAME_TAP`)
and triggers on its **mtime**: each new frame = one look = one `step`/chunk of pacing.
File-based on purpose — it decouples the Python director from the browser/DataChannel.
There is no longer an `active_game.txt`: the director keeps the active scene's still
path in memory (`state["game_image"]`, from the §3 `game` broadcast).

**Three sources fill that file, in priority — first one that's fresh wins:**

1. **Live local tap** — `local_server/engine.py` writes real generated frames atomically
   (tmp + rename) when the LOCAL backend renders. Frame-accurate; the ground truth.
2. **Live browser tap** — `app/api/frame-tap/route.ts` (`POST` JPEG → same atomic write).
   The client `FrameTap.tsx` grabs the on-screen `<video>` every ~2s and posts it. This is
   the CLOUD path's real-frame source: cloud video only exists in the browser (WebRTC →
   `<video>`, never on disk), so the browser is the only place a real frame can be captured.
3. **Self-feed (fallback)** — when nothing above has written for `>max(2×interval, 4s)`, the
   director copies its own `state["game_image"]` (the scene still) onto the tap and bumps the
   mtime, so it is never blind. Default ON (`--no-self-feed` to disable); a static image, so
   it can't show the consequences of the director's own events — a live tap always preempts it.

Because 1/2 refresh faster than the self-feed staleness window, self-feed only kicks in when
no live source is running (tab closed, generation stopped, no backend).

**Debug archive:** set `LINGBOT_FRAME_ARCHIVE=<dir>` and the browser tap keeps EVERY captured
frame (`frame_<epoch-ms>.jpg`, chronologically sortable) so you can replay exactly what the
director saw. Best-effort — a write failure there never breaks live directing.

---

## 6. State model

**One `History` IS the game state.** The facts that persist *are* the state — health,
inventory, `activeTool`, held/sticky/director events, observations, win/lose mode — all
`History` facts (plus a few typed vitals riding in the same store). There is **no separate
game-state store**: `PlayerController` is just the **rules** (input → assert/retract) + **typed
HUD views** over that one `History`, and `narrate()` **is** `History.project()`. §6.1 is
that store; §6.2 is the rules/view layer; §6.3 (probes) is the AI director's read into it.

### 6.1 Coordinator state — shared, synced (`coordinator.ts`, engine: `../lib/history.ts`)  _[shared]_
Single source of truth across Player + Directors; broadcast on every change. The
`history` field is powered by the **`History`** engine — domain-agnostic facts that
persist, age, and reconcile against observation, on the invariant *persistence is
repetition* (a fact stays true only by being re-projected every step until its `life`
ends). This is the **single** `History`; the client no longer keeps its own copy — it
sends ops up and consumes this one's `project()`ed facts.
```
history      : Fact[] keyed by `key`  -> project() string appended to the prompt
               Fact = { key, clause, weight, life: instant | steps(n) | sustained }
               intake filtered by Constraint[] (drop / substitute); reconcile() vs observation
vitals       : { health, maxHealth, inventory: string[] }
entityCount  : number                 -> spawn/kill tally, clamped >= 0
objective    : { summary, director?, durationChunks?, reward? } + win clock (chunks, won)
directorMode : "both" | "human" | "ai"
firedEvents  : string[]               -> fired scene-event display names, DERIVED live from the
                                         History snapshot (`scene:<slug>` facts); no separate cache
observations : { [predicate]: bool }  -> the probe's latest reads, posted via op:"observe"
random       : number                 -> fresh Math.random() per gameFacts() call; backs `chance`
```

**json-rules-engine compatible.** The state above is exposed AS-IS as engine facts by
`gameFacts()` — a flat object whose field names ARE the rule `fact` names (`firedEvents`,
`health`, `chunks`, `inventory`, `entityCount`, `objective`, `observations`, `random`). So a
`json-rules-engine` (v7, in `coordinator/package.json`) rule set can drive the director with
**no adapter and no second copy of truth** — it reads the one live state each `engine.run()`.
Authored `requires` gates map 1:1 to rule conditions (`deriveRules` in `coordinator/rules.ts`):

| `requires` / field | rule condition |
|---|---|
| `fired: [A,B]` | `firedEvents contains A` AND `contains B` |
| `firedAny: [A,B]` | `{ any: [firedEvents contains A, contains B] }` |
| `notFired: [A]` | `firedEvents doesNotContain A` (+ implicit `doesNotContain self` → no refire) |
| `minChunks: n` | `chunks greaterThanInclusive n` |
| `minHealth: n` / `maxHealth: n` | `health greaterThanInclusive n` / `lessThanInclusive n` |
| `hasItem: x` | `inventory contains x` |
| `chance: p` | `random lessThanInclusive p` (re-rolled each tick → randomized arrival) |
| ungated | `chunks greaterThanInclusive RULE_WARMUP` (default 4) |

`win: true` events are terminal — `markWinIfTerminal()` sets `won=true` and emits `{type:"won"}`.
When several events are eligible on one tick, `runRules()` picks the highest `priority` tier then
**random within that tier**. The fields that exist purely to keep this shape first-class are
`firedEvents` (derived live from History, not a separate store), `observations` (the AI director
posts it with op:"observe"), and `random` (fresh per call, backs `chance`).

### 6.2 PlayerController — the client controller (`../lib/player-controller.ts`)  _[client-side; no store]_
**Not a state store.** It **holds no authoritative persistent state** — only the
client's **input + rules**, plus a *read-through* of the coordinator's projected facts.
Everything that persists (inventory, `activeTool`, `mode`, sticky/director effects,
vitals) is a coordinator `History` fact (§6.1): read here, owned there. Single player.
```
input (ephemeral) : isMoving, posture: stand|crouch|jump, held keys   -- raw keyboard, the source of ops
rules             : slot -> EventRule( momentary | sticky | transition | gated )   -- input -> op mapping
read-through      : the coordinator's project()ed facts + vitals + observations (§6.3),
                    cached for zero-latency prompt composition / gating; recomputed from
                    the last broadcast, NOT a second copy of truth
```
Persistent state is deliberately absent here — the client sends ops up (Contract 3) and
renders what comes back (`facts`/`vitals`). One `History`, in the coordinator (§6.1).

### 6.3 Observed state — the AI director's eyes (a `PlayerController` field, flat, v1)  _[AI-only]_
**Probes exist only to give the AI director perception it otherwise lacks.** A human
director *sees* the frame and verifies visually — so probes are **only needed when the
AI director is active** (`directorMode: "ai"` or `"both"`); in `"human"` mode they are
off (dead weight). They ground/verify the AI's picks (precondition gates, post-fire
confirm, invariant re-anchors), not a separate driving path.

Not a separate store — a field of `PlayerController` (`observations: Record<string,boolean>`)
that `observe()` writes and `gated` rules read. `scene_probes.resolve()` returns a flat
map of the scene's derived predicates — one yes/no per derived probe (§4.1):
```ts
observations: Record<string, boolean>;   // predicate -> yes/no from the latest frame
```
Keys come from each probe's `observe`: director-event presence (`shark_appears`),
player-action detection (`doing_fire_pistol` — is the character doing this now?),
invariant checks (`submerged`, `duplicate_subject`), version state (`state:overboard`).
Rules gate on it directly:
```ts
{ kind: "gated", when: s => s.observations["state:overboard"] }
```
Two things a probe answer can do: (a) emit a **coordinator op** (§3 — assert/vital, the
shared/persistent effect), and/or (b) write this **observation** (the client-side,
gate-able bool). Richer typed state (enums, counts, confidence, an entity list, an
`environment` object) is a possible later extension — v1 is flat booleans.

**Derivation — the checklist comes from the scene, not by hand** (`aidirector/scene_probes.py`).
State is read by asking the VLM a list of **yes/no questions in ONE call**, then mapping
each answer to an op — no open-ended event picking, no prose parsing (that reliability is
the point). `derive_probes(scene)` turns the game JSON into the checklist:

| Scene element | Derived question | On answer |
|---|---|---|
| **director event** (Shark Appears…) | "Is this visible now: `<event>`?" | record it's present |
| **player action** (`doing_fire_pistol`) | "Is the character doing this now?" | write the observation |
| **invariant** ("never submerges", "EXACTLY ONE … no clone") | "Is it violated?" | **yes → re-anchor** (assert the fix) |
| **alt base version** (`overboard`) | "Is the scene in the `<state>` state?" | note the state |

Authoring the scene once yields both the questions and the state slots. **Temperature 0**;
debounce (apply an op only when its answer **changed** since the last frame). The two pure
halves (no VLM/coordinator deps): `derive_probes(scene) → {system, probes:[{id,q,…}]}` and
`resolve(answers, probes) → (ops, observations)`.

**Wiring.** Live consumer: `director_common.make_probe(vlm, scene_json)` builds the
checklist once and asks it per frame; `run_director` sends the ops before deciding (the
probe pass = the AI director's eyes; `director_nim.py --no-probe` skips it). Dev harness:
`aidirector/test_probes.py` (frame + scene → checklist → one call → printed answers/observations/
ops, dry-run; `run_test_probes.bat`) — deletable independently of the live path.

## Invariants
- The coordinator touches **no video** — ops in, projected clauses out. Video stays
  on the Reactor/local DataChannel.
- The coordinator is the **single source of truth** for History, vitals, count,
  objective, and mode; it broadcasts so late-joiners sync immediately. There is exactly
  **one `History`** — the client keeps no copy (§6, Direction).
- **Probes are the AI director's eyes** — active only in `directorMode` `"ai"`/`"both"`;
  a human director verifies visually, so probes are off in `"human"` mode.
- AI Director never competes with the 14B generator for VRAM (it calls a remote NIM).
