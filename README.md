# Reactor JS SDK

[![npm version](https://img.shields.io/npm/v/@reactor-team/js-sdk)](https://www.npmjs.com/package/@reactor-team/js-sdk)
[![npm downloads](https://img.shields.io/npm/dm/@reactor-team/js-sdk)](https://www.npmjs.com/package/@reactor-team/js-sdk)
[![build](https://img.shields.io/github/actions/workflow/status/reactor-team/js-sdk/ci.yml?branch=main)](https://github.com/reactor-team/js-sdk/actions)
[![license](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

The official JavaScript SDK for building real-time AI video applications with [Reactor](https://reactor.inc).

## Installation

```bash
npm install @reactor-team/js-sdk
```

## Quick Start

```bash
npx create-reactor-app my-app
cd my-app
npm run dev
```

## Usage

```tsx
import { ReactorProvider, ReactorView, useReactor } from "@reactor-team/js-sdk";

function App() {
  return (
    <ReactorProvider modelName="your-model" jwtToken={token}>
      <ReactorView className="w-full aspect-video" />
      <Controls />
    </ReactorProvider>
  );
}
```

## Examples

| Example                                       | Description                                                                 |
| --------------------------------------------- | --------------------------------------------------------------------------- |
| [livecore](./examples/livecore)               | Minimal demo for real-time video generation with the Livecore model         |
| [film-director](./examples/film-director)     | Timeline-based editor for directing Livecore video generation frame by frame |
| [dynamic](./examples/dynamic)                 | Local-only dynamic UI that auto-generates controls from a model's JSON schema |

## Documentation

- [Getting Started](https://docs.reactor.inc)

## License

[MIT](./LICENSE)
