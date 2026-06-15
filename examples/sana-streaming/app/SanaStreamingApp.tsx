"use client";

import {
  SanaStreamingProvider,
  useSanaStreaming,
  useSanaStreamingCommandError,
  useSanaStreamingGenerationReset,
  useSanaStreamingState,
} from "@reactor-models/sana-streaming";
import { useEffect, useRef, useState } from "react";
import { DEFAULT_STATE, type SanaMode } from "./lib/types";
import { isTransientDecodeFailure, reduce } from "./lib/state";
import { Header } from "./components/Header";
import { StatusBadge } from "./components/StatusBadge";
import { CommandError } from "./components/CommandError";
import { ModeInput } from "./components/ModeInput";
import { Prompt } from "./components/Prompt";
import { Stage } from "./components/Stage";
import { SnapClip } from "./components/SnapClip";

// JWT resolver passed to <SanaStreamingProvider getJwt>. The provider forwards
// it to the underlying ReactorProvider, which calls it on every Coordinator
// HTTP hop, so it must be a resolver, not a static string. The
// /api/reactor/token route returns the JWT with a Cache-Control header, so the
// browser caches it until it actually expires.
async function fetchToken(): Promise<string> {
  const r = await fetch("/api/reactor/token");
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Token fetch failed: ${r.status}`);
  }
  const { jwt } = (await r.json()) as { jwt: string };
  return jwt;
}

// No `autoConnect`: the user clicks Connect so they see the
// disconnected -> connecting -> waiting -> ready state machine first-hand.
// SanaStreamingProvider wraps ReactorProvider with the model name and tracks
// baked in, so commands and messages are typed all the way down.
export function SanaStreamingApp() {
  return (
    <SanaStreamingProvider getJwt={fetchToken}>
      <Workspace />
    </SanaStreamingProvider>
  );
}

const BANNER_TTL_MS = 6000;

// The client tree. The model is the source of truth: only `state` messages
// mutate the reducer, and every control gates off the reduced SanaState
// rather than local guesses. Everything else (command_error banner,
// generation_reset bookkeeping) is handled imperatively here.
function Workspace() {
  const { status } = useSanaStreaming();

  const [state, setState] = useState(DEFAULT_STATE);
  // Live is the headline feature; land users on it. Start flows send
  // set_mode explicitly, so the model's own default does not matter.
  const [mode, setMode] = useState<SanaMode>("live");

  // Object URL of the last uploaded source clip, owned here so Stage can
  // play it side-by-side. The cleanup effect revokes the previous URL on
  // every change and on unmount.
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  useEffect(() => {
    return () => {
      if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    };
  }, [sourceUrl]);

  // command_error banner: transient, not part of the reducer.
  const [commandError, setCommandError] = useState<string | null>(null);
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showCommandError = (reason: string) => {
    if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
    setCommandError(reason);
    bannerTimerRef.current = setTimeout(
      () => setCommandError(null),
      BANNER_TTL_MS,
    );
  };

  // Bumped on generation_reset and used as a React key on the children that
  // hold local draft state (prompt draft, file selection), remounting them
  // in step with the model's reset.
  const [resetNonce, setResetNonce] = useState(0);

  // After reset, black out the stage (the WebRTC view would otherwise freeze
  // on the last transformed frame). Lifts when generation runs again.
  const [stageCleared, setStageCleared] = useState(false);
  useEffect(() => {
    if (state.running) setStageCleared(false);
  }, [state.running]);

  // The model is the source of truth: only the typed `state` snapshot feeds
  // the reducer. command_error and generation_reset are handled imperatively
  // below, each with its own typed hook.
  useSanaStreamingState((msg) => {
    setState((s) => reduce(s, msg));
  });

  // Transient set_video "decode failed" errors are auto-retried by FileInput
  // (and surfaced inline if retries run out); don't flash the banner for them.
  useSanaStreamingCommandError((msg) => {
    if (!isTransientDecodeFailure(msg)) showCommandError(msg.reason);
  });

  useSanaStreamingGenerationReset(() => {
    // Model reset clears its source video + prompt; mirror that locally.
    setSourceUrl(null);
    setResetNonce((n) => n + 1);
    setStageCleared(true);
  });

  // Reset local state on full disconnect so a reconnect starts clean.
  useEffect(() => {
    if (status === "disconnected") {
      setState(DEFAULT_STATE);
      setCommandError(null);
      setSourceUrl(null);
    }
  }, [status]);

  // Clean up the banner auto-dismiss timer on unmount.
  useEffect(() => {
    return () => {
      if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
    };
  }, []);

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      {/* The stage comes first in the DOM: on mobile it is pinned (sticky)
          on top so the model output stays visible while the controls scroll
          beneath it, and the mobile padding lives on the children, not
          <main>, so it can sit flush against the viewport edge with a solid
          backdrop. lg:flex-row-reverse restores the desktop sidebar-left /
          stage-right split. */}
      <main className="flex flex-1 flex-col lg:flex-row-reverse lg:gap-6 lg:p-6">
        <section className="flex flex-col gap-4 max-lg:sticky max-lg:top-0 max-lg:z-10 max-lg:bg-zinc-950/95 max-lg:p-4 max-lg:pb-3 max-lg:backdrop-blur-sm lg:min-w-0 lg:flex-1">
          <Stage
            state={state}
            mode={mode}
            sourceUrl={sourceUrl}
            cleared={stageCleared}
          />
        </section>
        <aside className="flex w-full flex-col gap-4 p-4 pt-1 lg:w-80 lg:shrink-0 lg:p-0">
          <StatusBadge />
          {commandError && (
            <CommandError
              message={commandError}
              onDismiss={() => setCommandError(null)}
            />
          )}
          <ModeInput
            hasVideo={state.hasVideo}
            started={state.started}
            paused={state.paused}
            mode={mode}
            modelSeed={state.seed}
            onModeChange={setMode}
            onSource={setSourceUrl}
            resetNonce={resetNonce}
          />
          <Prompt key={resetNonce} currentPrompt={state.currentPrompt} />
          <SnapClip />
        </aside>
      </main>
    </div>
  );
}
