// Preset storyboards for the LongLive 2 director example.
//
// A storyboard is an ordered list of beats: the first is the opening shot
// (fired with `set_shot` before `start`), the rest are scheduled against the
// cumulative `session_chunk` clock with `schedule_shot` (soft, same scene) or
// `schedule_scene_cut` (hard, new scene + fresh 48-chunk budget).
//
// Keep each scene's beats inside its 48-chunk budget, or put a cut before the
// ceiling — a beat scheduled past where its scene auto-completes never fires.
//
// PROMPT STYLE: LongLive conditions weakly on terse prompts and the output
// degrades. Write dense, cinematic paragraphs — subject + wardrobe/detail,
// action, setting, time of day, lighting, lens + camera move, color palette,
// texture, and mood. Within a scene, soft shots re-establish the same subject
// and world so continuity holds; cuts describe a wholly new world.

import type { BeatKind } from "./storyboard-store";

export interface StoryboardBeat {
  kind: BeatKind;
  prompt: string;
  /** Absolute session chunk. The opener is 0. ~1.2s per chunk. */
  atChunk: number;
}

export interface PresetStoryboard {
  id: string;
  label: string;
  description: string;
  beats: ReadonlyArray<StoryboardBeat>;
}

export const STORYBOARDS: ReadonlyArray<PresetStoryboard> = [
  {
    id: "astronaut",
    label: "Red planet, three scenes",
    description: "A long take that evolves, then two hard cuts to new worlds.",
    beats: [
      {
        kind: "shot",
        prompt:
          "A lone astronaut in a worn white-and-orange pressure suit walks slowly across a vast windswept dune of deep rust-red sand, fine dust streaming off the crest in the low wind and trailing from each heavy boot-step. Golden-hour sunlight rakes across the surface from the left, carving long soft shadows down the ripples of the dune; a pale ringed planet hangs low and enormous on the dusty horizon. Wide cinematic establishing shot on a long lens, shallow depth of field, gentle slow dolly following the astronaut, warm amber-and-crimson palette, fine grain, volumetric haze, photoreal, 35mm film look.",
        atChunk: 0,
      },
      {
        kind: "shot",
        prompt:
          "The same astronaut, now seen from behind and below, crests the dune as the camera cranes up and pulls back to reveal a colossal impact crater stretching to the horizon, its terraced rust-colored walls glowing in the same warm golden-hour light. Thin streamers of dust drift across the frame; the ringed planet still looms in the dusty sky. Slow sweeping aerial reveal, wide-angle lens, deep focus, rich amber and ochre tones, soft volumetric god-rays, photoreal, cinematic.",
        atChunk: 20,
      },
      {
        kind: "cut",
        prompt:
          "A rain-slicked neon-lit Tokyo backstreet at night, packed with pedestrians under clear umbrellas, glowing signage in magenta, cyan, and electric blue reflecting in wet asphalt and shallow puddles. Steam rises from a ramen stall; warm lantern light spills from a doorway. Handheld camera at eye level drifting forward through the crowd, shallow depth of field with bokeh from distant signs, moody cinematic color grade, fine rain streaks catching the light, photoreal, anamorphic lens flares.",
        atChunk: 40,
      },
      {
        kind: "cut",
        prompt:
          "An underwater coral reef in crystal-clear turquoise water, brilliant shafts of sunlight cutting down from the surface and dancing across the sand. A dense school of silver fish turns in unison, scattering light; soft corals in orange and violet sway gently in the current, a sea turtle glides through the background. Slow drifting camera, wide-angle, crisp particulate detail suspended in the water, vivid blue-green palette with golden caustics, serene, photoreal, IMAX-quality.",
        atChunk: 80,
      },
    ],
  },
  {
    id: "chef",
    label: "One coherent long take",
    description: "A single scene evolved with soft shots — caps at ~58s.",
    beats: [
      {
        kind: "shot",
        prompt:
          "A focused chef in a crisp white double-breasted jacket plates a fine-dining dish in a sunlit professional kitchen, steam curling off the warm food as gloved hands set each element with tweezers. Bright late-morning light pours through a tall window camera-right, glinting off polished steel surfaces and copper pans hanging behind. Close-up on a 50mm lens, shallow depth of field with creamy bokeh, warm natural color, soft rim light on the rising steam, photoreal, food-cinematography look.",
        atChunk: 0,
      },
      {
        kind: "shot",
        prompt:
          "The same chef and dish in the same sunlit kitchen — the camera pushes in slowly on the plate as fragrant steam curls upward through the warm window light, and the chef's hands move into frame to scatter a final pinch of fresh green herbs that drift down onto the food. Macro detail, very shallow depth of field, dust-fine particles catching the light, warm golden tones, gentle handheld micro-movement, photoreal.",
        atChunk: 16,
      },
      {
        kind: "shot",
        prompt:
          "Overhead top-down shot of the same finished plate resting on the brushed-steel counter in the same warm kitchen light, the chef's hands entering frame to wipe a faint smudge from the rim of the white plate with a folded cloth, then withdrawing. Symmetrical flat-lay composition, soft directional window light from one side, rich saturated food colors against neutral steel, crisp focus, photoreal, elegant.",
        atChunk: 32,
      },
    ],
  },
  {
    id: "wildlife",
    label: "Wildlife montage",
    description: "Hard cuts across animals in natural settings — LongLive's strength.",
    beats: [
      {
        kind: "shot",
        prompt:
          "A powerful Bengal tiger prowls slowly through tall sun-bleached savanna grass at golden hour, the muscles rolling beneath its orange-and-black striped fur, amber eyes fixed dead ahead, whiskers and breath catching the light. Warm low sunlight rakes through the swaying grass and backlights drifting seed-fluff and tiny insects in the air. Long telephoto lens, very shallow depth of field, slow tracking dolly moving alongside the cat, rich golden-amber palette, exquisitely fine fur detail, photoreal nature-documentary look.",
        atChunk: 0,
      },
      {
        kind: "cut",
        prompt:
          "A pod of bottlenose dolphins leaps in unison through the glittering turquoise surface of a calm open ocean, sleek grey bodies arcing clear of the water and slicing back under, sheets of spray catching the bright midday sun and scattering into rainbow mist. Low angle just above the waterline, crisp high-shutter clarity on every droplet, deep blue-green palette with sparkling specular highlights, dynamic and joyful, photoreal wildlife cinematography.",
        atChunk: 10,
      },
      {
        kind: "cut",
        prompt:
          "A herd of African elephants — towering adults sheltering a small calf — wade and drink at a broad watering hole at sunset, trunks curling up to spray arcs of water over dusty backs, warm orange light shimmering across the rippled surface, flat-topped acacia trees silhouetted on the distant horizon. Wide cinematic shot, golden-hour backlight, fine dust and mist hanging in the air, earthy amber and umber tones, serene and majestic, photoreal.",
        atChunk: 20,
      },
      {
        kind: "cut",
        prompt:
          "A bald eagle soars on broad outstretched wings over snow-capped mountain peaks and dark evergreen forest, its white head turning to scan a glacial valley far below, individual feathers ruffling in the cold high-altitude wind. Sweeping aerial tracking shot gliding beside the bird, crisp clear mountain light, cool blue-and-white palette with razor-sharp detail, epic and free, photoreal wildlife cinematography.",
        atChunk: 30,
      },
    ],
  },
];

export function findStoryboard(id: string): PresetStoryboard | null {
  return STORYBOARDS.find((s) => s.id === id) ?? null;
}
