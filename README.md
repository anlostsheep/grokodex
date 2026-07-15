# Grokodex

<p align="center">
  <strong>在 Codex / Claude Code 中调用本机 Grok</strong><br/>
  委托编码 · Imagine 生图 · 搜索 X
</p>

<p align="center">
  <a href="https://github.com/anlostsheep/grokodex/stargazers"><img src="https://img.shields.io/github/stars/anlostsheep/grokodex?style=for-the-badge&logo=github" alt="GitHub Stars"/></a>
  <a href="https://github.com/anlostsheep/grokodex/network/members"><img src="https://img.shields.io/github/forks/anlostsheep/grokodex?style=for-the-badge&logo=github" alt="GitHub Forks"/></a>
  <a href="https://github.com/anlostsheep/grokodex/issues"><img src="https://img.shields.io/github/issues/anlostsheep/grokodex?style=for-the-badge" alt="Issues"/></a>
  <a href="./LICENSE"><img src="https://img.shields.io/github/license/anlostsheep/grokodex?style=for-the-badge" alt="License: MIT"/></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-≥18.18-339933?logo=nodedotjs&logoColor=white" alt="Node.js"/>
  <img src="https://img.shields.io/badge/Codex-plugin-412991" alt="Codex"/>
  <img src="https://img.shields.io/badge/Claude%20Code-plugin-D97706" alt="Claude Code"/>
  <img src="https://img.shields.io/badge/MCP-stdio-555" alt="MCP"/>
  <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License"/>
</p>

---

## 项目协议（License）

本项目以 **[MIT License](./LICENSE)** 开源发布。

| 项 | 说明 |
|----|------|
| **协议** | MIT |
| **版权** | Copyright (c) 2026 Grokodex contributors |
| **你可以** | 自由使用、复制、修改、合并、发布、再分发、再授权、用于商业用途 |
| **你必须** | 在副本中保留版权声明与 MIT 许可全文 |
| **免责** | 软件按「现状」提供，作者不承担任何明示或暗示担保 |

完整法律文本见仓库根目录 [`LICENSE`](./LICENSE)。  
使用本插件仍须遵守 **xAI / Grok** 与各宿主（OpenAI Codex、Anthropic Claude Code）自身的服务条款。

---

## 目录

