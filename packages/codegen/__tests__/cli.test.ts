// Copyright (c) 2026 Reactor Technologies, Inc. All rights reserved.

import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Helpers
//
// These tests exercise the CLI end-to-end as a black box: spawn the binary,
// check its exit status, and inspect its filesystem side-effects. They do
// NOT assert on stdout/stderr text — that output is for humans and we don't
// want a test suite that churns every time we tweak a log line.
// ---------------------------------------------------------------------------

const CLI_PATH = path.join(__dirname, "..", "src", "cli.ts");
const SCHEMA_PATH = path.join(__dirname, "..", "schema.json");
const FIXTURE_MODEL_ID = "7b3f1bc2-a4e5-4d78-b9c1-123456789abc";

function runCli(args: string[]): SpawnSyncReturns<string> {
  return spawnSync("pnpm", ["tsx", CLI_PATH, ...args], {
    encoding: "utf-8",
    env: { ...process.env, CI: "1" },
  });
}

// ---------------------------------------------------------------------------
// Arg parsing + error paths
// ---------------------------------------------------------------------------

describe("reactor-codegen CLI — argument validation", () => {
  it("exits non-zero when no arguments are given", () => {
    expect(runCli([]).status).not.toBe(0);
  });

  it("exits non-zero when only --schema is provided", () => {
    expect(runCli(["--schema", SCHEMA_PATH]).status).not.toBe(0);
  });

  it("exits non-zero on an unknown option", () => {
    expect(runCli(["--not-a-flag", "x"]).status).not.toBe(0);
  });

  it("exits non-zero on --help", () => {
    expect(runCli(["--help"]).status).not.toBe(0);
  });

  it("falls back to defaultSdkVersion in package.json when --sdk-version is omitted", () => {
    // The codegen's own package.json pins the team's current JS SDK support
    // target in `defaultSdkVersion`. A CI invocation that doesn't explicitly
    // pass `--sdk-version` should pick that up so periodic republish pipelines
    // don't have to re-specify it on every run. The emitted package.json's
    // `@reactor-team/js-sdk` dep is the observable proof that the default
    // flowed through.
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "codegen-cli-"));
    try {
      const result = runCli([
        "--schema",
        SCHEMA_PATH,
        "--output",
        path.join(outputDir, "example"),
        "--no-build",
      ]);

      expect(result.status).toBe(0);
      const pkgJson = JSON.parse(
        fs.readFileSync(
          path.join(outputDir, "example", "package.json"),
          "utf-8",
        ),
      );
      expect(pkgJson.dependencies["@reactor-team/js-sdk"]).toBe("^2.9.3");
    } finally {
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it("keeps `defaultSdkVersion` in lockstep with the runtime `@reactor-team/js-sdk` dep", () => {
    // The codegen reads `@reactor-team/js-sdk`'s d.ts at run time to
    // derive `RESERVED_CLASS_METHODS` + `RESERVED_HOOK_FIELDS`, and it
    // ALSO emits that same SDK version into every generated package's
    // `dependencies["@reactor-team/js-sdk"]` (via `defaultSdkVersion`).
    // Those two numbers MUST match — otherwise the d.ts the codegen
    // parses is for one SDK version while the consumer projects pin a
    // different one, and the generated typed surface drifts from the
    // actual SDK shape downstream packages compile against.
    //
    // To make a single one-line PR the way to bump the SDK target,
    // pin both knobs to the same number here. A version skew shows up
    // as a hard failure in CI rather than a silent drift.
    const pkgJsonPath = path.resolve(__dirname, "..", "package.json");
    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
    const defaultSdkVersion = pkgJson.defaultSdkVersion as string;
    const runtimeDep = pkgJson.dependencies["@reactor-team/js-sdk"] as string;

    // The runtime dep is a semver range (`^X.Y.Z`); strip the range
    // prefix and compare the underlying version.
    const runtimeVersion = runtimeDep.replace(/^[\^~]/, "");
    expect(runtimeVersion).toBe(defaultSdkVersion);
  });
});

// ---------------------------------------------------------------------------
// Dry run — happy path, writes nothing
// ---------------------------------------------------------------------------

describe("reactor-codegen CLI — --dry-run", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codegen-cli-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("exits 0 and writes nothing to disk", () => {
    const outputDir = path.join(tmpDir, "example");
    const result = runCli([
      "--schema",
      SCHEMA_PATH,
      "--sdk-version",
      "2.9.1",
      "--output",
      outputDir,
      "--dry-run",
    ]);

    expect(result.status).toBe(0);
    expect(fs.existsSync(outputDir)).toBe(false);
  });

  it("exits non-zero when the schema file does not exist", () => {
    const result = runCli([
      "--schema",
      path.join(tmpDir, "missing.json"),
      "--sdk-version",
      "2.9.1",
      "--output",
      path.join(tmpDir, "out"),
      "--dry-run",
    ]);

    expect(result.status).not.toBe(0);
  });
});

