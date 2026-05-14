// Copyright (c) 2026 Reactor Technologies, Inc. All rights reserved.

import type {
  EventSchema,
  FieldSchema,
  MessageSchema,
  ModelSchema,
  TrackSchema,
} from "./types.js";
import { toCamelCase, toPascalCase } from "./emitter.js";
import {
  loadReactorPublicMethodsFromDts,
  loadReactorStoreFieldsFromDts,
} from "./sdk-surface.js";

// ---------------------------------------------------------------------------
// Verifier — second-line defence between the parser/IR ingest and the emitter.
//
// Everything the emitter writes — class method names, exported type names,
// React hook names, component names, track-name string literals, JSDoc
// bodies, README text — flows from a `ModelSchema` IR. The parser
// (`src/openapi/parser.ts`) is the *first* security layer: it rejects
// malformed OpenAPI documents and constrains every name to a JS-identifier
// shape via `TOKEN_NAME_RE`. That regex is intentionally permissive
// (camelCase, PascalCase, snake_case all pass) so synthesised IRs in tests
// don't have to satisfy a stricter rule than the wire format.
//
// This file is the *second* layer. It runs on the parsed IR — i.e. on
// "the already-inflated object" — and applies the rules the emitter
// actually depends on:
//
//   1. STRICT name shape — every schema-defined identifier must follow
//      a canonical form so the emitter's PascalCase / camelCase
//      transformations can't produce surprising or ambiguous symbols.
//      Two flavours:
//        - Events / messages / tracks / fields are strict snake_case
//          (`STRICT_SNAKE_CASE_RE`) — they all become JS identifiers
//          downstream (method names, destructure keys), so hyphens
//          would land somewhere they aren't valid syntax.
//        - Model names are canonical "snake-or-kebab"
//          (`STRICT_MODEL_NAME_RE`) — they double as npm package
//          suffixes (`@reactor-models/my-cool-model`) and only ever
//          appear as a *prefix* in the emitted source (the emitter's
//          `toPascalCase` splits on both `_` and `-` so `my-cool-model`
//          becomes the `MyCoolModel` prefix unambiguously). Both
//          forms reject leading / trailing / consecutive separators.
//      Catches casing drift the parser's `TOKEN_NAME_RE` allows through
//      (e.g. `Foo_Bar` and `foo_bar` both passing through to clash on
//      `FooBar`).
//
//   2. RESERVED identifiers — names that, after case transformation,
//      would collide with the JS prototype chain (`__proto__`,
//      `constructor`, `toString`, `toJSON`, …), with JS reserved words
//      (`default`, `let`, `null`, `void`, …), with methods inherited
//      from `Reactor` (the generated class extends it — the list is
//      **auto-derived** from the installed `@reactor-team/js-sdk`'s
//      `dist/index.d.ts` at module load time, so any new public method
//      on a future js-sdk release flows through with no hand-edit
//      here), the scaffold's catch-all `onMessage`, the deprecated
//      `reactor` getter, the React hook's reserved fields (`status`,
//      `connect`, `disconnect`, `uploadFile`, `sendCommand`), or the
//      message discriminator field (`type`).
//
//   3. SURFACE COLLISION detection — every public symbol the emitter
//      would write is computed up front and de-duplicated across
//      *namespaces*. Catches:
//        - Two events colliding after camelCase: `set_prompt` and
//          `setPrompt` both producing `setPrompt()` (impossible after the
//          strict-snake-case gate, but kept for defence-in-depth).
//        - A recvonly track and a message both producing `on<X>`.
//        - A sendonly + recvonly track sharing the same name (would
//          collide on the `<Prefix>Tracks` array entries).
//        - Two emitted type names colliding after PascalCase
//          transformation.
//
//   4. DESCRIPTION sanitisation — strips ASCII C0 control characters,
//      zero-width / line-terminator chars (U+2028 / U+2029 / U+FEFF
//      etc.), and the JSDoc terminator sequence (`*` `/`). Caps
//      description length at `DESCRIPTION_MAX_LENGTH`. Returns a
//      sanitised *copy* of the IR; the caller's input object is never
//      mutated.
//
// The verifier is pure (IR in, IR out, no I/O) and intentionally runs
// *before* the emitter. A verification failure surfaces with a pinpoint
// name + collision context rather than as a TypeScript compile error
// in the consumer's project, which is otherwise where casing /
// shadowing problems show up first.
//
// JS / TS attack surface this stage actively guards against:
//
//   - Prototype pollution via `__proto__` / `constructor` / `prototype`
//     keys ingested through field names. `JSON.parse` treats these as
//     own properties (no proto-chain mutation), but the *generated*
//     `{ __proto__: value }` literal in TS would set the prototype at
//     consumer-runtime — and `Object.assign({}, params)` would re-leak
//     the polluted key. We reject these names outright.
//
//   - JSDoc breakout via a literal `*` `/` sequence terminating the
//     comment block early and letting subsequent text execute as
//     module-scope code at consumer import time. The emitter's
//     `sanitizeJsDocLine` does line-level escaping; the verifier does a
//     belt-and-braces pass that also catches descriptions inserted into
//     README markdown via the same field.
//
//   - Unicode-only line terminators (U+2028 / U+2029) hiding inside an
//     otherwise-quoted string and breaking emitted JS string literals.
//     `JSON.stringify` already escapes these in TS string literals, but
//     description text passes through to JSDoc *and* README markdown
//     where neither stage escapes them — the verifier strips them
//     instead.
//
//   - Reserved-word shadowing of class scaffold methods. An event
//     literally named `connect` would emit `class HeliosModel { …
//     async connect(): Promise<void> {…} } async connect(): Promise<void> {…}`
//     — a duplicate-method TS compile error. We reject pre-emit so the
//     error reads as a schema problem rather than a generator bug.
//
//   - DoS via pathologically long identifiers / descriptions. We cap
//     at sane limits (`MAX_IDENTIFIER_LENGTH`, `DESCRIPTION_MAX_LENGTH`)
//     so a hostile schema can't blow up generated bytes by orders of
//     magnitude or hang an editor on a multi-megabyte tooltip.
//
// Adding a new emitter feature: any new schema-derived symbol the
// emitter writes (e.g. a new generated method, a new emitted type
// name) MUST be reflected here. The collision check is the only place
// that knows the *full* surface — keeping it in lockstep with the
// emitter is part of the contract for landing emitter changes. Search
// for `RESERVED_*` / `claimMethod` / `claimType` / `claimHook` in this
// file and the matching emit site in `src/emitter.ts`.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Public error type
// ---------------------------------------------------------------------------

