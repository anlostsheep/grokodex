import type { ErrorCode } from "./types.js";

export type ResolveGrokOk = { path: string };
export type ResolveGrokErr = { error: ErrorCode; message: string };
export type ResolveGrokResult = ResolveGrokOk | ResolveGrokErr;

export interface PathExists {
  existsSync: (path: string) => boolean;
}

/** Find a binary by name (typically "grok"). May be sync or async. */
export type WhichFn = (name?: string) => string | null | Promise<string | null>;

/**
 * Resolve the local `grok` binary.
 * Order: GROK_PATH (if set) → whichFn / PATH lookup.
 */
export async function resolveGrokBinary(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
  pathModule: PathExists,
  whichFn: WhichFn,
): Promise<ResolveGrokResult> {
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
export function findInPath(
  name: string,
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
  existsSync: (p: string) => boolean,
  pathJoin: (...parts: string[]) => string,
  pathDelimiter: string = process.platform === "win32" ? ";" : ":",
  platform: NodeJS.Platform = process.platform,
): string | null {
  const pathEnv = env.PATH ?? env.Path ?? "";
  for (const dir of pathEnv.split(pathDelimiter)) {
    if (!dir) continue;
    const candidate = pathJoin(dir, name);
    if (existsSync(candidate)) return candidate;
    if (platform === "win32") {
      const withExe = candidate.endsWith(".exe") ? candidate : `${candidate}.exe`;
      if (existsSync(withExe)) return withExe;
    }
  }
  return null;
}
