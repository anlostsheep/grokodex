# Changelog

版本号以根目录 `package.json` 的 `"version"` 为准。发版请用：

```bash
./scripts/release.sh patch|minor|major [--push]
# 或固定版本
./scripts/release.sh 0.2.0 --push
```

公开插件树 `plugins/grokodex/` 与 marketplace 清单中的 version 由 `npm run package:plugin` 从 `package.json` 注入。

格式参考 [Keep a Changelog](https://keepachangelog.com/)，版本遵循 [SemVer](https://semver.org/)。

---

## [0.2.0] - 2026-07-15

### Fixed

- **Claude Code 公开安装路径**：默认 MCP 改为策略 2。  
  - `.mcp.json` 使用 `${CLAUDE_PLUGIN_ROOT}/bridge/dist/bundle.mjs`（不再用 `cwd: "."` + 相对路径；CC 会把相对路径解析成**会话工作区**导致 MCP 起不来）。  
  - Codex 使用 `.mcp.codex.json`（`mcpServers` + 相对路径），由 `.codex-plugin/plugin.json` 指向。

### Added

- `scripts/release.sh`：版本 bump → test → package → commit → `vX.Y.Z` tag  
- 本 CHANGELOG；README 发版与版本说明  

### Changed

- `package-public-plugin.sh` 默认 `--mcp-strategy=2`  
- 公开 marketplace 插件版本戳记与 `package.json` 对齐为 **0.2.0**

---

## [0.1.0] - 2026-07

### Added

- 双宿主公开 Git marketplace（`plugins/grokodex`、Codex/Claude marketplace 清单）  
- MCP 四工具、skills、leader、session reuse  
- 本地 install 脚本与 `package:plugin` / `check:plugin`
