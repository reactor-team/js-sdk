"use client";

import { memo } from "react";
import { MAX_FRAMES, FPS } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface FrameDisplayProps {
  currentFrame: number;
  maxFrames?: number;
  className?: string;
}

function FrameDisplayComponent({ 
  currentFrame, 
  maxFrames = MAX_FRAMES,
  className 
}: FrameDisplayProps) {
  const seconds = Math.floor(currentFrame / FPS);
  const frames = currentFrame % FPS;
  const totalSeconds = Math.floor(maxFrames / FPS);

  return (
    <div className={cn("flex items-center gap-4 font-mono text-sm text-foreground", className)}>
      {/* Timecode */}
      <div className="flex items-baseline gap-1">
        <span className="tabular-nums font-medium">
          {seconds.toString().padStart(2, "0")}:{frames.toString().padStart(2, "0")}
        </span>
        <span className="text-muted-foreground text-xs">
          / {totalSeconds}s
        </span>
      </div>
      
      {/* Frame counter */}
      <div className="flex items-baseline gap-1">
        <span className="text-muted-foreground text-xs">Frame</span>
        <span className="tabular-nums font-medium">{currentFrame}</span>
        <span className="text-muted-foreground text-xs">/ {maxFrames}</span>
      </div>
    </div>
  );
}

export const FrameDisplay = memo(FrameDisplayComponent);
