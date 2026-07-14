import { type ChildProcess, type SpawnOptions } from "node:child_process";
import type { GrokodexConfig } from "./config.js";
import type { ErrorCode, LeaderMeta, LeaderMode } from "./types.js";
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
    /** Wait after spawn before re-probe (ms). */
    ensureWaitMs?: number;
    sleep?: (ms: number) => Promise<void>;
}
export declare function defaultLeaderSocketPath(env: NodeJS.ProcessEnv | Record<string, string | undefined>, isolate: boolean): string;
/**
 * Resolve whether leader is requested and which socket/mode to use.
 * `useLeaderOverride`: undefined → config; true/false → force.
 */
export declare function resolveLeaderPlan(config: GrokodexConfig, useLeaderOverride: boolean | undefined, env?: NodeJS.ProcessEnv | Record<string, string | undefined>): LeaderPlan;
export declare function applyLeaderCliFlags(args: string[], choice: LeaderCliChoice): string[];
/** Default probe: socket path exists (Unix domain socket file present). */
export declare function defaultProbeLeader(socket: string, exists?: (p: string) => boolean): Promise<LeaderProbeResult>;
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
