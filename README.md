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

不捆绑 `grok` 二进制；不需要在安装插件时再编译 TypeScript（仓库提交了 `bridge/dist/`）。

---

## 3. 安装路径 A（Personal marketplace）

MVP **仅**支持此路径。手改 `config.toml` MCP 仅作开发旁路，不作为验收。

### 3.1 放置插件

将本仓库 clone 到稳定路径，例如：

```bash
git clone <本仓库 URL> ~/developer/project/grok-project
# 或复制到 ~/.codex/plugins/grokodex
```

### 3.2 登记 Personal marketplace

目标文件：`~/.agents/plugins/marketplace.json`

1. 若文件不存在：复制仓库根目录的 `marketplace.example.json`：

   ```bash
   mkdir -p ~/.agents/plugins
   cp /path/to/grok-project/marketplace.example.json ~/.agents/plugins/marketplace.json
   ```

2. 若已有 marketplace：合并 `plugins` 数组，加入 `grokodex` 条目（参考示例文件）。

3. **改 `source.path`**：路径相对 `~/.agents/plugins/`，必须以 `./` 开头，指向插件根（含 `.codex-plugin/`、`skills/`、`bridge/dist/` 的目录）。

示例（按你的实际相对路径改写）：

```json
{
  "name": "personal",
  "interface": { "displayName": "Personal" },
  "plugins": [
    {
      "name": "grokodex",
      "source": {
        "source": "local",
        "path": "./../../../developer/project/grok-project"
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

仓库内完整模板见 [`marketplace.example.json`](./marketplace.example.json)。

### 3.3 启用

1. **完全重启** Codex App（退出再开，确保重新加载 marketplace）。
2. 打开 **Plugins** → 个人 / Personal marketplace。
3. 找到 **Grokodex** → **Install** → **Enable**。
4. **新开一个会话** 再测（旧会话可能看不到 skills / MCP）。

### 3.4 快速自检

在新会话中：

- 应能看到 skills：`grokodex-setup`、`grokodex-run`、`grokodex-imagine`、`grokodex-x-search`
- 先跑 setup：让助手调用 `grok_setup`，确认 `auth_ok` / 路径正常
- 再试一条 `grok_run` 或生图 / 搜 X

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
