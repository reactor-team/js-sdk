# @reactor-team/js-sdk

The official JavaScript/TypeScript SDK for [Reactor](https://reactor.inc), the developer platform for real-time world models.

In a few lines of code you can connect a browser or Node app to a Reactor session over WebRTC, render live model video at 30–60 FPS, send typed commands to steer what generates, and receive structured messages back. The SDK ships a React API (`ReactorProvider`, `ReactorView`, `useReactor`, …) for browser apps, and an imperative `Reactor` class for everything else.

Full reference and guides live at **[docs.reactor.inc](https://docs.reactor.inc)**.

---

## Quickstart

The fastest path is `create-reactor-app`, which scaffolds a Next.js app with auth wired up:

```bash
pnpm create reactor-app my-app
cd my-app && pnpm install && pnpm dev
```

Or wire it up by hand. Exchange your API key on the server for a short-lived JWT **scoped to your model**, then mount `<ReactorProvider>` in the client. The `authorization_details` block is what downscopes the token: it can create a bounded number of sessions for that one model and act only on the sessions it created — a leaked token exposes nothing else on the account:

```ts
// app/api/token/route.ts
import { NextResponse } from "next/server";

export async function POST() {
  const r = await fetch("https://api.reactor.inc/tokens", {
    method: "POST",
    headers: {
      "Reactor-API-Key": process.env.REACTOR_API_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      authorization_details: [
        {
          type: "session",
          resources: { models: { match: ["your-org/your-model-name"] } },
          constraints: { max_sessions: 10 },
        },
      ],
    }),
  });
  const { jwt } = await r.json();
  return NextResponse.json({ jwt });
}
```

```tsx
// app/page.tsx
"use client";
import { use } from "react";
import { ReactorProvider, ReactorView } from "@reactor-team/js-sdk";

const tokenPromise = fetch("/api/token", { method: "POST" })
  .then((r) => r.json())
  .then(({ jwt }) => jwt);

export default function App() {
  const token = use(tokenPromise);
  return (
    <ReactorProvider
      modelName="your-model-name"
      jwtToken={token}
      connectOptions={{ autoConnect: true }}
    >
      <ReactorView className="w-full aspect-video" />
    </ReactorProvider>
  );
}
```

See the [Quickstart](https://docs.reactor.inc/quickstart) and [Authentication](https://docs.reactor.inc/authentication) docs for the full walkthrough, including production auth patterns.

---

## React API

`<ReactorProvider>` owns the connection. Components, hooks, and the recording surfaces all read state and methods from its context. Don't call `connect()` unless `autoConnect` is `false`; the provider can manage it for you.

### Display video

`<ReactorView>` binds to the model's `main_video` track and manages the underlying `<video>` element. Most models expose a single video output and you can drop it in unchanged:

```tsx
<ReactorView className="w-full aspect-video" videoObjectFit="cover" />
```

To play model audio alongside the video, set `audioTrack` to the track name declared by the model. To attach the stream to your own `<video>` element instead, read `tracks[name]` from `useReactor()`.

### Send commands

Commands are the model's typed RPC surface (`set_prompt`, `set_image`, and any custom events declared in the model schema). The full catalog is in the [Model API Reference](https://docs.reactor.inc/model-api-reference/overview).

```tsx
import { useReactor } from "@reactor-team/js-sdk";

function PromptInput() {
  const { status, sendCommand } = useReactor((s) => ({
    status: s.status,
    sendCommand: s.sendCommand,
  }));

  return (
    <button
      disabled={status !== "ready"}
      onClick={() => sendCommand("set_prompt", { prompt: "a forest at dawn" })}
    >
      Set prompt
    </button>
  );
}
```

### Publish webcam input

For video-to-video models, drop `<WebcamStream>` inside the provider and name the track the model expects. The component handles `getUserMedia`, lifecycle, and cleanup:

```tsx
<ReactorProvider modelName="your-model-name" jwtToken={token}>
  <ReactorView className="w-full aspect-video" />
  <WebcamStream track="webcam" className="w-48 aspect-video" />
</ReactorProvider>
```

### Receive messages

Models emit structured messages back to your app, such as progress updates, state snapshots, or custom model events. Subscribe with `useReactorMessage`. Select store fields one at a time so a component only re-renders when something it actually uses changes — passing `(s) => s` will rerender on every track frame, status flip, and error:

```tsx
import { useReactorMessage } from "@reactor-team/js-sdk";

function FrameCounter() {
  const [frame, setFrame] = useState(0);
  useReactorMessage((msg) => {
    if (msg.type === "state") setFrame(msg.data.current_frame);
  });
  return <div>Frame: {frame}</div>;
}
```

### Error handling

`useReactor((s) => s.lastError)` exposes the most recent `ReactorError`. Recoverable errors can be retried via `s.reconnect()`. Full code catalog: [`ReactorError`](https://docs.reactor.inc/api-reference/types#reactorerror).

### Upload files

Bind an `<input type="file">` to the model with `uploadFile` and then pass the returned [`FileRef`](https://docs.reactor.inc/api-reference/types#fileref) into any command:

```tsx
const { uploadFile, sendCommand } = useReactor((s) => ({
  uploadFile: s.uploadFile,
  sendCommand: s.sendCommand,
}));

const ref = await uploadFile(file);
await sendCommand("set_image", { image: ref });
```

---

## Imperative API

For non-React apps such as Electron shells, game engines, or Node scripts, use the `Reactor` class directly. It exposes the same surface as the React store, without the React glue:

```ts
import { Reactor } from "@reactor-team/js-sdk";

const reactor = new Reactor({
  apiUrl: "https://api.reactor.inc",
  modelName: "your-model-name",
});

reactor.on("statusChanged", (status) => console.log("status:", status));
reactor.on("message", (msg) => console.log("model:", msg));
reactor.on("trackReceived", (name, _track, stream) => {
  if (name === "main_video") videoEl.srcObject = stream;
});

await reactor.connect(await fetchJwt());

await reactor.sendCommand("set_prompt", { prompt: "a forest at dawn" });
```

---

## Recording

Sessions are recorded as they stream. Ask the runtime for the last `N` seconds with `requestClip`, or the full session so far with `requestRecording`. Both resolve to a `Clip` value that you can pass to `<ClipPlayer>` for preview, or to `<ClipDownloadButton>` to save as MP4.

```tsx
import { ClipPlayer, ClipDownloadButton } from "@reactor-team/js-sdk";
import type { Clip } from "@reactor-team/js-sdk";

function ClipModal({ clip, jwt }: { clip: Clip; jwt: string }) {
  return (
    <>
      <ClipPlayer clip={clip} getJwt={() => jwt} />
      <ClipDownloadButton clip={clip} getJwt={() => jwt} />
    </>
  );
}
```

Capture a clip from anywhere inside the provider:

```tsx
const reactor = useReactor((s) => s.internal.reactor);
const clip = await reactor.requestClip(10); // last 10 s
```

`<ClipPlayer>` uses native HLS on Safari/iOS; install `hls.js` to support Chrome, Firefox, and Edge:

```bash
pnpm add hls.js
```

Downloads are remuxed into a flat MP4 (`start_time=0`, faststart, `major_brand=isom`) under the hood so the resulting file uploads cleanly to Twitter, Instagram, TikTok, and YouTube without any extra setup on your side — the H.264 / AAC bitstream itself is passed through untouched.

Full walkthrough, error codes, and the headless `useClipDownload` hook: [Recordings](https://docs.reactor.inc/concepts/recordings).

---

## Typed model SDKs

For models with a published typed SDK, prefer [`@reactor-models/<name>`](https://www.npmjs.com/org/reactor-models). It re-exports everything here and adds typed commands, messages, and hooks for one specific model. Use this base SDK when the model doesn't have a typed package yet, or when you want to stay model-agnostic.

---

## API surface

| Surface                                                                                                                          | Where it lives                                                              |
| -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `Reactor`                                                                                                                        | [Reactor class](https://docs.reactor.inc/api-reference/reactor-class)       |
| `<ReactorProvider>`, `<ReactorView>`, `<WebcamStream>`                                                                           | [React components](https://docs.reactor.inc/api-reference/react-components) |
| `useReactor`, `useReactorMessage`, `useStats`                                                                                    | [React hooks](https://docs.reactor.inc/api-reference/react-hooks)           |
| `<ClipPlayer>`, `<ClipDownloadButton>`, `useClipDownload`, `RecordingClient`, `RecordingError`, `fetchPlaylist`, `parsePlaylist` | [Recordings](https://docs.reactor.inc/concepts/recordings)                  |

---

## License

[Apache 2.0](https://github.com/reactor-team/js-sdk/blob/main/LICENSE) © 2024-2026 Reactor Technologies, Inc.
