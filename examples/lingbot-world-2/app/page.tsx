"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  LingbotWorld2MainVideoView,
  LingbotWorld2Provider,
  useLingbotWorld2,
} from "@reactor-models/lingbot-world-2";
import { Logo, Nav } from "@reactor-team/ui";
import { Button } from "@/components/ui/button";
import { LingbotWorldController } from "@/components/lingbot-world-fast-v1/LingbotWorldController";
import { PasscodeGate } from "@/components/PasscodeGate";
import { Settings } from "@/components/Settings";
import { DEFAULT_LOCAL_URL, getDefaultEndpoint, type Endpoint } from "@/lib/endpoints";

const AUTO_DISCONNECT_MS = 10 * 60 * 1000;
const API_KEY_STORAGE = "reactor_api_key";

function StatusBar() {
  const { status, connect, disconnect, reset } = useLingbotWorld2();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (status === "ready") {
      timerRef.current = setTimeout(() => disconnect(), AUTO_DISCONNECT_MS);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [status, disconnect]);

  const dotColor =
    status === "ready" ? "#4ade80" :
    status === "connecting" || status === "waiting" ? "#facc15" :
    "rgba(255,255,255,0.3)";

  const statusLabel =
    status === "ready" ? "Connected" :
    status === "waiting" ? "Waiting for GPU..." :
    status === "connecting" ? "Connecting..." :
    "Disconnected";

  return (
    <div className="flex items-center justify-between px-4 py-2 shrink-0" style={{
      background: "rgba(255,255,255,0.04)",
      borderBottom: "1px solid rgba(255,255,255,0.06)"
    }}>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full transition-colors" style={{
            backgroundColor: dotColor,
            animation: status === "connecting" || status === "waiting" ? "statusPulse 1.5s infinite" : "none"
          }} />
          <span className="font-mono text-xs text-white/50">{statusLabel}</span>
        </div>
        {status === "disconnected" ? (
          <Button size="xs" variant="secondary" onClick={() => connect()}
            className="h-7 px-3 font-mono text-xs bg-white/10 border-white/15 hover:bg-white/15 text-white">
            Connect
          </Button>
        ) : (
          <Button size="xs" variant="secondary" onClick={() => disconnect()}
            className="h-7 px-3 font-mono text-xs bg-white/10 border-white/15 hover:bg-white/15 text-white">
            {status === "connecting" || status === "waiting" ? "Cancel" : "Disconnect"}
          </Button>
        )}
        {status === "ready" && (
          <Button size="xs" variant="secondary" onClick={() => reset().catch(console.error)}
            className="h-7 px-3 font-mono text-xs bg-red-500/15 border-red-500/20 hover:bg-red-500/25 text-red-400">
            Reset
          </Button>
        )}
      </div>
    </div>
  );
}

