/**
 * Resolve the local `grok` binary.
 * Order: GROK_PATH (if set) → whichFn / PATH lookup.
 */
export async function resolveGrokBinary(env, pathModule, whichFn) {
    const explicit = env.GROK_PATH?.trim();
    if (explicit) {
        if (pathModule.existsSync(explicit)) {
            return { path: explicit };
        }
        return {
            error: "GROK_NOT_FOUND",
            message: `GROK_PATH is set to "${explicit}" but that path does not exist`,
        };
    }
    const found = await Promise.resolve(whichFn("grok"));
    if (found && pathModule.existsSync(found)) {
        return { path: found };
    }
    if (found) {
        // which returned a path that no longer exists
        return {
            error: "GROK_NOT_FOUND",
            message: `grok resolved to "${found}" but that path does not exist`,
        };
    }
    return {
        error: "GROK_NOT_FOUND",
        message: "grok binary not found on PATH; install Grok CLI or set GROK_PATH",
    };
}
/**
 * Scan PATH for an executable named `name`. Suitable default for `whichFn`.
 */
export function findInPath(name, env = process.env, existsSync, pathJoin, pathDelimiter = process.platform === "win32" ? ";" : ":", platform = process.platform) {
    const pathEnv = env.PATH ?? env.Path ?? "";
    for (const dir of pathEnv.split(pathDelimiter)) {
        if (!dir)
            continue;
        const candidate = pathJoin(dir, name);
        if (existsSync(candidate))
            return candidate;
        if (platform === "win32") {
            const withExe = candidate.endsWith(".exe") ? candidate : `${candidate}.exe`;
            if (existsSync(withExe))
                return withExe;
        }
    }
    return null;
}
//# sourceMappingURL=grok-bin.js.map