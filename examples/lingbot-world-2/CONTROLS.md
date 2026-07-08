# Interactive Controls — Design & Implementation

How the LingBot‑World frontend turns keyboard/mouse/pad input into what the model
actually sees. This is the mental model behind jump, crouch, and the per‑latent
motion editors — read it before touching `LingbotWorldController.tsx`.

Everything here is driven by three commands the client sends to the runtime:

| Command                                      | Carries                                             | Notes                                                                  |
| -------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------- |
| `set_move_longitudinal` / `set_move_lateral` | WASD **action** (`forward`/`back`/`strafe`/`still`) | a discrete action string, not a vector                                 |
| `set_camera_pose`                            | per‑latent 6‑DoF **deltas** `[rx,ry,rz,tx,ty,tz]`   | the interesting channel; drives look / roll / jump / crouch / joystick |
| `set_prompt`                                 | the composed **text prompt**                        | recomposed whenever anything changes                                   |

The whole design exists because of how the backend combines these — so start there.

---

## 0. The backend `camera_pose` contract (the physics everything obeys)

Verified against the model backend's action-generator and camera-utils
implementation. Four facts shape every decision below:

1. **Granularity is per‑LATENT, not per‑chunk.** The backend's chunk size is 3
   latents, and the VAE temporal stride is 4, so **3 latents ≈ 12 pixel frames**.
   The client sends `k` deltas of 6 floats; if `k == 3` the backend uses them
   **one‑to‑one**, one delta per latent. If `k == 1` it repeats the
   single delta across the chunk. ⇒ **We send 18 floats/chunk to steer each latent
   independently.**

2. **Axis convention is OpenCV y‑down: `−ty = UP`, `+ty = DOWN`.** In code this is
   `JUMP_UP_SIGN = -1`; "up" intent maps to a negative `ty`.

