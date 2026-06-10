# SANA Streaming Example Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `examples/sana-streaming`, a runnable Next.js example for Reactor's SANA V2V streaming video editor, built as a true sibling of helios / lingbot / longlive-v2 by rewriting the standalone `sana-streaming-demo` into the house idiom.

**Architecture:** Standalone Next.js 15 / React 19 / Tailwind v4 / TS app, own pnpm workspace root. Model integration uses the generic `@reactor-team/js-sdk` (no typed `@reactor-models/*` package exists for sana). Theming, structure, auth route, `ui/` primitives, `SetupRequired` gate, and docs all follow longlive-v2. The model is the source of truth: only `state` messages mutate local state.

**Tech Stack:** Next.js 15 (App Router), React 19, Tailwind v4, `@reactor-team/js-sdk@2.11.2` (exact pin), `@reactor-team/ui@^1.4.1`, TypeScript.

**Reference paths:**
- House idiom (copy-from): `/Users/whp/Reactor/js-sdk/examples/longlive-v2`
- Behavioral reference (rewrite-from): `/Users/whp/Reactor/sana-streaming-demo`
- New example (create): `/Users/whp/Reactor/js-sdk/examples/sana-streaming`

**Conventions:**
- No em-dashes in prose or comments (repo owner preference).
- No AI attribution in commit messages.
- Per-task verification gate: `cd examples/sana-streaming && pnpm build` must succeed (Next.js build runs the type-checker). Use `pnpm dev` for visual checks. There is no test runner.
- Commit after each task. Use short conventional-commit subjects.

---

## Phase 0 - Scaffold from longlive-v2

### Task 0.1: Copy the config skeleton

**Files (create in `examples/sana-streaming/`):** `.gitignore`, `next.config.ts`, `postcss.config.mjs`, `tsconfig.json`, `next-env.d.ts`, `pnpm-workspace.yaml`.

**Step 1:** Copy each verbatim from `examples/longlive-v2/` (they are model-agnostic):

```bash
cd /Users/whp/Reactor/js-sdk
mkdir -p examples/sana-streaming/app/api/reactor/token \
         examples/sana-streaming/app/components/ui \
         examples/sana-streaming/app/lib \
         examples/sana-streaming/skill \
         examples/sana-streaming/public/clips
cp examples/longlive-v2/.gitignore examples/sana-streaming/.gitignore
cp examples/longlive-v2/next.config.ts examples/sana-streaming/next.config.ts
cp examples/longlive-v2/postcss.config.mjs examples/sana-streaming/postcss.config.mjs
cp examples/longlive-v2/tsconfig.json examples/sana-streaming/tsconfig.json
cp examples/longlive-v2/next-env.d.ts examples/sana-streaming/next-env.d.ts
cp examples/longlive-v2/pnpm-workspace.yaml examples/sana-streaming/pnpm-workspace.yaml
```

**Step 2:** Verify the six files exist. No content changes needed (none reference the model name).

**Step 3:** Commit.
```bash
git add examples/sana-streaming
git commit -m "scaffold(sana-streaming): config skeleton from longlive-v2"
```

### Task 0.2: package.json + .env.example

**Files:** Create `examples/sana-streaming/package.json`, `examples/sana-streaming/.env.example`.

**Step 1:** Write `package.json`. Note the exact SDK pin (`2.11.2`, no caret), no `zustand` / `hls.js` (sana needs neither), no `lucide-react`, no `vitest`:

```json
{
  "name": "sana-streaming",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "@reactor-team/js-sdk": "2.11.2",
    "@reactor-team/ui": "^1.4.1",
    "next": "^15.5.0",
    "react": "^19.1.0",
    "react-dom": "^19.1.0"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4.1.0",
    "@types/node": "^20.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "tailwindcss": "^4.1.0",
    "typescript": "^5.9.0"
  }
}
```

**Step 2:** Write `.env.example` (single var, matching siblings):
```
REACTOR_API_KEY=rk_your_api_key_here
```

**Step 3:** Commit.
```bash
git add examples/sana-streaming/package.json examples/sana-streaming/.env.example
git commit -m "scaffold(sana-streaming): package.json (SDK pinned 2.11.2) + env example"
```

### Task 0.3: Install and lock

