import { existsSync } from "node:fs";
import { createConnection } from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import type { GrokodexConfig } from "./config.js";
import type { ErrorCode, LeaderMeta, LeaderMode } from "./types.js";

/** Default total time to wait for leader socket after spawn (ms). */
export const DEFAULT_ENSURE_TIMEOUT_MS = 8000;
/** Default poll interval while waiting for leader readiness (ms). */
export const DEFAULT_ENSURE_POLL_MS = 100;
/** Connect probe timeout — rejects stale socket files. */
const CONNECT_PROBE_TIMEOUT_MS = 200;

export interface LeaderPlan {
  requested: boolean;
  mode: LeaderMode;
  socket: string | null;
  ensure: boolean;
  fallback: boolean;
}

export interface LeaderProbeResult {
  alive: boolean;
  pid: number | null;
}

export interface LeaderCliChoice {
  use: boolean;
  socket: string | null;
}

export interface PrepareLeaderResult {
  cli: LeaderCliChoice;
  meta: LeaderMeta;
  /** When set, caller should fail the tool without running grok. */
  error?: { code: ErrorCode; message: string; hint?: string };
}

export type ProbeFn = (socket: string) => Promise<LeaderProbeResult>;
export type EnsureFn = (args: {
  bin: string;
  socket: string;
}) => Promise<{ ok: true } | { ok: false; message: string }>;
export type LeaderSpawnFn = (
  command: string,
  args: readonly string[],
  options: SpawnOptions,
) => ChildProcess;

export interface LeaderDeps {
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  probe?: ProbeFn;
  ensure?: EnsureFn;
  /** Grok binary path; required when ensure runs with default ensure. */
  bin?: string;
  existsSync?: (p: string) => boolean;
  spawn?: LeaderSpawnFn;
  /**
   * Max time to wait for leader readiness after spawn (ms).
   * Default 8000. Legacy alias: `ensureWaitMs` (same meaning).
   * Set 0 for a single immediate re-probe (unit tests).
   */
  ensureTimeoutMs?: number;
  /**
   * @deprecated Use ensureTimeoutMs. Kept for tests/callers; same as ensureTimeoutMs.
   */
  ensureWaitMs?: number;
  /** Poll interval while waiting for readiness (ms). Default 100. */
  ensurePollMs?: number;
  sleep?: (ms: number) => Promise<void>;
  /** Override connect probe (tests). Default: real TCP/UDS connect. */
  tryConnect?: (socket: string, timeoutMs: number) => Promise<boolean>;
  /** Clock for readiness wait (tests). Default Date.now. */
  now?: () => number;
}

function envHome(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
): string {
  const h = env.HOME?.trim() || env.USERPROFILE?.trim();
  return h || homedir();
}

export function defaultLeaderSocketPath(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
  isolate: boolean,
): string {
  const grokHome =
    env.GROK_HOME?.trim() || join(envHome(env), ".grok");
  return join(
    grokHome,
    isolate ? "grokodex-leader.sock" : "leader.sock",
  );
}

/**
 * Resolve whether leader is requested and which socket/mode to use.
 * `useLeaderOverride`: undefined → config; true/false → force.
 */
export function resolveLeaderPlan(
  config: GrokodexConfig,
  useLeaderOverride: boolean | undefined,
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): LeaderPlan {
  const requested =
    useLeaderOverride !== undefined ? useLeaderOverride : config.use_leader;

  if (!requested) {
    return {
      requested: false,
      mode: "off",
      socket: null,
      ensure: config.leader_ensure,
      fallback: config.leader_fallback,
    };
  }

  const mode: LeaderMode = config.leader_isolate ? "isolated" : "shared";
  const socket =
    config.leader_socket?.trim() ||
    defaultLeaderSocketPath(env, config.leader_isolate);

  return {
    requested: true,
    mode,
    socket,
    ensure: config.leader_ensure,
    fallback: config.leader_fallback,
  };
}

export function applyLeaderCliFlags(
  args: string[],
  choice: LeaderCliChoice,
): string[] {
  if (!choice.use) return [...args];
  const out = [...args, "--leader"];
  if (choice.socket) {
    out.push("--leader-socket", choice.socket);
  }
  return out;
}

