"use client";

import {
  ReactorProvider,
  useReactor,
  useReactorMessage,
} from "@reactor-team/js-sdk";
import { useEffect, useRef, useState } from "react";
import { DEFAULT_STATE, type SanaMessage, type SanaMode } from "./lib/types";
import { isTransientDecodeFailure, reduce } from "./lib/state";
import { Header } from "./components/Header";
import { StatusBadge } from "./components/StatusBadge";
import { CommandError } from "./components/CommandError";
import { ModeInput } from "./components/ModeInput";
import { Prompt } from "./components/Prompt";
import { Transport } from "./components/Transport";
import { Stage } from "./components/Stage";
import { SnapClip } from "./components/SnapClip";

// JWT resolver passed to <ReactorProvider getJwt>. The SDK calls this on
// every Coordinator HTTP hop, so it must be a resolver, not a static string.
// The /api/reactor/token route returns the JWT with a Cache-Control header,
// so the browser caches it until it actually expires.
async function fetchToken(): Promise<string> {
  const r = await fetch("/api/reactor/token");
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Token fetch failed: ${r.status}`);
  }
  const { jwt } = (await r.json()) as { jwt: string };
  return jwt;
}

// The model name the SDK opens sessions against. sana-streaming has no typed
// @reactor-models package, so this example drives the generic SDK directly
// and names the model here.
const MODEL_NAME = "sana-streaming";

// No `autoConnect`: the user clicks Connect so they see the
// disconnected -> connecting -> waiting -> ready state machine first-hand.
export function SanaStreamingApp() {
  return (
    <ReactorProvider getJwt={fetchToken} modelName={MODEL_NAME}>
      <Workspace />
    </ReactorProvider>
  );
}

const BANNER_TTL_MS = 6000;

// The client tree. The model is the source of truth: only `state` messages
// mutate the reducer, and every control gates off the reduced SanaState
// rather than local guesses. Everything else (command_error banner,
// generation_reset bookkeeping) is handled imperatively here.
function Workspace() {
  const status = useReactor((s) => s.status);

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

  useReactorMessage((msg: SanaMessage) => {
    setState((s) => reduce(s, msg));
    // Transient set_video "decode failed" errors are auto-retried by
    // FileInput (and surfaced inline if retries run out); don't flash the
    // banner for them.
    if (msg.type === "command_error" && !isTransientDecodeFailure(msg)) {
      showCommandError(msg.data.reason);
    }
    if (msg.type === "generation_reset") {
      // Model reset clears its source video + prompt; mirror that locally.
      setSourceUrl(null);
      setResetNonce((n) => n + 1);
      setStageCleared(true);
    }
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
        <section className="flex flex-col gap-4 max-lg:sticky max-lg:top-0 max-lg:z-10 max-lg:bg-zinc-950/95 max-lg:p-4 max-lg:pb-3 max-lg:backdrop-blur-sm lg:flex-1">
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
            running={state.running}
            hasVideo={state.hasVideo}
            mode={mode}
            onModeChange={setMode}
            onSource={setSourceUrl}
            resetNonce={resetNonce}
          />
          <Prompt key={resetNonce} currentPrompt={state.currentPrompt} />
          <Transport
            paused={state.paused}
            started={state.started}
            modelSeed={state.seed}
          />
          <SnapClip />
        </aside>
      </main>
    </div>
  );
}
