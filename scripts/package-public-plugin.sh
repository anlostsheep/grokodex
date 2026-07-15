#!/usr/bin/env bash
# Assemble committed public plugin tree at plugins/grokodex.
# Version is always read from root package.json (single source of truth).
#
# Usage:
#   ./scripts/package-public-plugin.sh
#   ./scripts/package-public-plugin.sh --no-build
#   ./scripts/package-public-plugin.sh --mcp-strategy=2   # default: Claude + Codex dual MCP files
#   ./scripts/package-public-plugin.sh --mcp-strategy=1   # legacy single Codex-shaped .mcp.json (breaks Claude Code cwd)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${ROOT}/plugins/grokodex"
DO_BUILD=1
# Default strategy 2: Claude Code requires ${CLAUDE_PLUGIN_ROOT} (session cwd ≠ plugin root).
# Codex reads .mcp.codex.json via .codex-plugin/plugin.json.
MCP_STRATEGY=2

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-build) DO_BUILD=0; shift ;;
    --mcp-strategy=1) MCP_STRATEGY=1; shift ;;
    --mcp-strategy=2) MCP_STRATEGY=2; shift ;;
    -h|--help)
      sed -n '2,12p' "$0"
      exit 0
      ;;
    *)
      echo "unknown arg: $1" >&2
      exit 1
      ;;
  esac
done

VERSION="$(node -p "require('${ROOT}/package.json').version")"
if [[ -z "$VERSION" || "$VERSION" == "undefined" ]]; then
  echo "error: cannot read version from package.json" >&2
  exit 1
fi

echo "==> package public plugin v${VERSION} (mcp strategy ${MCP_STRATEGY})"

if [[ "$DO_BUILD" -eq 1 ]]; then
  echo "==> npm run build"
  (cd "$ROOT" && npm run build)
else
  echo "==> skip build (--no-build)"
fi

BUNDLE="${ROOT}/bridge/dist/bundle.mjs"
if [[ ! -f "$BUNDLE" ]]; then
  echo "error: missing $BUNDLE" >&2
  exit 1
fi

rm -rf "$OUT"
mkdir -p "$OUT/bridge/dist" "$OUT/skills" "$OUT/assets" \
  "$OUT/.codex-plugin" "$OUT/.claude-plugin"

cp "$BUNDLE" "$OUT/bridge/dist/bundle.mjs"
rsync -a --delete "${ROOT}/skills/" "$OUT/skills/"
# Only plugin chrome assets (not README star-history charts under assets/star-history/)
mkdir -p "$OUT/assets"
for f in icon.svg logo.svg; do
  if [[ -f "${ROOT}/assets/$f" ]]; then
    cp "${ROOT}/assets/$f" "$OUT/assets/$f"
  fi
done
[[ -f "${ROOT}/LICENSE" ]] && cp "${ROOT}/LICENSE" "$OUT/LICENSE"

cat >"$OUT/README.md" <<EOF
# Grokodex

Local Grok agent & tools (MCP) for Codex and Claude Code.

