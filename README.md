# Grokodex

在 **Codex** 与 **Claude Code** 中调用本机 **Grok**：委托编码任务、Imagine 生图、搜索 X。

| | |
|--|--|
| 插件 id | `grokodex` |
| 形态 | skills + 本地 stdio MCP（`bridge/dist/bundle.mjs`） |
| 安装 | Git marketplace（推荐）或本仓库开发脚本 |
| 默认权限 | `restricted`（工作区可写；高危 shell 硬拒绝） |

宿主负责编排；Grok 是 worker。请通过 MCP 工具使用能力，不要用 shell 旁路 `grok`（安装 / `grok login` 除外）。

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
| **Node.js 18.18+** | 在 **PATH** 上（公开安装使用 `command: "node"`） |
| **Grok CLI** | `grok` 在 PATH，或设置 `GROK_PATH` |
| **xAI 登录** | 本机已 `grok login` |
| **Codex 和/或 Claude Code** | 支持 plugin marketplace 的本机版本 |

安装 Grok CLI：

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

不捆绑 `grok` 二进制。预构建 MCP 单文件已随仓库提交，**普通用户安装无需** `npm install`。

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
2. `/mcp` 确认 `grok_setup` / `grok_run` / `grok_imagine` / `grok_x_search`（名称可能带 `mcp__…` 前缀）  
3. 先调 **`grok_setup`**

### 更新

重新执行对应宿主的 `marketplace` 升级 / `plugin update` 流程，或以当前 CLI 文档为准刷新 marketplace 后再安装同 id 插件。维护者发版时会更新仓内 `plugins/grokodex` 预构建产物。

---

## 首次使用

1. **`grok_setup`** — 检查 `grok` 路径、版本、登录；失败时按返回 `hint` 安装或 `grok login`。  
2. **`grok_run`** — 委托任务（默认 `restricted`）。  
3. 需要生图 → **`grok_imagine`**；需要查 X → **`grok_x_search`**。  

也可依赖随插件附带的 skills：`grokodex-setup` / `grokodex-run` / `grokodex-imagine` / `grokodex-x-search`（宿主会按描述自动选用）。

**硬规则：** 业务能力走 MCP；不要用终端直接跑 `grok` 完成同一任务。

---

## MCP 工具

| 工具 | 作用 | 要点 |
|------|------|------|
| `grok_setup` | 诊断本机 grok / 登录 | 可先于其他工具调用；`ensure` 可尝试拉起 leader |
| `grok_run` | 通用 headless 委托 | 默认 `restricted`；可选 `inherit` + `host_sandbox` |
| `grok_imagine` | Imagine 生图 | 窄权限短路径；产物默认 `.grokodex/images` |
| `grok_x_search` | X / Twitter 搜索 | 只读短路径；`semantic` / `keyword` |

统一 JSON 包络：`ok: true|false`；失败含稳定 `error.code` 与可选 `hint`。

### `grok_run` 常用参数

| 参数 | 说明 |
|------|------|
| `prompt` | **必填**，任务描述与完成标准 |
| `cwd` | 工作目录（默认宿主工作区） |
| `permission_mode` | `restricted`（默认）\| `inherit` |
| `host_sandbox` | inherit 时：`read-only` \| `workspace-write` \| `danger-full-access` |
| `host_thread_id` | 宿主会话/任务 id，用于 session 续聊（见下） |
| `fresh` | `true` 强制新 Grok 会话 |
| `session_id` | 显式 Grok `--resume` id |
| `model` / `max_turns` / `timeout_ms` / `extra_rules` | 可选覆盖 |

`codex_sandbox` 是 `host_sandbox` 的兼容别名；两者同时传入且不一致 → `INVALID_ARGS`。

### 会话续作（session reuse）

多轮同一任务时，把宿主线程 id 传给 `host_thread_id`，桥接层在权限指纹匹配时会对 Grok 使用 `--resume`：

| 宿主 | 建议取值 |
|------|----------|
| Codex | `CODEX_THREAD_ID` → 推荐 `codex:<id>` |
| Claude Code | `CLAUDE_CODE_SESSION_ID` → 推荐 `claude:<id>` |

- 换话题或宿主 `/clear` 后：重新读取 id，或设 `fresh: true`  
- 排障看响应里的 `meta.session`  
- **Leader（暖进程）≠ 会话续作**；两者独立  

| 环境变量 | 默认 | 含义 |
|----------|------|------|
| `GROKODEX_SESSION_REUSE` | true | 启用 host map resume |
| `GROKODEX_SESSION_RESUME_FALLBACK` | true | resume 失败则去掉 resume 重试 |

---

## 权限

### `grok_run` 两档

| 档位 | 何时用 | 行为 |
|------|--------|------|
| **`restricted`（默认）** | 日常委托 | 工作区级可写；高危 shell 模式拒绝；不 always-approve |
| **`inherit`（显式）** | 用户明确要求与宿主同权 / Full-Access | 需已知 `host_sandbox`；**禁止**因「任务难」自动抬权 |

`grok_imagine` / `grok_x_search` **永不**继承完整 shell。

### inherit 时如何解析 `host_sandbox`

