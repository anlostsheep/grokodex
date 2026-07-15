# Grokodex

在 **Codex** / **Claude Code**（及其他 MCP 宿主）里使用本机 **Grok** agent 与独有工具（委托、Imagine 生图、X 搜索）。

- 插件 id：`grokodex`（早期为 Codex 集成命名；现为多宿主 bridge，id 暂不改）
- 形态：skills + MCP bridge；支持 **公开 Git marketplace** 与本地开发安装
- 默认权限：`restricted`（工作区可写，高危 shell 硬拒绝）；可选显式 `inherit`

---

## 1. Grokodex 是什么

宿主是编排者，Grok 是 worker：

```
Codex App/CLI  ──┐
                 ├── plugin skills
Claude Code  ───┼── stdio MCP → grokodex-bridge
                 └── 本机 `grok` CLI + xAI 凭证
```

能力走 **MCP tools**，流程走 **skills**。不要用 shell 直接跑 `grok` 旁路（setup 引导登录除外）。

源码树与公开插件树分离：

- 共享开发源：`bridge/`、`skills/`、`hosts/`
- **公开可安装单元（提交 git）：** `plugins/grokodex/`
- 仓根 marketplace：`.agents/plugins/marketplace.json`（Codex）、`.claude-plugin/marketplace.json`（Claude）
- 维护者改代码后：`npm run package:plugin`（或 `./scripts/package-public-plugin.sh`）并提交 `plugins/grokodex`

---

## 2. 依赖

| 依赖 | 说明 |
|------|------|
| **Node.js 18.18+** | 运行预构建 bridge（`bridge/dist/bundle.mjs`） |
| **本机 Grok CLI** | `grok` 在 PATH 上，或设置 `GROK_PATH` |
| **xAI 登录** | 本机已执行 `grok login`，凭证健康 |
| **Codex 和/或 Claude Code** | 支持插件 / marketplace 的本机版本 |

安装 Grok CLI（macOS / Linux / WSL）：

```bash
curl -fsSL https://x.ai/cli/install.sh | bash
grok login
```

Windows（PowerShell）：

```powershell
irm https://x.ai/cli/install.ps1 | iex
```

不捆绑 `grok` 二进制。运行时使用 **esbuild 单文件** `bridge/dist/bundle.mjs`，**不需要**为了启动 MCP 再执行 `npm install`（开发改代码时用 `npm i && npm run build`）。

---

## 3. 公开 Marketplace 安装（推荐给其他机器）

前置：Node.js 18.18+ 在 **PATH**、`grok` 已安装并登录。无需 clone 后本地 `npm install`。

### Codex

```bash
codex plugin marketplace add anlostsheep/grokodex
codex plugin add grokodex@grokodex
```

完全退出并重启 Codex App / 新会话后调用 `grok_setup`。

也可指定 ref：`codex plugin marketplace add anlostsheep/grokodex --ref v0.1.0`（以当前 CLI 选项为准）。

### Claude Code

```bash
claude plugin marketplace add anlostsheep/grokodex
claude plugin install grokodex@grokodex
```

新会话 → `/mcp` 确认工具 → `grok_setup`。

> 公开树内 MCP 使用 PATH 上的 `node`（无本机绝对路径）。维护者改 bridge/skills 后须运行 `npm run package:plugin` 并提交 `plugins/grokodex` 后再推送/打 tag。

---

## 4. 本地开发安装（Personal / grokodex-local）

改仓库时用脚本装到本机；脚本会先 `package-public-plugin`，再同步到宿主目录（本机 `.mcp.json` 可用绝对路径 `node`，**不写回**公开树）。

### 4.1 Codex（Personal marketplace）

CLI 与 App 共用 marketplace 与 `~/.codex/config.toml`。

```bash
chmod +x scripts/install-codex-plugin.sh   # 仅首次
./scripts/install-codex-plugin.sh
```

脚本会：

1. `package-public-plugin`（内含 `npm run build`，可用 `--no-build`）
2. 从 `plugins/grokodex` 同步到：
   - `~/.codex/plugins/grokodex`
   - `~/.codex/plugins/cache/personal/grokodex/<version>`
