#!/usr/bin/env bash
# Generate a typed @reactor-models/<name> SDK against the unreleased
# @reactor-team/js-sdk 3.0.0 and build it under examples/<example>/local/.
#
# Neither package is on npm in a 3.0.0-compatible form yet, so the example has
# to consume both off disk until the codegen sync republishes them.
set -euo pipefail

EXAMPLE="${1:?usage: local-model-sdk.sh <example-dir> <model-uuid> [model-slug]}"
MODEL_ID="${2:?usage: local-model-sdk.sh <example-dir> <model-uuid> [model-slug]}"
SLUG="${3:-$EXAMPLE}"

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CODEGEN="${CODEGEN_DIR:-$REPO/../js-sdk-codegen}"
JS_SDK="${JS_SDK_DIR:-$REPO/../reactor-client-sdks/sdks/js}"
OUT="$REPO/examples/$EXAMPLE/local/reactor-models-$SLUG"

export REACTOR_API_KEY="${REACTOR_API_KEY:-$(python3 -c "
import yaml
d = yaml.safe_load(open('$HOME/.reactor/keys.yaml'))
print([e['key'] for e in d['secrets']['reactor']
       if e.get('env') == 'prod' and e.get('role') == 'system'][0])
")}"

node "$CODEGEN/dist/cli.js" \
  --coordinator-url https://api.reactor.inc \
  --model-id "$MODEL_ID" \
  --react --sdk-version 3.0.0 --no-build \
  --output "$OUT"

# Swap the npm range for the on-disk build. pnpm resolves `file:` by symlink,
# so a rebuild of the SDK reaches the example without reinstalling.
python3 - "$OUT/package.json" "$JS_SDK" <<'PY'
import json, sys
path, sdk = sys.argv[1], sys.argv[2]
pkg = json.load(open(path))
pkg["dependencies"]["@reactor-team/js-sdk"] = f"file:{sdk}"
json.dump(pkg, open(path, "w"), indent=2)
PY

cd "$OUT"
# --ignore-workspace: the repo root is a pnpm workspace, and without this pnpm
# treats a package below it as out-of-workspace and installs nothing.
pnpm install --ignore-workspace --silent
pnpm build

echo "built $(node -p "require('$OUT/package.json').name")@$(node -p "require('$OUT/package.json').version")"
