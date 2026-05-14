// Copyright (c) 2026 Reactor Technologies, Inc. All rights reserved.

// ---------------------------------------------------------------------------
// SDK-surface introspection.
//
// The codegen needs to know *which symbols* the installed
// `@reactor-team/js-sdk` exposes so the verifier can reject schema
// shapes that would shadow them, and so the emitter can wire React
// hooks / provider props without naming SDK fields by hand.
//
// Both concerns share the same source of truth: the d.ts file that
// ships in the installed `@reactor-team/js-sdk` package
// (`dist/index.d.ts`). The file is uniformly formatted by `tsup`
// (4-space class-body and interface-body indent, visibility keywords
// preserved on class members), so a small handful of regexes give us
// exactly the public surface — without parsing a TypeScript AST and
// without adding a typescript runtime dependency.
//
// This module is the only place that touches the filesystem / parses
// the d.ts. Verifier and emitter both import the surface getters
// below, so the d.ts is read once per codegen process (the loader
// caches the file contents in a module-level closure).
//
// Why parse the d.ts and not introspect at runtime (e.g.
// `Object.getOwnPropertyNames(Reactor.prototype)`):
//
//   - The prototype walk includes TS-`private` methods, which survive
//     compilation because TS visibility is compile-time only. Those
//     methods are NOT inheritable in the type system, so a schema
//     event of the same name cannot collide with them.
//   - The d.ts emission, on the other hand, preserves the `private`
//     keyword (e.g. `private setStatus;`), so the loader sees exactly
//     the type-visible public surface — which is what `extends
//     Reactor` actually exposes to a subclass author.
//   - Interfaces (`ReactorState`, `ReactorActions`) only exist at
//     compile time; the d.ts is the only place they're observable.
//
// If the d.ts shape ever changes (a future tsup major, an
// api-extractor migration, …), each loader's internal floor check
// trips at codegen startup with a pointed error rather than silently
// shipping under-protected verifier output.
// ---------------------------------------------------------------------------

import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Read the installed `@reactor-team/js-sdk` package's bundled
 * `index.d.ts`. Cached at module scope — every loader below shares
 * one disk read per codegen process.
 */
let cachedDts: string | null = null;
function loadSdkDts(): string {
  if (cachedDts !== null) return cachedDts;
  // `require.resolve` locates the package's main entry; the d.ts ships
  // alongside it under `dist/index.d.ts` (tsup config in js-sdk). Walk
  // up one level to reach the d.ts. Works in both pnpm-workspace mode
  // (symlinked source build) and published-npm mode (real tarball).
  const sdkEntry = require.resolve("@reactor-team/js-sdk");
  const dtsPath = path.join(path.dirname(sdkEntry), "index.d.ts");
  cachedDts = fs.readFileSync(dtsPath, "utf-8");
  return cachedDts;
}

// ---------------------------------------------------------------------------
// `Reactor` class — public methods
// ---------------------------------------------------------------------------

/**
 * Names of every non-private/protected method declared on the
 * {@link Reactor} class in the installed SDK's d.ts.
 *
 * Consumed by:
 *
 *   - `RESERVED_CLASS_METHODS` in `verifier.ts` — rejects schemas that
 *     would emit a method whose camelCase form shadows an inherited
 *     Reactor method on the generated `<Prefix>Model extends Reactor`.
 *   - (indirectly) `checkClassMethodCollisions` in `verifier.ts` —
 *     seeds the per-name error-message catalog from the same set.
 *
 * Throws if the d.ts cannot be read, the `declare class Reactor`
 * block cannot be located, or the floor check (must find `connect` /
 * `disconnect` / `sendCommand`) fails. Hard-failing at codegen
 * startup is preferred to silently emitting an under-protected
 * verifier.
 */