function metaOff(partial?: Partial<LeaderMeta>): LeaderMeta {
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

/**
 * Try connecting to a Unix domain socket. Succeeds only if a listener accepts.
 * Rejects stale socket files left after a dead leader.
 */
export function defaultTryConnect(
  socketPath: string,
  timeoutMs: number = CONNECT_PROBE_TIMEOUT_MS,
): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.removeAllListeners();
      socket.destroy();
      resolve(ok);
    };
    const socket = createConnection(socketPath);
    const timer = setTimeout(() => finish(false), timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

/**
 * Default probe: path exists AND a short connect succeeds (filters stale socks).
 * When `exists` is injected for tests without `tryConnect`, existence alone is used.
 */
export async function defaultProbeLeader(
  socket: string,
  exists: (p: string) => boolean = existsSync,
  tryConnect: (
    path: string,
    timeoutMs: number,
  ) => Promise<boolean> = defaultTryConnect,
): Promise<LeaderProbeResult> {
  if (!socket || !exists(socket)) {
    return { alive: false, pid: null };
  }
  // If caller injected a custom exists without care for connect, still try connect
  // (real default). Unit tests that only mock exists should pass tryConnect stub.
  const ok = await tryConnect(socket, CONNECT_PROBE_TIMEOUT_MS);
  if (!ok) {
    return { alive: false, pid: null };
  }
  return { alive: true, pid: null };
}

function parsePositiveInt(
  raw: string | undefined,
  fallback: number,
): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

/**
 * Poll probe until alive or timeout.
 * timeoutMs=0 → single probe, no sleep.
 */
export async function waitUntilLeaderReady(
  socket: string,
  probe: ProbeFn,
  opts: {
    timeoutMs: number;
    pollMs: number;
    sleep: (ms: number) => Promise<void>;
    /** Injectable clock so unit tests can advance time via sleep mock. */
    now?: () => number;
  },
): Promise<LeaderProbeResult> {
  const now = opts.now ?? Date.now;
  let last = await probe(socket);
  if (last.alive || opts.timeoutMs <= 0) {
    return last;
  }

  const deadline = now() + opts.timeoutMs;
  const poll = Math.max(1, opts.pollMs);

  while (now() < deadline) {
    const remaining = deadline - now();
    await opts.sleep(Math.min(poll, Math.max(1, remaining)));
    last = await probe(socket);
    if (last.alive) return last;
  }
  return last;
}

/** How long to wait for a synchronous-ish spawn `error` (e.g. ENOENT) before treating spawn as ok. */
const SPAWN_ERROR_WINDOW_MS = 50;

/**
 * Detached spawn: `grok agent leader --no-exit-on-disconnect [--leader-socket PATH]`
 * Does not wait for exit. Caller should re-probe after a short wait.
 * Does not kill the leader on bridge exit (unref only).
 * Listens briefly for child `error` so a missing binary returns `{ ok: false }`.
 */
export async function defaultEnsureLeader(args: {
  bin: string;
  socket: string;
  spawnFn?: LeaderSpawnFn;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const spawnFn: LeaderSpawnFn = args.spawnFn ?? spawn;
  try {
    const child = spawnFn(
      args.bin,
      [
        "agent",
        "leader",
        "--no-exit-on-disconnect",
        "--leader-socket",
        args.socket,
      ],
      {
        detached: true,
        stdio: "ignore",
        env: (args.env ?? process.env) as NodeJS.ProcessEnv,
      },
    );

    // spawn() returns before async failures (ENOENT); catch them briefly.
    const spawnError = await new Promise<Error | null>((resolve) => {
      let settled = false;
      const finish = (err: Error | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        child.removeListener("error", onError);
        resolve(err);
      };
      const onError = (err: Error) => finish(err);
      const timer = setTimeout(() => finish(null), SPAWN_ERROR_WINDOW_MS);
      child.once("error", onError);
    });

    if (spawnError) {
      const message =
        spawnError instanceof Error ? spawnError.message : String(spawnError);
      return { ok: false, message };
    }

    child.unref();
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, message };
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function ensureFailedResult(
  plan: LeaderPlan,
  errorMessage: string,
  hint: string,
): PrepareLeaderResult {
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
export async function prepareLeader(
  config: GrokodexConfig,
  useLeaderOverride: boolean | undefined,
  deps: LeaderDeps = {},
): Promise<PrepareLeaderResult> {
  const env = deps.env ?? process.env;
  const plan = resolveLeaderPlan(config, useLeaderOverride, env);

  if (!plan.requested || !plan.socket) {
    return {
      cli: { use: false, socket: null },
      meta: metaOff({ requested: false, mode: "off" }),
    };
  }

  const tryConnect = deps.tryConnect ?? defaultTryConnect;
  const probe =
    deps.probe ??
    ((socket: string) =>
      defaultProbeLeader(
        socket,
        deps.existsSync ?? existsSync,
        tryConnect,
      ));
  const ensure =
    deps.ensure ??
    (async ({ bin, socket }) =>
      defaultEnsureLeader({
        bin,
        socket,
        spawnFn: deps.spawn,
        env,
      }));
  const sleep = deps.sleep ?? defaultSleep;
  // Prefer ensureTimeoutMs; fall back to legacy ensureWaitMs; then env; then default.
  const ensureTimeoutMs =
    deps.ensureTimeoutMs ??
    deps.ensureWaitMs ??
    parsePositiveInt(
      env.GROKODEX_LEADER_ENSURE_TIMEOUT_MS,
      DEFAULT_ENSURE_TIMEOUT_MS,
    );
  const ensurePollMs =
    deps.ensurePollMs ??
    parsePositiveInt(
      env.GROKODEX_LEADER_ENSURE_POLL_MS,
      DEFAULT_ENSURE_POLL_MS,
    );

  let ensured = false;
  let probeResult = await probe(plan.socket);

  if (!probeResult.alive && plan.ensure) {
    // Only require bin when using default ensure; injected ensure may omit bin.
    if (!deps.ensure && !deps.bin) {
      return ensureFailedResult(
        plan,
        "leader ensure requires grok binary path",
        "Run grok_setup; ensure GROK_PATH or PATH has grok",
      );
    }

    const ensuredResult = await ensure({
      bin: deps.bin ?? "",
      socket: plan.socket,
    });
    if (!ensuredResult.ok) {
      return ensureFailedResult(
        plan,
        `failed to ensure grok leader: ${ensuredResult.message}`,
        "Run `grok agent leader --no-exit-on-disconnect` or grok_setup with ensure=true",
      );
    }
    ensured = true;
    // Condition-based wait: leader typically needs ~500ms+ for socket (was 400 fixed).
    probeResult = await waitUntilLeaderReady(plan.socket, probe, {
      timeoutMs: ensureTimeoutMs,
      pollMs: ensurePollMs,
      sleep,
      now: deps.now,
    });
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
export function shouldFallbackAfterLeaderRun(
  meta: LeaderMeta,
  config: GrokodexConfig,
): boolean {
  return meta.used === true && config.leader_fallback === true;
}

export function markLeaderRunFallback(meta: LeaderMeta): LeaderMeta {
  return {
    ...meta,
    used: false,
    fallback: true,
    fallback_reason: "run_failed",
  };
}
