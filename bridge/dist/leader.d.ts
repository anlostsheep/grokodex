import { type ChildProcess, type SpawnOptions } from "node:child_process";
import type { GrokodexConfig } from "./config.js";
import type { ErrorCode, LeaderMeta, LeaderMode } from "./types.js";
/** Default total time to wait for leader socket after spawn (ms). */
export declare const DEFAULT_ENSURE_TIMEOUT_MS = 8000;
/** Default poll interval while waiting for leader readiness (ms). */
export declare const DEFAULT_ENSURE_POLL_MS = 100;
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
    error?: {
        code: ErrorCode;
        message: string;
        hint?: string;
    };
}
export type ProbeFn = (socket: string) => Promise<LeaderProbeResult>;
export type EnsureFn = (args: {
    bin: string;
    socket: string;
}) => Promise<{
    ok: true;
} | {
    ok: false;
    message: string;
}>;
export type LeaderSpawnFn = (command: string, args: readonly string[], options: SpawnOptions) => ChildProcess;
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
export declare function defaultLeaderSocketPath(env: NodeJS.ProcessEnv | Record<string, string | undefined>, isolate: boolean): string;
/**
 * Resolve whether leader is requested and which socket/mode to use.
 * `useLeaderOverride`: undefined → config; true/false → force.
 */
export declare function resolveLeaderPlan(config: GrokodexConfig, useLeaderOverride: boolean | undefined, env?: NodeJS.ProcessEnv | Record<string, string | undefined>): LeaderPlan;
export declare function applyLeaderCliFlags(args: string[], choice: LeaderCliChoice): string[];
/**
 * Try connecting to a Unix domain socket. Succeeds only if a listener accepts.
 * Rejects stale socket files left after a dead leader.
 */
export declare function defaultTryConnect(socketPath: string, timeoutMs?: number): Promise<boolean>;
/**
 * Default probe: path exists AND a short connect succeeds (filters stale socks).
 * When `exists` is injected for tests without `tryConnect`, existence alone is used.
 */
export declare function defaultProbeLeader(socket: string, exists?: (p: string) => boolean, tryConnect?: (path: string, timeoutMs: number) => Promise<boolean>): Promise<LeaderProbeResult>;
/**
 * Poll probe until alive or timeout.
 * timeoutMs=0 → single probe, no sleep.
 */
export declare function waitUntilLeaderReady(socket: string, probe: ProbeFn, opts: {
    timeoutMs: number;
    pollMs: number;
    sleep: (ms: number) => Promise<void>;
    /** Injectable clock so unit tests can advance time via sleep mock. */
    now?: () => number;
}): Promise<LeaderProbeResult>;
/**
 * Detached spawn: `grok agent leader --no-exit-on-disconnect [--leader-socket PATH]`
 * Does not wait for exit. Caller should re-probe after a short wait.
 * Does not kill the leader on bridge exit (unref only).
 * Listens briefly for child `error` so a missing binary returns `{ ok: false }`.
 */
export declare function defaultEnsureLeader(args: {
    bin: string;
    socket: string;
    spawnFn?: LeaderSpawnFn;
    env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
}): Promise<{
    ok: true;
} | {
    ok: false;
    message: string;
}>;
/**
 * Decide leader CLI flags and meta for one tool invocation.
 * Never throws.
 */
export declare function prepareLeader(config: GrokodexConfig, useLeaderOverride: boolean | undefined, deps?: LeaderDeps): Promise<PrepareLeaderResult>;
/**
 * After a leader-path run failure, decide whether to retry as one-shot.
 * Pure helper for tools.
 */
export declare function shouldFallbackAfterLeaderRun(meta: LeaderMeta, config: GrokodexConfig): boolean;
export declare function markLeaderRunFallback(meta: LeaderMeta): LeaderMeta;
