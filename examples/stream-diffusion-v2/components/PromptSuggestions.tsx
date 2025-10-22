"use client";

interface PromptSuggestionsProps {
  onPromptSelect: (prompt: string) => void;
  disabled?: boolean;
}

const SAMPLE_PROMPTS = [
  {
    title: "Skeleton",
    prompt:
      "Full skeleton with glowing green eye sockets, exposed skull and ribcage, bony hands with long skeletal fingers reaching forward, complete leg bones and spine visible, tattered black robes, swirling green fog, dark graveyard background, moonlight on white bones, jaw open showing teeth, standing pose, photorealistic, 4k quality",
  },
  {
    title: "Cyberpunk",
    prompt:
      "Futuristic cyberpunk character with glowing neon tattoos, metallic chrome implants, holographic visor, black leather jacket with LED strips, sleek robotic arm, urban dystopian background with neon signs, rain-soaked streets reflecting colorful lights, photorealistic, 4k quality",
  },
  {
    title: "Fantasy Wizard",
    prompt:
      "Ancient wizard with long flowing white beard, ornate purple robes with gold embroidery, glowing magical staff, mystical runes floating around, pointed wizard hat with stars, magical blue energy crackling from hands, enchanted forest background, ethereal mist, photorealistic, 4k quality",
  },
  {
    title: "Space Astronaut",
    prompt:
      "Modern astronaut in white space suit with reflective gold visor, detailed NASA patches, holding helmet under arm, futuristic spacecraft interior with glowing control panels, Earth visible through window, floating weightless, dramatic lighting, photorealistic, 4k quality",
  },
  {
    title: "Pirate Captain",
    prompt:
      "Weathered pirate captain with tricorn hat, long dark coat with gold trim, eyepatch, braided beard, cutlass sword at side, leather boots, wooden ship deck background, ocean waves, stormy sky, treasure chest nearby, photorealistic, 4k quality",
  },
  {
    title: "Samurai Warrior",
    prompt:
      "Traditional samurai warrior in red and black armor, ornate helmet with horns, katana sword drawn, flowing silk cape, cherry blossom petals falling, ancient Japanese temple background, dramatic sunset lighting, photorealistic, 4k quality",
  },
];

export function PromptSuggestions({
  onPromptSelect,
  disabled = false,
}: PromptSuggestionsProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-400">
          Sample Prompts
        </span>
        <span className="text-[10px] text-gray-500 italic">
          (click to apply)
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {SAMPLE_PROMPTS.map((sample) => (
          <button
            key={sample.title}
            onClick={() => onPromptSelect(sample.prompt)}
            disabled={disabled}
            className="group rounded-md border border-gray-700/50 bg-gray-800/30 hover:bg-gray-800/50 p-2 text-left transition-all duration-200 hover:border-gray-600/50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-medium text-gray-300 text-xs">
                  {sample.title}
                </h3>
              </div>

              <p className="text-xs text-gray-500 line-clamp-2">
                {sample.prompt}
              </p>

              {/* Arrow indicator on hover */}
              <div className="flex items-center justify-end pt-0.5">
                <span className="text-gray-400 group-hover:text-gray-300 transition-colors text-xs flex items-center gap-0.5">
                  Apply
                  <svg
                    className="w-2.5 h-2.5 transform group-hover:translate-x-0.5 transition-transform"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </span>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
