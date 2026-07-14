# Grokodex

在 **OpenAI Codex App** 里使用本机 **Grok** agent 与独有工具（委托、Imagine 生图、X 搜索）。

- 插件 id：`grokodex`
- 形态：完整 Codex 插件（skills + MCP bridge），经 **Personal marketplace** 安装
- 默认权限：`restricted`（工作区可写，高危 shell 硬拒绝）；可选显式 `inherit`

---

## 1. Grokodex 是什么

Codex 是编排者，Grok 是 worker：

```
Codex App / CLI
  → 加载 plugin skills
  → stdio 拉起 grokodex-bridge（MCP）
  → 本机 `grok` CLI + xAI 凭证
```

能力走 **MCP tools**，流程走 **skills**。不要用 `shell` 直接跑 `grok` 旁路（setup 引导登录除外）。

---

## 2. 依赖

| 依赖 | 说明 |
|------|------|
| **Node.js 18.18+** | 运行预构建 bridge（`node ./bridge/dist/index.js`） |
| **本机 Grok CLI** | `grok` 在 PATH 上，或设置 `GROK_PATH` |
| **xAI 登录** | 本机已执行 `grok login`，凭证健康 |
| **Codex App** | 支持 Personal marketplace / 插件安装的版本 |

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

## 3. 安装到 Codex App（Personal marketplace）

CLI 与 App 共用 marketplace 与 `~/.codex/config.toml`。

### 3.1 推荐：一键脚本（开发机）

在本仓库根目录：

```bash
# 首次或改代码后：构建 bridge → 同步到 Codex 插件目录 → marketplace → plugin add
chmod +x scripts/install-codex-plugin.sh   # 仅首次需要
./scripts/install-codex-plugin.sh
```

脚本会：

1. `npm run build`（可用 `--no-build` 跳过）
2. 把仓库同步到：
   - `~/.codex/plugins/grokodex`（主安装路径）
   - `~/.codex/plugins/cache/personal/grokodex/0.1.0`（Codex 缓存副本）
3. 写入 `~/.agents/plugins/marketplace.json`（Personal 源指向上述路径）
4. 生成 `.mcp.json`：用**绝对路径**的 `node` 启动 `bridge/dist/bundle.mjs`（避免 App 找不到 fnm 的 node）
5. 默认 MCP env：`GROKODEX_USE_LEADER=1`（暖 backend）；可用 `--no-leader` 关掉
6. 若 PATH 上有 `codex`：执行 `codex plugin add grokodex@personal`

然后：

1. **完全退出并重启 Codex App**（Cmd+Q）
2. **设置 → 插件 → Personal**：确认 **Grokodex** 为开
3. **新开会话**（旧会话可能仍挂旧 bundle）

关闭 leader 重装示例：

```bash
./scripts/install-codex-plugin.sh --no-leader
```

### 3.2 已安装时只刷新

```bash
./scripts/install-codex-plugin.sh          # 改代码后
# 或
./scripts/install-codex-plugin.sh --no-build   # 仅重同步已有 dist
```

`codex plugin list` 应类似：

```text
grokodex@personal  installed, enabled
```

### 3.3 手工安装（不跑脚本时）

1. `npm run build`
2. 将仓库内容复制到 `~/.codex/plugins/grokodex`（至少包含 `.codex-plugin/`、`skills/`、`bridge/dist/bundle.mjs`、`assets/`、`.mcp.json`）
3. 配置 Personal marketplace：`~/.agents/plugins/marketplace.json`（`source.path` 相对 **`$HOME`**）：

```json
{
  "name": "personal",
  "interface": { "displayName": "Personal" },
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
```

4. `codex plugin add grokodex@personal`  
   模板见 [`marketplace.example.json`](./marketplace.example.json)。

**源码目录 ≠ 运行目录：** Codex 加载的是 `~/.codex/plugins/...` 下的副本。改仓库后必须重新 build + 同步（跑脚本），否则 App 仍用旧 bundle。

