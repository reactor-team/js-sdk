# @reactor-team/codegen

Code generator that turns a model's OpenAPI schema into a strongly-typed npm package (`@reactor-models/<name>`).

## How it works

```
schema.json ──▶ codegen ──▶ @reactor-models/helios (npm package)
                              ├── src/index.ts      (typed client)
                              ├── package.json
                              ├── tsconfig.json
                              └── dist/             (built output)
```

The codegen reads a model's OpenAPI schema (events, messages, tracks) and produces a TypeScript package with:

- **Typed event methods** — `setPrompt({ prompt: "..." })` instead of `sendCommand("set_prompt", { prompt: "..." })`
- **Typed message listeners** — `onChunkComplete((msg) => msg.chunk_index)` with full autocomplete
- **Per-message listener helpers** — `onPromptAccepted(handler)`, `onGenerationStarted(handler)`, etc.
- **File upload passthrough** — `uploadFile()` exposed when any event uses upload references
- **Track constants + fast-path opt-in** — `HeliosTracks` is passed to `Reactor` as `modelTracks`, unlocking parallel SDP preparation for faster first-frame latency
- **JSDoc** from model descriptions, constraints, and defaults

## CLI usage

```bash
reactor-codegen \
  --schema schema.json \
  --sdk-version 2.9.1 \
  --output ./out/helios
```

The model name and version are read directly from the schema's `info.title` and `info.version` fields.

### Options

The schema can come from **one of two sources**, picked by passing either `--schema` (file on disk) or `--coordinator-url` (live fetch from the control plane). Exactly one of the two is required.

| Flag                      | Required                         | Description                                                                                                                                                                          |
| ------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--schema <path>`         | If not using `--coordinator-url` | Path to the model's OpenAPI schema JSON                                                                                                                                              |
| `--coordinator-url <url>` | If not using `--schema`          | Base URL of the Reactor coordinator (e.g. `https://api.reactor.inc`). Pair with `--model-id`; optionally `--release` and `--api-key`                                                 |
| `--model-id <uuid>`       | With `--coordinator-url`         | Model UUID (`{id}` in `/admin/models/{id}/schemas`)                                                                                                                                  |
| `--release <semver>`      | No                               | Semver-prefix release selector (e.g. `v1.0.5`). If omitted, the most recently registered schema is fetched                                                                           |
| `--api-key <key>`         | Only for private models          | Bearer token forwarded as `Authorization: Bearer <key>`. Falls back to the `REACTOR_API_KEY` environment variable. Public models read anonymously                                    |
| `--sdk-version <semver>`  | No                               | `@reactor-team/js-sdk` version to pin as a dependency. Defaults to the `defaultSdkVersion` field in this package's `package.json` when omitted                                       |
| `--output <path>`         | Yes                              | Output directory for the generated package, or a `.ts` file path when `--standalone`                                                                                                 |
| `--standalone`            | No                               | Emit only the typed source file (no `package.json` / `tsup.config.ts` / `tsconfig.json`). Drop-in use in an existing project; skips build                                            |
| `--react`                 | No                               | Also emit a React entry point: `<Prefix>Provider`, `use<Prefix>()`, one hook per message. Full-package mode adds a `./react` subpath export; standalone writes a sibling `.react.ts` |
| `--dry-run`               | No                               | Print generated files to stdout without writing to disk                                                                                                                              |
| `--no-build`              | No                               | Skip `pnpm install` + `tsup` build (just generate source)                                                                                                                            |

### Fetching from the coordinator

Instead of keeping a `schema.json` committed or side-loading it into CI, point the codegen at a coordinator and let it pull the schema registered against a given model release:

```bash
# Release-scoped — semver-prefix match on the server side, newest wins
reactor-codegen \
  --coordinator-url https://api.reactor.inc \
  --model-id 7b3f1bc2-a4e5-4d78-b9c1-123456789abc \
  --release v1.0.5 \
  --output ./out/helios

# No --release: list the registered schemas and fetch the most recent one
reactor-codegen \
  --coordinator-url https://api.reactor.inc \
  --model-id 7b3f1bc2-a4e5-4d78-b9c1-123456789abc \
  --output ./out/helios

# Private model — use an admin bearer token
REACTOR_API_KEY=rk_... reactor-codegen \
  --coordinator-url https://api.reactor.inc \
  --model-id 7b3f1bc2-a4e5-4d78-b9c1-123456789abc \
  --release v1.0.5 \
  --output ./out/helios
```

