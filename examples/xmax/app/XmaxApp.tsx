"use client";

// XMAX X2 — REFERENCE FRONTEND
//
// X2 is a real-time streaming video-to-video editing model: it edits
// whatever arrives on the `camera` track, live, steered by a text
// prompt you can swap mid-stream.
//
// Unlike the sibling examples that ship a typed `@reactor-models/*`
// package, XMAX has no typed SDK package yet, so this app talks to it
// through the base `@reactor-team/js-sdk` surface directly:
//
//   <ReactorProvider modelName="xmax/x2" />      — session lifecycle
//   useReactor((s) => …)                         — status + sendCommand
//   sendCommand("set_prompt", { prompt })        — model commands
//   useReactorMessage((raw) => …)                — model → client msgs
//   <ReactorView track="main_video" />           — the live output
//
// When the typed `@reactor-models/xmax` package ships, the same
// commands map onto typed methods (`setPrompt`, `useXmaxState`, …);
// until then the generic surface is the whole story.
import {
  ReactorProvider,
  useReactor,
  useReactorMessage,
} from "@reactor-team/js-sdk";
import { useEffect, useRef, useState } from "react";
import { DEFAULT_STATE, type XmaxMode } from "./lib/types";
import { isStateMessage, reduce } from "./lib/state";
import { Header } from "./components/Header";
import { StatusBadge } from "./components/StatusBadge";
import { CommandError } from "./components/CommandError";
import { ModeInput } from "./components/ModeInput";
import { Prompt } from "./components/Prompt";
import { Stage } from "./components/Stage";
import { SnapClip } from "./components/SnapClip";
import { useCameraPublisher } from "./components/useCameraPublisher";

// The Reactor API the SDK talks to. Override with
// NEXT_PUBLIC_REACTOR_API_URL for local / staging environments;
// defaults to production.
const REACTOR_API_URL =
  process.env.NEXT_PUBLIC_REACTOR_API_URL || "https://api.reactor.inc";

// JWT resolver passed to <ReactorProvider getJwt>. The SDK calls it on every
// Reactor API request, so it must be a resolver, not a static string. The
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
export function XmaxApp() {
  return (
    <ReactorProvider
      modelName="xmax/x2"
      apiUrl={REACTOR_API_URL}
      getJwt={fetchToken}
      connectOptions={{ autoConnect: false }}
    >
      <Workspace />
    </ReactorProvider>
  );
}

const BANNER_TTL_MS = 6000;

// The client tree. The model is the source of truth: only `state` messages
// mutate the reducer, and every control gates off the reduced XmaxState
// rather than local guesses. Everything else (command_error banner,
// generation_reset bookkeeping) is handled imperatively here.
function Workspace() {
  const status = useReactor((s) => s.status);

  const [state, setState] = useState(DEFAULT_STATE);
  // Webcam is the default source; switch to a clip to stream a pre-recorded
  // video into the model instead. Both feed the same `camera` track.
  const [mode, setMode] = useState<XmaxMode>("webcam");

  // The active input source (webcam self-view or the video pane) produces a
  // track; one owner publishes it to `camera`. See useCameraPublisher.
  const [camTrack, setCamTrack] = useState<MediaStreamTrack | null>(null);
  const publishError = useCameraPublisher(camTrack);

  // URL of the clip selected in "video" mode (object URL for a local file, or
  // a preset's path). Owned here so the stage's input pane can stream it; the
  // setter revokes the previous object URL.
  const [videoUrl, setVideoUrlState] = useState<string | null>(null);
  const setVideoUrl = (url: string | null) =>
    setVideoUrlState((prev) => {
      if (prev && prev !== url && prev.startsWith("blob:")) {
        URL.revokeObjectURL(prev);
      }
      return url;
    });
  useEffect(() => {
    return () => {
      if (videoUrl && videoUrl.startsWith("blob:"))
        URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

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
  // hold local draft state (prompt draft), remounting them in step with the
  // model's reset.
  const [resetNonce, setResetNonce] = useState(0);

  // After reset, black out the stage (the WebRTC view would otherwise freeze
  // on the last transformed frame). Lifts when generation runs again.
  const [stageCleared, setStageCleared] = useState(false);
  useEffect(() => {
    if (state.running) setStageCleared(false);
  }, [state.running]);

  // The model is the source of truth: only `state` snapshots feed the
  // reducer. The base SDK delivers all model messages through one untyped
  // stream, so this handler is the single switch over `msg.type`; the typed
  // package will split it into per-message hooks.
  useReactorMessage((raw) => {
    const msg = raw as { type?: string; reason?: string };
    if (isStateMessage(raw)) {
      setState((s) => reduce(s, raw));
    } else if (msg.type === "command_error") {
      showCommandError(msg.reason ?? "command failed its preconditions");
    } else if (msg.type === "generation_reset") {
      setResetNonce((n) => n + 1);
      setStageCleared(true);
    }
  });

  // Reset local state on full disconnect so a reconnect starts clean.
  useEffect(() => {
    if (status === "disconnected") {
      setState(DEFAULT_STATE);
      setCommandError(null);
      setVideoUrl(null);
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
            videoUrl={videoUrl}
            cleared={stageCleared}
            onTrack={setCamTrack}
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
          {publishError && (
            <p className="text-xs text-red-400">
              Publish error: {publishError}
            </p>
          )}
          <ModeInput
            started={state.started}
            paused={state.paused}
            mode={mode}
            hasVideoUrl={!!videoUrl}
            onModeChange={setMode}
            onSelectVideo={(url) => setVideoUrl(url)}
            onTrack={setCamTrack}
          />
          <Prompt key={resetNonce} currentPrompt={state.currentPrompt} />
          <SnapClip />
        </aside>
      </main>
    </div>
  );
}
