// Copyright (c) 2026 Reactor Technologies, Inc. All rights reserved.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadSchema, parseSchema } from "../src/openapi/index.js";
import type { OpenApiSchema } from "../src/openapi/index.js";

// ---------------------------------------------------------------------------
// Minimal inline fixtures — keep each test narrow and readable.
// The committed `example` fixture is exercised by the `schema.json fixture`
// suite at the bottom of the file.
// ---------------------------------------------------------------------------

function baseSchema(overrides: Partial<OpenApiSchema> = {}): OpenApiSchema {
  return {
    openapi: "3.1.0",
    info: { title: "test_model", version: "1.2.3" },
    ...overrides,
  };
}

describe("loadSchema", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codegen-parser-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("reads and parses a well-formed OpenAPI JSON document", () => {
    const filePath = path.join(tmpDir, "schema.json");
    fs.writeFileSync(filePath, JSON.stringify(baseSchema()));

    const result = loadSchema(filePath);

    expect(result.openapi).toBe("3.1.0");
    expect(result.info.title).toBe("test_model");
    expect(result.info.version).toBe("1.2.3");
  });

  it("throws when the document is missing the `openapi` field", () => {
    const filePath = path.join(tmpDir, "bad.json");
    fs.writeFileSync(
      filePath,
      JSON.stringify({ info: { title: "x", version: "0" } }),
    );

    expect(() => loadSchema(filePath)).toThrow(/missing "openapi" field/);
  });

  it("propagates JSON parse errors for malformed files", () => {
    const filePath = path.join(tmpDir, "garbage.json");
    fs.writeFileSync(filePath, "{ not json");

    expect(() => loadSchema(filePath)).toThrow();
  });
});

describe("parseSchema — modelName / modelVersion", () => {
  it("reads modelName from info.title and modelVersion from info.version", () => {
    const ir = parseSchema(
      baseSchema({ info: { title: "helios", version: "2.5.0" } }),
    );

    expect(ir.modelName).toBe("helios");
    expect(ir.modelVersion).toBe("2.5.0");
  });

  it("returns empty arrays when the schema declares no events/messages/tracks", () => {
    const ir = parseSchema(baseSchema());

    expect(ir.events).toEqual([]);
    expect(ir.messages).toEqual([]);
    expect(ir.tracks).toEqual([]);
  });
});

