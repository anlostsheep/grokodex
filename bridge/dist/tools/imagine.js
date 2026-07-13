import { existsSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { failResult, okResult } from "../errors.js";
import { findInPath, } from "../grok-bin.js";
import { resolvePermissionForImagine, } from "../permission.js";
import { parseGrokJsonOutput, } from "../runner.js";
const DEFAULT_TIMEOUT_MS = 600_000;
const STDERR_TRUNCATE = 2000;
/** Image-like path suffixes used when harvesting artifacts from model text. */
const IMAGE_EXT_RE = /\.(?:png|jpe?g|webp|gif|bmp|svg|heic|avif)\b/i;
/**
 * Constrained headless prompt: image generation only, never full shell inherit.
 * Exported for unit tests of prompt assembly.
 */
export function buildImaginePrompt(opts) {
    const { prompt, saveDirAbs, aspectRatio } = opts;
    return [
        "You are running inside Grokodex. ONLY generate an image with the image generation tool.",
        "Do not edit source code or run unrelated shell commands.",
        `Save the image under: ${saveDirAbs}`,
        `Aspect ratio: ${aspectRatio}`,
        "User request:",
        prompt,
        "",
        "When done, reply with the absolute path(s) of the saved image file(s).",
        "",
        "## Extra rules",
        `Only write files under: ${saveDirAbs}`,
        "Do not create or modify files outside that directory.",
        "Do not run shell commands except those required to save the image in save_dir.",
    ].join("\n");
}
/**
 * Extract absolute-looking file paths (prefer image extensions) from free text.
 * Exported for unit tests.
 */
export function extractImagePaths(text) {
    if (!text.trim())
        return [];
    const found = [];
    const seen = new Set();
    const candidates = [];
    // Pure path lines (no prose)
    for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim().replace(/^[`"'\[\]]+|[`"'\[\],;]+$/g, "");
        if (!line || /\s/.test(line))
            continue;
        if (isPathOnly(line))
            candidates.push(line);
    }
    // Inline Unix absolute paths with image extensions (may sit in prose)
    const inlineRe = /(?:^|[\s"'`(:=])(\/(?:[\w.@%+\-]+\/)+[\w.@%+\-]+\.(?:png|jpe?g|webp|gif|bmp|svg|heic|avif))\b/gi;
    let m;
    while ((m = inlineRe.exec(text)) !== null) {
        candidates.push(m[1]);
    }
    // Windows-style paths
    const winRe = /(?:^|[\s"'`(:=])([A-Za-z]:\\(?:[^\\/:*?"<>|\r\n]+\\)*[^\\/:*?"<>|\r\n]+\.(?:png|jpe?g|webp|gif|bmp|svg|heic|avif))\b/gi;
    while ((m = winRe.exec(text)) !== null) {
        candidates.push(m[1]);
    }
    for (const c of candidates) {
        const cleaned = c.trim().replace(/[,;:]+$/, "");
        if (!cleaned || seen.has(cleaned))
            continue;
        if (!IMAGE_EXT_RE.test(cleaned) && !isPathOnly(cleaned))
            continue;
        // Drop pure directories when image files are present elsewhere
        seen.add(cleaned);
        found.push(cleaned);
    }
    const withExt = found.filter((p) => IMAGE_EXT_RE.test(p));
    return withExt.length > 0 ? withExt : found;
}
/** True if s is a single path token (no spaces), absolute or relative file path. */
function isPathOnly(s) {
    if (s.length < 2 || s.length > 1024)
        return false;
    if (/\s/.test(s))
        return false;
    if (isAbsolute(s))
        return true;
    if (/^[A-Za-z]:[\\/]/.test(s))
        return true;
    if (s.startsWith("./") || s.startsWith("../"))
        return true;
    return false;
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
    const base = failResult("grok_imagine", code, message, hint);
    return { ...base, permission: audit };
}
function resolveSaveDir(args, cwd) {
    const raw = args.save_dir?.trim();
    if (raw) {
        return isAbsolute(raw) ? raw : resolve(cwd, raw);
    }
    return resolve(cwd, ".grokodex", "images");
}
/**
 * Run a constrained headless Grok image-generation task.
 * Always uses restricted-class CLI (never full shell inherit).
 * Never throws; all failures are envelope errors.
 */
export async function handleGrokImagine(args, deps) {
    try {
        const prompt = typeof args.prompt === "string" ? args.prompt.trim() : "";
        if (!prompt) {
            return failResult("grok_imagine", "INVALID_ARGS", "prompt is required and must be a non-empty string", "Pass a non-empty prompt describing the image to generate");
        }
        const env = deps.env ?? process.env;
        const exists = deps.existsSync ?? existsSync;
        const whichFn = deps.whichFn ?? defaultWhich(env);
        const getCwd = deps.getCwd ?? (() => process.cwd());
        const resolvePermImagine = deps.resolvePermImagine ?? resolvePermissionForImagine;
        const resolved = await Promise.resolve(deps.resolveBin(env, { existsSync: exists }, whichFn));
        if ("error" in resolved) {
            return failResult("grok_imagine", resolved.error, resolved.message, "Install the Grok CLI, ensure `grok` is on PATH, or set GROK_PATH");
        }
        const perm = resolvePermImagine();
        if (!perm.ok) {
            // resolvePermissionForImagine always succeeds today; defensive branch.
            return failWithPermission(perm.code, perm.message, perm.hint, perm.audit);
        }
        const cwd = args.cwd?.trim() || getCwd();
        const saveDirAbs = resolveSaveDir(args, cwd);
        const aspectRatio = args.aspect_ratio?.trim() && args.aspect_ratio.trim() !== ""
            ? args.aspect_ratio.trim()
            : "auto";
        const fullPrompt = buildImaginePrompt({
            prompt,
            saveDirAbs,
            aspectRatio,
        });
        const timeoutMs = typeof args.timeout_ms === "number" && args.timeout_ms > 0
            ? args.timeout_ms
            : DEFAULT_TIMEOUT_MS;
        const cliArgs = [...perm.cliArgs];
        if (args.model !== undefined && args.model.trim() !== "") {
            cliArgs.push("-m", args.model.trim());
        }
        cliArgs.push("-p", fullPrompt);
        const runReq = {
            bin: resolved.path,
            args: cliArgs,
            cwd,
            timeoutMs,
            env: perm.env,
        };
        const result = await deps.run(runReq);
        if (result.timedOut) {
            return failWithPermission("TIMEOUT", `grok timed out after ${timeoutMs}ms`, "Increase timeout_ms or simplify the image prompt; default is 600000ms", perm.audit);
        }
        if (result.code !== 0) {
            const stderr = truncate(result.stderr || result.stdout || "(no output)", STDERR_TRUNCATE);
            return failWithPermission("GROK_EXIT_NONZERO", `grok exited with code ${result.code ?? "null"}: ${stderr}`, "Check prompt / Grok image tool availability; run grok_setup if auth may be wrong", perm.audit);
        }
        const parsed = parseGrokJsonOutput(result.stdout);
        const text = parsed?.text ??
            (result.stdout.trim() ? result.stdout.trim() : undefined);
        const paths = extractImagePaths(text ?? "");
        const artifacts = paths.map((path) => ({
            type: "image",
            path,
        }));
        const notes = [...perm.audit.notes];
        if (artifacts.length === 0) {
            notes.push("No image path found in Grok output; inspect text manually for saved files under save_dir.");
        }
        return okResult("grok_imagine", {
            text,
            session_id: parsed?.sessionId,
            permission_mode: "restricted",
            permission: { ...perm.audit, notes },
            artifacts: artifacts.length > 0 ? artifacts : undefined,
            meta: {
                duration_ms: result.durationMs,
                cwd,
                save_dir: saveDirAbs,
                aspect_ratio: aspectRatio,
                model: args.model,
                exit_code: result.code,
            },
        });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return failResult("grok_imagine", "GROK_EXIT_NONZERO", `grok_imagine failed: ${message}`, "Retry; if it persists, check GROK_PATH and local Grok CLI image support");
    }
}
//# sourceMappingURL=imagine.js.map