/**
 * Thrown by {@link verifySchema} when the IR fails verification. Carries
 * the *full list* of problems found — the verifier collects every
 * violation before throwing so a schema with seventeen collisions
 * surfaces all seventeen in one message rather than trickling them out
 * one rebuild at a time.
 */
export class CodegenVerificationError extends Error {
  /** Pre-formatted bullet list of every problem the verifier found. */
  readonly problems: readonly string[];

  constructor(problems: string[]) {
    const summary =
      problems.length === 1
        ? `Codegen verifier found 1 problem:\n  - ${problems[0]}`
        : `Codegen verifier found ${problems.length} problems:\n${problems
            .map((p) => `  - ${p}`)
            .join("\n")}`;
    super(summary);
    this.name = "CodegenVerificationError";
    // `Object.freeze` + `slice` so callers programmatically inspecting
    // `err.problems` can't accidentally mutate the verifier's record of
    // what went wrong.
    this.problems = Object.freeze(problems.slice());
  }
}

// ---------------------------------------------------------------------------
// Public options + entry
// ---------------------------------------------------------------------------

export interface VerifyOptions {
  /**
   * When true (default), descriptions are scrubbed of control
   * characters, zero-width / line-terminator chars, and the JSDoc
   * terminator sequence. The returned IR contains the sanitised values
   * — the input is never mutated either way.
   *
   * Set to false only for tests that need to exercise the unsanitised
   * path. Production codegen always runs with this on.
   */
  sanitizeDescriptions?: boolean;
}

/**
 * Validate a {@link ModelSchema} IR and return a sanitised copy.
 *
 * Runs four passes on the IR (see file-level comment for full detail):
 *
 *   1. Strict snake_case + reserved-identifier checks on every
 *      schema-defined name.
 *   2. Reserved-word and prototype-key checks against the emitter's
 *      transformed output (camelCase methods, PascalCase types).
 *   3. Cross-namespace surface-collision detection — every method,
 *      type, and hook the emitter would write is claimed up front and
 *      duplicates are reported with both call sites.
 *   4. Description sanitisation, returned in a fresh IR object.
 *
 * Throws {@link CodegenVerificationError} when any pass fails; the
 * error's `problems` array carries every violation for batch reporting.
 *
 * Pure: no I/O, no network, deterministic. Safe to call multiple times
 * on the same IR (idempotent — re-sanitising an already-sanitised IR
 * is a no-op).
 */
export function verifySchema(
  schema: ModelSchema,
  options: VerifyOptions = {},
): ModelSchema {
  const ctx = new VerifyContext();

  ctx.checkModelIdentity(schema);
  ctx.checkEvents(schema.events);
  ctx.checkMessages(schema.messages);
  ctx.checkTracks(schema.tracks);
  ctx.checkSurfaceCollisions(schema);

  if (ctx.problems.length > 0) {
    throw new CodegenVerificationError(ctx.problems);
  }

  return options.sanitizeDescriptions === false
    ? schema
    : sanitiseSchema(schema);
}

// ---------------------------------------------------------------------------
// Naming rules
// ---------------------------------------------------------------------------

