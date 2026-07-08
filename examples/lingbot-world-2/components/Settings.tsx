"use client";

import { ENDPOINTS, type Endpoint } from "@/lib/endpoints";

// Endpoint switcher + (Production only) a client-facing Reactor API key field.
// The key is sent to /api/token as the Reactor-API-Key header, which mints a
// JWT from it (falling back to a server env key if left blank); it's cached in
// localStorage by the page. Local (Direct) skips token auth entirely.
interface SettingsProps {
  endpoint: Endpoint;
  onEndpointChange: (endpoint: Endpoint) => void;
  localUrl: string;
  onLocalUrlChange: (url: string) => void;
  apiKey: string;
  onApiKeyChange: (key: string) => void;
  className?: string;
}

export function Settings({
  endpoint,
  onEndpointChange,
  localUrl,
  onLocalUrlChange,
  apiKey,
  onApiKeyChange,
  className,
}: SettingsProps) {
  return (
    <div
      className={
        className ??
        "flex flex-wrap items-center gap-3 px-4 py-2 bg-white/[0.03] border-b border-white/[0.06]"
      }
    >
      <label className="font-mono text-[10px] uppercase tracking-wide text-white/40 shrink-0">
        Endpoint
      </label>
      <select
        value={ENDPOINTS.indexOf(endpoint)}
        onChange={(e) => onEndpointChange(ENDPOINTS[Number(e.target.value)])}
        className="bg-white/5 border border-white/10 rounded px-2 py-1 text-white font-mono text-xs focus:outline-none focus:border-white/40 cursor-pointer"
      >
        {ENDPOINTS.map((ep, i) => (
          <option key={i} value={i} className="bg-black">
            {ep.label}
          </option>
        ))}
      </select>

      {endpoint.local && (
        <>
          <label className="font-mono text-[10px] uppercase tracking-wide text-white/40 shrink-0">
            URL
          </label>
          <input
            type="text"
            value={localUrl}
            onChange={(e) => onLocalUrlChange(e.target.value)}
            className="bg-white/5 border border-white/10 rounded px-2 py-1 w-56 text-white font-mono text-xs placeholder-white/30 focus:outline-none focus:border-white/40"
            placeholder="http://localhost:8089"
          />
        </>
      )}

      {!endpoint.local && (
        <>
          <label className="font-mono text-[10px] uppercase tracking-wide text-white/40 shrink-0">
            API Key
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => onApiKeyChange(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            className="bg-white/5 border border-white/10 rounded px-2 py-1 w-64 text-white font-mono text-xs placeholder-white/30 focus:outline-none focus:border-white/40"
            placeholder="Reactor API key (reactor.inc/dashboard)"
          />
        </>
      )}
    </div>
  );
}
