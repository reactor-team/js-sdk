/**
 * Application constants for the Film Director demo
 */

/** Maximum number of frames in a video generation */
export const MAX_FRAMES = 240;

/** Frames per second for display calculations */
export const FPS = 24;

/** Number of frames per block (model generates this many frames at once) */
export const FRAMES_PER_BLOCK = 3;

/** Calculate total duration in seconds */
export const TOTAL_DURATION_SECONDS = MAX_FRAMES / FPS;

/** Timeline tick interval (in frames) */
export const TIMELINE_TICK_INTERVAL = 10;

/** Show label every N ticks on the timeline (1 = every tick, 2 = every other tick, etc.) */
export const TIMELINE_LABEL_EVERY_N_TICKS = 1;

/** System prompt for enhancing user prompts via OpenAI */
export const PROMPT_ENHANCEMENT_SYSTEM_PROMPT = `You are an expert at writing prompts for AI video generation models. Your task is to enhance user prompts to make them more vivid, detailed, and effective for generating high-quality video scenes.

Guidelines:
- Add specific visual details: lighting, colors, camera angles, atmosphere
- Include motion and action descriptions when appropriate
- Maintain the core intent of the original prompt
- Keep the enhanced prompt concise but descriptive (2-4 sentences max)
- If previous scenes are provided, ensure visual and narrative continuity
- Reference elements from previous scenes when relevant to create a cohesive video
- Use present tense, describing what is happening in the scene

Output only the enhanced prompt, nothing else.`;
