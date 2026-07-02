---
name: building-lingbot-2-frontends
description: Extend this cloned Lingbot 2 example app — add new controls, scenes, knobs, or features on top of the typed `@reactor-models/lingbot-v2` SDK surface (vendored pre-release snapshot in `app/sdk/` until the package publishes) without breaking the patterns the existing code already uses. Covers the SDK's connection / events / messages model, the phase-based UI architecture, the state snapshot pattern, the image-required preconditions and the `image_accepted` wait, the two-axis WASD + arrow-key driving model, the native `set_camera_pose` layer, and prompt design rules for coherent continuous generation.
---

# Building on this Lingbot 2 app

You've cloned this folder and now you want to extend it — a new control, a new scene, a new model knob, a different UX. This guide explains the patterns the existing code uses and the rules to follow so your additions feel native instead of bolted on.

All the code referenced below already exists in this folder. Read this guide alongside the source.

> **About the vendored SDK.** This app runs on the real Lingbot v2 typed SDK surface (`useLingbotV2`, `LingbotV2Provider`, `LingbotV2MainVideoView`, the `set_*` commands). The `@reactor-models/lingbot-v2` package is not published yet, so a generated snapshot (v0.1.1) is vendored in `app/sdk/` (unmodified apart from repo Prettier formatting) and `tsconfig.json` maps the package specifier to it — components import from `@reactor-models/lingbot-v2` as if the package existed. The snapshot is for this example only, not for redistribution. When the package publishes: add the dependency to `package.json`, delete `app/sdk/`, and remove the `@reactor-models/lingbot-v2` entry from tsconfig `paths` — no component edits. Never hand-edit the two generated files in `app/sdk/`.

## What Lingbot 2 actually is, in three sentences

Lingbot 2 is a **continuous, interactive world model**. Given a starting image and a paragraph-length prompt, it produces an unending stream of video on a single track (`main_video`) — there is no "request, get clip, end". While it's generating, the client streams realtime movement and camera commands (`set_move_longitudinal`, `set_move_lateral`, `set_look_horizontal`, `set_look_vertical`, plus the low-level `set_camera_pose`) that the model picks up at chunk boundaries, producing the feeling of "driving" the scene with WASD.

The frontend's job is to (a) start the generation with a valid image + prompt, (b) keep the user driving it, and (c) gracefully reflect the model's state.

## The four concepts you'll touch

| Concept        | What it is                                                                         | Hook / API                                                                                                                                                                                                                                                                                         |
| -------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Connection** | The lifecycle of the model session (`disconnected → connecting → waiting → ready`) | `useLingbotV2().status`, `.connect()`, `.disconnect()`                                                                                                                                                                                                                                             |
| **Events**     | Things you send TO the model. Always async.                                        | `useLingbotV2().setPrompt({...})`, `.setImage({...})`, `.setMoveLongitudinal({...})`, `.setMoveLateral({...})`, `.setLookHorizontal({...})`, `.setLookVertical({...})`, `.setCameraPose({...})`, `.setRotationSpeedDeg({...})`, `.setSeed({...})`, `.start()`, `.pause()`, `.resume()`, `.reset()` |
| **Messages**   | Things the model sends BACK to you — including the all-important `state` snapshot. | `useLingbotV2State((m) => …)`, `useLingbotV2CommandError`, `useLingbotV2ImageAccepted`, etc.                                                                                                                                                                                                       |
| **Tracks**     | The model's video output, rendered as a live `MediaStreamTrack`.                   | `<LingbotV2MainVideoView />`                                                                                                                                                                                                                                                                       |

