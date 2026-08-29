#!/usr/bin/env bash
# Install an example against the on-disk @reactor-team/js-sdk 3.0.0 and the
# typed model SDK built by local-model-sdk.sh, then put the published ranges
# back in package.json.
#
# The install writes symlinks into node_modules, so restoring the ranges
# afterwards leaves a tree that type-checks and builds against the local
# packages while the committed manifest still names what npm will serve once
# both packages are republished.
set -euo pipefail

EXAMPLE="${1:?usage: link-local-sdks.sh <example-dir> [model-slug]}"
SLUG="${2:-$EXAMPLE}"

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
JS_SDK="${JS_SDK_DIR:-$REPO/../reactor-client-sdks/sdks/js}"
DIR="$REPO/examples/$EXAMPLE"
MODEL_SDK="$DIR/local/reactor-models-$SLUG"

[ -d "$MODEL_SDK/dist" ] || { echo "no built model SDK at $MODEL_SDK" >&2; exit 1; }

MODEL_VERSION="$(node -p "require('$MODEL_SDK/package.json').version")"

cp "$DIR/package.json" "$DIR/package.json.orig"
cp "$DIR/pnpm-lock.yaml" "$DIR/pnpm-lock.yaml.orig"
trap 'mv -f "$DIR/package.json.orig" "$DIR/package.json"; mv -f "$DIR/pnpm-lock.yaml.orig" "$DIR/pnpm-lock.yaml"' EXIT

python3 - "$DIR/package.json" "$JS_SDK" "$MODEL_SDK" "$SLUG" <<'PY'
import json, sys
path, sdk, model, slug = sys.argv[1:5]
pkg = json.load(open(path))
pkg["dependencies"]["@reactor-team/js-sdk"] = f"file:{sdk}"
pkg["dependencies"][f"@reactor-models/{slug}"] = f"file:{model}"
json.dump(pkg, open(path, "w"), indent=2)
PY

cd "$DIR"
pnpm install --ignore-workspace --no-frozen-lockfile

# Restore the published ranges, bumping the typed SDK to the release the
# generator just produced. The lockfile goes back untouched: the install
# rewrote it to absolute on-disk paths, and it can only be regenerated
# honestly once both packages are on npm.
mv -f "$DIR/package.json.orig" "$DIR/package.json"
mv -f "$DIR/pnpm-lock.yaml.orig" "$DIR/pnpm-lock.yaml"
trap - EXIT

python3 - "$DIR/package.json" "$MODEL_VERSION" "$SLUG" <<'PY'
import json, re, sys
path, version, slug = sys.argv[1:4]
src = open(path).read()
src = re.sub(r'("@reactor-team/js-sdk":\s*")[^"]*"', r'\g<1>^3.0.0"', src)
src = re.sub(rf'("@reactor-models/{re.escape(slug)}":\s*")[^"]*"',
             rf'\g<1>^{version}"', src)
open(path, "w").write(src)
PY

echo "linked $EXAMPLE -> js-sdk 3.0.0 + @reactor-models/$SLUG@$MODEL_VERSION"
