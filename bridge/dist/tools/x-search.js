import { existsSync } from "node:fs";
import { join } from "node:path";
import { failResult, okResult } from "../errors.js";
import { findInPath, } from "../grok-bin.js";
import { applyLeaderCliFlags, markLeaderRunFallback, prepareLeader, shouldFallbackAfterLeaderRun, } from "../leader.js";
import { applyNarrowCliArgs, parseToolsAllowlist, } from "../narrow-cli.js";
import { resolvePermissionForXSearch, } from "../permission.js";
import { parseGrokJsonOutput, } from "../runner.js";
const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 50;
const STDERR_TRUNCATE = 2000;
/**
 * Constrained headless prompt: X/Twitter search only, no repo edits.
 * Exported for unit tests of prompt assembly.
 */
export function buildXSearchPrompt(opts) {
    const { query, mode, limit, fromDate, toDate, usernames } = opts;
    const lines = [
        "You are running inside Grokodex. ONLY use X/Twitter search-related capabilities.",
        "Do not edit source code, write files, or modify the repository.",
        "Do not run shell commands that change the workspace.",
        "Complete in as few turns as possible. Do not explore the repo or use web_search.",
        "Do not spawn subagents. Prefer a single X search tool call then JSON results.",
        "",
        `Search mode: ${mode}`,
        `Return at most ${limit} results.`,
    ];
    if (fromDate) {
        lines.push(`From date (inclusive): ${fromDate}`);
    }
    if (toDate) {
        lines.push(`To date (inclusive): ${toDate}`);
    }
    if (usernames && usernames.length > 0) {
        lines.push(`Limit to these usernames: ${usernames.join(", ")}`);
    }
    lines.push("", "User query:", query, "", "When done, reply with a JSON array only (optionally inside a ```json fence).", "Each element must be an object with keys:", '  { "author": string, "time": string, "summary": string, "url_or_id": string }', `At most ${limit} items. Prefer real post URLs or IDs when available.`);
    return lines.join("\n");
}
/**
 * Try to extract a results array from free text / Grok JSON envelope text.
 * Accepts top-level arrays, fenced ```json blocks, or nested under common keys.
 * Exported for unit tests.
 */
