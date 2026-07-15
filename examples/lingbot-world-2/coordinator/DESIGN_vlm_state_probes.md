# Design: VLM State Checks

| | |
|---|---|
| **Status** | Draft · 2026-07-15 |
| **Related** | `vlm/scene_probes.py`, `vlm/test_probes.py`, [CONTRACT.md](./CONTRACT.md) |

## Idea

Update world state from a frame by asking the VLM a list of **yes/no questions in ONE
call**, then mapping each answer to a state op. No open-ended event picking, no prose
parsing — that's what makes it reliable.

## The questions come from the scene, not by hand

`scene_probes.derive_probes(scene)` turns a game definition into the checklist:

| Scene element | Derived question | On answer |
|---|---|---|
| **director event** (Shark Appears, Storm Rolls In…) | "Is this visible now: `<event>`?" | record it's present |
| **invariant** ("never submerges", "EXACTLY ONE … no clone") | "Is it violated?" | **yes → re-anchor** (assert the fix) |
| **alt base version** (`overboard`) | "Is the scene in the `<state>` state?" | note the state |

So authoring the scene once gives you both the questions and the state slots — nothing
is maintained separately.

## Apply the answers

One VLM call → `{ "shark_appears": true, "submerged": false, ... }` → each answer picks an op:

- `assert {key, clause}` / `retract {key}` — a fact
- `vital {change}` — health / inventory

Ops are sent to the coordinator ([Contract 3](./CONTRACT.md)). **Temperature 0**, and
apply an op only when its answer **changed** since the last frame (debounce).

## State

Reuses what already exists — coordinator **facts + vitals** ([CONTRACT §6](./CONTRACT.md)).
If an event needs to *gate* on an answer, store the booleans in a flat
`observations: Record<string, boolean>` and read it from the existing `gated` rule.
Richer typed/entity state is possible later but not needed for v1.

## Files

- **`vlm/scene_probes.py`** — the whole thing, ~2 functions, both driven by the scene JSON:
  - `derive_probes(scene)` → the yes/no checklist (**queries** the VLM).
  - `resolve(answers, probes)` → coordinator ops + flat observations (**updates** state).
- **`vlm/test_probes.py`** — a **dev-only test harness** (frame + scene → checklist → one VLM
  call → printed answers / observations / coordinator ops, dry-run — sends nothing). Defaults
  to `../../../assets/shark.jpg` + `jet-ski-cruise.json`; run via `run_test_probes.bat`. Use it
  to eyeball a scene's checklist against a real frame and tune probe wording.
- **Production consumer (not yet wired)** — the intended live path is the AI director
  (`director_common.py`) calling `derive_probes` → VLM → `resolve` → sending the ops, replacing
  its open-ended event-picking. `vlm/scene_probes.py` holds the pure `derive_probes`/`resolve` halves;
  the VLM-calling glue still needs to be added there. The dev harness can be deleted independently.