1. 调用参数 `host_sandbox`（或别名 `codex_sandbox`）  
2. 环境变量 `GROKODEX_HOST_SANDBOX` / `GROKODEX_CODEX_SANDBOX`  
3. 静态读 `~/.codex/config.toml`（仅可能对 Codex 有用，且未必等于当前会话）  
4. 仍未知 → **`INHERIT_UNAVAILABLE`**（不会静默升为 full）

| `host_sandbox` | 近似效果 |
|----------------|----------|
| `read-only` | 禁止 edit/write 类工具 |
| `workspace-write` | 与 restricted 同级 |
| `danger-full-access` | 抬权 + always-approve；仍保留绝对禁令 |

响应中的 `permission` 审计含 `requested`、`effective`、`host_sandbox` 等。

> **警告：** Full-Access / `danger-full-access` 费用与破坏力更高，仅在用户明确要求时使用。

---

## Leader（暖进程，默认开）

Headless 调用默认挂到本机 Grok **leader**；失败时 one-shot fallback。Codex 与 Claude 可共享同一本机 leader。

| 环境变量 | 默认 | 含义 |
|----------|------|------|
| `GROKODEX_USE_LEADER` | true | 使用 leader；`0`/`false` 强制 one-shot |
| `GROKODEX_LEADER_FALLBACK` | true | leader 失败退回 one-shot |
| `GROKODEX_LEADER_ENSURE` | true | socket 不可用时尝试拉起 leader |
| `GROKODEX_LEADER_SOCKET` | Grok 默认 | 自定义 socket |
| `GROKODEX_LEADER_ISOLATE` | false | 使用专用 `grokodex-leader.sock` |

排障看 `meta.leader`。本地安装脚本可用 `--no-leader` 写出 `GROKODEX_USE_LEADER=0` 的本机 MCP 配置。

---

## 其他常用环境变量

| 变量 | 含义 |
|------|------|
| `GROK_PATH` | 指定 grok 二进制 |
| `GROKODEX_DEFAULT_PERMISSION` | 默认权限档（默认 `restricted`） |
| `GROKODEX_ALLOW_INHERIT` | 是否允许 inherit |
| `GROKODEX_ALLOW_FULL_ACCESS_INHERIT` | 是否允许 full 级 inherit |
| `GROKODEX_HOST_SANDBOX` | inherit 时宿主能力档 |
| `GROKODEX_X_SEARCH_TIMEOUT_MS` | x_search 超时（默认 `90000`） |
| `GROKODEX_IMAGINE_TIMEOUT_MS` | imagine 超时（默认 `120000`） |

窄路径工具还有 `GROKODEX_*_MAX_TURNS` / `GROKODEX_*_TOOLS` 等微调项，一般保持默认即可。

---

## 仓库结构（给使用者与贡献者）

```text
plugins/grokodex/          # 公开可安装单元（git 跟踪，含预构建 bundle）
.agents/plugins/           # Codex marketplace 清单
.claude-plugin/            # Claude marketplace 清单
bridge/                    # MCP bridge 源码
skills/                    # 共享 skills 文稿
hosts/                     # 各宿主 manifest / MCP 模板
scripts/                   # package / 本地 install / 一致性检查
```

公开 MCP 使用 PATH 上的 `node` 与相对路径 `./bridge/dist/bundle.mjs`，**不含**本机绝对路径。

---

## 本地开发安装

clone 本仓库改代码时，用脚本装到本机（会先 `package-public-plugin`，再同步；本机 `.mcp.json` 可用绝对路径 `node`，**不写回** `plugins/grokodex`）。

### Codex → Personal marketplace

```bash
./scripts/install-codex-plugin.sh
# ./scripts/install-codex-plugin.sh --no-build
# ./scripts/install-codex-plugin.sh --no-leader
```

- 同步到 `~/.codex/plugins/grokodex` 等  
- 本机 marketplace 名：**`personal`** → `codex plugin add grokodex@personal`  
- 重启 App 后在 Personal 中启用 Grokodex  

### Claude Code → `grokodex-local`

```bash
./scripts/install-claude-plugin.sh
# 可选 --no-build / --no-leader
```

- 装到 `~/.claude/plugins/marketplaces/grokodex-local/plugins/grokodex`  
- 插件 id：`grokodex@grokodex-local`（与公开 `grokodex@grokodex` 分离）  

改代码后请重新跑对应脚本；**源码树 ≠ 宿主正在加载的插件副本**。

### 维护者发版

```bash
npm i
npm test
npm run build
npm run package:plugin    # 刷新 plugins/grokodex + 双 marketplace
npm run check:plugin      # 确认已提交树与组装结果一致
git add plugins/grokodex .agents/plugins .claude-plugin
# commit + push
```

---

## 限制（非目标）

Grokodex **不会**：

- 把宿主默认模型换成 Grok  
- 在无本机 `grok` + 登录的环境中工作（含多数 Cloud agent）  
- 提供完整 Grok TUI / ACP 嵌套 UI  
- 把 Grok 每个内置工具都做成独立 MCP tool（其余先走 `grok_run`）  
- 静默自动提权  
- 进入 OpenAI / Anthropic **官方默认插件商店**（本仓库提供的是 **第三方 Git marketplace**）

---

## 许可证

[MIT](./LICENSE)
