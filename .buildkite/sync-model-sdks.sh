#!/usr/bin/env bash
# Copyright (c) 2026 Reactor Technologies, Inc. All rights reserved.
#
# Emit the dynamic publish pipeline to stdout.
#
# Reads `.buildkite/whitelist.json` and, for each model name listed
# there, substitutes `{{MODEL}}` in `.buildkite/publish-model-step.yml`
# (3-phase template: check → pack → publish) into a single YAML
# document. The caller — normally the `generate-publish-pipeline` step
# in `.buildkite/pipeline.yml` (gated on `build.env("MODELS_SYNC") == "true"`) —
# is responsible for piping the output to `buildkite-agent pipeline upload`.
#
# Keeping this script I/O-free lets anyone sanity-check the generated
# pipeline locally with a plain `bash .buildkite/sync-model-sdks.sh`.

set -euo pipefail

WHITELIST_PATH="${WHITELIST_PATH:-.buildkite/whitelist.json}"
STEP_TEMPLATE="${STEP_TEMPLATE:-.buildkite/publish-model-step.yml}"

for f in "$WHITELIST_PATH" "$STEP_TEMPLATE"; do
  if [[ ! -f "$f" ]]; then
    echo "required file not found: $f" >&2
    exit 1
  fi
done

# `jq` reads + validates the whitelist. It's a standard fixture on
# every Buildkite agent image we run; failing fast with a clear error
# is better than shipping a pure-bash JSON parser. The whitelist is
# always a flat JSON array of model names that are themselves
# constrained to the parser's identifier regex (see
# packages/codegen/src/openapi/parser.ts), so sed-substituting them
# directly into the template below is safe.
if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required to parse the whitelist but was not found on PATH" >&2
  exit 1
fi

# `jq -e 'type == "array"'` returns non-zero if the top-level value is
# not an array, which short-circuits the pipeline with a diagnostic.
if ! jq -e 'type == "array"' "$WHITELIST_PATH" >/dev/null; then
  echo "whitelist must be a JSON array of model names" >&2
  exit 1
fi

models=$(jq -r '.[]' "$WHITELIST_PATH")

if [[ -z "$models" ]]; then
  echo "# whitelist is empty, no steps to emit"
  echo "steps: []"
  exit 0
fi

echo "steps:"
while IFS= read -r model; do
  [[ -z "$model" ]] && continue
  # Prefix every non-blank template line with two spaces so each
  # rendered step nests correctly under the top-level `steps:` key.
  # Blank lines are left untouched: adding trailing whitespace on an
  # otherwise-empty line risks confusing YAML's indent detection inside
  # the `|` literal block scalar in the template's `commands:` bodies.
  #
  # `|` is the sed delimiter because model names are
  # `[a-zA-Z_][a-zA-Z0-9_]*` (enforced by the parser), so there's no
  # collision risk and the substitution reads naturally.
  sed "s|{{MODEL}}|${model}|g" "$STEP_TEMPLATE" \
    | awk 'NF {print "  " $0; next} {print}'
done <<< "$models"
