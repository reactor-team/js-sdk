"use client";

import {
  LingbotWorld2MainVideoView,
  LingbotWorld2Provider,
  useLingbotWorld2,
} from "@reactor-models/lingbot-world-2";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Header } from "@/components/Header";
import { SnapClip } from "@/components/SnapClip";
import { LingbotWorldController } from "@/components/lingbot-world-2/LingbotWorldController";
import { DirectorPanel } from "@/components/lingbot-world-2/DirectorPanel";
import { ActivityTicker } from "@/components/lingbot-world-2/ActivityTicker";
import { FrameTap } from "@/components/lingbot-world-2/FrameTap";

// Reactor coordinator the SDK connects to. Override with
// NEXT_PUBLIC_COORDINATOR_URL in .env.local if you need a different one.
const API_URL =
  process.env.NEXT_PUBLIC_COORDINATOR_URL ?? "https://api.reactor.inc";

// When the coordinator is a localhost URL, use the SDK's LOCAL mode: it talks to
// the auth-free LocalCoordinatorClient (`/start_session` routes on your own
// runtime) instead of the cloud CoordinatorClient (JWT + `/sessions`). Just
// changing the URL is NOT enough — `local` is what selects the client.
const IS_LOCAL = /localhost|127\.0\.0\.1/.test(API_URL);

