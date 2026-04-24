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

interface CliArgs {
  schema: string;
  sdkVersion: string;
  output: string;
  dryRun: boolean;
  build: boolean;
  standalone: boolean;
  react: boolean;
}

/**
 * Read `defaultSdkVersion` out of the codegen's own `package.json`. We
 * use this as the fallback for `--sdk-version` so CI pipelines (and the
 * typical developer run) don't have to pin a version manually — the
 * codegen itself ships with whatever the team has committed as the
 * current support target.
 *
 * Kept deliberately defensive: if the file or field ever disappears we
 * return `undefined` and let `parseArgs` surface a clear "missing
 * required arg" error, rather than silently generating a package
 * pointing at the wrong SDK major.
 */
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

function usage(): never {
  console.error(`
Usage: reactor-codegen [options]

Options:
  --schema <path>             Path to the model's OpenAPI schema JSON
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

function parseArgs(argv: string[]): CliArgs {
  const args: Partial<CliArgs> = {
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
        usage();
        break;
      default:
        console.error(`Unknown option: ${argv[i]}`);
        usage();
    }
  }

  // `sdkVersion` is optional on the CLI: if the user didn't pass one and
  // the codegen's package.json default is also missing, only then fail.
  // This keeps "no flag on the command line" the happy path for CI while
  // still catching a misconfigured install.
  if (!args.schema || !args.output || !args.sdkVersion) {
    console.error("Error: missing required arguments.\n");
    usage();
  }

  // Standalone output is a single source file — nothing to build.
  if (args.standalone) {
    args.build = false;
  }

  return args as CliArgs;
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
 * at the chosen basenames — see main().
 */
function resolveStandaloneReactPath(standaloneOutput: string): string {
  return standaloneOutput.replace(/\.ts$/, ".react.ts");
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  const rawSchema = loadSchema(args.schema);
  const schema = parseSchema(rawSchema);

  console.log(`@reactor-team/codegen`);
  console.log(`  Model:    ${schema.modelName}@${schema.modelVersion}`);
  console.log(`  SDK pin:  @reactor-team/js-sdk@^${args.sdkVersion}`);
  console.log(`  Schema:   ${args.schema}`);
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

main();
