import { describe, it, expect, vi } from "vitest";
import {
  buildXSearchPrompt,
  extractXSearchResults,
  handleGrokXSearch,
} from "../src/tools/x-search.js";
import type { GrokodexConfig } from "../src/config.js";
import type { PrepareLeaderResult } from "../src/leader.js";
import type { ResolvedPermission } from "../src/permission.js";
import type { RunGrokResult } from "../src/runner.js";
import type { ResolveGrokResult } from "../src/grok-bin.js";

const baseConfig: GrokodexConfig = {
  default_permission: "restricted",
  allow_inherit: true,
  allow_full_access_inherit: true,
  use_leader: false,
  leader_isolate: false,
  leader_fallback: true,
  leader_ensure: true,
};

const xSearchPerm: ResolvedPermission = {
  ok: true,
  audit: {
    requested: "restricted",
    effective: "restricted-x-search",
    codex_sandbox: null,
    source: "default",
    notes: [
      "X search never inherits full shell; edit/write tools disallowed; search-only via prompt.",
    ],
  },
  cliArgs: [
    "--output-format",
    "json",
    "--max-turns",
    "30",
    "--disallowed-tools",
    "Write,Edit,MultiEdit,NotebookEdit",
    "--deny",
    "Bash(sudo*)",
  ],
};

const leaderOff: PrepareLeaderResult = {
  cli: { use: false, socket: null },
  meta: {
    requested: false,
    used: false,
    mode: "off",
    socket: null,
    ensured: false,
    fallback: false,
    fallback_reason: null,
  },
};

const leaderUsed: PrepareLeaderResult = {
  cli: { use: true, socket: "/tmp/l.sock" },
  meta: {
    requested: true,
    used: true,
    mode: "shared",
    socket: "/tmp/l.sock",
    ensured: false,
    fallback: false,
    fallback_reason: null,
  },
};

function mockDeps(overrides: {
  resolveBin?: () => ResolveGrokResult | Promise<ResolveGrokResult>;
  resolvePermXSearch?: () => ResolvedPermission;
  run?: () => RunGrokResult | Promise<RunGrokResult>;
  getCwd?: () => string;
  config?: GrokodexConfig;
  prepareLeader?: (
    ...args: Parameters<
      NonNullable<
        import("../src/tools/x-search.js").GrokXSearchDeps["prepareLeader"]
      >
    >
  ) => PrepareLeaderResult | Promise<PrepareLeaderResult>;
} = {}) {
  return {
    resolveBin: vi.fn(
      overrides.resolveBin ??
        (async () => ({ path: "/opt/grok" }) as ResolveGrokResult),
    ),
    resolvePermXSearch: vi.fn(
      overrides.resolvePermXSearch ?? (() => xSearchPerm),
    ),
    run: vi.fn(
      overrides.run ??
        (async () =>
          ({
            code: 0,
            stdout: JSON.stringify({
              text: JSON.stringify([
                {
                  author: "@elonmusk",
                  time: "2026-07-01T12:00:00Z",
                  summary: "Something about Mars",
                  url_or_id: "https://x.com/elonmusk/status/1",
                },
              ]),
              session_id: "x-sess-1",
            }),
            stderr: "",
            timedOut: false,
            durationMs: 50,
          }) satisfies RunGrokResult),
    ),
    getCwd: overrides.getCwd ?? (() => "/tmp/work"),
    config: overrides.config ?? baseConfig,
    prepareLeader: vi.fn(
      overrides.prepareLeader ?? (async () => leaderOff),
    ),
  };
}

