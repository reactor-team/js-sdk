"use client";

import { useState } from "react";
import { useReactor } from "@reactor-team/js-sdk";

interface ImageRefresherProps {
  className?: string;
}

export function ImageRefresher({ className = "" }: ImageRefresherProps) {
  const { sendMessage, status } = useReactor((state) => ({
    sendMessage: state.sendMessage,
    status: state.status,
  }));

  const [step1, setStep1] = useState({ value: 500, enabled: true });
  const [step2, setStep2] = useState({ value: 500, enabled: true });
  const [step3, setStep3] = useState({ value: 500, enabled: true });
  const [isSending, setIsSending] = useState(false);

  const handleSubmit = async () => {
    if (status !== "ready") return;

    setIsSending(true);
    try {
      await sendMessage({
        type: "set_timesteps",
        data: {
          step1: step1.enabled ? step1.value : -1,
          step2: step2.enabled ? step2.value : -1,
          step3: step3.enabled ? step3.value : -1,
        },
      });
      console.log("Set timesteps sent");
    } catch (error) {
      console.error("Failed to set timesteps:", error);
    } finally {
      setTimeout(() => setIsSending(false), 500);
    }
  };

  const isDisabled = status !== "ready";

  const renderSlider = (
    label: string,
    state: { value: number; enabled: boolean },
    setState: React.Dispatch<
      React.SetStateAction<{ value: number; enabled: boolean }>
    >,
  ) => (
    <div className="flex flex-col items-center gap-2 h-full flex-1">
      <span className="text-xs text-gray-400 font-mono">{label}</span>
      <div className="h-32 relative w-full flex justify-center">
        <input
          type="range"
          min="0"
          max="1000"
          step="50"
          value={state.value}
          onChange={(e) =>
            setState((prev) => ({ ...prev, value: parseInt(e.target.value) }))
          }
          disabled={isDisabled || !state.enabled}
          className={`-rotate-90 w-32 h-2 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-blue-500 ${
            !state.enabled ? "opacity-30" : ""
          }`}
        />
      </div>
      <span className="text-xs text-gray-400 font-mono h-4">
        {state.enabled ? state.value : "OFF"}
      </span>
      <input
        type="checkbox"
        checked={state.enabled}
        onChange={(e) =>
          setState((prev) => ({ ...prev, enabled: e.target.checked }))
        }
        disabled={isDisabled}
        className="w-4 h-4 rounded border-gray-600 text-blue-500 focus:ring-blue-500/50 bg-gray-700"
      />
    </div>
  );

  return (
    <div
      className={`bg-gray-900/40 rounded-lg p-3 sm:p-4 border border-gray-700/30 flex flex-col gap-4 ${className} ${
        isDisabled ? "opacity-50 pointer-events-none" : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-400">
          Denoising Steps
        </span>
        <button
          onClick={handleSubmit}
          disabled={isDisabled || isSending}
          className="px-3 py-1.5 rounded-md bg-blue-600/20 text-blue-400 border border-blue-600/30 hover:bg-blue-600/30 active:scale-95 transition-all duration-200 text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSending ? "Sent" : "Submit"}
        </button>
      </div>

      <div className="flex justify-between gap-2 px-2">
        {renderSlider("Step 1", step1, setStep1)}
        {renderSlider("Step 2", step2, setStep2)}
        {renderSlider("Step 3", step3, setStep3)}
      </div>
    </div>
  );
}
