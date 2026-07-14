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

function setFlag(args: string[], flag: string, value: string): void {
  const idx = args.indexOf(flag);
  if (idx >= 0 && idx + 1 < args.length) {
    args[idx + 1] = value;
  } else {
    args.push(flag, value);
  }
}

/** Split CSV tools into trimmed non-empty parts (for meta). */
export function parseToolsAllowlist(csv: string): string[] {
  return csv
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Overlay base permission cliArgs with narrow max-turns, --tools, and Agent deny.
 * Preserves existing deny rules and --output-format.
 */
export function applyNarrowCliArgs(
  baseCliArgs: readonly string[],
  opts: NarrowCliOptions,
): string[] {
  const args = [...baseCliArgs];
  const turns = Math.max(1, Math.floor(opts.maxTurns));
  setFlag(args, "--max-turns", String(turns));

  const tools = opts.toolsCsv.trim() || "x_search";
  setFlag(args, "--tools", tools);

  if (opts.disallowAgent !== false) {
    const idx = args.indexOf("--disallowed-tools");
    if (idx >= 0 && idx + 1 < args.length) {
      const parts = parseToolsAllowlist(String(args[idx + 1]));
      if (!parts.includes("Agent")) parts.push("Agent");
      args[idx + 1] = parts.join(",");
    } else {
      args.push("--disallowed-tools", "Agent");
    }
  }

  return args;
}
