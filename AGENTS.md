# AGENTS.md — js-sdk (public)

Monorepo for the Reactor JavaScript client SDK and app scaffolding tools.

## Packages

| Path | npm package | Purpose |
|------|-------------|---------|
| `packages/js-sdk` | `@reactor-team/js-sdk` | Core SDK (WebRTC, React hooks, session client) |
| `packages/create-app` | `create-reactor-app` | `npx create-reactor-app` project scaffolder |

## Related (private)

**[js-sdk-codegen](https://github.com/reactor-team/js-sdk-codegen)** — `@reactor-team/codegen` / `reactor-codegen` CLI and Buildkite pipeline that publishes typed `@reactor-models/<name>` packages. Not in this repo.

## Development

```bash
pnpm install
pnpm build
pnpm test:unit
pnpm test:integration   # needs REACTOR_API_KEY
```

CI: Buildkite (`.buildkite/pipeline.yml`).
