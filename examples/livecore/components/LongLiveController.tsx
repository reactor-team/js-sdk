"use client";

import { useState, useEffect } from "react";
import { useReactor, useReactorMessage } from "@reactor-team/js-sdk";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PromptSuggestions } from "./PromptSuggestions";
import { cn } from "@/lib/utils";
import type { StoryPrompt } from "@/lib/prompts";

interface LongLiveControllerProps {
  className?: string;
}

// Types for the LongLive model message protocol
interface ModelState {
  current_frame: number;
  current_prompt: string | null;
  paused: boolean;
  scheduled_prompts: Record<number, string>;
}

interface StateMessage {
  type: "state";
  data: ModelState;
}

interface EventMessage {
  type: "event";
  data: {
    event: string;
    frame?: number;
    message?: string;
    new_prompt?: string;
    previous_prompt?: string;
  };
}

type LongLiveMessage = StateMessage | EventMessage;

/**
 * LongLiveController
 *
 * A simple prompt input component for the LongLive model that:
 * - Tracks the current frame position from state messages
 * - Automatically calculates timestamps for prompts (0 for first, currentFrame + 3 for subsequent)
 * - Sends "schedule_prompt" messages to queue prompts at specific frames
 * - Sends a "start" message on the first prompt to begin video generation
 * - Displays the current frame number and paused state to help users understand the generation status
 */
