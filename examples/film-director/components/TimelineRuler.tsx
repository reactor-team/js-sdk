"use client";

import { memo, useMemo } from "react";
import { MAX_FRAMES, TIMELINE_TICK_INTERVAL, TIMELINE_LABEL_EVERY_N_TICKS } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface TimelineRulerProps {
  maxFrames?: number;
  className?: string;
}

function TimelineRulerComponent({ 
  maxFrames = MAX_FRAMES,
  className 
}: TimelineRulerProps) {
  // Generate tick marks - memoized to prevent recalculation
  const ticks = useMemo(() => {
    const result: { frame: number; isMajor: boolean }[] = [];
    
    for (let frame = 0; frame <= maxFrames; frame += TIMELINE_TICK_INTERVAL) {
      const tickIndex = frame / TIMELINE_TICK_INTERVAL;
      const isMajor = tickIndex % TIMELINE_LABEL_EVERY_N_TICKS === 0;
      result.push({
        frame,
        isMajor,
      });
    }
    
    return result;
  }, [maxFrames]);

  return (
    <div className={cn("px-6 bg-card border-b border-border", className)}>
      <div className="relative h-6">
        {ticks.map(({ frame, isMajor }) => (
          <div
            key={frame}
            className="absolute top-0 flex flex-col items-center"
            style={{ left: `${(frame / maxFrames) * 100}%` }}
          >
            <div
              className={cn(
                "w-px bg-foreground/20",
                isMajor ? "h-3" : "h-2"
              )}
            />
            {isMajor && (
              <span className="text-[10px] text-foreground/60 mt-0.5 -translate-x-1/2">
                {frame}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Memoize to prevent unnecessary re-renders
export const TimelineRuler = memo(TimelineRulerComponent);
