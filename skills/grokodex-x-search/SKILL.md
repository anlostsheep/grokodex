---
name: grokodex-x-search
description: "Search X/Twitter via local Grok (MCP grok_x_search). Use for recent posts, public reaction, keyword or semantic X queries, or when the user asks about discussion on X. 通过 Grokodex 用本地 Grok 检索 X。"
---

# Grokodex X Search

Search **X (Twitter)** through a constrained headless Grok task (read-only; no repo edits; never full shell inherit).

## When to use

- User wants recent posts, sentiment, or discussion on X about a topic
- Looking up posts by people / handles
- Semantic “what are people saying about …” vs keyword queries
- Not for general coding → `grokodex-run`
- Not for image generation → `grokodex-imagine`

## Tool preference

1. Call MCP tool **`grok_x_search`** (logical name; Claude may show an `mcp__…` prefix).
2. Do **not** use a terminal/shell tool to run `grok` for X search.
3. Do **not** pass inherit / `host_sandbox` / `codex_sandbox` (tool always runs restricted-x-search).

## How to fill arguments

| Arg | Required | Default | How to set |
|-----|----------|---------|------------|
| `query` | **yes** | — | Natural-language question or keywords |
| `mode` | no | see discipline | `semantic` = meaning/topic; `keyword` = exact-ish terms (prefer for vague “news/hot today”) |
| `limit` | no | `5` | How many hits to return (bridge caps at 50) |
| `from_date` | no | — | `YYYY-MM-DD` inclusive start; **set to today** for “today’s news” |
| `to_date` | no | — | `YYYY-MM-DD` inclusive end; **set to today** for “today’s news” |
| `usernames` | no | — | Array of handles (with or without `@`) to bias/limit authors |
| `cwd` | no | host cwd | Working directory |
| `timeout_ms` | no | **90000** (bridge short path) | Raise only if needed after narrowing query |
| `model` | no | CLI default | Only if user requests a model |

### Choosing `mode`

- **keyword** — cashtags, slogans, hashtags, **and vague “today’s interesting news/hot posts”** (use with today’s dates)
- **semantic** — “what are people saying about library X”, product launches, clear topical questions

### Query tips

- Include time intent in `from_date`/`to_date` rather than only in prose when possible.
- Prefer `usernames` for “from @foo and @bar”.
- Keep `limit` small (3–10) for chat readability unless user wants more.

## Query discipline (performance)

1. Vague requests (“有趣新闻”, “what’s interesting on X today”, “热点”):
   - Prefer **`mode=keyword`** (not open-ended semantic).
   - Set **`from_date` and `to_date` to today** (host local date `YYYY-MM-DD`).
   - Use concrete keywords (CN and/or EN); optional `usernames` for wire sources.
2. **Forbidden:** after empty results or TIMEOUT, automatically retry with a *broader* English dump query unless the user asks for a different strategy.
3. On TIMEOUT: suggest narrowing query / usernames / dates, or raise `timeout_ms` with user consent.
4. Bridge runs a **short path** (low max-turns, X tools only). Do not expect multi-minute research agents.

## Interpret the result

Success (`ok: true`):

1. **`results` (primary for delivery)**  
   Array of objects shaped like:
   ```json
   {
     "author": "handle",
     "time": "when",
     "summary": "post gist or text",
     "url_or_id": "https://x.com/... or id"
   }
   ```
   Present as a short list for the user:
   - author + time
   - summary
   - link / id when non-empty
2. **`text`**  
   Raw Grok output. Use if `results` is missing, or to add context.
3. **`permission.notes` / parse fallback**  
   If structured parse failed, bridge may still return `ok: true` with only `text` and a note.  
   Then: summarize `text` carefully and say structured results were not available.
4. **`meta`**  
   Echo `mode`, `limit`, date filters, and when useful `duration_ms`, `max_turns`, `tools_allowlist`, `leader`.

Failure (`ok: false`):

| Code | Action |
|------|--------|
| `GROK_NOT_FOUND` / auth issues | Skill `grokodex-setup` |
| `INVALID_ARGS` | Non-empty `query` required |
| `TIMEOUT` | Narrow query / dates / usernames or raise `timeout_ms` — **do not** auto-broaden and re-fire |
| `GROK_EXIT_NONZERO` | Share message; retry same narrow query or check X tool availability on CLI |

## How to present to the user

- Lead with a bullet list from `results` when present.
- Include URLs when available so the user can open posts.
- State filters used (mode, dates, usernames, limit).
- Do not invent posts that are not in `results` or `text`.
- If empty / unparsed, say so and offer a tighter query.

## Performance note

- Bridge **short path**: low `--max-turns`, `--tools` allowlist for X only (not a full coding agent).
- Leader-backed headless is **on by default** (warm backend). Inspect `meta.leader` / `meta.duration_ms` if debugging.
- Set `use_leader=false` or `GROKODEX_USE_LEADER=0` for pure one-shot. Does **not** resume chat sessions.

## Hard rules

- Prefer MCP `grok_x_search` only.
- Never request full-access inherit for this skill.
- Do not use shell `grok` to search X.
- Do not treat this skill as a substitute for web search of non-X sources.
