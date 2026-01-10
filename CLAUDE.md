# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Package Manager

Always use `pnpm` as the package manager. Use `pnpm dlx` instead of `npx` for running packages.

## Repository Overview

This is the **official Reactor JS SDK monorepo** containing the SDK source code, CLI tools, and example applications.

### Structure

```
js-sdk/
├── libs/
│   ├── client/           # @reactor-team/js-sdk - Core SDK
│   │   ├── src/
│   │   │   ├── core/     # Reactor class, clients, store
│   │   │   ├── react/    # ReactorProvider, hooks, components
│   │   │   ├── utils/    # WebRTC helpers, token utilities
│   │   │   └── generated/# Protobuf types (from reactor-proto)
│   │   └── scripts/      # Proto fetching script
│   └── create-app/       # create-reactor-app CLI
│       └── bin/          # CLI entry point
├── examples/             # Example Next.js applications
│   ├── longlive/         # Text-to-video generation
│   ├── matrix-2/         # Interactive world model
│   └── stream-diffusion-v2/  # Webcam transformation
├── package.json          # Root workspace config
└── pnpm-workspace.yaml   # Workspace definition
```

## Common Commands

### Root Level

```bash
# Install all workspace dependencies
pnpm install

# Build the SDK
pnpm build

# Run examples
pnpm dev:longlive
pnpm dev:matrix-2
pnpm dev:stream-diffusion-v2

# Format code
pnpm format
```

### SDK Development (libs/client)

```bash
cd libs/client

pnpm build          # Build SDK (CJS, ESM, types)
pnpm dev            # Watch mode
pnpm proto          # Fetch protobuf types (requires GH_TOKEN)
pnpm clean          # Remove generated files
```

### Create App CLI (libs/create-app)

```bash
cd libs/create-app

pnpm build          # Build CLI
```

### Examples

```bash
cd examples/longlive  # or matrix-2, stream-diffusion-v2

pnpm install
pnpm dev            # Start dev server (port 3000)
pnpm build          # Production build
```

## SDK Architecture

### Core Modules (libs/client/src/core/)

| File | Purpose |
|------|---------|
| `Reactor.ts` | Main class with event-emitter API for connection lifecycle |
| `CoordinatorClient.ts` | HTTP client for session creation and SDP polling |
| `GPUMachineClient.ts` | WebRTC peer connection for video/data streaming |
| `store.ts` | Zustand store factory bridging events to React state |
| `types.ts` | Zod schemas for API request/response validation |

### React Components (libs/client/src/react/)

| Component | Purpose |
|-----------|---------|
| `ReactorProvider` | Context provider managing connection lifecycle |
| `ReactorView` | Video element displaying GPU machine output |
| `WebcamStream` | Webcam capture and publishing to model |
| `ReactorController` | Dynamic command UI from model schema |
| `hooks.ts` | `useReactor`, `useReactorMessage` hooks |

### Connection Flow

```
"disconnected" → "connecting" → "waiting" (queued) → "ready"
```

1. **connecting**: POST to coordinator `/sessions`, create WebRTC offer
2. **waiting**: Poll for SDP answer, queue position updates
3. **ready**: WebRTC connected, can send commands and receive video

## SDK Usage Patterns

### Provider Setup

```tsx
import { ReactorProvider, ReactorView } from "@reactor-team/js-sdk";

<ReactorProvider
  modelName="model-name"
  jwtToken={token}
  coordinatorUrl="https://coordinator.reactor.inc"  // optional
>
  <ReactorView className="w-full aspect-video" />
</ReactorProvider>
```

### Hook Usage

```tsx
import { useReactor, useReactorMessage } from "@reactor-team/js-sdk";

const { status, sendCommand } = useReactor((state) => ({
  status: state.status,
  sendCommand: state.sendCommand,
}));

useReactorMessage((message) => {
  console.log("Received:", message);
});
```

### Imperative API (non-React)

```typescript
import { Reactor } from "@reactor-team/js-sdk";

const reactor = new Reactor({ modelName: "model-name" });
reactor.on("statusChanged", (status) => console.log(status));
reactor.on("newMessage", (msg) => console.log(msg));
await reactor.connect(jwtToken);
await reactor.sendCommand("start", {});
```

## Proto Types

The SDK uses protobuf types from `reactor-proto`. To update:

```bash
cd libs/client
export GH_TOKEN=<github-token>
pnpm proto
```

This fetches pre-built TypeScript types from reactor-proto releases.

## Examples Architecture

Each example is a Next.js 15 app with:

```
app/
  ├── page.tsx              # Main page with ReactorProvider
  ├── layout.tsx            # Root layout
  └── api/                  # Backend routes (optional)
components/
  ├── [Model]Controller.tsx # Model-specific controls
  └── ReactorStatus.tsx     # Connection status display
```

### Environment Variables

```bash
NEXT_PUBLIC_REACTOR_API_KEY=<api-key>
NEXT_PUBLIC_COORDINATOR_URL=<optional-coordinator-url>
```

### Key Dependencies

- Next.js 15.4+
- React 19.1.0
- @reactor-team/js-sdk (workspace:\*)
- Tailwind CSS 4.x
- TypeScript 5.x
- zustand ^5.0.6

## Development Workflow

1. **SDK changes**: Edit `libs/client/src/`, run `pnpm build`
2. **Test in example**: Examples use `workspace:*`, changes reflect immediately after build
3. **All React components must use `"use client"`** - SDK requires browser APIs
4. **Handle connection status** - disable controls when not "ready"

## Publishing

The SDK is published to npm as `@reactor-team/js-sdk`. The create-app CLI is published as `create-reactor-app`.