**Step 1:** Install in the example's own workspace (the `pnpm-workspace.yaml` makes it its own root):
```bash
cd /Users/whp/Reactor/js-sdk/examples/sana-streaming
pnpm install
```
Expected: resolves cleanly and writes `pnpm-lock.yaml`. If `@reactor-team/ui` reports a peer conflict against `@reactor-team/js-sdk@2.11.2`, STOP and report the exact peer range before proceeding (do not bump the SDK pin without confirming the runtime implications in the design doc).

**Step 2:** Commit the lockfile (deterministic install is required for the release):
```bash
cd /Users/whp/Reactor/js-sdk
git add examples/sana-streaming/pnpm-lock.yaml
git commit -m "scaffold(sana-streaming): commit lockfile"
```

---

## Phase 1 - Shared UI primitives + base-SDK pieces (verbatim copies)

### Task 1.1: Copy the `ui/` primitives

**Files:** Copy all of `examples/longlive-v2/app/components/ui/` into `examples/sana-streaming/app/components/ui/`:
`ui.ts`, `Icon.tsx`, `Panel.tsx`, `Button.tsx`, `IconButton.tsx`, `SegmentedToggle.tsx`, `index.ts`.

```bash
cd /Users/whp/Reactor/js-sdk
cp examples/longlive-v2/app/components/ui/*.{ts,tsx} examples/sana-streaming/app/components/ui/
```

**Step 1:** In `ui/ui.ts`, delete the longlive-specific chunk helpers that sana does not use: `CHUNK_SECONDS`, `secs`, and `timecode`. Keep `cn`, `EYEBROW`, `PANEL`, `FOCUS_RING`. (Leaving them is harmless but dead; remove for cleanliness.)

**Step 2:** `Icon.tsx` already includes `play`, `pause`, `reset`, `x`, `scissors`, `download`, `check` - all sana needs. No change.

**Step 3:** Commit.
```bash
git add examples/sana-streaming/app/components/ui
git commit -m "feat(sana-streaming): shared ui primitives"
```

### Task 1.2: Copy the token route

**Files:** Copy `examples/longlive-v2/app/api/reactor/token/route.ts` → `examples/sana-streaming/app/api/reactor/token/route.ts` verbatim. It is model-agnostic (reads `REACTOR_API_KEY`, POSTs to `https://api.reactor.inc/tokens`, caches by `expires_at`).

**Step 1:** Copy the file. No edits.

**Step 2:** Commit.
```bash
git add examples/sana-streaming/app/api
git commit -m "feat(sana-streaming): JWT token route"
```

### Task 1.3: Copy SnapClip

**Files:** Copy `examples/longlive-v2/app/components/SnapClip.tsx` → `examples/sana-streaming/app/components/SnapClip.tsx` verbatim. It depends only on `@reactor-team/js-sdk` (`useReactor`, `requestClip`, `ClipPlayer`, `ClipDownloadButton`, `RecordingError`, `Clip`) and the local `ui/`. No model-specific imports.

**Step 1:** Copy the file. No edits.

**Step 2:** Commit.
```bash
git add examples/sana-streaming/app/components/SnapClip.tsx
git commit -m "feat(sana-streaming): snap-clip recording panel"
```

---

## Phase 2 - Domain model (lib, copied from demo)

### Task 2.1: Copy the reducer + data

**Files (create):**
- `app/lib/types.ts` - copy verbatim from `sana-streaming-demo/lib/types.ts` (`SanaMode`, `SanaState`, `DEFAULT_STATE`, `SanaMessage`).
- `app/lib/state.ts` - copy from `sana-streaming-demo/lib/state.ts`, but change the import to a relative path: `import { SanaState, SanaMessage } from "./types";` (already relative - keep as-is).
- `app/lib/clips.ts` - copy verbatim (`PRESET_CLIPS`, points at `/clips/replace-background-softly.mp4`).
- `app/lib/examples.ts` - copy verbatim (`PROMPT_EXAMPLES`).

**Step 1:** Copy the four files.

**Step 2:** Copy the preset clip asset:
```bash
cp /Users/whp/Reactor/sana-streaming-demo/public/clips/replace-background-softly.mp4 \
   /Users/whp/Reactor/js-sdk/examples/sana-streaming/public/clips/
```

