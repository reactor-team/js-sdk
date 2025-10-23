"use client";

import { stories, type Story, type StoryPrompt } from "@/lib/prompts";

interface PromptSuggestionsProps {
  selectedStoryId: string | null;
  currentStep: number;
  onPromptSelect: (storyId: string, prompt: StoryPrompt, step: number) => void;
  disabled?: boolean;
}

export function PromptSuggestions({
  selectedStoryId,
  currentStep,
  onPromptSelect,
  disabled = false,
}: PromptSuggestionsProps) {
  // Determine which prompts to show
  const getAvailablePrompts = (): {
    story: Story;
    prompt: StoryPrompt;
    step: number;
  }[] => {
    if (!selectedStoryId) {
      // Show all starting prompts
      return stories.map((story) => ({
        story,
        prompt: story.startPrompt,
        step: 0,
      }));
    }

    // Show next prompt in the selected story
    const story = stories.find((s) => s.id === selectedStoryId);
    if (!story) return [];

    // Check if we've completed the story
    if (currentStep >= story.followUps.length) return [];

    // Return the next prompt in the story
    return [
      {
        story,
        prompt: story.followUps[currentStep],
        step: currentStep + 1,
      },
    ];
  };

  const availablePrompts = getAvailablePrompts();

  if (availablePrompts.length === 0) {
    return null;
  }

  const isStartingPrompts = !selectedStoryId;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-400">
            {isStartingPrompts ? "Choose Your Story" : "Continue Your Story"}
          </span>
          {!isStartingPrompts && (
            <span className="text-[10px] text-gray-500 italic">
              (click the box below)
            </span>
          )}
        </div>
        {!isStartingPrompts && (
          <span className="text-xs text-gray-500">
            Step {currentStep + 1} of{" "}
            {stories.find((s) => s.id === selectedStoryId)?.followUps.length ||
              0}
          </span>
        )}
      </div>

      <div
        className={`grid gap-2 ${
          isStartingPrompts ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-1"
        }`}
      >
        {availablePrompts.map(({ story, prompt, step }) => (
          <button
            key={prompt.id}
            onClick={() => onPromptSelect(story.id, prompt, step)}
            disabled={disabled}
            className="group rounded-md border border-gray-700/50 bg-gray-800/30 hover:bg-gray-800/50 p-2 text-left transition-all duration-200 hover:border-gray-600/50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="space-y-0.5">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-medium text-gray-300 text-xs">
                  {prompt.title}
                </h3>
                {isStartingPrompts && (
                  <span className="flex-shrink-0 text-[10px] text-gray-500 font-medium uppercase tracking-wider">
                    Start
                  </span>
                )}
              </div>

              <p className="text-xs text-gray-500 line-clamp-2">
                {prompt.prompt}
              </p>

              {/* Arrow indicator on hover */}
              <div className="flex items-center justify-end pt-0.5">
                <span className="text-gray-300 group-hover:text-gray-300 transition-colors text-xs flex items-center gap-0.5">
                  Use
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