/**
 * Strict snake_case for events / messages / tracks / fields: starts
 * with a lowercase letter; segments of one or more lowercase
 * alphanumerics joined by single underscores. Disallows consecutive
 * underscores, trailing underscores, leading digits, uppercase
 * letters, and hyphens. Capped at {@link MAX_IDENTIFIER_LENGTH}
 * characters so emitted identifiers stay readable in editor tooltips.
 *
 * Why stricter than the parser's `TOKEN_NAME_RE`: the parser intentionally
 * accepts any JS-identifier-shaped token because the wire format is
 * permissive. The emitter, however, runs every name through
 * `toCamelCase` / `toPascalCase` (split on separators, capitalise
 * segments). If both `foo_bar` and `Foo_Bar` reach the emitter they'd
 * collapse to the same `FooBar` symbol and produce duplicate emitted
 * definitions. Forcing one canonical input shape eliminates that whole
 * failure mode up front.
 *
 * Why no hyphens here (but yes hyphens in {@link STRICT_MODEL_NAME_RE}):
 * event / message / track / field names become JS *identifiers*
 * downstream — class methods, object-destructure keys, hook return
 * fields — and `foo-bar` isn't a valid identifier in any of those
 * positions. Model names are different: they only land as PascalCase
 * *prefixes* (which the emitter builds by splitting + concat) and as
 * raw npm package suffixes (which natively allow hyphens).
 */
const STRICT_SNAKE_CASE_RE = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;

/**
 * Strict canonical model-name shape: same form as
 * {@link STRICT_SNAKE_CASE_RE} but accepts `-` as an alternative
 * separator alongside `_`. Mixed separators in the same name are
 * permitted (`my-cool_model` is valid) — npm has no convention here
 * and rejecting the mix would be more surprising than letting it
 * through. The emitter's `toPascalCase` splits on both, so
 * `my-cool_model` and `my_cool-model` both produce the same
 * `MyCoolModel` prefix; that's a feature for consistency, not a
 * collision risk (a single schema only declares one model name).
 *
 * Forbids consecutive separators (`a--b`, `a__b`, `a-_b`), leading
 * separator (`-a`, `_a`), trailing separator (`a-`, `a_`), uppercase
 * letters, and any character outside lowercase alphanumerics + `_` /
 * `-`.
 */
const STRICT_MODEL_NAME_RE = /^[a-z][a-z0-9]*(?:[_-][a-z0-9]+)*$/;

const MAX_IDENTIFIER_LENGTH = 64;

/**
 * JS reserved words and contextual keywords. Strict snake_case already
 * excludes most reserved words (case mismatch — `Class`, `Default`),
 * but a handful — `default`, `let`, `null`, `void`, `enum`, `extends`,
 * `import`, `export`, `function`, `if`, `in`, `of`, `static`, `super`,
 * `this`, `true`, `false`, etc. — match the snake_case shape exactly.
 * An event literally named `default` is a TS compile error inside a
 * generated method declaration; we reject it here so the failure mode
 * reads as a schema problem instead of a "what is the codegen
 * producing?" mystery.
 *
 * The check is applied to the *input* name (snake_case), not the
 * camelCase transform. If the transform happens to be a reserved word
 * (e.g. event `import_data` → `importData`) it's still a valid
 * identifier and lands fine.
 */
const JS_RESERVED_WORDS = new Set<string>([
  "abstract",
  "arguments",
  "async",
  "await",
  "boolean",
  "break",
  "byte",
  "case",
  "catch",
  "char",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "double",
  "else",
  "enum",
  "eval",
  "export",
  "extends",
  "false",
  "final",
  "finally",
  "float",
  "for",
  "function",
  "goto",
  "if",
  "implements",
  "import",
  "in",
  "instanceof",
  "int",
  "interface",
  "let",
  "long",
  "native",
  "new",
  "null",
  "of",
  "package",
  "private",
  "protected",
  "public",
  "return",
  "short",
  "static",
  "super",
  "switch",
  "synchronized",
  "this",
  "throw",
  "throws",
  "transient",
  "true",
  "try",
  "typeof",
  "undefined",
  "var",
  "void",
  "volatile",
  "while",
  "with",
  "yield",
]);

/**
 * Object/Function prototype keys + JSON.stringify interception keys + a
 * couple from the class scaffold. Checked against:
 *
 *   - The *input* schema name (snake_case → e.g. `constructor`,
 *     `prototype`).
 *   - The *transformed output* of event names (camelCase) — that's
 *     where input `to_string` becomes the output `toString` that
 *     actually shadows `Object.prototype.toString` on the generated
 *     class instance.
 *   - The *field name* on every event/message — `{ __proto__: x }`
 *     in object-literal position is treated by the JS engine as
 *     setting the *prototype*, not as a `__proto__` own property.
 *     Even with strict snake-case excluding `__proto__` (leading
 *     underscores), we keep the explicit list as defence-in-depth so
 *     a future rule loosening doesn't open the hole.
 *
 * `toJSON` matters because `JSON.stringify(model)` calls `model.toJSON()`
 * if it exists. An event literally named `to_json` would camelCase to
 * `toJSON` and silently hijack every JSON serialisation of the
 * generated class instance — surprising, observable, and avoidable.
 */
