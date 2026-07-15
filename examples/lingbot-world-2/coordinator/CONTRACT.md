# Coordinator Contracts

The lingbot-world-2 "two-brain" system (Player renders video, Director steers it)
is glued together by five contracts. Everything else is an implementation of one
of these. Change a contract → all implementers must change together.

---

## 1. AI Director backend interface — `decide()`  _[AI-only]_

A pluggable VLM backend supplies exactly one function:

```
decide(frame: PIL.Image, system_prompt: str) -> str   # raw model reply
```

- Input: the latest frame + the invariant-bounded system prompt (built by
  `director_common.build_system`).
- Output: raw text, expected to contain a JSON object (Contract 2).
- Implementer: `director_nim.py` (NVIDIA inference hub, OpenAI-compatible).
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
- `scene.events[*]` where `actor == "director"` → `{name, clause = detail(.static), health, addItem}`.
- `objective.director || objective.summary` → the standing goal.

The AI and human directors fire from this SAME list. Player-actor events are the
human player's hold-keys and are NOT in the director set.

## 5. Frame handoff  _[AI-only]_

- Player writes the latest rendered frame to a file (default `frame.png`).
- The director watches its mtime; each new frame = one look = one `step`/chunk of pacing.
- File-based on purpose: decouples the Python director from the browser/DataChannel.

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
```

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
invariant checks (`submerged`, `duplicate_subject`), version state (`state:overboard`).
Rules gate on it directly:
```ts
{ kind: "gated", when: s => s.observations["state:overboard"] }
```
Two things a probe answer can do: (a) emit a **coordinator op** (§3 — assert/vital, the
shared/persistent effect), and/or (b) write this **observation** (the client-side,
gate-able bool). Richer typed state (enums, counts, confidence, an entity list, an
`environment` object) is a possible later extension — v1 is flat booleans.

## Invariants
- The coordinator touches **no video** — ops in, projected clauses out. Video stays
  on the Reactor/local DataChannel.
- The coordinator is the **single source of truth** for History, vitals, count,
  objective, and mode; it broadcasts so late-joiners sync immediately. There is exactly
  **one `History`** — the client keeps no copy (§6, Direction).
- **Probes are the AI director's eyes** — active only in `directorMode` `"ai"`/`"both"`;
  a human director verifies visually, so probes are off in `"human"` mode.
- AI Director never competes with the 14B generator for VRAM (it calls a remote NIM).
