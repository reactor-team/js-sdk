---
name: building-visko-orbis-distilled-frontends
description: Extend this cloned Visko Orbis Distilled example app — add new controls, scenes, knobs, image flows, or features on top of `@reactor-models/visko-orbis-distilled` (^2.0.0) without breaking the patterns the existing code already uses. Covers the SDK's connection / events / messages model, the phase-based UI architecture, the state snapshot pattern, per-chunk (mid-stream) prompt morphing, the explicit setImage→image_accepted→setPrompt→start chain for image-to-video (this model has NO atomic setConditioning), resolution / audio / seed session knobs, the curated scene library, and prompt design rules for smooth continuous video generation.
---

# Building on this Visko Orbis Distilled app

You've cloned this folder and now you want to extend it — a new control, a new scene, a new model knob, a different UX. This guide explains the patterns the existing code uses and the rules to follow so your additions feel native instead of bolted on.

All the code referenced below already exists in this folder. Read this guide alongside the source.

## What Visko Orbis Distilled actually is, in three sentences

Visko Orbis Distilled is a **continuous, steerable** video generation model — the lightweight tier of the Visko Orbis family. Once it starts generating, it produces an unending stream of video on `main_video` (plus a real `main_audio` track — 48 kHz mono, chunk-aligned). You steer the scene mid-stream by changing the prompt, which the model picks up **at the next chunk boundary** (~1.8 s) — morphing the picture instead of cutting.

The frontend's job is to (a) start the generation, (b) keep the user steering it, and (c) gracefully reflect the model's state.

## The four concepts you'll touch

| Concept        | What it is                                                                         | Hook / API                                                                                                                                                                              |
| -------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Connection** | The lifecycle of the model session (`disconnected → connecting → waiting → ready`) | `useViskoOrbisDistilled().status`, `.connect()`, `.disconnect()`                                                                                                                        |
| **Events**     | Things you send TO the model. Always async.                                        | `useViskoOrbisDistilled().setPrompt({...})`, `.setImage({...})`, `.setSeed({...})`, `.setResolution({...})`, `.setAudioEnabled({...})`, `.start()`, `.pause()`, `.resume()`, `.reset()` |
| **Messages**   | Things the model sends BACK to you — including the all-important `state` snapshot. | `useViskoOrbisDistilledState((m) => …)`, `useViskoOrbisDistilledCommandError`, `useViskoOrbisDistilledImageAccepted`, etc.                                                              |
| **Tracks**     | `main_video` (rendered) + `main_audio` (a real, muted-by-default audio track).     | `<ViskoOrbisDistilledMainVideoView />`, `useViskoOrbisDistilledTrack("main_audio")`                                                                                                     |

You almost never have to drop below this surface. If you find yourself reaching for `@reactor-team/js-sdk` directly, stop and re-read the typed hooks list — there's likely a typed hook you're missing. The one documented exception is the recording surface (`SnapClip`), a base-SDK feature the typed packages deliberately do not re-export.

**Naming note:** the typed hooks are long — `useViskoOrbisDistilledState` (the snapshot), `useViskoOrbisDistilledGenerationStarted`, and so on. That's mechanical from the model name; there is no shorter alias. Everything below abbreviates to `useVisko…` in prose but the code uses the full names.

## The runtime reality (measured — drive your UX from this, not from hope)

These come from the model's own schema doc-comments and the productize hand-off. They are **behaviour**, not config intent — encode them in your UI instead of being surprised:

