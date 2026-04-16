// Copyright (c) 2026 Reactor Technologies, Inc. All rights reserved.

import * as fs from "node:fs";
import * as path from "node:path";
import type { CodegenOptions, GeneratedPackage } from "./types.js";
import { generator } from "./emitter.js";

export { loadSchema, parseSchema } from "./openapi/index.js";

export function generateModelSdk(options: CodegenOptions): GeneratedPackage {
  return generator.generate(options);
}

export function writePackage(pkg: GeneratedPackage, outputDir: string): void {
  for (const file of pkg.files) {
    const filePath = path.join(outputDir, file.path);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, file.content, "utf-8");
  }
}
