#!/usr/bin/env bash
# Install / refresh Grokodex into the local Codex Personal marketplace.
# Usage:
#   ./scripts/install-codex-plugin.sh           # package + install + enable
#   ./scripts/install-codex-plugin.sh --no-build
#   ./scripts/install-codex-plugin.sh --no-leader   # MCP env USE_LEADER=0
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOME_DIR="${HOME:?HOME not set}"
VERSION="$(node -p "require('${ROOT}/package.json').version")"
PLUGIN_SRC_NAME="grokodex"
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

MARKETPLACE_JSON="${HOME_DIR}/.agents/plugins/marketplace.json"
INSTALL_ROOTS=(
  "${HOME_DIR}/.codex/plugins/${PLUGIN_SRC_NAME}"
  "${HOME_DIR}/.codex/plugins/cache/personal/${PLUGIN_SRC_NAME}/${VERSION}"
  "${HOME_DIR}/.codex/marketplaces/personal/plugins/${PLUGIN_SRC_NAME}"
)

echo "==> repo: $ROOT"
echo "==> node: $NODE_BIN"
echo "==> version: $VERSION"
echo "==> GROKODEX_USE_LEADER default for MCP env: $USE_LEADER"

PACKAGE_ARGS=()
if [[ "$DO_BUILD" -eq 0 ]]; then
  PACKAGE_ARGS+=(--no-build)
fi
echo "==> package public plugin tree"
bash "${ROOT}/scripts/package-public-plugin.sh" "${PACKAGE_ARGS[@]}"

PUBLIC_UNIT="${ROOT}/plugins/grokodex"
if [[ ! -d "${PUBLIC_UNIT}/.codex-plugin" ]]; then
  echo "error: missing ${PUBLIC_UNIT}/.codex-plugin after package" >&2
  exit 1
fi

write_mcp_json() {
  local dest="$1"
  cat >"${dest}/.mcp.json" <<EOF
{
  "mcpServers": {
    "grokodex": {
      "command": "${NODE_BIN}",
      "args": ["./bridge/dist/bundle.mjs"],
      "cwd": ".",
      "env": {
        "GROKODEX_USE_LEADER": "${USE_LEADER}",
        "GROKODEX_LEADER_FALLBACK": "1",
        "GROKODEX_LEADER_ENSURE": "1"
      }
    }
  }
}
EOF
  # Local install always uses Codex-shaped .mcp.json; drop strategy-2 sibling if present
  rm -f "${dest}/.mcp.codex.json"
}

sync_one() {
  local dest="$1"
  mkdir -p "$dest"
  rsync -a --delete \
    --exclude '.mcp.json' \
    --exclude '.mcp.codex.json' \
    "${PUBLIC_UNIT}/" "$dest/"
  write_mcp_json "$dest"
  echo "    synced $dest"
}

echo "==> sync plugin trees from plugins/grokodex (local MCP may use absolute node)"
for dest in "${INSTALL_ROOTS[@]}"; do
  sync_one "$dest"
done

echo "==> personal marketplace manifest"
mkdir -p "${HOME_DIR}/.agents/plugins" \
  "${HOME_DIR}/.codex/marketplaces/personal/.agents/plugins"

cat >"$MARKETPLACE_JSON" <<'EOF'
{
  "name": "personal",
  "interface": {
    "displayName": "Personal"
  },
  "plugins": [
    {
      "name": "grokodex",
      "source": {
        "source": "local",
        "path": "./.codex/plugins/grokodex"
      },
      "policy": {
        "installation": "AVAILABLE",
        "authentication": "ON_INSTALL"
      },
      "category": "Developer Tools"
    }
  ]
}
EOF
echo "    wrote $MARKETPLACE_JSON"

cp "$MARKETPLACE_JSON" \
  "${HOME_DIR}/.codex/marketplaces/personal/.agents/plugins/marketplace.json"

if command -v codex >/dev/null 2>&1; then
  echo "==> codex plugin add grokodex@personal"
  if ! codex plugin marketplace list 2>/dev/null | grep -qi personal; then
    codex plugin marketplace add "$HOME_DIR" 2>/dev/null || true
  fi
  codex plugin remove grokodex@personal 2>/dev/null || true
  codex plugin add grokodex@personal
  echo "==> status"
  codex plugin list 2>/dev/null | head -20 || true
else
  echo "warn: codex CLI not on PATH — plugin files installed; enable in App or install CLI"
fi

echo ""
echo "Done."
echo "Next:"
echo "  1. Fully quit and restart Codex App (Cmd+Q)"
echo "  2. Settings → Plugins → Personal → Grokodex ON"
echo "  3. Open a NEW session"
echo "  4. Call grok_setup, then grok_run"
echo ""
echo "Disable leader: re-run with --no-leader, or set GROKODEX_USE_LEADER=0 in .mcp.json"
echo "Primary install path: ${HOME_DIR}/.codex/plugins/grokodex"
echo "Public tree (unchanged by absolute node): ${PUBLIC_UNIT}"
