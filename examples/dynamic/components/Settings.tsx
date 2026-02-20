"use client";

import { useState, useEffect } from "react";
import { fetchInsecureJwtToken } from "@reactor-team/js-sdk";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ENDPOINTS } from "@/lib/endpoints";

interface SettingsProps {
  modelName: string;
  onModelNameChange: (value: string) => void;
  isLocal: boolean;
  onLocalChange: (value: boolean) => void;
  onJwtTokenChange: (value: string | undefined) => void;
  coordinatorUrl: string;
  onCoordinatorUrlChange: (value: string) => void;
}

export function Settings({
  modelName,
  onModelNameChange,
  isLocal,
  onLocalChange,
  onJwtTokenChange,
  coordinatorUrl,
  onCoordinatorUrlChange,
}: SettingsProps) {
  const [localModelName, setLocalModelName] = useState(modelName);
  const [apiKey, setApiKey] = useState("");
  const [isFetchingToken, setIsFetchingToken] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);

  useEffect(() => {
    setLocalModelName(modelName);
  }, [modelName]);

  const handleLocalChange = (checked: boolean) => {
    onLocalChange(checked);
    if (checked) {
      setLocalModelName("");
      onModelNameChange("");
      setApiKey("");
      onJwtTokenChange(undefined);
      setTokenError(null);
    }
  };

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
        const token = await fetchInsecureJwtToken(apiKey, coordinatorUrl);
        onJwtTokenChange(token);
      } catch (err) {
        setTokenError(
          err instanceof Error ? err.message : "Failed to fetch token"
        );
        onJwtTokenChange(undefined);
      } finally {
        setIsFetchingToken(false);
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [apiKey, isLocal, coordinatorUrl, onJwtTokenChange]);

  return (
    <div className="flex flex-col gap-3 p-3 bg-gray-800/40 rounded-lg border border-gray-700/50">
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer select-none shrink-0">
          <input
            type="checkbox"
            checked={isLocal}
            onChange={(e) => handleLocalChange(e.target.checked)}
            className="w-4 h-4 rounded border-gray-600 bg-gray-900/60 text-blue-500 focus:ring-blue-500/50 focus:ring-offset-0 cursor-pointer"
          />
          <span>Local</span>
        </label>

        {!isLocal && (
          <div className="flex items-center gap-2 text-sm text-gray-300 min-w-0">
            <span className="text-gray-500 shrink-0">Endpoint:</span>
            <select
              value={coordinatorUrl}
              onChange={(e) => onCoordinatorUrlChange(e.target.value)}
              className="bg-gray-900/60 border border-gray-600 rounded-md px-3 py-1.5 text-white text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 cursor-pointer"
            >
              {ENDPOINTS.map((ep) => (
                <option key={ep.url} value={ep.url}>
                  {ep.label}
                </option>
              ))}
            </select>
            <span className="text-xs text-gray-500 truncate min-w-0">
              {coordinatorUrl}
            </span>
          </div>
        )}
      </div>

      {!isLocal && (
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm text-gray-300">
            <span className="text-gray-500">Model:</span>
            <input
              type="text"
              value={localModelName}
              onChange={(e) => setLocalModelName(e.target.value)}
              className="bg-gray-900/60 border border-gray-600 rounded-md px-3 py-1.5 w-44 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50"
              placeholder="e.g. longlive"
            />
            <button
              onClick={() => onModelNameChange(localModelName)}
              disabled={localModelName === modelName}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                localModelName === modelName
                  ? "bg-gray-700 text-gray-500 cursor-not-allowed"
                  : "bg-blue-600 text-white hover:bg-blue-500"
              }`}
            >
              Set Model
            </button>
          </div>

          <Tooltip>
            <TooltipTrigger>
              <label className="flex items-center gap-2 text-sm text-gray-300">
                <span className="text-orange-400">API Key:</span>
                <div className="relative">
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className={`bg-gray-900/60 border rounded-md px-3 py-1.5 w-52 text-white placeholder-gray-500 focus:outline-none focus:ring-1 ${
                      tokenError
                        ? "border-red-500 focus:border-red-500 focus:ring-red-500/50"
                        : "border-orange-500/50 focus:border-orange-500 focus:ring-orange-500/50"
                    }`}
                    placeholder="rk_..."
                  />
                  {isFetchingToken && (
                    <div className="absolute right-2 top-1/2 -translate-y-1/2">
                      <div className="w-4 h-4 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                </div>
              </label>
            </TooltipTrigger>
            <TooltipContent>
              <p>
                ⚠️ DANGEROUS: Never deploy with your API key in client code!
              </p>
            </TooltipContent>
          </Tooltip>

          {tokenError && (
            <span className="text-xs text-red-400">{tokenError}</span>
          )}
        </div>
      )}
    </div>
  );
}
