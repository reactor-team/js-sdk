"use client";

import { useState, useEffect } from "react";
import { fetchInsecureJwtToken } from "@reactor-team/js-sdk";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ApiKeyInputProps {
  onJwtTokenChange: (token: string | undefined) => void;
  onLocalModeChange: (isLocal: boolean) => void;
}

export function ApiKeyInput({ onJwtTokenChange, onLocalModeChange }: ApiKeyInputProps) {
  const [apiKey, setApiKey] = useState("");
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLocalMode, setIsLocalMode] = useState(false);

  useEffect(() => {
    // Check if user entered "local" to enable local mode
    if (apiKey.toLowerCase() === "local") {
      setIsLocalMode(true);
      onLocalModeChange(true);
      onJwtTokenChange(undefined);
      setError(null);
      return;
    }

    // Not local mode
    setIsLocalMode(false);
    onLocalModeChange(false);

    if (!apiKey) {
      onJwtTokenChange(undefined);
      setError(null);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setIsFetching(true);
      setError(null);
      try {
        const token = await fetchInsecureJwtToken(apiKey);
        onJwtTokenChange(token);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch token");
        onJwtTokenChange(undefined);
      } finally {
        setIsFetching(false);
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [apiKey, onJwtTokenChange, onLocalModeChange]);

  return (
    <div className="flex flex-wrap items-center gap-4 p-3 bg-gray-800/40 rounded-lg border border-gray-700/50">
      <Tooltip>
        <TooltipTrigger asChild>
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <span className="text-orange-400">API Key:</span>
            <div className="relative">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className={`bg-gray-900/60 border rounded-md px-3 py-1.5 w-64 placeholder-gray-500 focus:outline-none focus:ring-1 text-white ${
                  error
                    ? "border-red-500 focus:border-red-500 focus:ring-red-500/50"
                    : isLocalMode
                      ? "border-green-500/50 focus:border-green-500 focus:ring-green-500/50"
                      : "border-orange-500/50 focus:border-orange-500 focus:ring-orange-500/50"
                }`}
                placeholder="rk_..."
              />
              {isFetching && (
                <div className="absolute right-2 top-1/2 -translate-y-1/2">
                  <div className="w-4 h-4 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>
          </label>
        </TooltipTrigger>
        <TooltipContent>
          <p>⚠️ Enter API key or type &quot;local&quot; for local mode</p>
        </TooltipContent>
      </Tooltip>
      {isLocalMode && (
        <span className="text-xs text-green-400 flex items-center gap-1">
          <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
          Local Mode
        </span>
      )}
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}
