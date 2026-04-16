// Copyright (c) 2026 Reactor Technologies, Inc. All rights reserved.

import * as fs from "node:fs";
import * as path from "node:path";
import type {
  CodegenOptions,
  EventSchema,
  FieldSchema,
  GeneratedPackage,
  MessageSchema,
  ModelSchema,
  OpenApiComponentSchemaObject,
  OpenApiSchema,
  OpenApiSchemaProperty,
  TrackSchema,
} from "./types.js";
import { generator } from "./openapi.js";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

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

/**
 * Load an OpenAPI schema file and normalise it into the internal ModelSchema IR
 * that the code generators consume.
 */
export function loadSchema(filePath: string): OpenApiSchema {
  const raw = fs.readFileSync(filePath, "utf-8");
  const parsed = JSON.parse(raw);

  if (!parsed.openapi) {
    throw new Error(
      `Schema file is missing "openapi" field — expected an OpenAPI 3.x document: ${filePath}`,
    );
  }

  return parsed as OpenApiSchema;
}

/**
 * Transform a raw OpenAPI schema into the normalised ModelSchema IR.
 * Resolves `$ref` pointers, extracts events from paths, messages from
 * webhooks, and tracks from the `x-reactor` extension.
 */
export function parseSchema(raw: OpenApiSchema): ModelSchema {
  const components = raw.components?.schemas ?? {};

  function resolveProperty(prop: OpenApiSchemaProperty): FieldSchema {
    if (prop.$ref) {
      const refName = prop.$ref.replace("#/components/schemas/", "");
      const resolved = components[refName];
      if (!resolved) {
        throw new Error(`Unresolved $ref: ${prop.$ref}`);
      }
      return refSchemaToFieldSchema(resolved, prop);
    }
    return {
      type: prop.type ?? "unknown",
      default: prop.default,
      description: prop.description,
      minimum: prop.minimum,
      maximum: prop.maximum,
      minLength: prop.minLength,
      maxLength: prop.maxLength,
      enum: prop.enum,
      format: prop.format,
    };
  }

  function refSchemaToFieldSchema(
    resolved: OpenApiComponentSchemaObject,
    original: OpenApiSchemaProperty,
  ): FieldSchema {
    return {
      type: resolved.type ?? "object",
      format: resolved.format,
      description: resolved.description ?? original.description,
      default: original.default,
    };
  }

  const events: EventSchema[] = [];
  for (const [pathKey, pathItem] of Object.entries(raw.paths ?? {})) {
    const op = pathItem.post;
    if (!op) continue;

    const name = op.operationId ?? pathKey.split("/").pop()!;
    const props =
      op.requestBody?.content["application/json"]?.schema?.properties ?? {};

    const fields: Record<string, FieldSchema> = {};
    for (const [fieldName, fieldDef] of Object.entries(props)) {
      fields[fieldName] = resolveProperty(fieldDef);
    }

    events.push({
      name,
      description: op.summary ?? op.description ?? "",
      fields,
    });
  }

  const messages: MessageSchema[] = [];
  for (const [hookName, hookItem] of Object.entries(raw.webhooks ?? {})) {
    const op = hookItem.post;
    if (!op) continue;

    const name = op.operationId ?? hookName;
    const props =
      op.requestBody?.content["application/json"]?.schema?.properties ?? {};

    const fields: Record<string, FieldSchema> = {};
    for (const [fieldName, fieldDef] of Object.entries(props)) {
      fields[fieldName] = resolveProperty(fieldDef);
    }

    messages.push({
      name,
      description: op.summary ?? op.description ?? "",
      fields,
    });
  }

  const tracks: TrackSchema[] = (raw["x-reactor"]?.tracks ?? []).map((t) => ({
    name: t.name,
    kind: t.kind,
    direction: t.direction,
  }));

  return {
    modelName: raw.info.title,
    modelVersion: raw.info.version,
    events,
    messages,
    tracks,
  };
}
