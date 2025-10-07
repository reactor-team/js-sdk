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
    <div className={`border border-gray-300 p-4 rounded-sm ${className}`}>
      <div className="flex flex-row justify-between items-center">
        <div
          className={`${status === "disconnected" ? "text-red-500 p-2 rounded-md bg-red-500/20 border border-red-500/20" : "text-green-500 bg-green-500/20 p-2 rounded-md border border-green-500/20"}`}
        >
          Status: {status}
        </div>
        {status === "disconnected" ? (
          <button
            className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
            onClick={() => connect()}
          >
            Connect
          </button>
        ) : (
          <button
            className="px-4 py-2 rounded bg-red-600 text-white hover:bg-red-700"
            onClick={() => disconnect()}
          >
            Disconnect
          </button>
        )}
      </div>
    </div>
  );
}
