// Copyright (c) 2026 Reactor Technologies, Inc. All rights reserved.

import type { ProtocolGenerator } from "../types.js";

const generators = new Map<string, ProtocolGenerator>();

export function registerProtocol(generator: ProtocolGenerator): void {
  if (generators.has(generator.protocolVersion)) {
    throw new Error(
      `Protocol generator already registered for version ${generator.protocolVersion}`,
    );
  }
  generators.set(generator.protocolVersion, generator);
}

/**
 * Resolve a generator for the given protocol version string.
 * Uses major-version matching: protocol_version "1.2" matches a generator
 * registered for "1". This lets us handle minor capability schema additions
 * without needing a new generator.
 */
export function resolveGenerator(protocolVersion: string): ProtocolGenerator {
  const exact = generators.get(protocolVersion);
  if (exact) return exact;

  const major = protocolVersion.split(".")[0];
  const byMajor = generators.get(major);
  if (byMajor) return byMajor;

  const available = Array.from(generators.keys()).join(", ");
  throw new Error(
    `No codegen generator for protocol version "${protocolVersion}". ` +
      `Available: [${available}]`,
  );
}

export function getRegisteredVersions(): string[] {
  return Array.from(generators.keys());
}
