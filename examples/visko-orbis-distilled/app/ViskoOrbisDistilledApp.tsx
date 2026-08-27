"use client";

import { ViskoOrbisDistilledProvider } from "@reactor-models/visko-orbis-distilled";
import { Header } from "./components/Header";
import { StatusBadge } from "./components/StatusBadge";
import { CommandError } from "./components/CommandError";
import { NowPlaying } from "./components/NowPlaying";
import { EvolveScene } from "./components/EvolveScene";
import { PromptComposer } from "./components/PromptComposer";
import { ImageStarter } from "./components/ImageStarter";
import { SessionOptions } from "./components/SessionOptions";
import { AudioPanel } from "./components/AudioPanel";
import { SnapClip } from "./components/SnapClip";
import { Video } from "./components/Video";
import { AudioOutlet } from "./components/AudioOutlet";

// JWT resolver passed to <ViskoOrbisDistilledProvider getJwt>.
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

// The client tree. ViskoOrbisDistilledProvider owns the WebRTC connection
// lifecycle — it auto-disconnects on unmount and on `beforeunload`, so
// don't call connect()/disconnect() from a useEffect yourself.
//
// We deliberately do NOT pass `autoConnect: true` here. The user clicks
// "Connect" so they see the disconnected → connecting → waiting → ready
// state machine first-hand. On Visko Orbis the `waiting` phase is the
// expensive one (SR compile + three warmup chunks, MINUTES), and the
// StatusBadge labels it honestly.
//
// `getJwt` is an inline arrow on purpose. The provider auto-stabilizes
// it via `useRef + useMemo`, so a parent re-render does NOT tear the
// session down. Wrapping in `useCallback` is unnecessary.
export function ViskoOrbisDistilledApp() {
  return (
    <ViskoOrbisDistilledProvider getJwt={fetchToken}>
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex flex-1 flex-col gap-4 p-4 lg:flex-row lg:gap-6 lg:p-6">
          {/*
           * The sidebar has two phases driven by `snapshot.started`:
           *
           *   - Setup (not started): <PromptComposer /> + <ImageStarter />
           *     + <SessionOptions />
           *   - Live (generating):   <NowPlaying />  + <EvolveScene />
           *
           * <EvolveScene /> is the hero: it sends `set_prompt` MID-RUN so
           * the scene morphs at the next chunk boundary — the per-chunk
           * prompting this model is being productized around.
           *
           * <AudioPanel /> is visible whenever connected: main_audio is a
           * real track, so it gets an explicit on/off. Changing it applies
           * at the NEXT start (and survives reset).
           *
           * <SnapClip /> is model-agnostic — only needs the base SDK — so
           * it sits at the bottom of the sidebar, visible whenever the
           * connection is `"ready"`.
           *
           * <AudioOutlet /> renders the hidden <audio> element bound to
           * main_audio. It lives here (not inside Video) so it stays
           * mounted for the whole session regardless of which video panel
           * is showing.
           */}
          <aside className="flex w-full flex-col gap-4 lg:w-80 lg:shrink-0">
            <StatusBadge />
            <CommandError />
            <NowPlaying />
            <EvolveScene />
            <PromptComposer />
            <ImageStarter />
            <SessionOptions />
            <AudioPanel />
            <SnapClip />
          </aside>
          <section className="flex-1">
            <Video />
          </section>
          <AudioOutlet />
        </main>
      </div>
    </ViskoOrbisDistilledProvider>
  );
}
