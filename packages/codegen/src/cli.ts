// Copyright (c) 2026 Reactor Technologies, Inc. All rights reserved.

import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import {
  loadSchema,
  parseSchema,
  generateModelSdk,
  writePackage,
} from "./codegen.js";
import {
  exchangeApiKeyForJwt,
  fetchSchema,
  resolveModelIdByName,
} from "./coordinator.js";
import type { OpenApiSchema } from "./openapi/index.js";
import {
  decideUpdate,
  getPublishedNpmVersion,
  NpmRegressionError,
} from "./update.js";
import type { UpdateDecision } from "./update.js";

// ---------------------------------------------------------------------------
// Shared `defaultSdkVersion` fallback — the team's committed JS SDK
// support target, used when the CLI is invoked without an explicit
// `--sdk-version`. Kept defensive so a malformed install still produces
// a clear error instead of an empty dep.
// ---------------------------------------------------------------------------

function readDefaultSdkVersion(): string | undefined {
  try {
    // tsup inlines CLI source to dist/cli.js (CJS), so __dirname is the
    // dist folder in production and src/ in `tsx` dev mode. The
    // package.json lives one level up either way.
    const pkgPath = path.resolve(__dirname, "..", "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    const v = pkg.defaultSdkVersion;
    return typeof v === "string" && v.length > 0 ? v : undefined;
  } catch {
    return undefined;
  }
}

const DEFAULT_SDK_VERSION = readDefaultSdkVersion();

// ---------------------------------------------------------------------------
// Subcommand dispatch.
//
// `reactor-codegen [options]`          → generate (back-compat; default)
// `reactor-codegen update [options]`   → fetch + generate + compare vs npm
//
// Leaving `generate` as the unnamed default preserves every existing
// pnpm/tsx invocation (tests, examples, local scripts). New subcommands
// have to be opted into by name.
// ---------------------------------------------------------------------------

function topLevelUsage(): never {
  console.error(`
Usage: reactor-codegen [<command>] [options]

Commands:
  generate (default)   Generate a typed model SDK from a schema source
  update               Regenerate from the coordinator and check whether
                       a newer version than what's on npm is available

Run \`reactor-codegen <command> --help\` for command-specific options.
`);
  process.exit(1);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const first = argv[0];

  // Known subcommands fire dedicated runners. A bare `--help` at the
  // top level is ambiguous between "which command?" and "generate
  // --help", so we fall into the generate runner which handles --help
  // for itself (matches every prior release's behaviour).
  if (first === "update") {
    await runUpdate(argv.slice(1));
    return;
  }
  if (first === "help" || first === "--commands") {
    topLevelUsage();
  }
  await runGenerate(argv);
}

// Top-level error wall: any thrown Error (network, 4xx/5xx, bad payload,
// file-not-found) becomes a single-line stderr message and a non-zero
// exit. Keeps the CLI's failure surface small and grep-able.
//
// `NpmRegressionError` gets a dedicated exit code (2) so pipeline
// wrappers can distinguish "refuse to regress" from generic failures.
main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`Error: ${msg}`);
  process.exit(err instanceof NpmRegressionError ? 2 : 1);
});

// ---------------------------------------------------------------------------
// `generate` subcommand (default).
// ---------------------------------------------------------------------------

interface GenerateArgs {
  schema?: string;
  coordinatorUrl?: string;
  modelId?: string;
  modelName?: string;
  release?: string;
  apiKey?: string;
  sdkVersion: string;
  output: string;
  dryRun: boolean;
  build: boolean;
  standalone: boolean;
  react: boolean;
}