// ---------------------------------------------------------------------------
// No-build write — actually emits files to disk
// ---------------------------------------------------------------------------

describe("reactor-codegen CLI — --no-build write", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codegen-cli-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("writes the expected files and exits 0", () => {
    const outputDir = path.join(tmpDir, "example");
    const result = runCli([
      "--schema",
      SCHEMA_PATH,
      "--sdk-version",
      "2.9.1",
      "--output",
      outputDir,
      "--no-build",
    ]);

    expect(result.status).toBe(0);

    const expected = [
      "src/index.ts",
      "src/core.ts",
      "package.json",
      "tsup.config.ts",
      "tsconfig.json",
      "README.md",
    ];
    for (const rel of expected) {
      expect(fs.existsSync(path.join(outputDir, rel))).toBe(true);
    }

    // index.ts is the re-export hub.
    const idx = fs.readFileSync(path.join(outputDir, "src/index.ts"), "utf-8");
    expect(idx).toContain('export * from "./core.js";');

    // The generated class lives in src/core.ts — that's where the
    // `modelTracks` wiring lands. The fixture declares one track,
    // exercising the hasTracks branch.
    const core = fs.readFileSync(path.join(outputDir, "src/core.ts"), "utf-8");
    expect(core).toContain("modelTracks: [...ExampleTracks]");
    expect(core).toContain("ExampleTracks = [");
    expect(core).toContain('direction: "recvonly"');
  });
});

// ---------------------------------------------------------------------------
// --standalone — emit only the typed source file (drop-in use in existing
// projects). No package.json / tsup.config.ts / tsconfig.json.
// ---------------------------------------------------------------------------

