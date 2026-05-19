#!/usr/bin/env bash
#
# Verify that the repo-level license declaration is intact:
#   - LICENSE exists at the repo root and looks like Apache 2.0
#   - NOTICE exists at the repo root
#   - Every published package.json declares "license": "Apache-2.0"
#
# Per-file headers are intentionally not required — the repo-level
# LICENSE plus the SPDX field on each package.json is the source of
# truth, and skipping per-file headers keeps the contributor surface
# small (no copyright assignment to figure out for outside contributors).
#
# Run locally:
#
#   ./scripts/check-license.sh
#
# Exits non-zero with a clear message on the first violation.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

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
# Summary
# ---------------------------------------------------------------------------

if (( errors > 0 )); then
  echo "" >&2
  echo "license-check: $errors violation(s) found." >&2
  exit 1
fi
