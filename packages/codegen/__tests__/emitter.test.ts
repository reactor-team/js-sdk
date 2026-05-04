// Copyright (c) 2026 Reactor Technologies, Inc. All rights reserved.

import { describe, expect, it } from "vitest";

import { generateModelSdk } from "../src/codegen.js";
import { generator, __testing__ } from "../src/emitter.js";
import { CodegenVerificationError } from "../src/verifier.js";
import type {
  EventSchema,
  FieldSchema,
  MessageSchema,
  ModelSchema,
  TrackSchema,
} from "../src/types.js";

const {
  toPascalCase,
  toCamelCase,
  fieldSchemaToTsType,
  isUploadReference,
  generateParamInterface,
  generateMessageInterface,
  generateMessageUnion,
  generateTrackConstants,
  stripBuildMetadata,
  formatVersionForHeader,
  formatVersionForPackageJson,
  formatVersionForModelConstant,
  sanitizeJsDocLine,
  enumValueToTs,
  descriptionToJsDocLines,
  descriptionSummary,
  generateJsDoc,
} = __testing__;

// ---------------------------------------------------------------------------
// Case helpers
// ---------------------------------------------------------------------------

describe("case helpers", () => {
  it("converts snake_case to PascalCase", () => {
    expect(toPascalCase("set_prompt")).toBe("SetPrompt");
    expect(toPascalCase("helios")).toBe("Helios");
    expect(toPascalCase("a_b_c_d")).toBe("ABCD");
    // Hyphens split the same way as underscores so model names like
    // `@reactor-models/my-cool-model` produce a valid TS prefix
    // (`MyCoolModel`) without the caller having to massage the input.
    expect(toPascalCase("my-cool-model")).toBe("MyCoolModel");
    expect(toPascalCase("lingbot-v2")).toBe("LingbotV2");
    // Mixed `-` and `_` in the same name resolves consistently — both
    // separators feed into the same split.
    expect(toPascalCase("my-cool_model")).toBe("MyCoolModel");
    expect(toPascalCase("my_cool-model")).toBe("MyCoolModel");
  });

  it("converts snake_case to camelCase", () => {
    expect(toCamelCase("set_prompt")).toBe("setPrompt");
    expect(toCamelCase("start")).toBe("start");
    expect(toCamelCase("schedule_prompt")).toBe("schedulePrompt");
  });
});

// ---------------------------------------------------------------------------
// Injection-defence helpers.
//
// `parseSchema` validates names and enum members, but field/message/event
// descriptions pass through as free-form prose — they can legitimately
// contain any characters. These helpers are the last line of defence that
// keeps schema input from escaping its intended sink in the emitted
// TypeScript (string literal, JSDoc body).
// ---------------------------------------------------------------------------

describe("sanitizeJsDocLine", () => {
  it("escapes a literal `*/` so it can't terminate a JSDoc comment", () => {
    // If this got through unescaped, an author-written description like
    // `"accepted. */ evil()"` would close the `/** … */` comment and
    // turn the rest of the line into module-scope code.
    expect(sanitizeJsDocLine("accepted. */ evil()")).toBe(
      "accepted. *\\/ evil()",
    );
  });

  it("collapses newline families so a line can't smuggle a trailing `\\n`", () => {
    // `\r`, `\n`, U+2028, U+2029 all break JS source into a new line
    // when an injected comment escape hands them to the parser. Flatten
    // them to a single space so the caller's line-based formatting is
    // preserved and no sneaky line break lands in the output.
    expect(sanitizeJsDocLine("line1\nline2")).toBe("line1 line2");
    expect(sanitizeJsDocLine("a\r\nb")).toBe("a b");
    expect(sanitizeJsDocLine("a\u2028b")).toBe("a b");
    expect(sanitizeJsDocLine("a\u2029b")).toBe("a b");
  });

  it("leaves plain prose untouched", () => {
    expect(sanitizeJsDocLine("Set and encode the scene prompt.")).toBe(
      "Set and encode the scene prompt.",
    );
  });
});

describe("descriptionToJsDocLines", () => {
  it("returns an empty array when the description is empty", () => {
    expect(descriptionToJsDocLines("")).toEqual([]);
    expect(descriptionToJsDocLines(undefined as unknown as string)).toEqual([]);
  });

  it("returns a single line for a single-paragraph description", () => {
    expect(descriptionToJsDocLines("Set the scene prompt.")).toEqual([
      "Set the scene prompt.",
    ]);
  });

  it("inserts a blank entry between paragraphs so JSDoc renders proper paragraph breaks", () => {
    // The blank "" entry is the contract `generateJsDoc` consumes to
    // emit a bare ` *` separator line. Without it, multi-paragraph
    // ModelMessage docstrings (REA-1801) would collapse onto one line.
    expect(
      descriptionToJsDocLines("Summary line.\n\nLonger body explanation."),
    ).toEqual(["Summary line.", "", "Longer body explanation."]);
  });

  it("treats runs of three-or-more newlines as a single paragraph break", () => {
    expect(descriptionToJsDocLines("A.\n\n\n\nB.")).toEqual(["A.", "", "B."]);
  });

  it("does not split on a single newline (intra-paragraph wrapping is preserved for sanitiser)", () => {
    // A single `\n` is intra-paragraph code-style line wrapping — we
    // leave it to `sanitizeJsDocLine` to flatten into a space, so the
    // paragraph still renders as one logical line.
    expect(descriptionToJsDocLines("wrapped\nover lines")).toEqual([
      "wrapped\nover lines",
    ]);
  });
});

describe("descriptionSummary", () => {
  it("returns the first paragraph for a multi-paragraph description", () => {
    expect(descriptionSummary("Summary.\n\nBody.")).toBe("Summary.");
  });

  it("returns the full text when the description has only one paragraph", () => {
    expect(descriptionSummary("Just one sentence.")).toBe("Just one sentence.");
  });

  it("returns an empty string for an empty description", () => {
    expect(descriptionSummary("")).toBe("");
  });
});

describe("generateJsDoc — multi-paragraph rendering", () => {
  it("renders a single-line description as a one-line JSDoc comment", () => {
    expect(generateJsDoc(["Hello."])).toBe("/** Hello. */\n");
  });

  it("renders a blank entry as a bare ` *` paragraph-separator line", () => {
    // This is the JSDoc-idiomatic paragraph break — TypeDoc, VS Code
    // hovers, and TSDoc all render the gap as a paragraph boundary.
    const out = generateJsDoc(["Summary.", "", "Body."]);
    expect(out).toBe(
      ["/**", " * Summary.", " *", " * Body.", " */", ""].join("\n"),
    );
  });

  it("end-to-end: a multi-paragraph event description splits into paragraphs in the param interface", () => {
    const event: EventSchema = {
      name: "set_prompt",
      description: "Set the scene prompt.\n\nApplied next iteration.",
      fields: { prompt: { type: "string", default: "" } },
    };
    const out = generateParamInterface("Helios", event);
    // Multi-line JSDoc with a bare ` *` between the two paragraphs.
    expect(out).toContain(
      "/**\n * Set the scene prompt.\n *\n * Applied next iteration.\n */",
    );
  });

  it("end-to-end: a multi-paragraph message description splits into paragraphs in the message interface", () => {
    const message: MessageSchema = {
      name: "generation_reset",
      description:
        "Emitted after `reset` clears session state.\n\nThe model is back in the waiting state.",
      fields: {},
    };
    const out = generateMessageInterface("Helios", message);
    expect(out).toContain(
      "/**\n * Emitted after `reset` clears session state.\n *\n * The model is back in the waiting state.\n */",
    );
  });
});

describe("enumValueToTs", () => {
  it("escapes quotes and backslashes in string enums via JSON.stringify", () => {
    // The emitter drops this value directly into a union literal. An
    // unescaped `"` would terminate the string and the rest would be
    // interpreted as TS at compile — and, worse, emitted verbatim into
    // the bundle at runtime if the TS compiler's error is squelched.
    expect(enumValueToTs('a"b')).toBe('"a\\"b"');
    expect(enumValueToTs("back\\slash")).toBe('"back\\\\slash"');
  });

  it("serialises numbers and booleans as their JS literal form", () => {
    expect(enumValueToTs(42)).toBe("42");
    expect(enumValueToTs(true)).toBe("true");
  });

  it("leaves well-formed string enum values readable", () => {
    expect(enumValueToTs("2x")).toBe('"2x"');
  });
});

