"use client";

import { useState } from "react";
import { useReactor } from "@reactor-team/js-sdk";

interface CachePurgeProps {
  className?: string;
}

export function CachePurge({ className = "" }: CachePurgeProps) {
  const { sendMessage, status } = useReactor((state) => ({
    sendMessage: state.sendMessage,
    status: state.status,
  }));

  const [strength, setStrength] = useState(1);
  const [isSending, setIsSending] = useState(false);

  const handlePurge = async () => {
    if (status !== "ready") return;

    setIsSending(true);
    try {
      await sendMessage({
        type: "purge_cache",
        data: { strength: Math.round(strength) },
      });
      console.log("Purge cache command sent with strength:", strength);
    } catch (error) {
      console.error("Failed to purge cache:", error);
    } finally {
      setTimeout(() => setIsSending(false), 500);
    }
  };

  const isDisabled = status !== "ready";

  return (
    <div
      className={`bg-gray-900/40 rounded-lg p-3 sm:p-4 border border-gray-700/30 ${className} ${
        isDisabled ? "opacity-50 pointer-events-none" : ""
      }`}
    >
      <div className="flex items-center gap-4">
        <div className="flex-1 flex flex-col gap-1">
          <div className="flex justify-between text-xs text-gray-400">
            <span>Purge Strength</span>
            <span>{strength}</span>
          </div>
          <input
            type="range"
            min="0"
            max="3"
            step="1"
            value={strength}
            onChange={(e) => setStrength(parseFloat(e.target.value))}
            className="w-full h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-red-500"
            disabled={isDisabled}
          />
        </div>
        <button
          onClick={handlePurge}
          disabled={isDisabled || isSending}
          className="px-4 py-2 rounded-md bg-red-600/20 text-red-400 border border-red-600/30 hover:bg-red-600/30 active:scale-95 transition-all duration-200 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap h-full flex items-center"
        >
          {isSending ? "Purging..." : "Purge Cache"}
        </button>
      </div>
    </div>
  );
}

