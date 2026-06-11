"use client";

import {
  ReactorProvider,
  useReactor,
  useReactorMessage,
} from "@reactor-team/js-sdk";
import { useEffect, useRef, useState } from "react";
import { DEFAULT_STATE, type SanaMessage, type SanaMode } from "./lib/types";
import { reduce } from "./lib/state";
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
  // play it side-by-side. The ref mirrors the state so disconnect/unmount
  // cleanup can revoke without stale-closure issues.
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const sourceUrlRef = useRef<string | null>(null);
  const updateSourceUrl = (url: string | null) => {
    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
    sourceUrlRef.current = url;
    setSourceUrl(url);
  };

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

  // Bumped on generation_reset so child components can clear their local
  // UI state (file selection, prompt draft) in step with the model's reset.
  const [resetNonce, setResetNonce] = useState(0);

  // After reset, black out the stage (the WebRTC view would otherwise freeze
  // on the last transformed frame). Lifts when generation runs again.
  const [stageCleared, setStageCleared] = useState(false);
  useEffect(() => {
    if (state.running) setStageCleared(false);
  }, [state.running]);

  useReactorMessage((msg: SanaMessage) => {
    setState((s) => reduce(s, msg));
    if (msg.type === "command_error") {
      const err = msg as Extract<SanaMessage, { type: "command_error" }>;
      // set_video "decode failed" is a transient model-side probe race that
      // FileInput auto-retries (and surfaces inline if retries run out).
      // Don't flash the banner for it.
      const retriedByFileInput =
        err.data.command === "set_video" &&
        err.data.reason.startsWith("decode failed");
      if (!retriedByFileInput) showCommandError(err.data.reason);
    }
    if (msg.type === "generation_reset") {
      // Model reset clears its source video + prompt; mirror that locally.
      updateSourceUrl(null);
      setResetNonce((n) => n + 1);
      setStageCleared(true);
    }
  });

  // Reset local state on full disconnect so a reconnect starts clean.
  useEffect(() => {
    if (status === "disconnected") {
      setState(DEFAULT_STATE);
      setCommandError(null);
      updateSourceUrl(null);
    }
    // updateSourceUrl is stable enough for this effect; status is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // Clean up the auto-dismiss timer + source object URL on unmount.
  useEffect(() => {
    return () => {
      if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
      if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
    };
  }, []);

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      {/* Mobile: the stage is ordered first and pinned (sticky) so the model
          output stays visible while the controls scroll beneath it. The
          mobile padding lives on the children, not <main>, so the sticky
          stage can sit flush against the viewport edge with a solid
          backdrop. Desktop keeps the sidebar-left / stage-right split. */}
      <main className="flex flex-1 flex-col lg:flex-row lg:gap-6 lg:p-6">
        <aside className="order-2 flex w-full flex-col gap-4 p-4 pt-1 lg:order-none lg:w-80 lg:shrink-0 lg:p-0">
          <StatusBadge />
          {commandError && (
            <CommandError
              message={commandError}
              onDismiss={() => setCommandError(null)}
            />
          )}
          <ModeInput
            state={state}
            mode={mode}
            onModeChange={setMode}
            onSource={updateSourceUrl}
            resetNonce={resetNonce}
          />
          <Prompt currentPrompt={state.currentPrompt} resetNonce={resetNonce} />
          <Transport
            paused={state.paused}
            started={state.started}
            modelSeed={state.seed}
          />
          <SnapClip />
        </aside>
        <section className="order-1 flex flex-col gap-4 max-lg:sticky max-lg:top-0 max-lg:z-10 max-lg:bg-zinc-950/95 max-lg:p-4 max-lg:pb-3 max-lg:backdrop-blur-sm lg:order-none lg:flex-1">
          <Stage
            state={state}
            mode={mode}
            sourceUrl={sourceUrl}
            cleared={stageCleared}
          />
        </section>
      </main>
    </div>
  );
}
