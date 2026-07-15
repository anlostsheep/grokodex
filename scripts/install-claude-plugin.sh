#!/usr/bin/env bash
# Install / refresh Grokodex into a local Claude Code marketplace.
# Usage:
#   ./scripts/install-claude-plugin.sh
#   ./scripts/install-claude-plugin.sh --no-build
#   ./scripts/install-claude-plugin.sh --no-leader
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOME_DIR="${HOME:?HOME not set}"
VERSION="$(node -p "require('${ROOT}/package.json').version")"
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

echo "==> repo: $ROOT"
echo "==> node: $NODE_BIN"
echo "==> version: $VERSION"
echo "==> marketplace: $MARKET_NAME"
echo "==> GROKODEX_USE_LEADER: $USE_LEADER"

PACKAGE_ARGS=()
if [[ "$DO_BUILD" -eq 0 ]]; then
  PACKAGE_ARGS+=(--no-build)
fi
echo "==> package public plugin tree"
bash "${ROOT}/scripts/package-public-plugin.sh" "${PACKAGE_ARGS[@]}"

PUBLIC_UNIT="${ROOT}/plugins/grokodex"
if [[ ! -d "${PUBLIC_UNIT}/.claude-plugin" ]]; then
  echo "error: missing ${PUBLIC_UNIT}/.claude-plugin after package" >&2
  exit 1
fi

mkdir -p "${PLUGIN_DEST}" "${MARKET_ROOT}/.claude-plugin"

echo "==> assemble plugin at ${PLUGIN_DEST}"
rsync -a --delete \
  --exclude '.mcp.json' \
  --exclude '.mcp.codex.json' \
  "${PUBLIC_UNIT}/" "${PLUGIN_DEST}/"

# Local Claude MCP: absolute node + literal ${CLAUDE_PLUGIN_ROOT}
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

# Local marketplace name stays grokodex-local (dev); public market name is grokodex
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
echo "Public tree (no absolute node): ${PUBLIC_UNIT}"
