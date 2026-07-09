---
name: building-xmax-frontends
description: Extend this cloned XMAX X2 example app — add new controls, sources, or knobs on top of the Reactor JS SDK without breaking the patterns the existing code uses. Covers the SDK's connection / commands / messages / tracks model, the single-owner camera publish, the state-snapshot reducer, the auth route, clip capture, and how to migrate to the typed @reactor-models/xmax package when it ships.
---

# Building on this XMAX X2 app

You've cloned this folder and now you want to extend it — a new control, a new input source, a different UX. This guide explains the patterns the existing code uses and the rules to follow so your additions feel native instead of bolted on.

All the code referenced below already exists in this folder. Read this guide alongside the source — especially [The camera track](#the-camera-track--one-producer-one-publisher) before touching anything in the input path.

## What X2 actually is, in three sentences

XMAX X2 is a **real-time streaming video-to-video editing model**. The client publishes a live video track to the model, describes an edit in plain text, and the model streams the edited video back — continuously, while you re-prompt mid-stream. The frontend's job reduces to (a) producing and publishing exactly one source track, (b) sending commands (`set_prompt`, `start`, `pause`, `resume`, `reset`), and (c) mirroring the model's `state` snapshot into the UI.

## The four concepts you'll touch

This app talks to the model through the base `@reactor-team/js-sdk` surface — XMAX does not have a typed `@reactor-models/xmax` package yet (see [Migrating to the typed package](#migrating-to-the-typed-package) for what changes when it does).

| Concept        | What it is                                                                         | Hook / API                                                                         |
| -------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **Connection** | The lifecycle of the model session (`disconnected → connecting → waiting → ready`) | `useReactor((s) => s.status)`, `s.connect`, `s.disconnect`                         |
| **Commands**   | Things you send TO the model. Always async.                                        | `useReactor((s) => s.sendCommand)` → `sendCommand("set_prompt", {...})`            |
| **Messages**   | Things the model sends BACK — the `state` snapshot, acks, errors.                  | `useReactorMessage((raw) => …)` (untyped; the app type-guards)                     |
| **Tracks**     | Video in (`camera`, published by the client) and out (`main_video`).               | `useReactor((s) => s.publish / s.unpublish)`, `<ReactorView track="main_video" />` |

The full wire surface — every command, every message, the `state` payload — is the model's schema reference on docs.reactor.inc. When this guide says "check the schema", that's the page it means.

## The UI phase model

A real-time session is a state machine, and the UI mirrors it with two visible phases keyed off the model-reported `started` flag:

| UI phase  | Backing state            | What's visible                                                      |
| --------- | ------------------------ | ------------------------------------------------------------------- |
| **Setup** | `!state.started`         | source toggle (webcam / video) · clip picker · Start                |
| **Live**  | `state.started === true` | pause / resume / reset (`Playback`) · the running edit in the stage |

The Prompt panel and SnapClip are visible in both phases (prompts can be set before or during a run; clips need a live stream but the component self-hides).

The phase split lives inside `ModeInput` rather than as two sidebar components: the webcam self-view must stay mounted across the start transition (unmounting it would stop the published track), so the panel swaps only its lower half between Start and Playback.

## Auth — `getJwt` resolver + cacheable GET route

Two pieces work together: a Next.js GET route that mints (and caches) the JWT server-side, and the `getJwt` resolver prop on `<ReactorProvider>` that calls it on every Reactor API HTTP hop (connect, ICE refresh, SDP renegotiation, clip manifests).

Three non-negotiables in `app/api/reactor/token/route.ts`:

1. **GET, not POST.** Browsers don't cache POST responses. The handler still POSTs to the Reactor API internally; exposing it as GET lets the browser's HTTP cache transparently serve repeat calls.
2. **`Cache-Control: private`.** Never `public` — JWTs are per-user and must not be shared by any CDN or proxy.
3. **`max-age` derived from the server's `expires_at`**, not a hardcoded number. The route sends `expires_after` and reads `expires_at` back, so the cache window always tracks what the server actually granted.

Because the route is cacheable, the `getJwt` resolver is dumb on the wire — every hop calls `fetch("/api/reactor/token")` and it comes back from the browser cache until the JWT actually expires. Don't add a localStorage layer or parse the JWT client-side.

`getJwt` is an inline function on purpose — the provider auto-stabilizes it via a ref, so a parent re-render does **not** tear the session down. Don't wrap it in `useCallback`.

### Configuring autoConnect

The example passes `connectOptions={{ autoConnect: false }}` so the user clicks Connect and sees the `disconnected → connecting → waiting → ready` transitions. In your own product you can flip it on — just make sure your status indicator still surfaces the intermediate states, because sessions don't reach `ready` instantly.

## The state snapshot — one reducer, cleared on disconnect

The model periodically sends a `state` message: the full picture (`running`, `started`, `paused`, `current_chunk`, `current_prompt`). It is the **single source of truth**. The app never infers session state from its own button clicks.

Because the base SDK's message stream is untyped, `app/lib/state.ts` owns the type guard (`isStateMessage`) and the projection (`reduce`) into the app-level `XmaxState`. `reduce` returns the previous object when nothing changed so React can bail out of re-rendering on the model's frequent identical echoes.

Two rules to keep:

1. **Only `state` messages mutate the reducer.** Transition notifications (`generation_reset`, etc.) trigger one-shot reactions, never state reconstruction.
2. **Clear everything on disconnect.** `Workspace` has a `useEffect` on `status === "disconnected"` that resets the reducer, the error banner, and the selected clip. The SDK does not emit a final `state` on disconnect; without this, a reconnect shows stale data from the previous session. If you add new session state, add its reset there too.

## Sending commands

Commands are fire-and-forget over a data channel, exposed as one store action:

```tsx
const sendCommand = useReactor((s) => s.sendCommand);
await sendCommand("set_prompt", { prompt: "make it watercolor" });
```

- **Gate every interactive control on `status === "ready"`** — commands sent earlier reject.
- **`start` edits whatever is already arriving on `camera`.** Publish the source track first (the publisher does this automatically as soon as the session is ready), then `start`.
- **Prompts are hot-swappable.** `set_prompt` mid-stream applies at the next chunk boundary; no restart, no re-render. This is the model's signature capability — lead with it in anything you build.
- **`reset` returns to the setup phase.** The stage blacks itself out until frames from the next run land (the WebRTC `<video>` would otherwise freeze on the last edited frame — see `stageCleared` in `XmaxApp.tsx`).

## Receiving messages

The base SDK delivers all model messages through `useReactorMessage` as one untyped stream. The app subscribes **once**, in `Workspace`, and switches on `msg.type`:

| Message            | What the app does                                                                    |
| ------------------ | ------------------------------------------------------------------------------------ |
| `state`            | Feeds the reducer. Everything the UI gates on comes from here.                       |
| `command_error`    | **Always surfaced** — a dismissible banner with a 6s auto-dismiss. Never swallow it. |
| `generation_reset` | Bumps `resetNonce` (remounts the prompt draft) and blacks out the stage.             |

When you handle a new message type, add a case to that one subscription — don't scatter `useReactorMessage` calls across components. One subscription keeps ordering obvious and makes the eventual typed-package migration a mechanical find-and-replace.

## The camera track — one producer, one publisher

The model edits whatever arrives on the `camera` track. Two components _produce_ a track; exactly one hook _publishes_ it:

- **`WebcamSource`** — `getUserMedia` at 640×360, renders the self-view, hands the track up.
- **`VideoSource`** — plays the chosen clip in a `<video>` element and grabs its frames with `captureStream()`. The same element is the "original" pane in the stage, so what you see is literally what the model receives. Playback is slaved to the model's run state (poster frame while set up, playing once started, pausing in step).
- **`useCameraPublisher`** — the single owner of the `camera` slot. It always unpublishes before publishing, so switching sources can't race into "publisher slot already taken".

Rules when extending:

1. **Never publish from a component.** New sources (screen share, a canvas, a second camera) produce a `MediaStreamTrack` and hand it to the workspace via `onTrack`; the publisher does the rest.
2. **Set `track.contentHint = "detail"`** on any new source. The model wants a stable input resolution; Chrome's encoder ramps resolution at stream start and on bandwidth dips, and `"detail"` holds it steady and trades framerate instead.
3. **The model picks its output resolution per session from the source stream's aspect ratio.** Feed it a portrait webcam and you get a portrait edit; don't letterbox the source yourself.

## Curated prompt presets

Preset chips live in `app/lib/examples.ts`. X2 prompts are **editing instructions, not scene descriptions** — say what should change; everything unmentioned carries through from the source. Short style phrases work ("Van Gogh oil painting, swirling brushstrokes"); the model's prompt guide on docs.reactor.inc has the good-vs-bad pairs to copy density from. Swap the placeholder presets for prompts tuned on the real model before you demo anything.

## What's intentionally not exposed

The starter surfaces the minimum that tells the model's story: source in, prompt-steered edit out, transport. The model has more surface — add a control by dropping a ~30-line component into the right phase and sending the command. Check the schema reference for exact command names and payloads:

| Capability               | What it does                                                                                       | Where it belongs                 |
| ------------------------ | -------------------------------------------------------------------------------------------------- | -------------------------------- |
| **Reference image**      | Conditions the edit on an image. Changing it mid-run restarts the stream from the new reference.   | Setup + live (with restart note) |
| **Pointer / drag input** | Streams pointer drags as a conditioning signal — grab something in frame and move it.              | Live phase, on the stage         |
| **Backlog mode**         | Processes every source frame in order (smooth for drag sessions) instead of always editing newest. | Advanced toggle                  |
| **Seed**                 | Reproducible results for the same source + prompt.                                                 | Setup phase                      |

## Migrating to the typed package

When `@reactor-models/xmax` ships, migrate mechanically — the app was structured so each untyped seam has exactly one home:

1. `<ReactorProvider modelName="xmax/x2" …>` → `<XmaxProvider …>` (model name and tracks baked in).
2. `useReactor((s) => s.sendCommand)` + string commands → the typed methods (`setPrompt({...})`, `start()`, …) off `useXmax()`.
3. The single `useReactorMessage` switch in `Workspace` → per-message typed hooks (`useXmaxState`, `useXmaxCommandError`, `useXmaxGenerationReset`).
4. The hand-written guard in `app/lib/state.ts` → the generated `XmaxStateMessage` type; `reduce` keeps its shape.
5. `<ReactorView track="main_video" />` → `<XmaxMainVideoView />`.

`useCameraPublisher` and `SnapClip` keep importing from `@reactor-team/js-sdk` — track publishing and recording are base-SDK surface that typed packages deliberately don't re-export.

## Capturing clips

The Reactor base SDK exposes a recording surface that works for every model: ask for the last N seconds of the live stream, get back a `Clip`, and either preview it with `<ClipPlayer>` or download it with `<ClipDownloadButton>`.

The app ships a drop-in `app/components/SnapClip.tsx` panel wiring this together — a Capture button calling `requestClip(durationSeconds)` off the store, a preview modal, an MP4 download. It is model-agnostic: the same file ships (modulo theme classes) in every Reactor example.

The pattern, if you rebuild it:

1. `useReactor((s) => s.requestClip)` — `requestClip`, `requestRecording`, and `downloadClipAsFile` are first-class store actions (js-sdk ≥ 2.11.1).
2. Return `null` when `status !== "ready"` — same hide-on-disconnect contract as every live-only control.
3. Catch `RecordingError` (typed reasons: `DISCONNECTED`, `RECORDER_DISABLED`, `INVALID_DURATION`, `REQUEST_TIMEOUT`) and surface it inline.
4. `<ClipPlayer>` + `<ClipDownloadButton>` auto-inherit the JWT resolver from the provider via context; no `getJwt` prop needed.
5. `hls.js` is a direct dep: `<ClipPlayer>` plays HLS natively on Safari and dynamically imports `hls.js` on Chrome/Firefox/Edge.

**Clips are short-lived.** The URL on a `Clip` expires after a few minutes. Download the MP4 if you need an artifact; don't hand `clip.playlistUrl` to users.

## Brand alignment — tokens through the theme, not components

`app/layout.tsx` imports `@reactor-team/ui/styles.css` (fonts + brand CSS vars) and `app/globals.css` re-exposes them as Tailwind utilities (`bg-brand`, `text-brand-fg`, `bg-active`, `font-mono`).

- **Use the theme utilities and the primitives in `app/components/ui/`** (Button, Panel, SegmentedToggle, IconButton). Don't invent parallel color systems with raw hex values.
- **Don't import `@reactor-team/ui` React components.** They use hooks internally — importing one into a Server Component (like `SetupRequired`) dies at runtime, not build time. The stylesheet import gives you everything you need.

## Common mistakes when extending

1. **A second publisher for `camera`.** All sources hand their track to `useCameraPublisher` via `onTrack`. Two publishers race into "slot already taken".
2. **Inferring session state from clicks.** Gate off the reduced `XmaxState`; only `state` messages mutate it.
3. **Forgetting the disconnect reset.** New session state must be cleared in the `status === "disconnected"` effect, or the next session starts haunted by the last one.
4. **Swallowing `command_error`.** The banner surfaces every command failure; keep it wired when you add commands.
5. **Scattering `useReactorMessage` subscriptions.** One switch in `Workspace`; add cases there.
6. **Unmounting the webcam self-view on start.** The track dies with the component; that's why `ModeInput` swaps only its lower half between phases.
7. **Uploading the clip instead of streaming it.** `VideoSource` exists so the model edits the clip on its live path; don't add an upload flow for the same job.
8. **Missing `contentHint = "detail"`** on a new source track — the model gets a resolution ramp instead of a stable stream.
9. **Importing `@reactor-team/ui` React components into Server Components.** Runtime error. Use the theme tokens.
10. **Storing `Clip` objects or sharing clip URLs.** They expire in minutes. Download the MP4.
11. **Guessing command names.** The schema reference on docs.reactor.inc is the source of truth; `command_error` will tell you when you guessed wrong, visibly.

## Checklist for new components

- [ ] Decided its phase (setup / live / both) and gated on `status === "ready"` plus the right `XmaxState` flags
- [ ] New sources produce a track and hand it up via `onTrack` — no new publish call sites
- [ ] New message handling added to the single `useReactorMessage` switch
- [ ] New session state resets in the disconnect effect
- [ ] `command_error` still surfaces (don't swallow it)
- [ ] Command names and payloads checked against the schema reference
- [ ] Colors via theme utilities / `app/components/ui` primitives, not raw hex
- [ ] `@reactor-team/js-sdk` stays the only SDK import (until `@reactor-models/xmax` ships — then migrate per the section above)
