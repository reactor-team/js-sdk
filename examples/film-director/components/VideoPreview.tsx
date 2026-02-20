"use client";

import { ReactorView } from "@reactor-team/js-sdk";
import { cn } from "@/lib/utils";
import { FPS } from "@/lib/constants";

interface VideoPreviewProps {
  currentFrame: number;
  isPaused: boolean;
  className?: string;
}

export function VideoPreview({ 
  currentFrame, 
  isPaused,
  className 
}: VideoPreviewProps) {
  // Calculate timecode
  const seconds = Math.floor(currentFrame / FPS);
  const frames = currentFrame % FPS;
  const timecode = `${seconds.toString().padStart(2, "0")}:${frames.toString().padStart(2, "0")}`;

  return (
    <div className={cn("relative bg-black rounded-lg overflow-hidden", className)}>
      {/* Video view */}
      <ReactorView className="w-full h-full object-contain" />
      
      {/* Overlay - timecode and status */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
        <div className="flex items-center justify-between">
          {/* Timecode */}
          <div className="flex items-center gap-3">
            <span className="font-mono text-white text-lg tabular-nums">
              {timecode}
            </span>
            <span className="text-white/60 text-sm">
              Frame {currentFrame}
            </span>
          </div>
          
          {/* Status indicator */}
          <div className="flex items-center gap-2">
            {isPaused ? (
              <span className="text-yellow-400 text-sm flex items-center gap-1.5">
                <span className="w-2 h-2 bg-yellow-400 rounded-full" />
                Paused
              </span>
            ) : (
              <span className="text-green-400 text-sm flex items-center gap-1.5">
                <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                Playing
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
