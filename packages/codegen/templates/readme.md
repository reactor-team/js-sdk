# @reactor-models/{{MODEL_NAME}}

> Typed JavaScript + React SDK for the **{{MODEL_PREFIX}}** model on [Reactor](https://reactor.inc). Version **{{MODEL_VERSION}}**.

---

## Get started

Scaffold a starter app for **{{MODEL_PREFIX}}** with [`create-reactor-app`](https://www.npmjs.com/package/create-reactor-app):

```shell
npx create-reactor-app my-app --model={{MODEL_NAME}}
```

```shell
pnpm dlx create-reactor-app my-app --model={{MODEL_NAME}}
```

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
import { {{MODEL_PREFIX}}Provider } from "@reactor-models/{{MODEL_NAME}}";
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
    <{{MODEL_PREFIX}}Provider jwtToken={token} connectOptions={{ autoConnect: true }}>
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

The provider takes the JWT as a prop; fetch it from the same `/api/reactor/token` route the Authenticate example mints:

```tsx
"use client";

import { use } from "react";
import { {{MODEL_PREFIX}}Provider, use{{MODEL_PREFIX}} } from "@reactor-models/{{MODEL_NAME}}";

async function getToken() {
  const r = await fetch("/api/reactor/token", { method: "POST" });
  const { jwt } = await r.json();
  return jwt;
}

const tokenPromise = getToken();

function Controller() {
  const { status } = use{{MODEL_PREFIX}}();
  return <span>Status: {status}</span>;
}

export default function App() {
  const token = use(tokenPromise);
  return (
    <{{MODEL_PREFIX}}Provider jwtToken={token}>
      <Controller />
    </{{MODEL_PREFIX}}Provider>
  );
}
```

---
