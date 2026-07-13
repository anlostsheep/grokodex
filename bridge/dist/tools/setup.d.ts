import { type AuthCheckResult, type RunCmd } from "../auth-check.js";
import { type ResolveGrokResult, type WhichFn } from "../grok-bin.js";
import type { ToolEnvelope } from "../types.js";
export interface SetupDeps {
    env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
    resolveBin?: (env: NodeJS.ProcessEnv | Record<string, string | undefined>, pathModule: {
        existsSync: (p: string) => boolean;
    }, whichFn: WhichFn) => ResolveGrokResult | Promise<ResolveGrokResult>;
    checkAuth?: (bin: string, runCmd: RunCmd) => AuthCheckResult | Promise<AuthCheckResult>;
    existsSync?: (p: string) => boolean;
    whichFn?: WhichFn;
    runCmd?: RunCmd;
}
/**
 * Diagnostic tool: locate grok, report version and login health.
 * Never throws; never prints secrets from auth.json.
 */
export declare function handleSetup(_args?: Record<string, unknown>, deps?: SetupDeps): Promise<ToolEnvelope>;
