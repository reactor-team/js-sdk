// Curated camera-pose presets for the LingBot World 2 demo.
//
// `set_camera_pose` is LingBot World 2's native low-level camera layer: a
// flat list of per-frame motion deltas, 6 floats each —
// `[rx, ry, rz, tx, ty, tz]` (small Euler-radian rotation plus
// translation, in the camera-local frame). The payload is a VELOCITY
// PROFILE, not a position path: each 6-tuple says how fast the camera
// rotates/translates during one latent frame. Two payload shapes
// matter here:
//
//   - 6 floats           — one delta broadcast to every frame of the
//                          chunk (constant velocity),
//   - 6*k floats (k > 1) — a per-frame profile, resampled by the
//                          server to its latent chunk size. This is
//                          what makes eased ramps and arcs possible.
//
// While a pose is active:
//   - its ROTATION overrides `look_horizontal` / `look_vertical`
//     (the arrow keys stop turning the camera), and
//   - its TRANSLATION adds on top of WASD movement.
//
// Sending an empty list deactivates the layer and hands the camera
// back to the look axes. The model sanitizes inputs (NaN/Inf → 0,
// rotations clamped to ±pi, translation to ±100), so presets can't
// break a session — but keep the numbers small anyway: these are
// per-frame velocities, so a value that looks subtle on one frame
// compounds into fast motion over a chunk.
//
// THE POSE LAYER IS A BIAS, NOT A RIG. LingBot is a world model:
// there is no ground-truth camera to move. The pose deltas condition
// the generation toward camera motion, but the text prompt conditions
// it too — and the lab scene prompts describe a stationary world,
// locking the subject "at the exact centre of the frame at constant
// size and distance" and stating that "neither the subject nor the
// camera moves on its own". Send pose deltas against that and the two
// signals FIGHT: sometimes the pose wins and the camera moves,
// sometimes the prompt wins and it stays put, and often the subject
// gets dragged along with the camera. That's why every move carries a
// `promptHint` — a sentence composed onto the active prompt for the
// duration of the move that says, in the lab prompts' own vocabulary,
// that the CAMERA now moves while the subject "stays perfectly still".
// Matching their language on both channels is what makes moves land
// consistently.
//
// Two kinds of preset live in this file:
//
//   - SUSTAINED (`chunks: null`) — a constant velocity the camera
//     holds until the user releases it. The classic film moves
//     (orbit, push-in, crane).
//   - ONE-SHOT (`chunks: n`) — a move with a beginning and an end.
//     Its per-frame velocities follow a smooth bell envelope (still →
//     peak → still) sliced chunk by chunk; the panel streams one
//     slice per `chunk_complete` and sends the empty list when the
//     move finishes, releasing the camera automatically.
//
// (There is deliberately no "handheld shake" preset. This channel
// conditions per LATENT frame, each of which spans several pixel
// frames — high-frequency noise doesn't read as camera shake, it
// reads as the world lurching in a new direction every few frames.)
//
// Authoring rules for new presets:
//
//   1. Keep velocities gentle. Peak |rotation| ≤ ~0.05 rad/frame and
//      |translation| ≤ ~0.5/frame reads as deliberate camera work
//      (for scale: the look axes default to 5°/frame ≈ 0.09 rad).
//      "Whip pan" deliberately exceeds this — that's what makes it a
//      whip — but it's the exception, not the pattern. Gentler is
//      also more consistent: fast pose motion is more likely to drag
//      the subject along.
//
//   2. Name the preset after the cinematographic move, not the math.
//      Users pick "Orbit" or "Crane up", never "+ry −tx".
//
//   3. One motion idea per preset. Combining rotation and translation
//      is what makes a move (an orbit is yaw + counter-strafe), but
//      don't stack two unrelated moves in one preset — compose them
//      as separate presets instead.
//
//   4. Borrow the lab prompts' camera-control vocabulary. Say the
//      CAMERA performs the move and the subject "stays perfectly
//      still" (their phrase) — never that the subject follows or
//      moves on its own. One sentence, present continuous,
//      subject-agnostic ("the subject", never "the ant") so it strips
//      verbatim and reads on any scene. Add "at the exact centre of
//      the frame at constant size and distance" only for moves that
//      hold the framing (orbit, arc); for push-in / crane / reveal,
//      state how the subject's size or position in frame changes.

/**
 * Frames per chunk that profiles are authored at. The server
 * resamples any 6*k payload to its actual latent chunk size, so this
 * only sets the resolution of the authored curve, not its duration.
 */
export const PROFILE_FRAMES = 16;

// THE VERIFIED FRAME (live axis calibration, July 2026): the
// camera-local frame is the standard computer-vision convention —
//
//   +tx = right      −tx = left
//   +ty = DOWN       −ty = up      (y is not up!)
//   +tz = forward    −tz = backward (pull toward the viewer)
//
// Coming from graphics you'd expect y-up; here a positive `ty` sinks
// the camera. The ROTATION signs (rx / ry / rz) are still unverified
// — probe them with raw single-axis set_camera_pose sends before
// trusting any preset that leans on a specific rotation direction.

/** One per-frame motion delta: rotation in radians, translation in the camera-local frame. */
type Pose6 = readonly [number, number, number, number, number, number];