function generateUsage(): never {
  console.error(`
Usage: reactor-codegen [options]

Schema source (pick ONE):
  --schema <path>             Path to the model's OpenAPI schema JSON
  --coordinator-url <url>     Coordinator base URL to fetch the schema from
                              (pair with --model-id; optionally --release
                              and --api-key / REACTOR_API_KEY)

Coordinator-mode options (pick ONE of --model or --model-id):
  --model <name>              Model name on the coordinator. The CLI resolves
                              it to a UUID via GET /admin/models; requires an
                              --api-key that can list models.
  --model-id <uuid>           Model UUID on the coordinator (no admin list
                              permission needed for public schemas).
  --release <semver>          Semver-prefix release selector (e.g. v1.0.5).
                              If omitted, the CLI lists registered schemas
                              and picks the highest semver.
  --api-key <key>             Bearer token for private models. Falls back to
                              the REACTOR_API_KEY environment variable.
                              Public models are readable without auth, but
                              --model name resolution always requires auth.

Common options:
  --sdk-version <semver>      JS SDK version to pin as a dependency.
                              Defaults to the \`defaultSdkVersion\` field in
                              @reactor-team/codegen's package.json${
                                DEFAULT_SDK_VERSION
                                  ? ` (currently ${DEFAULT_SDK_VERSION})`
                                  : ""
                              }.
  --output <path>             Output path — a directory for the generated
                              package, or a .ts file path when --standalone
  --standalone                Emit only the typed source file (no
                              package.json / tsup.config.ts / tsconfig.json).
                              Intended for drop-in use in an existing
                              project; implies --no-build.
  --react                     Emit a React provider, a typed use<Prefix>()
                              hook, and one hook per message in src/react.ts.
                              src/index.ts re-exports them, so consumers
                              import everything from the package root with
                              no subpath. Adds a \`react\` peer dependency
                              in full-package mode.
  --dry-run                   Print generated files without writing to disk
  --no-build                  Skip the build step (just generate source)
`);
  process.exit(1);
}

function parseGenerateArgs(argv: string[]): GenerateArgs {
  const args: Partial<GenerateArgs> = {
    dryRun: false,
    build: true,
    standalone: false,
    react: false,
    // Start with the committed default so invocations that don't pin a
    // specific SDK get the team's current support target. An explicit
    // `--sdk-version` on the command line overwrites this below.
    sdkVersion: DEFAULT_SDK_VERSION,
  };

  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--schema":
        args.schema = argv[++i];
        break;
      case "--coordinator-url":
        args.coordinatorUrl = argv[++i];
        break;
      case "--model":
        args.modelName = argv[++i];
        break;
      case "--model-id":
        args.modelId = argv[++i];
        break;
      case "--release":
        args.release = argv[++i];
        break;
      case "--api-key":
        args.apiKey = argv[++i];
        break;
      case "--sdk-version":
        args.sdkVersion = argv[++i];
        break;
      case "--output":
        args.output = argv[++i];
        break;
      case "--dry-run":
        args.dryRun = true;
        break;
      case "--no-build":
        args.build = false;
        break;
      case "--standalone":
        args.standalone = true;
        break;
      case "--react":
        args.react = true;
        break;
      case "--help":
      case "-h":
        generateUsage();
        break;
      default:
        console.error(`Unknown option: ${argv[i]}`);
        generateUsage();
    }
  }

  // Source selection is mutually exclusive; exactly one must be set.
  const hasFile = !!args.schema;
  const hasCoordinator = !!args.coordinatorUrl;
  if (hasFile && hasCoordinator) {
    console.error(
      "Error: --schema and --coordinator-url are mutually exclusive.\n",
    );
    generateUsage();
  }
  if (!hasFile && !hasCoordinator) {
    console.error("Error: one of --schema or --coordinator-url is required.\n");
    generateUsage();
  }

  // Pick exactly one of --model / --model-id alongside --coordinator-url.
  // Both together is ambiguous; neither leaves the fetcher with no target.
  const hasModelId = !!args.modelId;
  const hasModelName = !!args.modelName;
  if (hasCoordinator && hasModelId && hasModelName) {
    console.error("Error: --model and --model-id are mutually exclusive.\n");
    generateUsage();
  }
  if (hasCoordinator && !hasModelId && !hasModelName) {
    console.error("Error: --coordinator-url requires --model or --model-id.\n");
    generateUsage();
  }

  // Fall back to REACTOR_API_KEY. Keeps tokens out of shell history / CI
  // process listings by default, matching the convention used across
  // the rest of Reactor's tooling.
  if (hasCoordinator && !args.apiKey && process.env.REACTOR_API_KEY) {
    args.apiKey = process.env.REACTOR_API_KEY;
  }

  // `sdkVersion` is optional on the CLI: `parseGenerateArgs` pre-seeds
  // it from the codegen's `defaultSdkVersion` field, and an explicit
  // `--sdk-version` on the command line overwrites that. Only fail if
  // both the CLI and the committed default are missing — that's a
  // misconfigured install, not a user mistake.
  if (!args.output || !args.sdkVersion) {
    console.error("Error: missing required arguments.\n");
    generateUsage();
  }

  // Standalone output is a single source file — nothing to build.
  if (args.standalone) {
    args.build = false;
  }

  return args as GenerateArgs;
}