- **Startup is minutes.** One live session per deployment; the SR model compiles, then the model runs **three warmup chunks** before it answers commands. `StatusBadge` labels `waiting` honestly rather than spinning a mystery.
- **The first chunk emits ZERO frames** (`frames_emitted: 0` — SR priming). First picture lands ~2 chunks / ~3.7 s in. Don't surface chunk 1 as an error; hold a "priming" state (the `Video` overlay + `StatusBadge` both do).
- **Generation resolution ≠ delivery resolution.** The model generates at 832×480; SparkVSR delivers a picked tier (e.g. `1080p / 2k / 4k`). The resolution picker changes the delivered raster, NOT what the model invents. The `SessionOptions` panel says this out loud.
- **THE HERO — prompts are PER-CHUNK.** `set_prompt` mid-run morphs the scene at the next chunk boundary. No restart, no cut. This is the entire point of `EvolveScene`.
- **Command lifecycles differ.** Get these right or your UI lies:
  - `set_prompt`, `set_image` → per-session inputs; do NOT survive `reset`.
  - `set_resolution`, `set_audio_enabled`, `set_seed` → **read once when `start` fires**, apply at the NEXT start, and **survive `reset`**. A running generation keeps what it started with — its track geometry never jumps mid-shot.
- **`generation_complete` returns to WAITING, no auto-restart.** A new run begins at chunk 0, which is a hard cut, so the model won't issue one unasked. The client must send `start` (same conditions) or `reset` first. `NowPlaying` renders the "Run finished" CTA for exactly this.
- **Non-16:9 images squash.** The reference image is resized to 832×480 with no crop. `ImageStarter` warns inline.
- **Don't set `set_audio_prompt` from a scene description.** Measured to make audio WORSE than unset (unset = sound from the picture alone). `AudioPanel` deliberately has no audio-prompt box and says why.

## The UI phase model

A real-time video session is a state machine. This app maps it to **two visible UI phases**, and each component self-selects:

```
       ┌──────────────┐    setPrompt + start    ┌────────────────┐
       │  WAITING     │ ──────────────────────▶ │   GENERATING   │
       │  (Setup UI)  │ ◀───────────────────────│   (Live UI)    │
       └──────────────┘          reset          └─────┬──────────┘
                                                     │ ▲
                                                pause│ │resume
                                                     ▼ │
                                                ┌────────────────┐
                                                │     PAUSED     │
                                                │   (Live UI)    │
                                                └────────────────┘
  (generation_complete → back to WAITING; the client must start again)
```

| UI phase  | When                                                                      | What's visible                                                                                        | What's hidden            |
| --------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------ |
| **Setup** | `snapshot.started === false` (or no snapshot — fresh page / disconnected) | StatusBadge · CommandError · prompt presets · image picker · session options (resolution/seed/audio)  | NowPlaying · EvolveScene |
| **Live**  | `snapshot.started === true` (running OR paused)                           | StatusBadge · CommandError · NowPlaying (Pause/Resume/Reset + done-CTA) · EvolveScene (live steering) | setup controls           |

Components self-hide via early returns on the snapshot. No orchestration logic in the parent — adding a new component means dropping it into the sidebar and putting the right early-return at its top.

### When you add a new control, decide its phase first

- **Knob that primes a session** (seed, resolution, audio-enabled) → **Setup** phase; but it's fine to leave it visible mid-run as long as the copy says "applies at next start" (that's what `SessionOptions` / `AudioPanel` do, since these values persist and arm future runs).
- **Knob that adjusts the live scene** (prompt morphs) → **Live** phase. Early-return when not started.
- **Always-on** (status, clip capture) → no early return; gate interactivity on `status === "ready"`.

```tsx
// Setup-phase component
if (status === "ready" && snapshot?.started) return null;

// Live-phase component
if (status !== "ready" || !snapshot?.started) return null;
```

The `status === "ready"` half matters — without it, your component shows stale data from the previous session after a disconnect/reconnect.

## Auth — `getJwt` resolver + cacheable GET route

Two pieces work together: `app/api/reactor/token/route.ts` mints (and caches) a session-scoped JWT server-side, and `<ViskoOrbisDistilledProvider getJwt={fetchToken}>` calls it on every Coordinator HTTP hop.

### `getJwt`, not `jwtToken`

