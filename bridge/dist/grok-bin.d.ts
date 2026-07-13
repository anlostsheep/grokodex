import type { ErrorCode } from "./types.js";
export type ResolveGrokOk = {
    path: string;
};
export type ResolveGrokErr = {
    error: ErrorCode;
    message: string;
};
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
export declare function resolveGrokBinary(env: NodeJS.ProcessEnv | Record<string, string | undefined>, pathModule: PathExists, whichFn: WhichFn): Promise<ResolveGrokResult>;
/**
 * Scan PATH for an executable named `name`. Suitable default for `whichFn`.
 */
export declare function findInPath(name: string, env: (NodeJS.ProcessEnv | Record<string, string | undefined>) | undefined, existsSync: (p: string) => boolean, pathJoin: (...parts: string[]) => string, pathDelimiter?: string, platform?: NodeJS.Platform): string | null;
