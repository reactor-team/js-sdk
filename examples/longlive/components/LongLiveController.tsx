"use client";

import { useState, useEffect, useRef } from "react";
import { useReactor, useReactorMessage } from "@reactor-team/js-sdk";
import { PromptSuggestions } from "./PromptSuggestions";
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

  // Reset all UI state to initial values
  const resetUIState = () => {
    setPrompt("");
    setCurrentStartFrame(0);
    setSelectedStoryId(null);
    setCurrentStep(0);
    setCurrentPrompt("");
  };

  // Reset the frame counter and story progress when we disconnect from the model
  useEffect(() => {
    if (status === "disconnected") {
      resetUIState();
    }
  }, [status]);

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
        const audioBlob = new Blob(audioChunksRef.current, {
          type: "audio/webm",
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
      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.webm");

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
      {/* Header with Reset Button */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-400">Prompts</span>
        <button
          onClick={handleReset}
          disabled={status === "disconnected"}
          className="px-3 py-1.5 rounded-md bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 active:scale-95 transition-all duration-200 text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Reset
        </button>
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
            className={`px-3 py-2 rounded-md transition-all duration-200 text-xs font-medium flex items-center gap-1.5 ${
              isRecording
                ? "bg-red-600/80 hover:bg-red-600 animate-pulse"
                : "bg-blue-600/80 hover:bg-blue-600"
            } text-white disabled:bg-gray-700/50 disabled:cursor-not-allowed`}
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
