"use client";

import { useState, useEffect } from "react";
import { useReactor } from "@reactor-team/js-sdk";
import { PromptSuggestions } from "./PromptSuggestions";

const DEFAULT_PROMPT =
  "Full skeleton with glowing green eye sockets, exposed skull and ribcage, bony hands with long skeletal fingers reaching forward, complete leg bones and spine visible, tattered black robes, swirling green fog, dark graveyard background, moonlight on white bones, jaw open showing teeth, standing pose, photorealistic, 4k quality";

export function CompactStreamDiffusionController() {
  const [prompt, setPrompt] = useState("");
  const [denoisingSteps, setDenoisingSteps] = useState("700, 500, 200");
  const [currentPrompt, setCurrentPrompt] = useState<string | null>(null);
  const [currentDenoisingSteps, setCurrentDenoisingSteps] = useState<
    number[] | null
  >(null);
  const [isStarted, setIsStarted] = useState(false);

  const { sendMessage, status } = useReactor((state) => ({
    sendMessage: state.sendMessage,
    status: state.status,
  }));

  // Reset UI state when disconnected
  useEffect(() => {
    if (status === "disconnected") {
      setPrompt("");
      setDenoisingSteps("700, 500, 200");
      setCurrentDenoisingSteps(null);
      setIsStarted(false);
    }
  }, [status]);

  // Auto-start with prompt when connection is ready
  useEffect(() => {
    const autoStart = async () => {
      if (status === "ready" && !isStarted) {
        const promptToUse = currentPrompt || DEFAULT_PROMPT;

        try {
          await sendMessage({
            type: "set_prompt",
            data: {
              prompt: promptToUse,
            },
          });
          setCurrentPrompt(promptToUse);

          await sendMessage({
            type: "start",
          });
          setIsStarted(true);
        } catch (error) {
          console.error("[StreamDiffusion] Failed to auto-start:", error);
        }
      }
    };

    autoStart();
  }, [status, isStarted, sendMessage, currentPrompt]);

  const validateDenoisingSteps = (input: string): number[] | null => {
    try {
      const steps = input
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .map((s) => {
          const num = parseInt(s);
          if (isNaN(num)) {
            throw new Error(`Invalid number: ${s}`);
          }
          if (num < 0 || num > 1000) {
            throw new Error(`Value ${num} must be between 0 and 1000`);
          }
          return num;
        });

      if (steps.length > 5) {
        throw new Error("Maximum 5 denoising steps allowed");
      }

      return steps;
    } catch (error) {
      console.error("[StreamDiffusion] Validation error:", error);
      return null;
    }
  };

  const handleSetPrompt = async () => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) return;

    try {
      await sendMessage({
        type: "set_prompt",
        data: {
          prompt: trimmedPrompt,
        },
      });
      setCurrentPrompt(trimmedPrompt);
      setPrompt("");
    } catch (error) {
      console.error("[StreamDiffusion] Failed to set prompt:", error);
    }
  };

  const handlePromptSelect = async (selectedPrompt: string) => {
    try {
      await sendMessage({
        type: "set_prompt",
        data: {
          prompt: selectedPrompt,
        },
      });
      setCurrentPrompt(selectedPrompt);
    } catch (error) {
      console.error("[StreamDiffusion] Failed to set prompt:", error);
    }
  };

  const handleSetDenoisingSteps = async () => {
    const steps = validateDenoisingSteps(denoisingSteps);
    if (!steps) {
      alert(
        "Invalid denoising steps. Enter 0-5 comma-separated values between 0 and 1000."
      );
      return;
    }

    try {
      await sendMessage({
        type: "set_denoising_step_list",
        data: {
          denoising_step_list: steps,
        },
      });
      setCurrentDenoisingSteps(steps);
    } catch (error) {
      console.error("[StreamDiffusion] Failed to set denoising steps:", error);
    }
  };

  const isReady = status === "ready";

  return (
    <div className="bg-gray-900/40 rounded-lg p-2 border border-gray-700/30 space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium text-gray-400">Controls</span>
      </div>

      {/* Current Settings Display */}
      {currentPrompt && (
        <div className="bg-gray-800/30 rounded p-1.5 border border-gray-700/30">
          <div className="flex items-start gap-1">
            <p className="text-[9px] font-medium text-gray-300 flex-shrink-0">
              Current:
            </p>
            <p className="text-[9px] text-gray-500 line-clamp-2">
              {currentPrompt}
            </p>
          </div>
        </div>
      )}

      {/* Prompt Suggestions */}
      <PromptSuggestions
        onPromptSelect={handlePromptSelect}
        disabled={!isReady}
      />

      {/* Prompt Input */}
      <div>
        <label className="block text-[10px] font-medium text-gray-400 mb-1">
          Set Prompt
        </label>
        <div className="flex gap-1">
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="A cyberpunk cityscape..."
            className="flex-1 px-2 py-1 bg-gray-800/50 border border-gray-700/50 rounded text-white text-[10px] placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500/50 focus:border-blue-500/50"
            disabled={!isReady}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleSetPrompt();
              }
            }}
          />
          <button
            onClick={handleSetPrompt}
            disabled={!isReady || !prompt.trim()}
            className="px-2 py-1 rounded bg-blue-500/20 text-blue-400 border border-blue-500/40 hover:bg-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed text-[10px] font-semibold"
          >
            Set
          </button>
        </div>
      </div>

      {/* Denoising Steps Input */}
      <div>
        <label className="block text-[10px] font-medium text-gray-400 mb-1">
          Denoising Steps
        </label>
        <div className="flex gap-1">
          <input
            type="text"
            value={denoisingSteps}
            onChange={(e) => setDenoisingSteps(e.target.value)}
            placeholder="700, 500, 200"
            className="flex-1 px-2 py-1 bg-gray-800/50 border border-gray-700/50 rounded text-white text-[10px] placeholder-gray-500 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500/50 focus:border-blue-500/50"
            disabled={!isReady}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleSetDenoisingSteps();
              }
            }}
          />
          <button
            onClick={handleSetDenoisingSteps}
            disabled={!isReady || !denoisingSteps.trim()}
            className="px-2 py-1 bg-blue-500/20 text-blue-400 border border-blue-500/40 rounded hover:bg-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed text-[10px] font-medium"
          >
            Set
          </button>
        </div>
      </div>
    </div>
  );
}
