#!/usr/bin/env bash
# Copyright (c) 2024-2026 Reactor Technologies, Inc.
# SPDX-License-Identifier: Apache-2.0
#
# Verify that every TypeScript / TSX source file in the published packages
# carries the required Apache-2.0 SPDX header. Also confirm that the canonical
# LICENSE and NOTICE files exist at the repo root, and that both published
# package.json files declare "license": "Apache-2.0".
#
# Designed to run in CI (Buildkite + GitHub Actions) and locally:
#
#   ./scripts/check-license-headers.sh
#
# Exits non-zero with a clear message on the first violation. Prints nothing
# on success.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

REQUIRED_COPYRIGHT_RE='^// Copyright \(c\) [0-9]{4}(-[0-9]{4})? Reactor Technologies, Inc\.$'
REQUIRED_SPDX='// SPDX-License-Identifier: Apache-2.0'

errors=0
fail() {
  echo "license-check: $*" >&2
  errors=$((errors + 1))
}

# ---------------------------------------------------------------------------
# 1. Repo-level files
# ---------------------------------------------------------------------------

if [[ ! -f LICENSE ]]; then
  fail "missing LICENSE at repo root"
fi
if [[ ! -f NOTICE ]]; then
  fail "missing NOTICE at repo root"
fi
if [[ -f LICENSE ]] && ! grep -q "Apache License" LICENSE; then
  fail "LICENSE does not look like Apache 2.0"
fi

# ---------------------------------------------------------------------------
# 2. package.json license field
# ---------------------------------------------------------------------------

check_pkg_license() {
  local pkg="$1"
  if [[ ! -f "$pkg" ]]; then
    fail "missing $pkg"
    return
  fi
  local license
  license=$(node -e "process.stdout.write(require('./$pkg').license || '')")
  if [[ "$license" != "Apache-2.0" ]]; then
    fail "$pkg declares license \"$license\", expected \"Apache-2.0\""
  fi
}

check_pkg_license packages/js-sdk/package.json
check_pkg_license packages/create-app/package.json

# ---------------------------------------------------------------------------
# 3. Per-file SPDX headers
# ---------------------------------------------------------------------------
#
# Every .ts / .tsx file in the two published packages must start with the
# two-line SPDX header (after an optional shebang).

ts_files=$(find \
  packages/js-sdk/src \
  packages/js-sdk/__tests__ \
  packages/js-sdk/vitest.config.ts \
  packages/create-app/bin \
  -type f \( -name '*.ts' -o -name '*.tsx' \) 2>/dev/null | sort)

while IFS= read -r f; do
  [[ -z "$f" ]] && continue

  # Skip the shebang if present so the header check uses the next two lines.
  first_line=$(sed -n '1p' "$f")
  if [[ "$first_line" == \#!* ]]; then
    copyright_line=$(sed -n '2p' "$f")
    spdx_line=$(sed -n '3p' "$f")
  else
    copyright_line="$first_line"
    spdx_line=$(sed -n '2p' "$f")
  fi

  if ! [[ "$copyright_line" =~ $REQUIRED_COPYRIGHT_RE ]]; then
    fail "$f: missing or malformed copyright line (got: \"$copyright_line\")"
    continue
  fi
  if [[ "$spdx_line" != "$REQUIRED_SPDX" ]]; then
    fail "$f: missing SPDX-License-Identifier line (got: \"$spdx_line\")"
  fi
done <<< "$ts_files"

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

if (( errors > 0 )); then
  echo "" >&2
  echo "license-check: $errors violation(s) found." >&2
  echo "See CONTRIBUTING.md for the required header format." >&2
  exit 1
fi
