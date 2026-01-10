"use client";

import { useReactor } from "@reactor-team/js-sdk";
import { useState } from "react";

interface PromptSelectorProps {
  className?: string;
}

const PROMPTS = [
  {
    title: "Lava Land",
    description: "Volcanic wasteland with red sky",
    text: "A vast and brutal land of flowing lava stretching endlessly in every direction, with molten rivers weaving through fractured, charcoal-black terrain. Towering pillars of cooled obsidian jut sharply from the ground, their surfaces glowing faintly from the heat trapped within. The air ripples with intense thermal distortion, casting wavering reflections across the fiery landscape. Occasional eruptions send sparks and embers drifting upward, illuminating thick volcanic smoke that hangs low in the sky. The sky is a deep, ominous red, dominated by a huge, flaming moon that looms oppressively overhead. The atmosphere feels hostile, ancient, and otherworldly, as if the entire land is alive with heat and motion. High detail, dramatic lighting, ultra-realistic textures, cinematic scale.",
  },
  {
    title: "Tropical Day",
    description: "Calm beach paradise",
    text: "A breathtaking tropical paradise bathed in golden sunlight, with crystal-clear turquoise waters lapping gently against pristine white sand beaches. Lush emerald palm trees sway lazily in the warm breeze, framing a vibrant blue sky dotted with fluffy white clouds. Colorful exotic flowers bloom in abundance, adding splashes of pink and orange to the verdant landscape. The atmosphere is serene and tranquil, evoking a sense of perfect peace and relaxation. High resolution, photorealistic, soft natural lighting, idyllic scenery.",
  },
  {
    title: "City Chaos",
    description: "Futuristic urban frenzy",
    text: "A sprawling futuristic metropolis plunged into chaotic energy, with towering skyscrapers piercing through a dense smog of neon lights and holograms. Crowded streets are packed with moving vehicles and pedestrians, creating a blur of motion and color. Rain slicks the asphalt, reflecting the dazzling array of signs and advertisements in a cyberpunk aesthetic. Drones zip through narrow alleyways between immense structures of steel and glass. The atmosphere is frenetic, gritty, and overwhelming, pulsing with the heartbeat of a restless urban jungle. Cinematic lighting, intricate details, dystopian vibe, wide angle.",
  },
];

export function PromptSelector({ className = "" }: PromptSelectorProps) {
  const { sendMessage, status } = useReactor((state) => ({
    sendMessage: state.sendMessage,
    status: state.status,
  }));

  const [selectedTitle, setSelectedTitle] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  const handleSelectPrompt = async (prompt: (typeof PROMPTS)[0]) => {
    if (status !== "ready") return;

    setIsSending(true);
    setSelectedTitle(prompt.title);
    try {
      await sendMessage({ type: "set_prompt", data: { prompt: prompt.text } });
      console.log(`Prompt set to: ${prompt.title}`);
    } catch (error) {
      console.error("Failed to set prompt:", error);
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
      <div className="mb-3">
        <span className="text-sm font-medium text-gray-400">
          Preset Atmospheres
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {PROMPTS.map((prompt) => (
          <button
            key={prompt.title}
            onClick={() => handleSelectPrompt(prompt)}
            disabled={isDisabled || isSending}
            className={`flex flex-col items-center justify-center p-3 rounded-md border transition-all duration-200 ${
              selectedTitle === prompt.title
                ? "bg-emerald-600/20 border-emerald-500/50 text-emerald-100"
                : "bg-gray-800/40 border-gray-700/50 text-gray-400 hover:bg-gray-700/50 hover:border-gray-600"
            } active:scale-95`}
          >
            <span className="text-xs font-bold whitespace-nowrap">
              {prompt.title}
            </span>
            <span className="text-[10px] opacity-70 text-center mt-1 leading-tight hidden sm:block">
              {prompt.description}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
