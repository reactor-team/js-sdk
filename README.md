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

| Example | Description |
|---------|-------------|
| [longlive](./examples/longlive) | Text-to-video generation |
| [matrix-2](./examples/matrix-2) | Interactive world model |
| [stream-diffusion-v2](./examples/stream-diffusion-v2) | Webcam-to-video transformation |

## Documentation

- [Getting Started](https://docs.reactor.inc)
- [API Reference](https://docs.reactor.inc/api-reference/overview)

## License

[MIT](./LICENSE)
