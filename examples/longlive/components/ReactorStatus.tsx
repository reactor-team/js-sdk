"use client";

import { useReactor } from "@reactor-team/js-sdk";

interface ReactorStatusProps {
  className?: string;
}

export function ReactorStatus({ className }: ReactorStatusProps) {
  const { status, connect, disconnect } = useReactor((state) => ({
    status: state.status,
    connect: state.connect,
    disconnect: state.disconnect,
  }));

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
        </div>
        {status === "disconnected" ? (
          <button
            className="px-4 py-1.5 rounded-md bg-blue-600/80 text-white hover:bg-blue-600 transition-all duration-200 text-sm font-medium"
            onClick={() => connect()}
          >
            Connect
          </button>
        ) : (
          <button
            className="px-4 py-1.5 rounded-md bg-red-600/80 text-white hover:bg-red-600 transition-all duration-200 text-sm font-medium"
            onClick={() => disconnect()}
          >
            Disconnect
          </button>
        )}
      </div>
    </div>
  );
}
