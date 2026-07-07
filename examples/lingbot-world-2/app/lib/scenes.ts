// Curated starting scenes for the LingBot World 2 demo.
//
// Each scene bundles together a reference image and an initial prompt.
// LingBot World 2 requires BOTH a prompt AND an image before generation can
// start, so the natural "one click to begin" surface is an
// image+prompt pair.
//
// All scenes are raw eval cases exported from the LingBot World 2 lab:
// every `imageUrl` is that case's exported first frame, and every
// `prompt` is its base prompt copied verbatim. Only the `label` /
// `description` are ours, for the picker. Two batches ship:
//
//   - FEATURED_SCENES: the Paraglider, shown first. It carries its own
//     lab-authored event set (see `Scene.events`), so the DynamicEvents
//     panel shows those instead of the global fallback.
//
//   - CURATED_SCENES (case1 + case2): each a fixed-viewpoint (look-only)
//     case — the scene and camera are still, arrow-key look-input pans
//     or orbits only while held, and the WASD movement axes have no
//     effect. No per-scene events; the DynamicEvents panel falls back to
//     the global set.
//
// PROMPT STYLE — why most prompts are a full paragraph, not a tagline:
// LingBot World 2 produces dramatically more coherent scenes when a prompt
// spells out the subject, environment, framing AND how the camera and
// subject may (or may not) move. Terse prompts leave the model to
// reinvent everything each chunk, which reads as instability.

import type { DynamicEvent } from "./dynamic-events";

export interface Scene {
  id: string;
  label: string;
  description: string;
  imageUrl: string;
  prompt: string;
  /**
   * Scene-specific world events (the lab authors events per scene —
   * an eagle belongs over the paraglider's valley, not in a rain alley).
   * When present, the DynamicEvents panel shows these instead of the
   * global fallback set in dynamic-events.ts.
   */
  events?: ReadonlyArray<DynamicEvent>;
}

/** Featured scenes shown first in the picker. Unlike the curated batch,
 * these carry their own lab-authored event set. */
const FEATURED_SCENES: ReadonlyArray<Scene> = [
  {
    id: "paraglider",
    label: "Paraglider",
    description: "First-person paraglider soaring above a green valley",
    imageUrl: "/images/paraglider.jpg",
    prompt:
      "This is a first-person-view video from the perspective of a paraglider pilot soaring high above a green valley. The pilot's legs and hands gripping the control toggles remain at the exact centre of the frame at constant size and distance. Neither the pilot nor the camera moves on its own; arrow-key look-input is the only source of camera motion, orbiting around the stable pilot only while held. With no event key pressed, the pilot's legs hang relaxed and the hands hold the toggles steady, ready to steer.",
    events: [
      {
        id: "f_0",
        label: "Eagle Soars Nearby",
        icon: "🐾",
        key: "f",
        keyLabel: "F",
        addendum:
          "The paraglider pilot remains the main subject, suspended high above the valley with legs and hands steady, while a massive golden eagle emerges from the sunlit mountain air to circle slowly to the left, its broad wings catching the thermal currents in wide, rhythmic sweeps that disturb nothing below.",
      },
      {
        id: "g_0",
        label: "Golden Hour Transition",
        icon: "🌦️",
        key: "g",
        keyLabel: "G",
        addendum:
          "The paraglider pilot remains the main subject, suspended high above the valley with legs and hands steady, as the bright, harsh blue daylight slowly mellows into the deep amber glow of sunset, casting long, warm shadows across the distant snow-capped peaks and painting the valley floor in soft, golden light.",
      },
      {
        id: "space_0",
        label: "Jump",
        icon: "🦘",
        key: " ",
        keyLabel: "Space",
        addendum:
          "The current controllable subject springs upward into the air.",
        finalPrompt:
          "This is a first-person-view video from the perspective of a paraglider pilot soaring high above a green valley. The pilot's legs and hands gripping the control toggles remain at the exact centre of the frame at constant size and distance. Neither the pilot nor the camera moves on its own; arrow-key look-input is the only source of camera motion, orbiting around the stable pilot only while held. With no event key pressed, the pilot's legs hang relaxed and the hands hold the toggles steady, ready to steer. The current controllable subject springs upward into the air.",
      },
    ],
  },
];

/** The original curated batch (lab case1 + case2 exports) — no per-scene
 * events; these fall back to the global DYNAMIC_EVENTS set. */
const CURATED_SCENES: ReadonlyArray<Scene> = [
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
];

/** Featured scene(s) first, then the curated batch. */
export const SCENES: ReadonlyArray<Scene> = [
  ...FEATURED_SCENES,
  ...CURATED_SCENES,
];

/** Look up a scene by id. */
export function findSceneById(id: string | null | undefined): Scene | null {
  if (!id) return null;
  return SCENES.find((s) => s.id === id) ?? null;
}

/**
 * Look up a scene by its exact base prompt. The live-phase panels only
 * see the session's captured prompt (not which picker card started it),
 * and curated prompts are used verbatim — so an exact match recovers
 * the scene, and with it the scene-specific event set. Custom prompts
 * simply miss.
 */
export function findSceneByPrompt(
  prompt: string | null | undefined,
): Scene | null {
  if (!prompt) return null;
  return SCENES.find((s) => s.prompt === prompt) ?? null;
}
