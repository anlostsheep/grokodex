import { type ChildProcess, type SpawnOptions } from "node:child_process";
export interface RunGrokRequest {
    bin: string;
    /** Full argv after bin; must include -p / --single for headless use. */
    args: string[];
    cwd: string;
    timeoutMs: number;
    env?: Record<string, string>;
}
export interface RunGrokResult {
    code: number | null;
    stdout: string;
    stderr: string;
    timedOut: boolean;
    durationMs: number;
}
export type SpawnFn = (command: string, args: readonly string[], options: SpawnOptions) => ChildProcess;
export interface RunGrokDeps {
    spawn?: SpawnFn;
    /** Delay after SIGTERM before SIGKILL (ms). */
    killGraceMs?: number;
    now?: () => number;
}
/** @internal Reset serial queue between unit tests. */
export declare function resetRunGrokQueueForTests(): void;
/**
 * Run a single grok process under the global serial mutex.
 * Concurrent callers queue; the next spawn starts only after the previous child closes.
 */
export declare function runGrok(req: RunGrokRequest, deps?: RunGrokDeps): Promise<RunGrokResult>;
export interface ParsedGrokJson {
    text?: string;
    sessionId?: string;
    raw: unknown;
}
/**
 * Parse grok `--output-format json` stdout.
 * Accepts a bare object, last non-empty JSON line, or last brace-balanced object
 * embedded in log noise. Returns null when no object can be recovered.
 */
export declare function parseGrokJsonOutput(stdout: string): ParsedGrokJson | null;
