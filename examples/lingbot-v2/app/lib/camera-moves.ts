// Curated camera-pose presets for the Lingbot 2 demo.
//
// `set_camera_pose` is Lingbot 2's native low-level camera layer: a
// flat list of per-frame motion deltas, 6 floats each —
// `[rx, ry, rz, tx, ty, tz]` (small Euler-radian rotation plus
// translation, in the camera-local frame). Sending exactly 6 floats
// means "apply this one delta to the whole chunk", which is the
// simplest useful shape and the one this demo sticks to.
//
// While a pose is active:
//   - its ROTATION overrides `look_horizontal` / `look_vertical`
//     (the arrow keys stop turning the camera), and
//   - its TRANSLATION adds on top of WASD movement.
//
// Sending an empty list deactivates the layer and hands the camera
// back to the look axes. The model sanitizes inputs (NaN/Inf → 0,
// rotations clamped to ±pi, translation to ±100), so presets can't
// break a session — but keep the numbers small anyway: these deltas
// re-apply every chunk, so a value that looks subtle over one chunk
// compounds into fast motion over several.
//
// Authoring rules for new presets:
//
//   1. Keep each delta gentle. |rotation| ≤ ~0.05 rad and
//      |translation| ≤ ~0.5 per chunk reads as deliberate camera
//      work; more reads as a whip-pan.
//
//   2. Name the preset after the cinematographic move, not the math.
//      Users pick "Orbit" or "Crane up", never "+ry −tx".
//
//   3. One motion idea per preset. Combining rotation and translation
//      is what makes a move (an orbit is yaw + counter-strafe), but
//      don't stack two unrelated moves in one preset — compose them
//      as separate presets instead.

export interface CameraMove {
  id: string;
  /** Short label shown on the button. */
  label: string;
  /** One-line description shown as the button's tooltip. */
  description: string;
  /**
   * One per-chunk motion delta: [rx, ry, rz, tx, ty, tz].
   * Rotations in radians, translations in the camera-local frame.
   */
  pose: readonly [number, number, number, number, number, number];
}

export const CAMERA_MOVES: ReadonlyArray<CameraMove> = [
  {
    id: "orbit",
    label: "Orbit",
    description:
      "Circle the subject — steady yaw paired with a lateral counter-drift",
    pose: [0, 0.04, 0, -0.35, 0, 0],
  },
  {
    id: "push_in",
    label: "Push in",
    description: "Dolly straight toward the subject, framing untouched",
    pose: [0, 0, 0, 0, 0, 0.4],
  },
  {
    id: "crane_up",
    label: "Crane up",
    description: "Rise above the scene while pitching down to hold the subject",
    pose: [0.02, 0, 0, 0, 0.35, 0],
  },
];

/** Look up a camera move by id. */
export function findCameraMoveById(
  id: string | null | undefined,
): CameraMove | null {
  if (!id) return null;
  return CAMERA_MOVES.find((m) => m.id === id) ?? null;
}
