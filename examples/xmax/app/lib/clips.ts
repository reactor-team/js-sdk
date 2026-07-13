export interface PresetClip {
  id: string;
  label: string;
  src: string;
}

// The model's own demo source videos, matching its validation samples. Each
// pairs with a demo prompt chip: ball + "swap object for character" (kitten
// reference), hand + "character in scene" (pick any reference), woman +
// "replace with reference" (knight reference), and man_static + "follow the
// drag" (steer with the pointer instead of a reference image).
export const PRESET_CLIPS: readonly PresetClip[] = [
  {
    id: "ball",
    label: "Plush ball (swap object)",
    src: "/clips/ball.mp4",
  },
  {
    id: "hand",
    label: "Hand (character in scene)",
    src: "/clips/hand.mp4",
  },
  {
    id: "woman",
    label: "Woman (replace with reference)",
    src: "/clips/woman.mp4",
  },
  {
    id: "man-static",
    label: "Man, still (drag to animate)",
    src: "/clips/man_static.mp4",
  },
] as const;

export interface PresetImage {
  id: string;
  label: string;
  src: string;
}

// Demo images. They double as image-mode sources (streamed as a constant
// feed for drag-to-animate) and as reference-image presets. The model's own
// validation images are third-party IP, so instead we ship generated
// originals: one clean single subject each, on a plain backdrop, so they
// isolate cleanly for a character swap and read well as a steerable subject.
export const PRESET_IMAGES: readonly PresetImage[] = [
  { id: "kitten", label: "Kitten", src: "/refs/kitten.jpg" },
  { id: "knight", label: "Knight", src: "/refs/knight.jpg" },
  { id: "wizard", label: "Wizard", src: "/refs/wizard.jpg" },
  { id: "dragon", label: "Dragon", src: "/refs/dragon.jpg" },
] as const;
