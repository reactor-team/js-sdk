"use client";

import { useState } from "react";
import { useReactor, useReactorMessage } from "@reactor-team/js-sdk";

interface ReactorStatusProps {
  className?: string;
}

export function ReactorStatus({ className }: ReactorStatusProps) {
  const { status, connect, disconnect } = useReactor((state) => ({
    status: state.status,
    connect: state.connect,
    disconnect: state.disconnect,
  }));

  const [generatorStatus, setGeneratorStatus] = useState<string | null>(null);

  useReactorMessage((message: any) => {
    if (message.type === "status") {
      setGeneratorStatus(message.data.status);
    }
  });

  return (
    <div
      className={`border border-gray-700/30 bg-gray-900/40 p-3 rounded-lg ${className}`}
    >
      <div className="flex flex-row justify-between items-center">
        <div className="flex items-center gap-2">
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md border transition-all duration-200 ${
              status === "disconnected"
                ? "text-red-400 bg-red-500/10 border-red-500/20"
                : "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
            }`}
          >
            <div
              className={`w-1.5 h-1.5 rounded-full ${
                status === "disconnected"
                  ? "bg-red-500"
                  : "bg-emerald-500 animate-pulse"
              }`}
            />
            <span className="font-medium text-xs">
              {status === "disconnected" ? "Disconnected" : "Connected"}
            </span>
          </div>
          {generatorStatus && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md border transition-all duration-200 text-purple-400 bg-purple-500/10 border-purple-500/20">
              <span className="font-medium text-xs">{generatorStatus}</span>
            </div>
          )}
        </div>
        {status === "disconnected" ? (
          <button
            className="px-4 py-2 sm:px-4 sm:py-1.5 rounded-md bg-gray-700/50 text-gray-300 border border-gray-600/50 hover:bg-gray-700 hover:text-white active:scale-95 transition-all duration-200 text-xs sm:text-xs font-medium touch-none"
            onClick={() => connect()}
            style={{ touchAction: "manipulation" }}
          >
            Connect
          </button>
        ) : (
          <button
            className="px-4 py-2 sm:px-4 sm:py-1.5 rounded-md bg-red-600/80 text-white hover:bg-red-600 active:scale-95 transition-all duration-200 text-xs sm:text-xs font-medium touch-none"
            onClick={() => disconnect()}
            style={{ touchAction: "manipulation" }}
          >
            Disconnect
          </button>
        )}
      </div>
    </div>
  );
}
