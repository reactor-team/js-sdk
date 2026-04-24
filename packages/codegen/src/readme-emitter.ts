// Copyright (c) 2026 Reactor Technologies, Inc. All rights reserved.

// ---------------------------------------------------------------------------
// README emitter — schema-driven model documentation in the same shape the
// webapp's model-detail page renders.
//
// Kept as a separate module from the TypeScript emitter because:
//   - They emit different languages (markdown vs TS) with different escape
//     rules, and the combined file was creeping past 1500 lines.
//   - README snippet logic mirrors `reactor-webapp/lib/model-api-doc.ts`;
//     isolating it here makes the structural-lockstep relationship easier
//     to audit and keep in sync.
//   - Shared helpers (`toPascalCase`, `fieldSchemaToTsType`,
//     `hasUploadRefParam`, `isUploadReference`, `formatVersionForHeader`)
//     are imported from `./emitter`, so the split costs one import seam
//     and buys a focused ~400-line file dedicated to README output.
//
// Scope is JavaScript + React only, per docs requirements.
// ---------------------------------------------------------------------------

import * as fs from "node:fs";
import * as path from "node:path";
import type {
  CodegenOptions,
  EventSchema,
  FieldSchema,
  MessageSchema,
  TrackSchema,
} from "./types.js";
import {
  fieldSchemaToTsType,
  formatVersionForHeader,
  hasUploadRefParam,
  isUploadReference,
  toCamelCase,
  toPascalCase,
} from "./emitter.js";

// ---------------------------------------------------------------------------
// Template loading + placeholder substitution.
// ---------------------------------------------------------------------------

/**
 * Locate and read the README template from disk. The template lives at
 * `<package>/templates/readme.md` in both the source tree (dev) and the
 * published package (`files: ["dist", "README.md", "templates"]`), so a
 * single `path.resolve(__dirname, "..", "templates/readme.md")` works
 * across `tsx` dev runs, `vitest`, and installed consumers.
 *
 * Cached in a module-level variable so repeated `generateModelSdk` calls
 * in the same process don't re-read the file.
 */
let cachedReadmeTemplate: string | null = null;
function loadReadmeTemplate(): string {
  if (cachedReadmeTemplate !== null) return cachedReadmeTemplate;
  const templatePath = path.resolve(__dirname, "..", "templates/readme.md");
  cachedReadmeTemplate = fs.readFileSync(templatePath, "utf-8");
  return cachedReadmeTemplate;
}

/**
 * Substitute `{{IDENTIFIER}}` tokens in the template. The regex matches
 * ASCII uppercase/underscore tokens only, so JSX object literals in the
 * template (`style={{ color: "red" }}`) are left untouched. Missing
 * placeholder values throw rather than producing literal `{{X}}` in the
 * output — a silent miss is worse than a loud emitter failure at build
 * time.
 */
function renderTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (_match, key: string) => {
    if (!(key in vars)) {
      throw new Error(`Unknown README placeholder {{${key}}}`);
    }
    return vars[key];
  });
}

// ---------------------------------------------------------------------------
// Small markdown helpers kept local to the README emitter so they don't
// leak into the main TS-emission surface, where the conventions differ.
// ---------------------------------------------------------------------------

function describeFieldType(field: FieldSchema): string {
  return fieldSchemaToTsType(field);
}

function fieldConstraintNotes(field: FieldSchema): string[] {
  const out: string[] = [];
  if (field.minimum !== undefined) out.push(`min ${field.minimum}`);
  if (field.maximum !== undefined) out.push(`max ${field.maximum}`);
  if (field.minLength !== undefined) out.push(`minLength ${field.minLength}`);
  if (field.maxLength !== undefined) out.push(`maxLength ${field.maxLength}`);
  if (field.default !== undefined) {
    out.push(`default \`${JSON.stringify(field.default)}\``);
  }
  return out;
}