describe("parseSchema — events (paths → operations)", () => {
  it("extracts one event per `path.post` operation", () => {
    const ir = parseSchema(
      baseSchema({
        paths: {
          "/events/set_prompt": {
            post: {
              operationId: "set_prompt",
              summary: "Set the scene prompt",
              requestBody: {
                required: true,
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: {
                        prompt: { type: "string", default: "" },
                      },
                    },
                  },
                },
              },
            },
          },
          "/events/set_seed": {
            post: {
              operationId: "set_seed",
              summary: "RNG seed",
              requestBody: {
                required: true,
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: {
                        seed: { type: "integer", default: 0, minimum: 0 },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      }),
    );

    expect(ir.events).toHaveLength(2);
    const [setPrompt, setSeed] = ir.events;

    expect(setPrompt.name).toBe("set_prompt");
    expect(setPrompt.description).toBe("Set the scene prompt");
    expect(setPrompt.fields.prompt).toEqual({
      type: "string",
      default: "",
      description: undefined,
      minimum: undefined,
      maximum: undefined,
      minLength: undefined,
      maxLength: undefined,
      enum: undefined,
      format: undefined,
    });

    expect(setSeed.fields.seed).toMatchObject({
      type: "integer",
      default: 0,
      minimum: 0,
    });
  });

  it("falls back to the final path segment when operationId is absent", () => {
    const ir = parseSchema(
      baseSchema({
        paths: {
          "/events/start": {
            // @ts-expect-error deliberately malformed to test the fallback
            post: { summary: "start" },
          },
        },
      }),
    );

    expect(ir.events[0].name).toBe("start");
  });

  it("skips path items that have no `post` operation", () => {
    const ir = parseSchema(
      baseSchema({
        paths: {
          "/events/no_post": {},
        },
      }),
    );

    expect(ir.events).toEqual([]);
  });

  it("produces an empty field map when the requestBody is missing", () => {
    const ir = parseSchema(
      baseSchema({
        paths: {
          "/events/ping": {
            post: { operationId: "ping" },
          },
        },
      }),
    );

    expect(ir.events[0].fields).toEqual({});
  });

  it("preserves enum, min/max and length constraints on fields", () => {
    const ir = parseSchema(
      baseSchema({
        paths: {
          "/events/configure": {
            post: {
              operationId: "configure",
              summary: "",
              requestBody: {
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: {
                        sr_scale: {
                          type: "string",
                          enum: ["1x", "2x"],
                          default: "1x",
                        },
                        strength: {
                          type: "number",
                          minimum: 0,
                          maximum: 1,
                        },
                        label: {
                          type: "string",
                          minLength: 1,
                          maxLength: 64,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      }),
    );

    const fields = ir.events[0].fields;
    expect(fields.sr_scale.enum).toEqual(["1x", "2x"]);
    expect(fields.strength).toMatchObject({ minimum: 0, maximum: 1 });
    expect(fields.label).toMatchObject({ minLength: 1, maxLength: 64 });
  });
});

describe("parseSchema — messages (webhooks → operations)", () => {
  it("extracts one message per `webhooks.post` operation", () => {
    const ir = parseSchema(
      baseSchema({
        webhooks: {
          prompt_accepted: {
            post: {
              operationId: "prompt_accepted",
              summary: "A prompt was accepted and scheduled.",
              requestBody: {
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: {
                        prompt: { type: "string" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      }),
    );

    expect(ir.messages).toHaveLength(1);
    expect(ir.messages[0]).toMatchObject({
      name: "prompt_accepted",
      description: "A prompt was accepted and scheduled.",
    });
    expect(ir.messages[0].fields.prompt).toMatchObject({ type: "string" });
  });

  it("uses the webhook key as the message name when operationId is absent", () => {
    const ir = parseSchema(
      baseSchema({
        webhooks: {
          generation_started: {
            // @ts-expect-error deliberately malformed
            post: { summary: "started" },
          },
        },
      }),
    );

    expect(ir.messages[0].name).toBe("generation_started");
  });
});

describe("parseSchema — $ref resolution", () => {
  it("resolves a property $ref against components.schemas", () => {
    const ir = parseSchema(
      baseSchema({
        paths: {
          "/events/set_image": {
            post: {
              operationId: "set_image",
              summary: "",
              requestBody: {
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: {
                        image: {
                          $ref: "#/components/schemas/ReactorUploadReference",
                          default: null,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        components: {
          schemas: {
            ReactorUploadReference: {
              type: "object",
              format: "reactor-upload-reference",
              description:
                "Reference to a file uploaded via the presigned-URL protocol.",
            },
          },
        },
      }),
    );

    const imageField = ir.events[0].fields.image;
    expect(imageField.type).toBe("object");
    expect(imageField.format).toBe("reactor-upload-reference");
    expect(imageField.description).toMatch(/presigned-URL/);
    // The `default: null` from the original property is preserved.
    expect(imageField.default).toBeNull();
  });

  it("throws for an unresolved $ref", () => {
    expect(() =>
      parseSchema(
        baseSchema({
          paths: {
            "/events/bad": {
              post: {
                operationId: "bad",
                summary: "",
                requestBody: {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          x: { $ref: "#/components/schemas/Missing" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        }),
      ),
    ).toThrow(/Unresolved \$ref/);
  });
});

describe("parseSchema — tracks (x-reactor extension)", () => {
  it("passes through track name / kind / direction verbatim", () => {
    const ir = parseSchema(
      baseSchema({
        "x-reactor": {
          tracks: [
            { name: "main_video", kind: "video", direction: "out" },
            { name: "webcam", kind: "video", direction: "in" },
            { name: "mic", kind: "audio", direction: "in" },
          ],
        },
      }),
    );

    expect(ir.tracks).toEqual([
      { name: "main_video", kind: "video", direction: "out" },
      { name: "webcam", kind: "video", direction: "in" },
      { name: "mic", kind: "audio", direction: "in" },
    ]);
  });
});

describe("parseSchema — ingress validation (injection defence)", () => {
  // Every schema string that makes it past parseSchema will land verbatim
  // in generated TypeScript downstream. These tests pin the guard that
  // keeps hostile or malformed coordinator payloads from reaching the
  // emitter — the primary defence against supply-chain RCE via a crafted
  // `info.title`, operationId, field name, or track descriptor.

  it("rejects an info.title containing non-identifier characters", () => {
    // A modelName like this would both fail npm's package-name rules and,
    // without validation, land inside an unescaped `"${schema.modelName}"`
    // in the emitted source.
    expect(() =>
      parseSchema(baseSchema({ info: { title: 'hel"ios', version: "1.0.0" } })),
    ).toThrow(/Invalid info\.title/);
  });

  it("rejects an info.title starting with a digit", () => {
    expect(() =>
      parseSchema(baseSchema({ info: { title: "1helios", version: "1.0.0" } })),
    ).toThrow(/Invalid info\.title/);
  });

  it("rejects an info.version containing control characters", () => {
    expect(() =>
      parseSchema(
        baseSchema({ info: { title: "helios", version: "1.0.0\n;evil()" } }),
      ),
    ).toThrow(/Invalid info\.version/);
  });

  it("rejects an event operationId that would break out of a string literal", () => {
    expect(() =>
      parseSchema(
        baseSchema({
          paths: {
            "/events/x": {
              post: {
                operationId: 'set_prompt"; evil()',
                requestBody: {
                  content: {
                    "application/json": { schema: { type: "object" } },
                  },
                },
              },
            },
          },
        }),
      ),
    ).toThrow(/Invalid event name/);
  });

  it("rejects a webhook operationId with non-identifier chars", () => {
    expect(() =>
      parseSchema(
        baseSchema({
          webhooks: {
            bad: {
              post: {
                operationId: "prompt-accepted",
                requestBody: {
                  content: {
                    "application/json": { schema: { type: "object" } },
                  },
                },
              },
            },
          },
        }),
      ),
    ).toThrow(/Invalid message name/);
  });

  it("rejects an event field name containing whitespace", () => {
    expect(() =>
      parseSchema(
        baseSchema({
          paths: {
            "/events/set_prompt": {
              post: {
                operationId: "set_prompt",
                requestBody: {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          "bad name": { type: "string" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        }),
      ),
    ).toThrow(/Invalid field name on event "set_prompt"/);
  });

  it("rejects an unknown track.kind", () => {
    expect(() =>
      parseSchema(
        baseSchema({
          "x-reactor": {
            // @ts-expect-error intentionally invalid runtime value
            tracks: [{ name: "v", kind: "screen", direction: "out" }],
          },
        }),
      ),
    ).toThrow(/Invalid track "v" kind/);
  });

  it("rejects an unknown track.direction", () => {
    expect(() =>
      parseSchema(
        baseSchema({
          "x-reactor": {
            // @ts-expect-error intentionally invalid runtime value
            tracks: [{ name: "v", kind: "video", direction: "bidi" }],
          },
        }),
      ),
    ).toThrow(/Invalid track "v" direction/);
  });

  it("rejects a track name containing injection characters", () => {
    expect(() =>
      parseSchema(
        baseSchema({
          "x-reactor": {
            tracks: [
              { name: 'main"; evil()', kind: "video", direction: "out" },
            ],
          },
        }),
      ),
    ).toThrow(/Invalid track name/);
  });

  it("accepts a well-formed snake_case schema (regression guard)", () => {
    // Verify the validator doesn't reject the common case — the shape
    // every real Reactor model schema actually uses.
    expect(() =>
      parseSchema(
        baseSchema({
          info: { title: "helios", version: "1.0.5-ge6187a05" },
          paths: {
            "/events/set_prompt": {
              post: {
                operationId: "set_prompt",
                requestBody: {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: { prompt: { type: "string" } },
                      },
                    },
                  },
                },
              },
            },
          },
          webhooks: {
            prompt_accepted: {
              post: {
                operationId: "prompt_accepted",
                requestBody: {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: { prompt: { type: "string" } },
                      },
                    },
                  },
                },
              },
            },
          },
          "x-reactor": {
            tracks: [
              { name: "main_video", kind: "video", direction: "out" },
              { name: "webcam", kind: "video", direction: "in" },
            ],
          },
        }),
      ),
    ).not.toThrow();
  });
});

describe("schema.json fixture (example)", () => {
  it("parses the committed dummy fixture end-to-end", () => {
    // Smoke test against the in-repo `example` fixture — just enough
    // shape to exercise events + webhooks with and without fields, and
    // a single output track. Detailed per-field assertions live in the
    // inline-fixture suites above; this test only pins the fixture's
    // top-level contract so downstream CLI tests can rely on it.
    const fixturePath = path.join(__dirname, "..", "schema.json");
    const raw = loadSchema(fixturePath);
    const ir = parseSchema(raw);

    expect(ir.modelName).toBe("example");
    expect(ir.modelVersion).toBe("0.1.0");
    expect(ir.events.map((e) => e.name).sort()).toEqual(["ping", "set_value"]);
    expect(ir.messages.map((m) => m.name).sort()).toEqual([
      "pong",
      "value_changed",
    ]);
    expect(ir.tracks).toEqual([
      { name: "output_video", kind: "video", direction: "out" },
    ]);

    // `ping` + `pong` are intentionally field-less — the emitter uses
    // that to exercise its empty-params / empty-data code path.
    const ping = ir.events.find((e) => e.name === "ping")!;
    expect(ping.fields).toEqual({});
    const pong = ir.messages.find((m) => m.name === "pong")!;
    expect(pong.fields).toEqual({});
  });
});
