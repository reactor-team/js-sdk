export interface PromptExample {
  label: string;
  prompt: string;
}

// English translations of the model's own demo prompts (its validation
// samples, originally in Chinese). Each pairs with a demo asset:
// 1 -> kitten.jpg + ball.mp4, 2 -> hand.mp4 + any reference image,
// 3 -> knight.jpg + woman.mp4, 4 -> man_static.mp4 + the drag pointer.
export const PROMPT_EXAMPLES: readonly PromptExample[] = [
  {
    label: "Swap object for character",
    prompt:
      "the specified character replaces the white plush ball and interacts with the scene",
  },
  {
    label: "Character in scene",
    prompt: "the specified character interacts with the scene",
  },
  {
    label: "Replace with reference",
    prompt:
      "replace the character in the video with the character from the reference image",
  },
  {
    label: "Follow the drag",
    prompt: "the character in the video follows the drag trajectory",
  },
] as const;
