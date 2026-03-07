# Reactor Frontend SDK

## Overview

This is the frontend SDK for Reactor. It provides a set of tools and utilities to build frontend applications that can use the Reactor platform.

There are two main ways to use the frontend SDK:

1. **Imperative API**: Use it in any TS/JS application.
2. **React API**: Use it in a React applications.

## Building the SDK

```bash
pnpm build
```

## Testing

The SDK includes a comprehensive test suite split into **unit tests** (fast, no network) and **integration tests** (hit production with the `echo` model).

### Running tests

```bash
# Run all tests (unit + integration)
pnpm test

# Run only unit tests
pnpm test:unit

# Run only integration tests (requires REACTOR_API_KEY)
REACTOR_API_KEY=rk_... pnpm test:integration

# Watch mode (re-runs on file changes)
pnpm test:watch
```

### Integration tests

Integration tests connect to the production Reactor API using the **echo** model. They require a valid API key exported as `REACTOR_API_KEY`. When the variable is missing the integration suite is automatically skipped.

In CI, integration tests run on pushes to `main` and on PRs from the same repository (not forks). The API key is read from the `REACTOR_API_KEY` GitHub Actions secret.

### Test structure

```
__tests__/
  setup.ts                              # WebRTC polyfill for Node.js
  unit/
    types.test.ts                       # video(), audio(), error helpers
    schemas.test.ts                     # Zod schema validation
    webrtc-utils.test.ts                # SDP rewriting, messaging, stats
    reactor.test.ts                     # Reactor class (constructor, events, guards)
    coordinator-client.test.ts          # CoordinatorClient (mocked fetch)
    local-coordinator-client.test.ts    # LocalCoordinatorClient (mocked fetch)
    gpu-machine-client.test.ts          # GPUMachineClient (mocked WebRTC)
  integration/
    tokens.test.ts                      # JWT token fetch round-trip
    coordinator-client.test.ts          # Session lifecycle against prod
    reactor-e2e.test.ts                 # Full connect → command → disconnect
```

## Documentation

- [Getting Started](https://docs.reactor.inc)
