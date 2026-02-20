"use client";

import { useState, useEffect } from "react";
import { fetchInsecureJwtToken } from "@reactor-team/js-sdk";

interface ApiKeyInputProps {
  onJwtTokenChange: (token: string | undefined) => void;
  onLocalModeChange: (isLocal: boolean) => void;
}

export function ApiKeyInput({
  onJwtTokenChange,
  onLocalModeChange,
}: ApiKeyInputProps) {
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
    <div className="border-t border-white/10 pt-6">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-xs font-mono text-[#bdbdbd] uppercase whitespace-nowrap">
            API Key:
          </label>
          <div className="relative">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="rk_..."
              className={`w-48 px-2 py-1 bg-white/10 border rounded font-mono text-xs text-white placeholder-white/40 focus:outline-none transition-colors ${
                error
                  ? "border-red-500/50 focus:border-red-500"
                  : isLocalMode
                    ? "border-green-500/50 focus:border-green-500"
                    : "border-white/20 focus:border-white/40"
              }`}
            />
            {isFetching && (
              <div className="absolute right-2 top-1/2 -translate-y-1/2">
                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>
        </div>

        {isLocalMode && (
          <div className="flex items-center gap-2 px-3 py-1 bg-green-500/20 rounded">
            <div className="w-2 h-2 bg-green-500 rounded-full" />
            <span className="text-xs font-mono text-green-400 uppercase">Local Mode</span>
          </div>
        )}

        {error && (
          <span className="text-xs font-mono text-red-400">{error}</span>
        )}
      </div>

      {isLocalMode && (
        <p className="mt-2 text-xs text-[#bdbdbd] font-mono">
          Local mode connects to localhost:8080. Run:{" "}
          <code className="bg-white/10 px-1 rounded">reactor run --runtime http --port 8080</code>
        </p>
      )}
    </div>
  );
}
