# Grokodex

<p align="center">
  <strong>在 Codex / Claude Code 中调用本机 Grok</strong><br/>
  委托编码 · Imagine 生图 · 搜索 X
</p>

<p align="center">
  <a href="https://github.com/anlostsheep/grokodex/stargazers"><img src="https://img.shields.io/github/stars/anlostsheep/grokodex?style=for-the-badge&logo=github" alt="GitHub Stars"/></a>
  <a href="https://github.com/anlostsheep/grokodex/network/members"><img src="https://img.shields.io/github/forks/anlostsheep/grokodex?style=for-the-badge&logo=github" alt="GitHub Forks"/></a>
  <a href="https://github.com/anlostsheep/grokodex/issues"><img src="https://img.shields.io/github/issues/anlostsheep/grokodex?style=for-the-badge" alt="Issues"/></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge" alt="License: MIT"/></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-≥18.18-339933?logo=nodedotjs&logoColor=white" alt="Node.js"/>
  <img src="https://img.shields.io/badge/Codex-plugin-412991" alt="Codex"/>
  <img src="https://img.shields.io/badge/Claude%20Code-plugin-D97706" alt="Claude Code"/>
  <img src="https://img.shields.io/badge/MCP-stdio-555" alt="MCP"/>
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
使用本插件仍须遵守 **上游模型提供方**（xAI 官方、你所接的第三方网关等）以及各宿主（OpenAI Codex、Anthropic Claude Code）的服务条款。

---

## 目录

