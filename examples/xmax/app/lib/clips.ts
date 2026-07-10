export interface PresetClip {
  id: string;
  label: string;
  src: string;
}

// The model's own demo source videos, matching its validation samples. Each
// pairs with a demo prompt chip: ball + "swap object for character" (rabbit
// reference), hand + "character in scene" (ball-roller reference), woman +
// "replace with reference" (bear reference), and man_static + "follow the
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

// The model's demo images. They double as image-mode sources (streamed as a
// constant feed for drag-to-animate) and as reference-image presets.
export const PRESET_IMAGES: readonly PresetImage[] = [
  { id: "rabbit", label: "Rabbit", src: "/refs/rabbit.jpg" },
  { id: "gunqiushou", label: "Ball-roller", src: "/refs/gunqiushou.jpg" },
  { id: "bear", label: "Bear", src: "/refs/bear.jpg" },
] as const;
