// Copyright (c) 2026 Reactor Technologies, Inc. All rights reserved.

import type {
  CodegenOptions,
  EventSchema,
  FieldSchema,
  GeneratedPackage,
  MessageSchema,
  TrackSchema,
} from "./types.js";
import { generateReadme } from "./readme-emitter.js";

// ---------------------------------------------------------------------------
// String helpers
//
// `toPascalCase` / `toCamelCase` split on both `_` and `-`. The dual
// separator matters for model names — npm packages commonly use
// hyphens (`@reactor-models/my-cool-model`), and the verifier accepts
// model names with either separator. Splitting on both here keeps the
// emitted `<Prefix>Model` / `<Prefix>Tracks` / etc. as a valid TS
// identifier (`MyCoolModel`, not `My-cool-model`).
//
// Event / message / track / field names are gated by the verifier's
// strict-snake-case regex, which forbids hyphens, so the dual-separator
// split is effectively a no-op for them.
// ---------------------------------------------------------------------------

const CASE_SEGMENT_SEPARATOR = /[_-]/;

export function toPascalCase(snake: string): string {
  return snake
    .split(CASE_SEGMENT_SEPARATOR)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
}

export function toCamelCase(snake: string): string {
  const pascal = toPascalCase(snake);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

function indent(text: string, level: number): string {
  const pad = "  ".repeat(level);
  return text
    .split("\n")
    .map((line) => (line.trim() ? pad + line : line))
    .join("\n");
}

function enumValueToTs(v: string | number | boolean): string {
  // `JSON.stringify` produces a valid JS string literal with every
  // control / quote / backslash byte properly escaped. The TS grammar
  // accepts the exact same literal form, so the output is both valid
  // and injection-safe even if the schema smuggled a `"` or newline
  // past the parser's name validators.
  if (typeof v === "string") return JSON.stringify(v);
  return String(v);
}

/**
 * Strip Reactor's `-g<sha>` git-describe suffix from a version string.
 * Reactor model release tags follow the `v<MAJOR>.<MINOR>.<PATCH>-g<sha>`
 * convention (see `internal/tooling/releaser` in the main repo) and the
 * short SHA is noise from every consumer's perspective:
 *
 *   - README readers want to know `v0.8.3`, not `v0.8.3-g404f6950`.
 *   - The emitted `MODEL_VERSION` constant is used by apps for display
 *     and telemetry; the SHA only adds jitter across otherwise-identical
 *     builds.
 *   - `npm pack` derives the tarball filename from `package.json`'s
 *     `version`; keeping the SHA means every no-op republish ships a
 *     differently-named artefact.
 *
 * The regex is deliberately narrow (`-g` followed by one or more hex
 * chars at the end of the string) so legitimate semver pre-release
 * suffixes like `-beta.3` or `-rc.1` pass through untouched.
 */
export function stripBuildMetadata(version: string): string {
  return version.replace(/-g[0-9a-f]+$/i, "");
}

/**
 * Format a schema `info.version` for the `// Model: <name> v<version>`
 * banner. Schemas that already prefix their version with `v` (e.g.
 * `"v0.0.0"`) would otherwise get a stuttering `vv0.0.0`, so we
 * normalise on a single leading `v`. The git-describe suffix is
 * stripped first via {@link stripBuildMetadata} so the banner reads as
 * `v0.8.3` rather than `v0.8.3-g404f6950` — the SHA is CI plumbing,
 * not information a human reading the generated source cares about.
 */
export function formatVersionForHeader(version: string): string {
  const base = stripBuildMetadata(version);
  return base.startsWith("v") ? base : `v${base}`;
}

/**
 * Normalise a schema `info.version` for the generated `package.json`'s
 * `"version"` field. Two operations, in this order:
 *
 *   1. Strip the Reactor git-describe `-g<sha>` suffix (see
 *      {@link stripBuildMetadata}) so the tarball name and the
 *      published npm version are stable across rebuilds of the same
 *      semver triple.
 *   2. Strip a leading `v` so npm's strict-semver validator accepts
 *      the value (Reactor release tags commonly start with `v`).
 *
 * Consumers see exactly `MAJOR.MINOR.PATCH[-prerelease]` on npm,
 * regardless of how the schema author wrote the original tag.
 */
function formatVersionForPackageJson(version: string): string {
  const base = stripBuildMetadata(version);
  return base.startsWith("v") ? base.slice(1) : base;
}

/**
 * Format a schema `info.version` for emission as the `MODEL_VERSION`
 * exported constant. Drops the `-g<sha>` suffix so the value developers
 * read at runtime matches the one printed in the README and the header
 * banner, but keeps any leading `v` the schema author wrote — this
 * constant is for display, not for npm semver.
 */
function formatVersionForModelConstant(version: string): string {
  return stripBuildMetadata(version);
}

const UPLOAD_REF_FORMATS = new Set([
  "reactor-upload-reference",
  "file-reference",
]);

export function isUploadReference(field: FieldSchema): boolean {
  return (
    field.type === "object" &&
    !!field.format &&
    UPLOAD_REF_FORMATS.has(field.format)
  );
}

export function fieldSchemaToTsType(field: FieldSchema): string {
  if (isUploadReference(field)) {
    return "FileRef";
  }
  if (field.enum && field.enum.length > 0) {
    return field.enum.map(enumValueToTs).join(" | ");
  }
  switch (field.type) {
    case "string":
      return "string";
    case "integer":
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "object":
      return "Record<string, unknown>";
    case "array":
      return "unknown[]";
    default:
      return "unknown";
  }
}

export function hasUploadRefParam(event: EventSchema): boolean {
  return Object.values(event.fields).some(isUploadReference);
}

// ---------------------------------------------------------------------------
// Runtime envelope unwrap helper.
//
// The SDK's `reactor.on("message", handler)` hands callers the inner
// envelope exactly as it comes off the data channel — i.e.
// `{ type, data, uploads? }` — so a field the model's schema declares
// on a message actually lives at `msg.data.<field>`, not `msg.<field>`.
// The emitted `<Prefix><Msg>Message` interfaces are flat for developer
// ergonomics (`msg.current_frame`, not `msg.data.current_frame`), so
// every generated handler wrapper in this file flattens `raw.data` up
// to the top level before handing the object to the typed callback.
//
// The helper is emitted as a file-local function into both
// `src/index.ts` (used by the class's `onMessage` / `on<Name>`) and
// `src/react.ts` (used by `use<Prefix>Message` / `use<Prefix><Msg>`),
// so neither file has to import anything extra at runtime and the
// helper never leaks into the generated package's public surface.
// Duplication is ~12 lines and strictly cheaper than threading a
// cross-module import seam.
//
// `type` is re-applied last so a payload that happens to carry its
// own `type` field can never shadow the discriminator. Payloads
// missing the inner `data` wrapper pass through untouched so
// non-enveloped input degrades gracefully instead of crashing the
// handler.
// ---------------------------------------------------------------------------

const UNWRAP_MESSAGE_HELPER = `/**
 * @internal Flatten the \`{ type, data, uploads? }\` envelope the SDK
 * hands to \`reactor.on("message", …)\` so a field the model schema
 * declares on a message is reachable at \`msg.<field>\` — matching the
 * shape the exported message interfaces promise.
 */
function _unwrapMessage<T>(raw: unknown): T {
  const env = raw as { type?: string; data?: Record<string, unknown> };
  if (
    env &&
    typeof env === "object" &&
    env.data &&
    typeof env.data === "object"
  ) {
    return { ...env.data, type: env.type } as T;
  }
  return raw as T;
}`;

// Make a free-form prose line safe to drop inside a JSDoc body.
//
// Two hostile sequences matter:
//   - A literal comment-close (asterisk + forward-slash) terminates the
//     JSDoc block and lets everything after it escape into module scope
//     as top-level code. At import time in a consumer project this is
//     arbitrary-code-execution; escaping the slash with a backslash
//     (asterisk + backslash + slash) keeps IDE tooltips visually
//     identical while neutering the terminator.
//   - CR / LF / U+2028 / U+2029 are collapsed so a multi-line
//     description can't smuggle a trailing newline past the caller's
//     line-based formatting and land as real code on the line below.
//
// Field description values reach this function verbatim from the
// OpenAPI document (author prose), so the parser deliberately does not
// constrain them — this function is the last line of defence.
function sanitizeJsDocLine(line: string): string {
  return line.replace(/\*\//g, "*\\/").replace(/[\r\n\u2028\u2029]+/g, " ");
}

function generateJsDoc(lines: string[], indentLevel: number = 0): string {
  if (lines.length === 0) return "";
  const pad = "  ".repeat(indentLevel);
  const safe = lines.map(sanitizeJsDocLine);
  if (safe.length === 1) return `${pad}/** ${safe[0]} */\n`;
  // Empty entries render as a bare ` *` line, which is JSDoc's idiomatic
  // way to separate paragraphs inside a multi-line block — required so
  // that descriptions split via `descriptionToJsDocLines` show up as
  // proper paragraph breaks in IDE hovers and TypeDoc output.
  const inner = safe
    .map((l) => (l === "" ? `${pad} *` : `${pad} * ${l}`))
    .join("\n");
  return `${pad}/**\n${inner}\n${pad} */\n`;
}

// Convert a free-form description (possibly multi-paragraph) into the
// array of lines that `generateJsDoc` consumes. Paragraph breaks
// (``\n\n+``) become a blank entry so the rendered JSDoc has a bare
// ` *` separator line between paragraphs; intra-paragraph wrapping is
// left alone — `sanitizeJsDocLine` will collapse it into a single
// space, which matches how the runtime now normalises ModelMessage
// docstrings (REA-1801).
function descriptionToJsDocLines(description: string): string[] {
  if (!description) return [];
  const paragraphs = description.split(/\n\n+/);
  const out: string[] = [];
  for (let i = 0; i < paragraphs.length; i++) {
    if (i > 0) out.push("");
    out.push(paragraphs[i]);
  }
  return out;
}

// First paragraph of a description, used for `@param` tags where a
// terse single sentence beats spilling the full multi-paragraph body
// onto a tag that consumers see inline at every call site.
function descriptionSummary(description: string): string {
  return description.split(/\n\n+/)[0] ?? "";
}

// ---------------------------------------------------------------------------
// Event (command) param interfaces
// ---------------------------------------------------------------------------

function generateParamInterface(
  modelPrefix: string,
  event: EventSchema,
): string {
  const interfaceName = `${modelPrefix}${toPascalCase(event.name)}Params`;
  const fields = Object.entries(event.fields);

  if (fields.length === 0) return "";

  const lines: string[] = [];
  const doc = generateJsDoc(descriptionToJsDocLines(event.description), 0);
  lines.push(`${doc}export interface ${interfaceName} {`);

  for (const [name, field] of fields) {
    const tsType = fieldSchemaToTsType(field);
    const optional = field.default !== undefined ? "?" : "";
    const fieldDoc: string[] = [];
    if (field.description) fieldDoc.push(field.description);
    if (field.minimum !== undefined) fieldDoc.push(`@minimum ${field.minimum}`);
    if (field.maximum !== undefined) fieldDoc.push(`@maximum ${field.maximum}`);
    if (field.minLength !== undefined)
      fieldDoc.push(`@minLength ${field.minLength}`);
    if (field.maxLength !== undefined)
      fieldDoc.push(`@maxLength ${field.maxLength}`);
    if (field.default !== undefined)
      fieldDoc.push(`@default ${JSON.stringify(field.default)}`);

    if (fieldDoc.length > 0) lines.push(indent(generateJsDoc(fieldDoc), 1));
    lines.push(`  ${name}${optional}: ${tsType};`);
  }

  lines.push("}");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Message interfaces + discriminated union
// ---------------------------------------------------------------------------

function generateMessageInterface(
  modelPrefix: string,
  message: MessageSchema,
): string {
  const interfaceName = `${modelPrefix}${toPascalCase(message.name)}Message`;
  const fields = Object.entries(message.fields);

  const lines: string[] = [];
  const doc = generateJsDoc(descriptionToJsDocLines(message.description), 0);
  lines.push(`${doc}export interface ${interfaceName} {`);
  lines.push(`  type: ${JSON.stringify(message.name)};`);

  for (const [name, field] of fields) {
    const tsType = fieldSchemaToTsType(field);
    const fieldDoc: string[] = [];
    if (field.description) fieldDoc.push(field.description);
    if (fieldDoc.length > 0) lines.push(indent(generateJsDoc(fieldDoc), 1));
    lines.push(`  ${name}: ${tsType};`);
  }

  lines.push("}");
  return lines.join("\n");
}

function generateMessageUnion(
  modelPrefix: string,
  messages: MessageSchema[],
): string {
  if (messages.length === 0) return "";

  const members = messages.map(
    (m) => `  | ${modelPrefix}${toPascalCase(m.name)}Message`,
  );
  return `export type ${modelPrefix}Message =\n${members.join("\n")};`;
}

// ---------------------------------------------------------------------------
// Track constants
// ---------------------------------------------------------------------------

/**
 * The schema expresses track direction from the model's perspective
 * (`"in"` = model consumes, `"out"` = model produces). The JS SDK's
 * {@link Reactor} constructor accepts the transport / client
 * perspective via `modelTracks[*].direction` — `"sendonly"` when the
 * client sends media into the model, `"recvonly"` when the client
 * receives media from it.
 */
function schemaDirectionToTransport(
  direction: TrackSchema["direction"],
): "sendonly" | "recvonly" {
  return direction === "in" ? "sendonly" : "recvonly";
}

function generateTrackConstants(
  modelPrefix: string,
  tracks: TrackSchema[],
): string {
  if (tracks.length === 0) return "";

  const lines: string[] = [];
  const doc = generateJsDoc(
    [
      `Preset media tracks for the ${modelPrefix} model.`,
      "",
      "Declared in the model's OpenAPI schema and passed to the SDK as",
      "`modelTracks` so the transport can prepare the SDP offer in",
      "parallel with session polling (faster first-frame latency).",
    ],
    0,
  );
  lines.push(doc + `export const ${modelPrefix}Tracks = [`);
  for (const track of tracks) {
    const transportDirection = schemaDirectionToTransport(track.direction);
    // Route every schema-sourced field through JSON.stringify so a hostile
    // IR (parser bypass / hand-rolled ModelSchema) can't smuggle a quote
    // into the constant and turn this array literal into executable code.
    // `transportDirection` is derived internally from a closed enum, but
    // we route it through the same helper for consistency.
    lines.push(
      `  { name: ${JSON.stringify(track.name)}, kind: ${JSON.stringify(track.kind)}, direction: ${JSON.stringify(transportDirection)} },`,
    );
  }
  lines.push("] as const;");
  return lines.join("\n");
}

/** Tracks the user can publish bytes INTO (client → model). */
function sendonlyTracks(tracks: TrackSchema[]): TrackSchema[] {
  return tracks.filter((t) => t.direction === "in");
}

/** Tracks the user can subscribe bytes OUT of (model → client). */
function recvonlyTracks(tracks: TrackSchema[]): TrackSchema[] {
  return tracks.filter((t) => t.direction === "out");
}

/**
 * Emit `export type <Prefix>SendTrackName = "a" | "b"` and
 * `export type <Prefix>RecvTrackName = "c" | "d"` — string-literal
 * unions of the track names the user can publish to / subscribe to.
 *
 * Only emit the direction that actually has tracks. A union with zero
 * members collapses to `never`, which makes every generated hook
 * signature uncallable (dead code worth surfacing as absence instead).
 *
 * Every name flows through `JSON.stringify` so a hostile IR cannot
 * smuggle a quote into the literal — same defense-in-depth contract as
 * every other schema-sourced identifier the emitter writes.
 */
function generateTrackTypes(
  modelPrefix: string,
  tracks: TrackSchema[],
): string {
  const send = sendonlyTracks(tracks);
  const recv = recvonlyTracks(tracks);
  if (send.length === 0 && recv.length === 0) return "";

  const parts: string[] = [];
  if (send.length > 0) {
    parts.push(
      generateJsDoc(
        [
          `Track names the client can publish into (sendonly, from the client's perspective).`,
        ],
        0,
      ) +
        `export type ${modelPrefix}SendTrackName =\n  ${send
          .map((t) => JSON.stringify(t.name))
          .join("\n  | ")};`,
    );
  }
  if (recv.length > 0) {
    parts.push(
      generateJsDoc(
        [
          `Track names the client can subscribe to (recvonly, from the client's perspective).`,
        ],
        0,
      ) +
        `export type ${modelPrefix}RecvTrackName =\n  ${recv
          .map((t) => JSON.stringify(t.name))
          .join("\n  | ")};`,
    );
  }
  return parts.join("\n\n");
}

// ---------------------------------------------------------------------------
// Options type + client class
// ---------------------------------------------------------------------------

function generateOptionsType(modelPrefix: string): string {
  const lines: string[] = [];
  lines.push(
    generateJsDoc(
      [
        `Options for creating a ${modelPrefix}Model (model name is set automatically).`,
      ],
      0,
    ),
  );
  lines.push(`export interface ${modelPrefix}Options {`);
  lines.push(`  apiUrl?: string;`);
  lines.push(`  local?: boolean;`);
  lines.push("}");
  return lines.join("\n");
}

function generateClientClass(
  modelPrefix: string,
  events: EventSchema[],
  messages: MessageSchema[],
  tracks: TrackSchema[],
): string {
  const className = `${modelPrefix}Model`;
  const optionsType = `${modelPrefix}Options`;
  const needsFileRef = events.some(hasUploadRefParam);
  const hasTracks = tracks.length > 0;

  const lines: string[] = [];

  const classDoc = [
    `Strongly-typed client for the ${modelPrefix} model.`,
    "",
    "Creates a Reactor connection with the model name pre-configured.",
    "Provides typed methods for every event and typed message listeners.",
  ];
  lines.push(generateJsDoc(classDoc, 0));
  lines.push(`export class ${className} {`);
  lines.push(`  readonly reactor: Reactor;`);
  lines.push("");
  lines.push(`  constructor(options?: ${optionsType}) {`);
  if (hasTracks) {
    lines.push(`    this.reactor = new Reactor({`);
    lines.push(`      ...options,`);
    lines.push(`      modelName: MODEL_NAME,`);
    lines.push(`      modelTracks: [...${modelPrefix}Tracks],`);
    lines.push(`    });`);
  } else {
    lines.push(
      `    this.reactor = new Reactor({ ...options, modelName: MODEL_NAME });`,
    );
  }
  lines.push(`  }`);
  lines.push("");
  lines.push(`  async connect(jwtToken?: string): Promise<void> {`);
  lines.push(`    await this.reactor.connect(jwtToken);`);
  lines.push(`  }`);
  lines.push("");
  lines.push(`  async disconnect(): Promise<void> {`);
  lines.push(`    await this.reactor.disconnect();`);
  lines.push(`  }`);

  for (const event of events) {
    const methodName = toCamelCase(event.name);
    const fields = Object.entries(event.fields);
    const hasParams = fields.length > 0;
    const paramType = hasParams
      ? `${modelPrefix}${toPascalCase(event.name)}Params`
      : undefined;

    lines.push("");

    const methodDoc: string[] = [];
    if (event.description) {
      methodDoc.push(...descriptionToJsDocLines(event.description));
    }
    if (hasParams && event.description) {
      // `@param` tags are read inline at every call-site; keep them to
      // the summary (first paragraph) so consumers don't see the full
      // multi-paragraph body repeated next to their argument.
      methodDoc.push(
        `@param params - ${descriptionSummary(event.description)}`,
      );
    }
    lines.push(indent(generateJsDoc(methodDoc), 1));

    if (paramType) {
      lines.push(
        `  async ${methodName}(params: ${paramType}): Promise<void> {`,
      );
      lines.push(
        `    await this.reactor.sendCommand(${JSON.stringify(event.name)}, params);`,
      );
    } else {
      lines.push(`  async ${methodName}(): Promise<void> {`);
      lines.push(
        `    await this.reactor.sendCommand(${JSON.stringify(event.name)}, {});`,
      );
    }
    lines.push(`  }`);
  }

  if (messages.length > 0) {
    lines.push("");
    const listenerDoc = [
      "Subscribe to typed model messages.",
      `@param handler - Called with a discriminated ${modelPrefix}Message`,
      "@returns Unsubscribe function",
    ];
    lines.push(indent(generateJsDoc(listenerDoc), 1));
    lines.push(
      `  onMessage(handler: (message: ${modelPrefix}Message) => void): () => void {`,
    );
    lines.push(`    const wrappedHandler = (raw: unknown) => {`);
    lines.push(`      handler(_unwrapMessage<${modelPrefix}Message>(raw));`);
    lines.push(`    };`);
    lines.push(`    this.reactor.on("message", wrappedHandler);`);
    lines.push(`    return () => this.reactor.off("message", wrappedHandler);`);
    lines.push(`  }`);

    for (const message of messages) {
      const hookName = `on${toPascalCase(message.name)}`;
      const msgType = `${modelPrefix}${toPascalCase(message.name)}Message`;
      lines.push("");
      lines.push(
        indent(
          generateJsDoc([
            `Subscribe to "${message.name}" messages only.`,
            `@returns Unsubscribe function`,
          ]),
          1,
        ),
      );
      lines.push(
        `  ${hookName}(handler: (message: ${msgType}) => void): () => void {`,
      );
      lines.push(`    return this.onMessage((msg) => {`);
      lines.push(
        `      if (msg.type === ${JSON.stringify(message.name)}) handler(msg as ${msgType});`,
      );
      lines.push(`    });`);
      lines.push(`  }`);
    }
  }

  if (needsFileRef) {
    lines.push("");
    const uploadDoc = [
      "Upload a file and get a FileRef for use in events.",
      "@param file - File or Blob to upload",
      "@param options - Optional name override",
    ];
    lines.push(indent(generateJsDoc(uploadDoc), 1));
    lines.push(
      `  async uploadFile(file: File | Blob, options?: { name?: string }): Promise<FileRef> {`,
    );
    lines.push(`    return this.reactor.uploadFile(file, options);`);
    lines.push(`  }`);
  }

  // Typed track helpers — one publish/unpublish pair per sendonly track
  // and one `on<Name>` subscription per recvonly track. Keeps the
  // generated surface consistent with events ({model}.setFoo(...)) and
  // messages ({model}.onFoo(...)) so consumers never hand-write a
  // track name as a string literal.
  //
  // The generic `reactor.publishTrack(name, ...)` /
  // `reactor.on("trackReceived", ...)` APIs remain reachable through
  // `{model}.reactor` for callers that need to pass a dynamic name —
  // this generator only emits per-schema sugar.
  for (const track of sendonlyTracks(tracks)) {
    const pascal = toPascalCase(track.name);
    const kindNote = track.kind === "audio" ? " audio" : " video";
    lines.push("");
    lines.push(
      indent(
        generateJsDoc([
          `Start sending a ${track.kind === "audio" ? "audio" : "video"} track to the model's "${track.name}" sendonly channel.`,
          "",
          `Pass a live MediaStreamTrack (e.g. from \`getUserMedia({${kindNote === " audio" ? " audio: true " : " video: true "}})\`).`,
          `Safe to call repeatedly — the transport \`replaceTrack()\`s the new value onto the existing RTCRtpSender without renegotiating.`,
          `@param track - The${kindNote} MediaStreamTrack to publish`,
        ]),
        1,
      ),
    );
    lines.push(
      `  async publish${pascal}(track: MediaStreamTrack): Promise<void> {`,
    );
    lines.push(
      `    await this.reactor.publishTrack(${JSON.stringify(track.name)}, track);`,
    );
    lines.push(`  }`);

    lines.push("");
    lines.push(
      indent(
        generateJsDoc([
          `Stop sending on the "${track.name}" sendonly channel.`,
          "",
          `The underlying RTCRtpSender stays alive — future \`publish${pascal}()\` calls resume on the same transceiver without renegotiating.`,
        ]),
        1,
      ),
    );
    lines.push(`  async unpublish${pascal}(): Promise<void> {`);
    lines.push(
      `    await this.reactor.unpublishTrack(${JSON.stringify(track.name)});`,
    );
    lines.push(`  }`);
  }

  for (const track of recvonlyTracks(tracks)) {
    const pascal = toPascalCase(track.name);
    lines.push("");
    lines.push(
      indent(
        generateJsDoc([
          `Subscribe to the "${track.name}" recvonly ${track.kind} track the model publishes.`,
          "",
          "The handler fires once the model starts publishing this track; it receives the live MediaStreamTrack and the parent MediaStream (useful for attaching to a `<video>` / `<audio>` element via `srcObject`).",
          "@param handler - Called with the received track and its stream",
          "@returns Unsubscribe function",
        ]),
        1,
      ),
    );
    lines.push(
      `  on${pascal}(\n    handler: (track: MediaStreamTrack, stream: MediaStream) => void,\n  ): () => void {`,
    );
    lines.push(
      `    const wrapped = (name: string, t: MediaStreamTrack, s: MediaStream) => {`,
    );
    lines.push(
      `      if (name === ${JSON.stringify(track.name)}) handler(t, s);`,
    );
    lines.push(`    };`);
    lines.push(`    this.reactor.on("trackReceived", wrapped);`);
    lines.push(`    return () => this.reactor.off("trackReceived", wrapped);`);
    lines.push(`  }`);
  }

  lines.push("}");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// React file (optional): provider + typed command hook + per-message hooks
// ---------------------------------------------------------------------------
//
// Design choices, in case you're reviewing and wondering:
//
//   - We use `React.createElement` rather than JSX so the emitter stays a
//     pure string builder with no JSX-escaping concerns and the generated
//     file can stay `.ts` (not `.tsx`). tsup/TS handle this fine.
//
//   - The provider is a thin wrapper around `ReactorProvider` that bakes in
//     `modelName: MODEL_NAME` and `modelTracks: [...<Prefix>Tracks]`, so
//     consumers never have to wire those up themselves.
//
//   - The `use<Prefix>()` hook exposes typed `sendCommand`-bound methods
//     (one per event), plus `status`, and — when any event takes an upload
//     reference — `uploadFile`. It selects state from the store via
//     `useReactor` so it re-renders on `status` changes.
//
//   - Per-message hooks (`use<Prefix><Msg>`) filter by the discriminator
//     (`type: "..."`) inside `useReactorMessage` and hand the handler the
//     exact typed message. The catch-all `use<Prefix>Message` is just a
//     typed passthrough for consumers that want the union.

function generateReactHooksForMessages(
  modelPrefix: string,
  messages: MessageSchema[],
): string {
  if (messages.length === 0) return "";

  const lines: string[] = [];
  for (const message of messages) {
    const hookName = `use${modelPrefix}${toPascalCase(message.name)}`;
    const msgType = `${modelPrefix}${toPascalCase(message.name)}Message`;

    lines.push(
      generateJsDoc(
        [
          `Subscribe to "${message.name}" messages only.`,
          `Handler receives a fully-typed ${msgType}.`,
        ],
        0,
      ) +
        `export function ${hookName}(
  handler: (message: ${msgType}) => void,
): void {
  useReactorMessage((msg: unknown) => {
    const m = _unwrapMessage<${modelPrefix}Message>(msg);
    if (m.type === ${JSON.stringify(message.name)}) {
      handler(m as ${msgType});
    }
  });
}`,
    );
  }

  return lines.join("\n\n");
}

function generateUseModelHook(
  modelPrefix: string,
  events: EventSchema[],
): string {
  const hookName = `use${modelPrefix}`;
  const needsFileRef = events.some(hasUploadRefParam);

  const methods: string[] = [];
  for (const event of events) {
    const methodName = toCamelCase(event.name);
    const fields = Object.entries(event.fields);
    const paramType = fields.length
      ? `${modelPrefix}${toPascalCase(event.name)}Params`
      : undefined;

    if (paramType) {
      methods.push(
        `    ${methodName}: (params: ${paramType}): Promise<void> =>
      sendCommand(${JSON.stringify(event.name)}, params),`,
      );
    } else {
      methods.push(
        `    ${methodName}: (): Promise<void> =>
      sendCommand(${JSON.stringify(event.name)}, {}),`,
      );
    }
  }

  if (needsFileRef) {
    methods.push(
      `    uploadFile: (
      file: File | Blob,
      options?: { name?: string },
    ): Promise<FileRef> => uploadFile(file, options),`,
    );
  }

  const doc = generateJsDoc(
    [
      `Access the ${modelPrefix} model as typed commands bound to the nearest`,
      `{@link ${modelPrefix}Provider}. Re-renders when \`status\` changes.`,
      "",
      "Returns the full action surface — connection `status`, `connect` /",
      "`disconnect` for manual lifecycle control, one method per model event" +
        (needsFileRef ? ", and `uploadFile` for upload-reference params" : "") +
        ".",
      "",
      "`connect` / `disconnect` are pulled off the store so consumers using",
      `\`<${modelPrefix}Provider>\` with \`autoConnect: false\` (or manual reconnect`,
      "flows) don't have to reach for the raw `useReactor` hook themselves,",
      "which in turn would force `@reactor-team/js-sdk` to be a direct",
      "dependency instead of a transitive one through this package.",
    ],
    0,
  );

  // `connect` / `disconnect` are pulled off the store so consumers using
  // `<Prefix>Provider` with `autoConnect: false` (or any manual reconnect
  // flow) don't have to reach for `useReactor` themselves. Function
  // identities are stable across renders because they're Zustand actions.
  return `${doc}export function ${hookName}() {
  const sendCommand = useReactor((s) => s.sendCommand);${
    needsFileRef
      ? `
  const uploadFile = useReactor((s) => s.uploadFile);`
      : ""
  }
  const connect = useReactor((s) => s.connect);
  const disconnect = useReactor((s) => s.disconnect);
  const status = useReactor((s) => s.status);

  return {
    status,
    connect,
    disconnect,
${methods.join("\n")}
  };
}`;
}

function generateProviderComponent(
  modelPrefix: string,
  hasTracks: boolean,
): string {
  const providerName = `${modelPrefix}Provider`;
  const optionsType = `${modelPrefix}Options`;

  const doc = generateJsDoc(
    [
      `Provider for the ${modelPrefix} model.`,
      "",
      "Wraps {@link ReactorProvider} with `modelName` " +
        (hasTracks ? "and `modelTracks` " : "") +
        "pre-configured from the",
      "generated constants. Drop this near the top of your tree, then use",
      `{@link use${modelPrefix}} and the \`use${modelPrefix}<Message>\` hooks below it.`,
    ],
    0,
  );

  const providerProps = `{
  apiUrl,
  local,
  jwtToken,
  connectOptions,
  children,
}: ${providerName}Props`;

  // `children` has to live inside the props object passed to
  // `createElement` — *not* as a third positional argument — because
  // `@types/react`'s `createElement` overloads require the props arg
  // to satisfy every required field of the component's prop type
  // (`ReactorProviderProps` declares `children: ReactNode` as
  // required). The variadic `...children: ReactNode[]` rest parameter
  // is decoupled from the prop typecheck, so the third-arg form fails
  // to compile even though it works fine at runtime.
  //
  // The required-children form clashes with `eslint-plugin-react`'s
  // `react/no-children-prop` rule (recommended config; ships in the
  // Next.js default). To stay both type-correct and lint-clean in
  // consumer projects, we emit a targeted `eslint-disable-next-line`
  // comment with a justification on the one offending line — anything
  // broader would silence the rule for unrelated code, and the SDK
  // type can't be relaxed without a separate API change.
  const reactorProviderProps = [
    `      apiUrl: apiUrl,`,
    `      local: local,`,
    `      modelName: MODEL_NAME,`,
  ];
  if (hasTracks) {
    reactorProviderProps.push(`      modelTracks: [...${modelPrefix}Tracks],`);
  }
  reactorProviderProps.push(
    `      jwtToken: jwtToken,`,
    `      connectOptions: connectOptions,`,
    `      // eslint-disable-next-line react/no-children-prop -- required by @types/react createElement overload`,
    `      children: children,`,
  );

  return `export interface ${providerName}Props extends ${optionsType} {
  jwtToken?: string;
  connectOptions?: ReactorConnectOptions;
  children: ReactNode;
}

${doc}export function ${providerName}(${providerProps}): ReactElement {
  return createElement(ReactorProvider, {
${reactorProviderProps.join("\n")}
  });
}`;
}

/**
 * Emit `src/react.ts` — a standalone source file containing the
 * `<Prefix>Provider` component, the `use<Prefix>()` command hook, and
 * one typed listener hook per model message.
 *
 * The file is kept physically separate from `src/index.ts` (not
 * inlined) so the React-specific imports, the `"use client";`
 * directive, and the React runtime dependency are localised to one
 * module. `src/index.ts` re-exports the public surface of this file
 * via `export * from "./react.js";`, so downstream consumers still
 * only ever `import { … } from "@reactor-models/<name>"` — they never
 * reach for a subpath.
 *
 * Imports `MODEL_NAME` / `<Prefix>Tracks` / param + message types from
 * `./index.js`. The circular import (index.ts re-exports from here,
 * this file imports back) is safe because every value referenced from
 * `./index.js` is declared before the re-export line in index.ts, and
 * no React code actually runs at module load — Provider/hooks only
 * execute when React calls them.
 */
function generateReactFile(options: CodegenOptions): string {
  const { schema } = options;
  const modelPrefix = toPascalCase(schema.modelName);
  const events = schema.events;
  const messages = schema.messages;
  const tracks = schema.tracks;
  const hasTracks = tracks.length > 0;
  const send = sendonlyTracks(tracks);
  const recv = recvonlyTracks(tracks);
  // The per-track component wrappers only make sense for tracks the SDK
  // already has a ready-made React component for. `<ReactorView>` and
  // `<WebcamStream>` are both video-only today; audio-only tracks
  // would need bespoke wiring that this emitter intentionally leaves
  // to the consumer.
  const sendVideo = send.filter((t) => t.kind === "video");
  const recvVideo = recv.filter((t) => t.kind === "video");
  const emitsTrackHook = recv.length > 0;
  const emitsViewComponents = recvVideo.length > 0;
  const emitsPublisherComponents = sendVideo.length > 0;
  const needsFileRef = events.some(hasUploadRefParam);

  const sections: string[] = [];

  sections.push(
    `// Copyright (c) 2026 Reactor Technologies, Inc. All rights reserved.`,
  );
  sections.push("");
  sections.push(`// Auto-generated by @reactor-team/codegen — DO NOT EDIT`);
  sections.push(
    `// Model: ${schema.modelName} ${formatVersionForHeader(schema.modelVersion)}`,
  );
  sections.push("");
  sections.push(`"use client";`);
  sections.push("");

  // React imports. `createElement` lets us stay in `.ts` (no JSX).
  sections.push(
    `import { createElement, type ReactElement, type ReactNode } from "react";`,
  );

  // SDK imports. We only import what the emitted surface actually uses so
  // tree-shaking in the consumer project stays tight.
  const sdkImports = [
    "ReactorProvider",
    "useReactor",
    ...(messages.length > 0 ? ["useReactorMessage"] : []),
    "type ReactorConnectOptions",
  ];
  if (needsFileRef) sdkImports.push("type FileRef");
  if (emitsViewComponents)
    sdkImports.push("ReactorView", "type ReactorViewProps");
  if (emitsPublisherComponents)
    sdkImports.push("WebcamStream", "type WebcamStreamProps");
  sections.push(
    `import {\n  ${sdkImports.join(",\n  ")},\n} from "@reactor-team/js-sdk";`,
  );

  // Pull the generated constants and types from the sibling index.ts.
  // The `.js` extension is required for Node's ESM resolver and matches
  // what tsup produces.
  const localImports: string[] = ["MODEL_NAME"];
  if (hasTracks) localImports.push(`${modelPrefix}Tracks`);
  localImports.push(`type ${modelPrefix}Options`);
  for (const event of events) {
    const fieldCount = Object.keys(event.fields).length;
    if (fieldCount > 0) {
      localImports.push(`type ${modelPrefix}${toPascalCase(event.name)}Params`);
    }
  }
  if (messages.length > 0) {
    localImports.push(`type ${modelPrefix}Message`);
    for (const message of messages) {
      localImports.push(
        `type ${modelPrefix}${toPascalCase(message.name)}Message`,
      );
    }
  }
  if (emitsTrackHook) {
    localImports.push(`type ${modelPrefix}RecvTrackName`);
  }
  sections.push(
    `import {\n  ${localImports.join(",\n  ")},\n} from "./index.js";`,
  );
  sections.push("");

  // The per-message / catch-all hooks below call `_unwrapMessage` to
  // flatten the SDK's `{ type, data, uploads? }` envelope into the
  // shape the typed message interfaces declare. Duplicated (rather
  // than imported from `./index.js`) so the React file stays
  // self-contained at runtime and the helper never surfaces in the
  // generated package's public exports. Only emitted when the schema
  // has at least one message — otherwise no hook references it.
  if (messages.length > 0) {
    sections.push(UNWRAP_MESSAGE_HELPER);
    sections.push("");
  }

  // Provider.
  sections.push(generateProviderComponent(modelPrefix, hasTracks));
  sections.push("");

  // use<Prefix>() hook.
  sections.push(generateUseModelHook(modelPrefix, events));

  // Per-message hooks.
  if (messages.length > 0) {
    sections.push("");
    sections.push(
      generateJsDoc(
        [
          `Subscribe to any ${modelPrefix} message with a fully-typed handler.`,
          `The handler receives a discriminated ${modelPrefix}Message.`,
        ],
        0,
      ) +
        `export function use${modelPrefix}Message(
  handler: (message: ${modelPrefix}Message) => void,
): void {
  useReactorMessage((msg: unknown) =>
    handler(_unwrapMessage<${modelPrefix}Message>(msg)),
  );
}`,
    );

    sections.push("");
    sections.push(generateReactHooksForMessages(modelPrefix, messages));
  }

  // Track hook: `use<Prefix>Track(name)` — reactive subscription to a
  // single recvonly MediaStreamTrack by name. Only emitted when the
  // schema declares at least one recvonly track; otherwise `name`
  // would be `never` and the hook uncallable.
  if (emitsTrackHook) {
    sections.push("");
    sections.push(generateTrackHook(modelPrefix));
  }

  // Per-track wrapper components. One component per video track in
  // each direction, name derived from the track name so callers never
  // have to re-type a string literal (`<EchoMainVideoView />` instead
  // of `<ReactorView track="main_video" />`).
  if (emitsViewComponents || emitsPublisherComponents) {
    sections.push("");
    sections.push(generateTrackComponents(modelPrefix, recvVideo, sendVideo));
  }

  sections.push("");
  return sections.join("\n");
}

/**
 * Emit `use<Prefix>Track(name)` — a reactive subscription to the
 * recvonly MediaStreamTrack with the given name. The hook returns
 * `undefined` before the track arrives and the live
 * `MediaStreamTrack` once it does. `name` is typed as
 * `<Prefix>RecvTrackName` so a typo is a compile error.
 */
function generateTrackHook(modelPrefix: string): string {
  const hookName = `use${modelPrefix}Track`;
  const nameType = `${modelPrefix}RecvTrackName`;
  return (
    generateJsDoc(
      [
        `Subscribe to a recvonly MediaStreamTrack the model publishes, by name.`,
        "",
        `Returns \`undefined\` until the model emits the track, then the live track for the lifetime of the connection. \`name\` is constrained to the model's declared recvonly channels — use one of \`${nameType}\`.`,
        "@param name - A recvonly track name declared by the model",
        "@returns The live MediaStreamTrack, or `undefined` until received",
      ],
      0,
    ) +
    `export function ${hookName}(
  name: ${nameType},
): MediaStreamTrack | undefined {
  return useReactor((s) => s.tracks[name]);
}`
  );
}

/**
 * Emit one React component per video track in each direction. For each:
 *
 *   - recvonly video → `<<Prefix><Track>View>` wraps `<ReactorView>`
 *     with `track` pre-bound to the schema-declared name. Audio track
 *     stays a caller-provided prop because `audioTrack` pairs with the
 *     video on the same `<video>` element and the schema can't know
 *     which audio track the caller wants to mix in.
 *
 *   - sendonly video → `<<Prefix><Track>View>` wraps `<WebcamStream>`
 *     with `track` pre-bound. Kept under the `View` suffix to match
 *     the recvonly naming — both sides visibly render a `<video>`
 *     element (preview for publish, output for receive), so one name
 *     pattern is correct for the whole surface.
 *
 * Only video tracks get components because `<ReactorView>` /
 * `<WebcamStream>` are both video-only today. Audio-only tracks would
 * need a bespoke `<audio>` mounting component the SDK doesn't ship.
 */
function generateTrackComponents(
  modelPrefix: string,
  recvVideo: TrackSchema[],
  sendVideo: TrackSchema[],
): string {
  const parts: string[] = [];

  // Each `<Prefix><Track>View>` exposes its props type as a `type` alias
  // rather than an empty `interface … extends …Props {}`. The two forms
  // are structurally identical, but `@typescript-eslint/no-empty-object-type`
  // (and the older `no-empty-interface`) fire on the empty-extension
  // form — both rules ship in `typescript-eslint`'s recommended config
  // and the Next.js default. Type aliases sidestep the rule and stay
  // mergeable downstream via intersections, which is the only
  // ergonomics consumers lose by giving up declaration merging here
  // (and consumers wrapping a generated component pretty much never
  // need declaration merging on its props type).
  for (const track of recvVideo) {
    const pascal = toPascalCase(track.name);
    const componentName = `${modelPrefix}${pascal}View`;
    const propsName = `${componentName}Props`;
    parts.push(
      `export type ${propsName} = Omit<ReactorViewProps, "track">;

${generateJsDoc(
  [
    `Render the model's "${track.name}" recvonly video track in a \`<video>\` element.`,
    "",
    `Thin wrapper around \`<ReactorView>\` with \`track\` pre-bound. Accepts every other \`ReactorViewProps\` (\`audioTrack\`, \`className\`, \`style\`, \`videoObjectFit\`, \`muted\`, …). Must be rendered inside \`<${modelPrefix}Provider>\`.`,
  ],
  0,
)}export function ${componentName}(
  props: ${propsName},
): ReactElement {
  return createElement(ReactorView, {
    ...props,
    track: ${JSON.stringify(track.name)},
  });
}`,
    );
  }

  for (const track of sendVideo) {
    const pascal = toPascalCase(track.name);
    const componentName = `${modelPrefix}${pascal}View`;
    const propsName = `${componentName}Props`;
    parts.push(
      `export type ${propsName} = Omit<WebcamStreamProps, "track">;

${generateJsDoc(
  [
    `Acquire the user's webcam and publish it to the model's "${track.name}" sendonly video channel.`,
    "",
    `Thin wrapper around \`<WebcamStream>\` with \`track\` pre-bound. Requests \`getUserMedia()\` on mount, auto-publishes when the connection reaches \`ready\`, cleans up on unmount. Must be rendered inside \`<${modelPrefix}Provider>\`.`,
  ],
  0,
)}export function ${componentName}(
  props: ${propsName},
): ReactElement {
  return createElement(WebcamStream, {
    ...props,
    track: ${JSON.stringify(track.name)},
  });
}`,
    );
  }

  return parts.join("\n\n");
}

// ---------------------------------------------------------------------------
// Full source file assembly
// ---------------------------------------------------------------------------

function generateSourceFile(options: CodegenOptions): string {
  const { schema } = options;
  const modelPrefix = toPascalCase(schema.modelName);
  const events = schema.events;
  const messages = schema.messages;
  const tracks = schema.tracks;
  const withReact = !!options.react;

  const needsFileRef = events.some(hasUploadRefParam);

  const sections: string[] = [];

  sections.push(
    `// Copyright (c) 2026 Reactor Technologies, Inc. All rights reserved.`,
  );
  sections.push("");
  sections.push(`// Auto-generated by @reactor-team/codegen — DO NOT EDIT`);
  sections.push(
    `// Model: ${schema.modelName} ${formatVersionForHeader(schema.modelVersion)}`,
  );
  sections.push("");

  // `"use client";` goes at the very top of `src/index.ts` when React
  // output is on, because the file re-exports from `./react.js` below
  // — i.e. the bundled `dist/index.js` contains the Provider + hooks,
  // so the whole module is a client-only boundary in the React Server
  // Components world. The plain-JS `Reactor` client below already only
  // runs in the browser (WebRTC doesn't exist server-side), so nothing
  // legitimate is lost by marking it client-only; consumers can still
  // import `MODEL_NAME` / types / the `Model` class from server
  // components via Next.js's client-reference passthrough.
  if (withReact) {
    sections.push(`"use client";`);
    sections.push("");
  }

  const imports = ["Reactor"];
  if (needsFileRef) imports.push("FileRef");
  sections.push(
    `import { ${imports.join(", ")} } from "@reactor-team/js-sdk";`,
  );

  // Re-export FileRef so consumers can import the class + its type
  // straight from `@reactor-models/<name>` instead of threading a
  // second import to `@reactor-team/js-sdk` just to annotate a
  // variable holding the result of `uploadFile()`. Gated on
  // `needsFileRef` so a model without upload-reference events never
  // carries a dead re-export.
  if (needsFileRef) {
    sections.push(`export { FileRef };`);
  }
  sections.push("");

  sections.push(
    `export const MODEL_NAME = ${JSON.stringify(schema.modelName)} as const;`,
  );
  sections.push(
    `export const MODEL_VERSION = ${JSON.stringify(formatVersionForModelConstant(schema.modelVersion))} as const;`,
  );

  if (tracks.length > 0) {
    sections.push("");
    sections.push(generateTrackConstants(modelPrefix, tracks));
    const trackTypes = generateTrackTypes(modelPrefix, tracks);
    if (trackTypes) {
      sections.push("");
      sections.push(trackTypes);
    }
  }

  for (const event of events) {
    const iface = generateParamInterface(modelPrefix, event);
    if (iface) {
      sections.push("");
      sections.push(iface);
    }
  }

  for (const message of messages) {
    sections.push("");
    sections.push(generateMessageInterface(modelPrefix, message));
  }

  if (messages.length > 0) {
    sections.push("");
    sections.push(generateMessageUnion(modelPrefix, messages));
  }

  sections.push("");
  sections.push(generateOptionsType(modelPrefix));
  // The class's `onMessage` / `on<Name>` wrappers call `_unwrapMessage`
  // to flatten the SDK's `{ type, data, uploads? }` envelope into the
  // shape the typed message interfaces declare. Only emitted when the
  // schema has at least one message — otherwise the class doesn't use
  // it and we'd ship dead code.
  if (messages.length > 0) {
    sections.push("");
    sections.push(UNWRAP_MESSAGE_HELPER);
  }
  sections.push("");
  sections.push(generateClientClass(modelPrefix, events, messages, tracks));

  // Re-export everything the React file defines so consumers only ever
  // import from `@reactor-models/<name>` — no `/react` subpath. The
  // re-export must come *after* every value declaration above, so the
  // circular `react.ts → index.ts` imports (for `MODEL_NAME`,
  // `<Prefix>Tracks`, etc.) resolve to fully-initialised bindings.
  if (withReact) {
    sections.push("");
    sections.push(`export * from "./react.js";`);
  }

  sections.push("");
  return sections.join("\n");
}

// ---------------------------------------------------------------------------
// Package scaffolding
// ---------------------------------------------------------------------------

function generatePackageJson(options: CodegenOptions): string {
  // Single entry at the package root — the Provider + hooks (when
  // `options.react`) live in `src/index.ts` alongside the plain-JS
  // client, so consumers never need a `/react` subpath.
  const exports: Record<string, Record<string, string>> = {
    ".": {
      types: "./dist/index.d.ts",
      import: "./dist/index.mjs",
      require: "./dist/index.js",
    },
  };

  // React is only a peer dependency when React emission is on. We list it
  // here (not `dependencies`) so consumers resolve to their own React
  // copy and we don't force-duplicate the renderer.
  const peerDependencies = options.react ? { react: ">=18" } : undefined;

  const pkg = {
    name: `@reactor-models/${options.schema.modelName}`,
    version: formatVersionForPackageJson(options.schema.modelVersion),
    description: `Strongly-typed SDK for the ${toPascalCase(options.schema.modelName)} model on Reactor`,
    main: "dist/index.js",
    module: "dist/index.mjs",
    types: "dist/index.d.ts",
    exports,
    files: ["dist", "README.md"],
    scripts: {
      build: "tsup",
    },
    dependencies: {
      "@reactor-team/js-sdk": `^${options.sdkVersion}`,
    },
    ...(peerDependencies ? { peerDependencies } : {}),
    devDependencies: {
      tsup: "^8.5.0",
      typescript: "^5.8.3",
      ...(options.react
        ? {
            "@types/react": "^18.0.0",
            react: "^18.0.0",
          }
        : {}),
    },
    keywords: [
      "reactor",
      options.schema.modelName,
      "sdk",
      "typed",
      ...(options.react ? ["react", "hooks"] : []),
    ],
    author: "Reactor Technologies, Inc.",
    license: "MIT",
  };
  return JSON.stringify(pkg, null, 2) + "\n";
}

function generateTsupConfig(_options: CodegenOptions): string {
  return `import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: true,
  sourcemap: true,
  clean: true,
});
`;
}

function generateTsConfig(): string {
  const config = {
    compilerOptions: {
      target: "ES2022",
      module: "ESNext",
      moduleResolution: "bundler",
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
      outDir: "dist",
      rootDir: "src",
      declaration: true,
    },
    include: ["src"],
    exclude: ["node_modules", "dist"],
  };
  return JSON.stringify(config, null, 2) + "\n";
}

// ---------------------------------------------------------------------------
// README emission lives in `./readme-emitter.ts`. See that module for
// the template loader, placeholder substitution, and per-event /
// per-message / per-track section emitters — the split keeps this file
// focused on TypeScript emission and parallels the webapp's
// `lib/model-api-doc.ts` layout.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Exported generator
// ---------------------------------------------------------------------------

export const generator = {
  generate(options: CodegenOptions): GeneratedPackage {
    const files = [
      { path: "src/index.ts", content: generateSourceFile(options) },
      { path: "package.json", content: generatePackageJson(options) },
      { path: "tsup.config.ts", content: generateTsupConfig(options) },
      { path: "tsconfig.json", content: generateTsConfig() },
      // README sits at the package root, not under `src/`, per npm
      // convention. `package.json`'s `files` array already lists it, so
      // `npm pack` picks it up automatically.
      { path: "README.md", content: generateReadme(options) },
    ];

    // When React output is on, emit `src/react.ts` as a sibling of
    // `src/index.ts`. The main file re-exports everything from it, so
    // the public surface is still a single root import — the split is
    // purely a source-layout concern. Slotted right after `src/index.ts`
    // for readable dry-run output.
    if (options.react) {
      files.splice(1, 0, {
        path: "src/react.ts",
        content: generateReactFile(options),
      });
    }

    return { files };
  },
};

// Re-export internal helpers for targeted unit testing.
// Public API consumers should only use `generator` / `generateModelSdk`.
export const __testing__ = {
  toPascalCase,
  toCamelCase,
  fieldSchemaToTsType,
  isUploadReference,
  generateParamInterface,
  generateMessageInterface,
  generateMessageUnion,
  generateTrackConstants,
  generateTrackTypes,
  generateTrackHook,
  generateTrackComponents,
  sendonlyTracks,
  recvonlyTracks,
  generateReactFile,
  stripBuildMetadata,
  formatVersionForHeader,
  formatVersionForPackageJson,
  formatVersionForModelConstant,
  sanitizeJsDocLine,
  enumValueToTs,
  descriptionToJsDocLines,
  descriptionSummary,
  generateJsDoc,
};