export function extractXSearchResults(text, limit) {
    if (!text.trim())
        return null;
    const candidates = [];
    // Whole string as JSON
    tryParseJsonCandidate(text.trim(), candidates);
    // Fenced ```json ... ``` or ``` ... ```
    const fenceRe = /```(?:json)?\s*([\s\S]*?)```/gi;
    let m;
    while ((m = fenceRe.exec(text)) !== null) {
        tryParseJsonCandidate(m[1].trim(), candidates);
    }
    // Bracket-scan for array substrings (last-resort)
    extractArraySubstrings(text, candidates);
    for (const raw of candidates) {
        const items = normalizeResultsArray(raw, limit);
        if (items)
            return items;
    }
    return null;
}
function tryParseJsonCandidate(s, out) {
    if (!s)
        return;
    try {
        out.push(JSON.parse(s));
    }
    catch {
        // ignore
    }
}
/** Collect JSON array-looking substrings from text (greedy bracket match). */
function extractArraySubstrings(text, out) {
    let i = 0;
    while (i < text.length) {
        if (text[i] !== "[") {
            i++;
            continue;
        }
        let depth = 0;
        let inString = false;
        let escape = false;
        for (let j = i; j < text.length; j++) {
            const ch = text[j];
            if (inString) {
                if (escape) {
                    escape = false;
                }
                else if (ch === "\\") {
                    escape = true;
                }
                else if (ch === '"') {
                    inString = false;
                }
                continue;
            }
            if (ch === '"') {
                inString = true;
                continue;
            }
            if (ch === "[")
                depth++;
            else if (ch === "]") {
                depth--;
                if (depth === 0) {
                    tryParseJsonCandidate(text.slice(i, j + 1), out);
                    i = j + 1;
                    break;
                }
            }
            if (j === text.length - 1) {
                i = text.length;
            }
        }
        if (depth !== 0)
            break;
    }
}
function normalizeResultsArray(raw, limit) {
    let arr = null;
    if (Array.isArray(raw)) {
        arr = raw;
    }
    else if (raw !== null && typeof raw === "object") {
        const obj = raw;
        for (const key of ["results", "posts", "data", "items"]) {
            if (Array.isArray(obj[key])) {
                arr = obj[key];
                break;
            }
        }
    }
    if (!arr || arr.length === 0)
        return null;
    const items = [];
    for (const el of arr) {
        if (el === null || typeof el !== "object" || Array.isArray(el))
            continue;
        const o = el;
        const author = pickString(o, ["author", "user", "username", "handle"]);
        const time = pickString(o, ["time", "date", "created_at", "timestamp"]);
        const summary = pickString(o, ["summary", "text", "content", "body"]);
        const url_or_id = pickString(o, [
            "url_or_id",
            "url",
            "id",
            "post_id",
            "link",
        ]);
        // Require at least summary or url to count as a hit
        if (!summary && !url_or_id && !author)
            continue;
        items.push({
            author: author ?? "",
            time: time ?? "",
            summary: summary ?? "",
            url_or_id: url_or_id ?? "",
        });
        if (items.length >= limit)
            break;
    }
    return items.length > 0 ? items : null;
}
function pickString(o, keys) {
    for (const k of keys) {
        const v = o[k];
        if (typeof v === "string" && v.trim() !== "")
            return v.trim();
        if (typeof v === "number" && Number.isFinite(v))
            return String(v);
    }
    return undefined;
}
function normalizeLimit(raw) {
    if (typeof raw !== "number" || !Number.isFinite(raw))
        return DEFAULT_LIMIT;
    const n = Math.floor(raw);
    if (n < 1)
        return 1;
    if (n > MAX_LIMIT)
        return MAX_LIMIT;
    return n;
}
function normalizeMode(raw) {
    return raw === "keyword" ? "keyword" : "semantic";
}
function normalizeUsernames(raw) {
    if (!raw || !Array.isArray(raw))
        return undefined;
    const cleaned = raw
        .filter((u) => typeof u === "string")
        .map((u) => u.trim())
        .filter((u) => u.length > 0);
    return cleaned.length > 0 ? cleaned : undefined;
}
function defaultWhich(env) {
    return () => findInPath("grok", env, existsSync, join, process.platform === "win32" ? ";" : ":");
}
function truncate(s, max) {
    if (s.length <= max)
        return s;
    return s.slice(0, max) + "…";
}
function failWithPermission(code, message, hint, audit) {
    const base = failResult("grok_x_search", code, message, hint);
    return { ...base, permission: audit };
}
/**
 * Run a constrained headless Grok X/Twitter search task.
 * Always uses restricted + disallowed-edit CLI (never full shell inherit).
 * Never throws; all failures are envelope errors.
 */
