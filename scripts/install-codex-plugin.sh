#!/usr/bin/env bash
# Install / refresh Grokodex into the local Codex Personal marketplace.
# Usage:
#   ./scripts/install-codex-plugin.sh           # build + install + enable
#   ./scripts/install-codex-plugin.sh --no-build
#   ./scripts/install-codex-plugin.sh --no-leader   # MCP env USE_LEADER=0
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOME_DIR="${HOME:?HOME not set}"
VERSION="0.1.0"
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
echo "==> GROKODEX_USE_LEADER default for MCP env: $USE_LEADER"

if [[ ! -d "${ROOT}/hosts/codex/.codex-plugin" ]]; then
  echo "error: missing hosts/codex/.codex-plugin — repo layout incomplete" >&2
  exit 1
fi

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
}

sync_one() {
  local dest="$1"
  mkdir -p "$dest/bridge/dist" "$dest/skills" "$dest/assets" "$dest/.codex-plugin"

  rsync -a --delete \
    "${ROOT}/bridge/dist/" "${dest}/bridge/dist/"
  rsync -a --delete \
    "${ROOT}/skills/" "${dest}/skills/"
  if [[ -d "${ROOT}/assets" ]]; then
    rsync -a --delete \
      "${ROOT}/assets/" "${dest}/assets/"
  fi
  rsync -a --delete \
    "${ROOT}/hosts/codex/.codex-plugin/" "${dest}/.codex-plugin/"

  [[ -f "${ROOT}/LICENSE" ]] && cp "${ROOT}/LICENSE" "${dest}/LICENSE"
  [[ -f "${ROOT}/README.md" ]] && cp "${ROOT}/README.md" "${dest}/README.md"

  write_mcp_json "$dest"
  echo "    synced $dest"
}

echo "==> sync plugin trees (whitelist from hosts/codex + bridge + skills)"
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

# Mirror under marketplaces/personal for tools that resolve that root
cp "$MARKETPLACE_JSON" \
  "${HOME_DIR}/.codex/marketplaces/personal/.agents/plugins/marketplace.json"

if command -v codex >/dev/null 2>&1; then
  echo "==> codex plugin add grokodex@personal"
  # Marketplace root is $HOME when path is relative to home
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
