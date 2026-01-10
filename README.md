# Reactor JS SDK

[![client](https://img.shields.io/npm/v/@reactor-team/js-sdk?label=client&color=blue)](https://www.npmjs.com/package/@reactor-team/js-sdk)
[![create-app](https://img.shields.io/npm/v/create-reactor-app?label=create-app&color=blue)](https://www.npmjs.com/package/create-reactor-app)
[![build](https://img.shields.io/github/actions/workflow/status/reactor-team/js-sdk/ci.yml?label=build)](https://github.com/reactor-team/js-sdk/actions)
[![license](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

The official JavaScript/TypeScript SDK for building real-time AI video applications with [Reactor](https://reactor.inc).

## Installation

```bash
npm install @reactor-team/js-sdk
# or
pnpm add @reactor-team/js-sdk
```

## Quick Start

### Create a New App

The fastest way to get started is with our CLI:

```bash
npx create-reactor-app my-app
# or
pnpm dlx create-reactor-app my-app
```

### Manual Setup

```tsx
import { ReactorProvider, ReactorView } from "@reactor-team/js-sdk";

function App() {
  return (
    <ReactorProvider modelName="your-model" jwtToken={token}>
      <ReactorView className="w-full aspect-video" />
    </ReactorProvider>
  );
}
```

### Using Hooks

```tsx
import { useReactor, useReactorMessage } from "@reactor-team/js-sdk";

function Controls() {
  const { status, sendCommand } = useReactor((state) => ({
    status: state.status,
    sendCommand: state.sendCommand,
  }));

  useReactorMessage((message) => {
    console.log("Received:", message);
  });

  return (
    <button
      onClick={() => sendCommand("start", {})}
      disabled={status !== "ready"}
    >
      Start
    </button>
  );
}
```

## Examples

This repository includes working examples:

| Example                                               | Description                                    | Demo                                                        |
| ----------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------- |
| [longlive](./examples/longlive)                       | Real-time text-to-video generation             | [Live Demo](https://js-sdk-example-longlive.vercel.app/)    |
| [matrix-2](./examples/matrix-2)                       | Interactive world model with keyboard controls | [Live Demo](https://js-sdk-example-matrix-2.vercel.app/)    |
| [stream-diffusion-v2](./examples/stream-diffusion-v2) | Real-time webcam-to-video transformation       | [Live Demo](https://js-sdk-stream-diffusion-v2.vercel.app/) |

To run an example locally:

```bash
cd examples/longlive
pnpm install
cp .env.example .env.local
# Add your API key to .env.local
pnpm dev
```

## Repository Structure

```
js-sdk/
├── libs/
│   ├── client/       # @reactor-team/js-sdk - Core SDK
│   └── create-app/   # create-reactor-app CLI
└── examples/         # Example applications
```

## Development

```bash
# Install dependencies
pnpm install

# Build the SDK
pnpm build

# Run an example
pnpm dev:longlive
```

## Documentation

- [Reactor Website](https://reactor.inc)
- [Getting Started Guide](https://docs.reactor.inc)
- [SDK Documentation](https://docs.reactor.inc/api-reference/overview)

## Support

For questions or issues, contact us at [team@reactor.inc](mailto:team@reactor.inc).

## License

ISC