function run(cmd: string, cwd: string): void {
  console.log(`  $ ${cmd}`);
  execSync(cmd, { cwd, stdio: "inherit" });
}

function buildPackage(outputDir: string): void {
  console.log("\nBuilding generated package...");
  run("pnpm install --ignore-workspace --no-frozen-lockfile", outputDir);
  run("pnpm build", outputDir);
  console.log("\nBuild complete.");
}

/**
 * Resolve the `--output` path for `--standalone` mode. If the caller
 * passed a `.ts` file we use it verbatim; otherwise we treat the path
 * as a directory and drop `index.ts` inside it. This matches the shape
 * developers expect when pointing `--output` at an existing source tree
 * (e.g. `--output ./src` → `./src/index.ts`).
 */
function resolveStandaloneOutputPath(output: string): string {
  return output.endsWith(".ts") ? output : path.join(output, "index.ts");
}

/**
 * Given the resolved standalone `.ts` output path, derive the sibling
 * React file path by inserting `.react` before the `.ts` extension.
 * `./src/helios.ts` → `./src/helios.react.ts`
 * `./src/index.ts` → `./src/index.react.ts`
 *
 * The emitter's React file imports from `./index.js` and the main file
 * re-exports from `./react.js` (both emitter defaults, used for the
 * full-package layout). In standalone mode the filenames won't always
 * be `index` / `react`, so we rewrite both sides of the pair to point
 * at the chosen basenames — see runGenerate().
 */
function resolveStandaloneReactPath(standaloneOutput: string): string {
  return standaloneOutput.replace(/\.ts$/, ".react.ts");
}

/**
 * Load the raw OpenAPI document from whichever source the caller
 * pointed at. Keeps the two input modes (file on disk vs coordinator
 * HTTP) in one place so the rest of the CLI never branches on source
 * type. Shared by both the `generate` and `update` subcommands.
 */
async function resolveSchema(args: {
  schema?: string;
  coordinatorUrl?: string;
  modelId?: string;
  modelName?: string;
  release?: string;
  apiKey?: string;
}): Promise<{ raw: OpenApiSchema; resolvedModelId?: string }> {
  if (args.schema) {
    return { raw: loadSchema(args.schema) };
  }

  // Per the REST API contract, the API key is only valid on `POST
  // /tokens`; every other call wants a JWT. Exchange once at the top
  // of the coordinator flow and reuse the JWT for both the optional
  // `/admin/models` name lookup and the schema fetch — that's at most
  // one `/tokens` round-trip per CLI invocation, instead of one per
  // coordinator request.
  const bearerToken = args.apiKey
    ? await exchangeApiKeyForJwt({
        coordinatorUrl: args.coordinatorUrl!,
        apiKey: args.apiKey,
      })
    : undefined;

  // `args.coordinatorUrl` is guaranteed by the caller's parser here.
  // Either `--model-id` was given directly or `--model <name>` needs to
  // be resolved through the coordinator first. The name-resolution call
  // is intentionally serial (it's one extra round-trip, once per
  // invocation) rather than folded into `fetchSchema` — keeping the
  // public `fetchSchema` shape UUID-only means callers that already
  // have the ID don't pay for the extra /admin/models request.
  let modelId = args.modelId;
  if (!modelId && args.modelName) {
    modelId = await resolveModelIdByName({
      coordinatorUrl: args.coordinatorUrl!,
      modelName: args.modelName,
      bearerToken,
    });
  }

  const raw = await fetchSchema({
    coordinatorUrl: args.coordinatorUrl!,
    modelId: modelId!,
    release: args.release,
    bearerToken,
  });

  if (!raw || typeof raw !== "object" || !("openapi" in raw)) {
    throw new Error(
      `Coordinator returned a schema payload that is not an OpenAPI 3.x ` +
        `document (missing "openapi" field).`,
    );
  }

  return { raw: raw as OpenApiSchema, resolvedModelId: modelId };
}

