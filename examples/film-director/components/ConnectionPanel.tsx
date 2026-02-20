"use client";

import { useState, useEffect, useCallback } from "react";
import { useReactor, fetchInsecureJwtToken } from "@reactor-team/js-sdk";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface ConnectionPanelProps {
  onJwtTokenChange: (token: string | undefined) => void;
  onLocalModeChange: (isLocal: boolean) => void;
  className?: string;
}

export function ConnectionPanel({
  onJwtTokenChange,
  onLocalModeChange,
  className,
}: ConnectionPanelProps) {
  const { status, connect, disconnect } = useReactor((state) => ({
    status: state.status,
    connect: state.connect,
    disconnect: state.disconnect,
  }));

  const [apiKey, setApiKey] = useState("");
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLocalMode, setIsLocalMode] = useState(false);

  // Memoize callbacks to prevent unnecessary effect triggers
  const handleJwtChange = useCallback(onJwtTokenChange, [onJwtTokenChange]);
  const handleLocalChange = useCallback(onLocalModeChange, [onLocalModeChange]);

  const isConnecting = status === "connecting" || status === "waiting";
  const isConnected = status === "ready";

  useEffect(() => {
    // Check if user entered "local" to enable local mode
    if (apiKey.toLowerCase() === "local") {
      setIsLocalMode(true);
      handleLocalChange(true);
      handleJwtChange(undefined);
      setError(null);
      return;
    }

    // Not local mode
    setIsLocalMode(false);
    handleLocalChange(false);

    if (!apiKey) {
      handleJwtChange(undefined);
      setError(null);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setIsFetching(true);
      setError(null);
      try {
        const token = await fetchInsecureJwtToken(apiKey);
        handleJwtChange(token);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch token");
        handleJwtChange(undefined);
      } finally {
        setIsFetching(false);
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [apiKey, handleJwtChange, handleLocalChange]);

  return (
    <div className={cn("flex flex-col sm:flex-row items-stretch sm:items-center gap-3 p-4 bg-card rounded-lg border border-border", className)}>
      {/* API Key Input */}
      <div className="flex-1 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <label className="text-sm font-medium text-foreground whitespace-nowrap">
          API Key
        </label>
        <div className="relative flex-1">
          <Input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Enter your API key (rk_...)"
            disabled={isConnected}
            className={cn(
              "h-9 text-sm pr-8",
              isLocalMode && "border-green-500/50",
              error && "border-destructive"
            )}
          />
          {/* Status indicators */}
          <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
            {isFetching && (
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            )}
            {isLocalMode && !isFetching && (
              <span className="text-[10px] text-green-500 font-medium uppercase">Local</span>
            )}
            {error && !isFetching && (
              <span className="w-2 h-2 bg-destructive rounded-full" title={error} />
            )}
          </div>
        </div>
      </div>

      {/* Connection Button */}
      <div className="flex items-center gap-3">
        {/* Status indicator */}
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "w-2.5 h-2.5 rounded-full transition-colors",
              status === "disconnected" && "bg-muted-foreground",
              status === "connecting" && "bg-yellow-500 animate-pulse",
              status === "waiting" && "bg-yellow-500 animate-pulse",
              status === "ready" && "bg-green-500"
            )}
          />
          <span className="text-xs text-muted-foreground capitalize hidden sm:inline">
            {status === "ready" ? "Connected" : status}
          </span>
        </div>

        {/* Connect/Disconnect button */}
        {status === "disconnected" ? (
          <Button 
            size="default" 
            variant="default" 
            onClick={() => connect()}
            disabled={!apiKey && !isLocalMode}
            className="min-w-[100px]"
          >
            Connect
          </Button>
        ) : (
          <Button 
            size="default" 
            variant="secondary" 
            onClick={() => disconnect()} 
            className="min-w-[100px]"
          >
            {isConnecting ? "Cancel" : "Disconnect"}
          </Button>
        )}
      </div>
    </div>
  );
}
