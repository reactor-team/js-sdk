"use client";

// LINGBOT 2 — PUBLIC DEMO
//
// This example runs on the published Lingbot 2 typed SDK,
// `@reactor-models/lingbot-world-2`. It re-exports both the plain
// client and the React bindings from the package root, so every
// component here imports the typed provider, hooks, and message types
// straight from `@reactor-models/lingbot-world-2`.
import { LingbotWorld2Provider } from "@reactor-models/lingbot-world-2";
import { Header } from "./components/Header";
import { StatusBadge } from "./components/StatusBadge";
import { CommandError } from "./components/CommandError";
import { NowPlaying } from "./components/NowPlaying";
import { MovementControls } from "./components/MovementControls";
import { CameraPose } from "./components/CameraPose";
import { DynamicEvents } from "./components/DynamicEvents";
import { ScenePicker } from "./components/ScenePicker";
import { CustomStart } from "./components/CustomStart";
import { SnapClip } from "./components/SnapClip";
import { Video } from "./components/Video";

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

// The client tree. LingbotWorld2Provider owns the WebRTC connection lifecycle —
// it auto-disconnects on unmount and on `beforeunload`, so don't call
// connect()/disconnect() from a useEffect yourself.
//
// We deliberately do NOT pass `autoConnect: true` here. The user clicks
// "Connect" so they see the disconnected → connecting → waiting → ready
// state machine first-hand. Flip it on in your own product if you'd
// rather skip straight to "ready".
//
// `getJwt` is an inline arrow on purpose. The provider auto-stabilizes
// it via `useRef + useMemo`, so a parent re-render does NOT tear the
// session down. Wrapping in `useCallback` is unnecessary.
export function Lingbot2App() {
  return (
    <LingbotWorld2Provider getJwt={fetchToken}>
      {/*
       * Fixed-height app shell. The viewport never scrolls as a whole
       * (`h-screen` + `overflow-hidden`); instead the sidebar is its own
       * scroll region on desktop, so its stack of panels can grow past
       * the viewport while the video stays put and centered in the window.
       * On mobile (`max-lg`) there aren't two columns to keep in sync, so
       * <main> just scrolls normally and everything stacks.
       */}
      <div className="flex h-screen flex-col overflow-hidden">
        <Header />
        <main className="flex flex-1 flex-col overflow-y-auto p-4 lg:min-h-0 lg:overflow-hidden lg:p-6">
          {/* Centered content column — caps width and centers the whole
              sidebar+video block on wide windows. */}
          <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 lg:min-h-0 lg:flex-row lg:gap-6">
            {/*
             * The sidebar has two phases driven by `snapshot.started`:
             *
             *   - Setup  (waiting):    <ScenePicker />     + <CustomStart />
             *   - Live   (generating): <NowPlaying />      + <MovementControls />
             *                          + <CameraPose />    + <DynamicEvents />
             *
             * Each component subscribes to the snapshot via
             * `useLingbotWorld2State` and returns null when it's not its phase.
             * On disconnect, each component also clears its snapshot via
             * a small useEffect — keeps the UI from showing stale data
             * from the previous session after a reconnect.
             *
             * <DynamicEvents /> is the live-phase prompt-swap surface —
             * one click appends a curated world-event sentence ("rain
             * begins", "fog rolls in") to the active prompt and re-sends
             * via `set_prompt`. The model picks it up on the next chunk.
             *
             * <SnapClip /> is model-agnostic — it only needs the base SDK
             * to capture the last N seconds of the live stream — so it
             * sits at the bottom of the sidebar and is visible whenever
             * the connection is `"ready"`.
             */}
            {/* Independent scroll region on desktop — `lg:overflow-y-auto`
              + `lg:min-h-0` let the panels scroll inside the fixed shell.
              `lg:pr-1` keeps the scrollbar off the panel borders. */}
            <aside className="flex w-full flex-col gap-4 lg:min-h-0 lg:w-80 lg:shrink-0 lg:overflow-y-auto lg:pr-1">
              <StatusBadge />
              <CommandError />
              <NowPlaying />
              <MovementControls />
              <CameraPose />
              <DynamicEvents />
              <ScenePicker />
              <CustomStart />
              <SnapClip />
            </aside>
            {/* Video fills the remaining space and stays centered in the
              window; `contain` letterboxes it, so it never scrolls away. */}
            <section className="flex flex-1 lg:min-h-0">
              <Video />
            </section>
          </div>
        </main>
      </div>
    </LingbotWorld2Provider>
  );
}
