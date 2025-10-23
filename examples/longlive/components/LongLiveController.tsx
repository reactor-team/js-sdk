"use client";

import { useState, useEffect, useRef } from "react";
import { useReactor, useReactorMessage } from "@reactor-team/js-sdk";
import { PromptSuggestions } from "./PromptSuggestions";
import { stories } from "@/lib/prompts";
import type { StoryPrompt } from "@/lib/prompts";

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
  // Track the selected story and current step
  const [selectedStoryId, setSelectedStoryId] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  // Track the current active prompt
  const [currentPrompt, setCurrentPrompt] = useState<string>("");
  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  // Audio playback ref for story music
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);

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

  // Fade out audio smoothly
  const fadeOutAudio = () => {
    if (!audioRef.current) return;

    const audio = audioRef.current;
    const fadeOutDuration = 500; // 500ms fade out
    const fadeOutSteps = 20;
    const volumeStep = audio.volume / fadeOutSteps;
    const stepDuration = fadeOutDuration / fadeOutSteps;

    const fadeInterval = setInterval(() => {
      if (audio.volume > volumeStep) {
        audio.volume = Math.max(0, audio.volume - volumeStep);
      } else {
        audio.volume = 0;
        audio.pause();
        audio.currentTime = 0;
        audio.volume = 1; // Reset volume for next play
        clearInterval(fadeInterval);
      }
    }, stepDuration);
  };

  // Reset all UI state to initial values
  const resetUIState = () => {
    setPrompt("");
    setCurrentStartFrame(0);
    setSelectedStoryId(null);
    setCurrentStep(0);
    setCurrentPrompt("");
    // Fade out and reset audio
    fadeOutAudio();
  };

  // Reset the frame counter and story progress when we disconnect from the model
  useEffect(() => {
    if (status === "disconnected") {
      resetUIState();
    }
  }, [status]);

  // Control audio playback based on isAudioEnabled
  useEffect(() => {
    if (audioRef.current) {
      if (isAudioEnabled) {
        audioRef.current.play().catch((error) => {
          console.error("Failed to play audio:", error);
        });
      } else {
        audioRef.current.pause();
      }
    }
  }, [isAudioEnabled]);

  const handleSubmitPrompt = async (promptText: string) => {
    if (!promptText.trim()) return;

    // Update the current prompt display
    setCurrentPrompt(promptText.trim());

    // Calculate the timestamp for this prompt:
    // - First prompt (frame 0): use timestamp 0 to start from the beginning
    // - Subsequent prompts: use current frame + 3 to avoid conflicts with the current generation
    const timestamp = currentStartFrame === 0 ? 0 : currentStartFrame + 3;

    // Send the prompt with the calculated timestamp
    await sendMessage({
      type: "schedule_prompt",
      data: {
        new_prompt: promptText.trim(),
        timestamp: timestamp,
      },
    });

    // On the first prompt, also send a "start" message to begin the generation process
    if (currentStartFrame === 0) {
      await sendMessage({ type: "start" });
    }
  };

  const handlePromptSelect = async (
    storyId: string,
    storyPrompt: StoryPrompt,
    step: number
  ) => {
    // Set the selected story and step
    setSelectedStoryId(storyId);
    setCurrentStep(step);

    // Play audio when starting a new story (step 0)
    if (step === 0) {
      const story = stories.find((s) => s.id === storyId);
      if (story?.audio) {
        // Create or update the audio element
        if (!audioRef.current) {
          audioRef.current = new Audio(story.audio);
          audioRef.current.loop = true; // Loop the audio
        } else {
          audioRef.current.src = story.audio;
          audioRef.current.currentTime = 0;
        }

        // Play the audio only if enabled
        if (isAudioEnabled) {
          try {
            await audioRef.current.play();
          } catch (error) {
            console.error("Failed to play audio:", error);
          }
        }
      }
    }

    // Submit the prompt
    await handleSubmitPrompt(storyPrompt.prompt);
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    await handleSubmitPrompt(prompt);
    setPrompt("");
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Use the MediaRecorder's actual MIME type instead of hardcoding
        const mimeType = mediaRecorder.mimeType || "audio/webm";
        const audioBlob = new Blob(audioChunksRef.current, {
          type: mimeType,
        });
        await transcribeAudio(audioBlob);
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error("Error starting recording:", error);
      alert("Failed to access microphone. Please check permissions.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const transcribeAudio = async (audioBlob: Blob) => {
    setIsTranscribing(true);
    try {
      // Determine the correct file extension based on the MIME type
      const mimeType = audioBlob.type;
      let extension = "webm";

      if (mimeType.includes("mp4") || mimeType.includes("m4a")) {
        extension = "mp4";
      } else if (mimeType.includes("mpeg")) {
        extension = "mp3";
      } else if (mimeType.includes("wav")) {
        extension = "wav";
      } else if (mimeType.includes("ogg")) {
        extension = "ogg";
      }

      const formData = new FormData();
      formData.append("audio", audioBlob, `recording.${extension}`);

      const response = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Transcription failed");
      }

      const data = await response.json();
      setPrompt(data.text);
    } catch (error) {
      console.error("Transcription error:", error);
      alert("Failed to transcribe audio. Please try again.");
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleVoiceInput = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  // Send reset message to restart the model and reset UI state
  const handleReset = async () => {
    try {
      await sendMessage({ type: "reset" });
      resetUIState();
      console.log("Reset message sent");
    } catch (error) {
      console.error("Failed to send reset:", error);
    }
  };

  return (
    <div
      className={`bg-gray-900/40 rounded-lg p-3 border border-gray-700/30 space-y-3 ${className}`}
    >
      {/* Header with Audio Toggle and Reset Button */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-400">Prompts</span>
        <div className="flex items-center gap-2">
          {/* Audio Toggle */}
          <button
            onClick={() => setIsAudioEnabled(!isAudioEnabled)}
            className={`p-1.5 rounded-md transition-all duration-200 active:scale-95 border ${
              isAudioEnabled
                ? "bg-blue-500/20 text-blue-400 border-blue-500/40 hover:bg-blue-500/30"
                : "bg-gray-500/20 text-gray-400 border-gray-500/40 hover:bg-gray-500/30"
            }`}
            title={isAudioEnabled ? "Mute audio" : "Unmute audio"}
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              {isAudioEnabled ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                />
              ) : (
                <>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"
                  />
                </>
              )}
            </svg>
          </button>
          {/* Reset Button */}
          <button
            onClick={handleReset}
            disabled={status === "disconnected"}
            className="px-3 py-1.5 rounded-md bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500/30 active:scale-95 transition-all duration-200 text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Current Prompt Display */}
      {currentPrompt && (
        <div className="bg-gray-800/30 rounded-md p-2 border border-gray-700/30">
          <div className="flex items-top gap-2">
            <p className="text-xs font-medium text-gray-300 flex-shrink-0">
              Current:
            </p>
            <p className="text-xs text-gray-500">{currentPrompt}</p>
          </div>
        </div>
      )}

      {/* Prompt Suggestions */}
      <PromptSuggestions
        selectedStoryId={selectedStoryId}
        currentStep={currentStep}
        onPromptSelect={handlePromptSelect}
        disabled={status === "disconnected"}
      />

      {/* Manual Input */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-gray-400">
            Or write your own
          </span>
          <div className="flex items-center gap-1.5 px-2 py-0.5 bg-gray-800/50 rounded-md">
            <span className="text-xs text-gray-500">Frame:</span>
            <span className="text-xs font-semibold text-gray-300 tabular-nums">
              {currentStartFrame}
            </span>
          </div>
        </div>
        <form onSubmit={handleManualSubmit} className="flex gap-2">
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={
              isTranscribing
                ? "Transcribing..."
                : "Enter your prompt or use voice..."
            }
            className="flex-1 px-3 py-2 bg-gray-800/50 border border-gray-700/50 rounded-md text-white text-xs placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all duration-200"
            disabled={status === "disconnected" || isTranscribing}
          />
          <button
            type="button"
            onClick={handleVoiceInput}
            disabled={status === "disconnected" || isTranscribing}
            className={`px-3 py-2 rounded-md transition-all duration-200 text-xs font-medium flex items-center gap-1.5 active:scale-95 border ${
              isRecording
                ? "bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20 animate-pulse"
                : "bg-blue-500/10 text-blue-400 border-blue-500/20 hover:bg-blue-500/20"
            } disabled:opacity-50 disabled:cursor-not-allowed`}
            title={isRecording ? "Stop recording" : "Start voice input"}
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              {isRecording ? (
                <rect x="6" y="4" width="12" height="16" rx="2" />
              ) : (
                <>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                  />
                </>
              )}
            </svg>
            {isRecording ? "Stop" : ""}
          </button>
          <button
            type="submit"
            disabled={!prompt.trim() || status === "disconnected"}
            className="px-5 py-2 bg-green-600/80 text-white rounded-md hover:bg-green-600 disabled:bg-gray-700/50 disabled:cursor-not-allowed transition-all duration-200 text-xs font-medium"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