3. **Translation is per‑chunk MAX‑NORM normalized**: the chunk's
   translation vectors are divided by the single largest per‑frame norm in the chunk.
   Consequences:
   - **Absolute magnitude is erased.** Sending `ty = 0.3` vs `ty = 100` gives the same
     result if it's the only motion — only the **sign / direction** survives.
   - **Within‑chunk _relative_ magnitude survives.** Across the 3 latents of one chunk,
     their proportions are preserved (only the chunk's peak is scaled to 1). So a
     within‑chunk shape like `(down, still, up)` → `(−1, 0, +1)` is faithful.
   - **Cross‑chunk absolute scale is lost.** Each chunk re‑normalizes to its own peak,
     so you cannot carry a smooth velocity envelope across many chunks — only the
     within‑chunk (3‑latent) shape is exact.

4. **Translation ADDS to the WASD action; rotation OVERRIDES the look/arrow keys**
   (the backend's rule is "rot override, trans add"). So a `camera_pose`
   with `ty=down, tx=tz=0` does **not** erase forward — the backend sums the WASD
   forward in. (This is why crouch does not need to re‑send forward; see §3.)

**Bottom line for the client:** motion is shaped **per latent by SIGN**; a motion's
_size_ is its **latent count (duration)**, not a magnitude. This is the single idea
that explains discrete charge levels, symmetry, and the grid editors.

---

## 1. The Button → Event model

- **Each button represents a triggerable Event.**
- **Each Event is a (Camera Pose, Prompt) pair** — a bit of motion on the `camera_pose`
  channel _and_ a sentence appended to `set_prompt`, delivered together so the prose
  matches the motion.
- **Press and Release are independent triggers.** A button can fire one event on
  press‑down and a _different_ event on release. This makes a button a small
  state machine, not a momentary toggle.
- **Worked example — Crouch (C), `camera` mode:**
  - **Press** → the _crouch_ event: the crouch `camera_pose` dip (down) **+** the scene's
    `crouchPrompt`, held for the whole crouch‑walk.
  - **Release** → the _stand_ event: the reverse `camera_pose` (up) **+** the scene's
    `standPrompt` ("stands back up").
- **Jump (Space)** is the same shape with an implicit release: in `charge` mode, hold
  = charging, release = the event fires (the up→down arc). Its "release" _is_ the descent.

Prompts and camera pose are wired separately in code but conceptually one event:

- camera pose: `sendCameraPoseChunk()` (per chunk).
- prompt: `recomputePromptAndSend()` → the sentence flows through `composePrompt(...)` as
  a dedicated **`vertical`** segment (see `prompt-segments.ts`), so it also shows in the
  "Show prompt" inspector.

---

## 2. Camera Pose symmetry (return‑to‑origin)

**If you want the character to return to where it started, the camera pose must be
symmetric — equal UP and DOWN.** Because magnitude is normalized away (§0.3), "equal"
means **equal _counts_ of up‑latents and down‑latents**: each contributes ~one unit of
displacement, so `#up == #down` ⇒ net‑zero vertical ⇒ back to launch height.

- **Jump example.** If the arc has more up‑latents than down‑latents, the character
  ends up **higher** than it started (never fully lands); more down than up and it sinks
  below the floor. Only `#up == #down` lands cleanly at the origin.
- This is why the **charge‑level defaults are symmetric**:
  - L1 (1 chunk): `↑ · ↓` → `[1, 0, -1]`
  - L2 (2 chunks): `↑ ↑ · | ↓ ↓ ·` → `[1,1,0, -1,-1,0]`
  - L3 (3 chunks): `↑ ↑ ↑ ↑ · ↓ ↓ ↓ ↓` → `[1,1,1,1, 0, -1,-1,-1,-1]`
    (`·` = still/apex; the still latents are the hang at the top and don't affect balance.)
- Crouch is symmetric across **press vs release**: the press dip (down) and release dip
  (up) are mirror patterns, so a full press+release nets back to the original height.

If you hand‑edit a pattern to be asymmetric, that's fine — just know the character will
drift vertically by the (up − down) latent count each time.

---

## 3. Per‑latent motion, additive to movement

Every `camera_pose` we send is `CHUNK_LATENTS` (3) deltas. Rotation (`rx,ry,rz`) and
horizontal translation (`tx,tz`, from the joystick) are **uniform** across the 3 latents;
only **`ty` is authored per‑latent** (jump arc / crouch dip). See `sendCameraPoseChunk()`.

Because translation is additive on the backend (§0.4), a vertical `ty` **stacks on top of
WASD forward** without the client folding forward in — hold C and W and you crouch‑walk
diagonally. (When both are present, the per‑chunk max‑norm blends them, so the _ratio_
of vertical to forward is what's preserved, not absolute height.)

---

## 4. Editing motion: the per‑latent grid editors

Motion patterns are **hand‑editable** and **persisted** (`localStorage`), never hardcoded
in logic.

- **Jump — charge levels.** Charge is _discrete_: `NUM_CHARGE_LEVELS` (3) levels = 1/2/3
  chunks. The meter steps through levels (dwelling `LEVEL_DWELL_MS`); releasing at level
  _k_ fires level _k_'s pattern. Click a level (the `Lvl` buttons) to open its grid: _k_
  rows × 3 cells. State: `chargePatterns: number[][]`.
- **Crouch — press & release.** The `✎ dip` button opens a 2‑row grid: `press (↓)` and
  `release (↑)`, one chunk each. State: `crouchPatterns: { press, release }`.
- **Cell cycle:** click a cell to cycle **↑ up (+1) → ↓ down (−1) → · still (0)**.
  Encoding matches the backend intent (`+1` up, `−1` down, `0` still); `ty` for a latent =
  `intent × CROUCH_DIP(or JUMP_SPEED) × JUMP_UP_SIGN`.

The number of `still` cells you place _is_ the pause/hang duration — there's no separate
"pause length" knob because a still latent already means "hold this frame."

---

## 5. Prompts are per‑example and editable

Jump/crouch/stand sentences are **scene fields, not code constants**:
`StructuredScene.jumpPrompt` / `crouchPrompt` / `standPrompt` (`lib/lingbot-world-prompts.ts`).
Edit them per example in the scene editor's **"Vertical" tab** (click ✎ on any example →
_Jump prompt (Space)_ / _Crouch prompt (C held)_ / _Stand‑up prompt (C release)_).
Different examples can carry different lines; they persist via the override store.

At runtime `recomputePromptAndSend()` picks the active vertical sentence (jump while
jumping, crouch while C held, stand during the release chunk), passes it to
`composePrompt(scene, isMoving, heldSlots, verticalPrompt)`, and mirrors it into state so
the inspector shows it as the amber **jump / crouch** segment.

---

## 6. Trigger semantics — one‑shot, held, and latches

Jump and crouch differ, deliberately:

- **Jump is one‑shot and locked while airborne.** `onJumpDown` returns early if a charge
  arc is still in flight (`jumpArcRef.length > 0`) — **no re‑jump until it lands** (no
  double‑jump), mirroring a real jump.
- **Crouch can be held.** The dip fires only on the _idle → held_ transition
  (`setVert`), key auto‑repeat is ignored, and the dip flags are booleans, so **holding
  C = exactly one press dip** (then crouch‑walk), and releasing fires **exactly one
  release dip**. No spam while held.
- **Charge is hold‑to‑charge:** while held, the level meter steps and _no_ motion/prompt
  is emitted; the event fires on release.

Both dips are **one chunk** and consumed on the next `chunk_complete`, so they're
inherently transient — the camera nudges once and holds its new height (motion deltas are
relative).

---

## 7. Quick reference — modes

**Jump (`Jump` switch):**

- `hold` — translate up while held (no descent). Original behavior; a held state.
- `prompt` — append `jumpPrompt` only; no `camera_pose`.
- `charge` — hold → discrete level meter; release → that level's symmetric up→down arc
  (+ `jumpPrompt`). Levels editable.

**Crouch (`Crouch` switch):** held on the **C** key.

- `hold` — sustained straight‑DOWN translation for as long as held (mirror of jump
  `hold`); the way to walk vertically downward. + `crouchPrompt` while held.
- `prompt` — inject `crouchPrompt` while held; no `camera_pose`.
- `camera` — press+release dips (editable, `✎ dip`) + `crouchPrompt` (held) and
  `standPrompt` (release).

> **Heads‑up — `hold` (jump _or_ crouch) freezes arrow‑look on the current backend.**
> A sustained vertical `hold` sends a `camera_pose` every chunk, and the backend's
> `camera_pose` contract is _"when active, rotation OVERRIDES look_horizontal /
> look_vertical"_ — even when the pose
> carries **zero** rotation. So while you hold Space (`hold`) or C (`hold`), the arrow
> keys can't rotate until the backend is changed to only override when the pose actually
> carries rotation. Mouse‑look is unaffected (it _does_ carry rotation).

> **Why crouch is on `C`, not `Ctrl`.** macOS reserves `Ctrl`+arrows for Spaces /
> Mission Control and grabs them at the OS level _before_ the page receives the keydown.
> A `Ctrl`‑held crouch would therefore silently swallow arrow‑look (rotation) whenever the
> two overlap — and no amount of `preventDefault` in the browser can override a system
> shortcut. `C` is collision‑free. Don't move crouch back onto `Ctrl`.

---

## Code map

| Concern                                           | Where                                                                                   |
| ------------------------------------------------- | --------------------------------------------------------------------------------------- |
| All input handling, pose emission, modes          | `components/lingbot-world-2/LingbotWorldController.tsx`                                 |
| Per‑chunk `camera_pose` builder (per‑latent `ty`) | `sendCameraPoseChunk()`                                                                 |
| Prompt composition + active vertical sentence     | `recomputePromptAndSend()`                                                              |
| Jump press/release + charge meter + arc           | `onJumpDown` / `onJumpUp` / charge‑meter `useEffect`                                    |
| Crouch press/release dips                         | `setVert()` + `chunk_complete` handler                                                  |
| Arc / dip advancement + consumption               | `case "chunk_complete"` in the message handler                                          |
| Charge / crouch pattern defaults + editors        | `defaultChargePattern` / `defaultCrouchPatterns`, `cycleChargeCell` / `cycleCrouchCell` |
| Prompt model + `composePrompt`                    | `lib/lingbot-world-prompts.ts`                                                          |
| Prompt segments (incl. `vertical`)                | `components/lingbot-world-2/prompt-segments.ts`                                         |
| Per‑example prompt editing UI                     | `components/lingbot-world-2/LayeredSceneEditor.tsx` ("Vertical" tab)                    |

**Tunables** (top of `LingbotWorldController.tsx`): `CHUNK_LATENTS`, `NUM_CHARGE_LEVELS`,
`LEVEL_DWELL_MS`, `JUMP_SPEED`, `JUMP_UP_SIGN`, `CROUCH_DIP`.
