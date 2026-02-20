"use client";

import { useReactor } from "@reactor-team/js-sdk";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ConnectionStatusProps {
  className?: string;
}

export function ConnectionStatus({ className }: ConnectionStatusProps) {
  const { status, connect, disconnect } = useReactor((state) => ({
    status: state.status,
    connect: state.connect,
    disconnect: state.disconnect,
  }));

  const isConnecting = status === "connecting" || status === "waiting";

  return (
    <div className={cn("flex items-center gap-3", className)}>
      {/* Status indicator */}
      <div className="flex items-center gap-2">
        <div
          className={cn(
            "w-2 h-2 rounded-full transition-colors",
            status === "disconnected" && "bg-muted-foreground",
            status === "connecting" && "bg-yellow-500 animate-pulse",
            status === "waiting" && "bg-yellow-500 animate-pulse",
            status === "ready" && "bg-green-500"
          )}
        />
        <span className="text-sm text-foreground/80 capitalize">{status}</span>
      </div>

      {/* Connect/Disconnect button */}
      {status === "disconnected" ? (
        <Button size="sm" variant="default" onClick={() => connect()}>
          Connect
        </Button>
      ) : (
        <Button size="sm" variant="secondary" onClick={() => disconnect()}>
          {isConnecting ? "Cancel" : "Disconnect"}
        </Button>
      )}
    </div>
  );
}