const DANGEROUS_PROPERTY_KEYS = new Set<string>([
  // Object.prototype keys (and their legacy magic-method ancestors).
  "__proto__",
  "__defineGetter__",
  "__defineSetter__",
  "__lookupGetter__",
  "__lookupSetter__",
  "constructor",
  "hasOwnProperty",
  "isPrototypeOf",
  "propertyIsEnumerable",
  "prototype",
  "toLocaleString",
  "toString",
  "valueOf",
  // Function.prototype keys — relevant because the class methods we
  // emit are themselves Function instances.
  "apply",
  "bind",
  "call",
  // JSON serialisation interception.
  "toJSON",
]);

/**
 * Methods reachable on `<Prefix>Model` — either inherited from
 * {@link Reactor} (every public method on its prototype, since the
 * generated class is `extends Reactor`) or unconditionally written by
 * the emitter scaffold (`onMessage` when the schema declares messages).
 *
 * An event/message/track whose camelCase / `on<Pascal>` transform
 * matches one of these names would either shadow an inherited method
 * (silent override at runtime) or compile-error on duplicate-method
 * declaration. The verifier rejects both up front.
 *
 * The Reactor portion is **derived automatically** from the installed
 * `@reactor-team/js-sdk` package's `index.d.ts` at module-load time
 * (see {@link loadReactorPublicMethodsFromDts}). No hand-maintained
 * mirror — any public method `js-sdk` declares is picked up on the
 * next `defaultSdkVersion` bump, including future additions (e.g. the
 * recording stack's `requestClip` / `requestRecording` /
 * `downloadClipAsFile`).
 *
 * Only the scaffold-only `onMessage` name has to be added explicitly,
 * because it's not declared on Reactor itself but is unconditionally
 * emitted by the codegen onto every subclass that has messages.
 */
const RESERVED_CLASS_METHODS: Set<string> = (() => {
  const set = loadReactorPublicMethodsFromDts();
  // Scaffold-only: the emitter writes a typed `onMessage` wrapper onto
  // the subclass when the schema declares at least one message. It's
  // NOT on Reactor.prototype, so the d.ts loader doesn't see it.
  set.add("onMessage");
  return set;
})();

// The d.ts loader implementations live in `./sdk-surface.ts` so the
// same parse can feed the emitter's React hook generation. Verifier
// and emitter share one source of truth and one disk read.

/**
 * Properties on the `<Prefix>Model` instance. `reactor` is the
 * underlying SDK handle — an event named `reactor` (i.e. camelCase
 * `reactor`) would replace the property accessor with a no-arg async
 * method.
 */
const RESERVED_CLASS_PROPERTIES = new Set<string>(["reactor"]);

/**
 * Fields the React `use<Prefix>()` hook always returns. An event whose
 * camelCase transform matches one of these would land twice in the
 * returned object literal and either compile-error or silently
 * override the built-in.
 *
 * Auto-derived from the installed `@reactor-team/js-sdk`'s d.ts via
 * the shared `loadReactorStoreFieldsFromDts` loader, so any new field
 * on `ReactorState` / `ReactorActions` (e.g. a future
 * `requestClip: (s: number) => Promise<Clip>` on actions) flows in
 * without a hand-edit here AND simultaneously gets emitted as a
 * selector by `generateUseModelHook` in `emitter.ts` — single source
 * of truth.
 */
const RESERVED_HOOK_FIELDS: Set<string> = loadReactorStoreFieldsFromDts();

/**
 * Field names reserved inside a *message* schema only. `type` is the
 * discriminator the emitter writes onto every message interface; a
 * schema-declared field of the same name would emit a duplicate-key
 * TS compile error.
 *
 * Event params have no equivalent reserved field (no discriminator,
 * no scaffold members beyond the user's own keys).
 */
const RESERVED_MESSAGE_FIELD_NAMES = new Set<string>(["type"]);

// ---------------------------------------------------------------------------
// Verification context — collects problems, runs section walkers.
// ---------------------------------------------------------------------------

class VerifyContext {
  readonly problems: string[] = [];

  fail(message: string): void {
    this.problems.push(message);
  }

  // -------------------------------------------------------------------------
  // Per-section walkers — all are best-effort: a name that fails the shape
  // check is recorded, then skipped for downstream namespace claims so the
  // collision detector doesn't double-report against an obviously broken
  // input. The shape gate doubles as a gate on `toCamelCase` /
  // `toPascalCase` correctness — both helpers are defined for any
  // identifier-shaped string, but their output is only *meaningful* on
  // strict snake_case input.
  // -------------------------------------------------------------------------

