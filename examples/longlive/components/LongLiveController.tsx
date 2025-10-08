"use client";

import { useState, useEffect } from "react";
import { useReactor, useReactorMessage } from "@reactor-team/js-sdk";

interface LongLiveControllerProps {
  className?: string;
}

/**
 * LongLiveController
 *
 * A simple prompt input component for the LongLive model that:
 * - Tracks the current frame position from progress messages
 * - Automatically calculates timestamps for prompts (0 for first, currentFrame + 3 for subsequent)
 * - Sends "schedule_prompt" messages to queue prompts at specific frames
 * - Sends a "start" message on the first prompt to begin video generation
 * - Displays the current frame number to help users understand where they are in the generation
 */
export function LongLiveController({ className }: LongLiveControllerProps) {
  const [prompt, setPrompt] = useState("");
  // Track the current frame position in the video generation
  const [currentStartFrame, setCurrentStartFrame] = useState(0);

  // Get sendMessage function and connection status from Reactor state
  const { sendMessage, status } = useReactor((state) => ({
    sendMessage: state.sendMessage,
    status: state.status,
  }));

  // Listen for progress messages from the LongLive model
  // These messages contain the current_start_frame which tells us where we are in the generation
  useReactorMessage((message: any) => {
    if (
      message?.type === "progress" &&
      message?.data?.current_start_frame !== undefined
    ) {
      setCurrentStartFrame(message.data.current_start_frame);
    }
  });

  // Reset the frame counter when we disconnect from the model
  useEffect(() => {
    if (status === "disconnected") {
      setCurrentStartFrame(0);
    }
  }, [status]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    // Calculate the timestamp for this prompt:
    // - First prompt (frame 0): use timestamp 0 to start from the beginning
    // - Subsequent prompts: use current frame + 3 to avoid conflicts with the current generation
    const timestamp = currentStartFrame === 0 ? 0 : currentStartFrame + 3;

    // Send the prompt with the calculated timestamp
    await sendMessage({
      type: "schedule_prompt",
      data: {
        new_prompt: prompt.trim(),
        timestamp: timestamp,
      },
    });

    // On the first prompt, also send a "start" message to begin the generation process
    if (currentStartFrame === 0) {
      await sendMessage({ type: "start" });
    }

    setPrompt("");
  };

  return (
    <div
      className={`bg-gray-900/40 rounded-lg p-3 border border-gray-700/30 ${className}`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-gray-400">Prompt</span>
        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-gray-800/50 rounded-md">
          <span className="text-xs text-gray-500">Frame:</span>
          <span className="text-xs font-semibold text-gray-300 tabular-nums">
            {currentStartFrame}
          </span>
        </div>
      </div>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Enter your prompt..."
          className="flex-1 px-3 py-2 bg-gray-800/50 border border-gray-700/50 rounded-md text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all duration-200"
          disabled={status === "disconnected"}
        />
        <button
          type="submit"
          disabled={!prompt.trim() || status === "disconnected"}
          className="px-5 py-2 bg-green-600/80 text-white rounded-md hover:bg-green-600 disabled:bg-gray-700/50 disabled:cursor-not-allowed transition-all duration-200 text-xs font-medium"
        >
          Send
        </button>
      </form>
    </div>
  );
}