function MainContent() {
  const { sidebar, controls } = LingbotWorldController({});

  return (
    <main className="relative z-10 flex-1 min-h-0 flex flex-col px-4 sm:px-6 pb-4 sm:pb-6 pt-3 max-lg:overflow-y-auto lg:overflow-hidden">
      <div className="mx-auto flex w-full max-w-7xl min-w-0 flex-1 min-h-0 flex-col gap-4">
        <div className="flex min-w-0 max-lg:flex-none flex-col gap-4 lg:min-h-0 lg:flex-1 lg:flex-row lg:gap-6">
          {/* Sidebar — left on desktop, below on mobile */}
          <div className="order-2 flex min-h-0 min-w-0 flex-col gap-4 lg:order-1 lg:w-[min(100%,380px)] lg:max-w-[380px] lg:shrink-0 lg:overflow-y-auto lg:pr-1">
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 sm:p-4">
              {sidebar}
            </div>
          </div>

          {/* Video + controls — stacked in the right column */}
          <div className="order-1 flex min-w-0 flex-col gap-4 lg:order-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
            <div className="relative bg-black rounded-xl overflow-hidden border border-white/[0.08] aspect-video">
              <LingbotWorld2MainVideoView
                videoObjectFit="contain"
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
              />
            </div>

            <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 sm:p-4">
              {controls}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function AppShell({
  jwtToken,
  endpoint,
  onEndpointChange,
  localUrl,
  onLocalUrlChange,
  apiKey,
  onApiKeyChange,
}: {
  jwtToken: string | undefined;
  endpoint: Endpoint;
  onEndpointChange: (endpoint: Endpoint) => void;
  localUrl: string;
  onLocalUrlChange: (url: string) => void;
  apiKey: string;
  onApiKeyChange: (key: string) => void;
}) {
  const apiUrl = endpoint.local ? localUrl : endpoint.url;

  return (
    <LingbotWorld2Provider
      key={`${apiUrl}|${endpoint.local}`}
      apiUrl={apiUrl}
      local={endpoint.local}
      jwtToken={jwtToken}
      connectOptions={{ autoConnect: true }}
    >
      <div className="relative z-10 px-4 sm:px-6 py-3 shrink-0">
        <Nav
          className="demos-nav"
          logo={
            <Link href="/" className="flex items-center gap-2 text-white/50 hover:text-white/80 transition-colors">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M9 2L4 7L9 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="font-mono text-xs tracking-widest uppercase">Live Demos</span>
            </Link>
          }
          action={<Logo variant="symbol" color="white" height={18} />}
        />
      </div>

      <div className="relative z-10 shrink-0">
        <Settings
          endpoint={endpoint}
          onEndpointChange={onEndpointChange}
          localUrl={localUrl}
          onLocalUrlChange={onLocalUrlChange}
          apiKey={apiKey}
          onApiKeyChange={onApiKeyChange}
        />
      </div>

      <div className="relative z-10 shrink-0">
        <StatusBar />
      </div>

      <MainContent />
    </LingbotWorld2Provider>
  );
}

export default function LingbotWorldFastPage() {
  const [endpoint, setEndpoint] = useState<Endpoint>(getDefaultEndpoint);
  const [localUrl, setLocalUrl] = useState(DEFAULT_LOCAL_URL);
  const [jwtToken, setJwtToken] = useState<string | undefined>(undefined);
  const [apiKey, setApiKey] = useState("");

  useEffect(() => { document.documentElement.classList.add("dark"); }, []);

  // Restore a previously entered key so it survives reloads.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(API_KEY_STORAGE);
      if (saved) setApiKey(saved);
    } catch { /* localStorage unavailable */ }
  }, []);

  const handleApiKeyChange = (key: string) => {
    setApiKey(key);
    try { localStorage.setItem(API_KEY_STORAGE, key); } catch { /* ignore */ }
  };

  // Mint a JWT for the (production) endpoint. The client key is sent as the
  // Reactor-API-Key header; /api/token falls back to a server env key if it's
  // blank. Debounced so typing the key doesn't spam /tokens on every keystroke.
  useEffect(() => {
    if (endpoint.local) {
      setJwtToken(undefined);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      const headers: Record<string, string> = {};
      const key = apiKey.trim();
      if (key) headers["Reactor-API-Key"] = key;
      fetch("/api/token", { method: "POST", headers })
        .then((r) => r.json())
        .then(({ jwt }) => { if (!cancelled && jwt) setJwtToken(jwt); })
        .catch(console.error);
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
  }, [endpoint, apiKey]);

  return (
    <PasscodeGate>
      <style>{`
        .dot-grid {
          background-image: radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px);
          background-size: 28px 28px;
        }
        @keyframes statusPulse {
          0%, 100% { opacity: 1; } 50% { opacity: 0.4; }
        }
      `}</style>

      <div className="relative h-screen flex flex-col overflow-hidden" style={{ backgroundColor: "#000" }}>
        <div className="dot-grid absolute inset-0 pointer-events-none" />
        <div className="absolute inset-0 pointer-events-none" style={{
          background: "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(199,192,153,0.12), transparent)"
        }} />

        <AppShell
          jwtToken={jwtToken}
          endpoint={endpoint}
          onEndpointChange={setEndpoint}
          localUrl={localUrl}
          onLocalUrlChange={setLocalUrl}
          apiKey={apiKey}
          onApiKeyChange={handleApiKeyChange}
        />
      </div>
    </PasscodeGate>
  );
}
