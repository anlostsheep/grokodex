import type { PermissionMode } from "./types.js";
export interface GrokodexConfig {
    /** Explicit path from GROK_PATH, if set. */
    grok_path?: string;
    default_permission: PermissionMode;
    allow_inherit: boolean;
    allow_full_access_inherit: boolean;
    /** Opt-in leader-backed headless (default false). */
    use_leader: boolean;
    /** Custom leader socket; empty = Grok default. */
    leader_socket?: string;
    /** Use grokodex-dedicated socket under ~/.grok */
    leader_isolate: boolean;
    /** Fall back to one-shot when leader path fails. */
    leader_fallback: boolean;
    /** Spawn leader when socket unhealthy. */
    leader_ensure: boolean;
}
/**
 * Load bridge config from environment variables.
 * Defaults: permission=restricted, allow_inherit=true, allow_full_access_inherit=true,
 * use_leader=false, leader_fallback=true, leader_ensure=true, leader_isolate=false.
 */
export declare function loadConfig(env?: NodeJS.ProcessEnv | Record<string, string | undefined>): GrokodexConfig;
