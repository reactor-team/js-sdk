# livecore

A minimal Next.js demo showing how to use the Reactor JS SDK with the **Livecore** model. Good starting point if you're new to the platform.

## What It Does

- Connects to Livecore and streams real-time video output via `ReactorView`
- Lets you send prompts by typing your own or picking from preset story suggestions
- Automatically schedules the first prompt at frame 0 and starts generation — subsequent prompts are queued a few frames ahead of the current position so transitions are smooth
- Shows a live frame counter (out of 240) and a running/paused indicator
- Pause, resume, and reset generation at any time
- Auto-resets after 240 frames

## Getting Started

### 1. Install dependencies

```bash
pnpm install
```

### 2. Run the dev server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Learn More

- [Reactor Docs](https://docs.reactor.inc/overview)
- [Discord](https://discord.gg/xSbBWECQRk) — reach out if you have questions or run into issues
