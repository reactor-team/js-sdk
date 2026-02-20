"use client";

import { useCallback, useRef, useState, memo, useMemo } from "react";
import { MAX_FRAMES, FPS } from "@/lib/constants";
import { TimelineRuler } from "./TimelineRuler";
import { PromptMarker } from "./PromptMarker";
import { Playhead } from "./Playhead";
import { PromptEditor } from "./PromptEditor";
import { cn } from "@/lib/utils";

interface TimelineProps {
  currentFrame: number;
  currentPrompt: string | null;
  scheduledPrompts: Record<number, string>;
  maxFrames?: number;
  onAddPrompt: (frame: number, prompt: string) => void;
  onEditPrompt: (frame: number, prompt: string) => void;
  onDeletePrompt: (frame: number) => void;
  disabled?: boolean;
  className?: string;
}

function TimelineComponent({
  currentFrame,
  currentPrompt: _currentPrompt, // Reserved for future use
  scheduledPrompts,
  maxFrames = MAX_FRAMES,
  onAddPrompt,
  onEditPrompt,
  onDeletePrompt,
  disabled = false,
  className,
}: TimelineProps) {
  void _currentPrompt; // Suppress unused warning
  const trackRef = useRef<HTMLDivElement>(null);

  // Editor state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingFrame, setEditingFrame] = useState(0);
  const [editingPrompt, setEditingPrompt] = useState("");
  const [isEditMode, setIsEditMode] = useState(false);

  // Hover tooltip state - store position calculated during event handler
  const [hoverFrame, setHoverFrame] = useState<number | null>(null);
  const [hoverY, setHoverY] = useState(0);
  const [tooltipX, setTooltipX] = useState(0);

  // Find which prompt is currently active (largest frame <= currentFrame)
  const activePromptFrame = useMemo(() => {
    const frames = Object.keys(scheduledPrompts)
      .map(Number)
      .filter((f) => f <= currentFrame)
      .sort((a, b) => b - a);
    return frames[0] ?? null;
  }, [scheduledPrompts, currentFrame]);

  // Calculate frame from mouse position
  const getFrameFromMouseEvent = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!trackRef.current) return null;

      const rect = trackRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percentage = x / rect.width;
      const frame = Math.round(percentage * maxFrames);

      // Clamp to valid range
      return Math.max(0, Math.min(maxFrames - 1, frame));
    },
    [maxFrames]
  );

  // Handle mouse move for hover tooltip
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const frame = getFrameFromMouseEvent(e);
      if (frame !== null && trackRef.current) {
        setHoverFrame(frame);
        setHoverY(e.clientY);
        // Calculate tooltip X position here (in event handler) instead of during render
        const rect = trackRef.current.getBoundingClientRect();
        setTooltipX(rect.left + (frame / maxFrames) * rect.width);
      }
    },
    [getFrameFromMouseEvent, maxFrames]
  );

  // Handle mouse leave
  const handleMouseLeave = useCallback(() => {
    setHoverFrame(null);
  }, []);

  // Handle clicking on the timeline track to add a new prompt
  const handleTrackClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (disabled) return;

      const clampedFrame = getFrameFromMouseEvent(e);
      if (clampedFrame === null) return;

      // Check if there's already a prompt at this frame (within 5 frame tolerance)
      const existingFrame = Object.keys(scheduledPrompts)
        .map(Number)
        .find((f) => Math.abs(f - clampedFrame) < 5);

      if (existingFrame !== undefined) {
        // Edit existing prompt
        setEditingFrame(existingFrame);
        setEditingPrompt(scheduledPrompts[existingFrame]);
        setIsEditMode(true);
      } else {
        // Add new prompt
        setEditingFrame(clampedFrame);
        setEditingPrompt("");
        setIsEditMode(false);
      }

      setEditorOpen(true);
    },
    [disabled, getFrameFromMouseEvent, scheduledPrompts]
  );

  // Handle clicking on an existing marker
  const handleMarkerClick = useCallback(
    (frame: number) => {
      if (disabled) return;

      setEditingFrame(frame);
      setEditingPrompt(scheduledPrompts[frame] || "");
      setIsEditMode(true);
      setEditorOpen(true);
    },
    [disabled, scheduledPrompts]
  );

  // Handle saving a prompt
  const handleSave = useCallback(
    (frame: number, prompt: string) => {
      if (isEditMode) {
        onEditPrompt(frame, prompt);
      } else {
        onAddPrompt(frame, prompt);
      }
    },
    [isEditMode, onAddPrompt, onEditPrompt]
  );

  // Sorted prompt frames for rendering
  const sortedPromptFrames = useMemo(() => {
    return Object.keys(scheduledPrompts)
      .map(Number)
      .sort((a, b) => a - b);
  }, [scheduledPrompts]);

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Ruler */}
      <TimelineRuler maxFrames={maxFrames} />

      {/* Track container with padding */}
      <div
        className={cn(
          "px-6 flex-1 min-h-[64px] bg-card/50 border-b border-border",
          disabled && "opacity-50"
        )}
      >
        <div
          ref={trackRef}
          className={cn("relative h-full", disabled ? "cursor-not-allowed" : "cursor-crosshair")}
          onClick={handleTrackClick}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          {/* Prompt segments - show colored regions between prompts */}
          {sortedPromptFrames.map((frame, index) => {
            const nextFrame = sortedPromptFrames[index + 1] ?? maxFrames;
            const startPercent = (frame / maxFrames) * 100;
            const widthPercent = ((nextFrame - frame) / maxFrames) * 100;
            const isActive = frame === activePromptFrame;

            return (
              <div
                key={frame}
                className={cn(
                  "absolute top-2 bottom-2 rounded-sm transition-colors overflow-hidden",
                  isActive
                    ? "bg-primary/30 border border-primary/50"
                    : "bg-blue-500/20 border border-blue-500/30"
                )}
                style={{
                  left: `${startPercent}%`,
                  width: `${widthPercent}%`,
                }}
              >
                <span
                  className="absolute inset-1 text-[10px] text-foreground/70 leading-tight overflow-hidden"
                  style={{
                    display: "-webkit-box",
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: "vertical",
                  }}
                >
                  {scheduledPrompts[frame]}
                </span>
              </div>
            );
          })}

          {/* Prompt markers */}
          {sortedPromptFrames.map((frame) => (
            <PromptMarker
              key={frame}
              frame={frame}
              prompt={scheduledPrompts[frame]}
              maxFrames={maxFrames}
              isActive={frame === activePromptFrame}
              onClick={() => handleMarkerClick(frame)}
            />
          ))}

          {/* Playhead */}
          <Playhead frame={currentFrame} maxFrames={maxFrames} />

          {/* Hover indicator line */}
          {hoverFrame !== null && (
            <div
              className="absolute top-0 bottom-0 w-px bg-foreground/30 pointer-events-none z-10"
              style={{ left: `${(hoverFrame / maxFrames) * 100}%` }}
            />
          )}
        </div>
      </div>

      {/* Hover tooltip - rendered outside track to avoid clipping */}
      {hoverFrame !== null && (
        <div
          className="fixed z-50 pointer-events-none"
          style={{
            left: tooltipX,
            top: hoverY - 40,
            transform: "translateX(-50%)",
          }}
        >
          <div className="bg-popover border border-border rounded-md px-2 py-1 shadow-lg">
            <div className="text-xs font-mono text-foreground">
              <span className="font-medium">Frame {hoverFrame}</span>
              <span className="text-muted-foreground ml-2">({(hoverFrame / FPS).toFixed(1)}s)</span>
            </div>
          </div>
        </div>
      )}

      {/* Prompt Editor Dialog */}
      <PromptEditor
        open={editorOpen}
        frame={editingFrame}
        initialPrompt={editingPrompt}
        isEditing={isEditMode}
        previousPrompts={sortedPromptFrames.map((f) => ({ frame: f, prompt: scheduledPrompts[f] }))}
        onSave={handleSave}
        onDelete={onDeletePrompt}
        onClose={() => setEditorOpen(false)}
      />
    </div>
  );
}

export const Timeline = memo(TimelineComponent);