describe("stripBuildMetadata", () => {
  it("drops Reactor's -g<sha> git-describe suffix", () => {
    expect(stripBuildMetadata("v0.8.3-g404f6950")).toBe("v0.8.3");
    expect(stripBuildMetadata("0.8.3-g404f6950")).toBe("0.8.3");
    expect(stripBuildMetadata("v1.2.3-gabcdef")).toBe("v1.2.3");
    // Full-length SHAs should also be stripped — we don't pin the hex
    // length, just require it to be non-empty.
    expect(stripBuildMetadata("v1.0.0-gdeadbeefcafebabe")).toBe("v1.0.0");
  });

  it("leaves plain semver (with or without v) untouched", () => {
    expect(stripBuildMetadata("1.0.0")).toBe("1.0.0");
    expect(stripBuildMetadata("v0.0.0")).toBe("v0.0.0");
    expect(stripBuildMetadata("2.9.1")).toBe("2.9.1");
  });

  it("leaves non-Reactor pre-release / build-metadata suffixes alone", () => {
    // `-beta.3` is a legitimate semver pre-release; the strip regex is
    // narrow enough to ignore it.
    expect(stripBuildMetadata("v1.2.3-beta.3")).toBe("v1.2.3-beta.3");
    expect(stripBuildMetadata("v1.2.3-rc.1")).toBe("v1.2.3-rc.1");
    // Only a trailing `-g<hex>` is special. A `-g` followed by
    // non-hex characters isn't a git-describe suffix and stays put.
    expect(stripBuildMetadata("v1.2.3-ghostly")).toBe("v1.2.3-ghostly");
    expect(stripBuildMetadata("v1.2.3-general.1")).toBe("v1.2.3-general.1");
  });
});

describe("formatVersionForHeader", () => {
  it("adds a v prefix to an unprefixed version", () => {
    expect(formatVersionForHeader("1.0.0")).toBe("v1.0.0");
    expect(formatVersionForHeader("0.0.0")).toBe("v0.0.0");
    expect(formatVersionForHeader("2.9.1-beta.3")).toBe("v2.9.1-beta.3");
  });

  it("does not double-prefix an already-prefixed version", () => {
    expect(formatVersionForHeader("v0.0.0")).toBe("v0.0.0");
    expect(formatVersionForHeader("v1.2.3")).toBe("v1.2.3");
  });

  it("drops the -g<sha> git-describe suffix so humans see just the semver", () => {
    expect(formatVersionForHeader("v0.8.3-g404f6950")).toBe("v0.8.3");
    expect(formatVersionForHeader("0.8.3-g404f6950")).toBe("v0.8.3");
  });
});

describe("formatVersionForPackageJson", () => {
  it("strips a single leading v so npm semver validation passes", () => {
    expect(formatVersionForPackageJson("v0.0.0")).toBe("0.0.0");
    expect(formatVersionForPackageJson("v1.2.3")).toBe("1.2.3");
    expect(formatVersionForPackageJson("v2.9.1-beta.3")).toBe("2.9.1-beta.3");
  });

  it("leaves a plain semver untouched", () => {
    expect(formatVersionForPackageJson("1.0.0")).toBe("1.0.0");
    expect(formatVersionForPackageJson("0.0.0")).toBe("0.0.0");
    expect(formatVersionForPackageJson("2.9.1-beta.3")).toBe("2.9.1-beta.3");
  });

  it("drops -g<sha> so the published tarball / npm version is stable across rebuilds", () => {
    expect(formatVersionForPackageJson("v0.8.3-g404f6950")).toBe("0.8.3");
    expect(formatVersionForPackageJson("0.8.3-g404f6950")).toBe("0.8.3");
  });
});

describe("formatVersionForModelConstant", () => {
  it("drops -g<sha> but preserves any leading v authored by the schema", () => {
    expect(formatVersionForModelConstant("v0.8.3-g404f6950")).toBe("v0.8.3");
    expect(formatVersionForModelConstant("0.8.3-g404f6950")).toBe("0.8.3");
    expect(formatVersionForModelConstant("v0.0.0")).toBe("v0.0.0");
    expect(formatVersionForModelConstant("1.2.3")).toBe("1.2.3");
  });
});

// ---------------------------------------------------------------------------
// fieldSchemaToTsType — primitive / enum / upload / fallback
// ---------------------------------------------------------------------------

function field(overrides: Partial<FieldSchema>): FieldSchema {
  return { type: "unknown", ...overrides };
}

describe("fieldSchemaToTsType", () => {
  it("maps JSON Schema primitives to TypeScript primitives", () => {
    expect(fieldSchemaToTsType(field({ type: "string" }))).toBe("string");
    expect(fieldSchemaToTsType(field({ type: "integer" }))).toBe("number");
    expect(fieldSchemaToTsType(field({ type: "number" }))).toBe("number");
    expect(fieldSchemaToTsType(field({ type: "boolean" }))).toBe("boolean");
  });

  it("maps `object` (no format) to Record<string, unknown>", () => {
    expect(fieldSchemaToTsType(field({ type: "object" }))).toBe(
      "Record<string, unknown>",
    );
  });

  it("maps `array` to unknown[]", () => {
    expect(fieldSchemaToTsType(field({ type: "array" }))).toBe("unknown[]");
  });

  it("maps unknown types to `unknown`", () => {
    expect(fieldSchemaToTsType(field({ type: "weird" }))).toBe("unknown");
  });

  it("emits a literal union for enum fields", () => {
    expect(
      fieldSchemaToTsType(field({ type: "string", enum: ["1x", "2x", "4x"] })),
    ).toBe('"1x" | "2x" | "4x"');
  });

  it("emits FileRef for upload-reference object fields", () => {
    expect(
      fieldSchemaToTsType(
        field({ type: "object", format: "reactor-upload-reference" }),
      ),
    ).toBe("FileRef");

    // The legacy `file-reference` format is also supported.
    expect(
      fieldSchemaToTsType(field({ type: "object", format: "file-reference" })),
    ).toBe("FileRef");
  });

  it("does not treat object fields with other formats as upload refs", () => {
    expect(
      fieldSchemaToTsType(field({ type: "object", format: "date-time" })),
    ).toBe("Record<string, unknown>");
  });
});

