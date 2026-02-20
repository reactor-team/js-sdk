"use client";

import { useState, useEffect, useCallback } from "react";
import { fetchInsecureJwtToken } from "@reactor-team/js-sdk";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface ApiKeyInputProps {
  onJwtTokenChange: (token: string | undefined) => void;
  onLocalModeChange: (isLocal: boolean) => void;
  className?: string;
}

export function ApiKeyInput({ 
  onJwtTokenChange, 
  onLocalModeChange,
  className 
}: ApiKeyInputProps) {
  const [apiKey, setApiKey] = useState("");
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLocalMode, setIsLocalMode] = useState(false);

  // Memoize callbacks to prevent unnecessary effect triggers
  const handleJwtChange = useCallback(onJwtTokenChange, [onJwtTokenChange]);
  const handleLocalChange = useCallback(onLocalModeChange, [onLocalModeChange]);

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
    <div className={cn("flex items-center gap-3", className)}>
      <Label htmlFor="api-key" className="text-muted-foreground text-sm whitespace-nowrap">
        API Key
      </Label>
      <div className="relative max-w-xs">
        <Input
          id="api-key"
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="rk_..."
          className={cn(
            "pr-16 w-48",
            isLocalMode && "border-green-500/50 focus:border-green-500",
            error && "border-destructive"
          )}
        />
        {/* Status indicators inside the input */}
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
          {isFetching && (
            <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          )}
          {isLocalMode && (
            <span className="text-xs text-green-500 flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
              Local
            </span>
          )}
          {error && (
            <span className="text-xs text-destructive flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-destructive rounded-full" />
              Error
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