Behavior notes:

- **Release selection.** With `--release`, the CLI hits `GET /admin/models/{id}/schemas?release=<release>` once and the coordinator returns the single matching record (semver-prefix match, newest wins when multiple records share a prefix). Without `--release`, the CLI first `GET`s the list, picks the most recent summary, then fetches the full record by ID.
- **Public vs. private models.** Public models are readable without `--api-key`. Private models return `404` (never `403`) to unauthenticated callers so their existence is never leaked — if you expect the request to succeed and see `404`, the most likely cause is a missing `--api-key` / `REACTOR_API_KEY`.
- **Env fallback.** `REACTOR_API_KEY` is consulted when `--api-key` is absent. The explicit flag always wins.
- **SDK version default.** `--sdk-version` is optional; when omitted, the CLI reads `defaultSdkVersion` out of `@reactor-team/codegen`'s own `package.json`. CI pipelines that publish periodic releases typically rely on the committed default so bumping the SDK target is a one-field PR in this package rather than a per-call flag change.
- **Downstream is unchanged.** Both input modes funnel through the same `parseSchema` → emitter pipeline, so `--standalone`, `--react`, `--dry-run`, and `--no-build` behave identically whether the schema came off disk or over HTTP.

### Standalone mode

Use `--standalone` when you want the typed client as a single `.ts` file inside an existing project — no separate npm package, no build step. `--output` becomes a file path (or a directory, in which case `index.ts` is written inside it):

```bash
# Drop a typed Helios client into an existing project's src/ folder.
reactor-codegen \
  --schema schema.json \
  --sdk-version 2.9.1 \
  --output ./src/helios.ts \
  --standalone
```

The emitted `.ts` file is byte-identical to the `src/index.ts` produced by the full-package mode — it still imports `Reactor` (and `FileRef` when needed) from `@reactor-team/js-sdk`, so make sure `@reactor-team/js-sdk` is already a dependency of the host project.

### React output (`--react`)

Pass `--react` to additionally emit a React entry point. In full-package mode this is published as a subpath export so non-React consumers never resolve a `react` import:

```bash
reactor-codegen \
  --schema schema.json \
  --sdk-version 2.9.1 \
  --output ./out/helios \
  --react
```

Generated shape:

| Mode                     | Files                                                                                          | Import path                                                 |
| ------------------------ | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| full package + `--react` | `src/index.ts` + `src/react.ts` + package scaffold (with `./react` subpath + `react` peer dep) | `@reactor-models/<name>` / `@reactor-models/<name>/react`   |
| `--standalone --react`   | `<base>.ts` + `<base>.react.ts` (no package scaffold)                                          | relative imports; the React file imports from `./<base>.js` |

The React file declares `"use client"` (Next.js RSC compat), uses `React.createElement` (no JSX in the emitted file, so it stays `.ts`), and exposes:

- **`<Prefix>Provider`** — wraps `ReactorProvider` with `modelName: MODEL_NAME` and `modelTracks: [...<Prefix>Tracks]` pre-configured. Accepts the same `jwtToken` / `connectOptions` props.
- **`use<Prefix>()`** — typed commands bound to the nearest provider: one method per model event (camelCase) plus `status` and (when any event takes an upload reference) `uploadFile`.
- **`use<Prefix>Message(handler)`** — typed catch-all over the discriminated union.
- **`use<Prefix><PascalMessage>(handler)`** — one filtered hook per message type, handler receives the exact typed message.

Usage in a host app:

```tsx
import {
  HeliosProvider,
  useHelios,
  useHeliosChunkComplete,
} from "@reactor-models/helios/react";

function App({ jwtToken }: { jwtToken: string }) {
  return (
    <HeliosProvider jwtToken={jwtToken} connectOptions={{ autoConnect: true }}>
      <Controller />
    </HeliosProvider>
  );
}

function Controller() {
  const { setPrompt, start, status } = useHelios();
  useHeliosChunkComplete((msg) => {
    console.log(`chunk ${msg.chunk_index}: ${msg.frames_emitted} frames`);
  });
  return (
    <button onClick={() => setPrompt({ prompt: "..." }).then(start)}>Go</button>
  );
}
```

