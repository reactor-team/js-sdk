"use client";

import { useReactor } from "@reactor-team/js-sdk";

export function CompactReactorStatus() {
  const { status, waitingInfo, connect, disconnect } = useReactor((state) => ({
    status: state.status,
    waitingInfo: state.waitingInfo,
    connect: state.connect,
    disconnect: state.disconnect,
  }));

  return (
    <div className="border border-gray-700/30 bg-gray-900/40 p-2 rounded-lg">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div
            className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-medium border ${
              status === "disconnected"
                ? "text-red-400 bg-red-500/10 border-red-500/20"
                : status === "waiting"
                ? "text-gray-300 bg-gray-700/30 border-gray-600/40"
                : "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
            }`}
          >
            <div
              className={`w-1 h-1 rounded-full ${
                status === "disconnected"
                  ? "bg-red-500"
                  : status === "waiting"
                  ? "bg-gray-400 animate-pulse"
                  : "bg-emerald-500 animate-pulse"
              }`}
            />
            <span>
              {status === "disconnected"
                ? "Disconnected"
                : status === "waiting"
                ? "Waiting"
                : status === "connecting"
                ? "Connecting"
                : "Ready"}
            </span>
          </div>
          {status === "disconnected" ? (
            <button
              className="px-2 py-1 rounded bg-gray-700/50 text-gray-300 border border-gray-600/50 hover:bg-gray-700 hover:text-white text-[10px] font-medium"
              onClick={() => connect()}
            >
              Connect
            </button>
          ) : (
            <button
              className="px-2 py-1 rounded bg-red-600/80 text-white hover:bg-red-600 text-[10px] font-medium"
              onClick={() => disconnect()}
            >
              Disconnect
            </button>
          )}
        </div>
        {status === "waiting" && waitingInfo?.position !== undefined && (
          <div className="flex items-center gap-1 px-2 py-1 rounded bg-gray-700/20 border border-gray-600/30">
            <span className="text-[10px] text-gray-400">Queue:</span>
            <span className="font-semibold text-[10px] text-gray-200">
              #{waitingInfo.position}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
