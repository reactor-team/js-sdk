"use client";

import { Play, Pause, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface TransportControlsProps {
  isPlaying: boolean;
  isPaused: boolean;
  canStart: boolean;
  isConnected: boolean;
  onPlay: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  className?: string;
}

export function TransportControls({
  isPlaying,
  isPaused,
  canStart,
  isConnected,
  onPlay,
  onPause,
  onResume,
  onStop,
  className,
}: TransportControlsProps) {
  const handlePlayPause = () => {
    if (!isPlaying) {
      // Not started yet (or after reset) - start playback
      onPlay();
    } else if (isPaused) {
      // Started but paused - resume
      onResume();
    } else {
      // Currently playing - pause
      onPause();
    }
  };

  const showPlay = !isPlaying || isPaused;
  const isPlayDisabled = !isConnected || (!canStart && !isPlaying);

  // Determine the tooltip text for the play button
  const getPlayTooltip = () => {
    if (!isConnected) {
      return "Connect first";
    }
    if (!canStart && !isPlaying) {
      return "Add a prompt at frame 0 to start";
    }
    if (showPlay) {
      // Show "Resume" only if we were playing and paused, otherwise "Play"
      return isPlaying && isPaused ? "Resume" : "Play";
    }
    return "Pause";
  };

  return (
    <div className={cn("flex items-center gap-1", className)}>
      {/* Play/Pause button */}
      <div className="relative group">
        <Button
          size="icon"
          variant="outline"
          onClick={handlePlayPause}
          disabled={isPlayDisabled}
          className="h-10 w-10 text-foreground"
        >
          {showPlay ? (
            <Play className="h-5 w-5 fill-current text-foreground" />
          ) : (
            <Pause className="h-5 w-5 fill-current text-foreground" />
          )}
        </Button>
        {/* Custom tooltip */}
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-popover border border-border rounded text-xs text-foreground whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
          {getPlayTooltip()}
        </div>
      </div>

      {/* Stop/Reset button */}
      <div className="relative group">
        <Button
          size="icon"
          variant="outline"
          onClick={onStop}
          disabled={!isConnected}
          className="h-10 w-10 text-foreground"
        >
          <Square className="h-4 w-4 fill-current text-foreground" />
        </Button>
        {/* Custom tooltip */}
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-popover border border-border rounded text-xs text-foreground whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
          {!isConnected ? "Connect first" : "Reset"}
        </div>
      </div>
    </div>
  );
}