export function LongLiveController({ className }: LongLiveControllerProps) {
  const [prompt, setPrompt] = useState("");
  // Track the current frame position in the video generation
  const [currentFrame, setCurrentFrame] = useState(0);
  // Track the selected story and current step
  const [selectedStoryId, setSelectedStoryId] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  // Track the current active prompt (from model state)
  const [currentPrompt, setCurrentPrompt] = useState<string | null>(null);
  // Track paused state
  const [isPaused, setIsPaused] = useState(true);
  // Track scheduled prompts
  const [scheduledPrompts, setScheduledPrompts] = useState<
    Record<number, string>
  >({});

  // Get sendMessage function and connection status from Reactor state
  const { sendCommand, status } = useReactor((state) => ({
    sendCommand: state.sendCommand,
    status: state.status,
  }));

  // Listen for messages from the LongLive model
  useReactorMessage((message: LongLiveMessage) => {
    if (message?.type === "state") {
      // Handle state messages - update all state from the model
      const state = message.data;
      setCurrentFrame(state.current_frame);
      setCurrentPrompt(state.current_prompt);
      setIsPaused(state.paused);
      setScheduledPrompts(state.scheduled_prompts);
    } else if (message?.type === "event") {
      // Handle event messages
      const event = message.data;
      console.log("LongLive event:", event.event, event);

      if (event.event === "error") {
        // Show error to user
        console.error("LongLive error:", event.message);
      }
    }
  });

  // Reset all UI state to initial values
  const resetUIState = () => {
    setPrompt("");
    setCurrentFrame(0);
    setSelectedStoryId(null);
    setCurrentStep(0);
    setCurrentPrompt(null);
    setIsPaused(true);
    setScheduledPrompts({});
  };

  // Reset the frame counter and story progress when we disconnect from the model
  useEffect(() => {
    if (status === "disconnected") {
      resetUIState();
    }
  }, [status]);

  const handleSubmitPrompt = async (promptText: string) => {
    if (!promptText.trim()) return;

    // Calculate the timestamp for this prompt:
    // - First prompt (frame 0): use timestamp 0 to start from the beginning
    // - Subsequent prompts: use current frame + 3 to avoid conflicts with the current generation
    const timestamp = currentFrame === 0 ? 0 : currentFrame + 3;

    // Send the prompt with the calculated timestamp
    await sendCommand("schedule_prompt", {
      new_prompt: promptText.trim(),
      timestamp: timestamp,
    });

    // On the first prompt, also send a "start" message to begin the generation process
    if (currentFrame === 0) {
      await sendCommand("start", {});
    }
  };

  const handlePromptSelect = async (
    storyId: string,
    storyPrompt: StoryPrompt,
    step: number
  ) => {
    // Set the selected story and step
    setSelectedStoryId(storyId);
    setCurrentStep(step);

    // Submit the prompt
    await handleSubmitPrompt(storyPrompt.prompt);
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    await handleSubmitPrompt(prompt);
    setPrompt("");
  };

  // Send reset message to restart the model and reset UI state
  const handleReset = async () => {
    try {
      await sendCommand("reset", {});
      resetUIState();
      console.log("Reset message sent");
    } catch (error) {
      console.error("Failed to send reset:", error);
    }
  };

  // Toggle pause/resume
  const handlePauseResume = async () => {
    try {
      if (isPaused) {
        await sendCommand("resume", {});
        console.log("Resume message sent");
      } else {
        await sendCommand("pause", {});
        console.log("Pause message sent");
      }
    } catch (error) {
      console.error("Failed to send pause/resume:", error);
    }
  };

  const isReady = status === "ready";

  return (
    <div
      className={cn("w-full p-3 bg-card rounded-lg border border-border space-y-2.5", className)}
    >
      {/* Header with Frame Counter and Reset */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs font-medium text-foreground uppercase">Prompts</span>
          <div className={cn(
            "flex items-center gap-1.5 px-2 py-1 rounded",
            currentFrame >= 220 ? "bg-destructive/10" : "bg-muted"
          )}>
            <span className="text-xs text-muted-foreground">Frame:</span>
            <span className={cn(
              "text-xs font-mono tabular-nums",
              currentFrame >= 220 ? "text-destructive" : "text-green-500"
            )}>{currentFrame}</span>
            <span className="text-xs text-muted-foreground">/</span>
            <span className="text-xs text-muted-foreground tabular-nums">240</span>
          </div>
          {/* Reset warning */}
          {currentFrame >= 200 && (
            <div className="flex items-center gap-1.5 px-2 py-1 bg-orange-500/10 text-orange-500 rounded">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span className="text-xs uppercase">Resets soon</span>
            </div>
          )}
          {/* Paused/Running indicator */}
          <div
            className={cn(
              "flex items-center gap-1.5 px-2 py-1 rounded",
              isPaused
                ? "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400"
                : "bg-green-500/10 text-green-600 dark:text-green-400"
            )}
          >
            <div
              className={cn(
                "w-1.5 h-1.5 rounded-full",
                isPaused ? "bg-yellow-500" : "bg-green-500 animate-pulse"
              )}
            />
            <span className="text-xs uppercase">
              {isPaused ? "Paused" : "Running"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="xs"
            variant="secondary"
            onClick={handlePauseResume}
            disabled={!isReady || currentFrame === 0}
          >
            {isPaused ? "Resume" : "Pause"}
          </Button>
          <Button
            size="xs"
            variant="destructive"
            onClick={handleReset}
            disabled={!isReady}
          >
            Reset
          </Button>
        </div>
      </div>

      {/* Current Prompt Display */}
      {currentPrompt && (
        <div className="bg-muted rounded px-2 py-1.5 border border-border">
          <div className="flex gap-2">
            <span className="text-[11px] text-muted-foreground flex-shrink-0">Current:</span>
            <span className="text-[11px] text-foreground/70 line-clamp-1">{currentPrompt}</span>
          </div>
        </div>
      )}

      {/* Prompt Suggestions */}
      <PromptSuggestions
        selectedStoryId={selectedStoryId}
        currentStep={currentStep}
        onPromptSelect={handlePromptSelect}
        disabled={!isReady}
      />

      {/* Manual Input */}
      <form onSubmit={handleManualSubmit} className="flex gap-2">
        <Input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Or write your own prompt..."
          disabled={!isReady}
          className="flex-1 h-8 text-sm"
        />
        <Button
          type="submit"
          size="sm"
          variant="default"
          disabled={!prompt.trim() || !isReady}
        >
          Send
        </Button>
      </form>

      {/* Frame limit notice */}
      <p className="text-[11px] text-muted-foreground leading-tight">
        Auto-resets after <span className="font-mono font-medium text-foreground/70">240 frames</span>. Use Reset to start a new session.
      </p>
    </div>
  );
}
