# vendor/ — pre-publication typed SDK

This directory holds the **vendored** typed SDK for this example:
`@reactor-models/visko-orbis-distilled@2.0.0`.

## Why it's here

The package is generated from the model's live PROD schema (release v2.0.0)
by `@reactor-team/codegen`, but it is **not yet published to the public npm
registry**. Until it is, this example wires the local copy in so the app is
fully cloneable and `pnpm install && pnpm dev` works today.

## How it's wired

`../package.json` declares the dependency it _wants_:

```jsonc
"dependencies": { "@reactor-models/visko-orbis-distilled": "^2.0.0" },
"pnpm": {
  "overrides": {
    "@reactor-models/visko-orbis-distilled": "link:./vendor/visko-orbis-distilled"
  }
}
```

The `link:` override makes pnpm satisfy that `^2.0.0` requirement from the
local folder instead of the registry. Nothing else in the app knows the
difference — every import is still `@reactor-models/visko-orbis-distilled`.

## What's inside

Only the distributable — `visko-orbis-distilled/package.json`, its `dist/`
(build output: JS + `.d.ts`), and its README. The generator's `src/` and
tool configs (`tsup.config.ts`, `tsconfig.json`) are intentionally removed:
Next.js type-checks every `.ts` file under the project root, so leaving the
build tooling in place makes `next build` try to compile them (and fail on
the uninstalled `tsup` types). The published npm package has exactly this
same shape, so this isn't a hack — it's what `npm i` would lay down.

## Switching to the published package (post-launch)

Once `@reactor-models/visko-orbis-distilled` is live on the registry:

1. Delete the `pnpm.overrides` block from `../package.json`.
2. Delete this `vendor/` directory.
3. `pnpm up @reactor-models/visko-orbis-distilled`

The app code needs zero changes.

## Regenerating (if the schema moves)

From the [`js-sdk-codegen`](../../../js-sdk-codegen) repo, with a
`REACTOR_API_KEY` that can see the model:

```bash
node dist/cli.js \
  --coordinator-url https://api.reactor.inc \
  --model reactor/visko-orbis-distilled \
  --output visko-orbis-distilled \   # into this vendor/ dir
  --react
# then remove the tool-only files so next build stays clean:
rm -rf visko-orbis-distilled/{src,tsup.config.ts,tsconfig.json,node_modules,pnpm-lock.yaml}
```