async function runGenerate(argv: string[]): Promise<void> {
  const args = parseGenerateArgs(argv);

  const { raw: rawSchema, resolvedModelId } = await resolveSchema(args);
  const schema = parseSchema(rawSchema);

  console.log(`@reactor-team/codegen`);
  console.log(`  Model:    ${schema.modelName}@${schema.modelVersion}`);
  console.log(`  SDK pin:  @reactor-team/js-sdk@^${args.sdkVersion}`);
  if (args.schema) {
    console.log(`  Schema:   ${args.schema}`);
  } else {
    // Display the resolved UUID whether it came in directly or via the
    // name-resolution hop — the user always wants to see the ID the
    // downstream request actually used, for debuggability.
    const displayId = args.modelId ?? resolvedModelId ?? "(unresolved)";
    const nameSuffix = args.modelName ? ` name="${args.modelName}"` : "";
    console.log(
      `  Schema:   ${args.coordinatorUrl} (model-id=${displayId}${nameSuffix})`,
    );
    console.log(`  Release:  ${args.release ?? "<latest>"}`);
    console.log(`  Auth:     ${args.apiKey ? "bearer token" : "anonymous"}`);
  }
  console.log(`  Output:   ${args.output}`);
  if (args.standalone) {
    console.log(`  Mode:     standalone (source-only, no package scaffold)`);
  }
  if (args.react) {
    console.log(`  React:    on (provider + hooks)`);
  }
  console.log();
  console.log(`  Events:   ${schema.events.length}`);
  console.log(`  Messages: ${schema.messages.length}`);
  console.log(`  Tracks:   ${schema.tracks.length}`);
  console.log();

  const pkg = generateModelSdk({
    modelName: schema.modelName,
    modelVersion: schema.modelVersion,
    sdkVersion: args.sdkVersion,
    schema,
    outputDir: args.output,
    react: args.react,
  });

  if (args.standalone) {
    // Standalone mode is intentionally narrow: pluck only the source files
    // off the generated package and drop them at --output. Skipping the
    // package scaffold (package.json, tsup.config.ts, tsconfig.json) keeps
    // the emitter as the single source of truth for what a typed client
    // looks like — we never diverge the "drop-in .ts" from the "full
    // package" output.
    //
    // With --react we also emit the sibling React file. The emitter's
    // default cross-imports use the full-package filenames
    // (`./index.js`, `./react.js`); in standalone mode the chosen
    // basename can be anything, so both sides of the pair are rewritten
    // to the sibling's actual basename before writing.
    const indexFile = pkg.files.find((f) => f.path === "src/index.ts");
    if (!indexFile) {
      // Defensive: the emitter always emits src/index.ts first; if that
      // ever changes, fail loudly rather than silently write an empty file.
      throw new Error(
        "Internal error: generated package is missing src/index.ts",
      );
    }

    const outputFile = path.resolve(resolveStandaloneOutputPath(args.output));
    const reactFile = args.react
      ? pkg.files.find((f) => f.path === "src/react.ts")
      : undefined;
    const reactOutputFile = args.react
      ? resolveStandaloneReactPath(outputFile)
      : undefined;
    const mainBasename = path.basename(outputFile).replace(/\.ts$/, "");
    const reactBasename = reactOutputFile
      ? path.basename(reactOutputFile).replace(/\.ts$/, "")
      : undefined;
    // `resolveStandaloneReactPath` always produces `<main>.react.ts`,
    // so in standalone mode the sibling's basename is never literally
    // `react` — we can unconditionally rewrite the main file's
    // re-export path. The React-side back-import (`./index.js`) only
    // needs rewriting when the main basename isn't already `index`.
    const indexContent =
      args.react && reactBasename
        ? indexFile.content.replace(
            /export \* from "\.\/react\.js";/g,
            `export * from "./${reactBasename}.js";`,
          )
        : indexFile.content;
    const reactContent =
      reactFile && mainBasename !== "index"
        ? reactFile.content.replace(
            /from "\.\/index\.js"/g,
            `from "./${mainBasename}.js"`,
          )
        : reactFile?.content;

    if (args.dryRun) {
      console.log(`--- ${outputFile} ---`);
      console.log(indexContent);
      console.log();
      if (reactContent && reactOutputFile) {
        console.log(`--- ${reactOutputFile} ---`);
        console.log(reactContent);
        console.log();
      }
      console.log("(dry run — no files written)");
      return;
    }

    fs.mkdirSync(path.dirname(outputFile), { recursive: true });
    fs.writeFileSync(outputFile, indexContent, "utf-8");
    console.log(`Generated standalone source at ${outputFile}`);
    if (reactContent && reactOutputFile) {
      fs.writeFileSync(reactOutputFile, reactContent, "utf-8");
      console.log(`Generated standalone React hooks at ${reactOutputFile}`);
    }
    console.log();
    console.log(`Next steps:`);
    console.log(
      `  Ensure @reactor-team/js-sdk@^${args.sdkVersion} is installed in your project`,
    );
    if (args.react) {
      console.log(
        `  react >=18 is required (the hooks file imports from "react")`,
      );
    }
    console.log(
      `  Import the Model class` +
        (args.react ? ", Provider, and hooks " : " ") +
        `from ${outputFile}` +
        (args.react ? " — the main file re-exports the React bindings" : ""),
    );
    return;
  }

  if (args.dryRun) {
    for (const file of pkg.files) {
      console.log(`--- ${file.path} ---`);
      console.log(file.content);
      console.log();
    }
    console.log("(dry run — no files written)");
    return;
  }

  const outputDir = path.resolve(args.output);
  writePackage(pkg, outputDir);

  console.log(`Generated ${pkg.files.length} files in ${outputDir}`);
  for (const file of pkg.files) {
    console.log(`  ${file.path}`);
  }

  if (args.build) {
    buildPackage(outputDir);
  } else {
    console.log();
    console.log(`Next steps:`);
    console.log(`  cd ${args.output}`);
    console.log(`  pnpm install`);
    console.log(`  pnpm build`);
  }
}

