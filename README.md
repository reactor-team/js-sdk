# [Deprecated] Reactor JS SDK

[![npm version](https://img.shields.io/npm/v/@reactor-team/js-sdk)](https://www.npmjs.com/package/@reactor-team/js-sdk)
[![npm downloads](https://img.shields.io/npm/dm/@reactor-team/js-sdk)](https://www.npmjs.com/package/@reactor-team/js-sdk)
[![build](https://img.shields.io/github/actions/workflow/status/reactor-team/js-sdk/ci.yml?branch=main)](https://github.com/reactor-team/js-sdk/actions)
[![license](https://img.shields.io/badge/license-Apache_2.0-blue)](./LICENSE)

> **⚠️ This repository is deprecated.** With the release of `@reactor-team/js-sdk@3.0.0`, the JS SDK has moved into our [`reactor-client-sdks`](https://github.com/reactor-team/reactor-client-sdks) monorepo, alongside our other language SDKs. All new development happens at:
>
> ### 👉 [reactor-team/reactor-client-sdks/sdks/js](https://github.com/reactor-team/reactor-client-sdks/tree/main/sdks/js)
>
> The npm package name is unchanged (`@reactor-team/js-sdk`), so `npm install @reactor-team/js-sdk` continues to work — it now installs from the new source. This repository is kept for historical reference only and receives no further updates. Please file new issues in the [`reactor-client-sdks`](https://github.com/reactor-team/reactor-client-sdks/issues) repo instead.

The official JavaScript SDK for building real-time AI video applications with [Reactor](https://reactor.inc).

## Installation

```bash
npm install @reactor-team/js-sdk
```

## Quick Start

```bash
npx create-reactor-app my-app --model=helios
cd my-app
npm run dev
```

## Usage

```tsx
"use client";

import { use } from "react";
import { ReactorProvider, ReactorView } from "@reactor-team/js-sdk";

const tokenPromise = fetch("/api/token")
  .then((r) => r.json())
  .then(({ token }) => token);

export default function App() {
  const token = use(tokenPromise);

  return (
    <ReactorProvider modelName="your-model-name" jwtToken={token}>
      <ReactorView className="w-full aspect-video" />
    </ReactorProvider>
  );
}
```

## Documentation

- [Getting Started](https://docs.reactor.inc)

## License

[Apache 2.0](./LICENSE) © 2024-2026 Reactor Technologies, Inc.

See [NOTICE](./NOTICE) for attribution requirements and
[CONTRIBUTING.md](./CONTRIBUTING.md) for the contributor sign-off (DCO) policy.
