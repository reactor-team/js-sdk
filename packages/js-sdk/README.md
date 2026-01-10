# Reactor Frontend SDK

## Overview

This is the frontend SDK for Reactor. It provides a set of tools and utilities to build frontend applications that can use the Reactor platform.

There are two main ways to use the frontend SDK:

1. **Imperative API**: Use it in any TS/JS application.
2. **React API**: Use it in a React applications.

## Setup

### Fetching Protobuf Types

The SDK uses generated TypeScript types from the [reactor-proto](https://github.com/reactor-team/reactor-proto) repository. These are fetched from GitHub releases and placed in `src/generated/`.

1. Set your GitHub token (required for private repo access):

```bash
export GH_TOKEN=your_github_token
```

2. Fetch the protobuf types:

```bash
pnpm proto
```

This will download the types matching the version specified in `package.json` under `protobufsVersion`.

### Updating Protobuf Version

To update to a new protobuf version:

1. Update `protobufsVersion` in `package.json` to the new semver (e.g., `"0.3.4"`)
2. Run `pnpm proto` to fetch the new types

### Cleaning Generated Files

To remove the generated protobuf types:

```bash
pnpm clean
```

## Building the SDK

Set up the environment variables:

```bash
cp .env.example .env
```

Then add your NPM_TOKEN to the .env file.

Build the SDK:

```bash
pnpm build
```

## Publishing

To publish the SDK:

```bash
./publish_package.sh
```