The generated package gains `peerDependencies: { react: ">=18" }` only when `--react` is used. Without it, the output is fully framework-agnostic.

## `reactor-codegen update`

The `update` subcommand is a one-shot "is a new version available?" check that the CI `check` step calls instead of reimplementing the logic in bash. It fetches the latest coordinator schema, writes the scaffold to `--output`, queries npm for the currently-published version, and writes a decision JSON the caller can parse.

```bash
reactor-codegen update \
  --coordinator-url https://api.reactor.inc \
  --model helios \
  --output ./out
```

Flags are a subset of `generate`: `--coordinator-url`, `--model` | `--model-id`, `--output`, plus optional `--release`, `--api-key` (env fallback `REACTOR_API_KEY`), `--sdk-version` (defaults to the committed `defaultSdkVersion`), and `--react` (emit the React bindings alongside the plain-JS client — pass this when the downstream pack/publish step will also pass `--react`, so the version decision is taken against the exact scaffold that ships to npm).

Decision shape (`<output>/.update-decision.json`):

```json
{
  "publishNeeded": true,
  "reason": "newer-schema",
  "targetVersion": "1.0.5",
  "currentVersion": "1.0.4"
}
```

`reason` is one of `"first-publish"`, `"newer-schema"`, `"up-to-date"`. Exit codes:

| Code | Meaning                                                                                        |
| ---- | ---------------------------------------------------------------------------------------------- |
| `0`  | Decision written successfully. Consult `publishNeeded`.                                        |
| `1`  | Generic failure (flag, network, malformed payload).                                            |
| `2`  | npm has a **higher** version than the coordinator schema — refusing to republish a regression. |

## Publishing via CI (Buildkite)

Periodic publishing runs through the same `.buildkite/pipeline.yml` entrypoint as normal per-push CI, gated on a `MODELS_SYNC` env var so a scheduled run replaces the regular build + test steps with the dynamic publish plan. The flag name is trigger-agnostic on purpose — the same pipeline is reused whether the sync is kicked off by a cron, a webhook, or a manual build.

**Architecture:**

1. **Entry** — `.buildkite/pipeline.yml` is the single entry for the repo. Top-level steps:
   - `if: build.env("MODELS_SYNC") != "true"` — normal `build` / format / unit / integration test groups (skipped on sync runs).
   - `if: build.env("MODELS_SYNC") == "true"` — a single bootstrap step that runs `.buildkite/sync-model-sdks.sh` (reads whitelist, substitutes the model name placeholder in `.buildkite/publish-model-step.yml` once per model) and pipes the output into `buildkite-agent pipeline upload`.
2. **Dynamic plan** — the bootstrap step uploads one `check-<MODEL>` step per whitelist entry:
   - **`check-<MODEL>`** — shells out to `reactor-codegen update` (see above). The CLI exits 2 if npm is ahead of the coordinator, failing the build fast and loud. If `publishNeeded=true`, the check step then uploads its own follow-up pipeline (`pack-<MODEL>` + `publish-<MODEL>`) as an inline heredoc fed to `buildkite-agent pipeline upload`. If `publishNeeded=false`, the check step exits 0 and no follow-up is created — that absence _is_ the skip.
   - **`pack-<MODEL>`** (only uploaded when needed) — regenerates + builds the package, runs `npm pack`, uploads the resulting `.tgz` as a Buildkite artifact.
   - **`publish-<MODEL>`** (depends on `pack-<MODEL>`) — downloads the tarball artifact and `npm publish`es it — no codegen re-run, so the bytes on npm match the archived Buildkite artifact exactly.

   This avoids `if: build.meta_data(...)` gates — not every agent version exposes `meta_data` as an expression function, and dynamic upload is the Buildkite-canonical pattern. Every docker plugin block that calls `buildkite-agent ...` mounts the host binary via `mount-buildkite-agent: true`.

**Trigger** — configure a Buildkite schedule on the existing pipeline (not a new one). In the schedule's **Env Vars** block, set:

```
MODELS_SYNC=true
```

…and any other overrides you want. A sensible default schedule:

```
Name:    hourly-sync
Cron:    0 * * * *
Branch:  main
Env:     MODELS_SYNC=true
```

The whitelist is committed, so there's nothing else to pass on a vanilla run. Ad-hoc republishes can also be fired via the Buildkite REST API (or a manual build in the UI) by setting `MODELS_SYNC=true` in the request body's `env` block.

**Env vars (set on the schedule, REST trigger, or manual build):**

| Variable          | Required | Default                   | Purpose                                                                                                                                          |
| ----------------- | -------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `MODELS_SYNC`     | yes      | _(unset)_                 | Must be `"true"` to enter the publish flow. Anything else runs the normal per-push CI.                                                           |
| `DRY`             | no       | `"false"`                 | When `"true"`, `check` + `pack` run normally but the publish step swaps in `npm publish --dry-run` — nothing ships to npm. Great for rehearsals. |
| `COORDINATOR_URL` | no       | `https://api.reactor.inc` | Coordinator the publish flow fetches schemas from. Override to point at a dev/staging coordinator.                                               |

**Required Buildkite secrets (wired per uploaded step):**

| Secret            | Used by         | Purpose                                                                                |
| ----------------- | --------------- | -------------------------------------------------------------------------------------- |
| `REACTOR_API_KEY` | `check`, `pack` | Admin bearer token for `/admin/models` name resolution + private-model schema reads    |
| `NPM_AUTH_TOKEN`  | `publish`       | npm access token with publish rights on `@reactor-models/*` (not used when `DRY=true`) |

`NPM_AUTH_TOKEN` is not consulted when `DRY=true` — a rehearsal run can skip provisioning it entirely.

**Local sanity-check the generator:**

```bash
bash .buildkite/sync-model-sdks.sh | less    # emits the pipeline to stdout
```

**Adding a model to the rotation:** edit `.buildkite/whitelist.json` and add the model name. The next scheduled run will detect, pack, and publish it on the first run (first publish always goes through since `npm view` returns empty for unknown packages).

The generated `package.json` strips a leading `v` from the schema's `info.version` (e.g. `v0.0.0` → `0.0.0`) so the tarball passes npm's strict semver check. The `MODEL_VERSION` constant exported from the generated source preserves the author's original string unchanged.

## Local development

```bash
# Run codegen against the test schema (Helios)
pnpm tsx src/cli.ts \
  --schema schema.json \
  --sdk-version 2.9.1 \
  --output .generated/helios

# Dry-run to preview output without writing files
pnpm tsx src/cli.ts \
  --schema schema.json \
  --sdk-version 2.9.1 \
  --output .generated/helios \
  --dry-run

# With React hooks (adds src/react.ts + ./react subpath export)
pnpm tsx src/cli.ts \
  --schema schema.json \
  --sdk-version 2.9.1 \
  --output .generated/helios \
  --react

# Or use the shorthand script
pnpm codegen:test
```

Run the vitest suite (parser, emitter, and snapshot regression tests):

```bash
pnpm test            # one-shot
pnpm test:watch      # watch mode
```

## Programmatic API

The codegen can also be used as a library:

```typescript
import {
  loadSchema,
  fetchSchema,
  parseSchema,
  generateModelSdk,
  writePackage,
} from "@reactor-team/codegen";

// Either read the raw OpenAPI doc off disk…
const rawSchema = loadSchema("schema.json");

// …or pull it straight from the coordinator.
const rawFromApi = await fetchSchema({
  coordinatorUrl: "https://api.reactor.inc",
  modelId: "7b3f1bc2-a4e5-4d78-b9c1-123456789abc",
  release: "v1.0.5", // optional; omit for "most recent"
  apiKey: process.env.REACTOR_API_KEY, // optional; required for private models
});

const schema = parseSchema(rawSchema);

const pkg = generateModelSdk({
  modelName: schema.modelName,
  modelVersion: schema.modelVersion,
  sdkVersion: "2.9.1",
  schema,
  outputDir: "./out/helios",
});

writePackage(pkg, "./out/helios");
```

## Generated package usage