export interface CameraMove {
  id: string;
  /** Short label shown on the button. */
  label: string;
  /** One-line description shown as the button's tooltip. */
  description: string;
  /**
   * Sentence composed onto the active prompt while the move runs, so
   * the text conditioning agrees with the pose conditioning (see the
   * file comment — without this the subject tends to follow the
   * camera). Must be removable verbatim: the panel strips it from the
   * current prompt on release.
   */
  promptHint: string;
  /**
   * How many chunks the move spans before releasing the camera, or
   * `null` for a sustained move that holds until toggled off.
   */
  chunks: number | null;
  /**
   * The `camera_pose` payload for the given chunk of the move —
   * either 6 floats (constant velocity) or `6 * PROFILE_FRAMES`
   * floats (a per-frame profile). For one-shot moves `chunk` runs
   * from 0 to `chunks - 1`; sustained moves may ignore it.
   */
  poseForChunk(chunk: number): number[];
}

/** A sustained constant-velocity move — the simplest payload shape. */
function constant(pose: Pose6): (chunk: number) => number[] {
  return () => [...pose];
}

/**
 * One chunk's slice of a one-shot move: `peak` velocities scaled by a
 * sin² bell over the whole move, so the camera eases from still, hits
 * `peak` mid-move, and eases back to still. Peaks are chosen to match
 * the tested sustained presets — the envelope changes the shape of
 * the motion, not its top speed.
 */
function envelope(peak: Pose6, chunk: number, chunks: number): number[] {
  const total = chunks * PROFILE_FRAMES;
  const out: number[] = [];
  for (let f = 0; f < PROFILE_FRAMES; f++) {
    const t = (chunk * PROFILE_FRAMES + f + 0.5) / total;
    const w = Math.sin(Math.PI * t) ** 2;
    for (const v of peak) out.push(v * w);
  }
  return out;
}

export const CAMERA_MOVES: ReadonlyArray<CameraMove> = [
  // ── Sustained — hold until re-clicked ────────────────────────────
  {
    id: "orbit",
    label: "Orbit",
    description:
      "Circle the subject — steady yaw paired with a lateral counter-drift",
    promptHint:
      "The camera orbits steadily around the subject, which stays perfectly still at the exact centre of the frame at constant size and distance as the viewpoint circles it.",
    chunks: null,
    poseForChunk: constant([0, 0.04, 0, -0.35, 0, 0]),
  },
  {
    id: "push_in",
    label: "Push in",
    description: "Dolly straight toward the subject, framing untouched",
    promptHint:
      "The camera dollies straight in toward the subject, which stays perfectly still, holding its position and growing larger in the frame as the viewpoint approaches.",
    chunks: null,
    poseForChunk: constant([0, 0, 0, 0, 0, 0.4]),
  },
  {
    id: "crane_up",
    label: "Crane up",
    description: "Rise above the scene while pitching down to hold the subject",
    promptHint:
      "The camera cranes upward above the scene and pitches down to hold the subject, which stays perfectly still, sinking lower in the frame as the viewpoint climbs.",
    chunks: null,
    // −ty is up in this frame (verified) — +0.35 was a crane DOWN.
    poseForChunk: constant([0.02, 0, 0, 0, -0.35, 0]),
  },

  // ── One-shot — run to completion, then release the camera ───────
  {
    id: "arc",
    label: "Arc",
    description:
      "A single eased sweep around the subject — orbit with a beginning and an end",
    promptHint:
      "The camera sweeps in a single smooth arc around the subject, which stays perfectly still at the exact centre of the frame at constant size and distance as the viewpoint circles it and settles.",
    chunks: 6,
    poseForChunk: (c) => envelope([0, 0.04, 0, -0.35, 0, 0], c, 6),
  },
  {
    id: "whip_pan",
    label: "Whip pan",
    description: "A fast eased yaw flick — blink and the framing has changed",
    promptHint:
      "The camera whips rapidly to one side across the scene while the subject stays perfectly still, briefly sliding out of the centre of the frame before the viewpoint settles.",
    chunks: 2,
    poseForChunk: (c) => envelope([0, 0.12, 0, 0, 0, 0], c, 2),
  },
  {
    id: "reveal",
    label: "Reveal",
    description:
      "Pull back and rise to a wide shot, pitching down to keep the subject",
    promptHint:
      "The camera pulls back and rises into a wide shot, revealing the surrounding scene, while the subject stays perfectly still and grows smaller in the frame as the viewpoint retreats.",
    chunks: 4,
    // −ty rises, −tz pulls back toward the viewer (both verified).
    poseForChunk: (c) => envelope([0.02, 0, 0, 0, -0.3, -0.45], c, 4),
  },
];

/** Look up a camera move by id. */
export function findCameraMoveById(
  id: string | null | undefined,
): CameraMove | null {
  if (!id) return null;
  return CAMERA_MOVES.find((m) => m.id === id) ?? null;
}

/**
 * Remove every move's `promptHint` from a prompt, verbatim. Used on
 * release (and before composing a new hint) so hints never stack and
 * a stale hint never outlives its move. Safe on prompts that contain
 * no hint — returns them unchanged.
 */
export function stripCameraPromptHints(prompt: string): string {
  let out = prompt;
  for (const move of CAMERA_MOVES) {
    out = out.replaceAll(` ${move.promptHint}`, "");
    out = out.replaceAll(move.promptHint, "");
  }
  return out.trim();
}

/** Compose a move's `promptHint` onto a prompt (hint-free base first). */
export function composeCameraPrompt(prompt: string, move: CameraMove): string {
  const base = stripCameraPromptHints(prompt);
  return base.length > 0 ? `${base} ${move.promptHint}` : move.promptHint;
}
