# @reactor-team/js-sdk

The official JavaScript/TypeScript SDK for [Reactor](https://reactor.inc) — the developer platform for building real-time, interactive AI video applications.

Use it to connect your frontend to a Reactor session over WebRTC, stream video (and optional audio) to and from a real-time model, send typed control events, and record clips of the live stream.

Full reference and guides live at **[docs.reactor.inc](https://docs.reactor.inc)**.

---

## Install

```bash
pnpm add @reactor-team/js-sdk
```

`react` and `zustand` are peer dependencies. `hls.js` is an optional peer dependency, used only by the `<ClipPlayer />` component on browsers without native HLS support (Chrome, Firefox, Edge):

```bash
pnpm add hls.js
```

Safari and iOS play HLS natively and do not need it.

---

## Quickstart

The fastest path is `create-reactor-app`, which scaffolds a Next.js app with auth wired up:

```bash
pnpm create reactor-app my-app
cd my-app && pnpm install && pnpm dev
```

To wire it up by hand, exchange your API key for a JWT in a server route, then mount `<ReactorProvider>` in the client:

```ts
// app/api/token/route.ts
import { NextResponse } from "next/server";

export async function POST() {
  const r = await fetch("https://api.reactor.inc/tokens", {
    method: "POST",
    headers: { "Reactor-API-Key": process.env.REACTOR_API_KEY! },
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

async function getToken() {
  const r = await fetch("/api/token", { method: "POST" });
  const { jwt } = await r.json();
  return jwt;
}

const tokenPromise = getToken();

export default function App() {
  const token = use(tokenPromise);
  return (
    <ReactorProvider modelName="your-model-name" jwtToken={token}>
      <ReactorView className="w-full aspect-video" />
    </ReactorProvider>
  );
}
```

See the [Quickstart](https://docs.reactor.inc/quickstart) and [Authentication](https://docs.reactor.inc/authentication) docs for the full walkthrough, including production auth patterns.

---

## Vanilla TypeScript

For non-React apps — Electron shells, game engines, custom frameworks — use the `Reactor` class directly:

```ts
import { Reactor } from "@reactor-team/js-sdk";

const reactor = new Reactor({
  apiUrl: "https://api.reactor.inc",
  modelName: "your-model-name",
  jwtToken: await fetchJwt(),
});

reactor.on("statusChange", (status) => console.log("status:", status));
reactor.on("message", (msg) => console.log("model:", msg));

await reactor.connect();

const stream = reactor.getMediaStream("main_video");
videoEl.srcObject = stream;
```

---

## Recording

Snap the last N seconds or capture the full session, then play it back and offer a download:

```tsx
import {
  ClipPlayer,
  ClipDownloadButton,
  useReactor,
} from "@reactor-team/js-sdk";
import type { Clip } from "@reactor-team/js-sdk";

function Snap({ jwt }: { jwt: string }) {
  const { reactor } = useReactor((s) => ({ reactor: s.internal.reactor }));
  const [clip, setClip] = useState<Clip | null>(null);

  return clip ? (
    <>
      <ClipPlayer clip={clip} getJwt={() => jwt} />
      <ClipDownloadButton clip={clip} getJwt={() => jwt} />
    </>
  ) : (
    <button onClick={async () => setClip(await reactor.requestClip(10))}>
      Save last 10s
    </button>
  );
}
```

Full walkthrough: [Recordings](https://docs.reactor.inc/concepts/recordings).

---

## API at a glance

| Surface                                                                                                                  | Import                 |
| ------------------------------------------------------------------------------------------------------------------------ | ---------------------- |
| `Reactor` — imperative class                                                                                             | `@reactor-team/js-sdk` |
| `<ReactorProvider>`, `<ReactorView>`, `<ReactorController>`, `<WebcamStream>`                                            | React components       |
| `useReactor`, `useReactorMessage`, `useReactorInternalMessage`, `useStats`                                               | React hooks            |
| `<ClipPlayer>`, `<ClipDownloadButton>`, `useClipDownload`                                                                | Recording UI           |
| `RecordingClient`, `RecordingError`, `fetchPlaylist`, `parsePlaylist`, `downloadClipAsFile`, `createPlayableManifestUrl` | Recording primitives   |

Full prop tables, event signatures, and error codes are documented at [docs.reactor.inc](https://docs.reactor.inc).

For models with a published typed SDK, prefer [`@reactor-models/<name>`](https://www.npmjs.com/org/reactor-models) — it re-exports everything here and adds typed events, messages, and hooks for one specific model.

---

## Local development

```bash
pnpm install
pnpm build      # tsup → dist/index.{js,mjs,d.ts}
pnpm test       # vitest, full suite
pnpm dev        # tsup --watch
```

Tests run against a real Node WebRTC stack via `@roamhq/wrtc`; the integration suite spins up an in-process Coordinator stub. No external services required.

---

## License

MIT. © Reactor Technologies, Inc.
