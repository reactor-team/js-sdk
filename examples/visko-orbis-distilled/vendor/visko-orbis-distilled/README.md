# @reactor-models/visko-orbis-distilled

> Typed JavaScript + React SDK for the **ViskoOrbisDistilled** model on [Reactor](https://reactor.inc). Version **v2.0.0**.

---

## Get started

Scaffold a starter app for **ViskoOrbisDistilled** with [`create-reactor-app`](https://www.npmjs.com/package/create-reactor-app):

```shell
npx create-reactor-app my-app --model=visko-orbis-distilled
```

```shell
pnpm dlx create-reactor-app my-app --model=visko-orbis-distilled
```

---

## Install

```shell
npm install @reactor-models/visko-orbis-distilled
```

```shell
pnpm add @reactor-models/visko-orbis-distilled
```

The package exports a plain-JavaScript client and a set of React bindings. Import whichever you need from `@reactor-models/visko-orbis-distilled`:

```typescript
import { ViskoOrbisDistilledModel } from "@reactor-models/visko-orbis-distilled";
```

```typescript
import {
  ViskoOrbisDistilledProvider,
  useViskoOrbisDistilled,
} from "@reactor-models/visko-orbis-distilled";
```

React 18 or later is required when using the provider and hooks. The token-loading examples below use [React 19's `use()`](https://react.dev/reference/react/use); on React 18, fetch the JWT in a `useEffect` and pass it to the provider once it resolves.

---

## Authenticate

Reactor uses short-lived JWTs for session auth. You hold your API key on your server, mint a token on demand, and the client never sees the raw key. Tokens are valid for **6 hours** — if one leaks, it expires on its own.

Mint a JWT with **`POST https://api.reactor.inc/tokens`** and the **`Reactor-API-Key`** header; the response JSON is `{ "jwt": "..." }`.

### JavaScript (Next.js route handler)

```typescript
// app/api/reactor/token/route.ts
import { NextResponse } from "next/server";

export async function POST() {
  const res = await fetch("https://api.reactor.inc/tokens", {
    method: "POST",
    headers: { "Reactor-API-Key": process.env.REACTOR_API_KEY! },
  });
  const { jwt } = await res.json();
  return NextResponse.json({ jwt });
}
```

### React (provider)

Call the `/api/reactor/token` route above from a client component and pass the result to the provider:

```tsx
"use client";

import { use } from "react";
import { ViskoOrbisDistilledProvider } from "@reactor-models/visko-orbis-distilled";
import { ReactorView } from "@reactor-team/js-sdk";

async function getToken() {
  const r = await fetch("/api/reactor/token", { method: "POST" });
  const { jwt } = await r.json();
  return jwt;
}

const tokenPromise = getToken();

export default function App() {
  const token = use(tokenPromise);
  return (
    <ViskoOrbisDistilledProvider
      jwtToken={token}
      connectOptions={{ autoConnect: true }}
    >
      <ReactorView className="w-full aspect-video" />
    </ViskoOrbisDistilledProvider>
  );
}
```

---

## Connect

### JavaScript

```typescript
import { ViskoOrbisDistilledModel } from "@reactor-models/visko-orbis-distilled";

const viskoOrbisDistilled = new ViskoOrbisDistilledModel();
await viskoOrbisDistilled.connect(jwt);
```

### React

The provider takes the JWT as a prop; fetch it from the same `/api/reactor/token` route the Authenticate example mints:

```tsx
"use client";

import { use } from "react";
import {
  ViskoOrbisDistilledProvider,
  useViskoOrbisDistilled,
} from "@reactor-models/visko-orbis-distilled";

async function getToken() {
  const r = await fetch("/api/reactor/token", { method: "POST" });
  const { jwt } = await r.json();
  return jwt;
}

const tokenPromise = getToken();

function Controller() {
  const { status } = useViskoOrbisDistilled();
  return <span>Status: {status}</span>;
}

export default function App() {
  const token = use(tokenPromise);
  return (
    <ViskoOrbisDistilledProvider jwtToken={token}>
      <Controller />
    </ViskoOrbisDistilledProvider>
  );
}
```

---

## Events

Client-to-model commands. The typed surface is `ViskoOrbisDistilledModel` (one method per event) in plain JS, and `useViskoOrbisDistilled()` in React — every field name below matches the parameter name the method accepts.

### `pause`

Pause generation after the current chunk finishes. Frames stop streaming on `main_video` until [`resume`](#resume) is called; the model keeps its place, so resuming continues the same shot rather than starting a new one. Emits [`generation_paused`](#generation_paused) and [`state`](#state) on success, or [`command_error`](#command_error) if not generating or already paused.

Emits: [`generation_paused`](#generation_paused), [`state`](#state), [`command_error`](#command_error)

_No parameters._

#### JavaScript

```typescript
import { ViskoOrbisDistilledModel } from "@reactor-models/visko-orbis-distilled";

const viskoOrbisDistilled = new ViskoOrbisDistilledModel();
await viskoOrbisDistilled.connect(jwt);

await viskoOrbisDistilled.pause();
```

#### React

```tsx
"use client";
import { useViskoOrbisDistilled } from "@reactor-models/visko-orbis-distilled";

function Example() {
  const { pause } = useViskoOrbisDistilled();

  return <button onClick={() => pause()}>pause</button>;
}
```

### `reset`

Abort the current run, clear the active prompt and starting image, and return to the waiting state. Valid at any time. After [`reset`](#reset), call [`set_prompt`](#setprompt) (and optionally [`set_image`](#setimage)) again before [`start`](#start). Emits [`generation_reset`](#generation_reset) and [`state`](#state).

Emits: [`generation_reset`](#generation_reset), [`state`](#state)

_No parameters._

#### JavaScript

```typescript
import { ViskoOrbisDistilledModel } from "@reactor-models/visko-orbis-distilled";

const viskoOrbisDistilled = new ViskoOrbisDistilledModel();
await viskoOrbisDistilled.connect(jwt);

await viskoOrbisDistilled.reset();
```

#### React

```tsx
"use client";
import { useViskoOrbisDistilled } from "@reactor-models/visko-orbis-distilled";

function Example() {
  const { reset } = useViskoOrbisDistilled();

  return <button onClick={() => reset()}>reset</button>;
}
```

### `start`

Begin generating video on `main_video`. Requires a prompt (via [`set_prompt`](#setprompt)); a starting image is optional. Emits [`generation_started`](#generation_started) and [`state`](#state) on success, or [`command_error`](#command_error) if no prompt is set. Has no effect while already generating.

Emits: [`generation_started`](#generation_started), [`state`](#state), [`command_error`](#command_error)

_No parameters._

#### JavaScript

```typescript
import { ViskoOrbisDistilledModel } from "@reactor-models/visko-orbis-distilled";

const viskoOrbisDistilled = new ViskoOrbisDistilledModel();
await viskoOrbisDistilled.connect(jwt);

await viskoOrbisDistilled.start();
```

#### React

```tsx
"use client";
import { useViskoOrbisDistilled } from "@reactor-models/visko-orbis-distilled";

function Example() {
  const { start } = useViskoOrbisDistilled();

  return <button onClick={() => start()}>start</button>;
}
```

### `resume`

Resume generation from a previous [`pause`](#pause). Requires the session to be paused. Emits [`generation_resumed`](#generation_resumed) and [`state`](#state) on success, or [`command_error`](#command_error) if not paused.

Emits: [`generation_resumed`](#generation_resumed), [`state`](#state), [`command_error`](#command_error)

_No parameters._

#### JavaScript

```typescript
import { ViskoOrbisDistilledModel } from "@reactor-models/visko-orbis-distilled";

const viskoOrbisDistilled = new ViskoOrbisDistilledModel();
await viskoOrbisDistilled.connect(jwt);

await viskoOrbisDistilled.resume();
```

#### React

```tsx
"use client";
import { useViskoOrbisDistilled } from "@reactor-models/visko-orbis-distilled";

function Example() {
  const { resume } = useViskoOrbisDistilled();

  return <button onClick={() => resume()}>resume</button>;
}
```

### `setSeed`

Seed for the noise the first chunk is sampled from. Must be a non-negative integer; the model never draws its own seed, so the same seed with the same prompts reproduces the same video. Read once when [`start`](#start) fires — later changes take effect only after [`reset`](#reset) followed by a new [`start`](#start).

| Parameter | Type     | Required | Description                                                                                                                                                                                                                                                                                                                                            |
| --------- | -------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `seed`    | `number` |          | Seed for the noise the first chunk is sampled from. Must be a non-negative integer; the model never draws its own seed, so the same seed with the same prompts reproduces the same video. Read once when [`start`](#start) fires — later changes take effect only after [`reset`](#reset) followed by a new [`start`](#start). _(min 0, default `42`)_ |

#### JavaScript

```typescript
import { ViskoOrbisDistilledModel } from "@reactor-models/visko-orbis-distilled";

const viskoOrbisDistilled = new ViskoOrbisDistilledModel();
await viskoOrbisDistilled.connect(jwt);

await viskoOrbisDistilled.setSeed({ seed: 42 });
```

#### React

```tsx
"use client";
import { useViskoOrbisDistilled } from "@reactor-models/visko-orbis-distilled";

function Example() {
  const { setSeed } = useViskoOrbisDistilled();

  return <button onClick={() => setSeed({ seed: 42 })}>setSeed</button>;
}
```

### `setImage`

Provide a starting frame the video grows out of (image-to-video). Optional — with no image the model generates from the prompt alone. Call before [`start`](#start); the image anchors the first chunk and every later chunk inherits it through the model's own history, so a change during generation has no effect until [`reset`](#reset) and a new [`start`](#start). Emits [`image_accepted`](#image_accepted), [`conditions_ready`](#conditions_ready), and [`state`](#state) on success, or [`command_error`](#command_error) if the file is missing, is not an image, or cannot be decoded.

Emits: [`image_accepted`](#image_accepted), [`conditions_ready`](#conditions_ready), [`state`](#state), [`command_error`](#command_error)

| Parameter | Type      | Required | Description                                                                      |
| --------- | --------- | -------- | -------------------------------------------------------------------------------- |
| `image`   | `FileRef` |          | Reference to a file uploaded via the Reactor upload protocol. _(default `null`)_ |

#### JavaScript

```typescript
import { ViskoOrbisDistilledModel } from "@reactor-models/visko-orbis-distilled";

const viskoOrbisDistilled = new ViskoOrbisDistilledModel();
await viskoOrbisDistilled.connect(jwt);

const fileRef = await viskoOrbisDistilled.uploadFile(blob);
await viskoOrbisDistilled.setImage({ image: fileRef });
```

#### React

```tsx
"use client";
import { useViskoOrbisDistilled } from "@reactor-models/visko-orbis-distilled";

function Example() {
  const { setImage, uploadFile } = useViskoOrbisDistilled();

  async function handlePick(file: File) {
    const ref = await uploadFile(file);
    await setImage({ image: ref });
  }

  return <input type="file" onChange={(e) => handlePick(e.target.files![0])} />;
}
```

### `setPrompt`

Set the scene prompt. Valid at any time — call before [`start`](#start) to arm generation, or hot-swap during generation to steer the next chunk. The picture morphs into the new prompt at the next chunk boundary rather than cutting. Emits [`prompt_accepted`](#prompt_accepted), [`conditions_ready`](#conditions_ready), and [`state`](#state) on success.

Emits: [`prompt_accepted`](#prompt_accepted), [`conditions_ready`](#conditions_ready), [`state`](#state)

| Parameter | Type     | Required | Description                                                                                                                                                                                                    |
| --------- | -------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prompt`  | `string` |          | Natural-language description of the scene to generate. Replaces the previously active prompt. Applied on the next chunk when generating; otherwise takes effect when [`start`](#start) fires. _(default `""`)_ |

#### JavaScript

```typescript
import { ViskoOrbisDistilledModel } from "@reactor-models/visko-orbis-distilled";

const viskoOrbisDistilled = new ViskoOrbisDistilledModel();
await viskoOrbisDistilled.connect(jwt);

await viskoOrbisDistilled.setPrompt({ prompt: "A sunset over the ocean" });
```

#### React

```tsx
"use client";
import { useViskoOrbisDistilled } from "@reactor-models/visko-orbis-distilled";

function Example() {
  const { setPrompt } = useViskoOrbisDistilled();

  return (
    <button onClick={() => setPrompt({ prompt: "A sunset over the ocean" })}>
      setPrompt
    </button>
  );
}
```

### `setResolution`

Choose the delivery resolution for `main_video` from this deployment's offered list (`available_resolutions` in the [`state`](#state) snapshot — e.g. `1080p`, `2k`, `4k`). Session-scoped: read when [`start`](#start) fires, so the track's geometry never jumps mid-shot — call it before [`start`](#start), or any time to arm the next run. Unlike the prompt it survives [`reset`](#reset). Emits [`resolution_accepted`](#resolution_accepted) and [`state`](#state) on success, or [`command_error`](#command_error) naming the offered list when the value is not on it.

Emits: [`state`](#state), [`resolution_accepted`](#resolution_accepted), [`command_error`](#command_error)

| Parameter    | Type     | Required | Description                                                                                                                                                                                                             |
| ------------ | -------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `resolution` | `string` |          | One of the deployment's offered resolutions, exactly as listed in the [`state`](#state) snapshot's `available_resolutions` — named delivery tiers (1080p = 1920x1080, 2k = 2560x1440, 4k = 3840x2160). _(default `""`)_ |

#### JavaScript

```typescript
import { ViskoOrbisDistilledModel } from "@reactor-models/visko-orbis-distilled";

const viskoOrbisDistilled = new ViskoOrbisDistilledModel();
await viskoOrbisDistilled.connect(jwt);

await viskoOrbisDistilled.setResolution({ resolution: "" });
```

#### React

```tsx
"use client";
import { useViskoOrbisDistilled } from "@reactor-models/visko-orbis-distilled";

function Example() {
  const { setResolution } = useViskoOrbisDistilled();

  return (
    <button onClick={() => setResolution({ resolution: "" })}>
      setResolution
    </button>
  );
}
```

### `setAudioPrompt`

Set the sound description the audio is generated from. Valid at any time — call before [`start`](#start), or during generation to change the sound from the next chunk on. Pass an empty string to clear it, which switches the audio model to generating sound from the picture alone. Emits [`audio_prompt_accepted`](#audio_prompt_accepted) and [`state`](#state) on success; rejected with [`command_error`](#command_error) on a deployment that has no audio track.

Emits: [`audio_prompt_accepted`](#audio_prompt_accepted), [`state`](#state), [`command_error`](#command_error)

| Parameter | Type     | Required | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------- | -------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `prompt`  | `string` |          | What the scene should SOUND like — instruments, voices, materials, ambience. Not a description of what is on screen: sending a scene description here makes the audio worse than leaving it empty. Keep it to about one sentence; roughly the first 128 tokens are used and the rest is dropped without warning. Example: "Acoustic guitar strums a rhythmic melody, with soft finger noise on the strings and quiet room ambience." Empty clears it, and the audio is then generated from the picture alone. _(default `""`)_ |

#### JavaScript

```typescript
import { ViskoOrbisDistilledModel } from "@reactor-models/visko-orbis-distilled";

const viskoOrbisDistilled = new ViskoOrbisDistilledModel();
await viskoOrbisDistilled.connect(jwt);

await viskoOrbisDistilled.setAudioPrompt({ prompt: "A sunset over the ocean" });
```

#### React

```tsx
"use client";
import { useViskoOrbisDistilled } from "@reactor-models/visko-orbis-distilled";

function Example() {
  const { setAudioPrompt } = useViskoOrbisDistilled();

  return (
    <button
      onClick={() => setAudioPrompt({ prompt: "A sunset over the ocean" })}
    >
      setAudioPrompt
    </button>
  );
}
```

### `setAudioEnabled`

Enable or disable sound for runs started from now on. When false the audio model is skipped entirely — `main_audio` carries silence and each chunk is cheaper to produce. Session-scoped like [`set_resolution`](#setresolution): read when [`start`](#start) fires, and it survives [`reset`](#reset). Emits [`audio_enabled_accepted`](#audio_enabled_accepted) and [`state`](#state) on success; rejected with [`command_error`](#command_error) on a deployment that has no audio track. A client that never wants audio can also simply omit `main_audio` from its track mapping when connecting — that needs no command, but still spends the compute; this command is how the compute is saved.

Emits: [`audio_enabled_accepted`](#audio_enabled_accepted), [`state`](#state), [`command_error`](#command_error)

| Parameter       | Type      | Required | Description                                                                                                                                                    |
| --------------- | --------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `audio_enabled` | `boolean` |          | True to generate sound on `main_audio` (the default), false to skip the audio model and deliver silence from the next [`start`](#start) on. _(default `true`)_ |

#### JavaScript

```typescript
import { ViskoOrbisDistilledModel } from "@reactor-models/visko-orbis-distilled";

const viskoOrbisDistilled = new ViskoOrbisDistilledModel();
await viskoOrbisDistilled.connect(jwt);

await viskoOrbisDistilled.setAudioEnabled({ audio_enabled: true });
```

#### React

```tsx
"use client";
import { useViskoOrbisDistilled } from "@reactor-models/visko-orbis-distilled";

function Example() {
  const { setAudioEnabled } = useViskoOrbisDistilled();

  return (
    <button onClick={() => setAudioEnabled({ audio_enabled: true })}>
      setAudioEnabled
    </button>
  );
}
```

## Messages

Model-to-client messages. Register a typed listener with `on…` on `ViskoOrbisDistilledModel`, or a `useViskoOrbisDistilled…` hook in React, to receive only the messages you care about.

### `state`

Snapshot of the session's observable state.

Emitted on connect, after every command that mutates session state ([`set_prompt`](#setprompt),
[`set_audio_prompt`](#setaudioprompt), [`set_image`](#setimage), [`set_seed`](#setseed), [`set_resolution`](#setresolution), [`set_audio_enabled`](#setaudioenabled),
[`start`](#start), [`pause`](#pause), [`resume`](#resume), [`reset`](#reset)), and after each
[`chunk_complete`](#chunk_complete). A client can treat this as the single source of truth for driving UI
instead of tracking every individual message.

Listener: `onState` · React hook: `useViskoOrbisDistilledState`

| Field                   | Type             | Description                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `seed`                  | `number`         | Current value of the `seed` input field. The seed actually driving a running generation was captured when [`start`](#start) fired — later changes take effect only after [`reset`](#reset) and a new [`start`](#start).                                                                                                                                                                                  |
| `paused`                | `boolean`        | True while generation is paused via [`pause`](#pause).                                                                                                                                                                                                                                                                                                                                                   |
| `running`               | `boolean`        | True while the chunk loop is actively producing frames — equivalent to `started and not paused`. False both before [`start`](#start) and while paused; read `started` to tell those apart.                                                                                                                                                                                                               |
| `started`               | `boolean`        | True once [`start`](#start) has been accepted. Stays true while paused; cleared by [`reset`](#reset).                                                                                                                                                                                                                                                                                                    |
| `has_image`             | `boolean`        | True once a reference image has been set for the session.                                                                                                                                                                                                                                                                                                                                                |
| `has_prompt`            | `boolean`        | True once a prompt has been set for the session.                                                                                                                                                                                                                                                                                                                                                         |
| `resolution`            | `string`         | The delivery resolution the next [`start`](#start) will use — the client's [`set_resolution`](#setresolution) choice, or the deployment's default if it has not spoken. Like `seed`, the value driving a RUNNING generation was captured when [`start`](#start) fired.                                                                                                                                   |
| `audio_prompt`          | `string \| null` | The sound description currently conditioning the audio, or null. Null means one of two things and the distinction does not matter to a client: either no [`set_audio_prompt`](#setaudioprompt) has been sent, so this deployment's configured default is in force, or the caption was cleared and the audio is generated from the picture alone. Always null on a deployment with no `main_audio` track. |
| `audio_enabled`         | `boolean`        | Whether the next [`start`](#start) will generate sound — the client's [`set_audio_enabled`](#setaudioenabled) choice, or true if it has not spoken. Like `seed`, the value driving a RUNNING generation was captured when [`start`](#start) fired. Always false on a deployment with no `main_audio` track.                                                                                              |
| `current_chunk`         | `number`         | Zero-based index of the last completed chunk. 0 before the first chunk has completed, and back to 0 on [`reset`](#reset).                                                                                                                                                                                                                                                                                |
| `current_prompt`        | `string \| null` | The prompt currently driving generation, or null if no prompt has been set for the session.                                                                                                                                                                                                                                                                                                              |
| `available_resolutions` | `string[]`       | The delivery resolutions this deployment offers, in its configured order — the valid inputs to [`set_resolution`](#setresolution). Fixed at startup; the named tiers are upscaler-delivered (1080p = 1920x1080, 2k = 2560x1440, 4k = 3840x2160).                                                                                                                                                         |

#### JavaScript

```typescript
import { ViskoOrbisDistilledModel } from "@reactor-models/visko-orbis-distilled";

const viskoOrbisDistilled = new ViskoOrbisDistilledModel();
viskoOrbisDistilled.onState((msg) => {
  console.log(
    "state",
    msg.seed,
    msg.paused,
    msg.running,
    msg.started,
    msg.has_image,
    msg.has_prompt,
    msg.resolution,
    msg.audio_prompt,
    msg.audio_enabled,
    msg.current_chunk,
    msg.current_prompt,
    msg.available_resolutions,
  );
});
await viskoOrbisDistilled.connect(jwt);
```

#### React

```tsx
import { useViskoOrbisDistilledState } from "@reactor-models/visko-orbis-distilled";

// Inside a React component wrapped by <ViskoOrbisDistilledProvider>:
useViskoOrbisDistilledState((msg) => {
  console.log(
    "state",
    msg.seed,
    msg.paused,
    msg.running,
    msg.started,
    msg.has_image,
    msg.has_prompt,
    msg.resolution,
    msg.audio_prompt,
    msg.audio_enabled,
    msg.current_chunk,
    msg.current_prompt,
    msg.available_resolutions,
  );
});
```

### `command_error`

Emitted when a command is rejected because its preconditions are not met, or its
arguments could not be processed.

Listener: `onCommandError` · React hook: `useViskoOrbisDistilledCommandError`

| Field     | Type     | Description                                                 |
| --------- | -------- | ----------------------------------------------------------- |
| `reason`  | `string` | Human-readable explanation of why the command was rejected. |
| `command` | `string` | Name of the command that was rejected.                      |

#### JavaScript

```typescript
import { ViskoOrbisDistilledModel } from "@reactor-models/visko-orbis-distilled";

const viskoOrbisDistilled = new ViskoOrbisDistilledModel();
viskoOrbisDistilled.onCommandError((msg) => {
  console.log("command_error", msg.reason, msg.command);
});
await viskoOrbisDistilled.connect(jwt);
```

#### React

```tsx
import { useViskoOrbisDistilledCommandError } from "@reactor-models/visko-orbis-distilled";

// Inside a React component wrapped by <ViskoOrbisDistilledProvider>:
useViskoOrbisDistilledCommandError((msg) => {
  console.log("command_error", msg.reason, msg.command);
});
```

### `chunk_complete`

Emitted once per completed chunk of `main_video`.

Listener: `onChunkComplete` · React hook: `useViskoOrbisDistilledChunkComplete`

| Field            | Type             | Description                                                                                                                                                                                                                                           |
| ---------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chunk_index`    | `number`         | Zero-based index of the chunk that just completed.                                                                                                                                                                                                    |
| `active_prompt`  | `string`         | The prompt that was active while this chunk was generated.                                                                                                                                                                                            |
| `audio_samples`  | `number \| null` | Number of audio samples emitted on `main_audio` for this chunk, at 48 kHz mono, or null when this deployment has no audio track. Always equals `frames_emitted / fps * 48000` rounded, so a client can check A/V alignment without decoding anything. |
| `frames_emitted` | `number`         | Number of pixel frames emitted by this chunk.                                                                                                                                                                                                         |

#### JavaScript

```typescript
import { ViskoOrbisDistilledModel } from "@reactor-models/visko-orbis-distilled";

const viskoOrbisDistilled = new ViskoOrbisDistilledModel();
viskoOrbisDistilled.onChunkComplete((msg) => {
  console.log(
    "chunk_complete",
    msg.chunk_index,
    msg.active_prompt,
    msg.audio_samples,
    msg.frames_emitted,
  );
});
await viskoOrbisDistilled.connect(jwt);
```

#### React

```tsx
import { useViskoOrbisDistilledChunkComplete } from "@reactor-models/visko-orbis-distilled";

// Inside a React component wrapped by <ViskoOrbisDistilledProvider>:
useViskoOrbisDistilledChunkComplete((msg) => {
  console.log(
    "chunk_complete",
    msg.chunk_index,
    msg.active_prompt,
    msg.audio_samples,
    msg.frames_emitted,
  );
});
```

### `image_accepted`

Emitted after [`set_image`](#setimage) successfully decodes the uploaded file.

Listener: `onImageAccepted` · React hook: `useViskoOrbisDistilledImageAccepted`

| Field    | Type     | Description                                      |
| -------- | -------- | ------------------------------------------------ |
| `width`  | `number` | Width in pixels of the decoded reference image.  |
| `height` | `number` | Height in pixels of the decoded reference image. |

#### JavaScript

```typescript
import { ViskoOrbisDistilledModel } from "@reactor-models/visko-orbis-distilled";

const viskoOrbisDistilled = new ViskoOrbisDistilledModel();
viskoOrbisDistilled.onImageAccepted((msg) => {
  console.log("image_accepted", msg.width, msg.height);
});
await viskoOrbisDistilled.connect(jwt);
```

#### React

```tsx
import { useViskoOrbisDistilledImageAccepted } from "@reactor-models/visko-orbis-distilled";

// Inside a React component wrapped by <ViskoOrbisDistilledProvider>:
useViskoOrbisDistilledImageAccepted((msg) => {
  console.log("image_accepted", msg.width, msg.height);
});
```

### `prompt_accepted`

Emitted after [`set_prompt`](#setprompt) is accepted.

Listener: `onPromptAccepted` · React hook: `useViskoOrbisDistilledPromptAccepted`

| Field    | Type     | Description                        |
| -------- | -------- | ---------------------------------- |
| `prompt` | `string` | The prompt text that was accepted. |

#### JavaScript

```typescript
import { ViskoOrbisDistilledModel } from "@reactor-models/visko-orbis-distilled";

const viskoOrbisDistilled = new ViskoOrbisDistilledModel();
viskoOrbisDistilled.onPromptAccepted((msg) => {
  console.log("prompt_accepted", msg.prompt);
});
await viskoOrbisDistilled.connect(jwt);
```

#### React

```tsx
import { useViskoOrbisDistilledPromptAccepted } from "@reactor-models/visko-orbis-distilled";

// Inside a React component wrapped by <ViskoOrbisDistilledProvider>:
useViskoOrbisDistilledPromptAccepted((msg) => {
  console.log("prompt_accepted", msg.prompt);
});
```

### `conditions_ready`

Emitted after [`set_prompt`](#setprompt) or [`set_image`](#setimage) so the client can tell at a glance whether
[`start`](#start) will succeed.

Listener: `onConditionsReady` · React hook: `useViskoOrbisDistilledConditionsReady`

| Field        | Type      | Description                                                                                                                                   |
| ------------ | --------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `has_image`  | `boolean` | True once a reference image has been set for the session. Optional — with no image the model generates from the prompt alone (text-to-video). |
| `has_prompt` | `boolean` | True once a prompt has been set for the session.                                                                                              |

#### JavaScript

```typescript
import { ViskoOrbisDistilledModel } from "@reactor-models/visko-orbis-distilled";

const viskoOrbisDistilled = new ViskoOrbisDistilledModel();
viskoOrbisDistilled.onConditionsReady((msg) => {
  console.log("conditions_ready", msg.has_image, msg.has_prompt);
});
await viskoOrbisDistilled.connect(jwt);
```

#### React

```tsx
import { useViskoOrbisDistilledConditionsReady } from "@reactor-models/visko-orbis-distilled";

// Inside a React component wrapped by <ViskoOrbisDistilledProvider>:
useViskoOrbisDistilledConditionsReady((msg) => {
  console.log("conditions_ready", msg.has_image, msg.has_prompt);
});
```

### `generation_reset`

Emitted after [`reset`](#reset) clears session state and returns to the waiting state.

Listener: `onGenerationReset` · React hook: `useViskoOrbisDistilledGenerationReset`

| Field    | Type     | Description                                       |
| -------- | -------- | ------------------------------------------------- |
| `reason` | `string` | Short human-readable reason the reset was issued. |

#### JavaScript

```typescript
import { ViskoOrbisDistilledModel } from "@reactor-models/visko-orbis-distilled";

const viskoOrbisDistilled = new ViskoOrbisDistilledModel();
viskoOrbisDistilled.onGenerationReset((msg) => {
  console.log("generation_reset", msg.reason);
});
await viskoOrbisDistilled.connect(jwt);
```

#### React

```tsx
import { useViskoOrbisDistilledGenerationReset } from "@reactor-models/visko-orbis-distilled";

// Inside a React component wrapped by <ViskoOrbisDistilledProvider>:
useViskoOrbisDistilledGenerationReset((msg) => {
  console.log("generation_reset", msg.reason);
});
```

### `generation_paused`

Emitted in response to [`pause`](#pause), once the current chunk finishes.

Listener: `onGenerationPaused` · React hook: `useViskoOrbisDistilledGenerationPaused`

| Field         | Type     | Description                                       |
| ------------- | -------- | ------------------------------------------------- |
| `chunk_index` | `number` | Index of the last completed chunk before pausing. |

#### JavaScript

```typescript
import { ViskoOrbisDistilledModel } from "@reactor-models/visko-orbis-distilled";

const viskoOrbisDistilled = new ViskoOrbisDistilledModel();
viskoOrbisDistilled.onGenerationPaused((msg) => {
  console.log("generation_paused", msg.chunk_index);
});
await viskoOrbisDistilled.connect(jwt);
```

#### React

```tsx
import { useViskoOrbisDistilledGenerationPaused } from "@reactor-models/visko-orbis-distilled";

// Inside a React component wrapped by <ViskoOrbisDistilledProvider>:
useViskoOrbisDistilledGenerationPaused((msg) => {
  console.log("generation_paused", msg.chunk_index);
});
```

### `generation_resumed`

Emitted in response to [`resume`](#resume) when leaving the paused state.

Listener: `onGenerationResumed` · React hook: `useViskoOrbisDistilledGenerationResumed`

| Field         | Type     | Description                                        |
| ------------- | -------- | -------------------------------------------------- |
| `chunk_index` | `number` | Index of the last completed chunk before resuming. |

#### JavaScript

```typescript
import { ViskoOrbisDistilledModel } from "@reactor-models/visko-orbis-distilled";

const viskoOrbisDistilled = new ViskoOrbisDistilledModel();
viskoOrbisDistilled.onGenerationResumed((msg) => {
  console.log("generation_resumed", msg.chunk_index);
});
await viskoOrbisDistilled.connect(jwt);
```

#### React

```tsx
import { useViskoOrbisDistilledGenerationResumed } from "@reactor-models/visko-orbis-distilled";

// Inside a React component wrapped by <ViskoOrbisDistilledProvider>:
useViskoOrbisDistilledGenerationResumed((msg) => {
  console.log("generation_resumed", msg.chunk_index);
});
```

### `generation_started`

Emitted once when [`start`](#start) succeeds and frames begin streaming.

Listener: `onGenerationStarted` · React hook: `useViskoOrbisDistilledGenerationStarted`

| Field               | Type      | Description                                                                                                                                                                                                                                                                       |
| ------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fps`               | `number`  | Frame rate the video is generated at.                                                                                                                                                                                                                                             |
| `width`             | `number`  | Width in pixels of every frame this run emits on `main_video`.                                                                                                                                                                                                                    |
| `height`            | `number`  | Height in pixels of every frame this run emits on `main_video`.                                                                                                                                                                                                                   |
| `prompt`            | `string`  | The prompt active at the start of generation.                                                                                                                                                                                                                                     |
| `max_chunks`        | `number`  | Maximum number of chunks this run will produce before [`generation_complete`](#generation_complete) fires.                                                                                                                                                                        |
| `resolution`        | `string`  | The delivery resolution this run generates at — a named tier such as `1080p`, `2k`, `4k`. Fixed for the run; [`set_resolution`](#setresolution) applies from the next [`start`](#start).                                                                                          |
| `audio_enabled`     | `boolean` | Whether this run generates sound. False either because the session set `set_audio_enabled(false)` — `main_audio` then carries silence — or because this deployment has no `main_audio` track at all; read the schema to tell the two apart. Fixed for the run, like `resolution`. |
| `frames_per_chunk`  | `number`  | Number of pixel frames each chunk emits on `main_video`.                                                                                                                                                                                                                          |
| `image_conditioned` | `boolean` | True when a reference image anchors this run (image-to-video); false for text-to-video.                                                                                                                                                                                           |

#### JavaScript

```typescript
import { ViskoOrbisDistilledModel } from "@reactor-models/visko-orbis-distilled";

const viskoOrbisDistilled = new ViskoOrbisDistilledModel();
viskoOrbisDistilled.onGenerationStarted((msg) => {
  console.log(
    "generation_started",
    msg.fps,
    msg.width,
    msg.height,
    msg.prompt,
    msg.max_chunks,
    msg.resolution,
    msg.audio_enabled,
    msg.frames_per_chunk,
    msg.image_conditioned,
  );
});
await viskoOrbisDistilled.connect(jwt);
```

#### React

```tsx
import { useViskoOrbisDistilledGenerationStarted } from "@reactor-models/visko-orbis-distilled";

// Inside a React component wrapped by <ViskoOrbisDistilledProvider>:
useViskoOrbisDistilledGenerationStarted((msg) => {
  console.log(
    "generation_started",
    msg.fps,
    msg.width,
    msg.height,
    msg.prompt,
    msg.max_chunks,
    msg.resolution,
    msg.audio_enabled,
    msg.frames_per_chunk,
    msg.image_conditioned,
  );
});
```

### `generation_complete`

Emitted when the run reaches `max_chunks`.

The session returns to the waiting state rather than rolling straight into another run —
a new run begins at chunk 0, which is a hard visual cut, and issuing one unasked would be
a surprise. Call [`start`](#start) again to continue, or [`reset`](#reset) to clear the conditions first.

Listener: `onGenerationComplete` · React hook: `useViskoOrbisDistilledGenerationComplete`

| Field          | Type     | Description                                 |
| -------------- | -------- | ------------------------------------------- |
| `total_chunks` | `number` | Total number of chunks produced by the run. |

#### JavaScript

```typescript
import { ViskoOrbisDistilledModel } from "@reactor-models/visko-orbis-distilled";

const viskoOrbisDistilled = new ViskoOrbisDistilledModel();
viskoOrbisDistilled.onGenerationComplete((msg) => {
  console.log("generation_complete", msg.total_chunks);
});
await viskoOrbisDistilled.connect(jwt);
```

#### React

```tsx
import { useViskoOrbisDistilledGenerationComplete } from "@reactor-models/visko-orbis-distilled";

// Inside a React component wrapped by <ViskoOrbisDistilledProvider>:
useViskoOrbisDistilledGenerationComplete((msg) => {
  console.log("generation_complete", msg.total_chunks);
});
```

### `resolution_accepted`

Emitted after [`set_resolution`](#setresolution) is accepted.

Listener: `onResolutionAccepted` · React hook: `useViskoOrbisDistilledResolutionAccepted`

| Field        | Type     | Description                                                                                                                                          |
| ------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `width`      | `number` | Width in pixels `main_video` will deliver at once a run starts with this tier — so a client can size its canvas without a name-to-size lookup table. |
| `height`     | `number` | Height in pixels `main_video` will deliver at once a run starts with this tier.                                                                      |
| `resolution` | `string` | The delivery resolution that was accepted. Applies from the next [`start`](#start) — a running generation keeps the resolution it started with.      |

#### JavaScript

```typescript
import { ViskoOrbisDistilledModel } from "@reactor-models/visko-orbis-distilled";

const viskoOrbisDistilled = new ViskoOrbisDistilledModel();
viskoOrbisDistilled.onResolutionAccepted((msg) => {
  console.log("resolution_accepted", msg.width, msg.height, msg.resolution);
});
await viskoOrbisDistilled.connect(jwt);
```

#### React

```tsx
import { useViskoOrbisDistilledResolutionAccepted } from "@reactor-models/visko-orbis-distilled";

// Inside a React component wrapped by <ViskoOrbisDistilledProvider>:
useViskoOrbisDistilledResolutionAccepted((msg) => {
  console.log("resolution_accepted", msg.width, msg.height, msg.resolution);
});
```

### `audio_prompt_accepted`

Emitted after [`set_audio_prompt`](#setaudioprompt) is accepted.

Listener: `onAudioPromptAccepted` · React hook: `useViskoOrbisDistilledAudioPromptAccepted`

| Field          | Type             | Description                                                                                                                                                      |
| -------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `audio_prompt` | `string \| null` | The sound description that was accepted, or null if it was cleared — which puts the audio model in its video-only mode, generating sound from the picture alone. |

#### JavaScript

```typescript
import { ViskoOrbisDistilledModel } from "@reactor-models/visko-orbis-distilled";

const viskoOrbisDistilled = new ViskoOrbisDistilledModel();
viskoOrbisDistilled.onAudioPromptAccepted((msg) => {
  console.log("audio_prompt_accepted", msg.audio_prompt);
});
await viskoOrbisDistilled.connect(jwt);
```

#### React

```tsx
import { useViskoOrbisDistilledAudioPromptAccepted } from "@reactor-models/visko-orbis-distilled";

// Inside a React component wrapped by <ViskoOrbisDistilledProvider>:
useViskoOrbisDistilledAudioPromptAccepted((msg) => {
  console.log("audio_prompt_accepted", msg.audio_prompt);
});
```

### `audio_enabled_accepted`

Emitted after [`set_audio_enabled`](#setaudioenabled) is accepted.

Listener: `onAudioEnabledAccepted` · React hook: `useViskoOrbisDistilledAudioEnabledAccepted`

| Field           | Type      | Description                                                                                                                                                                                                                |
| --------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `audio_enabled` | `boolean` | The value that was accepted. False means runs started from now on skip the audio model and `main_audio` carries silence; applies from the next [`start`](#start) — a running generation keeps the setting it started with. |

#### JavaScript

```typescript
import { ViskoOrbisDistilledModel } from "@reactor-models/visko-orbis-distilled";

const viskoOrbisDistilled = new ViskoOrbisDistilledModel();
viskoOrbisDistilled.onAudioEnabledAccepted((msg) => {
  console.log("audio_enabled_accepted", msg.audio_enabled);
});
await viskoOrbisDistilled.connect(jwt);
```

#### React

```tsx
import { useViskoOrbisDistilledAudioEnabledAccepted } from "@reactor-models/visko-orbis-distilled";

// Inside a React component wrapped by <ViskoOrbisDistilledProvider>:
useViskoOrbisDistilledAudioEnabledAccepted((msg) => {
  console.log("audio_enabled_accepted", msg.audio_enabled);
});
```

## Tracks

Named media channels between your app and the ViskoOrbisDistilled model. Use the typed helpers below — `ViskoOrbisDistilledModel.publish<Track>` / `on<Track>` in plain JS, and `useViskoOrbisDistilledTrack` or the per-track `<ViskoOrbisDistilled<Track>View>` components in React — so track names are checked at compile time.

### `main_video`

A video channel you subscribe to — the model publishes this for your app to render.

#### JavaScript

```typescript
import { ViskoOrbisDistilledModel } from "@reactor-models/visko-orbis-distilled";

const viskoOrbisDistilled = new ViskoOrbisDistilledModel();
viskoOrbisDistilled.onMainVideo((track, stream) => {
  // attach to a <video> element, pipe to a canvas, etc.
  videoEl.srcObject = stream;
});
await viskoOrbisDistilled.connect(jwt);
```

#### React

```tsx
"use client";
import { ViskoOrbisDistilledMainVideoView } from "@reactor-models/visko-orbis-distilled";

// Inside a component wrapped by <ViskoOrbisDistilledProvider>:
export function Example() {
  return <ViskoOrbisDistilledMainVideoView className="w-full aspect-video" />;
}
```

### `main_audio`

A audio channel you subscribe to — the model publishes this for your app to render.

#### JavaScript

```typescript
import { ViskoOrbisDistilledModel } from "@reactor-models/visko-orbis-distilled";

const viskoOrbisDistilled = new ViskoOrbisDistilledModel();
viskoOrbisDistilled.onMainAudio((track, stream) => {
  // attach to a <audio> element, pipe to a canvas, etc.
  videoEl.srcObject = stream;
});
await viskoOrbisDistilled.connect(jwt);
```

#### React

```tsx
"use client";
import { useViskoOrbisDistilledTrack } from "@reactor-models/visko-orbis-distilled";

// Inside a component wrapped by <ViskoOrbisDistilledProvider>:
export function Example() {
  const track = useViskoOrbisDistilledTrack("main_audio");
  // attach `track` to an <audio> element via a ref + srcObject.
  return null;
}
```