export async function handleGrokXSearch(args, deps) {
    try {
        const query = typeof args.query === "string" ? args.query.trim() : "";
        if (!query) {
            return failResult("grok_x_search", "INVALID_ARGS", "query is required and must be a non-empty string", "Pass a non-empty query for X/Twitter search");
        }
        const env = deps.env ?? process.env;
        const exists = deps.existsSync ?? existsSync;
        const whichFn = deps.whichFn ?? defaultWhich(env);
        const getCwd = deps.getCwd ?? (() => process.cwd());
        const resolvePermXSearch = deps.resolvePermXSearch ?? resolvePermissionForXSearch;
        const resolved = await Promise.resolve(deps.resolveBin(env, { existsSync: exists }, whichFn));
        if ("error" in resolved) {
            return failResult("grok_x_search", resolved.error, resolved.message, "Install the Grok CLI, ensure `grok` is on PATH, or set GROK_PATH");
        }
        const perm = resolvePermXSearch();
        if (!perm.ok) {
            return failWithPermission(perm.code, perm.message, perm.hint, perm.audit);
        }
        const mode = normalizeMode(args.mode);
        const limit = normalizeLimit(args.limit);
        const usernames = normalizeUsernames(args.usernames);
        const fromDate = typeof args.from_date === "string" && args.from_date.trim()
            ? args.from_date.trim()
            : undefined;
        const toDate = typeof args.to_date === "string" && args.to_date.trim()
            ? args.to_date.trim()
            : undefined;
        const fullPrompt = buildXSearchPrompt({
            query,
            mode,
            limit,
            fromDate,
            toDate,
            usernames,
        });
        const cwd = args.cwd?.trim() || getCwd();
        const timeoutMs = typeof args.timeout_ms === "number" && args.timeout_ms > 0
            ? args.timeout_ms
            : deps.config.x_search_timeout_ms;
        const toolsAllowlist = parseToolsAllowlist(deps.config.x_search_tools);
        const narrowMeta = {
            max_turns: deps.config.x_search_max_turns,
            tools_allowlist: toolsAllowlist,
        };
        const prepare = deps.prepareLeader ?? prepareLeader;
        let leader = await prepare(deps.config, args.use_leader, {
            env,
            bin: resolved.path,
            existsSync: exists,
        });
        if (leader.error) {
            return failResult("grok_x_search", leader.error.code, leader.error.message, leader.error.hint);
        }
        const baseCliArgs = [...perm.cliArgs];
        if (args.model !== undefined && args.model.trim() !== "") {
            baseCliArgs.push("-m", args.model.trim());
        }
        baseCliArgs.push("-p", fullPrompt);
        // Short path: low max-turns + allowlist. Leader fallback keeps the same narrow args.
        const narrowArgs = applyNarrowCliArgs(baseCliArgs, {
            maxTurns: deps.config.x_search_max_turns,
            toolsCsv: deps.config.x_search_tools,
        });
        const cliArgs = applyLeaderCliFlags(narrowArgs, leader.cli);
        const runReq = {
            bin: resolved.path,
            args: cliArgs,
            cwd,
            timeoutMs,
            env: perm.env,
        };
        let result = await deps.run(runReq);
        // One-shot retry when leader-path run fails and config allows fallback.
        if (!result.timedOut &&
            result.code !== 0 &&
            shouldFallbackAfterLeaderRun(leader.meta, deps.config)) {
            leader = {
                cli: { use: false, socket: leader.meta.socket },
                meta: markLeaderRunFallback(leader.meta),
            };
            const retryArgs = applyLeaderCliFlags(narrowArgs, leader.cli);
            result = await deps.run({
                ...runReq,
                args: retryArgs,
            });
        }
        if (result.timedOut) {
            return failWithPermission("TIMEOUT", `grok timed out after ${timeoutMs}ms`, "Increase timeout_ms or narrow the query; default short-path timeout is 90000ms", perm.audit);
        }
        if (result.code !== 0) {
            const stderr = truncate(result.stderr || result.stdout || "(no output)", STDERR_TRUNCATE);
            return failWithPermission("GROK_EXIT_NONZERO", `grok exited with code ${result.code ?? "null"}: ${stderr}`, "Check query / X search availability; run grok_setup if auth may be wrong", perm.audit);
        }
        const parsed = parseGrokJsonOutput(result.stdout);
        const text = parsed?.text ??
            (result.stdout.trim() ? result.stdout.trim() : undefined);
        const results = extractXSearchResults(text ?? "", limit) ??
            extractXSearchResults(result.stdout, limit);
        const notes = [...perm.audit.notes];
        if (!results) {
            notes.push("Could not parse structured X search results from Grok output; inspect text manually.");
        }
        return okResult("grok_x_search", {
            text,
            results: results ?? undefined,
            session_id: parsed?.sessionId,
            permission_mode: "restricted",
            permission: { ...perm.audit, notes },
            meta: {
                duration_ms: result.durationMs,
                cwd,
                mode,
                limit,
                from_date: fromDate,
                to_date: toDate,
                usernames,
                model: args.model,
                exit_code: result.code,
                leader: leader.meta,
                ...narrowMeta,
            },
        });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return failResult("grok_x_search", "GROK_EXIT_NONZERO", `grok_x_search failed: ${message}`, "Retry; if it persists, check GROK_PATH and local Grok CLI X search support");
    }
}
//# sourceMappingURL=x-search.js.map