`@reactor-team/js-sdk` ≥ 2.10.1 accepts a **resolver** anywhere it used to take a static string. The provider re-invokes it on every Coordinator HTTP call — uploads, clip manifests, ICE refresh, SDP renegotiation — so a token aging out mid-session can't 401 those hops. The legacy `jwtToken="..."` static string caches one value at construction and breaks the moment it expires.

The provider auto-stabilizes the resolver via `useRef + useMemo`, so the inline arrow form is safe — a parent re-render does **not** tear the session down. Do not wrap it in `useCallback`.

### The route — `app/api/reactor/token/route.ts`

Already implemented. Why it's shaped this way, so you don't break it:

1. **GET, not POST.** Browsers don't cache POST. The handler still POSTs to `/tokens` internally; the public route is GET so the browser's HTTP cache serves repeat calls transparently.
2. **`Cache-Control: private`.** JWTs are per-user; never `public`.
3. **`max-age` from the server's `expires_at`**, never hardcoded — it always tracks what the server granted.
4. **`authorization_details` scopes the token** to `reactor/visko-orbis-distilled` with a bounded `max_sessions` budget. The browser's token can only create sessions for this model and act on sessions it created — a leaked token is a bounded loss, not an account key.

Because it's GET + cacheable, the resolver is dumb on the wire — 99% of calls come back from the browser cache without touching your server.

### Wiring an identity-provider JWT instead (Clerk, Auth0, …)

`getJwt` is _the_ hook for short-TTL identity JWTs:

```tsx
<ViskoOrbisDistilledProvider
  getJwt={async () => (await getToken({ template: "reactor" })) ?? ""}
>
```

Returning `""` suppresses the `Authorization` header. `getJwt` wins over `jwtToken` when both are passed.

### autoConnect

Initialization is **without** `autoConnect` — the user clicks Connect to see the transitions (important here because `waiting` is minutes and must be labelled). For a polished product:

```tsx
<ViskoOrbisDistilledProvider getJwt={fetchToken} connectOptions={{ autoConnect: true }}>
```

Keep the honest `waiting` / `priming` labels if you do — sessions don't reach `ready` instantly.

## The state snapshot — your UI's single source of truth

The model emits a `state` message after every command and every chunk. Subscribe, hold it in `useState`, read fields off it. **Don't aggregate `chunk_complete` / `generation_started` / `generation_paused` to reconstruct state** — the snapshot already contains everything.

```tsx
const [snapshot, setSnapshot] =
  useState<ViskoOrbisDistilledStateMessage | null>(null);
useViskoOrbisDistilledState((msg) => setSnapshot(msg));
```

Fields you'll actually read:

