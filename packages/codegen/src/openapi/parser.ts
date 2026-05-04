// Copyright (c) 2026 Reactor Technologies, Inc. All rights reserved.

import * as fs from "node:fs";
import type {
  EventSchema,
  FieldSchema,
  MessageSchema,
  ModelSchema,
  TrackSchema,
} from "../types.js";
import type {
  OpenApiComponentSchemaObject,
  OpenApiSchema,
  OpenApiSchemaProperty,
} from "./types.js";

/**
 * Read an OpenAPI schema JSON file from disk and validate the top-level
 * shape. Throws if the file is missing the mandatory `openapi` field.
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

// ---------------------------------------------------------------------------
// Ingress validation.
//
// Every schema string that flows past this point will land verbatim in
// generated TypeScript — either as an identifier (via toPascalCase /
// toCamelCase in the emitter), as the discriminator of a TS string literal
// ("${name}"), or inside a JSDoc body. Without validation here, a schema
// fetched from the coordinator could inject arbitrary TS into the package
// that ultimately ships to npmjs.org.
//
// We deliberately constrain *names* (identifier-shaped tokens) and *enum
// members* (fixed set); free-form *descriptions* pass through unchanged
// because they can legitimately contain any prose, and the emitter is
// responsible for making them safe inside comment bodies.
// ---------------------------------------------------------------------------

/**
 * Model name — must double as both an npm package segment and (after
 * the emitter's PascalCase transform) a TS class prefix. npm package
 * names commonly use hyphens (`@reactor-models/my-cool-model`), so
 * model names are allowed `-` in addition to `_` here. The verifier
 * (`src/verifier.ts`) tightens this to a canonical form (no leading /
 * trailing / consecutive separators); this regex is the permissive
 * ingress check that still excludes the obvious injection characters
 * (quotes, slashes, whitespace, control chars, dots).
 */
const MODEL_NAME_RE = /^[a-z][a-z0-9_-]*$/;

/**
 * Token name (events, messages, tracks, fields). Must be a valid JS
 * identifier start char followed by identifier chars — snake_case,
 * camelCase, PascalCase all work. No hyphens, dots, or whitespace.
 *
 * Hyphens are deliberately disallowed for non-model names: events /
 * messages / tracks / fields all become JS identifiers (method names,
 * object-destructure keys) downstream, and `foo-bar` isn't a valid
 * identifier in either of those positions.
 */
const TOKEN_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * Permissive version check: anything the emitter's header formatter and
 * npm's strict semver would both accept, minus control characters and
 * quotes. We don't re-implement semver here — the `v` strip in the
 * emitter + npm's own validator catches malformed versions at publish
 * time; this is just a guard against shell/code-injection characters.
 */
const MODEL_VERSION_RE = /^[a-zA-Z0-9][a-zA-Z0-9.\-+_]*$/;

const TRACK_KINDS = new Set(["video", "audio"]);
const TRACK_DIRECTIONS = new Set(["in", "out"]);

function requireName(value: string, context: string, regex: RegExp): void {
  if (typeof value !== "string" || !regex.test(value)) {
    throw new Error(
      `Invalid ${context}: ${JSON.stringify(value)} — must match ${regex}`,
    );
  }
}

/**
 * Transform a raw OpenAPI schema into the normalised {@link ModelSchema}
 * IR. Resolves `$ref` pointers against `#/components/schemas/*`, extracts
 * events from `paths`, messages from `webhooks`, and tracks from the
 * `x-reactor` extension.
 *
 * The returned IR is what every downstream codegen stage (emitter, CLI,
 * tests) consumes — nothing else should touch the raw OpenAPI shape.
 *
 * Throws an `Error` with a pinpoint message on the first validation
 * failure so bad schemas fail loudly at ingress rather than producing
 * broken — or worse, attacker-controlled — TypeScript downstream.
 */
export function parseSchema(raw: OpenApiSchema): ModelSchema {
  // Top-level identity — must round-trip cleanly into an npm package name
  // (`@reactor-models/<title>`) and a TS class prefix (`<Title>Model`).
  requireName(raw.info?.title, "info.title (model name)", MODEL_NAME_RE);
  requireName(
    raw.info?.version,
    "info.version (model version)",
    MODEL_VERSION_RE,
  );
  const components = raw.components?.schemas ?? {};

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

  const events: EventSchema[] = [];
  for (const [pathKey, pathItem] of Object.entries(raw.paths ?? {})) {
    const op = pathItem.post;
    if (!op) continue;

    const name = op.operationId ?? pathKey.split("/").pop()!;
    requireName(name, `event name (path "${pathKey}")`, TOKEN_NAME_RE);

    const props =
      op.requestBody?.content["application/json"]?.schema?.properties ?? {};

    const fields: Record<string, FieldSchema> = {};
    for (const [fieldName, fieldDef] of Object.entries(props)) {
      requireName(fieldName, `field name on event "${name}"`, TOKEN_NAME_RE);
      fields[fieldName] = resolveProperty(fieldDef);
    }

    events.push({
      name,
      // Prefer `description` (full multi-paragraph docstring as emitted
      // by current Reactor runtimes) over `summary` (single-line, set by
      // legacy schemas and as a short title by current runtimes). When
      // both are present the runtime puts the first paragraph in
      // `summary` and the full text in `description`, so picking
      // `description` first gives the SDK the richest copy without
      // losing legacy schemas that only set `summary`.
      description: op.description ?? op.summary ?? "",
      fields,
    });
  }

  const messages: MessageSchema[] = [];
  for (const [hookName, hookItem] of Object.entries(raw.webhooks ?? {})) {
    const op = hookItem.post;
    if (!op) continue;

    const name = op.operationId ?? hookName;
    requireName(name, `message name (webhook "${hookName}")`, TOKEN_NAME_RE);

    const props =
      op.requestBody?.content["application/json"]?.schema?.properties ?? {};

    const fields: Record<string, FieldSchema> = {};
    for (const [fieldName, fieldDef] of Object.entries(props)) {
      requireName(fieldName, `field name on message "${name}"`, TOKEN_NAME_RE);
      fields[fieldName] = resolveProperty(fieldDef);
    }

    messages.push({
      name,
      // See the matching note on the events branch above — same
      // `description`-then-`summary` precedence so multi-paragraph
      // ModelMessage docstrings (REA-1801) reach the SDK in full while
      // legacy schemas that only set `summary` keep working.
      description: op.description ?? op.summary ?? "",
      fields,
    });
  }

  const tracks: TrackSchema[] = (raw["x-reactor"]?.tracks ?? []).map((t) => {
    requireName(t.name, `track name`, TOKEN_NAME_RE);
    // `kind` and `direction` are TS-typed as string unions, but at runtime
    // they come off a JSON blob with no enforcement, so the types don't
    // mean anything until we check here.
    if (!TRACK_KINDS.has(t.kind)) {
      throw new Error(
        `Invalid track "${t.name}" kind: ${JSON.stringify(t.kind)} — expected "video" or "audio"`,
      );
    }
    if (!TRACK_DIRECTIONS.has(t.direction)) {
      throw new Error(
        `Invalid track "${t.name}" direction: ${JSON.stringify(t.direction)} — expected "in" or "out"`,
      );
    }
    return { name: t.name, kind: t.kind, direction: t.direction };
  });

  return {
    modelName: raw.info.title,
    modelVersion: raw.info.version,
    events,
    messages,
    tracks,
  };
}
