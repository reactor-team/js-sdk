export interface PromptExample {
  label: string;
  prompt: string;
}

// Prompt chips derived from the model's own demo prompts (originally in
// Chinese). Each pairs with a demo source clip:
// 1 -> ball.mp4 + a reference image, 2 -> dog.mp4 + a reference image,
// 3 -> figure.mp4 + the drag pointer.
export const PROMPT_EXAMPLES: readonly PromptExample[] = [
  {
    label: "Swap object for character",
    prompt:
      "the specified character replaces the red rubber ball and interacts with the scene",
  },
  {
    label: "Replace with reference",
    prompt:
      "replace the subject in the video with the character from the reference image",
  },
  {
    label: "Follow the drag",
    prompt: "the subject in the video follows the drag trajectory",
  },
] as const;
