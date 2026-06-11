export interface PromptExample {
  label: string;
  prompt: string;
}

export const PROMPT_EXAMPLES: readonly PromptExample[] = [
  {
    label: "Van Gogh",
    prompt:
      "Apply a Van Gogh oil painting style to this video, ensuring seamless temporal consistency across all frames. The output should emulate his Post-Impressionist canvases, with thick swirling impasto brushstrokes, vivid saturated blues and golden yellows, and visible directional paint texture. Preserve all original motion, character actions, camera movement, and composition, with no jarring frames.",
  },
  {
    label: "Neon Cyber",
    prompt:
      "Apply a neon cyberpunk style to this video, ensuring seamless temporal consistency across all frames. Bathe the scene in electric blue and magenta neon glow, with glossy reflective surfaces, deep shadows, and a hazy night-city atmosphere. Preserve all original motion, character actions, camera movement, and composition, with no jarring frames.",
  },
  {
    label: "Claymation",
    prompt:
      "Transform the entire scene into claymation stop-motion. Convert every figure and surface into soft hand-molded clay with subtle fingerprint textures and a matte sheen under warm studio light. Preserve the original composition, gestures, object layout, and temporal motion, maintaining seamless consistency across all frames.",
  },
  {
    label: "Pencil Sketch",
    prompt:
      "Apply a detailed pencil sketch style to this video, ensuring seamless temporal consistency across all frames. The output should look hand-drawn in graphite, with fine crosshatched shading, crisp contour lines, and a subtle paper-grain texture on a warm off-white ground. Preserve all original motion, character actions, camera movement, and composition, with no jarring frames.",
  },
  {
    label: "Golden Hour",
    prompt:
      "Apply a golden hour cinematic film look to this video, ensuring seamless temporal consistency across all frames. Grade the scene with warm amber tones, a soft sunlit haze, gentle bloom on highlights, and fine film grain. Preserve all original motion, character actions, camera movement, composition, and the existing lighting direction, with no jarring frames.",
  },
  {
    label: "Watercolor",
    prompt:
      "Apply a loose watercolor painting style to this video, ensuring seamless temporal consistency across all frames. The output should resemble a wet-on-wet watercolor wash, with soft bleeding edges, translucent layered pigment in a muted pastel palette, and visible cold-press paper texture. Preserve all original motion, character actions, camera movement, and composition, with no jarring frames.",
  },
] as const;