  /**
   * True iff `name` passes shape + reserved-word + dangerous-key gates.
   *
   * `regex` defaults to {@link STRICT_SNAKE_CASE_RE} for the common case
   * (events / messages / tracks / fields). Pass
   * {@link STRICT_MODEL_NAME_RE} for model names — they additionally
   * accept `-` as a separator since they double as npm package
   * suffixes. `shape` is the human-readable name of the rule used in
   * the error message; without it the rejection text would just be a
   * regex source string, which is less actionable than "strict
   * snake_case" or "canonical model-name shape".
   */
  private validateName(
    value: unknown,
    context: string,
    regex: RegExp = STRICT_SNAKE_CASE_RE,
    shape: string = "strict snake_case",
  ): boolean {
    if (typeof value !== "string" || value.length === 0) {
      this.fail(`${context}: missing or non-string name`);
      return false;
    }
    if (value.length > MAX_IDENTIFIER_LENGTH) {
      this.fail(
        `${context}: name ${JSON.stringify(value)} is longer than ` +
          `${MAX_IDENTIFIER_LENGTH} characters`,
      );
      return false;
    }
    if (!regex.test(value)) {
      this.fail(
        `${context}: name ${JSON.stringify(value)} is not ${shape} ` +
          `(must match ${regex.source})`,
      );
      return false;
    }
    if (JS_RESERVED_WORDS.has(value)) {
      this.fail(
        `${context}: name ${JSON.stringify(value)} is a reserved JS keyword`,
      );
      return false;
    }
    if (DANGEROUS_PROPERTY_KEYS.has(value)) {
      this.fail(
        `${context}: name ${JSON.stringify(value)} is a reserved ` +
          `Object/Function prototype key`,
      );
      return false;
    }
    return true;
  }

  checkModelIdentity(schema: ModelSchema): void {
    // Model names use the looser `STRICT_MODEL_NAME_RE` (accepts `-`)
    // because they double as npm package suffixes (`@reactor-models/<name>`),
    // and `@reactor-models/my-cool-model` is the conventional package
    // shape. The emitter's `toPascalCase` splits on both `_` and `-`
    // so the prefix derivation still produces a valid TS identifier
    // (`my-cool-model` → `MyCoolModel`).
    this.validateName(
      schema.modelName,
      "info.title (model name)",
      STRICT_MODEL_NAME_RE,
      "a canonical model name (lowercase letters/digits with single `_` or `-` separators)",
    );
    if (
      typeof schema.modelVersion !== "string" ||
      schema.modelVersion.length === 0
    ) {
      this.fail("info.version (model version): missing or empty");
    }
    // We deliberately don't tighten the version regex past what the
    // parser already enforces — the emitter normalises versions via
    // `formatVersionForPackageJson` (npm semver) and the parser's
    // `MODEL_VERSION_RE` already excludes shell / code injection
    // characters. Doubling up here would just mean two places to keep
    // in sync without buying additional security.
  }

  checkEvents(events: EventSchema[]): void {
    const seenEventNames = new Set<string>();
    for (const event of events) {
      const ok = this.validateName(event.name, "event name");
      if (!ok) continue;

      if (seenEventNames.has(event.name)) {
        this.fail(`event name ${JSON.stringify(event.name)} is duplicated`);
      }
      seenEventNames.add(event.name);

      // The emitter turns the event name into a camelCase method on
      // `<Prefix>Model` and a same-named field on `use<Prefix>()`'s
      // return. Every reserved set below is checked against the
      // *transformed* output, not the input.
      const camel = toCamelCase(event.name);
      if (DANGEROUS_PROPERTY_KEYS.has(camel)) {
        this.fail(
          `event ${JSON.stringify(event.name)} would emit method ` +
            `\`${camel}()\`, shadowing a JS prototype-chain key ` +
            `(e.g. ${camel} on Object.prototype) on the generated client class`,
        );
      }
      if (RESERVED_CLASS_METHODS.has(camel)) {
        this.fail(
          `event ${JSON.stringify(event.name)} would emit method ` +
            `\`${camel}()\`, shadowing the built-in \`${camel}()\` on the ` +
            `generated client class (inherited from Reactor or built into the scaffold)`,
        );
      }
      if (RESERVED_CLASS_PROPERTIES.has(camel)) {
        this.fail(
          `event ${JSON.stringify(event.name)} would emit method ` +
            `\`${camel}()\`, shadowing the \`${camel}\` property on the ` +
            `generated client class`,
        );
      }
      if (RESERVED_HOOK_FIELDS.has(camel)) {
        this.fail(
          `event ${JSON.stringify(event.name)} would emit a field on ` +
            `\`use<Prefix>()\`'s return named \`${camel}\`, shadowing the ` +
            `built-in field`,
        );
      }

      this.checkFields(event.name, "event", event.fields);
    }
  }

  checkMessages(messages: MessageSchema[]): void {
    const seenMessageNames = new Set<string>();
    for (const message of messages) {
      const ok = this.validateName(message.name, "message name");
      if (!ok) continue;

      if (seenMessageNames.has(message.name)) {
        this.fail(`message name ${JSON.stringify(message.name)} is duplicated`);
      }
      seenMessageNames.add(message.name);

      this.checkFields(message.name, "message", message.fields);
    }
  }

  checkTracks(tracks: TrackSchema[]): void {
    const seenTrackNames = new Set<string>();
    for (const track of tracks) {
      const ok = this.validateName(track.name, "track name");
      if (!ok) continue;

      if (seenTrackNames.has(track.name)) {
        // Same track name in different directions would also collide
        // on the `<Prefix>Tracks` constant array entries (the emitter
        // emits one entry per declared track) and on the `<Prefix>Send-` /
        // `<Prefix>RecvTrackName` type unions. One name, one direction.
        this.fail(
          `track name ${JSON.stringify(track.name)} is duplicated ` +
            `(possibly across directions; one name per track)`,
        );
      }
      seenTrackNames.add(track.name);
    }
  }

