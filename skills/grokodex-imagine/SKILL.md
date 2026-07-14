---
name: grokodex-imagine
description: "Generate images via local Grok (MCP grok_imagine). Use when the user wants app icons, mockups, concept art, or any image generation through Grokodex. 通过 Grokodex 调用本地 Grok 生图。"
---

# Grokodex Imagine

Generate an image with a **constrained** headless Grok run (image-only; never full shell inherit).

## When to use

- User asks to generate / draw / imagine an image, icon, mockup, or illustration via Grok
- Product UI concepts, logos, storyboard frames, etc.
- Not for general coding tasks → `grokodex-run`
- Not for X posts search → `grokodex-x-search`

## Tool preference

1. Call MCP tool **`grok_imagine`** (logical name; Claude may show an `mcp__…` prefix).
2. Do **not** use a terminal/shell tool to run `grok` for image generation.
3. Permission is fixed to restricted-class inside the bridge; **do not** pass inherit / `host_sandbox` / `codex_sandbox`.

## How to fill arguments

| Arg | Required | Default | How to set |
|-----|----------|---------|------------|
| `prompt` | **yes** | — | Detailed visual description: subject, style, colors, composition, text-in-image if any |
| `aspect_ratio` | no | `auto` | e.g. `1:1`, `16:9`, `9:16`, `4:3` when user cares about shape |
| `save_dir` | no | `<cwd>/.grokodex/images` | Absolute or workspace-relative directory for outputs |
| `cwd` | no | host cwd | Working directory for the Grok process |
| `timeout_ms` | no | **120000** (bridge short path) | Raise only for slow generations |
| `model` | no | CLI default | Only if user asks for a specific Grok model |

### Prompt tips

- Be concrete: medium, lighting, camera angle, brand constraints.
- Mention “no watermark / no UI chrome” when relevant.
- If the user wants a specific filename/location, put that path intent in `prompt` **and** set `save_dir` to the parent directory.
- Keep the task short: one image, clear subject. Do not chain coding context into imagine.

## Interpret the result

Success (`ok: true`):

1. **`artifacts` (primary for delivery)**  
   Array of `{ "type": "image", "path": "/abs/path/to/file.png" }`.  
   - Tell the user each path clearly so they can open the file.  
   - Prefer listing absolute paths from `artifacts`.
2. **`text`**  
   Grok’s free-form reply; may include paths or a short description. Use as secondary narrative.
3. **`meta`**  
   Often includes `save_dir`, `aspect_ratio`, `duration_ms`, `cwd`, `max_turns`, `tools_allowlist`. Mention `save_dir` if no artifacts were parsed.
4. **`permission.notes`**  
   If notes say no image path was found, still check `meta.save_dir` / `.grokodex/images` and report what Grok wrote in `text`.

Failure (`ok: false`):

| Code | Action |
|------|--------|
| `GROK_NOT_FOUND` / auth issues | Skill `grokodex-setup` |
| `INVALID_ARGS` | Non-empty `prompt` required |
| `TIMEOUT` | Narrow prompt or increase `timeout_ms` |
| `GROK_EXIT_NONZERO` | Share message; retry or check Imagine availability on CLI |

## How to present to the user

- Lead with saved file path(s) from `artifacts`.
- Optionally quote a one-line description from `text`.
- If `artifacts` is missing but `ok` is true, say generation may have succeeded and point to `meta.save_dir` + raw `text`.
- Do not claim a local image exists if neither artifacts nor a clear path in `text` is present.

## Performance note

- Bridge **short path**: low `--max-turns`, `--tools` allowlist for `image_gen` only.
- Leader-backed headless is **on by default**. Inspect `meta.leader` / `meta.duration_ms` if debugging.
- Set `use_leader=false` or `GROKODEX_USE_LEADER=0` for pure one-shot. Does **not** resume chat sessions.

## Hard rules

- Prefer MCP `grok_imagine` only.
- Never request full-access inherit for this skill.
- Do not use shell `grok` to regenerate images.
