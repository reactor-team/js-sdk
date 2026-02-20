# film-director

A more advanced Next.js demo that gives you a timeline-based editor for directing Livecore video generation frame by frame — similar to a video editing tool.

## What It Does

- **Timeline editor** — click anywhere on the timeline to place a prompt at a specific frame; the model will transition to that prompt when it reaches that frame
- **Playhead** — a scrubber shows your current position as generation progresses
- **Transport controls** — play, pause, resume, and stop/reset generation
- **Prompt management** — add, edit, and delete scheduled prompts directly on the timeline
- **Resizable panels** — drag the divider between the video preview and timeline to adjust the layout
- **Fullscreen mode** — expand to fill the screen for a cleaner viewing experience
- **Live status** — the current active prompt and frame position are always visible

Generation requires at least one prompt placed at frame 0 before you can start.

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