The output is a standard npm package that developers install and use:

```typescript
import { HeliosModel } from "@reactor-models/helios";

const helios = new HeliosModel();
await helios.connect(token);

// Typed events — full autocomplete, type checking
await helios.setPrompt({ prompt: "a sunset over the ocean" });
await helios.setSrScale({ sr_scale: "2x" });
await helios.start();

// Typed message listeners — discriminated union
const unsub = helios.onChunkComplete((msg) => {
  console.log(`Chunk ${msg.chunk_index}: ${msg.frames_emitted} frames`);
});

// File uploads
const ref = await helios.uploadFile(imageBlob);
await helios.setImage({ image: ref });

// Options (optional)
const heliosLocal = new HeliosModel({ local: true });
const heliosCustom = new HeliosModel({ apiUrl: "https://custom.api.com" });

// Access the underlying Reactor instance for advanced use
helios.reactor.on("statusChanged", (status) => {
  /* ... */
});
```

### Parallel SDP preparation

When a model declares tracks in its OpenAPI schema, the generated client passes them to `new Reactor({ modelTracks: [...HeliosTracks] })`. This lets the SDK prepare the WebRTC offer in parallel with session polling — saving roughly one round-trip on `connect()`. No developer action required; the fast path is on by default whenever tracks are declared.

The schema direction (`"in"`/`"out"`, model perspective) is translated to the transport direction (`"sendonly"`/`"recvonly"`, client perspective):

| Schema direction                          | `modelTracks[*].direction` |
| ----------------------------------------- | -------------------------- |
| `"out"` (model produces, client receives) | `"recvonly"`               |
| `"in"` (model consumes, client sends)     | `"sendonly"`               |

## OpenAPI schema format

The input is a standard OpenAPI 3.1 JSON document with Reactor extensions. The repo also ships a minimal `schema.json` fixture in this directory that the parser and CLI tests use; real models ship a richer schema via the coordinator's model registry.

### Events (client → model)

Events are defined as `POST` operations under `/events/{name}`:

```json
{
  "paths": {
    "/events/set_prompt": {
      "post": {
        "operationId": "set_prompt",
        "summary": "Set and encode scene prompt",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "prompt": { "type": "string", "default": "" }
                }
              }
            }
          }
        }
      }
    }
  }
}
```

### Messages (model → client)

Messages are defined as OpenAPI `webhooks`:

```json
{
  "webhooks": {
    "prompt_accepted": {
      "post": {
        "operationId": "prompt_accepted",
        "summary": "A prompt was accepted and scheduled for encoding.",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "prompt": { "type": "string" }
                },
                "required": ["prompt"]
              }
            }
          }
        }
      }
    }
  }
}
```

### Tracks

Tracks are declared in the `x-reactor` extension:

```json
{
  "x-reactor": {
    "tracks": [{ "name": "main_video", "kind": "video", "direction": "out" }]
  }
}
```

### Upload references (`$ref`)

File upload parameters use a `$ref` to the `ReactorUploadReference` component schema:

```json
{
  "image": {
    "$ref": "#/components/schemas/ReactorUploadReference",
    "default": null
  }
}
```

The component schema uses `"format": "reactor-upload-reference"` which the codegen maps to the SDK's `FileRef` type.

### Supported field types

| JSON Schema `type`                                     | TypeScript output                 |
| ------------------------------------------------------ | --------------------------------- |
| `"string"`                                             | `string`                          |
| `"integer"`                                            | `number`                          |
| `"number"`                                             | `number`                          |
| `"boolean"`                                            | `boolean`                         |
| `"object"` with `"format": "reactor-upload-reference"` | `FileRef`                         |
| `"object"` (no format)                                 | `Record<string, unknown>`         |
| Any type with `"enum"`                                 | Union literal (e.g. `"a" \| "b"`) |

### Supported field constraints

| JSON Schema field | JSDoc tag    |
| ----------------- | ------------ |
| `"minimum"`       | `@minimum`   |
| `"maximum"`       | `@maximum`   |
| `"minLength"`     | `@minLength` |
| `"maxLength"`     | `@maxLength` |
| `"default"`       | `@default`   |
| `"description"`   | JSDoc body   |
