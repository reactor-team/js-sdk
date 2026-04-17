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
      expect(pkgJson.dependencies["@reactor-team/js-sdk"]).toBe("^2.9.1");
    } finally {
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
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
      "package.json",
      "tsup.config.ts",
      "tsconfig.json",
      "README.md",
    ];
    for (const rel of expected) {
      expect(fs.existsSync(path.join(outputDir, rel))).toBe(true);
    }

    // The generated client must wire `modelTracks` (the committed dummy
    // fixture declares one track) — this is the user-visible contract for PR 4.
    const src = fs.readFileSync(path.join(outputDir, "src/index.ts"), "utf-8");
    expect(src).toContain("modelTracks: [...ExampleTracks]");
    expect(src).toContain("ExampleTracks = [");
    expect(src).toContain('direction: "recvonly"');
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

  it("emits src/react.ts, re-exports it from src/index.ts, and keeps one root export", () => {
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
      "src/react.ts",
      "package.json",
      "tsup.config.ts",
      "tsconfig.json",
      "README.md",
    ]) {
      expect(fs.existsSync(path.join(outputDir, rel))).toBe(true);
    }

    // Provider + hooks live in src/react.ts (not duplicated in
    // src/index.ts), and src/index.ts re-exports them so the public
    // surface is a single root import.
    const index = fs.readFileSync(
      path.join(outputDir, "src/index.ts"),
      "utf-8",
    );
    const react = fs.readFileSync(
      path.join(outputDir, "src/react.ts"),
      "utf-8",
    );
    expect(index).toContain('"use client";');
    expect(index).toContain('export * from "./react.js";');
    expect(index).not.toContain("export function ExampleProvider(");
    expect(react).toContain("export function ExampleProvider(");
    expect(react).toContain("export function useExample()");
    expect(react).toContain("export function useExampleMessage(");

    const pkgJson = JSON.parse(
      fs.readFileSync(path.join(outputDir, "package.json"), "utf-8"),
    );
    // Exactly one export path — no `./react` subpath, ever.
    expect(Object.keys(pkgJson.exports)).toEqual(["."]);
    expect(pkgJson.peerDependencies).toEqual({ react: ">=18" });

    const tsup = fs.readFileSync(
      path.join(outputDir, "tsup.config.ts"),
      "utf-8",
    );
    expect(tsup).toContain('entry: ["src/index.ts"]');
    expect(tsup).not.toContain("src/react.ts");
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

  it("writes <base>.ts + <base>.react.ts and wires up the cross-imports", () => {
    const outputFile = path.join(tmpDir, "src", "example.ts");
    const reactFile = path.join(tmpDir, "src", "example.react.ts");
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
      "example.react.ts",
      "example.ts",
    ]);

    const main = fs.readFileSync(outputFile, "utf-8");
    const react = fs.readFileSync(reactFile, "utf-8");

    // Main file: re-export points at the chosen sibling basename, not
    // the full-package default `./react.js`.
    expect(main).toContain('"use client";');
    expect(main).toContain('export * from "./example.react.js";');
    expect(main).not.toContain('export * from "./react.js";');
    // Main file still has the plain-JS surface.
    expect(main).toContain("export class ExampleModel");
    expect(main).not.toContain("export function ExampleProvider(");

    // React file: imports back from the chosen main basename.
    expect(react).toContain('from "./example.js"');
    expect(react).not.toContain('from "./index.js"');
    expect(react).toContain("export function ExampleProvider(");
    expect(react).toContain("export function useExample()");
  });

  it("with --output as a directory, writes index.ts + index.react.ts", () => {
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
      "index.react.ts",
      "index.ts",
    ]);
    const main = fs.readFileSync(path.join(outputDir, "index.ts"), "utf-8");
    const react = fs.readFileSync(
      path.join(outputDir, "index.react.ts"),
      "utf-8",
    );
    // Main basename is still `index`, so the React file's back-import
    // (`./index.js`) passes through unchanged. The sibling basename is
    // `index.react`, so the main file's re-export gets rewritten from
    // the emitter default `./react.js` to `./index.react.js`.
    expect(main).toContain('export * from "./index.react.js";');
    expect(react).toContain('from "./index.js"');
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
