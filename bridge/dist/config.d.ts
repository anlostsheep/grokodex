import type { PermissionMode } from "./types.js";
export interface GrokodexConfig {
    /** Explicit path from GROK_PATH, if set. */
    grok_path?: string;
    default_permission: PermissionMode;
    allow_inherit: boolean;
    allow_full_access_inherit: boolean;
    /** Leader-backed headless (default true). Set GROKODEX_USE_LEADER=0 to disable. */
    use_leader: boolean;
    /** Custom leader socket; empty = Grok default. */
    leader_socket?: string;
    /** Use grokodex-dedicated socket under ~/.grok */
    leader_isolate: boolean;
    /** Fall back to one-shot when leader path fails. */
    leader_fallback: boolean;
    /** Spawn leader when socket unhealthy. */
    leader_ensure: boolean;
    /** grok_x_search --max-turns (default 5). */
    x_search_max_turns: number;
    /** grok_imagine --max-turns (default 4). */
    imagine_max_turns: number;
    /** grok_x_search --tools CSV (default x_search). */
    x_search_tools: string;
    /** grok_imagine --tools CSV (default image_gen). */
    imagine_tools: string;
    /** Default timeout for grok_x_search when timeout_ms omitted. */
    x_search_timeout_ms: number;
    /** Default timeout for grok_imagine when timeout_ms omitted. */
    imagine_timeout_ms: number;
    /**
     * When true, narrow tools never silently fall back to a wide 30-turn path.
     * Default true (reserved for future failure handling; short path always on).
     */
    narrow_tools_strict: boolean;
    /** When true, host_thread_id map may --resume (default true). */
    session_reuse: boolean;
    /** When true, failed --resume retries without resume (default true). */
    session_resume_fallback: boolean;
}
/**
 * Load bridge config from environment variables.
 * Defaults: permission=restricted, allow_inherit=true, allow_full_access_inherit=true,
 * use_leader=true, leader_fallback=true, leader_ensure=true, leader_isolate=false,
 * narrow x_search turns=5 / imagine=4, timeouts 90s / 120s.
 */
export declare function loadConfig(env?: NodeJS.ProcessEnv | Record<string, string | undefined>): GrokodexConfig;