// ---------------------------------------------------------------------------
// `update` subcommand.
//
// Purpose — answer the question "does npm need a republish for this
// model's latest coordinator schema?" without opening a shell around
// the CLI. The CI pipeline's `check` step replaces ~50 lines of inline
// bash with a single `reactor-codegen update …` invocation that:
//
//   1. Fetches the latest coordinator schema (same flow as generate).
//   2. Writes the package scaffold to <output> (no tsup build — the
//      pack step regenerates with a build of its own).
//   3. Queries the public npm registry for the currently-published
//      version of @reactor-models/<name>.
//   4. Decides (via `decideUpdate`): first-publish / newer-schema /
//      up-to-date / regression.
//   5. Writes <output>/.update-decision.json with the decision so
//      downstream steps can parse it without stdout pipe contortions.
//
// Regression (npm > schema) exits with code 2; everything else exits 0.
// ---------------------------------------------------------------------------

interface UpdateArgs {
  coordinatorUrl: string;
  modelId?: string;
  modelName?: string;
  release?: string;
  apiKey?: string;
  sdkVersion: string;
  output: string;
  packageNameOverride?: string;
  react: boolean;
}

function updateUsage(): never {
  console.error(`
Usage: reactor-codegen update [options]

Required:
  --coordinator-url <url>   Coordinator base URL (e.g. https://api.reactor.inc)
  --output <path>           Directory to write the generated scaffold into;
                            a .update-decision.json file also lands here
  one of:
    --model <name>          Resolve UUID via GET /admin/models (requires
                            --api-key / REACTOR_API_KEY authorised to list)
    --model-id <uuid>       Model UUID on the coordinator

Optional:
  --release <semver>        Semver-prefix release selector; omit for latest
  --api-key <key>           Bearer token; falls back to REACTOR_API_KEY env
  --sdk-version <semver>    JS SDK pin for the generated package.json.
                            Defaults to the codegen's own defaultSdkVersion${
                              DEFAULT_SDK_VERSION
                                ? ` (currently ${DEFAULT_SDK_VERSION})`
                                : ""
                            }
  --package-name <name>     npm package name to diff against (defaults to
                            @reactor-models/<model>). Intended for tests;
                            production invocations should never set this.
  --react                   Emit the React bindings (Provider + hooks) in
                            src/react.ts alongside the plain-JS client, so
                            the scaffold the version decision is taken
                            against matches the package that downstream
                            pack/publish will ship.

Exit codes:
  0   success — decision written to <output>/.update-decision.json
  1   generic error (flag parse, network, malformed payload)
  2   npm has a higher version than the coordinator schema (regression);
      refusing to re-publish would be a silent downgrade
`);
  process.exit(1);
}

