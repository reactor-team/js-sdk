"use client";

import { LongliveV2Provider } from "@reactor-models/longlive-v2";
import { Header } from "./components/Header";
import { StatusBadge } from "./components/StatusBadge";
import { CommandError } from "./components/CommandError";
import { NowPlaying } from "./components/NowPlaying";
import { Storyboard } from "./components/Storyboard";
import { Director } from "./components/Director";
import { Timeline } from "./components/Timeline";
import { SnapClip } from "./components/SnapClip";
import { Video } from "./components/Video";

// JWT resolver passed to <LongliveV2Provider getJwt>. The SDK calls this on
// every Coordinator HTTP hop (clip manifests, ICE refreshes), so it must be a
// resolver, not a static string. The /api/reactor/token route returns the JWT
// with `Cache-Control: private, max-age=<until-expiry>`, so the browser caches
// it until it actually expires.
async function fetchToken(): Promise<string> {
  const r = await fetch("/api/reactor/token");
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Token fetch failed: ${r.status}`);
  }
  const { jwt } = (await r.json()) as { jwt: string };
  return jwt;
}

// The client tree. The sidebar is phase-driven by `snapshot.started`:
//   - Setup  (idle):       <Storyboard>  — compose shots & cuts, then start
//   - Live   (generating): <NowPlaying> + <Director> — drive it in real time
// Each component subscribes via `useLongliveV2State` and returns null when
// it's not its phase. The <Timeline> under the video visualizes the plan and
// the playhead in both phases. <SnapClip> is model-agnostic (base SDK).
//
// No `autoConnect` — the user clicks Connect so they see the
// disconnected → connecting → waiting → ready state machine first-hand.
export function LongLiveApp() {
  return (
    <LongliveV2Provider getJwt={fetchToken}>
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex flex-1 flex-col gap-4 p-4 lg:flex-row lg:gap-6 lg:p-6">
          <aside className="flex w-full flex-col gap-4 lg:w-80 lg:shrink-0">
            <StatusBadge />
            <CommandError />
            <NowPlaying />
            <Storyboard />
            <Director />
            <SnapClip />
          </aside>
          <section className="flex flex-1 flex-col gap-4">
            <div className="flex-1">
              <Video />
            </div>
            <Timeline />
          </section>
        </main>
      </div>
    </LongliveV2Provider>
  );
}