- [项目协议（License）](#项目协议license)
- [它是什么](#它是什么)
- [依赖](#依赖)
- [安装](#安装推荐公开-git-marketplace)
- [首次使用](#首次使用)
- [MCP 工具](#mcp-工具)
- [权限](#权限)
- [Leader 与会话续作](#leader-与会话续作)
- [环境变量](#环境变量)
- [仓库结构](#仓库结构)
- [本地开发](#本地开发)
- [限制](#限制非目标)
- [Star History](#star-history)
- [贡献与支持](#贡献与支持)
- [许可证](#许可证)

---

## 它是什么

| | |
|--|--|
| 插件 id | `grokodex` |
| 形态 | skills + 本地 stdio MCP（预构建 `bridge/dist/bundle.mjs`） |
| 安装 | Git marketplace（推荐）或本仓库开发脚本 |
| 默认权限 | `restricted`（工作区可写；高危 shell 硬拒绝） |

宿主是编排者，Grok 是 worker。能力走 **MCP 工具**；不要用 shell 旁路 `grok`（仅安装 / `grok login` 除外）。

```
Codex / Claude Code
        │  skills + MCP
        ▼
  grokodex-bridge (node)
        │
        ▼
  本机 grok CLI + xAI 登录
```

---

## 依赖

| 依赖 | 说明 |
|------|------|
| **Node.js 18.18+** | 必须在 **PATH** 上（公开安装使用 `command: "node"`） |
| **Grok CLI** | `grok` 在 PATH，或设置 `GROK_PATH` |
| **xAI 登录** | 本机已执行 `grok login` |
| **Codex 和/或 Claude Code** | 支持 plugin marketplace 的本机版本 |

```bash
# macOS / Linux / WSL
curl -fsSL https://x.ai/cli/install.sh | bash
grok login
```

```powershell
# Windows
irm https://x.ai/cli/install.ps1 | iex
grok login
```

不捆绑 `grok` 二进制。预构建 MCP 已随仓库提交，**普通用户安装无需** `npm install`。

---

## 安装（推荐：公开 Git marketplace）

仓库：[`anlostsheep/grokodex`](https://github.com/anlostsheep/grokodex)  
marketplace 名与插件名均为 **`grokodex`**。

### Codex

```bash
codex plugin marketplace add anlostsheep/grokodex
codex plugin add grokodex@grokodex
```

1. 完全退出并重启 Codex App（或新开 CLI 会话）  
2. 确认插件已启用  
3. 调用 **`grok_setup`**，再使用其他工具  

### Claude Code

```bash
claude plugin marketplace add anlostsheep/grokodex
claude plugin install grokodex@grokodex
```

1. 重启 Claude Code / 新开会话  
2. `/mcp` 确认四工具（名称可能带 `mcp__…` 前缀）  
3. 先调 **`grok_setup`**  

### 更新

按各宿主 CLI 刷新 marketplace / 更新插件即可。维护者发版时会更新仓内 `plugins/grokodex` 预构建产物。

---

## 首次使用

1. **`grok_setup`** — 检查 `grok` 路径、版本、登录  
2. **`grok_run`** — 委托任务（默认 `restricted`）  
3. 生图 → **`grok_imagine`**；查 X → **`grok_x_search`**  

随插件附带 skills：`grokodex-setup` / `grokodex-run` / `grokodex-imagine` / `grokodex-x-search`。

**硬规则：** 业务能力走 MCP，不要用终端直接跑 `grok` 完成同一任务。

---

## MCP 工具

| 工具 | 作用 | 要点 |
|------|------|------|
| `grok_setup` | 诊断本机 grok / 登录 | 建议先于其他工具 |
| `grok_run` | 通用 headless 委托 | 默认 `restricted`；可选 `inherit` |
| `grok_imagine` | Imagine 生图 | 窄权限；产物默认 `.grokodex/images` |
| `grok_x_search` | X / Twitter 搜索 | 只读；`semantic` / `keyword` |

统一 JSON：`ok: true|false`；失败含稳定 `error.code` 与可选 `hint`。

### `grok_run` 常用参数

| 参数 | 说明 |
|------|------|
| `prompt` | **必填** |
| `cwd` | 工作目录（默认宿主工作区） |
| `permission_mode` | `restricted`（默认）\| `inherit` |
| `host_sandbox` | inherit 时：`read-only` \| `workspace-write` \| `danger-full-access` |
| `host_thread_id` | 宿主会话 id，用于续聊 |
| `fresh` | `true` 强制新 Grok 会话 |
| `session_id` | 显式 Grok `--resume` id |
| `model` / `max_turns` / `timeout_ms` / `extra_rules` | 可选 |

`codex_sandbox` 是 `host_sandbox` 的兼容别名；两者冲突 → `INVALID_ARGS`。

---

## 权限

| 档位 | 何时用 | 行为 |
|------|--------|------|
| **`restricted`（默认）** | 日常委托 | 工作区可写；高危 shell 拒绝；不 always-approve |
| **`inherit`（显式）** | 用户明确要求与宿主同权 | 需已知 `host_sandbox`；禁止因任务难自动抬权 |

`grok_imagine` / `grok_x_search` **永不**继承完整 shell。

inherit 解析顺序：参数 `host_sandbox` → 环境变量 → 静态 `~/.codex/config.toml`（仅可能对 Codex 有用）→ 仍未知则 **`INHERIT_UNAVAILABLE`**（不会静默 full）。

| `host_sandbox` | 近似效果 |
|----------------|----------|
| `read-only` | 禁止 edit/write 类工具 |
| `workspace-write` | 与 restricted 同级 |
| `danger-full-access` | 抬权 + always-approve；仍保留绝对禁令 |

> **警告：** Full-Access / `danger-full-access` 费用与破坏力更高，仅在用户明确要求时使用。

---

## Leader 与会话续作

### Leader（暖进程，默认开）

| 环境变量 | 默认 | 含义 |
|----------|------|------|
| `GROKODEX_USE_LEADER` | true | 使用 leader；`0`/`false` 强制 one-shot |
| `GROKODEX_LEADER_FALLBACK` | true | 失败退回 one-shot |
| `GROKODEX_LEADER_ENSURE` | true | 尝试拉起 leader |

排障看 `meta.leader`。本地脚本可用 `--no-leader`。

### 会话续作（session reuse）

多轮同一任务时传入 `host_thread_id`，权限指纹匹配时会对 Grok `--resume`：

| 宿主 | 建议 |
|------|------|
| Codex | `CODEX_THREAD_ID` → `codex:<id>` |
| Claude Code | `CLAUDE_CODE_SESSION_ID` → `claude:<id>` |

**Leader ≠ 会话续作。** 换话题或 `/clear` 后请重读 id，或设 `fresh: true`。排障看 `meta.session`。

| 环境变量 | 默认 | 含义 |
|----------|------|------|
| `GROKODEX_SESSION_REUSE` | true | 启用 host map resume |
| `GROKODEX_SESSION_RESUME_FALLBACK` | true | resume 失败则重试不带 resume |

---

## 环境变量

| 变量 | 含义 |
|------|------|
| `GROK_PATH` | 指定 grok 二进制 |
| `GROKODEX_DEFAULT_PERMISSION` | 默认权限档（默认 `restricted`） |
| `GROKODEX_ALLOW_INHERIT` | 是否允许 inherit |
| `GROKODEX_ALLOW_FULL_ACCESS_INHERIT` | 是否允许 full 级 inherit |
| `GROKODEX_HOST_SANDBOX` | inherit 时宿主能力档 |
| `GROKODEX_X_SEARCH_TIMEOUT_MS` | 默认 `90000` |
| `GROKODEX_IMAGINE_TIMEOUT_MS` | 默认 `120000` |

---

## 仓库结构

```text
plugins/grokodex/     # 公开可安装单元（含预构建 bundle，git 跟踪）
.agents/plugins/      # Codex marketplace
.claude-plugin/       # Claude marketplace
bridge/               # MCP bridge 源码
skills/               # 共享 skills
hosts/                # 宿主 manifest / MCP 模板
scripts/              # package / 本地 install / 一致性检查
LICENSE               # MIT 协议全文
```

公开 MCP 使用 PATH 上的 `node` + 相对路径，**不含**本机绝对路径。

---

## 本地开发

clone 后改代码时用脚本装到本机（先 package，再同步；绝对路径 `node` 只写本机，不写回公开树）：

```bash
# Codex → personal marketplace
./scripts/install-codex-plugin.sh
# 可选：--no-build / --no-leader

# Claude Code → grokodex-local
./scripts/install-claude-plugin.sh
```

维护者发版：

```bash
npm i && npm test && npm run build
npm run package:plugin
npm run check:plugin
# 提交 plugins/grokodex 与 marketplace 清单后 push
```

---

## 限制（非目标）

- 不替换宿主默认模型为 Grok  
- 无本机 `grok` + 登录则无法工作（含多数 Cloud agent）  
- 不做完整 Grok TUI / ACP 嵌套 UI  
- 不把 Grok 每个内置工具都做成独立 MCP tool（其余走 `grok_run`）  
- 不静默自动提权  
- 不进入 OpenAI / Anthropic **官方默认插件商店**（提供的是 **第三方 Git marketplace**）

---

## Star History

如果这个项目对你有帮助，欢迎点亮右上角 **Star**，方便更多人发现。

<!-- star-history:start -->
<!-- star-history:end -->

<p align="center">
  <a href="https://www.star-history.com/?type=date&repos=anlostsheep%2Fgrokodex">在 star-history.com 查看交互图</a>
  ·
  <a href="https://github.com/anlostsheep/grokodex/stargazers">Stargazers</a>
</p>

<details>
<summary>维护者：如何让曲线图出现在 README</summary>

1. 仓库需为 **Public**（已完成）。  
2. 自 2026-06 起，**stargazer 时间线**只能由 admin/collaborator 读取；匿名 API 返回 401，默认 `GITHUB_TOKEN` 也常 403。  
3. 使用你已创建的 Fine-grained PAT（**Metadata: Read-only**）→  
   仓库 **Settings → Secrets and variables → Actions → New repository secret**  
   - Name: `STAR_HISTORY_TOKEN`  
   - Value: 该 PAT 明文  
4. **Actions → Star History → Run workflow**  
5. 成功后 bot 会 commit `assets/star-history/*.svg` 并填入上方 marker；刷新 README 即可。  

当前 star 为 0 时曲线接近水平，有人 star 后会随 CI 更新。

</details>

---

## 贡献与支持

- 提交 Issue / PR：<https://github.com/anlostsheep/grokodex/issues>  
- 使用中请先跑 `grok_setup`，把失败时的 `error.code` / `hint` 一并附上  

---

## 许可证

```
MIT License

Copyright (c) 2026 Grokodex contributors
```

本软件按 MIT 协议授权。你可自由使用与再分发，但须保留版权与许可声明；软件按「现状」提供，不附带任何担保。

**完整条款：** [`LICENSE`](./LICENSE)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
