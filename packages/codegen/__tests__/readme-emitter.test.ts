// Copyright (c) 2026 Reactor Technologies, Inc. All rights reserved.

import { describe, expect, it } from "vitest";

import { generateModelSdk } from "../src/codegen.js";
import { __testing__ } from "../src/readme-emitter.js";
import type { ModelSchema } from "../src/types.js";

// ---------------------------------------------------------------------------
// README emission — schema-driven JS/React docs with a generic auth flow
// pulled from the committed template.
//
// Tests drive through `generateModelSdk` so the whole pipeline (template
// load → placeholder substitution → per-event/message/track rendering)
// is exercised; assertions pick the `README.md` entry out of the
// generated file list to scope the check.
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

describe("README emission", () => {
  function readmeFor(overrides: Partial<ModelSchema> = {}): string {
    const merged = schema({ modelVersion: "1.0.5", ...overrides });
    const pkg = generateModelSdk({
      modelName: merged.modelName,
      modelVersion: merged.modelVersion,
      sdkVersion: "2.9.1",
      schema: merged,
      outputDir: "/tmp/ignored",
    });
    return pkg.files.find((f) => f.path === "README.md")!.content;
  }

  it("substitutes model name / prefix / version into the template header", () => {
    const md = readmeFor();
    expect(md).toContain("# @reactor-models/helios");
    // `formatVersionForHeader` normalises the leading v.
    expect(md).toContain("Version **v1.0.5**");
    expect(md).toContain("npm install @reactor-models/helios");
  });

  it("imports the React provider from the package root, not a /react subpath", () => {
    // Everything — plain JS and React — is exported from the package
    // root; there is no `/react` subpath in the generated SDK or the
    // rendered README. This locks in the "no subpath" contract so the
    // template can't accidentally drift back to a `/react` import.
    const md = readmeFor();
    expect(md).toContain(
      'import { HeliosProvider } from "@reactor-models/helios";',
    );
    expect(md).not.toContain("@reactor-models/helios/react");
    expect(md).toContain("https://api.reactor.inc/tokens");
    expect(md).toContain("Reactor-API-Key");
    // No unsubstituted placeholders anywhere in the output.
    expect(md).not.toMatch(/\{\{[A-Z_]+\}\}/);
  });

  it("drops the auto-gen disclaimer and @reactor-team/js-sdk dependency note", () => {
    const md = readmeFor();
    // The noisy "Generated from the model's OpenAPI schema … do not
    // edit by hand" line lives in every source file header as a code
    // comment; keeping it in the README too was just duplicated prose.
    expect(md).not.toMatch(/do not edit by hand/i);
    expect(md).not.toMatch(/overwritten on every release/i);
    // The package.json already declares `@reactor-team/js-sdk` as a
    // dependency — callers don't need to be told in the README.
    expect(md).not.toMatch(
      /declares .*@reactor-team\/js-sdk.* as a dependency/i,
    );
  });

  it("wires the React examples to the committed /api/reactor/token route", () => {
    // The template intentionally matches the Next.js route handler's
    // path — if the route path changes in the template header, the
    // client-side fetch call below has to move in lockstep or the
    // examples break silently.
    const md = readmeFor();
    expect(md).toContain("app/api/reactor/token/route.ts");
    expect(md).toContain('fetch("/api/reactor/token", { method: "POST" })');
    // The Authenticate section still uses `autoConnect: true` (full-app
    // example with a video feed that wants to connect immediately); the
    // Connect section deliberately drops it so the simpler "status
    // indicator" example doesn't demand a running session. The overall
    // presence check in the JSX-passthrough test below guarantees the
    // invariant that {{ ... }} object literals survive substitution.
  });

  it("renders one section per event with a param table + JS/React snippets", () => {
    const md = readmeFor({
      events: [
        {
          name: "set_prompt",
          description: "Set and encode the scene prompt.",
          fields: {
            prompt: {
              type: "string",
              default: "",
              description: "Scene description.",
            },
          },
        },
      ],
    });

    expect(md).toContain("## Events");
    expect(md).toContain("### `setPrompt`");
    expect(md).toContain("Set and encode the scene prompt.");
    // Parameter table header.
    expect(md).toContain("| Parameter | Type | Required | Description |");
    // JS + React code blocks for the event.
    expect(md).toContain("#### JavaScript");
    expect(md).toContain("await helios.setPrompt({");
    expect(md).toContain("#### React");
    expect(md).toContain("const { setPrompt } = useHelios();");
  });

  it("renders one section per message with listener + hook names", () => {
    const md = readmeFor({
      messages: [
        {
          name: "prompt_accepted",
          description: "The prompt was accepted.",
          fields: { prompt: { type: "string" } },
        },
      ],
    });

    expect(md).toContain("## Messages");
    expect(md).toContain("### `prompt_accepted`");
    expect(md).toContain("Listener: `onPromptAccepted`");
    expect(md).toContain("React hook: `useHeliosPromptAccepted`");
    // JS snippet wires the on<Name> listener via the class instance.
    expect(md).toContain("helios.onPromptAccepted((msg) =>");
    // React snippet uses the typed hook.
    expect(md).toContain("useHeliosPromptAccepted((msg) =>");
  });

  it("escapes pipe chars in enum union types so GFM tables don't break", () => {
    // Regression: enum fields render as `"a" | "b" | "c"` — the literal
    // pipes terminate the parameter-table cell unless backslash-escaped.
    // Before the fix, the Helios `sr_scale` row rendered as
    //   | `sr_scale` | `"off" | "2x" | "4x"` | ... |
    // which GFM parsed as 6 cells, pushing the description into the wrong
    // column. Check the escaped form is emitted verbatim.
    const md = readmeFor({
      events: [
        {
          name: "set_sr_scale",
          description: "Set super-resolution factor.",
          fields: {
            sr_scale: {
              type: "string",
              enum: ["off", "2x", "4x"],
              default: "2x",
              description: "Upscaling factor.",
            },
          },
        },
      ],
    });
    expect(md).toContain('`"off" \\| "2x" \\| "4x"`');
    // And — paranoid check — the unescaped form must not leak in.
    expect(md).not.toContain('`"off" | "2x" | "4x"`');
  });

  it("renders a user-facing section per track with JS + React usage examples (REA-1791)", () => {
    const md = readmeFor({
      tracks: [
        { name: "main_video", kind: "video", direction: "out" as const },
        { name: "webcam", kind: "video", direction: "in" as const },
      ],
    });

    expect(md).toContain("## Tracks");

    // One `### <name>` heading per track, matching the Events/Messages layout.
    expect(md).toContain("### `main_video`");
    expect(md).toContain("### `webcam`");

    // Recvonly track: JS uses `on<Track>`, React shows the wrapper component.
    expect(md).toContain("helios.onMainVideo((track, stream)");
    expect(md).toContain("import { HeliosMainVideoView }");
    expect(md).toContain("<HeliosMainVideoView");

    // Sendonly track: JS uses `publish<Track>`, React shows the publisher component.
    expect(md).toContain("await helios.publishWebcam(");
    expect(md).toContain("await helios.unpublishWebcam(");
    expect(md).toContain("import { HeliosWebcamView }");
    expect(md).toContain("<HeliosWebcamView");

    // Docs must NOT leak internals — the README is a product surface.
    // The previous version dumped `modelTracks`, "parallel SDP", etc.;
    // those now live in the package's code comments, not in user docs.
    expect(md).not.toMatch(/modelTracks/);
    expect(md).not.toMatch(/SDP/);
    expect(md).not.toMatch(/parallel with session/);
  });

  it("cross-links backticked message names in event descriptions", () => {
    const md = readmeFor({
      events: [
        {
          name: "set_prompt",
          description: "Emits `prompt_accepted` when scheduled.",
          fields: {},
        },
      ],
      messages: [{ name: "prompt_accepted", description: "", fields: {} }],
    });
    // Description body gets the token replaced with a markdown link.
    expect(md).toContain("Emits [`prompt_accepted`](#prompt_accepted)");
    // …and the dedicated "Emits:" line under the event is present too.
    expect(md).toMatch(/Emits: \[`prompt_accepted`\]\(#prompt_accepted\)/);
  });

  it("falls back gracefully when the schema has no events or messages", () => {
    const md = readmeFor({ events: [], messages: [], tracks: [] });
    // Header + install + auth + connect still rendered…
    expect(md).toContain("# @reactor-models/helios");
    expect(md).toContain("## Authenticate");
    // …but none of the dynamic section headings appear without content.
    expect(md).not.toContain("## Events");
    expect(md).not.toContain("## Messages");
    expect(md).not.toContain("## Tracks");
  });

  it("renderTemplate is strict about missing placeholders", () => {
    const { renderTemplate } = __testing__;
    // Known placeholders work.
    expect(renderTemplate("hi {{MODEL_NAME}}", { MODEL_NAME: "helios" })).toBe(
      "hi helios",
    );
    // Unknown placeholders throw loudly — we'd rather fail the build
    // than ship literal `{{X}}` in a README.
    expect(() => renderTemplate("{{UNKNOWN}}", {})).toThrow(
      /Unknown README placeholder \{\{UNKNOWN\}\}/,
    );
  });

  it("leaves JSX object expressions in the template untouched", () => {
    // The regex for placeholders is `\{\{[A-Z_]+\}\}` with no
    // whitespace inside the braces, so JSX like
    // `connectOptions={{ autoConnect: true }}` should survive
    // substitution unchanged — a smoke test that protects that
    // invariant if anyone tightens the regex later.
    const md = readmeFor();
    expect(md).toContain("connectOptions={{ autoConnect: true }}");
  });
});