Install from the repo marketplace (see root README). Requires Node.js 18.18+ on PATH and a logged-in \`grok\` CLI.

Version: ${VERSION}
EOF

node -e "
const fs = require('fs');
const path = require('path');
const root = process.argv[1];
const out = process.argv[2];
const version = process.argv[3];
const strategy = process.argv[4];

const codexSrc = JSON.parse(fs.readFileSync(path.join(root, 'hosts/codex/.codex-plugin/plugin.json'), 'utf8'));
codexSrc.version = version;
codexSrc.mcpServers = strategy === '2' ? './.mcp.codex.json' : './.mcp.json';
if (!codexSrc.repository) codexSrc.repository = 'https://github.com/anlostsheep/grokodex';
fs.writeFileSync(path.join(out, '.codex-plugin/plugin.json'), JSON.stringify(codexSrc, null, 2) + '\n');

const claudeSrc = JSON.parse(fs.readFileSync(path.join(root, 'hosts/claude/.claude-plugin/plugin.json'), 'utf8'));
claudeSrc.version = version;
if (!claudeSrc.repository) claudeSrc.repository = 'https://github.com/anlostsheep/grokodex';
if (!claudeSrc.homepage) claudeSrc.homepage = 'https://github.com/anlostsheep/grokodex';
if (!claudeSrc.license) claudeSrc.license = 'MIT';
fs.writeFileSync(path.join(out, '.claude-plugin/plugin.json'), JSON.stringify(claudeSrc, null, 2) + '\n');
" "$ROOT" "$OUT" "$VERSION" "$MCP_STRATEGY"

if [[ "$MCP_STRATEGY" -eq 1 ]]; then
  cat >"$OUT/.mcp.json" <<'EOF'
{
  "mcpServers": {
    "grokodex": {
      "command": "node",
      "args": ["./bridge/dist/bundle.mjs"],
      "cwd": ".",
      "env": {
        "GROKODEX_USE_LEADER": "1",
        "GROKODEX_LEADER_FALLBACK": "1",
        "GROKODEX_LEADER_ENSURE": "1"
      }
    }
  }
}
EOF
else
  cat >"$OUT/.mcp.json" <<'EOF'
{
  "grokodex": {
    "command": "node",
    "args": ["${CLAUDE_PLUGIN_ROOT}/bridge/dist/bundle.mjs"],
    "env": {
      "GROKODEX_USE_LEADER": "1",
      "GROKODEX_LEADER_FALLBACK": "1",
      "GROKODEX_LEADER_ENSURE": "1"
    }
  }
}
EOF
  cat >"$OUT/.mcp.codex.json" <<'EOF'
{
  "mcpServers": {
    "grokodex": {
      "command": "node",
      "args": ["./bridge/dist/bundle.mjs"],
      "cwd": ".",
      "env": {
        "GROKODEX_USE_LEADER": "1",
        "GROKODEX_LEADER_FALLBACK": "1",
        "GROKODEX_LEADER_ENSURE": "1"
      }
    }
  }
}
EOF
fi

mkdir -p "${ROOT}/.agents/plugins" "${ROOT}/.claude-plugin"

node -e "
const fs = require('fs');
const path = require('path');
const root = process.argv[1];
const version = process.argv[2];
fs.writeFileSync(path.join(root, '.agents/plugins/marketplace.json'), JSON.stringify({
  name: 'grokodex',
  interface: { displayName: 'Grokodex' },
  plugins: [{
    name: 'grokodex',
    source: { source: 'local', path: './plugins/grokodex' },
    policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
    category: 'Developer Tools',
  }],
}, null, 2) + '\n');
fs.writeFileSync(path.join(root, '.claude-plugin/marketplace.json'), JSON.stringify({
  name: 'grokodex',
  owner: { name: 'Grokodex contributors' },
  metadata: {
    description: 'Local Grok agent & tools for Claude Code',
    version,
  },
  plugins: [{
    name: 'grokodex',
    description: 'Local Grok via MCP: setup, run, imagine, X search',
    version,
    author: { name: 'Grokodex contributors' },
    source: './plugins/grokodex',
  }],
}, null, 2) + '\n');
" "$ROOT" "$VERSION"

assert_ok() {
  local msg="$1"
  shift
  if ! "$@"; then
    echo "error: $msg" >&2
    exit 1
  fi
}

assert_ok "bundle missing" test -f "$OUT/bridge/dist/bundle.mjs"
assert_ok "codex plugin.json missing" test -f "$OUT/.codex-plugin/plugin.json"
assert_ok "claude plugin.json missing" test -f "$OUT/.claude-plugin/plugin.json"
assert_ok "skills missing" test -d "$OUT/skills/grokodex-setup"

if [[ "$MCP_STRATEGY" -eq 2 ]]; then
  assert_ok "Claude MCP missing CLAUDE_PLUGIN_ROOT" \
    grep -Fq '${CLAUDE_PLUGIN_ROOT}/bridge/dist/bundle.mjs' "$OUT/.mcp.json"
  assert_ok "Codex MCP file missing" test -f "$OUT/.mcp.codex.json"
  # Claude .mcp.json must not rely on relative ./bridge (session cwd bug)
  if grep -qE '"\./bridge/|"cwd"[[:space:]]*:[[:space:]]*"\."' "$OUT/.mcp.json"; then
    echo "error: Claude .mcp.json must not use relative ./bridge or cwd . (Claude Code resolves session cwd)" >&2
    exit 1
  fi
fi

if grep -RE '/Users/|/home/|fnm/aliases' "$OUT" \
  "${ROOT}/.agents/plugins/marketplace.json" \
  "${ROOT}/.claude-plugin/marketplace.json" 2>/dev/null; then
  echo "error: absolute/machine paths found in public tree or marketplaces" >&2
  exit 1
fi

dist_count="$(find "$OUT/bridge/dist" -type f | wc -l | tr -d ' ')"
if [[ "$dist_count" != "1" ]]; then
  echo "error: expected only bundle.mjs in bridge/dist, found $dist_count files" >&2
  find "$OUT/bridge/dist" -type f >&2
  exit 1
fi

for f in \
  "$OUT/.codex-plugin/plugin.json" \
  "$OUT/.claude-plugin/plugin.json"
do
  v="$(node -p "require('$f').version")"
  if [[ "$v" != "$VERSION" ]]; then
    echo "error: version mismatch in $f ($v != $VERSION)" >&2
    exit 1
  fi
done
cv="$(node -p "require('${ROOT}/.claude-plugin/marketplace.json').metadata.version")"
if [[ "$cv" != "$VERSION" ]]; then
  echo "error: marketplace metadata.version $cv != $VERSION" >&2
  exit 1
fi

echo "==> tree summary"
find "$OUT" -type f | sort | sed "s|^${ROOT}/||"
echo "==> bundle size: $(wc -c <"$OUT/bridge/dist/bundle.mjs" | tr -d ' ') bytes"
echo "Done. Public unit: $OUT"
