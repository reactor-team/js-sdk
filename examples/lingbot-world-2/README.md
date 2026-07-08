# lingbot-world frontend

A Next.js demo for the **LingBot-World** real-time interactive
image-to-video model on Reactor. Pick or upload a starting image,
write a prompt, then steer the generated world with WASD movement and
IJKL camera-rotation controls.

This frontend talks to the LingBot model through the Reactor JS SDK
([`@reactor-team/js-sdk`](https://www.npmjs.com/package/@reactor-team/js-sdk)).

## Getting Started

### 1. Install dependencies

```bash
pnpm install
```

### 2. Run the dev server

```bash
pnpm dev
```

Open <http://localhost:3000>. Above the status bar there is an
**Endpoint** dropdown — pick one:

- **Production** (`api.reactor.inc`) — default. Paste your Reactor
  API key into the field next to the dropdown (get one from
  <https://www.reactor.inc/dashboard>). The key is sent to the
  `/api/token` server route which exchanges it for a JWT, and is
  cached in `localStorage` so it survives reloads.
- **Local (Direct)** — connect straight to a model's runtime (e.g. a
  `python -m reactor_runtime.serve run` process). No API key needed.
  The text input next to the dropdown lets you point it at any
  URL/port; the default is `http://localhost:8080`.

The page remounts the SDK provider on switch, so the next click of
**Connect** opens a fresh session against the new endpoint.

## Learn More

- [Reactor Docs](https://docs.reactor.inc/overview)
- [LingBot model behaviour](../model_behaviour.md) — full client
  contract (commands, messages, lifecycle)