3. 写入本机 `~/.agents/plugins/marketplace.json`（marketplace 名 **personal**）
4. 本机 `.mcp.json`：绝对路径 `node` + `./bridge/dist/bundle.mjs`
5. 默认 `GROKODEX_USE_LEADER=1`（可用 `--no-leader`）
6. 若有 `codex` CLI：`codex plugin add grokodex@personal`

然后：完全退出并重启 Codex App → Personal 中打开 Grokodex → 新会话 → `grok_setup`。

### 4.2 Claude Code（`grokodex-local`）

```bash
chmod +x scripts/install-claude-plugin.sh   # 仅首次
./scripts/install-claude-plugin.sh
```

脚本会：

1. `package-public-plugin`
2. 同步到 `~/.claude/plugins/marketplaces/grokodex-local/plugins/grokodex`
3. 本机 marketplace 名 **`grokodex-local`**（与公开名 `grokodex` 分离）
4. 本机 `.mcp.json`：绝对 `node` + **`${CLAUDE_PLUGIN_ROOT}/bridge/dist/bundle.mjs`**
5. `claude plugin install grokodex@grokodex-local -s user`

然后：重启 / 新会话 → `/mcp` → `grok_setup`。

改仓库后请重新跑对应安装脚本；**源码目录 ≠ 运行中的插件副本**。

---

## 5. 工具与 skills

### MCP 工具

| 工具 | 作用 | 要点 |
|------|------|------|
| `grok_setup` | 诊断本机 grok 路径、版本、登录 | 无业务副作用（`ensure=true` 可拉起 leader） |
| `grok_run` | 通用 headless 委托 | 默认 `restricted`；可显式 `inherit` |
| `grok_imagine` | Imagine 生图 | 窄权限 + **短路径** headless；产物默认 `.grokodex/images` |
| `grok_x_search` | X / Twitter 搜索 | 只读 + **短路径**；`semantic` / `keyword` |

统一返回 JSON 包络：`ok: true|false`；失败带稳定 `error.code` 与可选 `hint`。

`grok_x_search` / `grok_imagine` 使用 **短路径 headless**（tool allowlist + 低 max-turns，默认超时约 90s / 120s）。要延迟更稳：leader 开启、X 搜用 keyword + 日期、小 `limit`。设计见 `docs/superpowers/specs/2026-07-14-grokodex-narrow-tools-perf-design.md`。

### Skills

| Skill | 主工具 | 触发场景 |
|-------|--------|----------|
| `grokodex-setup` | `grok_setup` | 首次使用 / 找不到 grok / 鉴权失败 |
| `grokodex-run` | `grok_run` | 委托、第二意见、难 bug |
| `grokodex-imagine` | `grok_imagine` | 生图、图标、概念图 |
| `grokodex-x-search` | `grok_x_search` | 查 X 舆论 / 帖子 |

---

## 6. 权限模型

### 两档（`grok_run`）

| 档位 | 何时用 | 行为摘要 |
|------|--------|----------|
| **`restricted`（默认）** | 日常委托 | 工作区可写；高危 shell 模式硬拒绝；**不** always-approve |
| **`inherit`（显式）** | 用户明确要求与宿主同权 / Full-Access | 按宿主能力档映射；**禁止**因「任务难」自动抬权 |

`grok_imagine` / `grok_x_search` **永不**继承完整 shell。

### `inherit` 与 `host_sandbox`

MCP 子进程通常拿不到宿主会话 live 权限：

1. 调用方 **`host_sandbox`**（规范名）或兼容别名 **`codex_sandbox`** — 优先  
   - 两者同时传入且**不一致** → `INVALID_ARGS`
2. 环境变量 `GROKODEX_HOST_SANDBOX`（规范）或 `GROKODEX_CODEX_SANDBOX`（别名）；同层冲突 → `INVALID_ARGS`
3. 静态读取 `~/.codex/config.toml`（仅 Codex 路径可能有用；可能 ≠ 当前会话）
4. 仍未知 → **`INHERIT_UNAVAILABLE`**（禁止静默升为 full）

| `host_sandbox` | 生效近似 |
|----------------|----------|
| `read-only` | 禁止 edit/write 类工具 |
| `workspace-write` | 与 restricted 同级 |
| `danger-full-access` | 抬权 + always-approve；仍保留绝对禁令 |

