---
name: grokodex-run
description: "Delegate a coding/agent task to local Grok via MCP grok_run (restricted by default; optional inherit + codex_sandbox). Use for second opinions, hard bugs, multi-step implementation, or when the user asks to run Grok. 委托本地 Grok 执行任务；默认受限权限。"
---

# Grokodex Run

Run a **headless local Grok agent** task through the Grokodex MCP bridge.

## When to use

- User wants Grok’s second opinion, review, or implementation help
- Hard bugs / multi-file refactors better handled by a peer agent
- Explicit “run Grok / ask Grok / delegate to Grok” requests
- Not for pure image gen → use `grokodex-imagine`
- Not for pure X/Twitter search → use `grokodex-x-search`
- Not for install/login diagnosis → use `grokodex-setup`

## Tool preference (critical)

1. **Always call MCP tool `grok_run`.**
2. **Forbidden:** `run_terminal_cmd` / `shell` / any terminal tool to execute `grok` directly for the task.
3. **Exception:** only `grokodex-setup` install/login guidance may mention shell `grok` (install script / `grok login`). Never use shell as a bypass of `grok_run`.

Bridge serializes Grok processes; avoid firing parallel `grok_run` calls that both write the same repo. Prefer one active Grok worker at a time.

## Default permissions

- **Do not pass `permission_mode`** unless the user clearly asks for elevated / Codex-matching rights.
  - Omitted / default → **`restricted`** (workspace-level writes with high-risk shell denies; no always-approve).
- Do **not** auto-upgrade because the task “looks hard.”

## Inherit + `codex_sandbox` (only when user asks)

Use **`permission_mode=inherit`** only when the user explicitly wants:

- “same permissions as Codex”
- “Full-Access” / “danger-full-access”
- matching the host session sandbox

When using inherit you **must** pass the Codex sandbox you know:

| `codex_sandbox` | Meaning for Grokodex |
|-----------------|----------------------|
| `read-only` | No file edit/write tools; restricted shell denies |
| `workspace-write` | Same capability class as restricted |
| `danger-full-access` | Approximates full access (`--always-approve` + absolute deny list retained) |

### How to fill `codex_sandbox`

1. If the user names a mode, map it to the enum above.
2. If Codex session is known Full-Access / danger-full-access → `danger-full-access`.
3. If workspace write only → `workspace-write`.
4. If read-only sandbox → `read-only`.
5. If you **do not know** the sandbox, **do not** call inherit without it — stay on restricted, or ask the user.

Optional: `codex_approval` = `untrusted` | `on-failure` | `on-request` | `never` when the host approval policy is known.

### On `INHERIT_UNAVAILABLE`

If the tool returns `ok: false` with `error.code = "INHERIT_UNAVAILABLE"`:

1. Explain that inherit needs a known `codex_sandbox` (or config/env sandbox signal).
2. **Retry with `permission_mode=restricted`**, **or** re-call inherit with an explicit `codex_sandbox`.
3. Do not invent full access silently.

Other permission failures (`PERMISSION_DENIED`) mean config disabled inherit / full-access inherit — explain and fall back to restricted.

## Args cheat sheet

| Arg | Required | Notes |
|-----|----------|--------|
| `prompt` | **yes** | Clear task for Grok; include file paths and acceptance criteria |
| `cwd` | no | Working directory (default: host workspace) |
| `permission_mode` | no | `restricted` (default) \| `inherit` |
| `codex_sandbox` | with inherit | `read-only` \| `workspace-write` \| `danger-full-access` |
| `codex_approval` | no | Host approval signal |
| `model` | no | Grok model override |
| `max_turns` | no | Cap agent turns (default ~30) |
| `timeout_ms` | no | Default 600000 |
| `extra_rules` | no | Extra constraints appended to the prompt |

### Prompt writing tips

- State goal, constraints, and “done when…” criteria.
- Point at concrete paths; avoid dumping huge unrelated context.
- Use `extra_rules` for “do not touch X”, test commands, style notes.

## Interpret the result

Success (`ok: true`):

- Prefer `text` as the user-facing answer / summary of what Grok did.
- Mention `permission_mode` / `permission.effective` if rights mattered.
- `session_id` / `meta.duration_ms` optional for transparency.

Failure (`ok: false`):

| Code | Action |
|------|--------|
| `GROK_NOT_FOUND` / `GROK_NOT_LOGGED_IN` | Use skill `grokodex-setup` |
| `INHERIT_UNAVAILABLE` | Explain; restricted or pass `codex_sandbox` |
| `PERMISSION_DENIED` | Explain config; use restricted |
| `TIMEOUT` | Simplify task or raise `timeout_ms` |
| `INVALID_ARGS` | Fix empty/missing `prompt` |
| `GROK_EXIT_NONZERO` | Share message/hint; adjust prompt or permissions |

## Hard rules

1. MCP `grok_run` only — no shell `grok` for the task.
2. Default: no inherit.
3. Inherit only on explicit user/Codex Full-Access intent **and** pass known `codex_sandbox`.
4. On `INHERIT_UNAVAILABLE`, explain and recover (restricted or sandbox).
