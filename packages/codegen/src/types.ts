// Copyright (c) 2026 Reactor Technologies, Inc. All rights reserved.

/**
 * Canonical representation of a model's capabilities as extracted by
 * `reactor capabilities`. This is the input to the codegen pipeline.
 *
 * The shape is protocol-version-dependent — v1 uses "commands", a future v2
 * might rename that to "events". The codegen dispatches to the correct
 * generator based on `protocol_version`.
 */

export interface FieldSchema {
  type: string;
  default?: unknown;
  description?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  enum?: (string | number | boolean)[];
  format?: string;
}

export interface CommandCapability {
  name: string;
  description: string;
  schema: Record<string, FieldSchema>;
}

export interface MessageCapability {
  name: string;
  schema: Record<string, FieldSchema>;
}

export interface TrackCapability {
  name: string;
  kind: "video" | "audio";
  direction: "recvonly" | "sendonly";
}

export interface Capabilities {
  protocol_version: string;
  tracks: TrackCapability[];
  commands?: CommandCapability[];
  messages?: MessageCapability[];
  emission_fps?: number | null;
}

export interface CodegenOptions {
  modelName: string;
  modelVersion: string;
  sdkVersion: string;
  capabilities: Capabilities;
  outputDir: string;
}

/**
 * A protocol generator produces all the TypeScript source for a given
 * capabilities schema version. New protocol versions add a new generator
 * implementation without touching old ones.
 */
export interface ProtocolGenerator {
  readonly protocolVersion: string;
  generate(options: CodegenOptions): GeneratedPackage;
}

export interface GeneratedFile {
  path: string;
  content: string;
}

export interface GeneratedPackage {
  files: GeneratedFile[];
}
