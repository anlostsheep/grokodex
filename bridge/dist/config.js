function parseBool(value, defaultValue) {
    if (value === undefined || value === "")
        return defaultValue;
    const v = value.trim().toLowerCase();
    if (["true", "1", "yes"].includes(v))
        return true;
    if (["false", "0", "no"].includes(v))
        return false;
    return defaultValue;
}
function parsePermission(value) {
    if (value === "restricted" || value === "inherit")
        return value;
    return "restricted";
}
function parsePositiveInt(value, defaultValue) {
    if (value === undefined || value.trim() === "")
        return defaultValue;
    const n = Number(value.trim());
    if (!Number.isFinite(n) || n < 1)
        return defaultValue;
    return Math.floor(n);
}
function parseToolsCsv(value, defaultValue) {
    const t = value?.trim();
    if (!t)
        return defaultValue;
    return t;
}
/**
 * Load bridge config from environment variables.
 * Defaults: permission=restricted, allow_inherit=true, allow_full_access_inherit=true,
 * use_leader=true, leader_fallback=true, leader_ensure=true, leader_isolate=false,
 * narrow x_search turns=5 / imagine=4, timeouts 90s / 120s.
 */
export function loadConfig(env = process.env) {
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
    };
}
//# sourceMappingURL=config.js.map