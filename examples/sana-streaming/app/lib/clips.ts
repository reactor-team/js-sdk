export interface PresetClip {
  id: string;
  label: string;
  src: string;
  duration: number; // seconds
}

export const PRESET_CLIPS: readonly PresetClip[] = [
  {
    id: "replace-background-softly",
    label: "Background swap",
    src: "/clips/replace-background-softly.mp4",
    duration: 61,
  },
] as const;
