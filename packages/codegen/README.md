# @reactor-team/codegen

Code generator that turns a model's capabilities JSON into a strongly-typed npm package (`@reactor-models/<name>`).

## How it works

```
capabilities.json ──▶ codegen ──▶ @reactor-models/helios (npm package)
                                    ├── src/index.ts      (typed client)
                                    ├── package.json
                                    ├── tsconfig.json
                                    └── dist/             (built output)
```

The codegen reads a model's capabilities (commands, messages, tracks) and produces a TypeScript package with:

- **Typed command methods** — `setPrompt({ prompt: "..." })` instead of `sendCommand("set_prompt", { prompt: "..." })`
- **Typed message listeners** — `onChunkComplete((msg) => msg.chunk_index)` with full autocomplete
- **Per-message listener helpers** — `onPromptAccepted(handler)`, `onGenerationStarted(handler)`, etc.
- **File upload passthrough** — `uploadFile()` exposed when any command uses file references
- **Track constants** — `HeliosTracks.MAIN_VIDEO`
- **JSDoc** from model descriptions, constraints, and defaults

## CLI usage

```bash
reactor-codegen \
  --model-name helios \
  --model-version 1.0.0 \
  --capabilities capabilities.json \
  --sdk-version 2.9.0 \
  --output ./out/helios
```

### Options

| Flag | Required | Description |
|---|---|---|
| `--model-name <name>` | Yes | Model name (e.g. `helios`). Becomes the package scope: `@reactor-models/helios` |
| `--model-version <semver>` | Yes | Model version. Becomes the npm package version |
| `--capabilities <path>` | Yes | Path to the capabilities JSON file |
| `--sdk-version <semver>` | Yes | `@reactor-team/js-sdk` version to pin as a dependency |
| `--output <dir>` | Yes | Output directory for the generated package |
| `--dry-run` | No | Print generated files to stdout without writing to disk |
| `--no-build` | No | Skip `pnpm install` + `tsup` build (just generate source) |

## Local development

```bash
# Run codegen against the test capabilities (Helios)
pnpm tsx src/cli.ts \
  --model-name helios \
  --model-version 1.0.0 \
  --capabilities capabilities.json \
  --sdk-version 2.9.0 \
  --output .generated/helios

# Dry-run to preview output without writing files
pnpm tsx src/cli.ts \
  --model-name helios \
  --model-version 1.0.0 \
  --capabilities capabilities.json \
  --sdk-version 2.9.0 \
  --output .generated/helios \
  --dry-run
```

## Programmatic API

The codegen can also be used as a library:

```typescript
import { loadCapabilities, generateModelSdk, writePackage } from "@reactor-team/codegen";

const capabilities = loadCapabilities("capabilities.json");

const pkg = generateModelSdk({
  modelName: "helios",
  modelVersion: "1.0.0",
  sdkVersion: "2.9.0",
  capabilities,
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

// Typed commands — full autocomplete, type checking
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

## Protocol versioning

The codegen dispatches to a protocol-version-specific generator based on the `protocol_version` field in the capabilities JSON. This allows future breaking changes to the capabilities schema (e.g. renaming `commands` to `events`) to be handled by adding a new generator without touching the existing one.

Currently supported:

| Protocol version | Generator | Notes |
|---|---|---|
| `1.x` | `v1` | Current format: `commands`, `messages`, `tracks` |

To add a new protocol version, create a new generator in `src/protocols/` and register it via `registerProtocol()`.

## Capabilities JSON format

The input is the JSON produced by `reactor capabilities` on a model image. See `capabilities.json` in this directory for a full example (Helios).

```json
{
  "protocol_version": "1.3",
  "tracks": [
    { "name": "main_video", "kind": "video", "direction": "recvonly" }
  ],
  "commands": [
    {
      "name": "set_prompt",
      "description": "Set and encode scene prompt",
      "schema": {
        "prompt": { "type": "string", "default": "" }
      }
    }
  ],
  "messages": [
    {
      "name": "prompt_accepted",
      "schema": {
        "prompt": { "type": "string" }
      }
    }
  ],
  "emission_fps": 30
}
```

### Supported field schema types

| JSON Schema `type` | TypeScript output | Source |
|---|---|---|
| `"string"` | `string` | `str` |
| `"integer"` | `number` | `int` |
| `"number"` | `number` | `float` |
| `"boolean"` | `boolean` | `bool` |
| `"object"` with `"format": "file-reference"` | `FileRef` | `UploadedFile` |
| `"object"` (no format) | `Record<string, unknown>` | Unknown/complex types |
| Any type with `"enum"` | Union literal (e.g. `"a" \| "b"` or `1 \| 2`) | `Literal[...]` or `InputField(choices=...)` |

### Supported field constraints

| JSON Schema field | JSDoc tag | Source |
|---|---|---|
| `"minimum"` | `@minimum` | `InputField(ge=...)` |
| `"maximum"` | `@maximum` | `InputField(le=...)` |
| `"minLength"` | `@minLength` | `InputField(min_length=...)` |
| `"maxLength"` | `@maxLength` | `InputField(max_length=...)` |
| `"default"` | `@default` | Field default value |
| `"description"` | JSDoc body | `InputField(description=...)` |