  checkFields(
    parentName: string,
    parentKind: "event" | "message",
    fields: Record<string, FieldSchema>,
  ): void {
    // Iterate via Object.keys so we walk only own enumerable string keys
    // — defensive against hand-rolled IRs that built `fields` from a
    // proto-polluted object.
    for (const fieldName of Object.keys(fields)) {
      if (typeof fieldName !== "string" || fieldName.length === 0) {
        this.fail(
          `${parentKind} ${JSON.stringify(parentName)}: empty field name`,
        );
        continue;
      }
      if (fieldName.length > MAX_IDENTIFIER_LENGTH) {
        this.fail(
          `${parentKind} ${JSON.stringify(parentName)}: field name ` +
            `${JSON.stringify(fieldName)} exceeds ${MAX_IDENTIFIER_LENGTH} ` +
            `characters`,
        );
      }
      if (!STRICT_SNAKE_CASE_RE.test(fieldName)) {
        this.fail(
          `${parentKind} ${JSON.stringify(parentName)}: field name ` +
            `${JSON.stringify(fieldName)} is not strict snake_case`,
        );
      }
      if (DANGEROUS_PROPERTY_KEYS.has(fieldName)) {
        // `__proto__` as a field name in an object-literal position is
        // a prototype setter at consumer-runtime — the TS emitter would
        // produce `{ __proto__: value }` and any consumer destructure /
        // spread would drag the polluted prototype along.
        this.fail(
          `${parentKind} ${JSON.stringify(parentName)}: field name ` +
            `${JSON.stringify(fieldName)} is a reserved Object/Function ` +
            `prototype key`,
        );
      }
      if (
        parentKind === "message" &&
        RESERVED_MESSAGE_FIELD_NAMES.has(fieldName)
      ) {
        // `type` is the discriminator the emitter unconditionally writes
        // onto every message interface; a schema-declared `type` field
        // would compile-error on duplicate keys.
        this.fail(
          `message ${JSON.stringify(parentName)}: field name ` +
            `${JSON.stringify(fieldName)} collides with the discriminator ` +
            `field the emitter writes`,
        );
      }
    }
  }

  // -------------------------------------------------------------------------
  // Cross-namespace surface-collision detection.
  //
  // The emitter writes symbols into four distinct namespaces:
  //
  //   1. Class methods on `<Prefix>Model` (camelCase identifiers).
  //   2. Top-level types/interfaces with the `<Prefix>` prefix (PascalCase).
  //   3. React hooks named `use<Prefix><Suffix>` (camelCase suffix; "" is
  //      the catch-all `use<Prefix>()` hook).
  //   4. Track-name string literals inside the `<Prefix>Tracks` constant
  //      array (already covered by `checkTracks` above — duplicates fail
  //      there before we get here).
  //
  // Within each namespace, `claim*` records the first source for a name
  // and reports both call sites if a second one shows up.
  // -------------------------------------------------------------------------

  checkSurfaceCollisions(schema: ModelSchema): void {
    this.checkClassMethodCollisions(schema);
    this.checkTypeCollisions(schema);
    this.checkHookCollisions(schema);
  }

  private checkClassMethodCollisions(schema: ModelSchema): void {
    // The class scaffold inherits every Reactor public method (via
    // `extends Reactor` in the emitter output) and unconditionally
    // writes `onMessage` when the schema has messages. They count as
    // the "first source" so an event / message / track that would
    // emit a duplicate is reported with both sides of the conflict.
    //
    // The Reactor-side claims are seeded from the SAME d.ts-derived
    // set the rule-level check uses — so when js-sdk grows a method
    // (e.g. recording adds `requestClip`), both the rejection and the
    // error message flow through automatically without a second list
    // to maintain.
    const claims = new Map<string, string>();
    for (const name of RESERVED_CLASS_METHODS) {
      if (name === "onMessage") {
        claims.set(name, "built-in catch-all `onMessage()` listener");
      } else {
        claims.set(
          name,
          `inherited \`${name}()\` from \`Reactor\` (base class)`,
        );
      }
    }

    const claim = (name: string, source: string): void => {
      const prior = claims.get(name);
      if (prior !== undefined) {
        this.fail(
          `class method \`${name}\` is emitted twice: ${prior}, and ${source}`,
        );
        return;
      }
      claims.set(name, source);
    };

    for (const event of schema.events) {
      if (!STRICT_SNAKE_CASE_RE.test(event.name)) continue;
      claim(toCamelCase(event.name), `event "${event.name}"`);
    }
    for (const message of schema.messages) {
      if (!STRICT_SNAKE_CASE_RE.test(message.name)) continue;
      claim(`on${toPascalCase(message.name)}`, `message "${message.name}"`);
    }
    for (const track of schema.tracks) {
      if (!STRICT_SNAKE_CASE_RE.test(track.name)) continue;
      const pascal = toPascalCase(track.name);
      if (track.direction === "in") {
        // Sendonly: publish<Track> + unpublish<Track>.
        claim(`publish${pascal}`, `sendonly track "${track.name}"`);
        claim(`unpublish${pascal}`, `sendonly track "${track.name}"`);
      } else {
        // Recvonly: on<Track> — same shape as message subscription
        // helpers, which is exactly why the cross-section check matters.
        claim(`on${pascal}`, `recvonly track "${track.name}"`);
      }
    }
  }

