/**
 * Type definitions for the Film Director demo
 */

// ==================== Model Protocol Types ====================

export interface ModelState {
  current_frame: number;
  current_prompt: string | null;
  paused: boolean;
  scheduled_prompts: Record<number, string>;
}

export interface StateMessage {
  type: "state";
  data: ModelState;
}

export interface EventData {
  event: string;
  frame?: number;
  message?: string;
  new_prompt?: string;
  previous_prompt?: string;
}

export interface EventMessage {
  type: "event";
  data: EventData;
}

export type LongLiveMessage = StateMessage | EventMessage;

// ==================== Application Types ====================

export interface PromptMarker {
  frame: number;
  prompt: string;
}

export type ConnectionStatus = "disconnected" | "connecting" | "waiting" | "connected";

export type PlaybackState = "stopped" | "playing" | "paused";
