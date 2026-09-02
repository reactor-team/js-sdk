"use client";

import { FastH3Provider } from "@reactor-models/fast-h3";
import { Header } from "./components/Header";
import { StatusBadge } from "./components/StatusBadge";
import { CommandError } from "./components/CommandError";
import { EpisodeComposer } from "./components/EpisodeComposer";
import { NowPlaying } from "./components/NowPlaying";
import { QueuePanel } from "./components/QueuePanel";
import { SnapClip } from "./components/SnapClip";
import { Video } from "./components/Video";

// The memoized token resolver handed to <FastH3Provider jwtToken>.
//
// The token is memoized in module scope, not the browser's HTTP cache (the
// route is no-store). A session can only be operated by the exact token
// that created it, and the SDK calls the resolver again on every later hop
// the session makes — so the resolver must return the SAME token for the
// token's whole life, and only re-mint close to expiry.
const TOKEN_REFRESH_SKEW_MS = 60_000;
let cachedToken: { jwt: string; expiresAtMs: number } | null = null;
let inflightToken: Promise<string> | null = null;

async function fetchToken(): Promise<string> {
  if (
    cachedToken &&
    Date.now() < cachedToken.expiresAtMs - TOKEN_REFRESH_SKEW_MS
  ) {
    return cachedToken.jwt;
  }
  if (inflightToken) return inflightToken; // coalesce parallel hops
  inflightToken = (async () => {
    try {
      const r = await fetch("/api/reactor/token", { cache: "no-store" });
      if (!r.ok) throw new Error(`Token fetch failed: ${r.status}`);
      const { jwt, expires_at } = (await r.json()) as {
        jwt: string;
        expires_at: number;
      };
      cachedToken = { jwt, expiresAtMs: expires_at * 1000 };
      return jwt;
    } finally {
      inflightToken = null;
    }
  })();
  return inflightToken;
}

// No `autoConnect`, and no Connect button anywhere: the ONLY way a session
// starts is queueing a composed episode (EpisodeComposer.queueEpisode calls
// connect() right before the first enqueue). Composing — including the AI
// writer — happens entirely offline; the StatusBadge reports the lifecycle
// (disconnected → connecting → waiting → ready) and offers Disconnect.
export function FastH3App() {
  return (
    <FastH3Provider jwtToken={fetchToken}>
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex flex-1 flex-col gap-4 p-4 lg:flex-row lg:gap-6 lg:p-6">
          <aside className="flex w-full flex-col gap-4 lg:w-96 lg:shrink-0">
            <StatusBadge />
            <CommandError />
            <NowPlaying />
            <EpisodeComposer />
            <QueuePanel />
            <SnapClip />
          </aside>
          <section className="flex-1">
            <Video />
          </section>
        </main>
      </div>
    </FastH3Provider>
  );
}
