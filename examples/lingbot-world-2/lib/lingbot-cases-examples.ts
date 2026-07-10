// Example scenarios sourced from the "lingbot-cases" corpus
// (case1/{0036,0038}, case2/{1012}).
//
// The scene DATA lives one-file-per-example under ./lingbot-cases/<slug>.json
// (slug = the example's kebab-cased name) — this module is just the loader /
// manifest: it imports each JSON and exports the ordered list the rest of the
// app consumes (LINGBOT_CASES_EXAMPLE_LIST). To edit a scene, edit its JSON; to
// add one, drop a new <slug>.json into ./lingbot-cases/ and add it below.
//
// Each JSON conforms to StructuredExample (see lingbot-world-prompts.ts) and is
// authored in layered-composition form: base.default = POV/motion-agnostic
// world identity (subject + environment + style); camera.default.{static,
// dynamic} = framing selected by WASD state (static orbits look-input around
// the centred subject, dynamic is rear-view tracking); movement.default.
// {static,dynamic} = idle vs. forward motion; each non-jump action slot
// (keys 1..9) is one append-mode event clause. composePrompt() concatenates
// the active selection at runtime. Source images live at
// public/lingbot-cases/<id>.jpg.

import type { StructuredExample } from "@/lib/lingbot-world-prompts";

// Auto-load EVERY case JSON in ./lingbot-cases/ -- drop a new <slug>.json in and it
// appears automatically (no manual import/registration). Chips are ordered
// alphabetically by filename; prefix with 01-, 02-, ... if you want a specific order.
// (webpack require.context; this app runs `next dev` on webpack.)
const ctx = (
  require as unknown as {
    context(
      dir: string,
      useSubdirs: boolean,
      filter: RegExp,
    ): { keys(): string[]; (key: string): { default?: StructuredExample } & StructuredExample };
  }
).context("./lingbot-cases", false, /\.json$/);

export const LINGBOT_CASES_EXAMPLE_LIST: StructuredExample[] = ctx
  .keys()
  .sort()
  .map((key) => {
    const mod = ctx(key);
    return (mod.default ?? mod) as StructuredExample;
  });
