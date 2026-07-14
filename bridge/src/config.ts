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

/**
 * Load bridge config from environment variables.
 * Defaults: permission=restricted, allow_inherit=true, allow_full_access_inherit=true,
 * use_leader=false, leader_fallback=true, leader_ensure=true, leader_isolate=false.
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
    use_leader: parseBool(env.GROKODEX_USE_LEADER, false),
    leader_socket: leaderSocket || undefined,
    leader_isolate: parseBool(env.GROKODEX_LEADER_ISOLATE, false),
    leader_fallback: parseBool(env.GROKODEX_LEADER_FALLBACK, true),
    leader_ensure: parseBool(env.GROKODEX_LEADER_ENSURE, true),
  };
}
