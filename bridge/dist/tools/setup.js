import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { failResult, okResult } from "../errors.js";
import { checkGrokAuth } from "../auth-check.js";
import { loadConfig } from "../config.js";
import { findInPath, resolveGrokBinary, } from "../grok-bin.js";
import { defaultEnsureLeader, defaultLeaderSocketPath, defaultProbeLeader, } from "../leader.js";
function defaultRunCmd(bin, args) {
    return new Promise((resolve) => {
        const child = spawn(bin, args, {
            stdio: ["ignore", "pipe", "pipe"],
            env: process.env,
        });
        let stdout = "";
        let stderr = "";
        child.stdout?.on("data", (chunk) => {
            stdout += String(chunk);
        });
        child.stderr?.on("data", (chunk) => {
            stderr += String(chunk);
        });
        child.on("error", (err) => {
            resolve({ exitCode: 1, stdout, stderr: err.message });
        });
        child.on("close", (code) => {
            resolve({ exitCode: code ?? 1, stdout, stderr });
        });
    });
}
function defaultWhich(env) {
    return () => findInPath("grok", env, existsSync, join, process.platform === "win32" ? ";" : ":");
}
function defaultSleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
function resolveSetupSocket(config, env) {
    const custom = config.leader_socket?.trim();
    if (custom)
        return custom;
    return defaultLeaderSocketPath(env, config.leader_isolate);
}
function leaderHint(config, probe) {
    if (!config.use_leader) {
        return "Set GROKODEX_USE_LEADER=1 to enable leader-backed headless (opt-in).";
    }
    if (probe.alive) {
        return "Leader is available; tools will prefer leader-backed headless when enabled.";
    }
    return ("Leader socket is down. Start with `grok agent leader --no-exit-on-disconnect`, " +
        "or re-run grok_setup with ensure=true. " +
        "With GROKODEX_LEADER_FALLBACK=1 tools can still run one-shot.");
}
async function collectLeaderStatus(config, env, bin, wantEnsure, deps) {
    const socket = resolveSetupSocket(config, env);
    const probe = deps.probeLeader ??
        ((s) => defaultProbeLeader(s, deps.existsSync ?? existsSync));
    const ensure = deps.ensureLeader ??
        (async ({ bin: b, socket: sock }) => defaultEnsureLeader({ bin: b, socket: sock, env }));
    const sleep = deps.sleep ?? defaultSleep;
    const ensureWaitMs = deps.ensureWaitMs ?? 400;
    let result = await probe(socket);
    if (wantEnsure && !result.alive) {
        const ensured = await ensure({ bin, socket });
        if (ensured.ok) {
            await sleep(ensureWaitMs);
            result = await probe(socket);
        }
    }
    return {
        socket,
        alive: result.alive,
        pid: result.pid,
        grokodex_use_leader: config.use_leader,
        grokodex_leader_fallback: config.leader_fallback,
        hint: leaderHint(config, result),
    };
}
function buildSuccessText(grokPath, auth, leader) {
    const lines = [
        `Grok found at ${grokPath}`,
        `version: ${auth.version ?? "unknown"}`,
        `auth_ok: ${auth.auth_ok}`,
    ];
    if (auth.detail)
        lines.push(`detail: ${auth.detail}`);
    if (!auth.auth_ok) {
        lines.push("Next steps: run `grok login` (or the CLI auth flow) so ~/.grok/auth.json is present, then re-run grok_setup.");
    }
    else {
        lines.push("Ready. You can use grok_run, grok_imagine, and grok_x_search.");
    }
    lines.push(`leader: socket=${leader.socket}`, `leader_alive: ${leader.alive}`, `grokodex_use_leader: ${leader.grokodex_use_leader}`, `grokodex_leader_fallback: ${leader.grokodex_leader_fallback}`, `leader_hint: ${leader.hint}`);
    return lines.join("\n");
}
/**
 * Diagnostic tool: locate grok, report version and login health, plus leader status.
 * Never throws; never prints secrets from auth.json.
 * By default does not spawn leader; pass ensure=true to try starting it when dead.
 */
export async function handleSetup(args = {}, deps = {}) {
    try {
        const env = deps.env ?? process.env;
        const exists = deps.existsSync ?? existsSync;
        const whichFn = deps.whichFn ?? defaultWhich(env);
        const resolveBin = deps.resolveBin ?? resolveGrokBinary;
        const checkAuth = deps.checkAuth ?? checkGrokAuth;
        const runCmd = deps.runCmd ?? defaultRunCmd;
        const config = deps.config ?? loadConfig(env);
        const wantEnsure = args.ensure === true;
        const resolved = await Promise.resolve(resolveBin(env, { existsSync: exists }, whichFn));
        if ("error" in resolved) {
            return failResult("grok_setup", resolved.error, resolved.message, "Install the Grok CLI, ensure `grok` is on PATH, or set GROK_PATH to the binary.");
        }
        const auth = await Promise.resolve(checkAuth(resolved.path, runCmd));
        const leader = await collectLeaderStatus(config, env, resolved.path, wantEnsure, deps);
        return okResult("grok_setup", {
            text: buildSuccessText(resolved.path, auth, leader),
            meta: {
                grok_path: resolved.path,
                version: auth.version,
                auth_ok: auth.auth_ok,
                detail: auth.detail,
                leader,
            },
        });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return failResult("grok_setup", "GROK_EXIT_NONZERO", `setup failed: ${message}`, "Retry grok_setup; if it persists, check GROK_PATH and local Grok CLI install.");
    }
}
//# sourceMappingURL=setup.js.map