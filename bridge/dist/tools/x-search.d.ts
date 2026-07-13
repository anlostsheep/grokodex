import { resolveGrokBinary, type WhichFn } from "../grok-bin.js";
import { resolvePermissionForXSearch } from "../permission.js";
import { runGrok } from "../runner.js";
import type { ToolEnvelope } from "../types.js";
export type XSearchMode = "semantic" | "keyword";
export interface XSearchResultItem {
    author: string;
    time: string;
    summary: string;
    url_or_id: string;
}
export interface GrokXSearchArgs {
    query: string;
    mode?: XSearchMode;
    limit?: number;
    from_date?: string;
    to_date?: string;
    usernames?: string[];
    cwd?: string;
    timeout_ms?: number;
    model?: string;
}
export interface GrokXSearchDeps {
    resolveBin: typeof resolveGrokBinary;
    /** Defaults to resolvePermissionForXSearch; injectable for tests. */
    resolvePermXSearch?: typeof resolvePermissionForXSearch;
    run: typeof runGrok;
    env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
    existsSync?: (p: string) => boolean;
    whichFn?: WhichFn;
    /** Injectable process.cwd */
    getCwd?: () => string;
}
/**
 * Constrained headless prompt: X/Twitter search only, no repo edits.
 * Exported for unit tests of prompt assembly.
 */
export declare function buildXSearchPrompt(opts: {
    query: string;
    mode: XSearchMode;
    limit: number;
    fromDate?: string;
    toDate?: string;
    usernames?: string[];
}): string;
/**
 * Try to extract a results array from free text / Grok JSON envelope text.
 * Accepts top-level arrays, fenced ```json blocks, or nested under common keys.
 * Exported for unit tests.
 */
export declare function extractXSearchResults(text: string, limit: number): XSearchResultItem[] | null;
/**
 * Run a constrained headless Grok X/Twitter search task.
 * Always uses restricted + disallowed-edit CLI (never full shell inherit).
 * Never throws; all failures are envelope errors.
 */
export declare function handleGrokXSearch(args: GrokXSearchArgs, deps: GrokXSearchDeps): Promise<ToolEnvelope>;