describe("isUploadReference", () => {
  it("accepts the canonical and legacy format names", () => {
    expect(
      isUploadReference(
        field({ type: "object", format: "reactor-upload-reference" }),
      ),
    ).toBe(true);
    expect(
      isUploadReference(field({ type: "object", format: "file-reference" })),
    ).toBe(true);
  });

  it("rejects non-object fields and unknown formats", () => {
    expect(
      isUploadReference(
        field({ type: "string", format: "reactor-upload-reference" }),
      ),
    ).toBe(false);
    expect(isUploadReference(field({ type: "object" }))).toBe(false);
    expect(
      isUploadReference(field({ type: "object", format: "something-else" })),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// generateParamInterface
// ---------------------------------------------------------------------------

describe("generateParamInterface", () => {
  it("emits nothing when the event has no fields", () => {
    const event: EventSchema = {
      name: "start",
      description: "Begin",
      fields: {},
    };
    expect(generateParamInterface("Helios", event)).toBe("");
  });

  it("marks fields with defaults as optional and annotates JSDoc", () => {
    const event: EventSchema = {
      name: "set_prompt",
      description: "Set prompt",
      fields: {
        prompt: {
          type: "string",
          description: "Prompt text",
          default: "",
        },
      },
    };

    const out = generateParamInterface("Helios", event);

    expect(out).toContain("export interface HeliosSetPromptParams {");
    expect(out).toContain("Prompt text");
    expect(out).toContain('@default ""');
    expect(out).toContain("prompt?: string;");
  });

  it("emits required (non-optional) fields when no default is present", () => {
    const event: EventSchema = {
      name: "focus",
      description: "",
      fields: { target: { type: "string" } },
    };

    const out = generateParamInterface("Helios", event);
    expect(out).toContain("target: string;");
    expect(out).not.toContain("target?:");
  });

  it("renders numeric constraints as JSDoc tags", () => {
    const event: EventSchema = {
      name: "configure",
      description: "",
      fields: {
        strength: { type: "number", minimum: 0, maximum: 1, default: 1 },
      },
    };

    const out = generateParamInterface("Helios", event);
    expect(out).toContain("@minimum 0");
    expect(out).toContain("@maximum 1");
    expect(out).toContain("@default 1");
    expect(out).toContain("strength?: number;");
  });
});

// ---------------------------------------------------------------------------
// generateMessageInterface + union
// ---------------------------------------------------------------------------

describe("generateMessageInterface", () => {
  it("emits a discriminator and each declared field", () => {
    const msg: MessageSchema = {
      name: "chunk_complete",
      description: "A chunk finished.",
      fields: {
        chunk_index: { type: "integer" },
        frames_emitted: { type: "integer" },
      },
    };

    const out = generateMessageInterface("Helios", msg);

    expect(out).toContain("export interface HeliosChunkCompleteMessage {");
    expect(out).toContain('type: "chunk_complete";');
    expect(out).toContain("chunk_index: number;");
    expect(out).toContain("frames_emitted: number;");
  });
});

describe("generateMessageUnion", () => {
  it("returns an empty string when there are no messages", () => {
    expect(generateMessageUnion("Helios", [])).toBe("");
  });

  it("builds a discriminated union across all messages", () => {
    const messages: MessageSchema[] = [
      { name: "prompt_accepted", description: "", fields: {} },
      { name: "chunk_complete", description: "", fields: {} },
    ];

    const out = generateMessageUnion("Helios", messages);
    expect(out).toContain("export type HeliosMessage =");
    expect(out).toContain("| HeliosPromptAcceptedMessage");
    expect(out).toContain("| HeliosChunkCompleteMessage");
  });
});

// ---------------------------------------------------------------------------
// generateTrackConstants
// ---------------------------------------------------------------------------

describe("generateTrackConstants", () => {
  it("returns an empty string when the model declares no tracks", () => {
    expect(generateTrackConstants("Helios", [])).toBe("");
  });

  it("emits a const array of SDK-shape track hints", () => {
    const tracks: TrackSchema[] = [
      { name: "main_video", kind: "video", direction: "out" },
    ];
    const out = generateTrackConstants("Helios", tracks);

    expect(out).toContain("export const HeliosTracks = [");
    expect(out).toContain(
      '{ name: "main_video", kind: "video", direction: "recvonly" },',
    );
    expect(out).toContain("] as const;");
  });

  it("translates schema directions to transport directions", () => {
    // Model perspective ("out" = model produces) → client perspective
    // ("recvonly" = client receives).
    const out = generateTrackConstants("Helios", [
      { name: "main_video", kind: "video", direction: "out" },
      { name: "webcam", kind: "video", direction: "in" },
      { name: "mic", kind: "audio", direction: "in" },
    ]);

    expect(out).toContain(
      '{ name: "main_video", kind: "video", direction: "recvonly" },',
    );
    expect(out).toContain(
      '{ name: "webcam", kind: "video", direction: "sendonly" },',
    );
    expect(out).toContain(
      '{ name: "mic", kind: "audio", direction: "sendonly" },',
    );
    // Never leak the schema-side "in"/"out" values into the generated
    // constant — they are not valid `modelTracks[*].direction` values.
    expect(out).not.toMatch(/direction: "in"/);
    expect(out).not.toMatch(/direction: "out"/);
  });
});

// ---------------------------------------------------------------------------
// Shared fixture: a minimal ModelSchema the describe blocks below extend.
// ---------------------------------------------------------------------------

function schema(overrides: Partial<ModelSchema> = {}): ModelSchema {
  return {
    modelName: "helios",
    modelVersion: "0.1.0",
    events: [],
    messages: [],
    tracks: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// generateModelSdk — end-to-end shape checks (not snapshots)
// ---------------------------------------------------------------------------

describe("generateModelSdk", () => {
  it("produces exactly four files at the expected paths", () => {
    const pkg = generateModelSdk({
      modelName: "helios",
      modelVersion: "0.1.0",
      sdkVersion: "2.9.1",
      schema: schema(),
      outputDir: "/tmp/ignored",
    });

    expect(pkg.files.map((f) => f.path).sort()).toEqual([
      "README.md",
      "package.json",
      "src/index.ts",
      "tsconfig.json",
      "tsup.config.ts",
    ]);
  });

  it("pins the SDK version in the generated package.json dependencies", () => {
    const pkg = generateModelSdk({
      modelName: "helios",
      modelVersion: "0.1.0",
      sdkVersion: "2.9.1",
      schema: schema(),
      outputDir: "/tmp/ignored",
    });

    const pkgJson = pkg.files.find((f) => f.path === "package.json")!;
    const parsed = JSON.parse(pkgJson.content);
    expect(parsed.name).toBe("@reactor-models/helios");
    expect(parsed.version).toBe("0.1.0");
    expect(parsed.dependencies["@reactor-team/js-sdk"]).toBe("^2.9.1");
  });

  it("imports FileRef only when an event has an upload-reference field", () => {
    const withUpload = generateModelSdk({
      modelName: "helios",
      modelVersion: "0.1.0",
      sdkVersion: "2.9.1",
      schema: schema({
        events: [
          {
            name: "set_image",
            description: "",
            fields: {
              image: { type: "object", format: "reactor-upload-reference" },
            },
          },
        ],
      }),
      outputDir: "/tmp/ignored",
    });
    const withoutUpload = generateModelSdk({
      modelName: "helios",
      modelVersion: "0.1.0",
      sdkVersion: "2.9.1",
      schema: schema(),
      outputDir: "/tmp/ignored",
    });

    const withSrc = withUpload.files.find((f) => f.path === "src/index.ts")!;
    const withoutSrc = withoutUpload.files.find(
      (f) => f.path === "src/index.ts",
    )!;

    expect(withSrc.content).toContain(
      'import { Reactor, FileRef } from "@reactor-team/js-sdk";',
    );
    expect(withSrc.content).toContain("async uploadFile(");
    // Re-export FileRef so consumers can type `const ref: FileRef = ...`
    // without pulling in a second import from `@reactor-team/js-sdk`.
    expect(withSrc.content).toContain("export { FileRef };");
    expect(withoutSrc.content).toContain(
      'import { Reactor } from "@reactor-team/js-sdk";',
    );
    expect(withoutSrc.content).not.toContain("async uploadFile(");
    // And without any upload-reference event there's nothing to type,
    // so the re-export must stay absent too — no dead surface shipped.
    expect(withoutSrc.content).not.toContain("FileRef");
  });

  it("generates typed per-event methods with camelCase names", () => {
    const pkg = generateModelSdk({
      modelName: "helios",
      modelVersion: "0.1.0",
      sdkVersion: "2.9.1",
      schema: schema({
        events: [
          {
            name: "schedule_prompt",
            description: "",
            fields: { prompt: { type: "string", default: "" } },
          },
          { name: "start", description: "", fields: {} },
        ],
      }),
      outputDir: "/tmp/ignored",
    });

    const src = pkg.files.find((f) => f.path === "src/index.ts")!.content;
    expect(src).toContain(
      "async schedulePrompt(params: HeliosSchedulePromptParams)",
    );
    expect(src).toContain(
      'await this.reactor.sendCommand("schedule_prompt", params);',
    );
    expect(src).toContain("async start():");
    expect(src).toContain('await this.reactor.sendCommand("start", {});');
  });

  it("wires per-message listener helpers onto the discriminated union", () => {
    const pkg = generateModelSdk({
      modelName: "helios",
      modelVersion: "0.1.0",
      sdkVersion: "2.9.1",
      schema: schema({
        messages: [
          { name: "prompt_accepted", description: "", fields: {} },
          { name: "chunk_complete", description: "", fields: {} },
        ],
      }),
      outputDir: "/tmp/ignored",
    });

    const src = pkg.files.find((f) => f.path === "src/index.ts")!.content;
    expect(src).toContain(
      "onMessage(handler: (message: HeliosMessage) => void)",
    );
    expect(src).toContain("onPromptAccepted(handler:");
    expect(src).toContain("onChunkComplete(handler:");
    expect(src).toContain('if (msg.type === "prompt_accepted")');
  });

  it("does not double-prefix the version in the generated header (v-prefixed schema)", () => {
    // Regression test: OpenAPI schemas that already write `"version": "v0.0.0"`
    // used to produce `// Model: <name> vv0.0.0` in the header. The header
    // must only have a single leading v. `MODEL_VERSION` preserves the
    // author's leading `v` here because there's no `-g<sha>` suffix to
    // strip.
    const pkg = generateModelSdk({
      modelName: "waypoint",
      modelVersion: "v0.0.0",
      sdkVersion: "2.9.1",
      schema: schema({ modelName: "waypoint", modelVersion: "v0.0.0" }),
      outputDir: "/tmp/ignored",
    });
    const src = pkg.files.find((f) => f.path === "src/index.ts")!.content;
    expect(src).toContain("// Model: waypoint v0.0.0");
    expect(src).not.toContain("vv0.0.0");
    expect(src).toContain('export const MODEL_VERSION = "v0.0.0" as const;');
  });

  it("adds a leading v in the header when the schema version is bare", () => {
    const pkg = generateModelSdk({
      modelName: "helios",
      modelVersion: "1.2.3",
      sdkVersion: "2.9.1",
      schema: schema({ modelVersion: "1.2.3" }),
      outputDir: "/tmp/ignored",
    });
    const src = pkg.files.find((f) => f.path === "src/index.ts")!.content;
    expect(src).toContain("// Model: helios v1.2.3");
    expect(src).toContain('export const MODEL_VERSION = "1.2.3" as const;');
  });

  it("strips a leading v from the generated package.json version (npm compat)", () => {
    // npm rejects any version that starts with `v` — a common habit in
    // model release tags (`info.version: "v0.0.0"`). The package.json
    // `"version"` must be strict semver; `MODEL_VERSION` preserves the
    // author's leading `v` (it's for display, not for npm).
    const pkg = generateModelSdk({
      modelName: "waypoint",
      modelVersion: "v0.0.0",
      sdkVersion: "2.9.1",
      schema: schema({ modelName: "waypoint", modelVersion: "v0.0.0" }),
      outputDir: "/tmp/ignored",
    });
    const pkgJson = JSON.parse(
      pkg.files.find((f) => f.path === "package.json")!.content,
    );
    expect(pkgJson.version).toBe("0.0.0");

    const src = pkg.files.find((f) => f.path === "src/index.ts")!.content;
    expect(src).toContain('export const MODEL_VERSION = "v0.0.0" as const;');
  });

  it("leaves a plain-semver package.json version untouched", () => {
    const pkg = generateModelSdk({
      modelName: "helios",
      modelVersion: "1.2.3",
      sdkVersion: "2.9.1",
      schema: schema({ modelVersion: "1.2.3" }),
      outputDir: "/tmp/ignored",
    });
    const pkgJson = JSON.parse(
      pkg.files.find((f) => f.path === "package.json")!.content,
    );
    expect(pkgJson.version).toBe("1.2.3");
  });

  it("strips the -g<sha> git-describe suffix from every emitted surface", () => {
    // End-to-end proof that a typical Reactor release tag
    // (`v<semver>-g<shortsha>`) flows through the generator without
    // leaking the SHA into anything a consumer reads: the header
    // banner, the exported MODEL_VERSION constant, the package.json
    // `version` field (which also drives the tarball name emitted by
    // `npm pack`), and the README front-matter callout all normalise
    // on `v0.8.3` / `0.8.3`. This is the invariant the models-sync
    // pipeline relies on to avoid publishing a differently-named
    // artefact every time the short SHA changes without the semver
    // triple moving.
    const pkg = generateModelSdk({
      modelName: "helios",
      modelVersion: "v0.8.3-g404f6950",
      sdkVersion: "2.9.1",
      schema: schema({ modelName: "helios", modelVersion: "v0.8.3-g404f6950" }),
      outputDir: "/tmp/ignored",
    });

    const src = pkg.files.find((f) => f.path === "src/index.ts")!.content;
    expect(src).toContain("// Model: helios v0.8.3");
    expect(src).not.toContain("g404f6950");
    expect(src).toContain('export const MODEL_VERSION = "v0.8.3" as const;');

    const pkgJson = JSON.parse(
      pkg.files.find((f) => f.path === "package.json")!.content,
    );
    expect(pkgJson.version).toBe("0.8.3");

    const readme = pkg.files.find((f) => f.path === "README.md")!.content;
    expect(readme).not.toContain("g404f6950");
    expect(readme).toContain("Version **v0.8.3**");
  });

  it("wires `modelTracks: [...<Prefix>Tracks]` when tracks are declared", () => {
    const pkg = generateModelSdk({
      modelName: "helios",
      modelVersion: "0.1.0",
      sdkVersion: "2.9.1",
      schema: schema({
        tracks: [{ name: "main_video", kind: "video", direction: "out" }],
      }),
      outputDir: "/tmp/ignored",
    });

    const src = pkg.files.find((f) => f.path === "src/index.ts")!.content;
    expect(src).toContain("modelTracks: [...HeliosTracks]");
    expect(src).toContain("export const HeliosTracks = [");
    expect(src).toContain('direction: "recvonly"');
  });

  it("omits modelTracks entirely when the schema has no tracks", () => {
    const pkg = generateModelSdk({
      modelName: "helios",
      modelVersion: "0.1.0",
      sdkVersion: "2.9.1",
      schema: schema(),
      outputDir: "/tmp/ignored",
    });

    const src = pkg.files.find((f) => f.path === "src/index.ts")!.content;
    expect(src).not.toContain("modelTracks");
    expect(src).not.toContain("HeliosTracks");
    expect(src).toContain(
      "this.reactor = new Reactor({ ...options, modelName: MODEL_NAME });",
    );
  });

  it("is deterministic for a given input (same output twice)", () => {
    const opts = {
      modelName: "helios",
      modelVersion: "0.1.0",
      sdkVersion: "2.9.1",
      schema: schema({
        events: [{ name: "start", description: "", fields: {} }],
        tracks: [{ name: "main", kind: "video", direction: "out" } as const],
      }),
      outputDir: "/tmp/ignored",
    };
    const a = generateModelSdk(opts);
    const b = generateModelSdk(opts);
    expect(a).toEqual(b);
  });
});

// ---------------------------------------------------------------------------
// React emission (opt-in via CodegenOptions.react)
// ---------------------------------------------------------------------------

describe("React emission — off by default", () => {
  it("emits no React artefacts of any kind", () => {
    const pkg = generateModelSdk({
      modelName: "helios",
      modelVersion: "0.1.0",
      sdkVersion: "2.9.1",
      schema: schema(),
      outputDir: "/tmp/ignored",
    });
    // No sibling React file, and no re-export hook in the main file.
    expect(pkg.files.find((f) => f.path === "src/react.ts")).toBeUndefined();
    const src = pkg.files.find((f) => f.path === "src/index.ts")!.content;
    expect(src).not.toContain('"use client";');
    expect(src).not.toContain('from "react"');
    expect(src).not.toContain("ReactorProvider");
    expect(src).not.toContain('export * from "./react.js"');
  });

  it("package.json exports only the package root", () => {
    const pkg = generateModelSdk({
      modelName: "helios",
      modelVersion: "0.1.0",
      sdkVersion: "2.9.1",
      schema: schema(),
      outputDir: "/tmp/ignored",
    });
    const pkgJson = JSON.parse(
      pkg.files.find((f) => f.path === "package.json")!.content,
    );
    expect(pkgJson.exports).toEqual({
      ".": {
        types: "./dist/index.d.ts",
        import: "./dist/index.mjs",
        require: "./dist/index.js",
      },
    });
    expect(pkgJson.peerDependencies).toBeUndefined();
  });

  it("tsup entry list has a single entry", () => {
    const pkg = generateModelSdk({
      modelName: "helios",
      modelVersion: "0.1.0",
      sdkVersion: "2.9.1",
      schema: schema(),
      outputDir: "/tmp/ignored",
    });
    const tsup = pkg.files.find((f) => f.path === "tsup.config.ts")!.content;
    expect(tsup).toContain('entry: ["src/index.ts"]');
    expect(tsup).not.toContain("src/react.ts");
  });
});

// ---------------------------------------------------------------------------
// React emission — on via `react: true`
//
// `src/react.ts` ships as a sibling of `src/index.ts`; the main file
// re-exports everything from it so the public surface stays a single
// root import. Package.json only exposes `.` — no `/react` subpath.
// ---------------------------------------------------------------------------

describe("React emission — on via react: true", () => {
  function reactPkg(overrides?: Partial<ModelSchema>) {
    return generateModelSdk({
      modelName: "helios",
      modelVersion: "0.1.0",
      sdkVersion: "2.9.1",
      schema: schema(overrides),
      outputDir: "/tmp/ignored",
      react: true,
    });
  }

  function reactSource(overrides?: Partial<ModelSchema>): string {
    return reactPkg(overrides).files.find((f) => f.path === "src/react.ts")!
      .content;
  }

  function indexSource(overrides?: Partial<ModelSchema>): string {
    return reactPkg(overrides).files.find((f) => f.path === "src/index.ts")!
      .content;
  }

  it("emits src/react.ts with the usual header + use-client directive", () => {
    const pkg = reactPkg();
    const react = pkg.files.find((f) => f.path === "src/react.ts");
    expect(react).toBeDefined();
    expect(react!.content).toContain('"use client";');
    expect(react!.content).toContain(
      "// Auto-generated by @reactor-team/codegen — DO NOT EDIT",
    );
  });

  it("re-exports everything from ./react.js at the bottom of src/index.ts", () => {
    const src = indexSource();
    expect(src).toContain('export * from "./react.js";');
    // The re-export must appear *after* every value declaration — the
    // circular `react.ts → index.ts` imports (MODEL_NAME, tracks, …)
    // depend on those bindings being initialised first.
    const reExportIdx = src.indexOf('export * from "./react.js";');
    const classIdx = src.indexOf("export class HeliosModel");
    expect(classIdx).toBeGreaterThan(-1);
    expect(reExportIdx).toBeGreaterThan(classIdx);
  });

  it("puts a single use-client directive at the top of src/index.ts", () => {
    const src = indexSource();
    // Directive must sit in the module prologue, before any imports,
    // or React/Next.js will ignore it.
    const directiveIdx = src.indexOf('"use client";');
    const firstImportIdx = src.indexOf("import ");
    expect(directiveIdx).toBeGreaterThan(-1);
    expect(firstImportIdx).toBeGreaterThan(directiveIdx);
    expect(src.split('"use client";').length - 1).toBe(1);
  });

  it("src/react.ts uses createElement (never JSX, so file can stay .ts)", () => {
    const react = reactSource();
    expect(react).toContain("createElement(");
    // No JSX angle brackets in the emitted component bodies.
    expect(react).not.toMatch(/return\s+</);
  });

  it("emits a <Prefix>Provider that bakes in modelName and modelTracks", () => {
    const react = reactSource({
      tracks: [{ name: "main", kind: "video", direction: "out" }],
    });
    expect(react).toContain("export function HeliosProvider(");
    expect(react).toContain("modelName: MODEL_NAME");
    expect(react).toContain("modelTracks: [...HeliosTracks]");
  });

  it("Provider omits modelTracks for schemas without tracks", () => {
    const react = reactSource({ tracks: [] });
    expect(react).toContain("export function HeliosProvider(");
    expect(react).not.toContain("modelTracks");
  });

  it("emits a useHelios() hook with a typed method per event", () => {
    const react = reactSource({
      events: [
        {
          name: "set_prompt",
          description: "",
          fields: { prompt: { type: "string", default: "" } },
        },
        { name: "start", description: "", fields: {} },
      ],
    });

    expect(react).toContain("export function useHelios()");
    expect(react).toContain(
      "const sendCommand = useReactor((s) => s.sendCommand);",
    );
    expect(react).toContain(
      "setPrompt: (params: HeliosSetPromptParams): Promise<void>",
    );
    expect(react).toContain('sendCommand("set_prompt", params)');
    expect(react).toContain("start: (): Promise<void>");
    expect(react).toContain('sendCommand("start", {})');
    expect(react).toContain("status,");
  });

  it("exposes connect + disconnect on useHelios() so consumers don't need @reactor-team/js-sdk directly", () => {
    // Regression: the hand-rolled React layer in reactor-experiments had
    // to import `useReactor` from `@reactor-team/js-sdk` just to select
    // `s.connect` / `s.disconnect` (promoting the SDK from transitive to
    // direct dep in the host project). The generated `useHelios()` hook
    // must expose both so the typed binding is genuinely self-contained.
    const react = reactSource({
      events: [{ name: "start", description: "", fields: {} }],
    });

    expect(react).toContain("const connect = useReactor((s) => s.connect);");
    expect(react).toContain(
      "const disconnect = useReactor((s) => s.disconnect);",
    );
    // Both must land in the returned object, not just be selected and
    // dropped — it's the return shape that matters to consumers.
    expect(react).toMatch(/return\s*\{[\s\S]*\bconnect,[\s\S]*\}/);
    expect(react).toMatch(/return\s*\{[\s\S]*\bdisconnect,[\s\S]*\}/);
  });

  it("exposes uploadFile only when events use upload references", () => {
    const withUpload = reactSource({
      events: [
        {
          name: "set_image",
          description: "",
          fields: {
            image: { type: "object", format: "reactor-upload-reference" },
          },
        },
      ],
    });
    const withoutUpload = reactSource({
      events: [{ name: "start", description: "", fields: {} }],
    });

    expect(withUpload).toContain(
      "const uploadFile = useReactor((s) => s.uploadFile);",
    );
    expect(withUpload).toContain("uploadFile: (");
    expect(withUpload).toContain("type FileRef");
    expect(withoutUpload).not.toContain("s.uploadFile");
    expect(withoutUpload).not.toContain("type FileRef");
  });

  it("emits one typed hook per message plus a catch-all useHeliosMessage", () => {
    const react = reactSource({
      messages: [
        { name: "prompt_accepted", description: "", fields: {} },
        { name: "chunk_complete", description: "", fields: {} },
      ],
    });

    expect(react).toContain(
      "export function useHeliosMessage(\n  handler: (message: HeliosMessage) => void",
    );
    expect(react).toContain(
      "export function useHeliosPromptAccepted(\n  handler: (message: HeliosPromptAcceptedMessage) => void",
    );
    expect(react).toContain(
      "export function useHeliosChunkComplete(\n  handler: (message: HeliosChunkCompleteMessage) => void",
    );
    // Per-message hooks unwrap the `{ type, data, uploads? }` envelope
    // before running the discriminator check so `msg.<field>` matches
    // the flat shape the typed interfaces promise (REA-1581 follow-up).
    expect(react).toContain("const m = _unwrapMessage<HeliosMessage>(msg);");
    expect(react).toContain('if (m.type === "prompt_accepted") {');
    expect(react).toContain('if (m.type === "chunk_complete") {');
  });

  it("does not import useReactorMessage when the schema has no messages", () => {
    const react = reactSource({ messages: [] });
    expect(react).not.toContain("useReactorMessage");
    expect(react).not.toContain("useHeliosMessage(");
  });

  it("src/react.ts pulls generated constants and types from ./index.js", () => {
    const react = reactSource({
      events: [{ name: "set_prompt", description: "", fields: {} }],
      messages: [{ name: "prompt_accepted", description: "", fields: {} }],
      tracks: [{ name: "main", kind: "video", direction: "out" }],
    });
    expect(react).toContain('} from "./index.js";');
    expect(react).toContain("MODEL_NAME");
    expect(react).toContain("HeliosTracks");
    expect(react).toContain("type HeliosOptions");
    expect(react).toContain("type HeliosMessage");
  });

  it("package.json exposes a single root entry + declares react peer dep + hook keywords", () => {
    const pkg = reactPkg();
    const pkgJson = JSON.parse(
      pkg.files.find((f) => f.path === "package.json")!.content,
    );

    // Only the root export — the `./react` subpath is intentionally
    // absent; consumers reach the hooks through the re-export in
    // `src/index.ts`.
    expect(pkgJson.exports).toEqual({
      ".": {
        types: "./dist/index.d.ts",
        import: "./dist/index.mjs",
        require: "./dist/index.js",
      },
    });
    expect(pkgJson.peerDependencies).toEqual({ react: ">=18" });
    expect(pkgJson.devDependencies.react).toBeDefined();
    expect(pkgJson.devDependencies["@types/react"]).toBeDefined();
    expect(pkgJson.keywords).toContain("react");
    expect(pkgJson.keywords).toContain("hooks");
  });

  it("tsup.config.ts keeps a single entry — bundler follows the re-export", () => {
    const tsup = reactPkg().files.find(
      (f) => f.path === "tsup.config.ts",
    )!.content;
    // Only `src/index.ts` is compiled; tsup follows `export * from
    // "./react.js"` to bundle the React file into the same output.
    expect(tsup).toContain('entry: ["src/index.ts"]');
    expect(tsup).not.toContain("src/react.ts");
  });

  it("the React file stays deterministic for a given input", () => {
    const opts = {
      modelName: "helios",
      modelVersion: "0.1.0",
      sdkVersion: "2.9.1",
      schema: schema({
        events: [{ name: "set_prompt", description: "", fields: {} }],
        messages: [{ name: "prompt_accepted", description: "", fields: {} }],
        tracks: [{ name: "main", kind: "video", direction: "out" } as const],
      }),
      outputDir: "/tmp/ignored",
      react: true,
    };
    const a = generateModelSdk(opts);
    const b = generateModelSdk(opts);
    expect(a).toEqual(b);
  });
});

// ---------------------------------------------------------------------------
// Message envelope unwrap contract.
//
// The SDK's `reactor.on("message", …)` hands callers the inner envelope
// `{ type, data, uploads? }` verbatim — a field declared on a message
// schema therefore lives at `msg.data.<field>`, not `msg.<field>`.
// The emitted message interfaces are flat (`{ type, <field> }`) for
// ergonomics, so every generated handler wrapper flattens `raw.data`
// up to the top level before handing the value to the typed callback.
//
// These tests pin down that the generated code always goes through
// `_unwrapMessage` on the way out so the typed shape matches what
// users actually receive at runtime. Bug was filed after v0.8.4 of
// `@reactor-models/helios` shipped with unwrapped casts — handlers
// saw `msg.current_frame === undefined` because the value actually
// sat at `msg.data.current_frame`.
// ---------------------------------------------------------------------------

describe("emitter — message envelope unwrap (REA-1581 follow-up)", () => {
  function buildPkg(
    overrides: Partial<ModelSchema> = {},
    react = false,
  ): ReturnType<typeof generateModelSdk> {
    return generateModelSdk({
      modelName: "helios",
      modelVersion: "0.1.0",
      sdkVersion: "2.9.1",
      schema: {
        modelName: "helios",
        modelVersion: "0.1.0",
        events: [],
        messages: [{ name: "state", description: "", fields: {} }],
        tracks: [],
        ...overrides,
      },
      outputDir: "/tmp/ignored",
      react,
    });
  }

  it("emits the `_unwrapMessage` helper in src/index.ts when the schema has messages", () => {
    const src = buildPkg().files.find(
      (f) => f.path === "src/index.ts",
    )!.content;
    expect(src).toContain("function _unwrapMessage<T>(raw: unknown): T {");
    // The helper re-applies `type` after the spread so a payload that
    // happens to carry a `type` field cannot shadow the discriminator.
    expect(src).toContain("...env.data, type: env.type");
  });

  it("omits the `_unwrapMessage` helper in src/index.ts when the schema has no messages (no dead code)", () => {
    const src = buildPkg({ messages: [] }).files.find(
      (f) => f.path === "src/index.ts",
    )!.content;
    expect(src).not.toContain("_unwrapMessage");
  });

  it("uses `_unwrapMessage` inside the class's onMessage wrapper instead of a naked cast", () => {
    const src = buildPkg().files.find(
      (f) => f.path === "src/index.ts",
    )!.content;
    expect(src).toContain("handler(_unwrapMessage<HeliosMessage>(raw));");
    // Guard against the old buggy pattern creeping back.
    expect(src).not.toContain("handler(raw as HeliosMessage);");
  });

  it("on<Name> helpers inherit the unwrap via this.onMessage", () => {
    const src = buildPkg({
      messages: [{ name: "state", description: "", fields: {} }],
    }).files.find((f) => f.path === "src/index.ts")!.content;
    // `onState` calls `this.onMessage(...)` which already unwraps, so
    // `msg.type` here is the post-unwrap discriminator, not a raw
    // envelope field.
    expect(src).toContain("return this.onMessage((msg) => {");
    expect(src).toContain('if (msg.type === "state") handler(msg as');
  });

  it("emits the `_unwrapMessage` helper in src/react.ts when the schema has messages", () => {
    const react = buildPkg({}, true).files.find(
      (f) => f.path === "src/react.ts",
    )!.content;
    expect(react).toContain("function _unwrapMessage<T>(raw: unknown): T {");
  });

  it("omits the `_unwrapMessage` helper in src/react.ts when there are no messages", () => {
    const react = buildPkg({ messages: [] }, true).files.find(
      (f) => f.path === "src/react.ts",
    )!.content;
    expect(react).not.toContain("_unwrapMessage");
  });

  it("React catch-all useHeliosMessage unwraps before handing to the handler", () => {
    const react = buildPkg({}, true).files.find(
      (f) => f.path === "src/react.ts",
    )!.content;
    expect(react).toContain(
      "handler(_unwrapMessage<HeliosMessage>(msg)),\n  );",
    );
    // Guard against the old buggy pattern creeping back.
    expect(react).not.toContain("handler(msg as HeliosMessage)");
  });

  it("React per-message hook runs the discriminator against the unwrapped object, not the envelope", () => {
    const react = buildPkg(
      {
        messages: [{ name: "state", description: "", fields: {} }],
      },
      true,
    ).files.find((f) => f.path === "src/react.ts")!.content;
    expect(react).toContain("const m = _unwrapMessage<HeliosMessage>(msg);");
    expect(react).toContain('if (m.type === "state") {');
    // The prior buggy form compared against the raw envelope.
    expect(react).not.toContain('(msg as HeliosMessage).type === "state"');
  });

  // The algorithmic contract the helper has to satisfy: flatten
  // `raw.data` up; preserve `raw.type` as the winning discriminator;
  // pass non-enveloped input through unchanged. Rewriting the body in
  // plain JS below is strictly more reliable than evaling a TS string
  // snippet — the snippet itself is pinned down by the string-presence
  // tests above, so if the emitter ever diverges from this reference
  // behaviour the other tests catch it.
  function referenceUnwrap(raw: unknown): unknown {
    const env = raw as {
      type?: string;
      data?: Record<string, unknown>;
    };
    if (
      env &&
      typeof env === "object" &&
      env.data &&
      typeof env.data === "object"
    ) {
      return { ...env.data, type: env.type };
    }
    return raw;
  }

  it("reference unwrap flattens the SDK's `{ type, data, uploads }` envelope so message fields sit at the top level", () => {
    const envelope = {
      type: "state",
      data: { current_frame: 42, ready: true },
      uploads: { ignored: {} },
    };
    const out = referenceUnwrap(envelope) as {
      type: string;
      current_frame: number;
      ready: boolean;
    };
    expect(out.type).toBe("state");
    expect(out.current_frame).toBe(42);
    expect(out.ready).toBe(true);
  });

  it("reference unwrap re-applies the top-level `type` last so a payload can't shadow the discriminator", () => {
    const collision = { type: "state", data: { type: "impostor", x: 1 } };
    const out = referenceUnwrap(collision) as { type: string; x: number };
    expect(out.type).toBe("state");
    expect(out.x).toBe(1);
  });

  it("reference unwrap passes non-enveloped input through untouched (belt-and-suspenders)", () => {
    const flat = { type: "state", current_frame: 7 };
    expect(referenceUnwrap(flat)).toEqual(flat);
    expect(referenceUnwrap(null)).toBe(null);
    expect(referenceUnwrap(undefined)).toBe(undefined);
  });
});

// ---------------------------------------------------------------------------
// Typed track helpers (REA-1791).
//
// Until this feature, generated SDKs typed commands and messages but
// left media-track wiring to string literals on the base SDK. These
// tests pin down the new surface:
//   - `<Prefix>SendTrackName` / `<Prefix>RecvTrackName` unions.
//   - `publish<Name>` / `unpublish<Name>` per sendonly track.
//   - `on<Name>` per recvonly track.
//   - `use<Prefix>Track(name)` hook (recvonly only).
//   - `<<Prefix><Track>View>` per video track in each direction.
// ---------------------------------------------------------------------------

describe("emitter — typed track helpers (REA-1791)", () => {
  function pkgWith(
    tracks: TrackSchema[],
    react = false,
  ): ReturnType<typeof generateModelSdk> {
    return generateModelSdk({
      modelName: "helios",
      modelVersion: "0.1.0",
      sdkVersion: "2.9.1",
      schema: {
        modelName: "helios",
        modelVersion: "0.1.0",
        events: [],
        messages: [],
        tracks,
      },
      outputDir: "/tmp/ignored",
      react,
    });
  }

  function sourceOf(
    tracks: TrackSchema[],
    react = false,
  ): { index: string; react?: string } {
    const pkg = pkgWith(tracks, react);
    const index = pkg.files.find((f) => f.path === "src/index.ts")!.content;
    const reactFile = react
      ? pkg.files.find((f) => f.path === "src/react.ts")!.content
      : undefined;
    return { index, react: reactFile };
  }

  // ---- Type-level: name unions -----------------------------------------

  it("emits `<Prefix>SendTrackName` / `<Prefix>RecvTrackName` string-literal unions per direction", () => {
    const { index } = sourceOf([
      { name: "webcam", kind: "video", direction: "in" },
      { name: "mic", kind: "audio", direction: "in" },
      { name: "main_video", kind: "video", direction: "out" },
    ]);
    expect(index).toContain(
      'export type HeliosSendTrackName =\n  "webcam"\n  | "mic";',
    );
    expect(index).toContain(
      'export type HeliosRecvTrackName =\n  "main_video";',
    );
  });

  it("omits a direction's union when the schema has no tracks on that side (no `never` unions)", () => {
    const { index: recvOnly } = sourceOf([
      { name: "main_video", kind: "video", direction: "out" },
    ]);
    expect(recvOnly).toContain("export type HeliosRecvTrackName");
    expect(recvOnly).not.toContain("HeliosSendTrackName");

    const { index: sendOnly } = sourceOf([
      { name: "webcam", kind: "video", direction: "in" },
    ]);
    expect(sendOnly).toContain("export type HeliosSendTrackName");
    expect(sendOnly).not.toContain("HeliosRecvTrackName");
  });

  // ---- Class methods ---------------------------------------------------

  it("emits `publish<Name>` / `unpublish<Name>` pair per sendonly track", () => {
    const { index } = sourceOf([
      { name: "webcam", kind: "video", direction: "in" },
    ]);
    expect(index).toContain("async publishWebcam(track: MediaStreamTrack)");
    expect(index).toContain(
      'await this.reactor.publishTrack("webcam", track);',
    );
    expect(index).toContain("async unpublishWebcam(): Promise<void>");
    expect(index).toContain('await this.reactor.unpublishTrack("webcam");');
  });

  it("emits an `on<Name>` subscription per recvonly track, filtering by name internally", () => {
    const { index } = sourceOf([
      { name: "main_video", kind: "video", direction: "out" },
    ]);
    expect(index).toContain("onMainVideo(");
    expect(index).toContain(
      "const wrapped = (name: string, t: MediaStreamTrack, s: MediaStream) => {",
    );
    expect(index).toContain('if (name === "main_video") handler(t, s);');
    expect(index).toContain('this.reactor.on("trackReceived", wrapped);');
    expect(index).toContain(
      'return () => this.reactor.off("trackReceived", wrapped);',
    );
  });

  it("does not emit any track methods when the schema has no tracks", () => {
    const { index } = sourceOf([]);
    expect(index).not.toContain("publishTrack");
    expect(index).not.toContain("unpublishTrack");
    expect(index).not.toContain('this.reactor.on("trackReceived"');
  });

  // ---- React hook ------------------------------------------------------

  it("emits `use<Prefix>Track(name)` only when the schema has at least one recvonly track", () => {
    const { react: withRecv } = sourceOf(
      [{ name: "main_video", kind: "video", direction: "out" }],
      true,
    );
    expect(withRecv).toContain("export function useHeliosTrack(");
    expect(withRecv).toContain("name: HeliosRecvTrackName,");
    expect(withRecv).toContain("return useReactor((s) => s.tracks[name]);");
    // The hook is typed on `HeliosRecvTrackName`, so the type has to be imported.
    expect(withRecv).toContain("type HeliosRecvTrackName");

    const { react: sendOnly } = sourceOf(
      [{ name: "webcam", kind: "video", direction: "in" }],
      true,
    );
    expect(sendOnly).not.toContain("useHeliosTrack");
    expect(sendOnly).not.toContain("HeliosRecvTrackName");
  });

  // ---- React components ------------------------------------------------

  it("emits one `<Prefix><Track>View>` wrapper component per video track, regardless of direction", () => {
    const { react } = sourceOf(
      [
        { name: "main_video", kind: "video", direction: "out" },
        { name: "webcam", kind: "video", direction: "in" },
      ],
      true,
    );
    expect(react).toContain("export function HeliosMainVideoView(");
    expect(react).toContain('track: "main_video"');
    // Props are emitted as `type` aliases rather than empty
    // `interface … extends …` declarations — see the lint-friendly
    // emission test below for why.
    expect(react).toContain(
      'export type HeliosMainVideoViewProps = Omit<ReactorViewProps, "track">;',
    );
    expect(react).toContain("export function HeliosWebcamView(");
    expect(react).toContain('track: "webcam"');
    expect(react).toContain(
      'export type HeliosWebcamViewProps = Omit<WebcamStreamProps, "track">;',
    );
  });

  it("pulls ReactorView / WebcamStream (and their props types) from the SDK only when needed", () => {
    const { react: bothKinds } = sourceOf(
      [
        { name: "main_video", kind: "video", direction: "out" },
        { name: "webcam", kind: "video", direction: "in" },
      ],
      true,
    );
    expect(bothKinds).toContain("ReactorView");
    expect(bothKinds).toContain("type ReactorViewProps");
    expect(bothKinds).toContain("WebcamStream");
    expect(bothKinds).toContain("type WebcamStreamProps");

    const { react: recvOnly } = sourceOf(
      [{ name: "main_video", kind: "video", direction: "out" }],
      true,
    );
    expect(recvOnly).toContain("ReactorView");
    expect(recvOnly).not.toContain("WebcamStream");

    const { react: empty } = sourceOf([], true);
    expect(empty).not.toContain("ReactorView");
    expect(empty).not.toContain("WebcamStream");
  });

  it("skips view components for audio-only tracks (SDK has no audio-only component today)", () => {
    const { react } = sourceOf(
      [
        { name: "mic", kind: "audio", direction: "in" },
        { name: "main_audio", kind: "audio", direction: "out" },
      ],
      true,
    );
    // No component imports or definitions referencing these tracks.
    expect(react).not.toContain("HeliosMicView");
    expect(react).not.toContain("HeliosMainAudioView");
    // But the typed hook still exists for audio recvonly tracks — just no component.
    expect(react).toContain("useHeliosTrack");
  });

  // ---- Multi-track schemas ---------------------------------------------

  it("emits one publish/on pair per track for multi-track schemas (no naming collision)", () => {
    const { index } = sourceOf([
      { name: "webcam", kind: "video", direction: "in" },
      { name: "screen_share", kind: "video", direction: "in" },
      { name: "main_video", kind: "video", direction: "out" },
      { name: "overlay_video", kind: "video", direction: "out" },
    ]);
    expect(index).toContain("publishWebcam");
    expect(index).toContain("publishScreenShare");
    expect(index).toContain("onMainVideo");
    expect(index).toContain("onOverlayVideo");
  });
});

// ---------------------------------------------------------------------------
// Injection-defence: emitter never trusts IR strings.
//
// The parser rejects hostile names at ingress, but the emitter is a
// separate layer — if the parser ever regresses or someone builds a
// `ModelSchema` by hand (as these tests do) the emitter must still
// produce TypeScript that parses, not TypeScript that executes
// attacker-controlled code at import time. These tests construct hostile
// IR directly to keep the emitter honest on its own.
// ---------------------------------------------------------------------------

describe("emitter — injection defence (defense in depth)", () => {
  // -------------------------------------------------------------------------
  // The codegen has two security layers:
  //
  //   1. The verifier (src/verifier.ts) — runs in `generateModelSdk` before
  //      the emitter and rejects any non-snake_case / reserved / colliding
  //      name outright. This is what the public API exposes; a real
  //      hostile schema never reaches the emitter through the public path.
  //
  //   2. The emitter's `JSON.stringify` escaping — every schema-sourced
  //      string is rendered as a JS string literal via JSON.stringify,
  //      which escapes quotes, backslashes, and control chars. This is
  //      the "what if a name slipped past the verifier" defense.
  //
  // The two tests below exist to PIN the layered defense:
  //   - The verifier *does* reject the hostile name through the public API.
  //   - The emitter *still* escapes it safely when called directly
  //     (bypassing the verifier — what would happen if a future emitter
  //     change introduced a new schema-sourced sink that the verifier
  //     didn't know about). Both layers are verified independently so a
  //     regression in either is loud.
  // -------------------------------------------------------------------------

  function hostileBase(overrides: Partial<ModelSchema> = {}): ModelSchema {
    return {
      modelName: "helios",
      modelVersion: "0.1.0",
      events: [],
      messages: [],
      tracks: [],
      ...overrides,
    };
  }

  it("escapes a hostile event name inside sendCommand(…) string literal", () => {
    const schema = hostileBase({
      events: [
        {
          name: 'set_prompt"; evil(); "',
          description: "",
          fields: {},
        },
      ],
    });

    // Layer 1: verifier rejects through the public API.
    expect(() =>
      generateModelSdk({
        modelName: "helios",
        modelVersion: "0.1.0",
        sdkVersion: "2.9.1",
        schema,
        outputDir: "/tmp/ignored",
      }),
    ).toThrow(CodegenVerificationError);

    // Layer 2: even if the verifier is bypassed (e.g. by a future
    // refactor that inserts a new sink), the emitter still emits a
    // safely-escaped JS string literal.
    const pkg = generator.generate({
      modelName: "helios",
      modelVersion: "0.1.0",
      sdkVersion: "2.9.1",
      schema,
      outputDir: "/tmp/ignored",
    });
    const src = pkg.files.find((f) => f.path === "src/index.ts")!.content;

    expect(src).toContain('sendCommand("set_prompt\\"; evil(); \\"", {});');
    expect(src).not.toMatch(/sendCommand\("set_prompt"; evil\(\); ""/);
  });

  it("escapes a hostile message name in the discriminator literal", () => {
    const schema = hostileBase({
      messages: [
        {
          name: 'prompt_accepted"; evil()',
          description: "",
          fields: {},
        },
      ],
    });

    expect(() =>
      generateModelSdk({
        modelName: "helios",
        modelVersion: "0.1.0",
        sdkVersion: "2.9.1",
        schema,
        outputDir: "/tmp/ignored",
      }),
    ).toThrow(CodegenVerificationError);

    const pkg = generator.generate({
      modelName: "helios",
      modelVersion: "0.1.0",
      sdkVersion: "2.9.1",
      schema,
      outputDir: "/tmp/ignored",
    });
    const src = pkg.files.find((f) => f.path === "src/index.ts")!.content;

    // Both sinks — `type: "…";` in the interface and `msg.type === "…"`
    // in the per-message listener — must emit an escaped literal.
    expect(src).toContain('type: "prompt_accepted\\"; evil()";');
    expect(src).toContain(
      'if (msg.type === "prompt_accepted\\"; evil()") handler(msg as',
    );
  });

  it("escapes MODEL_NAME / MODEL_VERSION string literals", () => {
    const pkg = generateModelSdk({
      modelName: "helios",
      modelVersion: '1.0.0"; globalThis.pwned = true; "',
      sdkVersion: "2.9.1",
      schema: hostileBase({
        modelName: "helios",
        modelVersion: '1.0.0"; globalThis.pwned = true; "',
      }),
      outputDir: "/tmp/ignored",
    });
    const src = pkg.files.find((f) => f.path === "src/index.ts")!.content;

    expect(src).toContain(
      'export const MODEL_VERSION = "1.0.0\\"; globalThis.pwned = true; \\"" as const;',
    );
    // The raw breakout sequence must never appear unescaped in the source.
    expect(src).not.toContain('"1.0.0"; globalThis.pwned');
  });

  it("neutralises a `*/` in a field description inside JSDoc", () => {
    // Worst-case real-world vector: a description containing a literal
    // `*/` would close the JSDoc block and let the trailing prose land
    // as top-level code at import time. sanitizeJsDocLine inside
    // generateJsDoc is the last line of defence for this sink.
    const pkg = generateModelSdk({
      modelName: "helios",
      modelVersion: "0.1.0",
      sdkVersion: "2.9.1",
      schema: hostileBase({
        events: [
          {
            name: "set_prompt",
            description: "",
            fields: {
              prompt: {
                type: "string",
                description: "The prompt. */ await fetch('attacker'); /*",
              },
            },
          },
        ],
      }),
      outputDir: "/tmp/ignored",
    });
    const src = pkg.files.find((f) => f.path === "src/index.ts")!.content;

    expect(src).toContain("*\\/ await fetch('attacker');");
    expect(src).not.toContain("*/ await fetch('attacker');");
  });

  it("collapses newlines inside descriptions so nothing escapes a line", () => {
    const pkg = generateModelSdk({
      modelName: "helios",
      modelVersion: "0.1.0",
      sdkVersion: "2.9.1",
      schema: hostileBase({
        events: [
          {
            name: "set_prompt",
            description: "first line\nimport 'http://attacker/'",
            fields: {},
          },
        ],
      }),
      outputDir: "/tmp/ignored",
    });
    const src = pkg.files.find((f) => f.path === "src/index.ts")!.content;

    // The smuggled `import` must stay inside the JSDoc body where
    // sanitizeJsDocLine collapsed it next to `first line`; it must not
    // appear at column 0 of any emitted line.
    expect(src).toContain("first line import 'http://attacker/'");
    expect(src).not.toMatch(/^import 'http:\/\/attacker\/'$/m);
  });

  it("escapes a hostile track name inside the <Prefix>Tracks constant", () => {
    // Track-constant emission is re-authored in PR 4 (the schema→transport
    // direction translation). The escaping has to live on the PR 4 line,
    // not PR 3's, or the rebase would drop it. This test pins that the
    // hardening survives the rewrite — and that the verifier blocks it
    // earlier through the public API.
    const schema = hostileBase({
      tracks: [
        {
          name: 'main_video"; evil()',
          kind: "video",
          direction: "out",
        },
      ],
    });

    expect(() =>
      generateModelSdk({
        modelName: "helios",
        modelVersion: "0.1.0",
        sdkVersion: "2.9.1",
        schema,
        outputDir: "/tmp/ignored",
      }),
    ).toThrow(CodegenVerificationError);

    const pkg = generator.generate({
      modelName: "helios",
      modelVersion: "0.1.0",
      sdkVersion: "2.9.1",
      schema,
      outputDir: "/tmp/ignored",
    });
    const src = pkg.files.find((f) => f.path === "src/index.ts")!.content;

    expect(src).toContain('name: "main_video\\"; evil()"');
    expect(src).not.toMatch(/name: "main_video"; evil\(\)"/);
    // kind / direction come from a closed set but are also routed through
    // JSON.stringify for consistency — the emitted literal must still be
    // the expected clean form for well-formed tracks.
    expect(src).toContain('kind: "video"');
    expect(src).toContain('direction: "recvonly"');
  });
});

// ---------------------------------------------------------------------------
// Lint-friendly emission.
//
// Generated React files are dropped into consumer projects whose lint
// configs we don't control — most commonly Next.js's default and the
// `eslint-plugin-react` / `typescript-eslint` recommended sets. Two
// rules in those configs flag patterns the emitter used to produce:
//
//   - `react/no-children-prop` — fires when `children` is passed as a
//     prop key inside `createElement(Comp, { children: … })` instead of
//     as the third positional argument.
//   - `@typescript-eslint/no-empty-object-type` (and the older
//     `no-empty-interface`) — fires on empty
//     `interface Foo extends Bar {}` declarations because they're
//     structurally identical to a plain `type Foo = Bar` alias.
//
// These tests pin the lint-clean output shapes so a future emitter
// refactor can't silently re-introduce either pattern. They are
// deliberately phrased as "no" assertions on the buggy form plus a
// positive assertion on the canonical form, to fail fast either way.
// ---------------------------------------------------------------------------

describe("emitter — lint-friendly React emission", () => {
  function reactSourceWith(overrides: Partial<ModelSchema>): string {
    return generateModelSdk({
      modelName: "helios",
      modelVersion: "0.1.0",
      sdkVersion: "2.9.1",
      schema: {
        modelName: "helios",
        modelVersion: "0.1.0",
        events: [],
        messages: [],
        tracks: [],
        ...overrides,
      },
      outputDir: "/tmp/ignored",
      react: true,
    }).files.find((f) => f.path === "src/react.ts")!.content;
  }

  it("Provider passes children as the third createElement argument, not as a prop key (react/no-children-prop)", () => {
    // The buggy form embeds `children: children,` (or a bare
    // `children,` shorthand) in the props object passed to
    // `createElement(ReactorProvider, …)`; that's what
    // `eslint-plugin-react`'s `react/no-children-prop` rule flags.
    //
    // The canonical form passes `children` as the third positional
    // argument to `createElement`. This compiles against @types/react
    // because the SDK's `ReactorProviderProps` declares `children` as
    // optional — see the comment in `ReactorProvider.tsx` — so the
    // overload's second arg can omit it. If the SDK ever tightens
    // `children` back to required, the emitter has to fall back to
    // the in-props form with a targeted
    // `eslint-disable-next-line react/no-children-prop` comment, and
    // this test will catch the regression.
    const react = reactSourceWith({
      tracks: [{ name: "main_video", kind: "video", direction: "out" }],
    });

    // Buggy form (explicit `children: children` key inside the
    // createElement props object) must be absent. We don't also
    // pattern-match a bare `children,` shorthand because the
    // function's destructuring parameter list legitimately contains
    // exactly that line — the positive assertion below catches any
    // accidental shorthand in the props object.
    expect(react).not.toContain("children: children");
    // No eslint-disable workaround anywhere in the file: the
    // canonical form lints clean and shouldn't need one.
    expect(react).not.toContain("eslint-disable-next-line");
    // Canonical form: `createElement(ReactorProvider, { … }, children, );`.
    // The trailing `}, children,` shape is the load-bearing part —
    // intermediate spacing varies with the prop list length.
    expect(react).toMatch(
      /createElement\(\s*ReactorProvider,\s*\{[\s\S]*?\},\s*children,\s*\);/,
    );
  });

  it("track view props are emitted as `type` aliases, not empty `interface … extends …` declarations (@typescript-eslint/no-empty-object-type)", () => {
    const react = reactSourceWith({
      tracks: [
        { name: "main_video", kind: "video", direction: "out" },
        { name: "webcam", kind: "video", direction: "in" },
      ],
    });

    // Buggy form: empty interface extension. The structural identity
    // with the parent type makes this an obvious lint candidate.
    expect(react).not.toMatch(
      /export interface \w+Props extends Omit<\w+Props, "track"> \{\}/,
    );
    // Canonical form: `type X = Omit<...>;`. Both directions covered.
    expect(react).toContain(
      'export type HeliosMainVideoViewProps = Omit<ReactorViewProps, "track">;',
    );
    expect(react).toContain(
      'export type HeliosWebcamViewProps = Omit<WebcamStreamProps, "track">;',
    );
  });
});
