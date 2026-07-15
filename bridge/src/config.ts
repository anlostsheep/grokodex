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

function parseBool(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value === "") return defaultValue;
  const v = value.trim().toLowerCase();
  if (["true", "1", "yes"].includes(v)) return true;
  if (["false", "0", "no"].includes(v)) return false;
  return defaultValue;
}

function parsePermission(value: string | undefined): PermissionMode {
  if (value === "restricted" || value === "inherit") return value;
  return "restricted";
}

function parsePositiveInt(
  value: string | undefined,
  defaultValue: number,
): number {
  if (value === undefined || value.trim() === "") return defaultValue;
  const n = Number(value.trim());
  if (!Number.isFinite(n) || n < 1) return defaultValue;
  return Math.floor(n);
}

function parseToolsCsv(value: string | undefined, defaultValue: string): string {
  const t = value?.trim();
  if (!t) return defaultValue;
  return t;
}

/**
 * Load bridge config from environment variables.
 * Defaults: permission=restricted, allow_inherit=true, allow_full_access_inherit=true,
 * use_leader=true, leader_fallback=true, leader_ensure=true, leader_isolate=false,
 * narrow x_search turns=5 / imagine=4, timeouts 90s / 120s.
 */
export function loadConfig(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): GrokodexConfig {
  const grokPath = env.GROK_PATH?.trim();
  const leaderSocket = env.GROKODEX_LEADER_SOCKET?.trim();
  return {
    grok_path: grokPath || undefined,
    default_permission: parsePermission(env.GROKODEX_DEFAULT_PERMISSION),
    allow_inherit: parseBool(env.GROKODEX_ALLOW_INHERIT, true),
    allow_full_access_inherit: parseBool(env.GROKODEX_ALLOW_FULL_ACCESS_INHERIT, true),
    use_leader: parseBool(env.GROKODEX_USE_LEADER, true),
    leader_socket: leaderSocket || undefined,
    leader_isolate: parseBool(env.GROKODEX_LEADER_ISOLATE, false),
    leader_fallback: parseBool(env.GROKODEX_LEADER_FALLBACK, true),
    leader_ensure: parseBool(env.GROKODEX_LEADER_ENSURE, true),
    x_search_max_turns: parsePositiveInt(env.GROKODEX_X_SEARCH_MAX_TURNS, 5),
    imagine_max_turns: parsePositiveInt(env.GROKODEX_IMAGINE_MAX_TURNS, 4),
    x_search_tools: parseToolsCsv(env.GROKODEX_X_SEARCH_TOOLS, "x_search"),
    imagine_tools: parseToolsCsv(env.GROKODEX_IMAGINE_TOOLS, "image_gen"),
    x_search_timeout_ms: parsePositiveInt(env.GROKODEX_X_SEARCH_TIMEOUT_MS, 90_000),
    imagine_timeout_ms: parsePositiveInt(env.GROKODEX_IMAGINE_TIMEOUT_MS, 120_000),
    narrow_tools_strict: parseBool(env.GROKODEX_NARROW_TOOLS_STRICT, true),
    session_reuse: parseBool(env.GROKODEX_SESSION_REUSE, true),
    session_resume_fallback: parseBool(env.GROKODEX_SESSION_RESUME_FALLBACK, true),
  };
}