describe("reactor-codegen CLI — --standalone", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codegen-cli-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("writes a single .ts file at the explicit --output file path", () => {
    const outputFile = path.join(tmpDir, "existing-project", "example.ts");
    const result = runCli([
      "--schema",
      SCHEMA_PATH,
      "--sdk-version",
      "2.9.1",
      "--output",
      outputFile,
      "--standalone",
    ]);

    expect(result.status).toBe(0);

    // Exactly the one .ts file, no package scaffold.
    expect(fs.existsSync(outputFile)).toBe(true);
    const siblings = fs.readdirSync(path.dirname(outputFile));
    expect(siblings).toEqual(["example.ts"]);

    const src = fs.readFileSync(outputFile, "utf-8");
    expect(src).toContain("import { Reactor");
    expect(src).toContain("export class ExampleModel");
    expect(src).toContain("modelTracks: [...ExampleTracks]");
    // Source must be identical to what the full-package mode would emit —
    // standalone must never diverge from the package scaffold's src/index.ts.
    expect(src).toContain(
      "// Auto-generated by @reactor-team/codegen — DO NOT EDIT",
    );
  });

  it("treats a non-.ts --output as a directory and writes index.ts inside it", () => {
    const outputDir = path.join(tmpDir, "src");
    const result = runCli([
      "--schema",
      SCHEMA_PATH,
      "--sdk-version",
      "2.9.1",
      "--output",
      outputDir,
      "--standalone",
    ]);

    expect(result.status).toBe(0);
    const expectedFile = path.join(outputDir, "index.ts");
    expect(fs.existsSync(expectedFile)).toBe(true);
    expect(fs.readdirSync(outputDir)).toEqual(["index.ts"]);
  });

  it("in --dry-run writes nothing and exits 0", () => {
    const outputFile = path.join(tmpDir, "example.ts");
    const result = runCli([
      "--schema",
      SCHEMA_PATH,
      "--sdk-version",
      "2.9.1",
      "--output",
      outputFile,
      "--standalone",
      "--dry-run",
    ]);

    expect(result.status).toBe(0);
    expect(fs.existsSync(outputFile)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// --react — emit provider + hooks (full-package mode)
// ---------------------------------------------------------------------------

describe("reactor-codegen CLI — --react (full package)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codegen-cli-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("emits src/react.tsx + src/core.ts + src/index.ts with /core and /react subpath exports", () => {
    const outputDir = path.join(tmpDir, "example");
    const result = runCli([
      "--schema",
      SCHEMA_PATH,
      "--sdk-version",
      "2.9.1",
      "--output",
      outputDir,
      "--no-build",
      "--react",
    ]);

    expect(result.status).toBe(0);

    for (const rel of [
      "src/index.ts",
      "src/core.ts",
      "src/react.tsx",
      "package.json",
      "tsup.config.ts",
      "tsconfig.json",
      "README.md",
    ]) {
      expect(fs.existsSync(path.join(outputDir, rel))).toBe(true);
    }

    const index = fs.readFileSync(
      path.join(outputDir, "src/index.ts"),
      "utf-8",
    );
    const core = fs.readFileSync(path.join(outputDir, "src/core.ts"), "utf-8");
    const react = fs.readFileSync(
      path.join(outputDir, "src/react.tsx"),
      "utf-8",
    );
    // index.ts is the re-export hub: NO use-client (that's scoped to
    // the react file only) and NO declarations of its own.
    expect(index).not.toContain('"use client";');
    expect(index).toContain('export * from "./core.js";');
    expect(index).toContain('export * from "./react.js";');
    expect(index).not.toContain("export function ExampleProvider(");
    expect(index).not.toContain("export class ExampleModel");
    // Class lives in core.ts; no React imports here.
    expect(core).toContain("export class ExampleModel");
    expect(core).not.toContain('"use client";');
    expect(core).not.toContain('from "react"');
    // React file: use-client + JSX + back-import from ./core.js.
    expect(react).toContain('"use client";');
    expect(react).toContain("export function ExampleProvider(");
    expect(react).toContain("export function useExample()");
    expect(react).toContain("export function useExampleMessage(");
    expect(react).toContain('from "./core.js"');

    const pkgJson = JSON.parse(
      fs.readFileSync(path.join(outputDir, "package.json"), "utf-8"),
    );
    expect(Object.keys(pkgJson.exports).sort()).toEqual([
      ".",
      "./core",
      "./react",
    ]);
    expect(pkgJson.peerDependencies).toEqual({ react: ">=18" });

    const tsup = fs.readFileSync(
      path.join(outputDir, "tsup.config.ts"),
      "utf-8",
    );
    expect(tsup).toContain(
      'entry: ["src/index.ts", "src/core.ts", "src/react.tsx"]',
    );

    const tsconfig = JSON.parse(
      fs.readFileSync(path.join(outputDir, "tsconfig.json"), "utf-8"),
    );
    expect(tsconfig.compilerOptions.jsx).toBe("react-jsx");
  });

  it("--dry-run exits 0 and writes nothing", () => {
    const outputDir = path.join(tmpDir, "example");
    const result = runCli([
      "--schema",
      SCHEMA_PATH,
      "--sdk-version",
      "2.9.1",
      "--output",
      outputDir,
      "--react",
      "--dry-run",
    ]);

    expect(result.status).toBe(0);
    expect(fs.existsSync(outputDir)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// --standalone + --react — sibling .react.ts file + re-export in the main file
// ---------------------------------------------------------------------------

describe("reactor-codegen CLI — --standalone --react", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codegen-cli-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("writes <base>.ts (core) + <base>.react.tsx with cross-imports rewired", () => {
    const outputFile = path.join(tmpDir, "src", "example.ts");
    const reactFile = path.join(tmpDir, "src", "example.react.tsx");
    const result = runCli([
      "--schema",
      SCHEMA_PATH,
      "--sdk-version",
      "2.9.1",
      "--output",
      outputFile,
      "--standalone",
      "--react",
    ]);

    expect(result.status).toBe(0);

    expect(fs.existsSync(outputFile)).toBe(true);
    expect(fs.existsSync(reactFile)).toBe(true);
    expect(fs.readdirSync(path.dirname(outputFile)).sort()).toEqual([
      "example.react.tsx",
      "example.ts",
    ]);

    const main = fs.readFileSync(outputFile, "utf-8");
    const react = fs.readFileSync(reactFile, "utf-8");

    // Main file is the core content verbatim — no use-client (that's
    // scoped to the React file), no Provider, just the class + types.
    expect(main).not.toContain('"use client";');
    expect(main).toContain("export class ExampleModel");
    expect(main).not.toContain("export function ExampleProvider(");
    // No re-export hub in standalone mode — there's no separate
    // core/index split, so nothing to re-export from.
    expect(main).not.toContain('export * from "./');

    // React file: imports back from the chosen main basename, without
    // the `.js` extension so the consumer's bundler resolves the
    // sibling `.ts` regardless of moduleResolution setting.
    expect(react).toContain('"use client";');
    expect(react).toContain('from "./example"');
    expect(react).not.toContain('from "./example.js"');
    expect(react).not.toContain('from "./core.js"');
    expect(react).not.toContain('from "./index.js"');
    expect(react).toContain("export function ExampleProvider(");
    expect(react).toContain("export function useExample()");
  });

  it("with --output as a directory, writes index.ts + index.react.tsx", () => {
    const outputDir = path.join(tmpDir, "src");
    const result = runCli([
      "--schema",
      SCHEMA_PATH,
      "--sdk-version",
      "2.9.1",
      "--output",
      outputDir,
      "--standalone",
      "--react",
    ]);

    expect(result.status).toBe(0);
    expect(fs.readdirSync(outputDir).sort()).toEqual([
      "index.react.tsx",
      "index.ts",
    ]);
    const main = fs.readFileSync(path.join(outputDir, "index.ts"), "utf-8");
    const react = fs.readFileSync(
      path.join(outputDir, "index.react.tsx"),
      "utf-8",
    );
    // Main file is the core content (no re-export hub in standalone
    // mode). React file's back-import points at the main basename
    // (`./index`), with the `.js` extension stripped so the
    // consumer's bundler resolves the `.ts` source regardless of
    // moduleResolution setting.
    expect(main).not.toContain('export * from "./');
    expect(main).toContain("export class ExampleModel");
    expect(react).toContain('from "./index"');
    expect(react).not.toContain('from "./index.js"');
    expect(react).not.toContain('from "./core.js"');
  });

  it("in --dry-run writes nothing and exits 0", () => {
    const outputFile = path.join(tmpDir, "example.ts");
    const result = runCli([
      "--schema",
      SCHEMA_PATH,
      "--sdk-version",
      "2.9.1",
      "--output",
      outputFile,
      "--standalone",
      "--react",
      "--dry-run",
    ]);

    expect(result.status).toBe(0);
    expect(fs.existsSync(outputFile)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// --coordinator-url — argument validation (no network).
//
// End-to-end coordinator→CLI→emitter coverage deliberately lives in
// `coordinator.test.ts` (fetch stubbed in-process, no subprocess spawn).
// CLI-level tests here only assert that the new flags parse, fail fast on
// the mutually-exclusive / missing-required cases, and route through to
// the fetcher — keeping the suite fast and sidestepping the cost of
// spawning `pnpm tsx` per test against a loopback HTTP server.
// ---------------------------------------------------------------------------

describe("reactor-codegen CLI — coordinator-mode argument validation", () => {
  it("rejects --schema and --coordinator-url together", () => {
    const result = runCli([
      "--schema",
      SCHEMA_PATH,
      "--coordinator-url",
      "https://api.example.com",
      "--model-id",
      FIXTURE_MODEL_ID,
      "--sdk-version",
      "2.9.1",
      "--output",
      "ignored",
      "--dry-run",
    ]);

    expect(result.status).not.toBe(0);
  });

  it("rejects --coordinator-url without --model or --model-id", () => {
    const result = runCli([
      "--coordinator-url",
      "https://api.example.com",
      "--sdk-version",
      "2.9.1",
      "--output",
      "ignored",
      "--dry-run",
    ]);

    expect(result.status).not.toBe(0);
  });

  it("rejects --model and --model-id together", () => {
    // Exactly one must identify the model; supporting both at once would
    // make it ambiguous which wins on a typo.
    const result = runCli([
      "--coordinator-url",
      "https://api.example.com",
      "--model",
      "helios",
      "--model-id",
      FIXTURE_MODEL_ID,
      "--release",
      "v1.0.5",
      "--output",
      "ignored",
      "--dry-run",
    ]);

    expect(result.status).not.toBe(0);
  });

  it("rejects --coordinator-url with neither --model nor --model-id", () => {
    const result = runCli([
      "--coordinator-url",
      "https://api.example.com",
      "--output",
      "ignored",
      "--dry-run",
    ]);

    expect(result.status).not.toBe(0);
  });

  it("rejects a clearly-malformed --model-id before touching the network", () => {
    // `fetchSchema`'s pre-IO guard should short-circuit here so the CLI
    // never attempts a request against a broken ID.
    const result = runCli([
      "--coordinator-url",
      "https://api.example.com",
      "--model-id",
      "has/slash",
      "--release",
      "v1.0.5",
      "--sdk-version",
      "2.9.1",
      "--output",
      "ignored",
      "--dry-run",
    ]);

    expect(result.status).not.toBe(0);
  });
});
