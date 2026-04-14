// Copyright (c) 2026 Reactor Technologies, Inc. All rights reserved.

import * as fs from "node:fs";
import * as path from "node:path";
import type { Capabilities, CodegenOptions, GeneratedPackage } from "./types.js";
import { resolveGenerator } from "./protocols/index.js";

export function generateModelSdk(options: CodegenOptions): GeneratedPackage {
  const generator = resolveGenerator(options.capabilities.protocol_version);
  return generator.generate(options);
}

export function writePackage(pkg: GeneratedPackage, outputDir: string): void {
  for (const file of pkg.files) {
    const filePath = path.join(outputDir, file.path);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, file.content, "utf-8");
  }
}

export function loadCapabilities(filePath: string): Capabilities {
  const raw = fs.readFileSync(filePath, "utf-8");
  const parsed = JSON.parse(raw);

  if (!parsed.protocol_version) {
    throw new Error(
      `Capabilities file is missing "protocol_version" field: ${filePath}`,
    );
  }

  return parsed as Capabilities;
}
