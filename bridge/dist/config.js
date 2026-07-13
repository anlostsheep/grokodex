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
/**
 * Load bridge config from environment variables.
 * Defaults: permission=restricted, allow_inherit=true, allow_full_access_inherit=true.
 */
export function loadConfig(env = process.env) {
    const grokPath = env.GROK_PATH?.trim();
    return {
        grok_path: grokPath || undefined,
        default_permission: parsePermission(env.GROKODEX_DEFAULT_PERMISSION),
        allow_inherit: parseBool(env.GROKODEX_ALLOW_INHERIT, true),
        allow_full_access_inherit: parseBool(env.GROKODEX_ALLOW_FULL_ACCESS_INHERIT, true),
    };
}
//# sourceMappingURL=config.js.map