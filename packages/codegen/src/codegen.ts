// Copyright (c) 2026 Reactor Technologies, Inc. All rights reserved.

import * as fs from "node:fs";
import * as path from "node:path";
import type { CodegenOptions, GeneratedPackage } from "./types.js";
import { generator } from "./emitter.js";
import { verifySchema } from "./verifier.js";

export { loadSchema, parseSchema } from "./openapi/index.js";

/**
 * Produce the in-memory representation of a generated model SDK package.
 * Pure: no I/O, no network, deterministic.
 *
 * Runs {@link verifySchema} on `options.schema` first as a security gate
 * — every name landing in the emitted package must be strict snake_case,
 * must not collide with the JS prototype chain or the class/hook
 * scaffold, and the cross-namespace surface (class methods / types /
 * React hooks) must not have duplicates. A verification failure throws
 * {@link CodegenVerificationError} with the full list of problems
 * batched into one message rather than trickling them out one rebuild
 * at a time.
 *
 * Description text on every event / message / field is sanitised
 * (control chars stripped, JSDoc terminator neutralised) before
 * reaching the emitter; the input `options.schema` is never mutated.
 */
export function generateModelSdk(options: CodegenOptions): GeneratedPackage {
  const verifiedSchema = verifySchema(options.schema);
  return generator.generate({ ...options, schema: verifiedSchema });
}

/**
 * Write a {@link GeneratedPackage} to disk under `outputDir`. Missing
 * parent directories are created as needed. Existing files with the
 * same path are overwritten.
 */
export function writePackage(pkg: GeneratedPackage, outputDir: string): void {
  for (const file of pkg.files) {
    const filePath = path.join(outputDir, file.path);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, file.content, "utf-8");
  }
}
