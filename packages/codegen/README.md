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

| Flag                     | Required | Description                                                                                                                                                                          |
| ------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--schema <path>`        | Yes      | Path to the model's OpenAPI schema JSON                                                                                                                                              |
| `--sdk-version <semver>` | No       | `@reactor-team/js-sdk` version to pin as a dependency. Defaults to the `defaultSdkVersion` field in this package's `package.json` when omitted                                       |
| `--output <path>`        | Yes      | Output directory for the generated package, or a `.ts` file path when `--standalone`                                                                                                 |
| `--standalone`           | No       | Emit only the typed source file (no `package.json` / `tsup.config.ts` / `tsconfig.json`). Drop-in use in an existing project; skips build                                            |
| `--react`                | No       | Also emit a React entry point: `<Prefix>Provider`, `use<Prefix>()`, one hook per message. Full-package mode adds a `./react` subpath export; standalone writes a sibling `.react.ts` |
| `--dry-run`              | No       | Print generated files to stdout without writing to disk                                                                                                                              |
| `--no-build`             | No       | Skip `pnpm install` + `tsup` build (just generate source)                                                                                                                            |

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
  parseSchema,
  generateModelSdk,
  writePackage,
} from "@reactor-team/codegen";

const rawSchema = loadSchema("schema.json");
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