  private checkTypeCollisions(schema: ModelSchema): void {
    // Type/interface names land at the top of `src/index.ts` with the
    // `<Prefix>` prefix applied uniformly. The `<Prefix>` part is the
    // same for everything in this namespace, so we can compare bare
    // suffixes safely.
    const claims = new Map<string, string>([
      ["Model", "built-in `<Prefix>Model` client class"],
      ["Options", "built-in `<Prefix>Options` interface"],
      ["Tracks", "built-in `<Prefix>Tracks` constant"],
      ["Message", "built-in `<Prefix>Message` discriminated union"],
      ["Provider", "built-in `<Prefix>Provider` React component"],
      ["ProviderProps", "built-in `<Prefix>ProviderProps` interface"],
      ["SendTrackName", "built-in `<Prefix>SendTrackName` union"],
      ["RecvTrackName", "built-in `<Prefix>RecvTrackName` union"],
    ]);

    const claim = (name: string, source: string): void => {
      const prior = claims.get(name);
      if (prior !== undefined) {
        this.fail(
          `type/interface \`<Prefix>${name}\` is emitted twice: ${prior}, ` +
            `and ${source}`,
        );
        return;
      }
      claims.set(name, source);
    };

    for (const event of schema.events) {
      if (!STRICT_SNAKE_CASE_RE.test(event.name)) continue;
      claim(`${toPascalCase(event.name)}Params`, `event "${event.name}"`);
    }
    for (const message of schema.messages) {
      if (!STRICT_SNAKE_CASE_RE.test(message.name)) continue;
      claim(
        `${toPascalCase(message.name)}Message`,
        `message "${message.name}"`,
      );
    }
    for (const track of schema.tracks) {
      if (!STRICT_SNAKE_CASE_RE.test(track.name)) continue;
      // The emitter currently emits `<Prefix><Track>View` /
      // `<Prefix><Track>ViewProps` only for video tracks. We claim the
      // names regardless of `kind` so a future rule that broadens the
      // emit (audio components, say) can't silently produce a clash.
      const pascal = toPascalCase(track.name);
      claim(`${pascal}View`, `track "${track.name}" component`);
      claim(`${pascal}ViewProps`, `track "${track.name}" component props`);
    }
  }

  private checkHookCollisions(schema: ModelSchema): void {
    // React hook namespace: `use<Prefix>` plus a `<Suffix>` per kind.
    // Suffixes are tracked rather than the full hook name so a future
    // change to the prefix scheme doesn't require adjusting this map.
    //
    // The empty-string suffix is the bare `use<Prefix>()` command hook;
    // listed here so an emitter feature accidentally trying to emit a
    // second `use<Prefix>` would fail loud.
    const claims = new Map<string, string>([
      ["", "built-in `use<Prefix>()` command hook"],
      ["Message", "built-in catch-all `use<Prefix>Message()` hook"],
      ["Track", "built-in `use<Prefix>Track(name)` hook"],
    ]);

    const claim = (suffix: string, source: string): void => {
      const prior = claims.get(suffix);
      if (prior !== undefined) {
        this.fail(
          `React hook \`use<Prefix>${suffix}\` is emitted twice: ${prior}, ` +
            `and ${source}`,
        );
        return;
      }
      claims.set(suffix, source);
    };

    for (const message of schema.messages) {
      if (!STRICT_SNAKE_CASE_RE.test(message.name)) continue;
      claim(toPascalCase(message.name), `message "${message.name}"`);
    }
  }
}

// ---------------------------------------------------------------------------
// Description sanitisation.
//
// Description text reaches the emitter via three paths:
//
//   1. JSDoc bodies in `src/index.ts` and `src/react.ts` — line-escaped
//      by the emitter's `sanitizeJsDocLine`, but only at line
//      granularity (CR/LF/U+2028/U+2029 → space, `*` `/` → `*\/`).
//   2. Markdown text in the generated README — the README emitter does
//      table-cell escaping (`|`, `\n`) but otherwise passes prose
//      through untouched (intentionally — Markdown allows HTML and we
//      don't want to strip the author's intentional formatting).
//   3. Verbatim default-value rendering in JSDoc via
//      `JSON.stringify(field.default)` — already safe because
//      `JSON.stringify` produces a valid JS string literal with every
//      control / quote / backslash byte escaped.
//
// Path 3 is fine. Paths 1 and 2 share a need: the description text must
// not contain the JSDoc terminator (`*` `/`), zero-width or
// line-terminator chars that hide outside the visible glyph stream
// (U+2028 / U+2029 / U+FEFF / U+200B-F), or ASCII C0 control chars that
// editors often misrender. We strip those once here so the emitter and
// the README emitter receive sanitised input — defence-in-depth on top
// of `sanitizeJsDocLine`.
//
// We DO preserve `\t` / `\n` / `\r` so multi-line author prose still
// wraps reasonably in Markdown. The emitter's line-by-line pass collapses
// those when rendering JSDoc.
// ---------------------------------------------------------------------------

