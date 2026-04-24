// Copyright (c) 2026 Reactor Technologies, Inc. All rights reserved.

// ---------------------------------------------------------------------------
// Internal IR — the normalised representation the emitter consumes.
// Decoupled from the raw OpenAPI shape so the emitter never parses OpenAPI.
// ---------------------------------------------------------------------------

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

export interface EventSchema {
  name: string;
  description: string;
  fields: Record<string, FieldSchema>;
}

export interface MessageSchema {
  name: string;
  description: string;
  fields: Record<string, FieldSchema>;
}

export interface TrackSchema {
  name: string;
  kind: "video" | "audio";
  direction: "in" | "out";
}

export interface ModelSchema {
  modelName: string;
  modelVersion: string;
  events: EventSchema[];
  messages: MessageSchema[];
  tracks: TrackSchema[];
}

// ---------------------------------------------------------------------------
// Codegen pipeline types
// ---------------------------------------------------------------------------

export interface CodegenOptions {
  modelName: string;
  modelVersion: string;
  sdkVersion: string;
  schema: ModelSchema;
  outputDir: string;
}

export interface GeneratedFile {
  path: string;
  content: string;
}

export interface GeneratedPackage {
  files: GeneratedFile[];
}