describe("buildXSearchPrompt", () => {
  it("includes ONLY X search, mode, limit, query, and no-edit rules", () => {
    const p = buildXSearchPrompt({
      query: "AI agents",
      mode: "semantic",
      limit: 5,
    });
    expect(p).toMatch(/ONLY use X\/Twitter search/i);
    expect(p).toContain("Search mode: semantic");
    expect(p).toContain("Return at most 5 results");
    expect(p).toContain("AI agents");
    expect(p).toMatch(/Do not edit source code/i);
    expect(p).toContain("url_or_id");
    expect(p).not.toMatch(/inherit|full.?access|always-approve/i);
  });

  it("includes dates and usernames when provided", () => {
    const p = buildXSearchPrompt({
      query: "launch",
      mode: "keyword",
      limit: 3,
      fromDate: "2026-01-01",
      toDate: "2026-06-30",
      usernames: ["xai", "OpenAI"],
    });
    expect(p).toContain("Search mode: keyword");
    expect(p).toContain("From date (inclusive): 2026-01-01");
    expect(p).toContain("To date (inclusive): 2026-06-30");
    expect(p).toContain("Limit to these usernames: xai, OpenAI");
  });
});

describe("extractXSearchResults", () => {
  it("parses a top-level JSON array", () => {
    const items = extractXSearchResults(
      JSON.stringify([
        {
          author: "a",
          time: "t",
          summary: "s",
          url_or_id: "u",
        },
      ]),
      5,
    );
    expect(items).toEqual([
      { author: "a", time: "t", summary: "s", url_or_id: "u" },
    ]);
  });

  it("parses fenced json blocks and caps at limit", () => {
    const body = [
      "Here are results:",
      "```json",
      JSON.stringify([
        { author: "1", time: "", summary: "one", url_or_id: "id1" },
        { author: "2", time: "", summary: "two", url_or_id: "id2" },
        { author: "3", time: "", summary: "three", url_or_id: "id3" },
      ]),
      "```",
    ].join("\n");
    const items = extractXSearchResults(body, 2);
    expect(items).toHaveLength(2);
    expect(items![0]!.author).toBe("1");
    expect(items![1]!.author).toBe("2");
  });

  it("returns null when no array found", () => {
    expect(extractXSearchResults("no posts here", 5)).toBeNull();
  });
});