const DESCRIPTION_MAX_LENGTH = 4096;

/**
 * Strip control characters, zero-width / line-terminator chars, and the
 * JSDoc terminator sequence from a description string. Returns
 * `undefined` if the input is not a string. Idempotent.
 */
function sanitiseDescription(s: string | undefined): string | undefined {
  if (s === undefined) return undefined;
  if (typeof s !== "string") return undefined;

  let out = s
    // ASCII C0 control chars except `\t` (U+0009), `\n` (U+000A), `\r`
    // (U+000D); plus DEL (U+007F). Replaced with space rather than
    // dropped so adjacent words don't run together.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    // Zero-width and line-terminator chars that are invisible in editor
    // tooltips but break JSDoc, JSON, and string-literal escaping in
    // subtle ways. U+FEFF is the BOM, which is a no-op visually but
    // confuses some markdown renderers.
    .replace(/[\u200B-\u200F\u2028\u2029\uFEFF]/g, "")
    // Belt-and-braces: neutralise the JSDoc terminator. The emitter's
    // `sanitizeJsDocLine` does this too, but README markdown doesn't,
    // and a literal `*` `/` followed by other markdown is at best
    // confusing and at worst (in editors that render JSDoc tooltips on
    // markdown) a vector.
    .replace(/\*\//g, "*\\/");

  if (out.length > DESCRIPTION_MAX_LENGTH) {
    // `…` (U+2026) terminator preserves the truncation in editor
    // tooltips without inserting an extra `\n` that could break
    // surrounding formatting.
    out = out.slice(0, DESCRIPTION_MAX_LENGTH) + "…";
  }
  return out;
}

function sanitiseField(field: FieldSchema): FieldSchema {
  // Spread copies own enumerable properties — fine because the parser
  // produces plain `FieldSchema` objects with no prototype trickery.
  // `description` is the only string field that reaches an emitter
  // surface that doesn't already escape via `JSON.stringify`.
  return {
    ...field,
    description: sanitiseDescription(field.description),
  };
}

function sanitiseFields(
  fields: Record<string, FieldSchema>,
): Record<string, FieldSchema> {
  // Null-prototype output: defence-in-depth against a hostile IR that
  // crept past the parser's `requireName` check (e.g. via direct
  // construction in test code). The verifier's `checkFields` already
  // rejects `__proto__` / `constructor` keys, but the cost of a
  // `Object.create(null)` is a single pointer set and the upside is
  // that the returned object can never accidentally inherit
  // `Object.prototype` methods that the emitter / consumer would treat
  // as "schema-declared" fields.
  const out: Record<string, FieldSchema> = Object.create(null);
  for (const [name, field] of Object.entries(fields)) {
    out[name] = sanitiseField(field);
  }
  return out;
}

function sanitiseEvent(event: EventSchema): EventSchema {
  return {
    name: event.name,
    description: sanitiseDescription(event.description) ?? "",
    fields: sanitiseFields(event.fields),
  };
}

function sanitiseMessage(message: MessageSchema): MessageSchema {
  return {
    name: message.name,
    description: sanitiseDescription(message.description) ?? "",
    fields: sanitiseFields(message.fields),
  };
}

function sanitiseSchema(schema: ModelSchema): ModelSchema {
  return {
    modelName: schema.modelName,
    modelVersion: schema.modelVersion,
    events: schema.events.map(sanitiseEvent),
    messages: schema.messages.map(sanitiseMessage),
    // Track records have no description fields today; spread-copy keeps
    // the IR-clone semantic and keeps this function future-proof if a
    // description field is ever added to `TrackSchema`.
    tracks: schema.tracks.map((t) => ({ ...t })),
  };
}

// ---------------------------------------------------------------------------
// Re-export internals for unit testing.
// Public consumers should only use `verifySchema` / `CodegenVerificationError`.
// ---------------------------------------------------------------------------

export const __testing__ = {
  STRICT_SNAKE_CASE_RE,
  STRICT_MODEL_NAME_RE,
  MAX_IDENTIFIER_LENGTH,
  DESCRIPTION_MAX_LENGTH,
  JS_RESERVED_WORDS,
  DANGEROUS_PROPERTY_KEYS,
  RESERVED_CLASS_METHODS,
  RESERVED_CLASS_PROPERTIES,
  RESERVED_HOOK_FIELDS,
  RESERVED_MESSAGE_FIELD_NAMES,
  sanitiseDescription,
  sanitiseSchema,
};
