import type { GrokodexConfig } from "../config.js";
import { resolveGrokBinary, type WhichFn } from "../grok-bin.js";
import { prepareLeader } from "../leader.js";
import { resolvePermission } from "../permission.js";
import { runGrok } from "../runner.js";
import type { CodexApproval, HostSandbox, PermissionMode, ToolEnvelope } from "../types.js";
export interface GrokRunArgs {
    prompt: string;
    cwd?: string;
    permission_mode?: PermissionMode;
    /** Canonical host capability band when permission_mode=inherit. */
    host_sandbox?: HostSandbox;
    /** Compat alias of host_sandbox. */
    codex_sandbox?: HostSandbox;
    host_approval?: CodexApproval;
    codex_approval?: CodexApproval;
    model?: string;
    max_turns?: number;
    timeout_ms?: number;
    extra_rules?: string;
    /** Per-call override for GROKODEX_USE_LEADER. */
    use_leader?: boolean;
}
/**
 * Merge GROKODEX_HOST_SANDBOX + GROKODEX_CODEX_SANDBOX env signals.
 * Both set and unequal → conflict.
 */
export declare function parseSandboxEnv(env: NodeJS.ProcessEnv | Record<string, string | undefined>): {
    ok: true;
    sandbox: HostSandbox | null;
} | {
    ok: false;
    message: string;
    hint: string;
};
export interface GrokRunDeps {
    resolveBin: typeof resolveGrokBinary;
    resolvePerm: typeof resolvePermission;
    run: typeof runGrok;
    config: GrokodexConfig;
    /** Injectable env for bin resolution (defaults to process.env). */
    env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
    existsSync?: (p: string) => boolean;
    whichFn?: WhichFn;
    prepareLeader?: typeof prepareLeader;
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
