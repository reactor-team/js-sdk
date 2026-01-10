"use client";

import { useState } from "react";
import { useReactor } from "@reactor-team/js-sdk";

interface PromptInputProps {
  className?: string;
}

export function PromptInput({ className = "" }: PromptInputProps) {
  const { sendMessage, status } = useReactor((state) => ({
    sendMessage: state.sendMessage,
    status: state.status,
  }));

  const [prompt, setPrompt] = useState("");
  const [isSending, setIsSending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || status !== "ready") return;

    setIsSending(true);
    try {
      await sendMessage({ type: "set_prompt", data: { prompt } });
      console.log("Prompt sent:", prompt);
    } catch (error) {
      console.error("Failed to send prompt:", error);
    } finally {
      setIsSending(false);
    }
  };

  const isDisabled = status !== "ready";

  return (
    <div
      className={`bg-gray-900/40 rounded-lg p-3 sm:p-4 border border-gray-700/30 ${className} ${
        isDisabled ? "opacity-50 pointer-events-none" : ""
      }`}
    >
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe the scene..."
          disabled={isDisabled}
          className="flex-1 bg-gray-800/50 border border-gray-700/50 rounded-md px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all"
        />
        <button
          type="submit"
          disabled={isDisabled || !prompt.trim() || isSending}
          className="px-4 py-2 rounded-md bg-emerald-600/20 text-emerald-400 border border-emerald-600/30 hover:bg-emerald-600/30 active:scale-95 transition-all duration-200 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
        >
          {isSending ? "Sending..." : "Set Prompt"}
        </button>
      </form>
    </div>
  );
}
