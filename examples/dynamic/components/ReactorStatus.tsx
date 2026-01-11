"use client";

import { useReactor } from "@reactor-team/js-sdk";
import { Tooltip } from "./Tooltip";

interface ReactorStatusProps {
  className?: string;
}

export function ReactorStatus({ className }: ReactorStatusProps) {
  const { status, connect, disconnect, reconnect, sessionId } = useReactor((state) => ({
    status: state.status,
    connect: state.connect,
    disconnect: state.disconnect,
    reconnect: state.reconnect,
    sessionId: state.sessionId,
  }));

  return (
    <div
      className={`border border-gray-700/30 bg-gray-900/40 p-4 rounded-lg space-y-4 ${className}`}
    >
      {/* Status and Session ID */}
      <div className="flex flex-wrap items-center gap-3">
        <div
          className={`flex items-center gap-2 px-4 py-2 rounded-md border ${
            status === "disconnected"
              ? "text-red-400 bg-red-500/10 border-red-500/20"
              : status === "connecting"
                ? "text-yellow-400 bg-yellow-500/10 border-yellow-500/20"
                : "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
          }`}
        >
          <div
            className={`w-2 h-2 rounded-full ${
              status === "disconnected"
                ? "bg-red-500"
                : status === "connecting"
                  ? "bg-yellow-400 animate-pulse"
                  : "bg-emerald-500 animate-pulse"
            }`}
          />
          <span className="font-medium text-sm">{status}</span>
        </div>
        <div className="text-sm text-gray-500">
          Session: <span className="text-gray-400 font-mono">{sessionId ?? "None"}</span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3 justify-evenly">
        <Tooltip content="Create a session, start model inference, and connect video">
          <button
            className="px-5 py-2.5 rounded-lg bg-green-600 text-white hover:bg-green-500 text-sm font-medium transition-colors"
            onClick={() => connect()}
          >
            Connect
          </button>
        </Tooltip>

        <Tooltip content="Reconnect to an already running model session">
          <button
            className="px-5 py-2.5 rounded-lg bg-blue-600 text-white hover:bg-blue-500 text-sm font-medium transition-colors"
            onClick={() => reconnect()}
          >
            Reconnect
          </button>
        </Tooltip>

        <Tooltip content="Cut video stream only — model keeps running. Use Reconnect to resume.">
          <button
            className="px-5 py-2.5 rounded-lg bg-orange-600 text-white hover:bg-orange-500 text-sm font-medium transition-colors"
            onClick={() => disconnect(true)}
          >
            Disconnect (Recoverable)
          </button>
        </Tooltip>

        <Tooltip content="Cut video stream and send stop signal to the model">
          <button
            className="px-5 py-2.5 rounded-lg bg-red-700 text-white hover:bg-red-600 text-sm font-medium transition-colors"
            onClick={() => disconnect(false)}
          >
            Disconnect (Non-Recoverable)
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
