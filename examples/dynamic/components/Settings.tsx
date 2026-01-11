"use client";

import { useState, useEffect } from "react";
import { fetchInsecureJwtToken } from "@reactor-team/js-sdk";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface SettingsProps {
  modelName: string;
  onModelNameChange: (value: string) => void;
  isLocal: boolean;
  onLocalChange: (value: boolean) => void;
  onJwtTokenChange: (value: string | undefined) => void;
}

export function Settings({
  modelName,
  onModelNameChange,
  isLocal,
  onLocalChange,
  onJwtTokenChange,
}: SettingsProps) {
  const [apiKey, setApiKey] = useState("");
  const [isFetchingToken, setIsFetchingToken] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);

  const handleLocalChange = (checked: boolean) => {
    onLocalChange(checked);
    if (checked) {
      onModelNameChange("");
      setApiKey("");
      onJwtTokenChange(undefined);
      setTokenError(null);
    }
  };

  // Fetch JWT token when API key changes (debounced)
  useEffect(() => {
    if (isLocal || !apiKey) {
      onJwtTokenChange(undefined);
      setTokenError(null);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setIsFetchingToken(true);
      setTokenError(null);
      try {
        const token = await fetchInsecureJwtToken(apiKey);
        onJwtTokenChange(token);
      } catch (err) {
        setTokenError(err instanceof Error ? err.message : "Failed to fetch token");
        onJwtTokenChange(undefined);
      } finally {
        setIsFetchingToken(false);
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [apiKey, isLocal, onJwtTokenChange]);

  return (
    <div className="flex flex-wrap items-center gap-4 p-3 bg-gray-800/40 rounded-lg border border-gray-700/50">
      <label className="flex items-center gap-2 text-sm text-gray-300">
        <span className={isLocal ? "text-gray-600" : "text-gray-500"}>Model:</span>
        <input
          type="text"
          value={modelName}
          onChange={(e) => onModelNameChange(e.target.value)}
          disabled={isLocal}
          className={`bg-gray-900/60 border border-gray-600 rounded-md px-3 py-1.5 w-44 placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 ${
            isLocal ? "text-gray-600 cursor-not-allowed opacity-50" : "text-white"
          }`}
          placeholder={isLocal ? "" : "e.g. longlive"}
        />
      </label>

      <Tooltip>
        <TooltipTrigger>
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <span className={isLocal ? "text-gray-600" : "text-orange-400"}>API Key:</span>
            <div className="relative">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                disabled={isLocal}
                className={`bg-gray-900/60 border rounded-md px-3 py-1.5 w-52 placeholder-gray-500 focus:outline-none focus:ring-1 ${
                  isLocal
                    ? "text-gray-600 cursor-not-allowed opacity-50 border-gray-600"
                    : tokenError
                      ? "text-white border-red-500 focus:border-red-500 focus:ring-red-500/50"
                      : "text-white border-orange-500/50 focus:border-orange-500 focus:ring-orange-500/50"
                }`}
                placeholder={isLocal ? "" : "rk_..."}
              />
              {isFetchingToken && !isLocal && (
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

      {tokenError && !isLocal && <span className="text-xs text-red-400">{tokenError}</span>}

      <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={isLocal}
          onChange={(e) => handleLocalChange(e.target.checked)}
          className="w-4 h-4 rounded border-gray-600 bg-gray-900/60 text-blue-500 focus:ring-blue-500/50 focus:ring-offset-0 cursor-pointer"
        />
        <span>Local</span>
      </label>
    </div>
  );
}