### 3.4 快速自检

新会话中：

- skills：`grokodex-setup` / `grokodex-run` / `grokodex-imagine` / `grokodex-x-search`
- 先 `grok_setup`（`auth_ok`；可看 `meta.leader`）
- 再试 `grok_run`（默认会尝试 leader；失败则 one-shot fallback）

---

## 4. 工具与 skills

### MCP 工具

| 工具 | 作用 | 要点 |
|------|------|------|
| `grok_setup` | 诊断本机 grok 路径、版本、登录 | 无业务副作用 |
| `grok_run` | 通用 headless 委托 | 默认 `restricted`；可显式 `inherit` |
| `grok_imagine` | Imagine 生图 | 窄权限；产物默认 `.grokodex/images` |
| `grok_x_search` | X / Twitter 搜索 | 只读；`semantic` / `keyword` |

统一返回 JSON 包络：`ok: true|false`；失败带稳定 `error.code` 与可选 `hint`。

### Skills（教 Codex 何时调哪个 tool）

| Skill | 主工具 | 触发场景 |
|-------|--------|----------|
| `grokodex-setup` | `grok_setup` | 首次使用 / 找不到 grok / 鉴权失败 |
| `grokodex-run` | `grok_run` | 委托、第二意见、难 bug |
| `grokodex-imagine` | `grok_imagine` | 生图、图标、概念图 |
| `grokodex-x-search` | `grok_x_search` | 查 X 舆论 / 帖子 |

---

## 5. 权限模型

### 两档（`grok_run`）

| 档位 | 何时用 | 行为摘要 |
|------|--------|----------|
| **`restricted`（默认）** | 日常委托 | 工作区可写；高危 shell 模式硬拒绝；**不** always-approve |
| **`inherit`（显式）** | 用户明确要求与 Codex 同权 / Full-Access | 按 Codex sandbox 映射能力；**禁止**因「任务难」自动抬权 |

`grok_imagine` / `grok_x_search` **永不**继承完整 shell：只读 + 仅写产物目录（生图）。

### `inherit` 解析顺序

MCP 子进程通常拿不到当前 Codex 会话 live sandbox：

1. 调用方传入的 `codex_sandbox`（及可选 `codex_approval`）— **优先**
2. 环境变量 `GROKODEX_CODEX_SANDBOX`
3. 静态读取 `~/.codex/config.toml`（可能 ≠ 当前会话）
4. 仍未知 → **`INHERIT_UNAVAILABLE`**（禁止静默升为 full）

| Codex sandbox | 生效近似 |
|---------------|----------|
| `read-only` | 禁止 edit/write 类工具 |
| `workspace-write` | 与 restricted 同级 |
| `danger-full-access` | 抬权 + always-approve；仍保留绝对禁令（如 `rm -rf /`、`sudo`、`mkfs`） |

每次响应带 `permission` 审计字段：`requested`、`effective`、`codex_sandbox`、`source`、`notes`。

### 可选环境变量

| 变量 | 含义 |
|------|------|
| `GROK_PATH` | 指定 grok 二进制 |
| `GROKODEX_DEFAULT_PERMISSION` | 默认权限档（默认 `restricted`） |
| `GROKODEX_ALLOW_INHERIT` | 是否允许 inherit（默认允许） |
| `GROKODEX_ALLOW_FULL_ACCESS_INHERIT` | 是否允许 full 级 inherit |
| `GROKODEX_ABSOLUTE_DENY` | 额外 deny 规则 |

不配置任何变量也应能按默认工作。

### Leader-backed headless（默认开启）

Headless 调用默认走本机 Grok **leader** 暖 backend（复用已加载的 MCP/skills）。无 leader 时会 ensure；失败则 **one-shot fallback**（`FALLBACK` 默认开）。