每次响应 `permission` 审计：`requested`、`effective`、**`host_sandbox`**、镜像字段 `codex_sandbox`、`source`、`notes`。

### 可选环境变量

| 变量 | 含义 |
|------|------|
| `GROK_PATH` | 指定 grok 二进制 |
| `GROKODEX_DEFAULT_PERMISSION` | 默认权限档（默认 `restricted`） |
| `GROKODEX_ALLOW_INHERIT` | 是否允许 inherit（默认允许） |
| `GROKODEX_ALLOW_FULL_ACCESS_INHERIT` | 是否允许 full 级 inherit |
| `GROKODEX_HOST_SANDBOX` | inherit 时宿主能力档（规范） |
| `GROKODEX_CODEX_SANDBOX` | 上者的兼容别名 |
| `GROKODEX_X_SEARCH_MAX_TURNS` | x_search `--max-turns`（默认 `5`） |
| `GROKODEX_IMAGINE_MAX_TURNS` | imagine `--max-turns`（默认 `4`） |
| `GROKODEX_X_SEARCH_TOOLS` | x_search `--tools` CSV（默认 `x_search`） |
| `GROKODEX_IMAGINE_TOOLS` | imagine `--tools` CSV（默认 `image_gen`） |
| `GROKODEX_X_SEARCH_TIMEOUT_MS` | x_search 默认超时（默认 `90000`） |
| `GROKODEX_IMAGINE_TIMEOUT_MS` | imagine 默认超时（默认 `120000`） |
| `GROKODEX_NARROW_TOOLS_STRICT` | 窄路径严格模式（默认 `true`） |

### Leader-backed headless（默认开启）

Headless 调用默认走本机 Grok **leader** 暖 backend。失败则 **one-shot fallback**。

| Env | Default | Meaning |
|-----|---------|---------|
| `GROKODEX_USE_LEADER` | **`true`** | 使用 `--leader`；设为 `0`/`false` 强制 one-shot |
| `GROKODEX_LEADER_SOCKET` | Grok 默认 | 自定义 socket |
| `GROKODEX_LEADER_ISOLATE` | `false` | 使用专用 `grokodex-leader.sock` |
| `GROKODEX_LEADER_FALLBACK` | `true` | leader 失败时退回 one-shot |
| `GROKODEX_LEADER_ENSURE` | `true` | socket 不可用时尝试 spawn leader |

排障看 `meta.leader`。Codex 与 Claude 可共享同一本机 leader（预期行为）。

**Leader 与 Session 复用是两层机制：**

| Mechanism | How | Purpose |
|-----------|-----|---------|
| Leader | `GROKODEX_USE_LEADER` / `--leader` | Warm process（暖 backend / MCP·skills） |
| Session reuse | `host_thread_id` + map | `--resume` 同一 Grok chat（指纹匹配时） |

| Env | Default | Meaning |
|-----|---------|---------|
| `GROKODEX_SESSION_REUSE` | true | 启用 host map resume |
| `GROKODEX_SESSION_RESUME_FALLBACK` | true | resume 失败时去掉 resume 重试 |

同任务续作时，skill 应读取宿主线程 id 并传入 `host_thread_id`（Codex：`CODEX_THREAD_ID` → 推荐 `codex:<id>`；Claude：`CLAUDE_CODE_SESSION_ID` → 推荐 `claude:<id>`）。短 one-shot 未必省额度；长链路多轮续作更受益。排障看 `meta.session`。

> **警告：** Full-Access / `danger-full-access` inherit 费用与破坏力都更高。仅在用户明确要求时使用。

---

## 7. 开发

```bash
npm i
npm test
npm run build
```

手工验收清单：`docs/superpowers/plans/grokodex-claude-acceptance-checklist.md`  
设计：`docs/superpowers/specs/2026-07-14-grokodex-claude-code-plugin-design.md`

---

## 8. 限制（非目标）

Grokodex **不会**：

- 把宿主默认模型换成 Grok
- 在无本机 `grok` 与 xAI 登录的环境中工作（含多数 Cloud）
- 与 Grok TUI 级 ACP 嵌套 UI 完全对齐
- 把 Grok 每个内置工具 1:1 原生绑定（其余能力先走 `grok_run`）
- 本轮不提交公开 Claude / OpenAI 插件目录
- 静默自动提权
