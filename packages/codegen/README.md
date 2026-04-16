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
- **Track constants** — `HeliosTracks.MAIN_VIDEO`
- **JSDoc** from model descriptions, constraints, and defaults

## CLI usage

```bash
reactor-codegen \
  --schema schema.json \
  --sdk-version 2.9.0 \
  --output ./out/helios
```

The model name and version are read directly from the schema's `info.title` and `info.version` fields.

### Options

| Flag | Required | Description |
|---|---|---|
| `--schema <path>` | Yes | Path to the model's OpenAPI schema JSON |
| `--sdk-version <semver>` | Yes | `@reactor-team/js-sdk` version to pin as a dependency |
| `--output <dir>` | Yes | Output directory for the generated package |
| `--dry-run` | No | Print generated files to stdout without writing to disk |
| `--no-build` | No | Skip `pnpm install` + `tsup` build (just generate source) |

## Local development

```bash
# Run codegen against the test schema (Helios)
pnpm tsx src/cli.ts \
  --schema schema.json \
  --sdk-version 2.9.0 \
  --output .generated/helios

# Dry-run to preview output without writing files
pnpm tsx src/cli.ts \
  --schema schema.json \
  --sdk-version 2.9.0 \
  --output .generated/helios \
  --dry-run
```

## Programmatic API

The codegen can also be used as a library:

```typescript
import { loadSchema, parseSchema, generateModelSdk, writePackage } from "@reactor-team/codegen";

const rawSchema = loadSchema("schema.json");
const schema = parseSchema(rawSchema);

const pkg = generateModelSdk({
  modelName: schema.modelName,
  modelVersion: schema.modelVersion,
  sdkVersion: "2.9.0",
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
helios.reactor.on("statusChanged", (status) => { /* ... */ });
```

## OpenAPI schema format

The input is a standard OpenAPI 3.1 JSON document with Reactor extensions. See `schema.json` in this directory for a full example (Helios).

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
    "tracks": [
      { "name": "main_video", "kind": "video", "direction": "out" }
    ]
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

| JSON Schema `type` | TypeScript output |
|---|---|
| `"string"` | `string` |
| `"integer"` | `number` |
| `"number"` | `number` |
| `"boolean"` | `boolean` |
| `"object"` with `"format": "reactor-upload-reference"` | `FileRef` |
| `"object"` (no format) | `Record<string, unknown>` |
| Any type with `"enum"` | Union literal (e.g. `"a" \| "b"`) |

### Supported field constraints

| JSON Schema field | JSDoc tag |
|---|---|
| `"minimum"` | `@minimum` |
| `"maximum"` | `@maximum` |
| `"minLength"` | `@minLength` |
| `"maxLength"` | `@maxLength` |
| `"default"` | `@default` |
| `"description"` | JSDoc body |
