---
name: grokodex-setup
description: "Diagnose and fix local Grok CLI readiness for Grokodex (binary path, version, login). Use when first enabling Grokodex, grok is missing, auth fails, or tools return GROK_NOT_FOUND / GROK_NOT_LOGGED_IN. 首次使用 Grokodex、鉴权失败或找不到 grok 时调用。"
---

# Grokodex Setup

Check that the **local Grok CLI** is installed and logged in so other Grokodex tools can run.

## When to use

- First time using Grokodex in a session or machine
- Any tool returns `GROK_NOT_FOUND` or `GROK_NOT_LOGGED_IN`
- User asks to install / login / verify Grok for Codex
- Before heavy `grok_run` / `grok_imagine` / `grok_x_search` work if setup looks broken

## Tool preference

1. **Always call the MCP tool `grok_setup` first** (Grokodex MCP server).
2. Do **not** shell out to `grok` for diagnostics when `grok_setup` is available.
3. **Exception:** after `grok_setup` fails or reports missing binary / bad auth, you may guide the user to run **install** and **`grok login`** in their own terminal (see below). That is the only case where shell/`grok` is appropriate, and only as user-facing install guidance—not as a bypass for other tools.

## How to call

```text
grok_setup
```

Optional (currently ignored by the bridge, reserved):

```text
grok_setup  fix=true
```

No other parameters are required.

## Interpret the result

Envelope shape (text content is JSON):

- `ok: true` → report `text` and/or `meta`:
  - `meta.grok_path` — binary path
  - `meta.version` — CLI version if known
  - `meta.auth_ok` — whether login looks healthy
- `ok: false` → surface `error.code`, `error.message`, and `error.hint`
  - Common codes: `GROK_NOT_FOUND`, `GROK_EXIT_NONZERO`

If `auth_ok` is false (or message says login required):

1. Tell the user to run in a local terminal:
   ```bash
   grok login
   ```
2. After they finish, call `grok_setup` again.
3. Only then proceed to `grok_run` / `grok_imagine` / `grok_x_search`.

## If Grok is not installed (`GROK_NOT_FOUND`)

Give official install steps (macOS / Linux / WSL):

```bash
curl -fsSL https://x.ai/cli/install.sh | bash
```

Windows (PowerShell):

```powershell
irm https://x.ai/cli/install.ps1 | iex
```

Then:

```bash
# ensure grok is on PATH (reopen terminal if needed)
grok login
```

Optional: set `GROK_PATH` to the binary if it is installed outside PATH, then re-run `grok_setup`.

Do **not** invent alternate install URLs. Prefer https://x.ai/cli / https://docs.x.ai/build/overview.

## After success

Confirm readiness briefly (path + version + auth). Point the user to:

- `grokodex-run` → general delegation
- `grokodex-imagine` → image generation
- `grokodex-x-search` → X/Twitter search

## Hard rules

- Prefer MCP `grok_setup` over ad-hoc shell probes.
- Never print or paraphrase secrets from `~/.grok/auth.json`.
- Do not use setup success as a reason to auto-upgrade permission modes on other tools.
