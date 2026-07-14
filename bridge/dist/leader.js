import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
function envHome(env) {
    const h = env.HOME?.trim() || env.USERPROFILE?.trim();
    return h || homedir();
}
export function defaultLeaderSocketPath(env, isolate) {
    const grokHome = env.GROK_HOME?.trim() || join(envHome(env), ".grok");
    return join(grokHome, isolate ? "grokodex-leader.sock" : "leader.sock");
}
/**
 * Resolve whether leader is requested and which socket/mode to use.
 * `useLeaderOverride`: undefined → config; true/false → force.
 */
export function resolveLeaderPlan(config, useLeaderOverride, env = process.env) {
    const requested = useLeaderOverride !== undefined ? useLeaderOverride : config.use_leader;
    if (!requested) {
        return {
            requested: false,
            mode: "off",
            socket: null,
            ensure: config.leader_ensure,
            fallback: config.leader_fallback,
        };
    }
    const mode = config.leader_isolate ? "isolated" : "shared";
    const socket = config.leader_socket?.trim() ||
        defaultLeaderSocketPath(env, config.leader_isolate);
    return {
        requested: true,
        mode,
        socket,
        ensure: config.leader_ensure,
        fallback: config.leader_fallback,
    };
}
export function applyLeaderCliFlags(args, choice) {
    if (!choice.use)
        return [...args];
    const out = [...args, "--leader"];
    if (choice.socket) {
        out.push("--leader-socket", choice.socket);
    }
    return out;
}
function metaOff(partial) {
    return {
        requested: false,
        used: false,
        mode: "off",
        socket: null,
        ensured: false,
        fallback: false,
        fallback_reason: null,
        ...partial,
    };
}
/** Default probe: socket path exists (Unix domain socket file present). */
export async function defaultProbeLeader(socket, exists = existsSync) {
    if (!socket || !exists(socket)) {
        return { alive: false, pid: null };
    }
    // Existence is a cheap heuristic; client attach is source of truth.
    return { alive: true, pid: null };
}
/** How long to wait for a synchronous-ish spawn `error` (e.g. ENOENT) before treating spawn as ok. */
const SPAWN_ERROR_WINDOW_MS = 50;
/**
 * Detached spawn: `grok agent leader --no-exit-on-disconnect [--leader-socket PATH]`
 * Does not wait for exit. Caller should re-probe after a short wait.
 * Does not kill the leader on bridge exit (unref only).
 * Listens briefly for child `error` so a missing binary returns `{ ok: false }`.
 */
export async function defaultEnsureLeader(args) {
    const spawnFn = args.spawnFn ?? spawn;
    try {
        const child = spawnFn(args.bin, [
            "agent",
            "leader",
            "--no-exit-on-disconnect",
            "--leader-socket",
            args.socket,
        ], {
            detached: true,
            stdio: "ignore",
            env: (args.env ?? process.env),
        });
        // spawn() returns before async failures (ENOENT); catch them briefly.
        const spawnError = await new Promise((resolve) => {
            let settled = false;
            const finish = (err) => {
                if (settled)
                    return;
                settled = true;
                clearTimeout(timer);
                child.removeListener("error", onError);
                resolve(err);
            };
            const onError = (err) => finish(err);
            const timer = setTimeout(() => finish(null), SPAWN_ERROR_WINDOW_MS);
            child.once("error", onError);
        });
        if (spawnError) {
            const message = spawnError instanceof Error ? spawnError.message : String(spawnError);
            return { ok: false, message };
        }
        child.unref();
        return { ok: true };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, message };
    }
}
function defaultSleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
function ensureFailedResult(plan, errorMessage, hint) {
    if (plan.fallback) {
        return {
            cli: { use: false, socket: plan.socket },
            meta: {
                requested: true,
                used: false,
                mode: plan.mode,
                socket: plan.socket,
                ensured: false,
                fallback: true,
                fallback_reason: "ensure_failed",
            },
        };
    }
    return {
        cli: { use: false, socket: plan.socket },
        meta: {
            requested: true,
            used: false,
            mode: plan.mode,
            socket: plan.socket,
            ensured: false,
            fallback: false,
            fallback_reason: "ensure_failed",
        },
        error: {
            code: "GROK_EXIT_NONZERO",
            message: errorMessage,
            hint,
        },
    };
}
/**
 * Decide leader CLI flags and meta for one tool invocation.
 * Never throws.
 */