function parseUpdateArgs(argv: string[]): UpdateArgs {
  const args: Partial<UpdateArgs> = {
    sdkVersion: DEFAULT_SDK_VERSION,
    react: false,
  };

  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--coordinator-url":
        args.coordinatorUrl = argv[++i];
        break;
      case "--model":
        args.modelName = argv[++i];
        break;
      case "--model-id":
        args.modelId = argv[++i];
        break;
      case "--release":
        args.release = argv[++i];
        break;
      case "--api-key":
        args.apiKey = argv[++i];
        break;
      case "--sdk-version":
        args.sdkVersion = argv[++i];
        break;
      case "--output":
        args.output = argv[++i];
        break;
      case "--package-name":
        args.packageNameOverride = argv[++i];
        break;
      case "--react":
        args.react = true;
        break;
      case "--help":
      case "-h":
        updateUsage();
        break;
      default:
        console.error(`Unknown option: ${argv[i]}`);
        updateUsage();
    }
  }

  if (!args.coordinatorUrl) {
    console.error("Error: --coordinator-url is required for `update`.\n");
    updateUsage();
  }
  const hasModelId = !!args.modelId;
  const hasModelName = !!args.modelName;
  if (hasModelId && hasModelName) {
    console.error("Error: --model and --model-id are mutually exclusive.\n");
    updateUsage();
  }
  if (!hasModelId && !hasModelName) {
    console.error("Error: `update` requires --model or --model-id.\n");
    updateUsage();
  }
  if (!args.output) {
    console.error("Error: --output is required for `update`.\n");
    updateUsage();
  }
  if (!args.sdkVersion) {
    console.error("Error: --sdk-version is required (no committed default).\n");
    updateUsage();
  }

  if (!args.apiKey && process.env.REACTOR_API_KEY) {
    args.apiKey = process.env.REACTOR_API_KEY;
  }

  return args as UpdateArgs;
}

async function runUpdate(argv: string[]): Promise<void> {
  const args = parseUpdateArgs(argv);

  // Fetch + generate exactly as `generate --no-build` would. We reuse
  // `resolveSchema` so the two subcommands stay in lockstep on model
  // resolution + release picking.
  const { raw: rawSchema, resolvedModelId } = await resolveSchema(args);
  const schema = parseSchema(rawSchema);

  const pkg = generateModelSdk({
    modelName: schema.modelName,
    modelVersion: schema.modelVersion,
    sdkVersion: args.sdkVersion,
    schema,
    outputDir: args.output,
    react: args.react,
  });
  const outputDir = path.resolve(args.output);
  writePackage(pkg, outputDir);

  // Read the version straight out of the package.json we just wrote
  // — that's the canonical "what would we publish" string (already
  // semver-normalised by the emitter, e.g. v0.0.0 → 0.0.0).
  const generatedPkgJson = JSON.parse(
    fs.readFileSync(path.join(outputDir, "package.json"), "utf-8"),
  );
  const schemaVersion: string = generatedPkgJson.version;
  const packageName: string = args.packageNameOverride ?? generatedPkgJson.name;

  const displayId = args.modelId ?? resolvedModelId ?? "(unresolved)";
  const nameSuffix = args.modelName ? ` name="${args.modelName}"` : "";
  console.log(`@reactor-team/codegen update`);
  console.log(
    `  Schema:   ${args.coordinatorUrl} (model-id=${displayId}${nameSuffix})`,
  );
  console.log(`  Release:  ${args.release ?? "<latest>"}`);
  console.log(`  Package:  ${packageName}`);
  console.log(`  Target:   ${schemaVersion}`);
  if (args.react) {
    console.log(`  React:    on (provider + hooks in src/react.ts)`);
  }

  const npmVersion = await getPublishedNpmVersion(packageName);
  console.log(`  Npm:      ${npmVersion ?? "<not published>"}`);

  // `decideUpdate` throws `NpmRegressionError` when npm is ahead; the
  // top-level catch maps that to exit code 2 so the Buildkite step can
  // distinguish "refuse to regress" from other failures without parsing
  // stderr.
  const decision: UpdateDecision = decideUpdate(
    packageName,
    schemaVersion,
    npmVersion,
  );

  const decisionPath = path.join(outputDir, ".update-decision.json");
  fs.writeFileSync(
    decisionPath,
    JSON.stringify(decision, null, 2) + "\n",
    "utf-8",
  );

  console.log();
  if (decision.publishNeeded) {
    console.log(
      `→ publish required (${decision.reason}): ${packageName}@${decision.targetVersion}`,
    );
  } else {
    console.log(
      `→ up to date (${decision.reason}): ${packageName}@${decision.targetVersion}`,
    );
  }
  console.log(`  decision written to ${decisionPath}`);
}
