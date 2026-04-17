# @reactor-models/{{MODEL_NAME}}

> Typed JavaScript + React SDK for the **{{MODEL_PREFIX}}** model on [Reactor](https://reactor.inc). Version **{{MODEL_VERSION}}**.

---

## Install

```shell
npm install @reactor-models/{{MODEL_NAME}}
```

```shell
pnpm add @reactor-models/{{MODEL_NAME}}
```

The package exports a plain-JavaScript client and a set of React bindings. Import whichever you need from `@reactor-models/{{MODEL_NAME}}`:

```typescript
import { {{MODEL_PREFIX}}Model } from "@reactor-models/{{MODEL_NAME}}";
```

```typescript
import { {{MODEL_PREFIX}}Provider, use{{MODEL_PREFIX}} } from "@reactor-models/{{MODEL_NAME}}";
```

React 18 or later is required when using the provider and hooks.

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
import { useEffect, useState } from "react";
import { {{MODEL_PREFIX}}Provider } from "@reactor-models/{{MODEL_NAME}}";
import { ReactorView } from "@reactor-team/js-sdk";

export default function App() {
  const [jwt, setJwt] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/reactor/token", { method: "POST" })
      .then((r) => r.json())
      .then((d) => setJwt(d.jwt));
  }, []);

  if (!jwt) return null;

  return (
    <{{MODEL_PREFIX}}Provider jwtToken={jwt} connectOptions={{ autoConnect: true }}>
      <ReactorView className="w-full aspect-video" />
    </{{MODEL_PREFIX}}Provider>
  );
}
```

---

## Connect

### JavaScript

```typescript
import { {{MODEL_PREFIX}}Model } from "@reactor-models/{{MODEL_NAME}}";

const {{MODEL_NAME}} = new {{MODEL_PREFIX}}Model();
await {{MODEL_NAME}}.connect(jwt);
```

### React

The provider takes the JWT as a prop; fetch it from the same `/api/reactor/token` route the Authenticate example mints.

```tsx
"use client";
import { useEffect, useState } from "react";
import { {{MODEL_PREFIX}}Provider, use{{MODEL_PREFIX}} } from "@reactor-models/{{MODEL_NAME}}";

function Controller() {
  const { status } = use{{MODEL_PREFIX}}();
  return <span>Status: {status}</span>;
}

export default function App() {
  const [jwt, setJwt] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/reactor/token", { method: "POST" })
      .then((r) => r.json())
      .then((d) => setJwt(d.jwt));
  }, []);

  if (!jwt) return null;

  return (
    <{{MODEL_PREFIX}}Provider jwtToken={jwt}>
      <Controller />
    </{{MODEL_PREFIX}}Provider>
  );
}
```

---
