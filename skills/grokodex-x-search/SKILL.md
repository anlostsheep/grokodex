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

1. Call MCP tool **`grok_x_search`**.
2. Do **not** shell out to `grok` for X search.
3. Do **not** pass inherit / `codex_sandbox` (tool always runs restricted-x-search).

## How to fill arguments

| Arg | Required | Default | How to set |
|-----|----------|---------|------------|
| `query` | **yes** | — | Natural-language question or keywords |
| `mode` | no | `semantic` | `semantic` = meaning/topic; `keyword` = exact-ish terms / operators style |
| `limit` | no | `5` | How many hits to return (bridge caps at 50) |
| `from_date` | no | — | `YYYY-MM-DD` inclusive start |
| `to_date` | no | — | `YYYY-MM-DD` inclusive end |
| `usernames` | no | — | Array of handles (with or without `@`) to bias/limit authors |
| `cwd` | no | host cwd | Working directory |
| `timeout_ms` | no | `180000` | Shorter default than run/imagine; raise if needed |
| `model` | no | CLI default | Only if user requests a model |

### Choosing `mode`

- **semantic** — “what are people saying about library X”, product launches, vague topics
- **keyword** — cashtags, exact slogans, hashtags, or when the user pastes a keyword-style query

### Query tips

- Include time intent in `from_date`/`to_date` rather than only in prose when possible.
- Prefer `usernames` for “from @foo and @bar”.
- Keep `limit` small (3–10) for chat readability unless user wants more.

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
   Echo `mode`, `limit`, date filters when useful for transparency.

Failure (`ok: false`):

| Code | Action |
|------|--------|
| `GROK_NOT_FOUND` / auth issues | Skill `grokodex-setup` |
| `INVALID_ARGS` | Non-empty `query` required |
| `TIMEOUT` | Narrow query / dates / usernames or raise `timeout_ms` |
| `GROK_EXIT_NONZERO` | Share message; retry or check X tool availability on CLI |

## How to present to the user

- Lead with a bullet list from `results` when present.
- Include URLs when available so the user can open posts.
- State filters used (mode, dates, usernames, limit).
- Do not invent posts that are not in `results` or `text`.
- If empty / unparsed, say so and offer a tighter query.

## Performance note

Leader-backed headless is **on by default** (warm MCP/skills). You do not need
to pass leader args. Inspect `meta.leader` if debugging; set `use_leader=false`
or `GROKODEX_USE_LEADER=0` for pure one-shot. Does **not** resume chat sessions.

## Hard rules

- Prefer MCP `grok_x_search` only.
- Never request full-access inherit for this skill.
- Do not use shell `grok` to search X.
- Do not treat this skill as a substitute for web search of non-X sources.
