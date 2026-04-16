// Copyright (c) 2026 Reactor Technologies, Inc. All rights reserved.

import * as path from "node:path";
import { execSync } from "node:child_process";
import { loadSchema, parseSchema, generateModelSdk, writePackage } from "./codegen.js";

interface CliArgs {
  schema: string;
  sdkVersion: string;
  output: string;
  dryRun: boolean;
  build: boolean;
}

function usage(): never {
  console.error(`
Usage: reactor-codegen [options]

Options:
  --schema <path>             Path to the model's OpenAPI schema JSON
  --sdk-version <semver>      JS SDK version to pin as a dependency
  --output <dir>              Output directory for the generated package
  --dry-run                   Print generated files without writing to disk
  --no-build                  Skip the build step (just generate source)
`);
  process.exit(1);
}

function parseArgs(argv: string[]): CliArgs {
  const args: Partial<CliArgs> = { dryRun: false, build: true };

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
      case "--help":
      case "-h":
        usage();
        break;
      default:
        console.error(`Unknown option: ${argv[i]}`);
        usage();
    }
  }

  if (!args.schema || !args.sdkVersion || !args.output) {
    console.error("Error: missing required arguments.\n");
    usage();
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

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  const rawSchema = loadSchema(args.schema);
  const schema = parseSchema(rawSchema);

  console.log(`@reactor-team/codegen`);
  console.log(`  Model:    ${schema.modelName}@${schema.modelVersion}`);
  console.log(`  SDK pin:  @reactor-team/js-sdk@^${args.sdkVersion}`);
  console.log(`  Schema:   ${args.schema}`);
  console.log(`  Output:   ${args.output}`);
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
  });

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