export async function prepareLeader(config, useLeaderOverride, deps = {}) {
    const env = deps.env ?? process.env;
    const plan = resolveLeaderPlan(config, useLeaderOverride, env);
    if (!plan.requested || !plan.socket) {
        return {
            cli: { use: false, socket: null },
            meta: metaOff({ requested: false, mode: "off" }),
        };
    }
    const probe = deps.probe ??
        ((socket) => defaultProbeLeader(socket, deps.existsSync ?? existsSync));
    const ensure = deps.ensure ??
        (async ({ bin, socket }) => defaultEnsureLeader({
            bin,
            socket,
            spawnFn: deps.spawn,
            env,
        }));
    const sleep = deps.sleep ?? defaultSleep;
    const ensureWaitMs = deps.ensureWaitMs ?? 400;
    let ensured = false;
    let probeResult = await probe(plan.socket);
    if (!probeResult.alive && plan.ensure) {
        // Only require bin when using default ensure; injected ensure may omit bin.
        if (!deps.ensure && !deps.bin) {
            return ensureFailedResult(plan, "leader ensure requires grok binary path", "Run grok_setup; ensure GROK_PATH or PATH has grok");
        }
        const ensuredResult = await ensure({
            bin: deps.bin ?? "",
            socket: plan.socket,
        });
        if (!ensuredResult.ok) {
            return ensureFailedResult(plan, `failed to ensure grok leader: ${ensuredResult.message}`, "Run `grok agent leader --no-exit-on-disconnect` or grok_setup with ensure=true");
        }
        ensured = true;
        await sleep(ensureWaitMs);
        probeResult = await probe(plan.socket);
    }
    // Pre-run unavailability is always ensure_failed (even if ensure spawn "succeeded"
    // but re-probe is still dead). run_failed is reserved for markLeaderRunFallback.
    if (!probeResult.alive) {
        if (plan.fallback) {
            return {
                cli: { use: false, socket: plan.socket },
                meta: {
                    requested: true,
                    used: false,
                    mode: plan.mode,
                    socket: plan.socket,
                    ensured,
                    fallback: true,
                    fallback_reason: "ensure_failed",
                },
            };
        }
        return {
            cli: { use: false, socket: plan.socket },
            meta: {
                requested: true,
                used: false,
                mode: plan.mode,
                socket: plan.socket,
                ensured,
                fallback: false,
                fallback_reason: "ensure_failed",
            },
            error: {
                code: "GROK_EXIT_NONZERO",
                message: `grok leader not available at ${plan.socket}`,
                hint: "Start with `grok agent leader` or set GROKODEX_LEADER_FALLBACK=1",
            },
        };
    }
    return {
        cli: { use: true, socket: plan.socket },
        meta: {
            requested: true,
            used: true,
            mode: plan.mode,
            socket: plan.socket,
            ensured,
            fallback: false,
            fallback_reason: null,
        },
    };
}
/**
 * After a leader-path run failure, decide whether to retry as one-shot.
 * Pure helper for tools.
 */
export function shouldFallbackAfterLeaderRun(meta, config) {
    return meta.used === true && config.leader_fallback === true;
}
export function markLeaderRunFallback(meta) {
    return {
        ...meta,
        used: false,
        fallback: true,
        fallback_reason: "run_failed",
    };
}
//# sourceMappingURL=leader.js.map