import type { PermissionMode } from "./types.js";
export interface GrokodexConfig {
    /** Explicit path from GROK_PATH, if set. */
    grok_path?: string;
    default_permission: PermissionMode;
    allow_inherit: boolean;
    allow_full_access_inherit: boolean;
}
/**
 * Load bridge config from environment variables.
 * Defaults: permission=restricted, allow_inherit=true, allow_full_access_inherit=true.
 */
export declare function loadConfig(env?: NodeJS.ProcessEnv | Record<string, string | undefined>): GrokodexConfig;
