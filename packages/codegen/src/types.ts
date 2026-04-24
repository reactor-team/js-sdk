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
  /**
   * When `true`, emit `src/react.ts` alongside `src/index.ts` with a
   * provider, a typed command hook, and one typed listener hook per
   * model message. `src/index.ts` re-exports everything from
   * `src/react.ts`, so consumers can `import { <Prefix>Provider,
   * use<Prefix> } from "@reactor-models/<name>"` — the split is a
   * source-layout concern only and the package exposes a single public
   * entry. The generated `package.json` grows a `react` peer
   * dependency and `src/index.ts` gains a top-level `"use client";`
   * directive so the bundled output is correctly marked as a
   * client-only module in React Server Components.
   *
   * When `false` (default), the output is framework-agnostic — no
   * React imports appear in the generated package.
   */
  react?: boolean;
}

export interface GeneratedFile {
  path: string;
  content: string;
}

export interface GeneratedPackage {
  files: GeneratedFile[];
}
