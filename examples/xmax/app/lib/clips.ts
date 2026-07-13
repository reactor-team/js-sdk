export interface PresetClip {
  id: string;
  label: string;
  src: string;
}

// Demo source videos - generated originals, no third-party footage (see
// public/clips/CREDITS.md). Each pairs with a demo prompt chip: ball +
// "swap object for character", dog + "replace with reference", and figure +
// "follow the drag" (steer the still figure with the pointer instead of a
// reference image).
export const PRESET_CLIPS: readonly PresetClip[] = [
  {
    id: "ball",
    label: "Red ball (swap object)",
    src: "/clips/ball.mp4",
  },
  {
    id: "dog",
    label: "Dog (replace with reference)",
    src: "/clips/dog.mp4",
  },
  {
    id: "figure",
    label: "Figure (drag to animate)",
    src: "/clips/figure.mp4",
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
