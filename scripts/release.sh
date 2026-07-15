#!/usr/bin/env bash
# Versioned public plugin release: bump package.json → test → package → commit → tag.
#
# Single version source: root package.json "version".
# Manifests under plugins/ and marketplace.json are rewritten by package-public-plugin.sh.
#
# Usage:
#   ./scripts/release.sh patch              # 0.2.0 → 0.2.1
#   ./scripts/release.sh minor              # 0.2.0 → 0.3.0
#   ./scripts/release.sh major              # 0.2.0 → 1.0.0
#   ./scripts/release.sh 0.2.0              # set exact version
#   ./scripts/release.sh minor --push       # also git push && git push --tags
#   ./scripts/release.sh --no-bump          # package + commit current version (no bump)
#   ./scripts/release.sh minor --no-test
#   ./scripts/release.sh minor --dry-run    # print plan only
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BUMP=""
EXACT=""
NO_BUMP=0
DO_PUSH=0
DO_TEST=1
DRY_RUN=0
NO_BUILD=0

usage() {
  sed -n '2,20p' "$0"
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    patch|minor|major) BUMP="$1"; shift ;;
    --no-bump) NO_BUMP=1; shift ;;
    --push) DO_PUSH=1; shift ;;
    --no-test) DO_TEST=0; shift ;;
    --no-build) NO_BUILD=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage ;;
    *)
      if [[ "$1" =~ ^[0-9]+\.[0-9]+\.[0-9]+([-.][0-9A-Za-z.+]+)?$ ]]; then
        EXACT="$1"
        shift
      else
        echo "unknown arg: $1" >&2
        usage
      fi
      ;;
  esac
done

if [[ "$NO_BUMP" -eq 0 && -z "$BUMP" && -z "$EXACT" ]]; then
  echo "error: specify patch|minor|major|X.Y.Z or --no-bump" >&2
  exit 1
fi

if [[ "$NO_BUMP" -eq 1 && ( -n "$BUMP" || -n "$EXACT" ) ]]; then
  echo "error: --no-bump cannot combine with version bump args" >&2
  exit 1
fi

CURRENT="$(node -p "require('./package.json').version")"
echo "==> current version: $CURRENT"

if [[ "$NO_BUMP" -eq 1 ]]; then
  NEXT="$CURRENT"
elif [[ -n "$EXACT" ]]; then
  NEXT="$EXACT"
else
  # compute next semver without git tagging yet
  NEXT="$(node -e "
const [a,b,c] = process.argv[1].split('.').map(Number);
const k = process.argv[2];
if (k === 'major') console.log([a+1,0,0].join('.'));
else if (k === 'minor') console.log([a,b+1,0].join('.'));
else console.log([a,b,c+1].join('.'));
" "$CURRENT" "$BUMP")"
fi

TAG="v${NEXT}"
echo "==> release version: $NEXT  (tag $TAG)"

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "[dry-run] would: bump package.json → test → package:plugin → commit → tag $TAG"
  [[ "$DO_PUSH" -eq 1 ]] && echo "[dry-run] would: git push && git push --tags"
  exit 0
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "error: working tree not clean; commit or stash first" >&2
  git status -sb
  exit 1
fi

if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "error: tag $TAG already exists" >&2
  exit 1
fi

if [[ "$NO_BUMP" -eq 0 ]]; then
  node -e "
const fs = require('fs');
const p = 'package.json';
const j = JSON.parse(fs.readFileSync(p, 'utf8'));
j.version = process.argv[1];
fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
" "$NEXT"
  echo "==> package.json version → $NEXT"
fi

if [[ "$DO_TEST" -eq 1 ]]; then
  echo "==> npm test"
  npm test
else
  echo "==> skip tests (--no-test)"
fi

PKG_ARGS=()
if [[ "$NO_BUILD" -eq 1 ]]; then
  PKG_ARGS+=(--no-build)
fi
echo "==> package public plugin"
bash scripts/package-public-plugin.sh "${PKG_ARGS[@]}"

# Assert version stamped
PV="$(node -p "require('./plugins/grokodex/.codex-plugin/plugin.json').version")"
if [[ "$PV" != "$NEXT" ]]; then
  echo "error: packaged plugin version $PV != $NEXT" >&2
  exit 1
fi

echo "==> git commit + tag"
git add package.json \
  plugins/grokodex \
  .agents/plugins/marketplace.json \
  .claude-plugin/marketplace.json \
  scripts/package-public-plugin.sh \
  scripts/release.sh \
  scripts/check-public-plugin.sh \
  CHANGELOG.md \
  README.md \
  2>/dev/null || true

# Stage whatever release-related paths exist
git add -A package.json plugins/grokodex .agents/plugins .claude-plugin scripts/ CHANGELOG.md README.md 2>/dev/null || true

if git diff --cached --quiet; then
  echo "error: nothing staged for release commit" >&2
  exit 1
fi

git commit -m "$(cat <<EOF
release: v${NEXT}

Package public dual-host plugin tree and stamp manifests from package.json.
EOF
)"

git tag -a "$TAG" -m "Grokodex v${NEXT}"

echo ""
echo "Released locally: $TAG"
echo "  package.json + plugins/grokodex + marketplaces committed"
echo ""
echo "Users can pin:"
echo "  codex plugin marketplace add anlostsheep/grokodex --ref $TAG"
echo "  claude plugin marketplace add anlostsheep/grokodex   # then update/install"
echo ""

if [[ "$DO_PUSH" -eq 1 ]]; then
  echo "==> git push origin HEAD && git push origin $TAG"
  git push origin HEAD
  git push origin "$TAG"
  echo "Pushed."
else
  echo "Next: git push origin HEAD && git push origin $TAG"
  echo "  or:  ./scripts/release.sh --no-bump --push   # after manual review (won't re-bump)"
  echo "  or re-run with --push on a clean tree after this tag exists (use git push only)"
fi
