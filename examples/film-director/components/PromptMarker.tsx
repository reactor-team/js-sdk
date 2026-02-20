"use client";

import { memo } from "react";
import { cn } from "@/lib/utils";

interface PromptMarkerProps {
  frame: number;
  prompt: string;
  maxFrames: number;
  isActive: boolean;
  onClick: () => void;
  className?: string;
}

function PromptMarkerComponent({
  frame,
  prompt,
  maxFrames,
  isActive,
  onClick,
  className,
}: PromptMarkerProps) {
  const position = (frame / maxFrames) * 100;

  return (
    <div
      className={cn(
        "absolute top-0 bottom-0 cursor-pointer group",
        className
      )}
      style={{ left: `${position}%` }}
      onClick={onClick}
    >
      {/* Marker line */}
      <div
        className={cn(
          "absolute top-0 bottom-0 w-0.5 transition-colors",
          isActive ? "bg-primary" : "bg-blue-500/70 group-hover:bg-blue-500"
        )}
      />
      
      {/* Marker handle */}
      <div
        className={cn(
          "absolute -top-1 -translate-x-1/2 w-3 h-3 rounded-sm transition-all",
          isActive 
            ? "bg-primary scale-110" 
            : "bg-blue-500 group-hover:scale-110"
        )}
      />
      
      {/* Tooltip on hover */}
      <div className="absolute left-1/2 -translate-x-1/2 top-5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
        <div className="bg-popover border border-border rounded-md px-2 py-1 shadow-lg max-w-48">
          <p className="text-[10px] text-muted-foreground">Frame {frame}</p>
          <p className="text-xs truncate">{prompt}</p>
        </div>
      </div>
    </div>
  );
}

export const PromptMarker = memo(PromptMarkerComponent);
