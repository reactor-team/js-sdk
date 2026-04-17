# @reactor-team/codegen

Code generator that turns a model's OpenAPI schema into a strongly-typed
npm package (`@reactor-models/<name>`) wrapping `@reactor-team/js-sdk`.

> **Scaffolding stage.** This package currently contains only the IR
> (intermediate representation) types and package plumbing. The parser,
> emitter, and CLI are introduced in follow-up PRs on the same
> [REA-1581](https://linear.app/reactor-team/issue/REA-1581) stack.

## Intermediate representation

All downstream stages consume a normalised `ModelSchema`, decoupled
from the raw OpenAPI shape:

```ts
import type { ModelSchema } from "@reactor-team/codegen";

interface ModelSchema {
  modelName: string;
  modelVersion: string;
  events: EventSchema[];
  messages: MessageSchema[];
  tracks: TrackSchema[];
}
```

See `src/types.ts` for the full IR.

## Fixture

`schema.json` is a committed dummy OpenAPI document (model name `example`)
used by parser and CLI tests in later PRs of the stack. It is intentionally
minimal — just enough shape to exercise events with and without fields,
webhooks with and without fields, and a single output track.
