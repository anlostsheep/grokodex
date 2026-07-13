import { existsSync } from "node:fs";
import { join } from "node:path";
import { failResult, okResult } from "../errors.js";
import { findInPath, } from "../grok-bin.js";
import { parseGrokJsonOutput, } from "../runner.js";
const DEFAULT_TIMEOUT_MS = 600_000;
const STDERR_TRUNCATE = 2000;
function defaultWhich(env) {
    return () => findInPath("grok", env, existsSync, join, process.platform === "win32" ? ";" : ":");
}
function truncate(s, max) {
    if (s.length <= max)
        return s;
    return s.slice(0, max) + "…";
}
/**
 * Replace or append `--max-turns <n>` in CLI args from permission module.
 */
export function applyMaxTurns(cliArgs, maxTurns) {
    if (maxTurns === undefined || !Number.isFinite(maxTurns)) {
        return [...cliArgs];
    }
    const n = Math.max(1, Math.floor(maxTurns));
    const args = [...cliArgs];
    const idx = args.indexOf("--max-turns");
    if (idx >= 0 && idx + 1 < args.length) {
        args[idx + 1] = String(n);
    }
    else {
        args.push("--max-turns", String(n));
    }
    return args;
}
function buildFullPrompt(prompt, extraRules) {
    if (extraRules === undefined || extraRules.trim() === "") {
        return prompt;
    }
    return `${prompt}\n\n## Extra rules\n${extraRules}`;
}
function buildCliArgs(perm, args) {
    const out = applyMaxTurns(perm.cliArgs, args.max_turns);
    if (args.model !== undefined && args.model.trim() !== "") {
        out.push("-m", args.model.trim());
    }
    out.push("-p", buildFullPrompt(args.prompt, args.extra_rules));
    return out;
}
function failWithPermission(code, message, hint, audit) {
    const base = failResult("grok_run", code, message, hint);
    return { ...base, permission: audit };
}
/**
 * Run a headless Grok task via the local CLI and wrap the result in a ToolEnvelope.
 * Never throws; all failures are envelope errors.
 */
export async function handleGrokRun(args, deps) {
    try {
        const prompt = typeof args.prompt === "string" ? args.prompt.trim() : "";
        if (!prompt) {
            return failResult("grok_run", "INVALID_ARGS", "prompt is required and must be a non-empty string", "Pass a non-empty prompt describing the task for Grok");
        }
        // Re-bind trimmed prompt for downstream assembly
        const normalized = { ...args, prompt };
        const env = deps.env ?? process.env;
        const exists = deps.existsSync ?? existsSync;
        const whichFn = deps.whichFn ?? defaultWhich(env);
        const resolved = await Promise.resolve(deps.resolveBin(env, { existsSync: exists }, whichFn));
        if ("error" in resolved) {
            return failResult("grok_run", resolved.error, resolved.message, "Install the Grok CLI, ensure `grok` is on PATH, or set GROK_PATH");
        }
        const mode = normalized.permission_mode ?? deps.config.default_permission;
        const envSandboxRaw = env.GROKODEX_CODEX_SANDBOX?.trim();
        const envSandbox = envSandboxRaw === "read-only" ||
            envSandboxRaw === "workspace-write" ||
            envSandboxRaw === "danger-full-access"
            ? envSandboxRaw
            : null;
        const perm = deps.resolvePerm({
            mode,
            codex_sandbox: normalized.codex_sandbox,
            codex_approval: normalized.codex_approval,
            allow_inherit: deps.config.allow_inherit,
            allow_full_access_inherit: deps.config.allow_full_access_inherit,
            envSandbox,
        });
        if (!perm.ok) {
            return failWithPermission(perm.code, perm.message, perm.hint, perm.audit);
        }
        const cwd = normalized.cwd?.trim() || process.cwd();
        const timeoutMs = typeof normalized.timeout_ms === "number" && normalized.timeout_ms > 0
            ? normalized.timeout_ms
            : DEFAULT_TIMEOUT_MS;
        const cliArgs = buildCliArgs(perm, normalized);
        const runReq = {
            bin: resolved.path,
            args: cliArgs,
            cwd,
            timeoutMs,
            env: perm.env,
        };
        const result = await deps.run(runReq);
        if (result.timedOut) {
            return failWithPermission("TIMEOUT", `grok timed out after ${timeoutMs}ms`, "Increase timeout_ms or simplify the task; default is 600000ms", perm.audit);
        }
        if (result.code !== 0) {
            const stderr = truncate(result.stderr || result.stdout || "(no output)", STDERR_TRUNCATE);
            return failWithPermission("GROK_EXIT_NONZERO", `grok exited with code ${result.code ?? "null"}: ${stderr}`, "Check prompt / permissions; run grok_setup if auth or binary may be wrong", perm.audit);
        }
        const parsed = parseGrokJsonOutput(result.stdout);
        const text = parsed?.text ??
            (result.stdout.trim() ? result.stdout.trim() : undefined);
        return okResult("grok_run", {
            text,
            session_id: parsed?.sessionId,
            permission_mode: mode,
            permission: perm.audit,
            meta: {
                duration_ms: result.durationMs,
                cwd,
                model: normalized.model,
                exit_code: result.code,
            },
        });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return failResult("grok_run", "GROK_EXIT_NONZERO", `grok_run failed: ${message}`, "Retry; if it persists, check GROK_PATH and local Grok CLI");
    }
}
//# sourceMappingURL=run.js.map