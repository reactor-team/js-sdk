"use client";

import { ViskoOrbisDynamicProvider } from "@reactor-models/visko-orbis-dynamic";
import { Header } from "./components/Header";
import { StatusBadge } from "./components/StatusBadge";
import { NowPlaying } from "./components/NowPlaying";
import { EvolveScene } from "./components/EvolveScene";
import { PromptComposer } from "./components/PromptComposer";
import { ImageStarter } from "./components/ImageStarter";
import { SessionOptions } from "./components/SessionOptions";
import { AudioPanel } from "./components/AudioPanel";
import { Video } from "./components/Video";

// Hand a `jwtToken` resolver to the Provider — the SDK re-invokes it on every
// Coordinator HTTP hop (uploads, ICE refresh, SDP renegotiation). Reuse is
// REQUIRED: a session-scoped token only acts on sessions it created, so every
// hop of one session must present the SAME JWT — see app/api/reactor/token.
// 3.0.0 calls it `jwtToken` (string or resolver); 2.x's `getJwt` prop is gone.
async function fetchToken(): Promise<string> {
  const r = await fetch("/api/reactor/token");
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Token fetch failed: ${r.status}`);
  }
  const { jwt } = (await r.json()) as { jwt: string };
  return jwt;
}

// The client tree. The Provider owns the WebRTC connection lifecycle —
// don't call connect()/disconnect() from your own useEffect. The user clicks
// "Connect" so they see the disconnected → connecting → waiting → ready
// state machine first-hand.
export function ViskoOrbisDynamicApp() {
  return (
    <ViskoOrbisDynamicProvider jwtToken={fetchToken}>
      {/*
       * Desktop-fitted shell (lg+): the app is bounded to exactly 100vh.
       * Header scrolls out of view with the sidebar; video and controls
       * stay in frame as you scroll the page. CSS structure:
       *   - root:  flex/h-screen at lg+, regular block flow below
       *   - main:  lg:h-full + lg:overflow-hidden so its children don't
       *            grow the row
       *   - aside: h-full + overflow-y-auto so the sidebar scrolls
       *            independently of the video, no "sticky" hack
       *   - Video: aspect-video + max-h-full so it letterboxes inside the
       *            pane (no top/bottom bars) instead of stretching tall
       *
       * Mobile (below lg) keeps normal page-scroll: everything flows in
       * order, video on top (order-first).
       */}
      <div className="flex min-h-screen flex-col lg:h-screen lg:overflow-hidden">
        <div className="lg:contents">
          <Header />
        </div>
        <main className="flex flex-1 flex-col gap-4 p-4 lg:h-full lg:flex-row lg:gap-6 lg:overflow-hidden lg:p-6">
          {/*
           * The sidebar self-organizes into two phases off the model's
           * `state` message — no parent orchestration, no top-down phase
           * logic. Each component reads the snapshot itself and returns
           * null when it isn't its turn:
           *
           *   SETUP (snapshot.started is false):
           *     StatusBadge · PromptComposer (T2V) · ImageStarter (I2V) ·
           *     SessionOptions — idle-only knobs, lock in at start
           *
           *   LIVE (snapshot.started is true):
           *     StatusBadge · NowPlaying · EvolveScene
           *
           * StatusBadge is the one panel that renders in BOTH phases —
           * connection is not a phase.
           *
           * Mobile (below lg): the video renders ABOVE the aside — it is
           * the hero surface and must be visible immediately, not pushed
           * below 500px of setup panels. `order-first`/`lg:order-none`
           * on the section swaps the visual order without changing the
           * DOM order, so keyboard/screenreader navigation still goes
           * through the controls before the video.
           */}
          <aside className="flex w-full flex-col gap-4 lg:h-full lg:w-80 lg:shrink-0 lg:overflow-y-auto">
            <StatusBadge />
            <NowPlaying />
            <EvolveScene />
            <PromptComposer />
            <ImageStarter />
            <SessionOptions />
            <AudioPanel />
          </aside>
          <section className="order-first flex-1 lg:order-none">
            <Video />
          </section>
        </main>
      </div>
    </ViskoOrbisDynamicProvider>
  );
}