describe("handleGrokXSearch", () => {
  it("returns INVALID_ARGS when query is missing or empty", async () => {
    const deps = mockDeps();
    const empty = await handleGrokXSearch({ query: "" }, deps);
    expect(empty.ok).toBe(false);
    if (!empty.ok) {
      expect(empty.error.code).toBe("INVALID_ARGS");
      expect(empty.tool).toBe("grok_x_search");
    }

    const whitespace = await handleGrokXSearch({ query: "   " }, deps);
    expect(whitespace.ok).toBe(false);
    if (!whitespace.ok) {
      expect(whitespace.error.code).toBe("INVALID_ARGS");
    }

    expect(deps.resolveBin).not.toHaveBeenCalled();
    expect(deps.run).not.toHaveBeenCalled();
  });

  it("assembles constrained prompt with mode/limit defaults and disallowed tools", async () => {
    const deps = mockDeps();
    await handleGrokXSearch({ query: "grok updates" }, deps);

    expect(deps.resolvePermXSearch).toHaveBeenCalledOnce();
    expect(deps.run).toHaveBeenCalledOnce();
    const runReq = deps.run.mock.calls[0]![0];
    expect(runReq.bin).toBe("/opt/grok");
    expect(runReq.cwd).toBe("/tmp/work");
    expect(runReq.timeoutMs).toBe(180_000);
    expect(runReq.args).toContain("--output-format");
    expect(runReq.args).toContain("--disallowed-tools");
    expect(runReq.args).toContain("--deny");
    expect(runReq.args).not.toContain("--always-approve");

    const pIdx = runReq.args.indexOf("-p");
    expect(pIdx).toBeGreaterThanOrEqual(0);
    const fullPrompt = runReq.args[pIdx + 1] as string;
    expect(fullPrompt).toMatch(/ONLY use X\/Twitter search/i);
    expect(fullPrompt).toContain("Search mode: semantic");
    expect(fullPrompt).toContain("Return at most 5 results");
    expect(fullPrompt).toContain("grok updates");
  });

  it("passes keyword mode, limit, dates, usernames into prompt", async () => {
    const deps = mockDeps();
    await handleGrokXSearch(
      {
        query: "launch",
        mode: "keyword",
        limit: 3,
        from_date: "2026-01-01",
        to_date: "2026-03-01",
        usernames: ["xai"],
      },
      deps,
    );

    const runReq = deps.run.mock.calls[0]![0];
    const fullPrompt = runReq.args[runReq.args.indexOf("-p") + 1] as string;
    expect(fullPrompt).toContain("Search mode: keyword");
    expect(fullPrompt).toContain("Return at most 3 results");
    expect(fullPrompt).toContain("From date (inclusive): 2026-01-01");
    expect(fullPrompt).toContain("To date (inclusive): 2026-03-01");
    expect(fullPrompt).toContain("Limit to these usernames: xai");
  });

  it("returns structured results from Grok text", async () => {
    const deps = mockDeps();
    const env = await handleGrokXSearch({ query: "mars" }, deps);

    expect(env.ok).toBe(true);
    if (env.ok) {
      expect(env.tool).toBe("grok_x_search");
      expect(env.results).toEqual([
        {
          author: "@elonmusk",
          time: "2026-07-01T12:00:00Z",
          summary: "Something about Mars",
          url_or_id: "https://x.com/elonmusk/status/1",
        },
      ]);
      expect(env.session_id).toBe("x-sess-1");
      expect(env.permission_mode).toBe("restricted");
      expect(env.permission?.effective).toBe("restricted-x-search");
      expect(env.meta?.mode).toBe("semantic");
      expect(env.meta?.limit).toBe(5);
    }
  });

  it("ok with text and notes when exit 0 but no parseable results", async () => {
    const deps = mockDeps({
      run: async () => ({
        code: 0,
        stdout: JSON.stringify({
          text: "I searched X but could not format results.",
        }),
        stderr: "",
        timedOut: false,
        durationMs: 10,
      }),
    });

    const env = await handleGrokXSearch({ query: "noise" }, deps);
    expect(env.ok).toBe(true);
    if (env.ok) {
      expect(env.results).toBeUndefined();
      expect(
        env.permission?.notes.some((n) => /could not parse/i.test(n)),
      ).toBe(true);
      expect(env.text).toMatch(/could not format/i);
    }
  });

  it("returns GROK_NOT_FOUND when binary is missing", async () => {
    const deps = mockDeps({
      resolveBin: async () => ({
        error: "GROK_NOT_FOUND",
        message: "grok binary not found on PATH",
      }),
    });

    const env = await handleGrokXSearch({ query: "hi" }, deps);
    expect(env.ok).toBe(false);
    if (!env.ok) {
      expect(env.error.code).toBe("GROK_NOT_FOUND");
    }
    expect(deps.run).not.toHaveBeenCalled();
  });

  it("returns TIMEOUT when run times out", async () => {
    const deps = mockDeps({
      run: async () => ({
        code: null,
        stdout: "",
        stderr: "killed",
        timedOut: true,
        durationMs: 100,
      }),
    });

    const env = await handleGrokXSearch({ query: "slow" }, deps);
    expect(env.ok).toBe(false);
    if (!env.ok) {
      expect(env.error.code).toBe("TIMEOUT");
      expect(env.tool).toBe("grok_x_search");
    }
  });

  it("injects --leader when prepareLeader says use", async () => {
    const deps = mockDeps({
      config: {
        ...baseConfig,
        use_leader: true,
        leader_ensure: false,
      },
      prepareLeader: async () => leaderUsed,
    });
    const env = await handleGrokXSearch(
      { query: "mars", use_leader: true },
      deps,
    );
    expect(env.ok).toBe(true);
    const runReq = deps.run.mock.calls[0]![0];
    expect(runReq.args).toContain("--leader");
    expect(runReq.args).toContain("--leader-socket");
    expect(runReq.args).toContain("/tmp/l.sock");
    if (env.ok) {
      expect(env.meta?.leader).toMatchObject({ used: true, requested: true });
    }
  });
});