- [项目协议（License）](#项目协议license)
- [它是什么](#它是什么)
- [术语说明](#术语说明)
- [依赖](#依赖)
- [Grok 鉴权（不必只靠 OAuth）](#grok-鉴权不必只靠-oauth)
- [安装](#安装推荐公开-git-marketplace)
- [首次使用](#首次使用)
- [排障（装上了但超时 / unauthorized）](#排障装上了但超时--unauthorized)
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
| 默认权限 | **`restricted`（受限）**：Grok 可在当前项目目录读写，但高危 shell 会被拒绝；见 [术语说明](#术语说明) |

**宿主**（Codex / Claude Code）负责编排；**Grok** 是被调用的 worker。能力走 **MCP 工具**；不要用 shell 旁路 `grok` 完成业务任务（安装 CLI、改 `~/.grok/config.toml`、配置鉴权除外）。

```
Codex / Claude Code          ← 宿主（你当前用的 AI 编程客户端）
        │  skills + MCP
        ▼
  grokodex-bridge (node)     ← 本插件：把宿主的工具调用转成 grok 命令
        │
        ▼
  本机 Grok Build CLI（grok）
        │
        ├── 官方 session（grok login）和/或
        ├── XAI_API_KEY 官方 API Key 和/或
        └── 第三方 / 自建 OpenAI 兼容上游（config.toml）
```

---

## 术语说明

下文会反复出现这些词。**不需要先全部背会**；装插件、先 `grok_setup` 即可。需要调权限或排障时再查本表。

### 角色与组件

| 术语 | 含义（白话） |
|------|----------------|
| **宿主（host）** | 你正在用的客户端，如 **Codex**、**Claude Code**。它发起任务、展示结果。 |
| **Grok / Grok Build / `grok`** | xAI 的本机编码 agent CLI（命令行程序）。Grokodex **不替代**它，只是帮宿主去调用它。 |
| **插件 / plugin** | 装进宿主的扩展包；本项目的插件 id 是 `grokodex`。 |
| **marketplace** | 插件「商店/目录」。本仓库是 **Git marketplace**（用 GitHub 地址添加），不是 OpenAI/Anthropic 官方默认商店。 |
| **MCP** | Model Context Protocol。宿主通过 MCP 调用外部工具；Grokodex 以 **stdio**（标准输入输出）方式起一个本机 Node 进程。 |
| **bridge / 桥接** | 仓库里的 `bridge/`：实现 MCP 四工具（setup/run/imagine/x_search），内部再去执行 `grok`。 |
| **skill** | 给宿主 AI 看的说明书（何时调用哪个 MCP 工具）。本插件带 `grokodex-setup` 等四套。 |
| **上游 / upstream** | 真正提供模型算力的一端：xAI 官方、或你配置的第三方/自建 API 网关。 |
| **鉴权 / 登录态 / session** | 证明「可以代表你调用 Grok 上游」的凭证。可以是 `grok login` 的会话、`XAI_API_KEY`、或第三方 key——**不必只有 OAuth**。 |
| **OAuth / `grok login`** | 浏览器授权登录官方账号的一种方式；**可选**，不是唯一方式。 |

### 权限相关（`permission_mode` / sandbox）

调用 `grok_run` 时，用参数 **`permission_mode`** 控制 Grok 能有多大胆。

| 术语 | 含义（白话） | 什么时候用 |
|------|----------------|------------|
| **`restricted`（受限，默认）** | **默认档**。Grok 大致可在**当前工作区**读写文件，完成常规改代码；但 **高危 shell**（破坏性/越权类命令策略）会被 **硬拒绝**；也 **不会**打开「一律自动批准」类抬权。适合日常委托、第二意见、常规实现。 | **绝大多数情况**：不传 `permission_mode` 即为此档。 |
| **`inherit`（继承宿主）** | 尽量让 Grok 的能力档 **贴近当前宿主会话**（例如宿主已是 Full Access 时，才可能给 Grok 更高能力）。**必须由用户明确要求**（「和 Codex/Claude 同权」「Full Access」等）；**禁止**因为任务难就自动改用 inherit。 | 仅当用户明确要求同权/抬权时。 |
| **`host_sandbox`（宿主能力档）** | 使用 `inherit` 时，告诉桥接「宿主现在大概是哪一档权限」的标签。MCP 子进程通常 **读不到** 宿主会话的实时权限，所以要靠参数或环境变量传入。 | 与 `inherit` 一起用；缺了可能得到 `INHERIT_UNAVAILABLE`。 |
| **`read-only`** | `host_sandbox` 取值之一：只读——Grok 侧应避免改文件。 | 宿主本身是只读沙箱时。 |
| **`workspace-write`** | 可写当前工作区——与默认 `restricted` 的能力档接近。 | 宿主允许改项目文件时。 |
| **`danger-full-access`** | 近似「全开」：会抬权并启用 always-approve 一类行为，但仍保留部分绝对禁令。费用与风险都更高。 | 仅用户明确 Full-Access / 同宿主最高权时。 |
| **`codex_sandbox`** | **`host_sandbox` 的旧别名**（兼容早期命名）。两字段同时传且不一致 → 报错 `INVALID_ARGS`。新集成请用 `host_sandbox`。 |
| **`always-approve`** | Grok/CLI 侧一种「少问确认、多自动批准」的行为；主要在 full 类档位出现。不是你日常默认。 | 理解 `danger-full-access` 时知道有这层含义即可。 |
| **`INHERIT_UNAVAILABLE`** | 错误码：选了 `inherit`，但桥接 **不知道** 宿主能力档（没传 `host_sandbox` 等），**不会**偷偷当成 full。 | 改为 `restricted`，或补上正确的 `host_sandbox`。 |

**一句话记权限：**  
默认 **`restricted` = 能干活但有护栏**；**`inherit` = 跟宿主同权，仅用户点名，且要说清 `host_sandbox`**。

### 运行方式：Leader 与会话

| 术语 | 含义（白话） |
|------|----------------|
| **headless** | 无完整 TUI 界面，用命令行方式跑一轮/多轮 Grok agent（Grokodex 的主路径）。 |
| **Leader（暖进程）** | 本机常驻的 Grok 后台进程，避免每次冷启动。默认 **开启**。官方路径下它依赖有效登录态；态坏了会出现 `User unauthorized` 等（见 [排障](#排障装上了但超时--unauthorized)）。 |
| **one-shot** | 不经过 leader，每次单独拉起 `grok`。设 `GROKODEX_USE_LEADER=0` 即强制此模式。 |
| **fallback** | leader 失败时是否退回 one-shot（默认会退）。 |
| **会话续作 / session reuse** | 多轮 `grok_run` 尽量 **接着同一条 Grok 对话**（CLI `--resume`），而不是每轮全新聊天。 |
| **`host_thread_id`** | 宿主侧「这一次任务/线程」的 id。传给 `grok_run` 后，桥接用来查找是否已有可 resume 的 Grok 会话。建议格式：`codex:<id>` / `claude:<id>`。 |
| **`session_id`** | Grok 侧会话 id（响应里也会返回）。一般交给 bridge 管理；高级用法可显式传入做 `--resume`。 |
| **`fresh: true`** | 强制新开 Grok 会话，不接着旧对话。换话题、宿主 `/clear` 后可用。 |
| **权限指纹** | bridge 根据权限档等算出的标记。同 `host_thread_id` 但权限档变了（如 restricted→inherit）会开新 Grok 会话，避免「低权对话里突然高权」的混乱。 |

**Leader ≠ 会话续作：**  
Leader = 进程是否暖着；会话续作 = 聊的是不是同一条 thread。两者独立。

### 工具与协议里常见字段

| 术语 | 含义（白话） |
|------|----------------|
| **`grok_setup` / `grok_run` / `grok_imagine` / `grok_x_search`** | 四个 MCP **工具名**（逻辑名）。Claude 界面可能显示成 `mcp__…__grok_run`，本质相同。 |
| **`ok` / `error.code` / `hint`** | 统一返回包：`ok` 是否成功；失败时 `error.code` 稳定错误码，`hint` 给人看的建议。 |
| **`meta.leader` / `meta.session`** | 响应里的诊断信息：leader 是否用上、是否 resume 等。排障时优先看这两块。 |
| **stdio** | 进程用标准输入输出通信（相对 HTTP MCP）。公开安装里即：`node` 跑 `bundle.mjs`。 |
| **`bundle.mjs`** | 预构建的单文件 bridge，用户 **不必** 为启动 MCP 再 `npm install`。 |
| **PATH** | 系统「可执行文件搜索路径」。公开安装用命令名 `node` / `grok`，要求它们在 PATH 里。 |

---

## 依赖

| 依赖 | 说明 |
|------|------|
| **Node.js 18.18+** | 必须在 **PATH** 上（公开安装使用 `command: "node"`） |
| **Grok CLI（Grok Build）** | `grok` 在 PATH，或设置 `GROK_PATH` |
| **可用的 Grok 上游鉴权** | **任选其一或组合**：官方 `grok login`、官方 `XAI_API_KEY`、或第三方/自建 API（见下节） |
| **Codex 和/或 Claude Code** | 支持 plugin marketplace 的本机版本 |

安装 Grok CLI（**只装 CLI，鉴权见下一节**）：

```bash
# macOS / Linux / WSL
curl -fsSL https://x.ai/cli/install.sh | bash
```

```powershell
# Windows
irm https://x.ai/cli/install.ps1 | iex
```

不捆绑 `grok` 二进制。预构建 MCP 已随仓库提交，**普通用户安装无需** `npm install`。

---

## Grok 鉴权（不必只靠 OAuth）

Grokodex 只调用本机 **Grok Build CLI**。CLI 如何连上游，由 **Grok 自己的配置**决定——**不是**「必须 `grok login` 浏览器 OAuth」。

常见三种方式（可并存）：

| 方式 | 适用 | 怎么做 |
|------|------|--------|
| **A. 官方 session** | xAI 订阅 / 官方账号 | `grok login` → session 写入 `~/.grok/auth.json` |
| **B. 官方 API Key** | xAI 控制台发的 key | 环境变量 `XAI_API_KEY`（旧名 `GROK_CODE_XAI_API_KEY` 也常被识别） |
| **C. 第三方 / 自建上游** | OpenAI 兼容中转、Sub2API、自建网关等 | 在 `~/.grok/config.toml` 写 `[model.*]`（`base_url` + key），或全局 `GROK_MODELS_BASE_URL` + key |

### A. 官方 OAuth / 登录（可选）

```bash
grok login
```

### B. 官方 API Key（可不 login）

```bash
export XAI_API_KEY="xai-..."   # 勿提交到 git
grok -p "ping"
```

### C. 第三方 API（推荐写法：按模型分段）

在 `~/.grok/config.toml` 增加自定义模型（字段以本机 `grok` 用户手册 **Custom Models** 为准，常见路径：`~/.grok/docs/user-guide/11-custom-models.md`）：

```toml
# ~/.grok/config.toml

[model.my-upstream]
model = "grok-4.5"                          # 发给上游的 model id
base_url = "https://api.example.com/v1"     # OpenAI 兼容根路径，一般含 /v1
name = "My Upstream Grok"
env_key = "MY_UPSTREAM_API_KEY"             # 优先用环境变量，勿把 key 写进 git
api_backend = "responses"                   # chat_completions | responses | messages
context_window = 128000

# 若希望默认走该上游：
# [models]
# default = "my-upstream"
```

```bash
export MY_UPSTREAM_API_KEY="sk-..."
grok models
grok -m my-upstream -p "ping"
```

**全局只走一个网关**时，也可用（会切换默认 catalog，与官方模型混用时更建议方式 C 的分段配置）：

```bash
export GROK_MODELS_BASE_URL="https://api.example.com/v1"
export XAI_API_KEY="网关签发的 key"
```

要点：

- 自定义模型配置了 `api_key` / `env_key` 后，**该模型用 key**，不会拿官方 session 去打第三方。  
- 未配 key 的官方模型仍可用 `grok login` session。  
- `api_backend`：多数 OpenAI 兼容中转用 `chat_completions`；对齐 xAI / 部分代理时用 `responses`；Anthropic Messages 用 `messages`。  
- 更完整的第三方上游说明（含 Sub2API 示例、协议对照）：  
  **[Grok Build 接入第三方 API 上游](https://blog.silascoding.com/ai/grok/third-party-api)**  

Grokodex 侧：装好插件后用 **`grok_setup`** 看本机 `grok` 是否可用；上游是否连通仍以 `grok -m … -p "ping"` / `grok models` 为准。

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

1. 确认本机 `grok` 可用，且 **鉴权已配好**（OAuth / API Key / 第三方，见 [Grok 鉴权](#grok-鉴权不必只靠-oauth)）  
2. **`grok_setup`** — 检查 `grok` 路径、版本、本机鉴权探测  
3. **`grok_run`** — 委托任务（默认 `restricted`）  
4. 生图 → **`grok_imagine`**；查 X → **`grok_x_search`**  

随插件附带 skills：`grokodex-setup` / `grokodex-run` / `grokodex-imagine` / `grokodex-x-search`。

**硬规则：** 业务任务走 MCP；不要用 shell 旁路 `grok` 完成同一任务。配置鉴权与 `~/.grok/config.toml` 时可用 shell。

---

## 排障（装上了但超时 / unauthorized）

Grokodex **只负责**在宿主里调用本机 `grok`。插件 marketplace 装成功 ≠ 上游鉴权健康。下面这类现象多半是 **Grok CLI / 官方会话** 问题，而不是「插件没装上」。

### 常见症状

| 你看到的 | 更可能的原因 |
|----------|----------------|
| 工具长时间卡住，最后超时 / MCP `-32000` | bridge 在等 headless；leader 或 `grok` 起不来 / 鉴权被拒 |
| Grok 日志：`relay_connected wss://code.grok.com/...` 随后 `WS close … User unauthorized`，再无限 `Reconnecting...` | **能连上网**，但 **官方会话/token 无效**，不是代理问题 |
| `grok whoami` → `Device not configured` | 设备/登录态未就绪或 session 失效（与上面同类） |
| `grok_setup` 显示 `auth_ok` / auth file present，但任务仍失败 | 探测目前主要看 **`~/.grok/auth.json` 是否存在且非空**，**不能**证明 session 仍被官方接受 |

### 先在本机终端自检（不要只在宿主里重试）

```bash
grok --version
grok whoami          # 不应是 Device not configured
# 若走官方模型：
# grok logout && grok login    # 完整走完浏览器授权后再测
# 若走第三方模型：
# grok -m <你的模型名> -p "ping"
```

再看 leader 日志（若开启 leader）：是否出现 `User unauthorized`、是否在重连死循环。

### 按场景处理

**1）走 xAI 官方（OAuth / 官方 catalog）**

```bash
grok logout    # 可选，清掉坏 session
grok login     # 必须完整成功
grok whoami    # 确认正常
```

然后 **完全退出并重启** Codex App / Claude Code，新开会话再调 `grok_setup` → `grok_run`。

**2）走第三方 / API Key（不依赖 code.grok.com session）**

1. 按 [Grok 鉴权](#grok-鉴权不必只靠-oauth) 配好 `~/.grok/config.toml` 或 `XAI_API_KEY` / `GROK_MODELS_BASE_URL`  
2. 终端：`grok -m <模型> -p "ping"` 必须成功  
3. 若本机仍残留 **坏掉的官方 session**，默认 **leader** 仍可能去连 `code.grok.com` 并被 `User unauthorized` 踢掉，表现为 Grokodex 超时：  
   - 要么重新 `grok login` 修好官方态，或  
   - 临时关闭 leader，强制 one-shot：

```bash
# MCP 环境变量（公开树默认 USE_LEADER=1；本机可改插件 .mcp.json 或重装脚本）
GROKODEX_USE_LEADER=0
```

本地脚本：`./scripts/install-*-plugin.sh --no-leader`。

**3）确认不是「装错插件副本」**

- 改仓库代码后要重新 `marketplace` 更新 / 跑 install 脚本；**源码目录 ≠ 宿主正在加载的插件**  
- Node 18.18+ 必须在 **PATH**（公开安装使用 `command: "node"`）

### 和代理的关系

若日志已有 **`relay_connected`** 到 `wss://code.grok.com/...`，说明到官方 WS 的链路是通的；再出现 **`User unauthorized`** 应优先查 **登录/授权**，而不是先折腾系统代理。

### 给宿主里的 AI 的提示

用户报告超时时：先让用户在终端跑 `grok whoami` / 看 leader 是否 `unauthorized`，再决定 `grok login`、修第三方配置或 `GROKODEX_USE_LEADER=0`；不要默认让用户反复重装 Grokodex 插件。

---

## MCP 工具

| 工具 | 作用 | 要点 |
|------|------|------|
| `grok_setup` | 诊断本机 grok / 鉴权探测 | 建议先于其他工具；`auth file present` ≠ session 一定有效 |
| `grok_run` | 通用 headless 委托 | 默认 `restricted`；可选 `inherit`；可用 `model` 指定 CLI 模型名 |
| `grok_imagine` | Imagine 生图 | 窄权限；产物默认 `.grokodex/images`；依赖上游是否支持生图 |
| `grok_x_search` | X / Twitter 搜索 | 只读；`semantic` / `keyword`；依赖上游/账号能力 |

统一 JSON：`ok: true|false`；失败含稳定 `error.code` 与可选 `hint`。

### `grok_run` 常用参数

| 参数 | 说明 |
|------|------|
| `prompt` | **必填** |
| `cwd` | 工作目录（默认宿主工作区） |
| `permission_mode` | 权限档：`restricted`（**受限，默认**）或 `inherit`（**继承宿主**）；见 [术语](#权限相关permission_mode--sandbox) |
| `host_sandbox` | 仅 `inherit` 时需要：宿主能力档 `read-only` / `workspace-write` / `danger-full-access` |
| `host_thread_id` | 宿主线程 id，用于 **会话续作**（多轮接着聊） |
| `fresh` | `true` = 强制新 Grok 会话，不 resume |
| `session_id` | 高级：显式指定 Grok 会话 id（一般可省略） |
| `model` / `max_turns` / `timeout_ms` / `extra_rules` | 可选：模型名、轮数上限、超时毫秒、附加规则 |

`codex_sandbox` = `host_sandbox` 的兼容别名；两字段同时传且不一致 → `INVALID_ARGS`。
---

## 权限

术语定义见 [术语说明 · 权限相关](#权限相关permission_mode--sandbox)。此处说明 **怎么用**。

### 两档：`permission_mode`

| 档位 | 中文理解 | 何时用 | 行为摘要 |
|------|----------|--------|----------|
| **`restricted`** | **受限（默认）** | 日常委托、第二意见、常规改代码 | 可在当前工作区读写；高危 shell 硬拒绝；不 always-approve。**不传该参数 = 此档。** |
| **`inherit`** | **继承宿主** | 用户 **明确** 说「和宿主同权 / Full Access」 | 按 `host_sandbox` 映射能力；**禁止**因任务难自动改用此档 |

`grok_imagine` / `grok_x_search` **固定窄权限**，**永不** `inherit` 完整 shell。

### `inherit` 时如何填 `host_sandbox`

桥接进程通常拿不到宿主「此刻」的实时权限，所以要显式告诉它：

| `host_sandbox` | 中文 | 近似效果 |
|----------------|------|----------|
| `read-only` | 只读 | 禁止 edit/write 类 |
| `workspace-write` | 工作区可写 | 与默认 `restricted` 同级 |
| `danger-full-access` | 高危全开 | 抬权 + always-approve；仍有绝对禁令 |

**解析顺序：**  
调用参数 `host_sandbox`（或兼容别名 `codex_sandbox`）→ 环境变量 `GROKODEX_HOST_SANDBOX` / `GROKODEX_CODEX_SANDBOX` → 静态读 `~/.codex/config.toml`（仅可能对 Codex 有用）→ 仍未知则 **`INHERIT_UNAVAILABLE`**（**不会**静默当成 full）。

> **警告：** `danger-full-access` / Full-Access 费用与破坏力更高，仅在用户明确要求时使用。
---

## Leader 与会话续作

### Leader（暖进程，默认开）

术语：**Leader** = 本机预热的 Grok 后台；**one-shot** = 每次单独启动。见 [术语 · Leader 与会话](#运行方式leader-与会话)。

| 环境变量 | 默认 | 含义 |
|----------|------|------|
| `GROKODEX_USE_LEADER` | true | 使用 leader；`0`/`false` = 强制 **one-shot** |
| `GROKODEX_LEADER_FALLBACK` | true | leader 失败时退回 one-shot |
| `GROKODEX_LEADER_ENSURE` | true | socket 不可用时尝试拉起 leader |

排障看响应里的 `meta.leader`。本地脚本可用 `--no-leader`。  

官方路径下 leader 依赖有效登录态；session 失效时可能出现 WS `User unauthorized` 与超时——见 [排障](#排障装上了但超时--unauthorized)。

### 会话续作（session reuse）

术语：**会话续作** = 多轮 `grok_run` 尽量接着同一条 Grok 对话（`--resume`），不是每轮新开聊天。

多轮同一任务时传入 **`host_thread_id`**，权限档一致时 bridge 会对 Grok 做 resume：

| 宿主 | 建议写法 |
|------|----------|
| Codex | 读环境变量 `CODEX_THREAD_ID`，传 `host_thread_id=codex:<该值>` |
| Claude Code | 读 `CLAUDE_CODE_SESSION_ID`，传 `host_thread_id=claude:<该值>` |

**Leader ≠ 会话续作**（进程暖 vs 对话连续）。换话题或宿主 `/clear` 后请重读 id，或设 `fresh: true`。排障看 `meta.session`。

| 环境变量 | 默认 | 含义 |
|----------|------|------|
| `GROKODEX_SESSION_REUSE` | true | 启用按 `host_thread_id` 的 resume |
| `GROKODEX_SESSION_RESUME_FALLBACK` | true | resume 失败则去掉 resume 再试一次 |

---

## 环境变量

### Grok / 上游（由 Grok CLI 读取，非 Grokodex 专用）

| 变量 | 含义 |
|------|------|
| `GROK_PATH` | 指定 grok 二进制（Grokodex 也会用） |
| `XAI_API_KEY` | 官方或网关 API Key（Bearer）；旧名 `GROK_CODE_XAI_API_KEY` 常仍可用 |
| `GROK_MODELS_BASE_URL` | 全局 OpenAI 兼容网关 base（含 `/v1`） |
| `GROK_MODELS_LIST_URL` | 可选；模型列表 URL 与 `{base}/models` 不一致时 |

第三方分段模型更建议在 `~/.grok/config.toml` 用 `env_key` 指向你自己的环境变量名（如 `MY_UPSTREAM_API_KEY`）。

### Grokodex bridge

| 变量 | 含义 |
|------|------|
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
- 无本机可运行的 **Grok CLI + 可用上游鉴权** 则无法工作（含多数 Cloud agent）；鉴权可以是 OAuth、官方 API Key 或第三方网关，**不强制** `grok login`  
- 不在 Grokodex 内代管第三方 key / 不替代 `~/.grok/config.toml` 的 Custom Models 配置  
- 不做完整 Grok TUI / ACP 嵌套 UI  
- 不把 Grok 每个内置工具都做成独立 MCP tool（其余走 `grok_run`）  
- 不静默自动提权  
- 不进入 OpenAI / Anthropic **官方默认插件商店**（提供的是 **第三方 Git marketplace**）

---

## Star History

如果这个项目对你有帮助，欢迎点亮右上角 **Star**，方便更多人发现。

<!-- star-history:start -->
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/star-history/star-history-dark.svg">
  <img alt="Star history" src="assets/star-history/star-history-light.svg">
</picture>
<!-- star-history:end -->

<p align="center">
  <a href="https://www.star-history.com/?type=date&repos=anlostsheep%2Fgrokodex">在 star-history.com 查看交互图</a>
  ·
  <a href="https://github.com/anlostsheep/grokodex/stargazers">Stargazers</a>
</p>

---

## 贡献与支持

- 提交 Issue / PR：<https://github.com/anlostsheep/grokodex/issues>  
- 使用中请先：本机 `grok whoami`（或第三方 `grok -m … -p "ping"`）→ 宿主内 `grok_setup`  
- 开 Issue 时尽量附上：`error.code` / `hint`、是否出现 `User unauthorized` 或 `Device not configured`、是否使用第三方上游、是否关闭 leader  

---

## 许可证

```
MIT License

Copyright (c) 2026 Grokodex contributors
```

本软件按 MIT 协议授权。你可自由使用与再分发，但须保留版权与许可声明；软件按「现状」提供，不附带任何担保。

**完整条款：** [`LICENSE`](./LICENSE)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
