"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useReactor, useReactorMessage } from "@reactor-team/js-sdk";
import { MAX_FRAMES } from "@/lib/constants";
import type { LongLiveMessage } from "@/lib/types";
import { VideoPreview } from "./VideoPreview";
import { Timeline } from "./Timeline";
import { TransportControls } from "./TransportControls";
import { FrameDisplay } from "./FrameDisplay";
import { ResizableDivider } from "./ResizableDivider";
import { cn } from "@/lib/utils";

interface FilmDirectorProps {
  maxFrames?: number;
  className?: string;
}

export function FilmDirector({ 
  maxFrames = MAX_FRAMES,
  className 
}: FilmDirectorProps) {
  // Model state
  const [currentFrame, setCurrentFrame] = useState(0);
  const [currentPrompt, setCurrentPrompt] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(true);
  const [scheduledPrompts, setScheduledPrompts] = useState<Record<number, string>>({});
  const [isPlaying, setIsPlaying] = useState(false);

  // Get reactor methods and status
  const { sendCommand, status } = useReactor((state) => ({
    sendCommand: state.sendCommand,
    status: state.status,
  }));

  // The SDK uses "ready" as the connected status
  const isConnected = status === "ready";

  // Listen for messages from the model
  useReactorMessage((message: LongLiveMessage) => {
    if (message?.type === "state") {
      const state = message.data;
      setCurrentFrame(state.current_frame);
      setCurrentPrompt(state.current_prompt);
      setIsPaused(state.paused);
      setScheduledPrompts(state.scheduled_prompts);
      
      // Infer isPlaying directly from frame position
      // Frame 0 = not started/reset, Frame > 0 = generation in progress
      setIsPlaying(state.current_frame > 0);
    } else if (message?.type === "event") {
      const event = message.data;
      console.log("[FilmDirector] Event:", event.event, event);
      
      if (event.event === "generation_started") {
        setIsPlaying(true);
      } else if (event.event === "generation_reset") {
        setIsPlaying(false);
        setCurrentFrame(0);
        setCurrentPrompt(null);
        setScheduledPrompts({});
      } else if (event.event === "error") {
        console.error("[FilmDirector] Error:", event.message);
      }
    }
  });

  // Reset state when disconnected - use ref to track previous status
  // to avoid cascading renders from synchronous setState in effect
  const prevStatusRef = useRef(status);
  useEffect(() => {
    const wasConnected = prevStatusRef.current !== "disconnected";
    const isNowDisconnected = status === "disconnected";
    prevStatusRef.current = status;
    
    // Only reset if we transitioned from connected to disconnected
    if (wasConnected && isNowDisconnected) {
      // Use a microtask to avoid synchronous setState in effect body
      queueMicrotask(() => {
        setCurrentFrame(0);
        setCurrentPrompt(null);
        setIsPaused(true);
        setScheduledPrompts({});
        setIsPlaying(false);
      });
    }
  }, [status]);

  // Transport controls handlers
  const handlePlay = useCallback(async () => {
    // Check if we have a prompt at frame 0
    if (!(0 in scheduledPrompts)) {
      console.warn("[FilmDirector] Cannot start: No prompt at frame 0");
      return;
    }
    
    try {
      await sendCommand("start", {});
    } catch (error) {
      console.error("[FilmDirector] Failed to start:", error);
    }
  }, [sendCommand, scheduledPrompts]);

  const handlePause = useCallback(async () => {
    try {
      await sendCommand("pause", {});
    } catch (error) {
      console.error("[FilmDirector] Failed to pause:", error);
    }
  }, [sendCommand]);

  const handleResume = useCallback(async () => {
    try {
      await sendCommand("resume", {});
    } catch (error) {
      console.error("[FilmDirector] Failed to resume:", error);
    }
  }, [sendCommand]);

  const handleStop = useCallback(async () => {
    try {
      await sendCommand("reset", {});
    } catch (error) {
      console.error("[FilmDirector] Failed to reset:", error);
    }
  }, [sendCommand]);

  // Prompt management handlers
  const handleAddPrompt = useCallback(async (frame: number, prompt: string) => {
    try {
      await sendCommand("schedule_prompt", {
        new_prompt: prompt,
        timestamp: frame,
      });
      
      // Optimistically update local state
      setScheduledPrompts(prev => ({
        ...prev,
        [frame]: prompt,
      }));
    } catch (error) {
      console.error("[FilmDirector] Failed to add prompt:", error);
    }
  }, [sendCommand]);

  const handleEditPrompt = useCallback(async (frame: number, prompt: string) => {
    // For editing, we just schedule the new prompt at the same frame
    // The model will overwrite the existing one
    try {
      await sendCommand("schedule_prompt", {
        new_prompt: prompt,
        timestamp: frame,
      });
      
      // Optimistically update local state
      setScheduledPrompts(prev => ({
        ...prev,
        [frame]: prompt,
      }));
    } catch (error) {
      console.error("[FilmDirector] Failed to edit prompt:", error);
    }
  }, [sendCommand]);

  const handleDeletePrompt = useCallback((frame: number) => {
    // Note: The model doesn't support deleting prompts directly
    // We just remove it from local state - it will be gone on next reset
    setScheduledPrompts(prev => {
      const next = { ...prev };
      delete next[frame];
      return next;
    });
    console.warn("[FilmDirector] Prompt deleted locally. Reset to sync with model.");
  }, []);

  // Can we start playback?
  const canStart = 0 in scheduledPrompts;

  // Resizable panel state - timeline height in pixels
  const containerRef = useRef<HTMLDivElement>(null);
  const [timelineHeight, setTimelineHeight] = useState(200);
  const minTimelineHeight = 120;
  const maxTimelineHeight = 500;

  const handleResize = useCallback((deltaY: number) => {
    setTimelineHeight(prev => {
      const newHeight = prev - deltaY;
      return Math.max(minTimelineHeight, Math.min(maxTimelineHeight, newHeight));
    });
  }, []);

  return (
    <div ref={containerRef} className={cn("flex flex-col h-full bg-background", className)}>
      {/* Video preview area - takes remaining space */}
      <div className="flex-1 min-h-0 p-2 pb-1">
        <VideoPreview
          currentFrame={currentFrame}
          isPaused={isPaused}
          className="w-full h-full"
        />
      </div>

      {/* Current prompt display - single line, truncated */}
      <div className="px-4 pb-1">
        <div className="bg-card border border-border rounded px-3 py-1.5 flex items-center gap-2 min-w-0">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide shrink-0">
            Prompt
          </span>
          <p className="text-xs text-foreground truncate min-w-0 flex-1">
            {currentPrompt || (
              <span className="text-muted-foreground italic">
                No prompt — click the timeline to add one at frame 0
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Resizable divider */}
      <ResizableDivider onResize={handleResize} />

      {/* Bottom panel with controls and timeline */}
      <div 
        className="flex flex-col border-t border-border"
        style={{ height: timelineHeight }}
      >
        {/* Control bar */}
        <div className="flex items-center gap-4 px-4 py-2 bg-card border-b border-border shrink-0">
          <TransportControls
            isPlaying={isPlaying}
            isPaused={isPaused}
            canStart={canStart}
            isConnected={isConnected}
            onPlay={handlePlay}
            onPause={handlePause}
            onResume={handleResume}
            onStop={handleStop}
          />
          
          <div className="h-6 w-px bg-border" />
          
          <FrameDisplay currentFrame={currentFrame} maxFrames={maxFrames} />
          
          <div className="flex-1" />
        </div>

        {/* Timeline - takes remaining space in panel */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <Timeline
            currentFrame={currentFrame}
            currentPrompt={currentPrompt}
            scheduledPrompts={scheduledPrompts}
            maxFrames={maxFrames}
            onAddPrompt={handleAddPrompt}
            onEditPrompt={handleEditPrompt}
            onDeletePrompt={handleDeletePrompt}
            disabled={!isConnected}
            className="h-full"
          />
        </div>
      </div>
    </div>
  );
}
