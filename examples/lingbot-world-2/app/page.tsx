"use client";

import { useState, useEffect } from "react";
import {
  LingbotWorld2MainVideoView,
  LingbotWorld2Provider,
  useLingbotWorld2,
} from "@reactor-models/lingbot-world-2";
import { Button } from "@/components/ui/button";
import { Header } from "@/components/Header";
import { LingbotWorldController } from "@/components/lingbot-world-2/LingbotWorldController";

// Reactor coordinator the SDK connects to. Override with
// NEXT_PUBLIC_COORDINATOR_URL in .env.local if you need a different one.
const API_URL =
  process.env.NEXT_PUBLIC_COORDINATOR_URL ?? "https://api.reactor.inc";

function StatusBar() {
  const { status, connect, disconnect, reset } = useLingbotWorld2();

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

function CenteredNotice({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative z-10 flex flex-1 items-center justify-center px-6">
      <div className="max-w-md rounded-xl border border-white/[0.08] bg-white/[0.02] p-6 text-center font-mono text-sm text-white/70">
        {children}
      </div>
    </div>
  );
}

export default function LingbotWorld2Page() {
  const [jwtToken, setJwtToken] = useState<string | undefined>(undefined);
  const [tokenError, setTokenError] = useState<string | null>(null);

  useEffect(() => { document.documentElement.classList.add("dark"); }, []);

  // Exchange the server-side REACTOR_API_KEY for a short-lived session JWT.
  // The key itself never reaches the browser — see app/api/token/route.ts.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/token", { method: "POST" })
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (cancelled) return;
        if (r.ok && body.jwt) {
          setJwtToken(body.jwt);
        } else {
          setTokenError(body.error ?? `Token request failed (${r.status})`);
        }
      })
      .catch((err) => { if (!cancelled) setTokenError(String(err)); });
    return () => { cancelled = true; };
  }, []);

  return (
    <>
      <style>{`
        @keyframes statusPulse {
          0%, 100% { opacity: 1; } 50% { opacity: 0.4; }
        }
      `}</style>

      <div className="relative h-screen flex flex-col overflow-hidden bg-zinc-950">
        <Header />

        {tokenError ? (
          <CenteredNotice>
            <p className="text-red-400 mb-2">Could not get a session token.</p>
            <p>
              Set <code className="text-white">REACTOR_API_KEY</code> in{" "}
              <code className="text-white">.env.local</code> and restart the dev
              server — see the README for details.
            </p>
            <p className="mt-3 text-xs text-white/40">{tokenError}</p>
          </CenteredNotice>
        ) : !jwtToken ? (
          <CenteredNotice>Fetching session token…</CenteredNotice>
        ) : (
          /* No `autoConnect`: the user clicks Connect so they see the
             disconnected -> connecting -> waiting -> ready state machine
             first-hand. The provider owns the connection lifecycle and
             auto-disconnects on unmount, so we never call connect() from
             an effect ourselves. */
          <LingbotWorld2Provider apiUrl={API_URL} jwtToken={jwtToken}>
            <div className="relative z-10 shrink-0">
              <StatusBar />
            </div>
            <MainContent />
          </LingbotWorld2Provider>
        )}
      </div>
    </>
  );
}
