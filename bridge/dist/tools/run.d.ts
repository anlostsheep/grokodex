import type { GrokodexConfig } from "../config.js";
import { resolveGrokBinary, type WhichFn } from "../grok-bin.js";
import { resolvePermission } from "../permission.js";
import { runGrok } from "../runner.js";
import type { CodexApproval, CodexSandbox, PermissionMode, ToolEnvelope } from "../types.js";
export interface GrokRunArgs {
    prompt: string;
    cwd?: string;
    permission_mode?: PermissionMode;
    codex_sandbox?: CodexSandbox;
    codex_approval?: CodexApproval;
    model?: string;
    max_turns?: number;
    timeout_ms?: number;
    extra_rules?: string;
}
export interface GrokRunDeps {
    resolveBin: typeof resolveGrokBinary;
    resolvePerm: typeof resolvePermission;
    run: typeof runGrok;
    config: GrokodexConfig;
    /** Injectable env for bin resolution (defaults to process.env). */
    env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
    existsSync?: (p: string) => boolean;
    whichFn?: WhichFn;
}
/**
 * Replace or append `--max-turns <n>` in CLI args from permission module.
 */
export declare function applyMaxTurns(cliArgs: string[], maxTurns?: number): string[];
/**
 * Run a headless Grok task via the local CLI and wrap the result in a ToolEnvelope.
 * Never throws; all failures are envelope errors.
 */
export declare function handleGrokRun(args: GrokRunArgs, deps: GrokRunDeps): Promise<ToolEnvelope>;