**Step 3:** Verify imports use relative paths (`./types`), not `@/lib/...`, to match sibling style.

**Step 4:** Commit.
```bash
git add examples/sana-streaming/app/lib examples/sana-streaming/public
git commit -m "feat(sana-streaming): state reducer, preset clips, prompt examples"
```

---

## Phase 3 - App shell + theming + auth wiring

### Task 3.1: globals.css + layout.tsx

**Files (create):** `app/globals.css`, `app/layout.tsx`.

**Step 1:** `app/globals.css` - copy from `examples/longlive-v2/app/globals.css` verbatim. It imports tailwind, aliases `--color-brand` / `--color-brand-fg` / `--color-active` and the fonts from `@reactor-team/ui` via `@theme`, and sets the zinc background. No sana-specific change.

**Step 2:** `app/layout.tsx`:
```tsx
import type { Metadata } from "next";
import "@reactor-team/ui/styles.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "SANA Streaming",
  description: "Real-time video-to-video editing with Reactor + SANA",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">
        {children}
      </body>
    </html>
  );
}
```

**Step 3:** Commit.
```bash
git add examples/sana-streaming/app/globals.css examples/sana-streaming/app/layout.tsx
git commit -m "feat(sana-streaming): theming + root layout"
```

### Task 3.2: SetupRequired + page.tsx

**Files (create):** `app/SetupRequired.tsx`, `app/page.tsx`.

**Step 1:** `app/SetupRequired.tsx` - copy from `examples/longlive-v2/app/SetupRequired.tsx`. It imports `Header` and `ui` from `./components`. Keep as-is; the only sana coupling is the `Header` import, which Task 4.1 will provide with sana copy.

**Step 2:** `app/page.tsx`:
```tsx
import { SanaStreamingApp } from "./SanaStreamingApp";
import { SetupRequired } from "./SetupRequired";

// Server Component. Checks whether REACTOR_API_KEY is configured and renders
// the right tree: missing key -> <SetupRequired/>, present -> <SanaStreamingApp/>
// (which fetches its own JWT via /api/reactor/token). force-dynamic so the env
// check runs per-request.
export const dynamic = "force-dynamic";

export default function Page() {
  const hasKey = !!process.env.REACTOR_API_KEY;
  return hasKey ? <SanaStreamingApp /> : <SetupRequired />;
}
```

**Step 3:** Commit (will not build until Task 3.3 + Phase 4 land the imports; that is fine, commit anyway and let the Phase-4 gate verify).
```bash
git add examples/sana-streaming/app/SetupRequired.tsx examples/sana-streaming/app/page.tsx
git commit -m "feat(sana-streaming): env-gated page + setup landing"
```

### Task 3.3: SanaStreamingApp shell

**Files (create):** `app/SanaStreamingApp.tsx`.

This is the client shell. It owns the cross-cutting Demo state that `sana-streaming-demo/components/Demo.tsx` owned (reducer state, sourceUrl, command-error banner, resetNonce, stageCleared) and lays out Header + sidebar + Stage in the longlive-v2 layout. Wraps everything in the generic `<ReactorProvider>`.

**Step 1:** Write the file. Port the message-handling and state logic from `Demo.tsx` verbatim (it is model-correct); only the JSX layout and the provider wrapper are new:

```tsx
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

// JWT resolver. The SDK calls this on every Coordinator HTTP hop, so it must be
// a resolver, not a static string. /api/reactor/token returns the JWT with a
// Cache-Control header so the browser caches it until it expires.
async function fetchToken(): Promise<string> {
  const r = await fetch("/api/reactor/token");
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Token fetch failed: ${r.status}`);
  }
  const { jwt } = (await r.json()) as { jwt: string };
  return jwt;
}

// The model name the SDK opens sessions against. sana has no typed
// @reactor-models package, so we drive the generic SDK and name the model here.
const MODEL_NAME = "sana-streaming";

export function SanaStreamingApp() {
  return (
    <ReactorProvider getJwt={fetchToken} modelName={MODEL_NAME}>
      <Workspace />
    </ReactorProvider>
  );
}

const BANNER_TTL_MS = 6000;

