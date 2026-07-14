#!/usr/bin/env bash
# Install / refresh Grokodex into a local Claude Code marketplace.
# Usage:
#   ./scripts/install-claude-plugin.sh
#   ./scripts/install-claude-plugin.sh --no-build
#   ./scripts/install-claude-plugin.sh --no-leader
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOME_DIR="${HOME:?HOME not set}"
VERSION="0.1.0"
PLUGIN_NAME="grokodex"
MARKET_NAME="grokodex-local"
MARKET_ROOT="${HOME_DIR}/.claude/plugins/marketplaces/${MARKET_NAME}"
PLUGIN_DEST="${MARKET_ROOT}/plugins/${PLUGIN_NAME}"

NODE_BIN="$(command -v node || true)"
if [[ -z "$NODE_BIN" ]]; then
  echo "error: node not found on PATH (need Node.js 18.18+)" >&2
  exit 1
fi

DO_BUILD=1
USE_LEADER=1
while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-build) DO_BUILD=0; shift ;;
    --no-leader) USE_LEADER=0; shift ;;
    -h|--help)
      sed -n '2,8p' "$0"
      exit 0
      ;;
    *)
      echo "unknown arg: $1" >&2
      exit 1
      ;;
  esac
done

if [[ ! -d "${ROOT}/hosts/claude/.claude-plugin" ]]; then
  echo "error: missing hosts/claude/.claude-plugin — repo layout incomplete" >&2
  exit 1
fi

echo "==> repo: $ROOT"
echo "==> node: $NODE_BIN"
echo "==> marketplace: $MARKET_NAME"
echo "==> GROKODEX_USE_LEADER: $USE_LEADER"

if [[ "$DO_BUILD" -eq 1 ]]; then
  echo "==> npm run build"
  (cd "$ROOT" && npm run build)
else
  echo "==> skip build (--no-build)"
  if [[ ! -f "$ROOT/bridge/dist/bundle.mjs" ]]; then
    echo "error: missing bridge/dist/bundle.mjs — run without --no-build" >&2
    exit 1
  fi
fi

mkdir -p "${PLUGIN_DEST}/bridge/dist" "${PLUGIN_DEST}/skills" \
  "${PLUGIN_DEST}/assets" "${PLUGIN_DEST}/.claude-plugin" \
  "${MARKET_ROOT}/.claude-plugin"

echo "==> assemble plugin at ${PLUGIN_DEST}"
rsync -a --delete "${ROOT}/bridge/dist/" "${PLUGIN_DEST}/bridge/dist/"
rsync -a --delete "${ROOT}/skills/" "${PLUGIN_DEST}/skills/"
if [[ -d "${ROOT}/assets" ]]; then
  rsync -a --delete "${ROOT}/assets/" "${PLUGIN_DEST}/assets/"
fi
rsync -a --delete \
  "${ROOT}/hosts/claude/.claude-plugin/" "${PLUGIN_DEST}/.claude-plugin/"
[[ -f "${ROOT}/LICENSE" ]] && cp "${ROOT}/LICENSE" "${PLUGIN_DEST}/LICENSE"
[[ -f "${ROOT}/README.md" ]] && cp "${ROOT}/README.md" "${PLUGIN_DEST}/README.md"

# .mcp.json — Claude plugin style (stdio + CLAUDE_PLUGIN_ROOT)
# Note: ${CLAUDE_PLUGIN_ROOT} must be literal for Claude to expand.
cat >"${PLUGIN_DEST}/.mcp.json" <<EOF
{
  "grokodex": {
    "command": "${NODE_BIN}",
    "args": ["\${CLAUDE_PLUGIN_ROOT}/bridge/dist/bundle.mjs"],
    "env": {
      "GROKODEX_USE_LEADER": "${USE_LEADER}",
      "GROKODEX_LEADER_FALLBACK": "1",
      "GROKODEX_LEADER_ENSURE": "1"
    }
  }
}
EOF

# marketplace manifest
cat >"${MARKET_ROOT}/.claude-plugin/marketplace.json" <<EOF
{
  "name": "${MARKET_NAME}",
  "owner": {
    "name": "local"
  },
  "metadata": {
    "description": "Local personal marketplace for Grokodex development",
    "version": "${VERSION}"
  },
  "plugins": [
    {
      "name": "${PLUGIN_NAME}",
      "description": "Local Grok agent & tools via MCP (setup, run, imagine, X search)",
      "version": "${VERSION}",
      "author": { "name": "Grokodex contributors" },
      "source": "./plugins/${PLUGIN_NAME}"
    }
  ]
}
EOF

if command -v claude >/dev/null 2>&1; then
  echo "==> validate plugin"
  if ! claude plugin validate "${PLUGIN_DEST}"; then
    echo "warn: validate reported issues (continuing)" >&2
  fi

  echo "==> marketplace add/update ${MARKET_NAME}"
  # Prefer add; if already known, update source
  if claude plugin marketplace list 2>/dev/null | grep -q "${MARKET_NAME}"; then
    claude plugin marketplace update "${MARKET_NAME}" 2>/dev/null || \
      claude plugin marketplace add "${MARKET_ROOT}" 2>/dev/null || true
  else
    claude plugin marketplace add "${MARKET_ROOT}" 2>/dev/null || true
  fi

  echo "==> install ${PLUGIN_NAME}@${MARKET_NAME}"
  if ! claude plugin install "${PLUGIN_NAME}@${MARKET_NAME}" -s user; then
    echo "warn: install failed — enable manually in Claude Code /plugin UI" >&2
    echo "      marketplace path: ${MARKET_ROOT}" >&2
  fi
  echo "==> plugin list (head)"
  claude plugin list 2>/dev/null | head -40 || true
else
  echo "warn: claude CLI not on PATH — files assembled at ${PLUGIN_DEST}"
fi

echo ""
echo "Done. Plugin tree: ${PLUGIN_DEST}"
echo "Next:"
echo "  1. Restart Claude Code / open a NEW session"
echo "  2. /mcp — confirm grokodex tools (grok_setup, grok_run, …)"
echo "  3. Call grok_setup, then grok_run"
echo "Disable leader: re-run with --no-leader"
echo "Marketplace: ${MARKET_ROOT}"