// JWT resolver passed to <LingbotWorld2Provider getJwt>.
//
// `@reactor-team/js-sdk` ≥ 2.10.1 takes a resolver instead of a static
// string so the SDK can mint a fresh JWT on every Coordinator HTTP hop
// — uploads, clip manifests, ICE refreshes, SDP renegotiation. With a
// static string those hops 401 the moment the token ages out.
//
// We don't write a cache layer here either. The route returns the JWT
// with `Cache-Control: private, max-age=<seconds-until-expiry>`, so
// the browser's HTTP cache serves repeat calls (after a reload, route
// change, HMR cycle, etc.) without ever hitting our server — until
// the JWT actually expires.
async function fetchToken(): Promise<string> {
  const r = await fetch("/api/reactor/token");
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Token fetch failed: ${r.status}`);
  }
  const { jwt } = (await r.json()) as { jwt: string };
  return jwt;
}

function StatusBar() {
  const { status, connect, disconnect, reset } = useLingbotWorld2();

  const dotColor =
    status === "ready"
      ? "#4ade80"
      : status === "connecting" || status === "waiting"
        ? "#facc15"
        : "rgba(255,255,255,0.3)";

  const statusLabel =
    status === "ready"
      ? "Connected"
      : status === "waiting"
        ? "Waiting for GPU..."
        : status === "connecting"
          ? "Connecting..."
          : "Disconnected";

  return (
    <div
      className="flex items-center justify-between px-4 py-2 shrink-0"
      style={{
        background: "rgba(255,255,255,0.04)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full transition-colors"
            style={{
              backgroundColor: dotColor,
              animation:
                status === "connecting" || status === "waiting"
                  ? "statusPulse 1.5s infinite"
                  : "none",
            }}
          />
          <span className="font-mono text-xs text-white/50">{statusLabel}</span>
        </div>
        {status === "disconnected" ? (
          <Button
            size="xs"
            variant="secondary"
            onClick={() => connect()}
            className="h-7 px-3 font-mono text-xs bg-white/10 border-white/15 hover:bg-white/15 text-white"
          >
            Connect
          </Button>
        ) : (
          <Button
            size="xs"
            variant="secondary"
            onClick={() => disconnect()}
            className="h-7 px-3 font-mono text-xs bg-white/10 border-white/15 hover:bg-white/15 text-white"
          >
            {status === "connecting" || status === "waiting"
              ? "Cancel"
              : "Disconnect"}
          </Button>
        )}
        {status === "ready" && (
          <Button
            size="xs"
            variant="secondary"
            onClick={() => reset().catch(console.error)}
            className="h-7 px-3 font-mono text-xs bg-red-500/15 border-red-500/20 hover:bg-red-500/25 text-red-400"
          >
            Reset
          </Button>
        )}
      </div>
    </div>
  );
}

function MainContent() {
  const { sidebar, controls, hud } = LingbotWorldController({});
  const [directorOpen, setDirectorOpen] = useState(true);

  return (
    <main className="relative z-10 flex-1 min-h-0 flex flex-col px-4 sm:px-6 pb-4 sm:pb-6 pt-3 max-lg:overflow-y-auto lg:overflow-hidden">
      <div className="mx-auto flex w-full max-w-7xl min-w-0 flex-1 min-h-0 flex-col gap-4">
        <div className="flex min-w-0 max-lg:flex-none flex-col gap-4 lg:min-h-0 lg:flex-1 lg:flex-row lg:gap-6">
          {/* Sidebar — left on desktop, below on mobile. <SnapClip /> sits
              at the bottom: it's model-agnostic, self-hides while the
              connection isn't ready, and needs no phase awareness. */}
          <div className="order-2 flex min-h-0 min-w-0 flex-col gap-4 lg:order-1 lg:w-[min(100%,380px)] lg:max-w-[380px] lg:shrink-0 lg:overflow-y-auto lg:pr-1">
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 sm:p-4">
              {sidebar}
            </div>
            <ActivityTicker />
            <SnapClip />
          </div>

          {/* Video + controls — stacked in the right column */}
          <div className="order-1 flex min-w-0 flex-col gap-4 lg:order-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
            {/* Human Director — sits ABOVE the video. `shrink-0` on the video box
                below keeps the video at full size when this panel expands; the
                column just scrolls / the video moves down instead of compressing. */}
            <DirectorPanel visible={directorOpen} onClose={() => setDirectorOpen(false)} />
            <div className="relative shrink-0 bg-black rounded-xl overflow-hidden border border-white/[0.08] aspect-video">
              <LingbotWorld2MainVideoView
                videoObjectFit="contain"
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                }}
              />
              {/* Live frame tap — grabs the on-screen video for the AI director so
                  it sees the REAL evolving stream, not a frozen scene still. */}
              <FrameTap />
              {/* Player HUD — absolute overlay on the viewport */}
              {hud}
              {!directorOpen && (
                <Button
                  size="xs"
                  variant="secondary"
                  onClick={() => setDirectorOpen(true)}
                  className="absolute top-3 right-3 z-40 h-7 px-3 font-mono text-[11px] bg-black/70 border-white/15 hover:bg-black/85 text-white/80"
                >
                  Director options
                </Button>
              )}
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

// The client tree. LingbotWorld2Provider owns the WebRTC connection
// lifecycle — it auto-disconnects on unmount and on `beforeunload`, so
// don't call connect()/disconnect() from a useEffect yourself.
//
// We deliberately do NOT pass `autoConnect: true` here. The user clicks
// "Connect" so they see the disconnected → connecting → waiting → ready
// state machine first-hand. Flip it on in your own product if you'd
// rather skip straight to "ready".
//
// `getJwt` is a module-level function on purpose — stable identity, no
// re-render churn. The provider also auto-stabilizes inline arrows via
// `useRef + useMemo`, so wrapping in `useCallback` is never needed.
export function LingbotWorld2App() {
  return (
    <>
      <style>{`
        @keyframes statusPulse {
          0%, 100% { opacity: 1; } 50% { opacity: 0.4; }
        }
      `}</style>

      <div className="relative h-screen flex flex-col overflow-hidden bg-zinc-950">
        <Header />
        <LingbotWorld2Provider apiUrl={API_URL} local={IS_LOCAL} getJwt={fetchToken}>
          <div className="relative z-10 shrink-0">
            <StatusBar />
          </div>
          <MainContent />
        </LingbotWorld2Provider>
      </div>
    </>
  );
}
