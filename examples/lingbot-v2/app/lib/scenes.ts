// Curated starting scenes for the Lingbot 2 demo.
//
// Each scene bundles together a reference image and an initial prompt.
// Lingbot 2 requires BOTH a prompt AND an image before generation can
// start, so the natural "one click to begin" surface is an
// image+prompt pair.
//
// These pairs are the raw eval cases exported from the Lingbot 2 lab
// (case1 + case2): every `imageUrl` is that case's exported first
// frame, and every `prompt` is its base prompt copied verbatim. Only
// the `label` / `description` are ours, for the picker.
//
// Every scene here is a fixed-viewpoint (look-only) case: the scene
// and camera are still, and arrow-key look-input pans or orbits the
// view only while a key is held — nothing moves on its own. The WASD
// movement axes have no effect in these prompts; they're steered
// entirely with the look controls.
//
// PROMPT STYLE — why most prompts are a full paragraph, not a tagline:
// Lingbot 2 produces dramatically more coherent scenes when a prompt
// spells out the subject, environment, framing AND how the camera and
// subject may (or may not) move. Terse prompts leave the model to
// reinvent everything each chunk, which reads as instability.

export interface Scene {
  id: string;
  label: string;
  description: string;
  imageUrl: string;
  prompt: string;
}

export const SCENES: ReadonlyArray<Scene> = [
  {
    id: "tilt_city",
    label: "Tilt-Shift City",
    description: "Fixed first-person pan over a miniature cityscape",
    imageUrl: "/images/tilt_city.jpg",
    prompt:
      "This is a first-person-view video of a detailed miniature cityscape seen from a high angle, featuring a dense cluster of skyscrapers and green spaces. Tilt-shift photography atmosphere. The viewpoint is fixed in place, framing the scene from a single standpoint. Nothing in the scene nor the camera moves on its own; arrow-key look-input is the only source of camera motion, panning the first-person view across the stationary city only while held. The entire model remains perfectly still, with the tiny cars and trees frozen in place.",
  },
  {
    id: "macro_ant",
    label: "Macro Ant",
    description: "Orbit a still ant on a dirt path, macro nature",
    imageUrl: "/images/macro_ant.jpg",
    prompt:
      "This is a third-person-view video of a reddish-brown ant standing on a dirt path between tall green grass blades. Macro nature atmosphere. The ant is locked at the exact centre of the frame at constant size and distance. Neither the ant nor the camera moves on its own; arrow-key look-input is the only source of camera motion, orbiting the camera around the stationary ant only while held. The ant stands perfectly still on its six legs, the water droplets on the surrounding grass blades frozen in place.",
  },
  {
    id: "swat_alley",
    label: "SWAT Alley",
    description: "Orbit a SWAT officer in a noir rain alley",
    imageUrl: "/images/swat_alley.jpg",
    prompt:
      "This is a third-person-view video of a SWAT officer in full black tactical gear and helmet, walking away down a wet cobblestone alley. Cinematic noir atmosphere. The officer is locked at the exact centre of the frame at constant size and distance. Neither the officer nor the camera moves on its own; arrow-key look-input is the only source of camera motion, orbiting the camera around the stationary officer only while held. The officer stands perfectly still, the rain and steam held frozen in the air.",
  },
  {
    id: "mounted_warrior",
    label: "Mounted Warrior",
    description: "Orbit a green-armored rider over a muddy battlefield",
    imageUrl: "/images/mounted_warrior.jpg",
    prompt:
      "This is a third-person-view video of a warrior in green armor and a hood, mounted on a brown horse and holding a large curved blade, overlooking a muddy battlefield. Somber, war-torn atmosphere. The warrior and horse are locked at the exact centre of the frame at constant size and distance. Neither the pair nor the camera moves on its own; arrow-key look-input is the only source of camera motion, orbiting the camera around the stationary pair only while held. The warrior and horse stay completely still, the horse's tail and the warrior's cloak hanging undisturbed in the calm air.",
  },
  {
    id: "dragon_reins",
    label: "Dragon Reins",
    description: "First-person grip on a green dragon's reins near a castle",
    imageUrl: "/images/dragon_reins.jpg",
    prompt:
      "This is a first-person-view video of a rider’s leather-gloved hands gripping reins on the scaled neck of a green dragon, with a moss-covered stone castle visible in the distance. The dragon remains at the exact centre of the frame at constant size and distance. Neither the dragon nor the camera moves on its own; arrow-key look-input is the only source of camera motion, orbiting around the stable dragon only while held. With no event key pressed, the rider’s hands rest relaxed on the reins, the dragon’s neck steady, and the surrounding jungle foliage motionless.",
  },
  {
    id: "jet_ski",
    label: "Jet Ski",
    description: "Orbit a jet ski rider near a palm beach",
    imageUrl: "/images/jet_ski.jpg",
    prompt:
      "This is a third-person-view video of a man in a red life vest seated on a white and red jet ski near a sandy beach with palm trees. The man remains at the exact centre of the frame at constant size and distance. Neither the man nor the camera moves on its own; arrow-key look-input is the only source of camera motion, orbiting around the stable rider only while held. With no event key pressed, the man sits upright on the jet ski, hands resting on the handlebars, ready to operate the vehicle.",
  },
];

/** Look up a scene by id. */
export function findSceneById(id: string | null | undefined): Scene | null {
  if (!id) return null;
  return SCENES.find((s) => s.id === id) ?? null;
}