export function loadReactorPublicMethodsFromDts(): Set<string> {
  const dts = loadSdkDts();

  // Find the `declare class Reactor` block. The trailing `^}` anchors
  // on a top-level `}` (no indentation) so a nested object literal in
  // a method signature doesn't terminate the match early.
  //
  // The negative lookahead `(?![A-Za-z0-9_$])` enforces a clean name
  // boundary so a future `Reactor$1` (tsup's roll-up naming when two
  // exports collide) doesn't accidentally hijack the match. See
  // `extractInterfaceFieldNames` for the same anchor used on
  // interfaces.
  const classMatch = dts.match(
    /declare class Reactor(?![A-Za-z0-9_$])[^{]*\{([\s\S]*?)^\}/m,
  );
  if (!classMatch) {
    throw new Error(
      "Codegen sdk-surface: could not locate `declare class Reactor` block " +
        "in @reactor-team/js-sdk d.ts. The d.ts format may have changed; " +
        "update the regex in `loadReactorPublicMethodsFromDts`.",
    );
  }
  const body = classMatch[1];

  // Method declarations at the class's 4-space indent. Negative
  // lookahead skips `private ` / `protected ` members (those don't
  // form part of the inheritable surface). We require `(` or `<`
  // immediately after the name so the regex doesn't accidentally
  // match property declarations like `readonly recording:
  // RecordingClient;` — properties are surfaced separately if a
  // future caller ever needs them.
  const methodRe = /^ {4}(?!private |protected )([a-zA-Z_$][\w$]*)\s*[(<]/gm;
  const out = new Set<string>();
  for (const match of body.matchAll(methodRe)) {
    const name = match[1];
    if (name !== "constructor") out.add(name);
  }

  // Sanity floor: the loader must find AT LEAST the canonical
  // lifecycle surface. A zero-result parse almost certainly means the
  // d.ts shape has changed in a way the regex doesn't tolerate;
  // surfacing that here is more useful than silently shipping an
  // under-protected verifier set.
  for (const required of ["connect", "disconnect", "sendCommand"]) {
    if (!out.has(required)) {
      throw new Error(
        "Codegen sdk-surface: d.ts parse did not find the " +
          `\`${required}\` method on the Reactor class. The d.ts shape may ` +
          "have changed; update `loadReactorPublicMethodsFromDts`.",
      );
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// `ReactorStore` (Zustand store) — public fields
// ---------------------------------------------------------------------------

/**
 * Names of every public field on the `ReactorStore` type
 * (`ReactorState & ReactorActions`) the SDK exposes through
 * `useReactor((s) => s.X)`.
 *
 * Excludes the `internal` field on `ReactorInternalState` — it's a
 * back-channel for the SDK's own React layer and not part of the
 * surface generated `<Prefix>Provider` consumers should reach for.
 *
 * Consumed by:
 *
 *   - `RESERVED_HOOK_FIELDS` in `verifier.ts` — rejects schemas that
 *     would emit a field name on `use<Prefix>()`'s return literal
 *     that shadows a store field.
 *   - `generateUseModelHook` in `emitter.ts` — emits one
 *     `const X = useReactor((s) => s.X);` selector per field, then
 *     spreads them into the hook's return object.
 *
 * The dual use means a future SDK release that adds e.g. `requestClip`
 * to `ReactorActions` lights up BOTH the rejection rule (so a schema
 * can't declare a `request_clip` event) AND the hook surface (so
 * `const { requestClip } = useHelios()` works at the consumer's React
 * tree) with no codegen edit.
 */
export function loadReactorStoreFieldsFromDts(): Set<string> {
  const dts = loadSdkDts();

  // The store type is `type ReactorStore = ReactorState & ReactorActions &
  // { internal: ReactorInternalState };` — we union the two named
  // interfaces and drop `internal`. Look up each by name; both blocks
  // are at top-level indent and have the same shape.
  const stateFields = extractInterfaceFieldNames(dts, "ReactorState");
  const actionFields = extractInterfaceFieldNames(dts, "ReactorActions");

  const out = new Set<string>([...stateFields, ...actionFields]);
  out.delete("internal");

  // Floor check: every store consumer relies on `status` + `connect` +
  // `disconnect` + `sendCommand`. If any is missing the d.ts parse
  // has regressed.
  for (const required of ["status", "connect", "disconnect", "sendCommand"]) {
    if (!out.has(required)) {
      throw new Error(
        "Codegen sdk-surface: d.ts parse did not find " +
          `\`${required}\` on ReactorState/ReactorActions. The d.ts shape ` +
          "may have changed; update `loadReactorStoreFieldsFromDts`.",
      );
    }
  }
  return out;
}

/**
 * Pull the field names out of a top-level `interface Foo { ... }`
 * block in the SDK's d.ts. Returns an empty set if the interface is
 * absent — caller decides whether that's a hard error (the
 * floor-check in {@link loadReactorStoreFieldsFromDts} does for the
 * two interfaces it cares about).
 *
 * Field shapes covered (4-space indent, optional `?` for optional
 * properties, both property and method signatures):
 *
 *   `    status: ReactorStatus;`
 *   `    lastError?: ReactorError;`
 *   `    sendCommand(command: string, …): Promise<void>;`
 */
function extractInterfaceFieldNames(dts: string, name: string): Set<string> {
  // Match `interface <name>` at the start of a line. We deliberately
  // do NOT require the `interface` to be exported (the SDK's
  // `ReactorState` / `ReactorActions` interfaces are emitted without
  // an `export` keyword when used as type aliases internally — they
  // surface only via `ReactorStore`).
  //
  // The negative lookahead `(?![A-Za-z0-9_$])` ensures we don't match
  // a *prefix*-collision interface. tsup's d.ts roll-up renames
  // duplicate-export interfaces by appending `$N` (e.g. the
  // re-exported `ReactorState` from `types.ts` and the in-source
  // `ReactorState` from `store.ts` both land in the same flat file,
  // and tsup disambiguates them as `ReactorState` / `ReactorState$1`).
  // `\b` alone would happily anchor inside the `$1` suffix because
  // `$` is not in `\w`; the explicit identifier-char negative
  // lookahead forces the name to terminate cleanly.
  const re = new RegExp(
    String.raw`^(?:export )?interface ${name}(?![A-Za-z0-9_$])[^{]*\{([\s\S]*?)^\}`,
    "m",
  );
  const match = dts.match(re);
  if (!match) return new Set();
  const body = match[1];

  const fieldRe = /^ {4}([a-zA-Z_$][\w$]*)\??\s*[:(]/gm;
  const out = new Set<string>();
  for (const m of body.matchAll(fieldRe)) {
    out.add(m[1]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Re-exports for unit testing.
// ---------------------------------------------------------------------------

export const __testing__ = {
  extractInterfaceFieldNames,
  loadSdkDts,
};
