#!/usr/bin/env bash
# Fail if committed public plugin tree is stale vs package-public-plugin.sh output.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if ! git -C "$ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "error: not a git repository" >&2
  exit 1
fi

echo "==> re-package (no build) and diff public artifacts"
bash "${ROOT}/scripts/package-public-plugin.sh" --no-build

if ! git -C "$ROOT" diff --exit-code -- \
  plugins/grokodex \
  .agents/plugins/marketplace.json \
  .claude-plugin/marketplace.json
then
  echo "error: public plugin tree out of date; run npm run package:plugin and commit" >&2
  exit 1
fi

echo "public plugin tree is up to date"