| Field                      | Meaning                                                                                                                 |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `started`                  | True once `start()` succeeded. Stays true through pause. Cleared by `reset()`. **The phase switch.**                    |
| `running`                  | True while actively producing frames. Equal to `started && !paused`.                                                    |
| `paused`                   | True after `pause()`, false after `resume()`.                                                                           |
| `current_prompt`           | The prompt driving generation, `null` before start. **Match against the scene library** to drive the steering UI.       |
| `current_chunk`            | Progress counter since reset / connect.                                                                                 |
| `has_image` / `has_prompt` | Whether the session has a reference image / prompt yet. (Note: `has_image`, not helios's `image_set`.)                  |
| `available_resolutions`    | The deployment's offered delivery tiers (e.g. `["1080p","2k","4k"]`). **Render the picker from this, never hard-code.** |
| `resolution`               | The delivery resolution the next `start` will use (fixed for a running generation).                                     |
| `audio_enabled`            | Whether the next `start` will generate sound (fixed for a running generation).                                          |
| `seed`                     | The session's current seed field. The seed actually driving a running run was captured at `start`.                      |

### Clear the snapshot on disconnect

The SDK does **not** emit a final `state` when the session ends. Without an explicit reset, the last snapshot lingers and your UI shows stale "still generating!" data after a reconnect. Every component that holds a snapshot does:

```tsx
useEffect(() => {
  if (status !== "ready") setSnapshot(null);
}, [status]);
```

Three lines, no abstraction.

### Coerce conservative schema types when rendering

The generated types are conservative — several fields are typed wider than the values you'll actually see (e.g. `string | null`, plus `unknown`-ish fields on some surfaces). Coerce at the render boundary:

```tsx
const prompt =
  typeof snapshot.current_prompt === "string" ? snapshot.current_prompt : "";
const res =
  typeof snapshot.resolution === "string" && snapshot.resolution
    ? snapshot.resolution
    : null;
const resolutions = Array.isArray(snapshot.available_resolutions)
  ? snapshot.available_resolutions.filter(
      (r): r is string => typeof r === "string",
    )
  : [];
```

The example does this everywhere it reads the snapshot. Do the same in new components.

## Sending events — the typed methods

Every command has a typed wrapper on `useViskoOrbisDistilled()`. Always `await` them; they return a Promise that can reject.

```tsx
const {
  setPrompt,
  setImage,
  setSeed,
  setResolution,
  setAudioEnabled,
  start,
  pause,
  resume,
  reset,
} = useViskoOrbisDistilled();

// Text-to-video
await setPrompt({ prompt: "A black volcanic coastline at golden hour…" });
await start();

// Steering mid-run — THE hero move
await setPrompt({ prompt: "The same coastline, a storm rolling in…" });

// Session knobs (apply at NEXT start, survive reset)
await setResolution({ resolution: "2k" }); // must be on available_resolutions
await setAudioEnabled({ audio_enabled: false }); // save compute; silence
await setSeed({ seed: 42 }); // reproducible

// Transport
await pause();
await resume();
await reset();
```

**No atomic `setConditioning`.** That's the Helios-0.9+ command. This model's image-to-video is `setImage` → `image_accepted` → `setPrompt` → `start` — see the next section.

**Never reach for `sendCommand("set_prompt", ...)` when a typed method exists.** You lose autocomplete and the param-name typo check.

### Status-gate every interactive control

Sending a command when `status !== "ready"` is a no-op with a console warning. Surface it as `disabled`:

```tsx
const { status, setPrompt, start } = useViskoOrbisDistilled();
const ready = status === "ready";
<button disabled={!ready || !text.trim()} onClick={...}>Start generating</button>
```

## Chaining commands for image-to-video — wait for `image_accepted`

This model has **no atomic `setConditioning`**, so an image-to-video launch is an explicit ordered chain. Commands that carry uploads (`setImage`) resolve slower than commands that don't (`start`); naive chaining races the model and the first chunk renders before the image lands (a visible flicker into the anchored composition).

**The pattern — park a one-shot resolver BEFORE `setImage`, then gate `start` on the ack:**

```tsx
const imageReadyRef = useRef<(() => void) | null>(null);

useViskoOrbisDistilledImageAccepted(() => {
  if (imageReadyRef.current) {
    imageReadyRef.current();
    imageReadyRef.current = null;
  }
});

async function startFromExample(scene) {
  const blob = await fetch(scene.imageUrl).then((r) => r.blob());
  const ref = await uploadFile(blob, { name: `${scene.id}.jpg` });

  const imageReady = new Promise<void>((resolve) => {
    imageReadyRef.current = resolve; // registered BEFORE setImage — can't miss the ack
  });

  await setImage({ image: ref });
  await imageReady; // ← gate on the ack
  await setPrompt({ prompt: scene.initial.text });
  await start();
}
```

This is the whole flow in `ImageStarter.startFromExample`. `uploadFile` returns a `FileRef`; the SDK lifts it into the uploads envelope, so `image: ref` reads as a regular field.

**Two launch paths in `ImageStarter`, two chains:**

- **Curated scene** (image + prompt known together) → the full `uploadFile → setImage → image_accepted → setPrompt → start` chain above.
- **Custom upload** → `uploadFile → setImage` only. The user types a prompt in `PromptComposer` and clicks Start; by then the human delay has covered the image processing, so no ack wait is needed in that path.

Prefer the specific `image_accepted` ack over `conditions_ready` — the latter fires per conditioning command with partial flags and makes predicate-matching finicky. The **text-only** path (`setPrompt → start`) never needs an ack — prompt updates are instant.

## Mid-stream prompt morphing — the signature capability

Once `started === true`, calling `setPrompt({ prompt })` is a **morph on the next chunk boundary** (~1.8 s) — no restart, no `start()` again, no cut. The scene continues from where it was.

`EvolveScene` is the canonical pattern: match `snapshot.current_prompt` against the scene library (which tracks `initial` + every `evolution`), render that scene's evolutions as click handlers that call `setPrompt` directly, plus a free-form morph box for prompts we don't recognise:

```tsx
const current =
  typeof snapshot.current_prompt === "string" ? snapshot.current_prompt : "";
const scene = findSceneForPrompt(current);
// … scene.evolutions.map(e => <button onClick={() => setPrompt({ prompt: e.text })}>{e.title}</button>)
```

**No `start()` in the click handler.** We're already generating; we're just swapping the prompt. The snapshot updates on the next chunk, the active evolution highlights, and the model morphs smoothly. Any new control that mutates the live scene follows the same rule — call the typed method, don't touch `start()`.

## Receiving messages — the typed hooks

One typed subscription hook per message:

| Hook                                                                                                | Purpose                                                                                                                                                                |
| --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useViskoOrbisDistilledState(handler)`                                                              | The snapshot. **Almost everything you need is here.**                                                                                                                  |
| `useViskoOrbisDistilledCommandError(handler)`                                                       | A command was rejected (bad preconditions / bad input). Render somewhere visible — `CommandError` already does.                                                        |
| `useViskoOrbisDistilledImageAccepted(handler)`                                                      | An upload decoded. **The gate for the I2V launch chain** (above), or an "image ready ✓" toast on `setImage`-only flows.                                                |
| `useViskoOrbisDistilledPromptAccepted(handler)`                                                     | A prompt was accepted. Toast notifications.                                                                                                                            |
| `useViskoOrbisDistilledChunkComplete(handler)`                                                      | One chunk finished. Progress sounds / telemetry. Its `frames_emitted: 0` on chunk 1 is EXPECTED (SR priming) — don't treat as error.                                   |
| `useViskoOrbisDistilledGenerationStarted(handler)`                                                  | A run began (fires before first frames — the `priming` overlay reads this). Also carries `fps`, `width`, `height`, `resolution`, `audio_enabled`, `image_conditioned`. |
| `useViskoOrbisDistilledGenerationComplete(handler)`                                                 | The run hit `max_chunks` and returned to WAITING. `NowPlaying` uses it for the "Run finished" CTA.                                                                     |
| `useViskoOrbisDistilledGenerationPaused/Resumed/Reset`                                              | Lifecycle transitions. One-shot reactions (toasts); **don't aggregate into your own state** — read the snapshot.                                                       |
| `useViskoOrbisDistilledResolutionAccepted/AudioEnabledAccepted/AudioPromptAccepted/ConditionsReady` | Per-command acks. Mostly informational; the snapshot already reflects the committed value.                                                                             |
| `useViskoOrbisDistilledMessage(handler)`                                                            | Catch-all over the typed discriminated union. Devtools / logging.                                                                                                      |

## Resolution / audio / seed session knobs

`SessionOptions` (resolution + seed) and `AudioPanel` (audio-enabled) are reference implementations. The shared rules:

- **Render options from live data.** The resolution picker maps over `snapshot.available_resolutions` (filtered to strings) — a deployment-configured list. If the deployment's menu changes, the picker follows; nothing is edited.
- **`set_resolution` validates against the deployment's list.** Passing a string not on `available_resolutions` produces a `command_error` naming the offered list — `CommandError` surfaces it for free.
- **Apply-at-next-start copy.** These values are read once when `start` fires. If the user changes them mid-run, the running generation keeps what it started with. Both panels say "applies at the next start" when `started === true`.
- **Seed semantics.** The model never draws its own seed — same seed + same prompts reproduces the same video. Default 42.

## audio — surface it, but carefully

`main_audio` is real (48 kHz mono, samples chunk-aligned with video — `chunk_complete.audio_samples` even equals `frames_emitted / fps * 48000` so you can check A/V alignment without decoding). But:

- **Playback starts MUTED.** Browsers block unmuted autoplay anyway, and the user opts in to sound. `AudioOutlet` renders a hidden `<audio autoplay muted>`, which is allowed by autoplay policy; the user unmutes via native controls if they want to listen.
- **`set_audio_enabled` is a compute toggle.** Off = the audio model is skipped, `main_audio` carries silence, chunks are cheaper. A client that never wants audio can also omit `main_audio` from its track mapping at connect time — that needs no command but still spends compute; `set_audio_enabled(false)` is how the compute is actually saved.

## The scene library — one source, three surfaces

All suggested prompts live in `app/lib/prompts.ts`. Each scene is a world with an arc:

```ts
export interface Prompt {
  title: string;
  text: string;
}
export interface Scene {
  id: string;
  label: string;
  initial: Prompt;
  evolutions: ReadonlyArray<Prompt>;
  imageUrl?: string; // present on image-backed scenes; absent = text-to-video
}

export const SCENES: ReadonlyArray<Scene> = [/* ... */];
export const TEXT_SCENES = SCENES.filter((s) => !s.imageUrl);
export const IMAGE_SCENES = SCENES.filter(
  (s): s is Scene & { imageUrl: string } => !!s.imageUrl,
);
export function findSceneForPrompt(prompt) {
  /* matches initial OR any evolution */
}
```

The library feeds three surfaces:

- `PromptComposer` reads `TEXT_SCENES` → renders `initial` of each as a clickable card (text-to-video, no image needed).
- `ImageStarter` reads `IMAGE_SCENES` → renders thumbnails and ships the image bytes from `/public/images/` (image-to-video).
- `EvolveScene` calls `findSceneForPrompt(snapshot.current_prompt)` → renders that scene's `evolutions` as one-click morphs.

**Adding a new scene = one entry in `SCENES`.** No component changes. If it has an `imageUrl`, drop 16:9 bytes into `public/images/`.

### Prompts must be full paragraphs, and evolutions must re-establish the world

This is the most underrated part of building a real-time video frontend, and the #1 reason scenes look choppy when they should be smooth.

**Each prompt is a paragraph**, not a tagline. Setting, subject, light, motion, AND the camera shot, all named. Terse prompts ("a castle in the sky") force the model to invent the rest every chunk and the picture drifts.

**Each prompt is ONE continuous take.** No cuts, no montage, no scene lists. The model generates a single unbroken shot per prompt.

**Each evolution re-establishes the SAME setting/subject BEFORE the change.** That's what makes the mid-run morph read as cinematography instead of a glitch:

```
Initial:    "A majestic citadel of pale stone floats above an ocean of
             cloud… golden light breaks across the towers… slow cinematic
             aerial drift… a single unbroken take."

Evolution:  "The same floating stone citadel above the cloud ocean, the
             same slow aerial drift. A vast thunderstorm is rolling in —
             towering charcoal clouds, lightning in the cloud mass below,
             the golden light turning cold…"
```

The setting and camera are restated **verbatim**; only the conditions (weather / time / light) shift. That stability is what produces smooth on-screen continuity.

### UI for long prompts

Render only the short `title` as the button label, `line-clamp-2` over the dim `text` beneath. The full paragraph reaches the model on click; truncation is purely visual.

## Capturing clips

Recording is base-SDK and model-agnostic — the same `SnapClip.tsx` ships unchanged across every example. `requestClip(seconds)` asks for the trailing N seconds, `<ClipPlayer>` previews, `<ClipDownloadButton>` saves an MP4. Import from `@reactor-team/js-sdk` (the one place that's idiomatic, not a smell). See the existing `SnapClip.tsx` — no `getJwt` plumbing needed; the clip components inherit the resolver from the provider via React context. (`hls.js` is the optional peer that keeps preview working off Safari.)

## Brand alignment — design tokens, not components

The app pulls Reactor's design tokens from `@reactor-team/ui/styles.css` (loaded in `app/layout.tsx`) but does **not** import its React components (they use hooks and would force `"use client"`). Tailwind aliases in `app/globals.css` expose `bg-brand`, `text-brand`, `text-brand-fg`, `bg-active`, `text-active` as plain utilities — usable in Server or Client Components. Reach for actual UI components only when you need their behavior (e.g. a copy-on-click code block), and those usages are Client Components anyway.

## Common mistakes when extending

1. **Reaching for `@reactor-team/js-sdk` directly** for a Visko-specific event/message. Everything is on the typed package; the only allowed exception is the recording surface.
2. **Aggregating events to reconstruct state.** Read the snapshot. Stop folding `chunk_complete` + `generation_started` into your own flags.
3. **Chaining `setImage + setPrompt + start` without the `image_accepted` gate.** `start` slips past the in-flight upload and the first chunk renders unconditioned. Gate on `image_accepted` (parked BEFORE `setImage`), or use text-only `setPrompt → start` (instant, no ack needed).
4. **Surfacing `frames_emitted: 0` on chunk 1 as an error.** It's SR priming; the first picture is ~2 chunks in. Hold a priming state instead.
5. **Hard-coding the resolution list.** Render from `snapshot.available_resolutions`. Also remember it's an upscaler tier (832×480 → delivered raster), not the generation size.
6. **Assuming resolution/audio/seed apply immediately.** They're read at `start`. Mid-run changes arm the NEXT start — and they survive `reset`. Prompt + image don't.
7. **Auto-restarting after `generation_complete`.** The model returns to WAITING on purpose (a new run is a hard cut). Show a "Start again" CTA; don't fire `start` from an effect.
8. **Setting an audio prompt from the scene description.** Measured worse than unset. `AudioPanel` has no audio-prompt box on purpose.
9. **Forgetting to clear the snapshot on disconnect.** Three lines of `useEffect` per snapshot-holding component, every time.
10. **A non-16:9 reference image.** It squashes to 832×480 with no crop. Keep curated images 16:9; warn on custom upload.

## Checklist for new components

Before merging a new control or feature:

- [ ] Decided which phase it lives in (Setup, Live, or always-on)
- [ ] Early-return at the top matches that phase
- [ ] If it subscribes to `useViskoOrbisDistilledState`, it clears on disconnect via `useEffect`
- [ ] Snapshot reads are coerced (`typeof x === "string" ? x : …`, `Array.isArray(...)`, `.filter((r): r is string => …)`)
- [ ] All interactive controls gate `disabled` on `status === "ready"`
- [ ] All event calls use typed wrappers (`setPrompt`, not `sendCommand`) and are `await`ed
- [ ] I2V launch chains `uploadFile → setImage → image_accepted → setPrompt → start` with the resolver parked BEFORE `setImage`
- [ ] Live-scene mutations call the typed method with NO `start()`
- [ ] Renders `command_error` (the existing `CommandError` handles it — don't suppress)
- [ ] New prompts in `app/lib/prompts.ts` are full paragraphs, one continuous take, evolutions re-establish the world
- [ ] Resolution / audio / seed controls use "applies at next start" copy when `started === true`
- [ ] Brand colors via Tailwind tokens, not hardcoded hex
- [ ] No `@reactor-team/js-sdk` / `@reactor-team/ui` React imports unless required (recording is the documented exception)
