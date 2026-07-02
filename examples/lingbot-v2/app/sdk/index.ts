// Vendored pre-release snapshot of the typed Lingbot v2 SDK
// (`@reactor-models/lingbot-v2` v0.1.1) — the package is not published
// yet, so the two generated files sit here unmodified (repo Prettier
// formatting aside) and tsconfig maps the package specifier to this
// barrel:
//
//   "@reactor-models/lingbot-v2": ["./app/sdk/index.ts"]
//
// Components import from "@reactor-models/lingbot-v2" as if the package
// existed. When it publishes: add the dependency to package.json,
// delete this app/sdk/ directory, and drop the tsconfig paths entry —
// no component edits needed.
//
// Do not edit lingbot-v2.ts / lingbot-v2.react.tsx by hand; they are
// codegen output (see the js-sdk-codegen repo).
export * from "./lingbot-v2";
export * from "./lingbot-v2.react";
