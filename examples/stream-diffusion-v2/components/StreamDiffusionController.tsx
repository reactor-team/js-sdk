"use client";

import { useState, useEffect } from "react";
import { useReactor } from "@reactor-team/js-sdk";
import { PromptSuggestions } from "./PromptSuggestions";

interface StreamDiffusionControllerProps {
  className?: string;
}

const DEFAULT_PROMPT =
  "Full skeleton with glowing green eye sockets, exposed skull and ribcage, bony hands with long skeletal fingers reaching forward, complete leg bones and spine visible, tattered black robes, swirling green fog, dark graveyard background, moonlight on white bones, jaw open showing teeth, standing pose, photorealistic, 4k quality";

/**
 * StreamDiffusionController
 *
 * Control panel for the StreamDiffusionV2 model that allows:
 * - Setting prompts for video transformation
 * - Configuring denoising steps for quality/speed balance
 * - Starting and resetting the video transformation
 */
export function StreamDiffusionController({
  className,
}: StreamDiffusionControllerProps) {
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
    <div
      className={`bg-gray-900/40 rounded-lg p-3 border border-gray-700/30 space-y-3 ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-400">Controls</span>
      </div>

      {/* Current Settings Display */}
      {(currentPrompt || currentDenoisingSteps) && (
        <div className="bg-gray-800/30 rounded-md p-2 border border-gray-700/30 space-y-2">
          {currentPrompt && (
            <div className="flex items-start gap-2">
              <p className="text-xs font-medium text-gray-300 flex-shrink-0">
                Current:
              </p>
              <p className="text-xs text-gray-500">{currentPrompt}</p>
            </div>
          )}
          {currentDenoisingSteps && (
            <div className="flex items-center gap-2">
              <p className="text-xs font-medium text-gray-300 flex-shrink-0">
                Steps:
              </p>
              <p className="text-xs text-gray-500 font-mono">
                [{currentDenoisingSteps.join(", ")}]
              </p>
            </div>
          )}
        </div>
      )}

      {/* Prompt Suggestions */}
      <PromptSuggestions onPromptSelect={handlePromptSelect} disabled={!isReady} />

      {/* Prompt Input */}
      <div>
        <label className="block text-xs font-medium text-gray-400 mb-2">
          Set Prompt
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="A cyberpunk cityscape at night with neon lights..."
            className="flex-1 px-3 py-2 bg-gray-800/50 border border-gray-700/50 rounded-md text-white text-xs placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all duration-200"
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
            className="px-4 py-2 rounded-md bg-blue-500/20 text-blue-400 border border-blue-500/40 hover:bg-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 text-xs font-semibold"
          >
            Set
          </button>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          Tip: Use detailed, descriptive prompts for best results.
        </p>
      </div>

      {/* Denoising Steps Input */}
      <div>
        <label className="block text-xs font-medium text-gray-400 mb-2">
          Denoising Steps (0-5 values, 0-1000 each)
          <span
            onClick={() =>
              window.open(
                "https://docs.reactor.inc/models/stream-diffusion-v2#set-denoising-step-list",
                "_blank"
              )
            }
            className="ml-1 cursor-pointer opacity-60 hover:opacity-100 transition-opacity text-[10px]"
            title="View documentation"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                window.open(
                  "https://docs.reactor.inc/models/stream-diffusion-v2#set-denoising-step-list",
                  "_blank"
                );
              }
            }}
          >
            ⓘ
          </span>
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={denoisingSteps}
            onChange={(e) => setDenoisingSteps(e.target.value)}
            placeholder="700, 500, 200"
            className="flex-1 px-3 py-2 bg-gray-800/50 border border-gray-700/50 rounded-md text-white text-xs placeholder-gray-500 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all duration-200"
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
            className="px-4 py-2 bg-blue-500/20 text-blue-400 border border-blue-500/40 rounded-md hover:bg-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 text-xs font-medium"
          >
            Set
          </button>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          Examples: Fast: [500] · Balanced: [700, 500, 200] · High Quality:
          [800, 600, 400, 100]
        </p>
      </div>
    </div>
  );
}
