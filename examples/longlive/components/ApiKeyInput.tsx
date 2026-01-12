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
}

export function ApiKeyInput({ onJwtTokenChange }: ApiKeyInputProps) {
  const [apiKey, setApiKey] = useState("");
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
  }, [apiKey, onJwtTokenChange]);

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
          <p>⚠️ DANGEROUS: Never deploy with your API key in client code!</p>
        </TooltipContent>
      </Tooltip>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}