| Env | Default | Meaning |
|-----|---------|---------|
| `GROKODEX_USE_LEADER` | **`true`** | 使用 `--leader`；设为 `0`/`false` 强制 one-shot |
| `GROKODEX_LEADER_SOCKET` | Grok 默认 | 自定义 socket |
| `GROKODEX_LEADER_ISOLATE` | `false` | 使用专用 `grokodex-leader.sock` |
| `GROKODEX_LEADER_FALLBACK` | `true` | leader 失败时退回 one-shot |
| `GROKODEX_LEADER_ENSURE` | `true` | socket 不可用时尝试 spawn leader |
| `GROKODEX_LEADER_ENSURE_TIMEOUT_MS` | `8000` | ensure 后等待就绪的最长时间 |
| `GROKODEX_LEADER_ENSURE_POLL_MS` | `100` | 就绪轮询间隔 |

这**不会**自动 `--resume` 上一次对话（无会话连续）。排障看返回里的 `meta.leader`。

> **警告：** Full-Access / `danger-full-access` inherit 费用与破坏力都更高。仅在用户明确要求时使用。

---

## 6. 限制（非目标）

Grokodex **不会**：

- 把 Codex 默认模型换成 Grok
- 在 **Codex Cloud** / 无本机 `grok` 与 xAI 登录的环境中工作
- 与 Grok TUI 级 ACP 嵌套 UI 完全对齐
- 把 Grok 每个内置工具 1:1 原生绑定（其余能力先走 `grok_run`）
- 提交到 OpenAI 公共插件目录（MVP）
- 静默自动提权

权限映射是 **能力等价**，不是与 Codex 共享同一 OS sandbox 令牌。Imagine / X 首期通过约束 headless prompt 实现，效果取决于本机 Grok 是否遵守窄任务。

---

## 7. 排错（错误码）

| 错误码 | 含义 | 处理建议 |
|--------|------|----------|
| `GROK_NOT_FOUND` | PATH / `GROK_PATH` 找不到 `grok` | 安装 CLI；检查 PATH；设 `GROK_PATH`；用 skill `grokodex-setup` |
| `GROK_NOT_LOGGED_IN` | 未登录或鉴权不健康 | 本机执行 `grok login`，再 `grok_setup` |
| `TIMEOUT` | 子进程超时 | 缩小任务 / 提高 `timeout_ms` |
| `PERMISSION_DENIED` | 配置禁止 inherit 或 full inherit | 改 env 配置，或改用 `restricted` |
| `INHERIT_UNAVAILABLE` | 无法判定 Codex sandbox | 显式传 `codex_sandbox`，或退回 `restricted` |
| `INVALID_ARGS` | 参数缺失/非法 | 检查必填 `prompt` / `query` 等 |
| `GROK_EXIT_NONZERO` | grok 非零退出 | 看 `message` / stderr 摘要；调整 prompt 或权限 |

### 常见安装问题

| 现象 | 排查 |
|------|------|
| Plugins 里看不到 Grokodex | marketplace 路径是否相对 `~/.agents/plugins/` 且 `./` 开头；JSON 是否合法；是否重启 App |
| 装了但新会话无 skills | 是否 **Enable**；是否 **新会话**；`.codex-plugin/plugin.json` 的 `skills` 路径 |
| MCP 起不来 | `node -v` ≥ 18.18；`bridge/dist/index.js` 是否存在；本机 `node ./bridge/dist/index.js` 是否能挂起等 stdin |
| 工具全失败 | 先 `grok_setup`；确认非 Cloud 纯远端环境 |

---

## 8. 开发

```bash
npm i
npm test
npm run build
```

- 源码：`bridge/src/`
- 预构建输出：`bridge/dist/`（**提交进仓库**，安装零编译）
- MCP 入口：`node bridge/dist/index.js`（stdio MCP；无参数时会等待 stdin）
- 测试：`vitest`（无本机凭证时 unit/mock 应全绿）

可选类型检查：

```bash
npm run typecheck
```

修改 TypeScript 后务必 `npm run build` 并提交更新后的 `bridge/dist/**`。

---

## License

MIT — 见 [LICENSE](./LICENSE)。
