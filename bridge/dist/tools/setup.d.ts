import { type AuthCheckResult, type RunCmd } from "../auth-check.js";
import { type GrokodexConfig } from "../config.js";
import { type ResolveGrokResult, type WhichFn } from "../grok-bin.js";
import { type EnsureFn, type ProbeFn } from "../leader.js";
import type { ToolEnvelope } from "../types.js";
export interface SetupArgs {
    /** Reserved for future auto-fix hints; currently ignored. */
    fix?: boolean;
    /**
     * If true, try to start local grok leader when socket is down.
     * Default false — setup is read-only by default.
     */
    ensure?: boolean;
}
export interface SetupLeaderStatus {
    socket: string;
    alive: boolean;
    pid: number | null;
    grokodex_use_leader: boolean;
    grokodex_leader_fallback: boolean;
    hint: string;
}
export interface SetupDeps {
    env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
    resolveBin?: (env: NodeJS.ProcessEnv | Record<string, string | undefined>, pathModule: {
        existsSync: (p: string) => boolean;
    }, whichFn: WhichFn) => ResolveGrokResult | Promise<ResolveGrokResult>;
    checkAuth?: (bin: string, runCmd: RunCmd) => AuthCheckResult | Promise<AuthCheckResult>;
    existsSync?: (p: string) => boolean;
    whichFn?: WhichFn;
    runCmd?: RunCmd;
    /** Injected config (defaults to loadConfig(env)). */
    config?: GrokodexConfig;
    /** Probe leader socket health (defaults to defaultProbeLeader). */
    probeLeader?: ProbeFn;
    /** Spawn/ensure leader (defaults to defaultEnsureLeader). */
    ensureLeader?: EnsureFn;
    /** Wait after ensure before re-probe (ms). */
    ensureWaitMs?: number;
    sleep?: (ms: number) => Promise<void>;
}
/**
 * Diagnostic tool: locate grok, report version and login health, plus leader status.
 * Never throws; never prints secrets from auth.json.
 * By default does not spawn leader; pass ensure=true to try starting it when dead.
 */
export declare function handleSetup(args?: SetupArgs | Record<string, unknown>, deps?: SetupDeps): Promise<ToolEnvelope>;
