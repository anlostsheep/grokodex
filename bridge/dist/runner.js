import { spawn as defaultSpawn } from "node:child_process";
const KILL_GRACE_MS_DEFAULT = 200;
/** Global mutex: only one grok child at a time. */
let chain = Promise.resolve();
/** @internal Reset serial queue between unit tests. */
export function resetRunGrokQueueForTests() {
    chain = Promise.resolve();
}
/**
 * Run a single grok process under the global serial mutex.
 * Concurrent callers queue; the next spawn starts only after the previous child closes.
 */
export function runGrok(req, deps = {}) {
    const run = () => executeOne(req, deps);
    const result = chain.then(run, run);
    chain = result.then(() => undefined, () => undefined);
    return result;
}
function executeOne(req, deps) {
    const spawnFn = deps.spawn ?? defaultSpawn;
    const killGraceMs = deps.killGraceMs ?? KILL_GRACE_MS_DEFAULT;
    const now = deps.now ?? Date.now;
    const started = now();
    return new Promise((resolve) => {
        let stdout = "";
        let stderr = "";
        let timedOut = false;
        let settled = false;
        let killTimer;
        let termTimer;
        const finish = (code) => {
            if (settled)
                return;
            settled = true;
            if (termTimer !== undefined)
                clearTimeout(termTimer);
            if (killTimer !== undefined)
                clearTimeout(killTimer);
            resolve({
                code,
                stdout,
                stderr,
                timedOut,
                durationMs: Math.max(0, now() - started),
            });
        };
        let child;
        try {
            child = spawnFn(req.bin, req.args, {
                cwd: req.cwd,
                env: req.env ? { ...process.env, ...req.env } : process.env,
                stdio: ["ignore", "pipe", "pipe"],
            });
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            resolve({
                code: null,
                stdout: "",
                stderr: message,
                timedOut: false,
                durationMs: Math.max(0, now() - started),
            });
            return;
        }
        child.stdout?.on("data", (chunk) => {
            stdout += String(chunk);
        });
        child.stderr?.on("data", (chunk) => {
            stderr += String(chunk);
        });
        child.on("error", (err) => {
            if (!stderr)
                stderr = err.message;
            finish(null);
        });
        child.on("close", (code) => {
            finish(code);
        });
        if (req.timeoutMs > 0) {
            termTimer = setTimeout(() => {
                if (settled)
                    return;
                timedOut = true;
                try {
                    child.kill("SIGTERM");
                }
                catch {
                    /* ignore */
                }
                killTimer = setTimeout(() => {
                    if (settled)
                        return;
                    try {
                        child.kill("SIGKILL");
                    }
                    catch {
                        /* ignore */
                    }
                }, killGraceMs);
            }, req.timeoutMs);
        }
    });
}
/**
 * Parse grok `--output-format json` stdout.
 * Accepts a bare object, last non-empty JSON line, or last brace-balanced object
 * embedded in log noise. Returns null when no object can be recovered.
 */
export function parseGrokJsonOutput(stdout) {
    const trimmed = stdout.trim();
    if (!trimmed)
        return null;
    const whole = tryParseObject(trimmed);
    if (whole)
        return whole;
    const lines = trimmed.split(/\r?\n/);
    for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (!line)
            continue;
        const parsed = tryParseObject(line);
        if (parsed)
            return parsed;
    }
    return extractLastJsonObject(trimmed);
}
function tryParseObject(s) {
    try {
        const raw = JSON.parse(s);
        if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
            return null;
        }
        return normalizeParsed(raw);
    }
    catch {
        return null;
    }
}
function normalizeParsed(raw) {
    const text = typeof raw.text === "string"
        ? raw.text
        : typeof raw.result === "string"
            ? raw.result
            : typeof raw.message === "string"
                ? raw.message
                : undefined;
    const sessionId = typeof raw.sessionId === "string"
        ? raw.sessionId
        : typeof raw.session_id === "string"
            ? raw.session_id
            : undefined;
    return { text, sessionId, raw };
}
/** Scan for the last brace-balanced `{...}` substring that parses as a JSON object. */
function extractLastJsonObject(s) {
    const ends = [];
    for (let i = 0; i < s.length; i++) {
        if (s[i] === "}")
            ends.push(i);
    }
    for (let e = ends.length - 1; e >= 0; e--) {
        const end = ends[e];
        let depth = 0;
        for (let i = end; i >= 0; i--) {
            const c = s[i];
            if (c === "}")
                depth++;
            else if (c === "{") {
                depth--;
                if (depth === 0) {
                    const candidate = s.slice(i, end + 1);
                    const parsed = tryParseObject(candidate);
                    if (parsed)
                        return parsed;
                    break;
                }
            }
        }
    }
    return null;
}
//# sourceMappingURL=runner.js.map