You almost never have to drop below this surface. If you find yourself reaching for `@reactor-team/js-sdk` directly, stop and re-read the typed hooks list — there's likely a typed hook you're missing. The one documented exception is the recording surface (see [Capturing clips](#capturing-clips) below), which is a base-SDK feature that the typed packages deliberately do not re-export.

## The UI phase model

A real-time video session is not one screen — it's a state machine. This app maps that state machine to **two visible UI phases**, and each component decides for itself which phase it lives in:

```
       ┌──────────────┐    setImage → setPrompt → start    ┌────────────────┐
       │  WAITING     │ ────────────────────────────────▶  │   GENERATING   │
       │  (Setup UI)  │ ◀──────────────────────────────── │   (Live UI)    │
       └──────────────┘             reset                  └─────┬──────────┘
                                                                │ ▲
                                                           pause│ │resume
                                                                ▼ │
                                                          ┌────────────────┐
                                                          │     PAUSED     │
                                                          │   (Live UI)    │
                                                          └────────────────┘
```

| UI phase  | When                                                                           | What's visible                                                                                                                                                                             | What's hidden                                              |
| --------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| **Setup** | `snapshot.started === false` (or no snapshot — fresh page / just disconnected) | StatusBadge · CommandError · ScenePicker · CustomStart                                                                                                                                     | NowPlaying · MovementControls · CameraPose · DynamicEvents |
| **Live**  | `snapshot.started === true` (running OR paused)                                | StatusBadge · CommandError · NowPlaying (Pause/Resume/Reset) · MovementControls (WASD + look + rotation slider) · CameraPose (curated camera moves) · DynamicEvents (curated world events) | ScenePicker · CustomStart                                  |

Components self-hide via early returns on the snapshot. No orchestration logic in the parent — adding a new component means dropping it into the sidebar and putting the right early-return at its top.

### When you add a new control, decide its phase first

Before writing a new component, decide which phase it belongs to:

- **Knob that primes a session** (e.g. a seed picker, a starting-image gallery, a prompt textarea) → Setup phase. Early-return when generating.
- **Knob that adjusts the live scene** (e.g. movement buttons, camera tweaks, hot-swap prompt) → Live phase. Early-return when not generating.
- **Always-on** (e.g. a stats panel) → no early return; just gate interactivity on `status === "ready"`.

```tsx
// Setup-phase component
if (status === "ready" && snapshot?.started) return null;

// Live-phase component
if (status !== "ready" || !snapshot?.started) return null;
```

The `status === "ready"` half of these checks matters — without it, your component will render stale data from a previous session after a disconnect/reconnect.

## What's intentionally not exposed (and where to add it)

The model offers more knobs than this app surfaces. Each one is straightforward to add — drop a new component into the matching phase and call the relevant typed method.

| Knob                                 | Hook                                                        | Lives in                     | Notes                                                                                                                                                                                                                                                                                                 |
| ------------------------------------ | ----------------------------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `set_seed`                           | `useLingbotV2().setSeed({ seed })`                          | Setup (read once at `start`) | Non-negative integer. Read once when `start` fires; later changes take effect only after `reset` + new `start`.                                                                                                                                                                                       |
| Free-form mid-stream prompt textarea | `useLingbotV2().setPrompt({ prompt })`                      | Live                         | `DynamicEvents` (see [Hot-swapping the world via dynamic events](#hot-swapping-the-world-via-dynamic-events)) ships a curated picker. If you want a free-text variant, drop a textarea next to it that sends `setPrompt({ prompt: base + " " + userText })` — re-use the base-prompt capture pattern. |
| Movement-aware prompt schedule       | (sequence of `setPrompt` calls timed from `chunk_complete`) | Live                         | There is no chunk-level schedule built into the model — emulate it by reacting to `useLingbotV2ChunkComplete` and sending the next prompt yourself when `msg.chunk_index === target`.                                                                                                                 |
| Multi-frame camera choreography      | `useLingbotV2().setCameraPose({ camera_pose })`             | Live                         | The bundled `CameraPose` panel sends one 6-float delta per chunk. The command also accepts `6 * chunk_size` floats — one delta per latent frame — for within-chunk arcs and eased ramps. See [Directing the camera](#directing-the-camera--set_camera_pose).                                          |

A new control is one ~30-line component that drops into the right phase — make it easy to add but don't ship them all.

## Auth — `getJwt` resolver + cacheable GET route

Two pieces work together: a Next.js GET route that mints (and caches) the JWT server-side, and a `getJwt` resolver prop on `<LingbotV2Provider>` that calls it on every Coordinator HTTP hop.

### `getJwt`, not `jwtToken`

`@reactor-team/js-sdk` ≥ 2.10.1 accepts a **resolver** anywhere it used to take a static string:

```tsx
type JwtSource = string | (() => string | Promise<string>);
```

The example passes `getJwt={fetchToken}` to `<LingbotV2Provider>`. The SDK then re-invokes that function on every Coordinator HTTP call — `POST /sessions/:id/uploads`, `GET /clips`, ICE refresh, SDP renegotiation — so a token aging out mid-session can't 401 those hops. The legacy `jwtToken="..."` string prop still works but caches one value at construction time and breaks the moment that value expires.

The provider auto-stabilizes the resolver via `useRef + useMemo`, so the inline arrow form is safe — a parent re-render does **not** tear the session down. Do not wrap it in `useCallback`.

Clip surfaces (`<ClipPlayer>`, `<ClipDownloadButton>`, `useClipDownload`) auto-inherit `getJwt` via React context, so you do not pass it through `SnapClip` anymore — see [Capturing clips](#capturing-clips).

### The route — `app/api/reactor/token/route.ts`

Already implemented. You usually don't need to touch it, but here's why it works the way it does so you don't accidentally break it:

1. **GET, not POST.** Browsers don't cache POST responses. The route handler still POSTs to the Reactor API internally; the public route exposes itself as GET so the browser's HTTP cache can transparently serve repeat calls.
2. **`Cache-Control: private`.** Never `public` — JWTs are per-user and must not be shared across users by any CDN or proxy.
3. **`max-age` derived from the server's `expires_at`**, not a hardcoded number. The Reactor `/tokens` endpoint accepts an `expires_after` body and returns `{ jwt, expires_at }`. The route uses `expires_at` to set the cache window so it always tracks what the server actually granted.

Because the route is GET + cacheable, the `getJwt` resolver is also dumb on the wire — every Coordinator hop calls `fetch("/api/reactor/token")`, which 99% of the time comes back from the browser's HTTP cache without ever touching your server.

### Wiring an identity-provider JWT instead (Clerk, Auth0, …)

If your app uses Clerk session tokens or any other short-TTL identity JWT (Clerk's `getToken({ template: "reactor" })` ships with a default ~60s TTL), `getJwt` is _the_ hook for that:

```tsx
import { useAuth } from "@clerk/nextjs";

function App() {
  const { getToken } = useAuth();
  return (
    <LingbotV2Provider
      getJwt={async () => (await getToken({ template: "reactor" })) ?? ""}
    >
      {/* ... */}
    </LingbotV2Provider>
  );
}
```

Returning `""` suppresses the `Authorization` header entirely (use this for local-dev / unauthenticated paths). `getJwt` wins over `jwtToken` when both are passed.

### Configuring autoConnect

`<LingbotV2Provider>` is initialized **without** `autoConnect`. The user clicks "Connect" so they see the `disconnected → connecting → waiting → ready` transitions. If you're shipping a polished product where you'd rather the connection happen on page load:

```tsx
<LingbotV2Provider getJwt={fetchToken} connectOptions={{ autoConnect: true }}>
```

Just make sure your status indicator still surfaces the intermediate states (`connecting`, `waiting for GPU`) — sessions don't reach `ready` instantly, and you don't want users staring at an unexplained loading state.

## The state snapshot — your UI's single source of truth

Lingbot 2 emits a `state` message after every command and every completed chunk. Subscribe via `useLingbotV2State`, hold it in `useState`, and read fields off it. **Don't aggregate `chunk_complete`, `generation_started`, `generation_paused` and try to reconstruct state yourself** — the snapshot already contains everything.

```tsx
const [snapshot, setSnapshot] = useState<LingbotV2StateMessage | null>(null);
useLingbotV2State((msg) => setSnapshot(msg));
```

Fields you'll actually read:

| Field                                                                      | Meaning                                                                                                                                                                                                                                                                                   |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `started`                                                                  | True once `start()` has succeeded. Stays true through pause. Reset to false by `reset()`. **This is the phase switch.**                                                                                                                                                                   |
| `running`                                                                  | True while the model is actively producing frames. Equal to `started && !paused`.                                                                                                                                                                                                         |
| `paused`                                                                   | True after `pause()`, false again after `resume()`.                                                                                                                                                                                                                                       |
| `has_image` / `has_prompt`                                                 | Setup-phase preconditions for `start()`. Both must be true.                                                                                                                                                                                                                               |
| `current_prompt`                                                           | The prompt currently driving generation. `null` (typed as `unknown`) before `start()`.                                                                                                                                                                                                    |
| `current_chunk`                                                            | Zero-based index of the last completed chunk since the last reset.                                                                                                                                                                                                                        |
| `current_action`                                                           | Composite action string derived from all four axes — a `+`-joined combination of `w`/`s`/`a`/`d` and `left`/`right`/`up`/`down` (`"w+a"`, `"w+left"`, `"still"`). Useful for showing what the model is actually doing right now (lags presses by one chunk).                              |
| `move_longitudinal` / `move_lateral` / `look_horizontal` / `look_vertical` | Current values of the corresponding input fields as the model sees them. **Don't drive button highlights from these** — they lag presses by a chunk. Use local press state instead (see Building new live-phase controls below). They're still useful for debugging / telemetry overlays. |
| `camera_pose_active`                                                       | True while a non-empty `camera_pose` is set. Read it as a safety net so pose UI can't show a phantom active move (see [Directing the camera](#directing-the-camera--set_camera_pose)).                                                                                                    |
| `rotation_speed_deg`                                                       | Current rotation rate (0–30). Bind a slider to it.                                                                                                                                                                                                                                        |
| `seed`                                                                     | Current seed input. The seed actually used by the running generation was captured at `start`; later changes need `reset` + new `start`.                                                                                                                                                   |

### Clear the snapshot on disconnect

The SDK does not emit a final `state` message when the session ends. Without an explicit reset, the last snapshot from the previous session lingers in your component's state — so after a reconnect, your UI shows stale "we're still generating!" data until the new session's first `state` arrives.

Every component that holds a snapshot does this:

```tsx
useEffect(() => {
  if (status !== "ready") setSnapshot(null);
}, [status]);
```

When you add a new component that subscribes to `useLingbotV2State`, include this. Three lines, no abstraction needed.

### Auto-restart on `generation_complete`

A run is a finite number of chunks — `generation_started` announces the total as `chunk_num` (and the total frame count as `frame_num`). When all chunks have streamed, the server emits `generation_complete`. If the session is still `started`, the server **immediately kicks off another run with the same prompt and image** — fresh noise, same conditioning.

What this means for the UI:

- `snapshot.started` does NOT flip to `false` at the end of a run.
- The next run's first `state` arrives shortly after `generation_complete`, with `current_chunk` reset to 0.
- The user-visible behaviour is "keeps going forever, with subtle resets you'd only notice if you're looking" — exactly what the live phase wants.
- The only way to STOP is `reset()`. Pause stops emitting frames; reset clears the session and returns to the WAITING phase.

You don't need any code to handle this. Just don't expect `started` to fall on its own.

One thing the snapshot does NOT carry is the run length. If you want a "chunk 12 / 48" progress readout (the `NowPlaying` panel does), capture `chunk_num` from `useLingbotV2GenerationStarted` and drop it on `generation_complete` / `generation_reset` / disconnect — the auto-restarted next run announces its own `generation_started` with a fresh total.

## Sending events — the typed methods

Every event Lingbot 2 accepts has a typed wrapper on `useLingbotV2()`. Always await them; they return a Promise that can reject.

```tsx
const {
  setImage,
  setPrompt,
  setMoveLongitudinal,
  setMoveLateral,
  setLookHorizontal,
  setLookVertical,
  setCameraPose,
  setRotationSpeedDeg,
  setSeed,
  start,
  pause,
  resume,
  reset,
} = useLingbotV2();

await setMoveLongitudinal({ move_longitudinal: "forward" });
await setMoveLateral({ move_lateral: "strafe_left" }); // both axes → diagonal
await setLookHorizontal({ look_horizontal: "left" });
// later, on key release (each axis returns to idle independently):
await setMoveLateral({ move_lateral: "idle" });
await setMoveLongitudinal({ move_longitudinal: "idle" });
```

**Never reach for `sendCommand("set_move_longitudinal", ...)` when a typed method exists.** You lose autocomplete and the param-name typo check.

### Movement is two independent axes

v1 had a single combined `set_movement` field; v2 splits it. `set_move_longitudinal` (`idle` / `forward` / `back`) and `set_move_lateral` (`idle` / `strafe_left` / `strafe_right`) are independent — both can be non-idle at once, which is what makes W+A genuine diagonal movement instead of a mode switch. Track each axis as its own local press state and release each axis to `"idle"` on its own key-up; never fold them into one variable.

### Status-gate every interactive control

Sending an event when `status !== "ready"` is a no-op with a console warning. Surface this as `disabled` on the button so the user sees what's clickable:

```tsx
const { status, setMoveLongitudinal } = useLingbotV2();
const [snapshot, setSnapshot] = useState<LingbotV2StateMessage | null>(null);
useLingbotV2State((m) => setSnapshot(m));

const ready = status === "ready" && snapshot?.started === true;
<button
  disabled={!ready}
  onMouseDown={() => setMoveLongitudinal({ move_longitudinal: "forward" })}
>
  W
</button>;
```

On disconnect the gate trips and your new control greys out automatically — exactly the same visual state as a freshly loaded, never-connected page.

### Movement commands stay idle when released

Every WASD / look axis is **state-based, not event-based** — the model holds the last value you sent until you change it. If you send `set_move_longitudinal: "forward"` and never send `set_move_longitudinal: "idle"`, the subject keeps walking forever.

The keyboard handler in `MovementControls` covers this: keydown sends the direction, keyup sends `"idle"` — per axis, so releasing A while still holding W drops only the lateral component of a diagonal. The on-screen pad uses `onMouseDown` + `onMouseUp` + `onMouseLeave` (for the case where the user drags off the button). When you add a new axis, follow the same pattern.

## Awaiting acknowledgments before chaining commands

This is the most underrated rule when wiring up new commands.

Events are fire-and-forget over a data channel. If you do this:

```tsx
// ❌ flickers on the first frame
await setImage({ image: ref });
await setPrompt({ prompt: "..." });
await start();
```

…the model can start generating before the image conditioning has been applied. You'll see a frame or two of pure-prompt output, then the image lands and the scene visibly shifts.

**Fix: wait for the model's acknowledgment between the slow step and `start()`.** Lingbot 2 emits `image_accepted` once the uploaded image has been fully processed:

```tsx
const imageReadyRef = useRef<(() => void) | null>(null);

useLingbotV2ImageAccepted(() => {
  if (imageReadyRef.current) {
    imageReadyRef.current();
    imageReadyRef.current = null;
  }
});

async function startScene(scene) {
  // Park the resolver BEFORE sending the command — registering it
  // afterwards would race the model's response.
  const imageReady = new Promise<void>((resolve) => {
    imageReadyRef.current = resolve;
  });

  await setImage({ image: ref });
  await imageReady; // ← critical wait
  await setPrompt({ prompt: scene.prompt });
  await start();
}
```

Apply this any time you chain a slow conditioning step before `start()`. The movement/look commands don't need it — they're picked up at the next chunk boundary, no synchronous decode required.

## The image is required, and it's locked at `start`

Two preconditions worth burning into your head:

1. **`start` requires both a prompt AND an image.** If either is missing, the model responds with a `command_error` ("prompt is empty" / "image is missing"). The setup UI should disable Start until both are set — read `snapshot.has_prompt && snapshot.has_image` to gate the button.
2. **The image cannot be hot-swapped mid-stream.** Calling `set_image` during generation has no visual effect until the next `reset` + `start` cycle. If you want a "change the world I'm in" interaction, you have to either:
   - swap the **prompt** mid-stream (works — the next chunk picks it up), or
   - emit a `reset()` and walk the user through a new scene-selection flow.

The example app exposes mid-stream prompt swap only via the bundled scenes, but the typed method is available — drop a small textarea into `<MovementControls>` (or its own live-phase component) and call `setPrompt({ prompt })` directly.

## Receiving messages — the typed hooks

`@reactor-models/lingbot-v2` ships one typed subscription hook per message:

| Hook                                                                          | Purpose                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useLingbotV2State(handler)`                                                  | The state snapshot. **Use this; almost everything you need is here.**                                                                                                                                                                                                                                                      |
| `useLingbotV2CommandError(handler)`                                           | A command was rejected (bad preconditions, bad input). Render this somewhere visible.                                                                                                                                                                                                                                      |
| `useLingbotV2ImageAccepted(handler)`                                          | An uploaded image was successfully processed. Use to coordinate the image→prompt→start chain above.                                                                                                                                                                                                                        |
| `useLingbotV2PromptAccepted(handler)`                                         | A prompt was queued. Useful for toast notifications.                                                                                                                                                                                                                                                                       |
| `useLingbotV2ChunkComplete(handler)`                                          | One chunk finished generating. Useful for progress sounds, telemetry, scheduled prompt swaps.                                                                                                                                                                                                                              |
| `useLingbotV2GenerationStarted` / `Paused` / `Resumed` / `Reset` / `Complete` | Lifecycle transitions. Useful for one-shot reactions (toasts, sounds), but **don't aggregate these into your own state** — read the snapshot instead. The one exception: `generation_started` carries the run totals (`chunk_num`, `frame_num`) that never appear on the snapshot — capture them if you show run progress. |
| `useLingbotV2Message(handler)`                                                | Catch-all over the typed discriminated union. Useful for devtools / logging.                                                                                                                                                                                                                                               |
| `useLingbotV2ConditionsReady(handler)`                                        | Fires after each conditioning command with `has_prompt` / `has_image` flags. Lower-level than `image_accepted`; prefer the specific hooks.                                                                                                                                                                                 |

### Always surface `command_error`

`app/components/CommandError.tsx` already does this. The pattern:

```tsx
"use client";
import { useState } from "react";
import {
  useLingbotV2CommandError,
  useLingbotV2State,
} from "@reactor-models/lingbot-v2";

export function CommandError() {
  const [err, setErr] = useState<{ command: string; reason: string } | null>(
    null,
  );
  useLingbotV2CommandError((m) =>
    setErr({ command: m.command, reason: m.reason }),
  );
  useLingbotV2State(() => setErr(null)); // any state update means the user moved on
  if (!err) return null;
  return (
    <div className="error">
      {err.command} failed: {err.reason}
    </div>
  );
}
```

When you add a new event method, this will surface its failures automatically — no changes needed.

## Image-to-video flow (the canonical sequence)

The pattern in `app/components/ScenePicker.tsx`:

1. Get bytes (`fetch(url).then(r => r.blob())` for a curated image, or `e.target.files[0]` from `<input type="file">`).
2. `await uploadFile(blob)` → returns a `FileRef`.
3. Park the `image_accepted` resolver in a ref **before** firing the next command.
4. `await setImage({ image: ref })` — the SDK lifts the `FileRef` out of the params into an `uploads` envelope automatically; you treat `image: ref` as a regular field.
5. `await imageReady` — wait for `image_accepted`.
6. `await setPrompt({ prompt })`.
7. `await start()`.

For the custom-upload path (`CustomStart.tsx`), steps 6–7 happen on a separate "Start" click — the upload sets up the image conditioning, the user types a prompt, then submits.

## The scene library — one image plus one prompt per entry

All curated scenes live in `app/lib/scenes.ts`. Each entry is self-contained:

```ts
export interface Scene {
  id: string;
  label: string;
  description: string;
  imageUrl: string;
  prompt: string;
}

export const SCENES: ReadonlyArray<Scene> = [/* ... */];
```

`ScenePicker` reads `SCENES` → renders each as an image card. Click → image upload → `setImage` → wait → `setPrompt` → `start`.

**Adding a new scene = one entry in `SCENES`.** Drop the image bytes into `public/images/` and reference it from the entry. No component changes.

### Prompts must be full paragraphs that frame both subject AND camera

This is the most underrated part of building a real-time video frontend, and the #1 reason scenes look choppy when they should be smooth.

**Each prompt is a paragraph**, not a tagline. Describe the subject, the action, the environment, the lighting, AND the camera shot. Single-sentence prompts ("a dragon flying over a castle") produce visually unstable output because the model has to invent everything else from scratch each chunk.

**Explicitly describe the camera framing**, including how it should react to user input. The bundled scenes use phrasing like:

```
Strict centred third-person rear view: the dragon is locked at the
exact centre of the frame. The camera tracks the dragon from above
and behind as it moves forward and never rotates around it; arrow-key
look-input turns the dragon's heading instead, preserving the rear-view
framing.
```

That second sentence is what teaches the model "horizontal-look means turn the subject", instead of "horizontal-look means orbit the camera". Without it, look-input often produces unwanted camera-rotation effects.

**Describe the movement style in the prompt** even though the actual movement is driven by the movement axes. The prompt phrase "the wings beat … driving forward through the sky" gives the model a coherent visual to use when the user holds W. If the prompt said the dragon was hovering perfectly still, the W key would fight the prompt for half a chunk.

## Building new live-phase controls

The signature live-phase component in this app is `MovementControls`. The pattern it uses:

```tsx
// 1. Read the snapshot and gate on the live phase.
const [snapshot, setSnapshot] = useState<LingbotV2StateMessage | null>(null);
useLingbotV2State((m) => setSnapshot(m));
useEffect(() => {
  if (status !== "ready") setSnapshot(null);
}, [status]);
if (status !== "ready" || !snapshot?.started) return null;

// 2. Track local press state for EVERY axis you expose — one state
//    variable per model axis (longitudinal, lateral, look-h, look-v),
//    never one shared variable. This is the source of truth for the
//    UI — the model's snapshot lags by a chunk, which makes
//    highlights flicker behind the user's fingers.
const [pressedLongitudinal, setPressedLongitudinal] =
  useState<Longitudinal>("idle");

// 3. Fire-and-forget typed methods on press, with a release handler.
//    Update local state in the same step so the highlight is instant.
const { setMoveLongitudinal } = useLingbotV2();
const sendLongitudinal = (m: Longitudinal) => {
  setPressedLongitudinal(m);
  setMoveLongitudinal({ move_longitudinal: m });
};

<button
  onMouseDown={() => sendLongitudinal("forward")}
  onMouseUp={() => sendLongitudinal("idle")}
  onMouseLeave={() =>
    pressedLongitudinal === "forward" && sendLongitudinal("idle")
  }
  className={pressedLongitudinal === "forward" ? "bg-brand" : "bg-zinc-950"}
/>;
```

Why local press state instead of the snapshot for highlights? The model only "sees" your command at the next chunk boundary (≈0.5–1 s), and the matching `state` message arrives shortly after that. If button styling reads from the snapshot, every press shows a visible delay before the button lights up, and quick taps don't register at all. Local press state matches what the user just did — and on release, you clear it in the same step you send `"idle"` to the model.

The slider for `rotation_speed_deg` is different — it's a persistent value with no "release", so it reads from the snapshot. Use whichever pattern matches the shape of the input.

If you add a new axis (e.g. "set_zoom" if it ever ships) or a new keyboard binding, follow the same shape — local state for highlights, typed method on press, `"idle"` (or the neutral value) on release.

### Keyboard handlers

The example wires window-level `keydown` / `keyup` listeners inside `MovementControls` so the user doesn't have to focus a button to drive the model. Two things to copy when adding new bindings:

1. **Ignore key events that land in inputs.** Otherwise typing a prompt accidentally drives the character. The pattern: `if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;`
2. **`preventDefault()` on every handled key.** Otherwise arrow keys scroll the page.

## Hot-swapping the world via dynamic events

`DynamicEvents` is the second live-phase component the app ships. Where `MovementControls` drives the _subject_ via the typed movement / look methods, `DynamicEvents` mutates the _world_ via curated `setPrompt` hot-swaps. One click sends a new prompt — the model picks it up on the next chunk and the scene visibly shifts (rain begins, fog rolls in, night falls) without restarting or losing the reference image.

This is Lingbot 2's signature mid-stream prompt-swap capability put on a surface a non-author can press. Mid-stream `setPrompt` is fully supported by the model — the reference image stays, only the prose changes.

### The base-prompt capture pattern

The trick that makes this component work is **capturing the base prompt once, then never overwriting it**. Here's why:

```tsx
const basePromptRef = useRef<string | null>(null);

useEffect(() => {
  if (!snapshot) return;
  if (!snapshot.started) {
    // Reset / not-yet-started — drop captured base so the next
    // `start` re-captures from the new scene.
    basePromptRef.current = null;
    setActiveId(null);
    return;
  }
  if (
    basePromptRef.current === null &&
    typeof snapshot.current_prompt === "string"
  ) {
    basePromptRef.current = snapshot.current_prompt;
  }
}, [snapshot]);
```

The very first `state` snapshot with `started === true` carries the prompt the user picked (or typed). We stash it in a ref. **From then on, the snapshot's `current_prompt` will reflect OUR composed prompts** (`base + " " + event.text`) once the user clicks an event — so re-capturing on every snapshot would lock in the augmented version as the new "base" and toggle-off would become impossible.

The ref clears on `started: false` (reset) and on disconnect, so the next session re-captures from a clean slate. Apply the same pattern any time you want a "stable scene" anchor across mid-stream prompt changes.

### Single-active toggle, not stacking

`DynamicEvents` is deliberately **single-active**: clicking event A sends `base + " " + A.text`; clicking event B sends `base + " " + B.text` (replacing A); clicking A again sends just `base` (toggle off).

The alternative — stacking events so multiple are appended at once — is more flexible but produces ambiguous prompts and visibly worse output: the model has to reconcile competing instructions ("rain begins" + "night falls" + "fog rolls in") and the result tends to collapse to one of them. Stick with single-active unless you have prose specifically written to compose.

### Adding a new world event

One entry in [`app/lib/dynamic-events.ts`](../app/lib/dynamic-events.ts), no component changes. The library is a flat list; the component iterates it.

```ts
{
  id: "dust_storm",
  label: "Dust storm",
  icon: "🌪️",
  text: "A churning dust storm sweeps across the scene, ochre haze swallowing the horizon and grit streaming sideways through the air, every silhouette softened into a tawny silhouette.",
}
```

Three authoring rules (the file's comment block has them too):

1. **One sentence per event.** Anything longer competes with the starting prompt and produces garbled output.
2. **Describe atmosphere, not the subject.** The base prompt already framed the subject and the camera; world events stay in the environmental layer (weather, light, sky, time-of-day) so they slot onto any starting scene without contradicting it.
3. **Present continuous voice** ("rain begins to fall…"), matching the starting prompts.

### Extending the pattern beyond curated events

The base-prompt capture trick is the reusable bit. Two places it's natural to extend:

- **Free-text mid-stream prompt textarea.** Drop a textarea component next to `DynamicEvents` in the live phase. On submit, send `setPrompt({ prompt: base + " " + userText })` (or just `userText` if you want full prompt replacement).
- **Scheduled prompts.** React to `useLingbotV2ChunkComplete` and fire the next composed prompt when `msg.chunk_index` hits a target. Use the captured base so the chained prompts stay anchored to the same scene.

## Directing the camera — `set_camera_pose`

`set_camera_pose` is Lingbot 2's native low-level camera layer, and the third live-phase surface this app ships (`CameraPose`, presets in [`app/lib/camera-moves.ts`](../app/lib/camera-moves.ts)). It bypasses the high-level look/move axes and feeds motion deltas straight to the camera.

### The payload shape

A flat list of floats, length a multiple of 6 — `[rx, ry, rz, tx, ty, tz]` per frame: a small Euler-radian rotation plus a translation, in the camera-local frame.

- **6 floats** — one delta applied to the whole chunk. What the bundled presets send; the simplest useful shape.
- **`6 * chunk_size` floats** — one delta per latent frame, for within-chunk choreography (sweeping arcs, eased ramps).
- **Any other `6 * k`** — resampled to `chunk_size`.
- **Empty list** — deactivates the layer and hands the camera back to the look axes.

Inputs are sanitized model-side (NaN/Inf → 0, rotations clamped to ±pi, translation to ±100), so a bad payload can't break the session. Still, keep deltas gentle — they re-apply every chunk, so `ry = 0.04` reads as a graceful orbit while `0.4` is a whip-pan.

### Precedence over the other axes

While a non-empty pose is active:

- its **rotation OVERRIDES** `look_horizontal` / `look_vertical` — the arrow keys stop turning the camera entirely;
- its **translation ADDS** to the WASD movement axes.

Say so in the UI (the bundled panel's caption does), because "my arrow keys stopped working" is otherwise indistinguishable from a bug. And always give the user a release affordance — the bundled panel re-click sends `{ camera_pose: [] }`.

### The safety-net pattern

`CameraPose` highlights from local selection state (same rationale as the movement pad), but it also watches the snapshot's `camera_pose_active` flag and drops the local selection whenever the model reports the layer inactive — covering `reset()`, and any other surface clearing the pose. Trust the model over local state for _whether_ the layer is active; use local state only for _which_ preset the user just picked.

### Adding a new camera move

One entry in [`app/lib/camera-moves.ts`](../app/lib/camera-moves.ts), no component changes. Three authoring rules (the file's comment block has them too):

1. **Keep each delta gentle.** |rotation| ≤ ~0.05 rad and |translation| ≤ ~0.5 per chunk reads as deliberate camera work.
2. **Name the cinematographic move**, not the math — users pick "Orbit", never "+ry −tx".
3. **One motion idea per preset.** An orbit is yaw + counter-strafe (that's one idea); orbit-while-craning is two presets, not one.

## Capturing clips

The Reactor base SDK exposes a recording surface that works for every model: ask for the last N seconds of the live stream, get back a `Clip`, and either preview it with `<ClipPlayer>` or download it with `<ClipDownloadButton>`. The model SDK does not own this — it lives on `@reactor-team/js-sdk` because it is the same call for Lingbot, Helios, and every future model with recording enabled.

The example ships a drop-in [`app/components/SnapClip.tsx`](../app/components/SnapClip.tsx) panel that wires this together: a "Capture" button that calls `requestClip(durationSeconds)` off the store, opens a modal with the SDK's preview player, and offers an MP4 download. It is **model-agnostic** — the same file ships unchanged in every example.

### When to reach for `@reactor-team/js-sdk` directly

The default rule still applies: do everything via `@reactor-models/lingbot-v2`. But the typed package only re-exports model-specific surface (events, messages, the typed provider/hook). The recording surface is base-SDK only, so for that one feature you import directly:

```tsx
import {
  ClipDownloadButton,
  ClipPlayer,
  RecordingError,
  useReactor,
  type Clip,
} from "@reactor-team/js-sdk";
```

When you scaffold a new component, ask: "Does this depend on Lingbot-specific events, messages, or commands?" If yes → typed package only. If no, and it would work the same on any model (recording, generic stats, generic connection state) → `@reactor-team/js-sdk` is fine.

### The pattern

`SnapClip` is small enough to read in one go. The shape that matters:

1. **Destructure the recording action off the store.** `useReactor((s) => s.requestClip)` is the canonical accessor as of `@reactor-team/js-sdk` ≥ 2.11.1 — `requestClip`, `requestRecording`, and `downloadClipAsFile` are first-class actions alongside `connect` / `disconnect` / `uploadFile`. No `s.internal.reactor` indirection.
2. **Gate on connection status.** `useReactor((s) => s.status)` — return `null` when status is not `"ready"`, so the panel disappears on disconnect just like every other live-only control.
3. **Catch `RecordingError`.** Recording can fail with typed reasons (`DISCONNECTED`, `RECORDER_DISABLED`, `INVALID_DURATION`, `REQUEST_TIMEOUT`). Surface them inline like `CommandError` does.
4. **Compose `<ClipPlayer>` + `<ClipDownloadButton>` in a modal, route their errors through callbacks.** Both accept `onError` (and `<ClipDownloadButton>` also accepts `onSuccess(blob)`); `SnapClip` threads them into the same inline error line that `requestClip` failures use. The SDK's components stay usable after disconnect, so the modal keeps working if the session ends mid-preview.
5. **No `getJwt` plumbing.** Both clip components auto-inherit the resolver from `<LingbotV2Provider getJwt={…}>` via React context (`@reactor-team/js-sdk` ≥ 2.10.1). That is the single source of truth for auth in this app — `SnapClip` doesn't need to know about the JWT route at all.

### The portal gotcha (Sonner toasts, headless modals)

The context-inheritance only works for components rendered **inside** the provider subtree. `SnapClip`'s modal is a normal child of the panel, so it inherits the resolver fine.

The trap is rendering clip UI through a React portal whose host lives _outside_ `<LingbotV2Provider>` — most commonly a Sonner `<Toaster />` mounted in `app/layout.tsx` as a sibling of `{children}`. The custom-toast tree has no `ReactorContext` in scope, the fallback returns `undefined`, and Coordinator answers the clip download with:

```
{"error":"Missing Authorization header"}
```

Fix: capture the resolver imperatively _inside_ the provider subtree, then thread it down as an explicit prop. The resolver outlives `disconnect()` by design, so the toast keeps minting fresh tokens even after the session ends.

```tsx
function HandlerInsideProvider() {
  // `requestClip` is a top-level store action; `internal.reactor`
  // stays in the escape-hatch slot for `getJwtResolver()` because
  // that one isn't lifted onto the store surface.
  const { requestClip, reactor } = useReactor((s) => ({
    requestClip: s.requestClip,
    reactor: s.internal.reactor,
  }));

  const onSnap = async () => {
    const clip = await requestClip(30);

    // Captured here — works because we're inside the provider.
    // The closure carries it across Sonner's portal boundary.
    const getJwt = reactor.getJwtResolver();

    toast.custom(() => <ClipReadyToast clip={clip} getJwt={getJwt} />);
  };
}
```

### hls.js is an optional peer

`<ClipPlayer>` plays HLS natively on Safari/iOS. On Chrome / Firefox / Edge it dynamically imports `hls.js` — which is why the example declares it as a direct dep (`hls.js@^1.6.0`). If `hls.js` isn't installed, the player surfaces an inline error and downloads still work; the dep keeps the preview path functional for the majority of users.

### Extending

The component takes optional props for `durationSeconds` (default 10), `filename`, and `label`. Most extensions are one prop:

```tsx
<SnapClip durationSeconds={30} label="Save 30s highlight" />
```

For multi-clip galleries, store an array of `Clip` instead of a single one, render a thumbnail per entry, and pass each to `<ClipPlayer>` / `<ClipDownloadButton>` on click. The headless [`useClipDownload`](https://docs.reactor.inc/api-reference/react-hooks#useclipdownload) hook is what to use if you want a custom progress UI instead of the default button.

### Full-session recordings

`requestRecording()` (no args, also on the store) grabs everything from the start of recording up to now, instead of a trailing window. Same `Clip` shape, longer manifest, larger MP4. Swap the call inside `SnapClip` if you want a "Save the whole session" button instead.

### Clips are short-lived

The URL on a `Clip` expires after a few minutes. Do not store `Clip` objects long-term, and do not hand `clip.playlistUrl` to your users for sharing. If you want a permanent link, download the MP4 (via `<ClipDownloadButton>` or `downloadClipAsFile(clip, null)` for a Blob) and host the result yourself.

### Clip downloads are social-media-ready (`@reactor-team/js-sdk` ≥ 2.10.1)

Behind the existing `<ClipDownloadButton>` / `reactor.downloadClipAsFile()` API the SDK now remuxes the fragmented MP4 the runtime ships into a flat MP4 with `start_time=0` and faststart layout, using `mp4box` as a bundled runtime dep. The transformation is `ffmpeg -c copy` style — no decode, no re-encode, the H.264 / AAC bitstream is bit-identical. The Blob you get back uploads cleanly to Twitter, Instagram, TikTok, YouTube; opens with `start_time=0` in QuickLook; and on the rare parse failure falls back silently to the previous fragmented bytes (logged via `console.warn`), so the download never fails outright. No knob, no API change — you get the right behaviour by being on 2.10.1+.

## Brand alignment — design tokens, not components

The app pulls Reactor's design tokens (fonts + brand colors) from `@reactor-team/ui`, but **does not** import its React components. Components ship interactive hooks under the hood — importing `<Button>` or `<CodeSnippet>` would force the consuming file into `"use client"` land. Design tokens have none of that baggage.

```css
/* app/globals.css */
@import "tailwindcss";

@theme {
  --font-sans: var(--reactor-font-sans);
  --font-mono: var(--reactor-font-mono);
  --color-brand: var(--reactor-color-light-gold);
  --color-brand-fg: var(--reactor-color-interstellar);
  --color-active: var(--reactor-color-flora-light);
}
```

```tsx
// app/layout.tsx
import "@reactor-team/ui/styles.css"; // fonts + brand CSS vars
import "./globals.css";
```

Use `bg-brand`, `text-brand`, `font-mono` etc. as plain Tailwind utilities — works in any component, server or client.

Reach for actual `@reactor-team/ui` components only when you need their behavior (e.g. a copy-on-click code block). Those usages are naturally Client Components anyway.

## Common mistakes when extending

1. **Reaching for `@reactor-team/js-sdk` directly.** Everything Lingbot-specific is on `@reactor-models/lingbot-v2`. If you find yourself reaching for `useReactor((s) => s.internal.reactor)` for a Lingbot event or message, re-read the typed hooks list above. The one allowed exception is the recording surface — see [Capturing clips](#capturing-clips). And on 2.11.1+, even recording is a top-level store action (`s.requestClip` / `s.requestRecording` / `s.downloadClipAsFile`); reach for `s.internal.reactor` only for the few surfaces that aren't lifted yet (`getJwtResolver()`, raw `runtimeMessage` subscriptions).
2. **Aggregating events to reconstruct state.** Subscribe to `useLingbotV2State` and read fields off the snapshot. Stop folding `chunk_complete` + `generation_started` + `generation_paused` into your own boolean flags.
3. **Calling `start()` without waiting for image conditioning.** First chunk will flicker. Use `useLingbotV2ImageAccepted` with a one-shot ref resolver.
4. **Forgetting to send `idle` on key release.** Movement/look axes hold their last value until you change them. Always pair every `set_move_longitudinal: "forward"` with a `set_move_longitudinal: "idle"` on key-up / mouse-up — per axis, so a released A drops the lateral component without touching W.
5. **Driving press-and-hold button highlights from the snapshot.** The snapshot lags presses by ~one chunk, so buttons light up half a second after the user clicks them and quick taps don't register visually. Track local press state instead. The snapshot is the source of truth for _persistent_ values (current prompt, rotation speed, started/paused) — not for transient ones.
6. **Treating `set_image` as a live-phase knob.** It isn't — the image is captured at `start` time and changes during generation have no effect. To swap the world, call `reset()` and start a new session.
7. **Forgetting to clear the snapshot on disconnect.** The next session's UI will show stale state. Three lines of `useEffect` in any component that holds a snapshot.
8. **`if (snapshot?.started) return null` without a status check.** After disconnect, `snapshot.started` may still be true (stale until the effect clears it). Always gate on `status === "ready"` too.
9. **Connecting from a `useEffect` in your own component.** The Provider owns connection lifecycle. Don't fight it; configure it via the `connectOptions` prop instead.
10. **Importing `@reactor-team/ui` components into a Server Component.** They use hooks internally. Either keep them in Client Components, or use the design tokens via CSS vars instead.
11. **Keyboard listeners that hijack typing in textareas.** Always early-return when `e.target` is an `INPUT` / `TEXTAREA` / contentEditable.
12. **Single-line prompts.** The model needs paragraph-length prompts with explicit camera framing. Short prompts produce choppy output and ambiguous look-input handling.
13. **Forgetting `preventDefault()` on arrow keys.** Otherwise the page scrolls every time the user looks around.
14. **Re-capturing the base prompt on every snapshot.** When you build a component that composes prompts on top of the active scene (like `DynamicEvents`), capture the base prompt ONCE on the first `started` snapshot. The snapshot's `current_prompt` reflects your composed prompt after the first send, so re-capturing locks in the augmented version and breaks toggle-off / revert behaviour. Drop the captured base on `started: false` so the next session re-captures.
15. **Folding the two movement axes into one variable.** `move_longitudinal` and `move_lateral` are independent model fields — one shared "movement" state makes W+A impossible and sends spurious `idle`s to the axis you didn't touch. One press-state variable and one release handler per axis.
16. **Leaving a camera pose active and wondering why look-input died.** An active `camera_pose` rotation overrides the look axes by design. Deactivate with an empty list, and mirror `snapshot.camera_pose_active` in the UI so the state is visible.

## Checklist for new components

Before merging a new control or feature:

- [ ] Decided which phase it lives in (Setup, Live, or always-on)
- [ ] Early-return at the top matches that phase (`status === "ready" && snapshot?.started` to hide in live, etc.)
- [ ] If it subscribes to `useLingbotV2State`, it clears on disconnect via `useEffect`
- [ ] All interactive controls gate `disabled` on `status === "ready"` (plus `snapshot?.started` for live-phase ones)
- [ ] All event method calls use the typed wrappers (`setMoveLongitudinal`, not `sendCommand("set_move_longitudinal", …)`) and are `await`ed (or fire-and-forget where appropriate)
- [ ] If chaining a slow conditioning step before `start()`, awaits the matching `image_accepted` / `prompt_accepted`
- [ ] State-based axes (movement, look) send `"idle"` on release — one release handler per axis, never shared
- [ ] Renders `command_error` somewhere visible (the existing `CommandError` component handles this automatically — don't suppress it)
- [ ] New scenes added to `app/lib/scenes.ts` are paragraph prompts with explicit subject + environment + camera framing
- [ ] New world events added to `app/lib/dynamic-events.ts` are single sentences describing atmosphere/weather/light (not the subject), written in present-continuous voice so they compose onto any starting scene
- [ ] New camera presets added to `app/lib/camera-moves.ts` are gentle single-idea deltas named after the cinematographic move, and any pose-driving UI offers an empty-list release and mirrors `camera_pose_active`
- [ ] Brand colors via Tailwind utilities (`bg-brand`, `text-brand`), not hardcoded hex
- [ ] No imports from `@reactor-team/js-sdk` or `@reactor-team/ui` React components unless absolutely required (recording surface is the documented exception — see [Capturing clips](#capturing-clips))
- [ ] Keyboard handlers ignore events that originate inside inputs / textareas
