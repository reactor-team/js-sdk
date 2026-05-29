// Preset storyboards for the LongLive 2 director example.
//
// A storyboard is an ordered list of beats: the first is the opening shot
// (fired with `set_shot` before `start`), the rest are scheduled against the
// cumulative `session_chunk` clock with `schedule_shot` (soft, same scene) or
// `schedule_scene_cut` (hard, new scene + fresh 48-chunk budget).
//
// Keep each scene's beats inside its 48-chunk budget, or put a cut before the
// ceiling — a beat scheduled past where its scene auto-completes never fires.
// Prompts are full paragraphs: subject, action, setting, camera, light.

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
          "A lone astronaut walks across a windswept red dune at golden hour, dust trailing from each step, a distant ringed planet low on the horizon. Wide cinematic tracking shot, shallow depth of field.",
        atChunk: 0,
      },
      {
        kind: "shot",
        prompt:
          "The camera pulls back and cranes up to reveal the astronaut is standing at the edge of a vast crater stretching to the horizon. Same golden light, slow aerial reveal.",
        atChunk: 20,
      },
      {
        kind: "cut",
        prompt:
          "A neon-lit Tokyo street at night, rain slicking the pavement, crowds passing under umbrellas, reflections of signage shimmering. Handheld, shallow focus.",
        atChunk: 40,
      },
      {
        kind: "cut",
        prompt:
          "An underwater coral reef in clear blue water, shafts of sunlight cutting down, a school of silver fish turning in unison. Slow drifting camera.",
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
          "A chef plates a dish in a sunlit restaurant kitchen, steam rising, hands precise. Close-up, warm window light, shallow depth of field.",
        atChunk: 0,
      },
      {
        kind: "shot",
        prompt:
          "The camera pushes in slowly on the steam curling off the plate, the chef's hands moving into frame to add a final garnish of herbs.",
        atChunk: 16,
      },
      {
        kind: "shot",
        prompt:
          "Overhead top-down shot of the finished plate on the steel counter, the chef wiping the rim clean with a cloth.",
        atChunk: 32,
      },
    ],
  },
  {
    id: "montage",
    label: "Beat-synced sports montage",
    description: "Tightly-spaced hard cuts for a rhythmic edit.",
    beats: [
      { kind: "shot", prompt: "Close-up of sneakers exploding off a running track, slow motion, stadium lights.", atChunk: 0 },
      { kind: "cut", prompt: "A swimmer diving into a glassy pool, bubbles trailing, underwater angle.", atChunk: 10 },
      { kind: "cut", prompt: "A cyclist cresting a hill against a bright sky, low angle, wheels spinning.", atChunk: 20 },
      { kind: "cut", prompt: "A boxer throwing a punch in a dim gym, sweat and dust catching the light.", atChunk: 30 },
    ],
  },
];

export function findStoryboard(id: string): PresetStoryboard | null {
  return STORYBOARDS.find((s) => s.id === id) ?? null;
}