function Workspace() {
  const status = useReactor((s) => s.status);

  const [state, setState] = useState(DEFAULT_STATE);
  // Live is the headline feature; land users on it. Start flows send set_mode
  // explicitly, so the model's own default does not matter.
  const [mode, setMode] = useState<SanaMode>("live");

  // Object URL of the last uploaded source clip, owned here so Stage can play
  // it side-by-side. The ref mirrors state so cleanup can revoke without a
  // stale closure.
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const sourceUrlRef = useRef<string | null>(null);
  const updateSourceUrl = (url: string | null) => {
    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
    sourceUrlRef.current = url;
    setSourceUrl(url);
  };

  // command_error banner, transient and outside the reducer.
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

  // Bumped on generation_reset so children clear their local UI in step with
  // the model reset.
  const [resetNonce, setResetNonce] = useState(0);

  // After reset, black out the stage (the WebRTC view freezes on the last
  // frame). Lifts when generation runs again.
  const [stageCleared, setStageCleared] = useState(false);
  useEffect(() => {
    if (state.running) setStageCleared(false);
  }, [state.running]);

  useReactorMessage((msg: SanaMessage) => {
    setState((s) => reduce(s, msg));
    if (msg.type === "command_error") {
      const err = msg as Extract<SanaMessage, { type: "command_error" }>;
      // set_video "decode failed" is a transient probe race that FileInput
      // auto-retries (and surfaces inline if retries run out). Do not flash
      // the banner for it.
      const retriedByFileInput =
        err.data.command === "set_video" &&
        err.data.reason.startsWith("decode failed");
      if (!retriedByFileInput) showCommandError(err.data.reason);
    }
    if (msg.type === "generation_reset") {
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

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
      if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
    };
  }, []);

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex flex-1 flex-col gap-4 p-4 lg:flex-row lg:gap-6 lg:p-6">
        <aside className="flex w-full flex-col gap-4 lg:w-80 lg:shrink-0">
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
          {state.started && (
            <Transport
              paused={state.paused}
              started={state.started}
              modelSeed={state.seed}
            />
          )}
          <SnapClip />
        </aside>
        <section className="flex flex-1 flex-col gap-4">
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
```

Notes for the implementer:
- `CommandError` here is a presentational banner (props in), not the longlive self-subscribing version. Task 4.2 builds it to this prop shape. This keeps the decode-failed suppression logic in one place (the shell), matching the demo.
- The prompt-preset chips in the demo lived in the Sidebar and set the prompt textarea. In this rewrite they live inside `Prompt` (Task 4.5), which owns its own draft text + preset chips, so the shell does not thread prompt text. That is a deliberate simplification; verify presets still send `set_prompt` when ready.

**Step 2:** Commit.
```bash
git add examples/sana-streaming/app/SanaStreamingApp.tsx
git commit -m "feat(sana-streaming): app shell + provider + message routing"
```

---

## Phase 4 - Components (rewritten into the ui idiom)

For every component: `"use client"` at top where it uses hooks, import primitives from `./ui`, gate all `sendCommand` calls on `status === "ready"`, preserve the exact command/track names. Replace demo Tailwind (`bg-gold`, `gold-btn`, `text-white/50`) with ui primitives and zinc/brand tokens.

### Task 4.1: Header

**File:** `app/components/Header.tsx`. Adapt longlive's Header (server component, no hooks):

```tsx
import { cn, EYEBROW } from "./ui";

export function Header() {
  return (
    <header className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/40 px-4 py-3 lg:px-6">
      <div className="flex items-baseline gap-3">
        <h1 className="text-sm font-semibold tracking-tight text-zinc-100">
          SANA Streaming
        </h1>
        <span className={cn(EYEBROW, "hidden border-l border-zinc-800 pl-3 sm:inline")}>
          Real-time video-to-video
        </span>
      </div>
      <span className={EYEBROW}>Powered by Reactor</span>
    </header>
  );
}
```

Commit: `feat(sana-streaming): header`.

### Task 4.2: CommandError (presentational banner)

**File:** `app/components/CommandError.tsx`. Prop-driven (the shell owns the decode-suppression and TTL):

```tsx
import { cn, EYEBROW, PANEL } from "./ui";

export function CommandError({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  return (
    <div className={cn(PANEL, "border-red-900/50 bg-red-950/20 p-3")} role="alert">
      <div className="flex items-start justify-between gap-2">
        <span className={cn(EYEBROW, "text-red-500")}>Command failed</span>
        <button
          type="button"
          aria-label="Dismiss error"
          onClick={onDismiss}
          className="text-red-400/60 transition hover:text-red-300"
        >
          ✕
        </button>
      </div>
      <p className="mt-1 text-sm text-red-300">{message}</p>
    </div>
  );
}
```

Commit: `feat(sana-streaming): command-error banner`.

### Task 4.3: StatusBadge (Connect/Disconnect)

**File:** `app/components/StatusBadge.tsx`. Mirror longlive's StatusBadge but use generic `useReactor` selectors instead of the typed hook:

```tsx
"use client";

import { useReactor } from "@reactor-team/js-sdk";
import { Button, Panel, cn } from "./ui";

// Surfaces the four-state connection machine so SDK learners see every
// transition: disconnected -> connecting -> waiting -> ready.
const TONE: Record<string, { dot: string; label: string }> = {
  disconnected: { dot: "bg-zinc-500", label: "Disconnected" },
  connecting: { dot: "bg-blue-500 animate-pulse", label: "Connecting…" },
  waiting: { dot: "bg-blue-500 animate-pulse", label: "Waiting for GPU…" },
  ready: { dot: "bg-active animate-pulse", label: "Connected" },
};

export function StatusBadge() {
  const { status, lastError, connect, disconnect } = useReactor((s) => ({
    status: s.status,
    lastError: s.lastError,
    connect: s.connect,
    disconnect: s.disconnect,
  }));
  const tone = TONE[status] ?? TONE.disconnected;
  const idle = status === "disconnected";

  return (
    <Panel>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={cn("h-2 w-2 rounded-full", tone.dot)} />
          <span className="text-sm text-zinc-200">{tone.label}</span>
        </div>
        {idle ? (
          <Button variant="primary" size="sm" onClick={() => connect()}>
            Connect
          </Button>
        ) : (
          <Button variant="secondary" size="sm" onClick={() => disconnect()}>
            Disconnect
          </Button>
        )}
      </div>
      {lastError && <p className="mt-2 text-xs text-red-400">{lastError.message}</p>}
    </Panel>
  );
}
```

Implementer check: confirm `useReactor((s) => ({...}))` object-selector form is supported (it is a zustand store; if it warns about new object identity each render, switch to individual selectors). Verify `s.lastError` exists on the store (it is typed at `index.d.ts:714`).

Commit: `feat(sana-streaming): status badge with connect/disconnect`.

### Task 4.4: ModeInput (mode toggle + active input)

**File:** `app/components/ModeInput.tsx`. Combines the demo Sidebar's mode toggle with the input-slot switch, wrapped in a `Panel`. Uses `SegmentedToggle` for the toggle:

```tsx
"use client";

import { useReactor } from "@reactor-team/js-sdk";
import { Panel, SegmentedToggle } from "./ui";
import type { SanaMode, SanaState } from "../lib/types";
import { LiveInput } from "./LiveInput";
import { FileInput } from "./FileInput";

export function ModeInput({
  state,
  mode,
  onModeChange,
  onSource,
  resetNonce,
}: {
  state: SanaState;
  mode: SanaMode;
  onModeChange: (m: SanaMode) => void;
  onSource: (url: string) => void;
  resetNonce: number;
}) {
  const sendCommand = useReactor((s) => s.sendCommand);
  const status = useReactor((s) => s.status);

  const handleModeChange = (m: SanaMode) => {
    if (state.running) return; // toggle disabled while running
    onModeChange(m);
    // Only send when connected, to avoid queuing a stale set_mode.
    if (status === "ready") sendCommand("set_mode", { mode: m }).catch(console.error);
  };

  return (
    <Panel label="Input">
      <div className={state.running ? "pointer-events-none opacity-40" : ""}>
        <SegmentedToggle
          aria-label="Input mode"
          value={mode}
          onChange={handleModeChange}
          options={[
            { value: "live", label: "Live" },
            { value: "file", label: "File" },
          ]}
        />
      </div>
      <div className="mt-3">
        {mode === "live" ? (
          <LiveInput running={state.running} />
        ) : (
          <FileInput
            hasVideo={state.hasVideo}
            running={state.running}
            onSource={onSource}
            resetNonce={resetNonce}
          />
        )}
      </div>
    </Panel>
  );
}
```

Commit: `feat(sana-streaming): mode toggle + input slot`.

### Task 4.5: Prompt (textarea + Apply + presets)

**File:** `app/components/Prompt.tsx`. Merges the demo's Sidebar prompt section + PromptBox into one component owning its draft text. Preset chips set the draft and send `set_prompt` when ready. Uses `Button` (primary) for Apply:

```tsx
"use client";

import { useReactor } from "@reactor-team/js-sdk";
import { useEffect, useState } from "react";
import { Button, Panel, cn, EYEBROW } from "./ui";
import { PROMPT_EXAMPLES } from "../lib/examples";

export function Prompt({
  currentPrompt,
  resetNonce,
}: {
  currentPrompt: string | null;
  resetNonce: number;
}) {
  const sendCommand = useReactor((s) => s.sendCommand);
  const status = useReactor((s) => s.status);
  const [text, setText] = useState("");

  // Model reset clears its active prompt; clear the draft to match.
  useEffect(() => {
    if (resetNonce > 0) setText("");
  }, [resetNonce]);

  const ready = status === "ready";
  const apply = (prompt: string) => {
    if (!ready) return;
    sendCommand("set_prompt", { prompt }).catch(console.error);
  };
  const applyPreset = (prompt: string) => {
    setText(prompt);
    apply(prompt);
  };

  return (
    <Panel label="Prompt">
      <div className="mb-2 flex flex-wrap gap-1.5">
        {PROMPT_EXAMPLES.map((ex) => (
          <button
            key={ex.label}
            type="button"
            onClick={() => applyPreset(ex.prompt)}
            className="rounded border border-zinc-700 px-2 py-0.5 text-xs text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200"
          >
            {ex.label}
          </button>
        ))}
      </div>
      <textarea
        aria-label="Prompt"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Describe the edit. Changes apply live, about one chunk later."
        rows={3}
        className="w-full resize-none rounded-md border border-zinc-700 bg-zinc-900/40 px-3 py-2 font-mono text-sm leading-relaxed text-zinc-200 outline-none transition placeholder:text-zinc-600 focus:border-brand/60"
      />
      <Button
        variant="primary"
        size="md"
        onClick={() => apply(text)}
        disabled={!text.trim() || !ready}
        className="mt-2 w-full"
      >
        Apply prompt
      </Button>
      {currentPrompt && (
        <p className={cn(EYEBROW, "mt-2 normal-case tracking-normal text-zinc-500")}>
          active: “{currentPrompt}”
        </p>
      )}
    </Panel>
  );
}
```

Commit: `feat(sana-streaming): prompt box with presets`.

### Task 4.6: Transport (pause/resume/reset + seed)

**File:** `app/components/Transport.tsx`. Use `IconButton` (icons `play`/`pause`/`reset`) and a seed number input, wrapped in a `Panel`:

```tsx
"use client";

import { useReactor } from "@reactor-team/js-sdk";
import { useEffect, useState } from "react";
import { Panel, IconButton, cn, EYEBROW } from "./ui";

export function Transport({
  paused,
  started,
  modelSeed,
}: {
  paused: boolean;
  started: boolean;
  modelSeed: number;
}) {
  const sendCommand = useReactor((s) => s.sendCommand);
  const status = useReactor((s) => s.status);
  const [seed, setSeed] = useState(modelSeed);

  useEffect(() => setSeed(modelSeed), [modelSeed]);

  const notReady = status !== "ready";
  const send = (cmd: string, data: Record<string, unknown> = {}) =>
    sendCommand(cmd, data).catch(console.error);

  return (
    <Panel label="Transport">
      <div className="flex items-center gap-2">
        {started &&
          (paused ? (
            <IconButton icon="play" label="Resume" disabled={notReady} onClick={() => send("resume")} />
          ) : (
            <IconButton icon="pause" label="Pause" disabled={notReady} onClick={() => send("pause")} />
          ))}
        <IconButton icon="reset" label="Reset" tone="danger" disabled={notReady} onClick={() => send("reset")} />
        <label className="ml-auto flex items-center gap-1.5">
          <span className={EYEBROW}>Seed</span>
          <input
            type="number"
            min={0}
            value={seed}
            disabled={notReady}
            onChange={(e) => setSeed(+e.target.value)}
            onBlur={() => send("set_seed", { seed })}
            className={cn(
              "w-20 rounded-md border border-zinc-700 bg-zinc-900/40 px-2 py-1 font-mono text-xs text-zinc-200 outline-none transition focus:border-brand/60 disabled:opacity-40",
            )}
          />
        </label>
      </div>
    </Panel>
  );
}
```

Commit: `feat(sana-streaming): transport controls + seed`.

### Task 4.7: LiveInput (preserve the publish constraint)

**File:** `app/components/LiveInput.tsx`. Port `sana-streaming-demo/components/LiveInput.tsx` ALMOST VERBATIM. The camera-acquire / `contentHint = "detail"` / manual `publish` / re-publish-on-reconnect / unpublish-on-unmount logic is model-critical and must not change. Only swap the styling: the gold-shimmer Start button becomes `<Button variant="primary" className="w-full">Start live</Button>`, and zinc/brand tokens replace `text-white/40` etc. Keep the self-view `<video>`, the denied/error states, the `acquiring camera…` / `waiting for connection…` hints, and `data-testid="start-live"`.

Critical lines to preserve exactly:
```ts
videoTrack.contentHint = "detail"; // hold resolution; adapt framerate
await publish("camera", videoTrack);
// start flow:
sendCommand("set_mode", { mode: "live" }).then(() => sendCommand("start", {}));
```

Commit: `feat(sana-streaming): live webcam input`.

### Task 4.8: FileInput (preserve the decode-retry)

**File:** `app/components/FileInput.tsx`. Port `sana-streaming-demo/components/FileInput.tsx` ALMOST VERBATIM. Preserve: `DECODE_RETRIES = 2`, the `useReactorMessage` retry handler keyed on `set_video` + "decode failed", `uploadFile` -> `set_video` flow, preset-clip fetch->File->upload, the `start` flow, and all `data-testid`s. Change only the styling to ui primitives / zinc tokens, and the Start button to `<Button variant="primary" className="w-full">Start edit</Button>`. Imports: `import type { SanaMessage } from "../lib/types";`, `import { PRESET_CLIPS, type PresetClip } from "../lib/clips";`.

Commit: `feat(sana-streaming): file upload input with decode retry`.

### Task 4.9: Stage (video surface)

**File:** `app/components/Stage.tsx`. Port `sana-streaming-demo/components/Stage.tsx`. Keep the side-by-side-in-file-mode logic, the source-video play/pause sync effect, the `cleared` overlay, and the status row. Swap the panel chrome to the zinc/rounded surface used by longlive's `Video` (`rounded-lg border border-zinc-800 bg-black`). Use `<ReactorView track="main_video" videoObjectFit="contain">`. Replace `bg-[#0a0a0a]` cleared overlay with `bg-black`. Import `SanaMode`, `SanaState` from `../lib/types`.

Commit: `feat(sana-streaming): stage with side-by-side file view`.

### Task 4.10: Phase-4 build gate

**Step 1:** Full build (first time all imports resolve):
```bash
cd /Users/whp/Reactor/js-sdk/examples/sana-streaming
pnpm build
```
Expected: build succeeds, type-check clean. Fix any type errors (likely: the `useReactor` object-selector, or a missing `lastError` field) before continuing.

**Step 2:** Visual smoke (no key needed to see SetupRequired; with a key to see the app):
```bash
pnpm dev
# visit http://localhost:3000
```
Expected without `REACTOR_API_KEY`: the SetupRequired landing renders. With a real `rk_` key in `.env.local`: the app renders, Connect works, status transitions show.

**Step 3:** Commit any fixes from this gate: `fix(sana-streaming): build + type fixes`.

---

## Phase 5 - Docs + registration

### Task 5.1: skill/SKILL.md

**File:** `examples/sana-streaming/skill/SKILL.md`. Use the sibling SKILL frontmatter format (see `examples/longlive-v2/skill/SKILL.md`). Frontmatter `name: building-sana-streaming-frontends`, description summarizing: extend this cloned sana-streaming app on the generic `@reactor-team/js-sdk`; covers the connection/state model, the live-vs-file mode model, the command/message contract, and the three carried constraints.

Body must capture (fold in `sana-streaming-demo/CLAUDE.md` + `docs/sdk-camera-publish.md`):
- What sana-streaming is (V2V streaming editor; `camera` in, `main_video` out).
- Why the generic SDK and no `@reactor-models` package.
- The connection state machine + model-as-source-of-truth reducer.
- The live vs file mode model and the start flow (`set_mode` then `start`).
- The command list and the message list (which mutate state vs informational).
- The three carried constraints with the WHY: SDK pinned exactly `2.11.2` (+ unpin condition: deployed image rebuilt on runtime ≥ 2.7.10); manual publish + `contentHint = "detail"`; `set_video` decode-retry.
- Verified-against snapshot: SDK 2.11.2, deployed image v0.1.2, runtime 2.7.9-0, coordinator `api.reactor.inc` (prod key required).
- How to point at dev (set provider `apiUrl` to `https://api.rea.live` + a dev key).

Commit: `docs(sana-streaming): SKILL.md`.

### Task 5.2: README.md

**File:** `examples/sana-streaming/README.md`. Sibling-style. Sections: what it is, the two modes + prompt steering, quickstart (`cp .env.example .env.local`, add prod `REACTOR_API_KEY`, `pnpm install`, `pnpm dev`), env table (just `REACTOR_API_KEY`), a short "uses the generic SDK (no typed model package)" note, and the SDK-pin rationale pointer to SKILL.md.

Commit: `docs(sana-streaming): README`.

### Task 5.3: Register in examples/README.md

**File:** `examples/README.md`. Add a `sana-streaming` row to the table:

| Example | Model | Highlights |
| `sana-streaming/` | (generic SDK, model `sana-streaming`) | Streaming video-to-video editor. Live webcam transform or file-clip edit, mid-stream re-prompting, side-by-side original/result, seed control. Uses the base `@reactor-team/js-sdk` directly (no typed model package). |

Also add one caveat line under "Conventions": sana-streaming pins `@reactor-team/js-sdk` exactly (`2.11.2`) rather than the `^` range, and drives the generic SDK rather than a `@reactor-models/*` package; see its SKILL.md for why.

Commit: `docs: register sana-streaming in examples index`.

---

## Phase 6 - Final verification

### Task 6.1: Clean build from a fresh install

```bash
cd /Users/whp/Reactor/js-sdk/examples/sana-streaming
rm -rf node_modules .next
pnpm install   # must match committed lockfile
pnpm build     # must succeed, type-check clean
```

### Task 6.2: create-reactor-app discovery sanity

Confirm nothing else needs editing for discovery: `packages/create-app` discovers templates live via the GitHub Contents API and `MODEL_MAP` is `{}` (1:1), so `examples/sana-streaming` becomes `--model sana-streaming` automatically once it lands on `main`. No code change required. (Verify by re-reading `packages/create-app/bin/create-reactor-app.ts` if unsure.)

### Task 6.3: Live smoke test (before release; needs a prod rk_ key)

With `REACTOR_API_KEY=rk_...` (prod) in `.env.local`, `pnpm dev`, then:
1. Connect; watch status go connecting -> waiting -> ready.
2. Live mode: allow camera, Start live, confirm transformed frames stream on the stage; change prompt mid-stream and confirm it takes effect about one chunk later.
3. File mode: pick the preset clip (and a manual upload), Start edit, confirm side-by-side original/result.
4. Pause / Resume / Reset; change seed.
5. SnapClip: click Snap; if the runtime does not support recording, confirm it shows an inline error (not a crash) and decide whether to remove the panel (Task 4.3-style removal from the shell).

Record results. If the command/message contract has drifted from the demo, fix the affected component and re-run.

---

## Done criteria
- `pnpm build` clean from a fresh install; lockfile committed.
- SetupRequired renders without a key; full app renders and connects with a key.
- Live + file + re-prompt + transport verified against prod.
- SKILL.md, README.md, and the examples/README.md row landed.
- SDK pinned exactly 2.11.2; the three carried constraints intact and documented.
