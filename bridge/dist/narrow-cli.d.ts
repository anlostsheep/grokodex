/**
 * Short-path CLI overlays for grok_x_search / grok_imagine.
 * Low max-turns, tool allowlist, Agent disallowed — never widens silently.
 */
export type NarrowToolKind = "x_search" | "imagine";
export interface NarrowCliOptions {
    maxTurns: number;
    toolsCsv: string;
    /** When true (default), ensure Agent is in --disallowed-tools. */
    disallowAgent?: boolean;
}
/** Split CSV tools into trimmed non-empty parts (for meta). */
export declare function parseToolsAllowlist(csv: string): string[];
/**
 * Overlay base permission cliArgs with narrow max-turns, --tools, and Agent deny.
 * Preserves existing deny rules and --output-format.
 */
export declare function applyNarrowCliArgs(baseCliArgs: readonly string[], opts: NarrowCliOptions): string[];