function mdEscape(text: string): string {
  // Minimal escape for cell text inside a GFM table: only `|` and
  // literal newlines need neutralising. Everything else passes through.
  return text.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function mdBacktickedCrossLinks(
  text: string,
  anchors: Record<string, string>,
): string {
  // Turn `\`token\`` into a markdown cross-link when `token` is a
  // known event/message name; leave it as inline code otherwise. The
  // regex is strict so an accidental template-string backtick in a
  // description stays untouched.
  if (!text) return "";
  return text.replace(/`([a-zA-Z_][a-zA-Z0-9_]*)`/g, (match, token) => {
    const href = anchors[token];
    return href ? `[\`${token}\`](${href})` : match;
  });
}

function mdFieldTable(
  fields: [string, FieldSchema][],
  kind: "param" | "field",
  anchors: Record<string, string>,
): string {
  if (fields.length === 0) {
    return kind === "param" ? "_No parameters._\n" : "_No fields._\n";
  }
  const headerLabel = kind === "param" ? "Parameter" : "Field";
  const lines: string[] = [];
  if (kind === "param") {
    lines.push(`| ${headerLabel} | Type | Required | Description |`);
    lines.push(`|---|---|---|---|`);
  } else {
    lines.push(`| ${headerLabel} | Type | Description |`);
    lines.push(`|---|---|---|`);
  }
  for (const [name, field] of fields) {
    // Enum field types render as `"a" | "b" | "c"` which contains
    // literal pipes — those terminate the GFM table cell unless we
    // backslash-escape them, even inside a code span (GFM recognises
    // `\|` within ``…`` for tables specifically). `mdEscape` does the
    // right thing for every schema-derived type string, including
    // non-union ones that pass through untouched.
    const type = "`" + mdEscape(describeFieldType(field)) + "`";
    const required = field.default === undefined ? "✅" : "";
    const descParts: string[] = [];
    if (field.description) {
      descParts.push(mdBacktickedCrossLinks(field.description, anchors));
    }
    const constraints = fieldConstraintNotes(field);
    if (constraints.length > 0) {
      descParts.push(`_(${constraints.join(", ")})_`);
    }
    const description = mdEscape(descParts.join(" ") || "—");
    if (kind === "param") {
      lines.push(`| \`${name}\` | ${type} | ${required} | ${description} |`);
    } else {
      lines.push(`| \`${name}\` | ${type} | ${description} |`);
    }
  }
  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// Snippet synthesis — JS + React variants per event / message.
//
// Mirrors the logic in reactor-webapp/lib/model-api-doc.ts; we keep the
// two in structural lockstep so the README and the in-app docs stay
// byte-for-byte equivalent. If the webapp's snippet rules ever change,
// they should change here in the same commit.
// ---------------------------------------------------------------------------

/** Whether a default value is too empty to be illustrative in an example. */
function isTrivialDefault(v: unknown): boolean {
  return v === undefined || v === null || v === "" || v === 0;
}

function sampleValueJs(field: FieldSchema, fieldName: string): string {
  if (isUploadReference(field)) return "fileRef";
  if (field.enum && field.enum.length > 0) {
    const v = field.enum[0];
    return typeof v === "string" ? JSON.stringify(v) : String(v);
  }
  if (field.default !== undefined && !isTrivialDefault(field.default)) {
    return JSON.stringify(field.default);
  }
  switch (field.type) {
    case "string":
      if (fieldName === "prompt") return '"A sunset over the ocean"';
      return '""';
    case "integer":
    case "number":
      return field.minimum !== undefined ? String(field.minimum) : "0";
    case "boolean":
      return "true";
    default:
      return "null";
  }
}

/** Strictly required fields: no `default` declared. */
function strictlyRequiredFields(event: EventSchema): [string, FieldSchema][] {
  return Object.entries(event.fields).filter(
    ([, f]) => f.default === undefined,
  );
}

/**
 * Fields to show populated in a code example. Strictly-required fields
 * always appear; if none are required we pick one illustrative field so
 * the snippet reads as `setPrompt({ prompt: "…" })` rather than a
 * useless `setPrompt({})`.
 */
function exampleFields(event: EventSchema): [string, FieldSchema][] {
  const entries = Object.entries(event.fields);
  const required = strictlyRequiredFields(event);
  if (required.length > 0) return required;
  const firstNonUpload = entries.find(([, f]) => !isUploadReference(f));
  return firstNonUpload ? [firstNonUpload] : [];
}

function readmeEventJsSnippet(
  event: EventSchema,
  modelName: string,
  modelPrefix: string,
  packageName: string,
): string {
  const method = toCamelCase(event.name);
  const hasFields = Object.keys(event.fields).length > 0;
  const example = exampleFields(event);

  const lines: string[] = [];
  lines.push(
    `import { ${modelPrefix}Model } from ${JSON.stringify(packageName)};`,
  );
  lines.push("");
  lines.push(`const ${modelName} = new ${modelPrefix}Model();`);
  lines.push(`await ${modelName}.connect(jwt);`);
  lines.push("");

  if (hasUploadRefParam(event)) {
    const uploadField = Object.entries(event.fields).find(([, f]) =>
      isUploadReference(f),
    )!;
    const additionalRequired = strictlyRequiredFields(event).filter(
      ([name, f]) => name !== uploadField[0] && !isUploadReference(f),
    );
    lines.push(`const fileRef = await ${modelName}.uploadFile(blob);`);
    const argParts = [`${uploadField[0]}: fileRef`].concat(
      additionalRequired.map(
        ([name, f]) => `${name}: ${sampleValueJs(f, name)}`,
      ),
    );
    lines.push(`await ${modelName}.${method}({ ${argParts.join(", ")} });`);
  } else if (!hasFields || example.length === 0) {
    lines.push(`await ${modelName}.${method}(${hasFields ? "{}" : ""});`);
  } else {
    const argParts = example.map(
      ([name, f]) => `${name}: ${sampleValueJs(f, name)}`,
    );
    lines.push(`await ${modelName}.${method}({ ${argParts.join(", ")} });`);
  }

  return lines.join("\n");
}

function readmeEventReactSnippet(
  event: EventSchema,
  modelPrefix: string,
  packageName: string,
): string {
  const method = toCamelCase(event.name);
  const hasFields = Object.keys(event.fields).length > 0;
  const example = exampleFields(event);
  const destructured = hasUploadRefParam(event)
    ? `{ ${method}, uploadFile }`
    : `{ ${method} }`;

  const lines: string[] = [];
  lines.push(`"use client";`);
  lines.push(`import { use${modelPrefix} } from "${packageName}";`);
  lines.push("");
  lines.push(`function Example() {`);
  lines.push(`  const ${destructured} = use${modelPrefix}();`);
  if (hasUploadRefParam(event)) {
    const uploadField = Object.entries(event.fields).find(([, f]) =>
      isUploadReference(f),
    )!;
    const additionalRequired = strictlyRequiredFields(event).filter(
      ([name, f]) => name !== uploadField[0] && !isUploadReference(f),
    );
    lines.push("");
    lines.push(`  async function handlePick(file: File) {`);
    lines.push(`    const ref = await uploadFile(file);`);
    const argParts = [`${uploadField[0]}: ref`].concat(
      additionalRequired.map(
        ([name, f]) => `${name}: ${sampleValueJs(f, name)}`,
      ),
    );
    lines.push(`    await ${method}({ ${argParts.join(", ")} });`);
    lines.push(`  }`);
    lines.push("");
    lines.push(
      `  return <input type="file" onChange={(e) => handlePick(e.target.files![0])} />;`,
    );
  } else if (!hasFields || example.length === 0) {
    lines.push("");
    lines.push(
      `  return <button onClick={() => ${method}(${hasFields ? "{}" : ""})}>${method}</button>;`,
    );
  } else {
    const argParts = example.map(
      ([name, f]) => `${name}: ${sampleValueJs(f, name)}`,
    );
    lines.push("");
    lines.push(
      `  return <button onClick={() => ${method}({ ${argParts.join(", ")} })}>${method}</button>;`,
    );
  }
  lines.push(`}`);
  return lines.join("\n");
}

function formatLogStatement(
  messageName: string,
  fieldNames: string[],
  indent: string,
): string {
  const args = [
    JSON.stringify(messageName),
    ...fieldNames.map((f) => `msg.${f}`),
  ];
  if (args.length <= 3) return `console.log(${args.join(", ")});`;
  const inner = args.map((a) => `${indent}  ${a},`).join("\n");
  return `console.log(\n${inner}\n${indent});`;
}

function readmeMessageJsSnippet(
  message: MessageSchema,
  modelName: string,
  modelPrefix: string,
  packageName: string,
): string {
  const listener = `on${toPascalCase(message.name)}`;
  const fieldNames = Object.keys(message.fields);
  const hasFields = fieldNames.length > 0;

  const body = hasFields
    ? [
        `${modelName}.${listener}((msg) => {`,
        `  ${formatLogStatement(message.name, fieldNames, "  ")}`,
        `});`,
      ]
    : [
        `${modelName}.${listener}(() => {`,
        `  console.log(${JSON.stringify(message.name)});`,
        `});`,
      ];

  return [
    `import { ${modelPrefix}Model } from ${JSON.stringify(packageName)};`,
    "",
    `const ${modelName} = new ${modelPrefix}Model();`,
    ...body,
    `await ${modelName}.connect(jwt);`,
  ].join("\n");
}

function readmeMessageReactSnippet(
  message: MessageSchema,
  modelPrefix: string,
  packageName: string,
): string {
  const hook = `use${modelPrefix}${toPascalCase(message.name)}`;
  const fieldNames = Object.keys(message.fields);
  const hasFields = fieldNames.length > 0;

  const body = hasFields
    ? [
        `${hook}((msg) => {`,
        `  ${formatLogStatement(message.name, fieldNames, "  ")}`,
        `});`,
      ]
    : [
        `${hook}(() => {`,
        `  console.log(${JSON.stringify(message.name)});`,
        `});`,
      ];

  return [
    `import { ${hook} } from "${packageName}";`,
    "",
    `// Inside a React component wrapped by <${modelPrefix}Provider>:`,
    ...body,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Section emitters
// ---------------------------------------------------------------------------

/**
 * Extract backticked tokens from a description and filter to known
 * messages — used to render "Emits: …" lines under events. GitHub's
 * auto-anchor rules lowercase headings, so we build the anchor map once
 * up front (it's also the set used by field-description cross-links).
 */
function extractEmittedMessageRefs(
  text: string,
  knownMessages: Set<string>,
): string[] {
  if (!text) return [];
  const out = new Set<string>();
  const re = /`([a-zA-Z_][a-zA-Z0-9_]*)`/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (knownMessages.has(m[1])) out.add(m[1]);
  }
  return Array.from(out);
}

function generateReadmeEventSection(
  event: EventSchema,
  modelName: string,
  modelPrefix: string,
  packageName: string,
  anchors: Record<string, string>,
  knownMessages: Set<string>,
): string {
  const method = toCamelCase(event.name);
  const emits = extractEmittedMessageRefs(event.description, knownMessages);

  const out: string[] = [];
  out.push(`### \`${method}\``);
  out.push("");
  if (event.description) {
    out.push(mdBacktickedCrossLinks(event.description, anchors));
    out.push("");
  }
  if (emits.length > 0) {
    const links = emits
      .map((name) => `[\`${name}\`](${anchors[name]})`)
      .join(", ");
    out.push(`Emits: ${links}`);
    out.push("");
  }
  out.push(mdFieldTable(Object.entries(event.fields), "param", anchors));
  out.push("#### JavaScript");
  out.push("");
  out.push("```typescript");
  out.push(readmeEventJsSnippet(event, modelName, modelPrefix, packageName));
  out.push("```");
  out.push("");
  out.push("#### React");
  out.push("");
  out.push("```tsx");
  out.push(readmeEventReactSnippet(event, modelPrefix, packageName));
  out.push("```");
  out.push("");
  return out.join("\n");
}

function generateReadmeMessageSection(
  message: MessageSchema,
  modelName: string,
  modelPrefix: string,
  packageName: string,
  anchors: Record<string, string>,
): string {
  const listener = `on${toPascalCase(message.name)}`;
  const hook = `use${modelPrefix}${toPascalCase(message.name)}`;

  const out: string[] = [];
  out.push(`### \`${message.name}\``);
  out.push("");
  if (message.description) {
    out.push(mdBacktickedCrossLinks(message.description, anchors));
    out.push("");
  }
  out.push(`Listener: \`${listener}\` · React hook: \`${hook}\``);
  out.push("");
  out.push(mdFieldTable(Object.entries(message.fields), "field", anchors));
  out.push("#### JavaScript");
  out.push("");
  out.push("```typescript");
  out.push(
    readmeMessageJsSnippet(message, modelName, modelPrefix, packageName),
  );
  out.push("```");
  out.push("");
  out.push("#### React");
  out.push("");
  out.push("```tsx");
  out.push(readmeMessageReactSnippet(message, modelPrefix, packageName));
  out.push("```");
  out.push("");
  return out.join("\n");
}

function generateReadmeTracksSection(tracks: TrackSchema[]): string {
  if (tracks.length === 0) return "";
  const out: string[] = [];
  out.push(
    "The generated package pre-wires these as `modelTracks` so the SDK prepares the WebRTC offer in parallel with session setup — no client wiring required.",
  );
  out.push("");
  out.push("| Name | Kind | Direction | Transport |");
  out.push("|---|---|---|---|");
  for (const t of tracks) {
    // Schema direction is from the model's perspective; the transport
    // (client) direction is the mirror image. Kept inline here so the
    // README emitter doesn't take a dep on the track-constant rewrite
    // that lands in a later PR.
    const transport = t.direction === "in" ? "sendonly" : "recvonly";
    out.push(
      `| \`${t.name}\` | ${t.kind} | ${t.direction} | \`${transport}\` |`,
    );
  }
  out.push("");
  return out.join("\n");
}

/**
 * Build the anchor map used by cross-links in event/message descriptions.
 *
 * Anchors follow GitHub's auto-generated rules (lowercase, spaces →
 * dashes, non-alphanumerics stripped). Event headings are the camelCase
 * method name (`setPrompt`); message headings are the raw snake_case
 * name (`prompt_accepted`). Both cases collapse cleanly to a single
 * anchor segment under that rule.
 */
function buildReadmeAnchors(
  events: EventSchema[],
  messages: MessageSchema[],
): Record<string, string> {
  const anchors: Record<string, string> = {};
  for (const e of events) {
    anchors[e.name] = `#${toCamelCase(e.name).toLowerCase()}`;
  }
  for (const m of messages) {
    anchors[m.name] = `#${m.name.toLowerCase()}`;
  }
  return anchors;
}

// ---------------------------------------------------------------------------
// Exported top-level assembler
// ---------------------------------------------------------------------------

export function generateReadme(options: CodegenOptions): string {
  const { schema } = options;
  const modelName = schema.modelName;
  const modelPrefix = toPascalCase(modelName);
  const packageName = `@reactor-models/${modelName}`;

  const template = loadReadmeTemplate();
  const rendered = renderTemplate(template, {
    MODEL_NAME: modelName,
    MODEL_PREFIX: modelPrefix,
    MODEL_VERSION: formatVersionForHeader(schema.modelVersion),
    PACKAGE_NAME: packageName,
  });

  const knownMessages = new Set(schema.messages.map((m) => m.name));
  const anchors = buildReadmeAnchors(schema.events, schema.messages);

  const sections: string[] = [rendered.trimEnd(), ""];

  if (schema.events.length > 0) {
    sections.push("## Events");
    sections.push("");
    sections.push(
      `Client-to-model commands. The typed surface is \`${modelPrefix}Model\` (one method per event) in plain JS, and \`use${modelPrefix}()\` in React — every field name below matches the parameter name the method accepts.`,
    );
    sections.push("");
    for (const event of schema.events) {
      sections.push(
        generateReadmeEventSection(
          event,
          modelName,
          modelPrefix,
          packageName,
          anchors,
          knownMessages,
        ),
      );
    }
  }

  if (schema.messages.length > 0) {
    sections.push("## Messages");
    sections.push("");
    sections.push(
      `Model-to-client messages. Register a typed listener with \`on…\` on \`${modelPrefix}Model\`, or a \`use${modelPrefix}…\` hook in React, to receive only the messages you care about.`,
    );
    sections.push("");
    for (const message of schema.messages) {
      sections.push(
        generateReadmeMessageSection(
          message,
          modelName,
          modelPrefix,
          packageName,
          anchors,
        ),
      );
    }
  }

  if (schema.tracks.length > 0) {
    sections.push("## Tracks");
    sections.push("");
    sections.push(generateReadmeTracksSection(schema.tracks));
  }

  // Trailing blank line keeps the final file POSIX-compliant and avoids
  // the "no newline at end of file" warning in `git diff`.
  return sections.join("\n").trimEnd() + "\n";
}

// Re-export internal helpers for targeted unit testing.
// Public consumers should only use `generateReadme`.
export const __testing__ = {
  renderTemplate,
};
