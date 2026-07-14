import { describe, it, expect, vi } from "vitest";
import { handleGrokRun } from "../src/tools/run.js";
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

const restrictedPerm: ResolvedPermission = {
  ok: true,
  audit: {
    requested: "restricted",
    effective: "restricted",
    host_sandbox: null,
    codex_sandbox: null,
    source: "default",
    notes: ["test restricted"],
  },
  cliArgs: ["--output-format", "json", "--max-turns", "30", "--deny", "Bash(sudo*)"],
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

const leaderEnsureFallback: PrepareLeaderResult = {
  cli: { use: false, socket: "/tmp/l.sock" },
  meta: {
    requested: true,
    used: false,
    mode: "shared",
    socket: "/tmp/l.sock",
    ensured: false,
    fallback: true,
    fallback_reason: "ensure_failed",
  },
};

function mockDeps(overrides: {
  resolveBin?: () => ResolveGrokResult | Promise<ResolveGrokResult>;
  resolvePerm?: () => ResolvedPermission;
  run?:
    | (() => RunGrokResult | Promise<RunGrokResult>)
    | ReturnType<typeof vi.fn>;
  config?: GrokodexConfig;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  prepareLeader?: (
    ...args: Parameters<
      NonNullable<import("../src/tools/run.js").GrokRunDeps["prepareLeader"]>
    >
  ) => PrepareLeaderResult | Promise<PrepareLeaderResult>;
}) {
  return {
    resolveBin: vi.fn(
      overrides.resolveBin ?? (async () => ({ path: "/opt/grok" }) as ResolveGrokResult),
    ),
    resolvePerm: vi.fn(overrides.resolvePerm ?? (() => restrictedPerm)),
    run: vi.fn(
      overrides.run ??
        (async () =>
          ({
            code: 0,
            stdout: JSON.stringify({ text: "hello from grok", session_id: "sess-1" }),
            stderr: "",
            timedOut: false,
            durationMs: 42,
          }) satisfies RunGrokResult),
    ),
    config: overrides.config ?? baseConfig,
    env: overrides.env,
    prepareLeader: vi.fn(
      overrides.prepareLeader ?? (async () => leaderOff),
    ),
  };
}

describe("handleGrokRun", () => {
  it("returns INVALID_ARGS when prompt is missing or empty", async () => {
    const deps = mockDeps({});
    const empty = await handleGrokRun({ prompt: "" }, deps);
    expect(empty.ok).toBe(false);
    if (!empty.ok) {
      expect(empty.error.code).toBe("INVALID_ARGS");
      expect(empty.tool).toBe("grok_run");
    }

    const whitespace = await handleGrokRun({ prompt: "   " }, deps);
    expect(whitespace.ok).toBe(false);
    if (!whitespace.ok) {
      expect(whitespace.error.code).toBe("INVALID_ARGS");
    }

    expect(deps.resolveBin).not.toHaveBeenCalled();
    expect(deps.run).not.toHaveBeenCalled();
  });

  it("returns GROK_NOT_FOUND when binary is missing", async () => {
    const deps = mockDeps({
      resolveBin: async () => ({
        error: "GROK_NOT_FOUND",
        message: "grok binary not found on PATH",
      }),
    });

    const env = await handleGrokRun({ prompt: "hi" }, deps);
    expect(env.ok).toBe(false);
    if (!env.ok) {
      expect(env.error.code).toBe("GROK_NOT_FOUND");
      expect(env.error.message).toMatch(/not found/i);
    }
    expect(deps.run).not.toHaveBeenCalled();
  });

  it("returns INHERIT_UNAVAILABLE when inherit has no sandbox signal", async () => {
    const deps = mockDeps({
      resolvePerm: () => ({
        ok: false,
        audit: {
          requested: "inherit",
          effective: "unavailable",
          host_sandbox: null,
          codex_sandbox: null,
          source: "unavailable",
          notes: ["no sandbox"],
        },
        code: "INHERIT_UNAVAILABLE",
        message: "inherit requested but host sandbox could not be determined",
        hint: "Pass host_sandbox",
      }),
    });

    const env = await handleGrokRun(
      { prompt: "hi", permission_mode: "inherit" },
      deps,
    );

    expect(env.ok).toBe(false);
    if (!env.ok) {
      expect(env.error.code).toBe("INHERIT_UNAVAILABLE");
      expect(env.error.hint).toBeTruthy();
    }
    expect(env.permission?.effective).toBe("unavailable");
    expect(deps.run).not.toHaveBeenCalled();
  });

  it("returns ok envelope with text, session_id, permission audit, duration", async () => {
    const deps = mockDeps({});
    const env = await handleGrokRun({ prompt: "review this" }, deps);

    expect(env.ok).toBe(true);
    if (env.ok) {
      expect(env.tool).toBe("grok_run");
      expect(env.text).toBe("hello from grok");
      expect(env.session_id).toBe("sess-1");
      expect(env.permission_mode).toBe("restricted");
      expect(env.permission?.effective).toBe("restricted");
      expect(env.meta?.duration_ms).toBe(42);
    }

    expect(deps.run).toHaveBeenCalledOnce();
    const runReq = deps.run.mock.calls[0]![0];
    expect(runReq.bin).toBe("/opt/grok");
    expect(runReq.args).toContain("-p");
    expect(runReq.args).toContain("review this");
    expect(runReq.args).toContain("--output-format");
  });

  it("appends extra_rules and model, overrides max_turns", async () => {
    const deps = mockDeps({});
    await handleGrokRun(
      {
        prompt: "base task",
        extra_rules: "no network",
        model: "grok-4",
        max_turns: 5,
      },
      deps,
    );

    const runReq = deps.run.mock.calls[0]![0];
    const pIdx = runReq.args.indexOf("-p");
    expect(pIdx).toBeGreaterThanOrEqual(0);
    const fullPrompt = runReq.args[pIdx + 1] as string;
    expect(fullPrompt).toContain("base task");
    expect(fullPrompt).toContain("## Extra rules");
    expect(fullPrompt).toContain("no network");

    const mIdx = runReq.args.indexOf("-m");
    expect(mIdx).toBeGreaterThanOrEqual(0);
    expect(runReq.args[mIdx + 1]).toBe("grok-4");

    const mtIdx = runReq.args.indexOf("--max-turns");
    expect(mtIdx).toBeGreaterThanOrEqual(0);
    expect(runReq.args[mtIdx + 1]).toBe("5");
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

    const env = await handleGrokRun({ prompt: "slow" }, deps);
    expect(env.ok).toBe(false);
    if (!env.ok) {
      expect(env.error.code).toBe("TIMEOUT");
    }
  });

  it("returns GROK_EXIT_NONZERO with truncated stderr", async () => {
    const long = "e".repeat(3000);
    const deps = mockDeps({
      run: async () => ({
        code: 2,
        stdout: "",
        stderr: long,
        timedOut: false,
        durationMs: 10,
      }),
    });

    const env = await handleGrokRun({ prompt: "fail" }, deps);
    expect(env.ok).toBe(false);
    if (!env.ok) {
      expect(env.error.code).toBe("GROK_EXIT_NONZERO");
      expect(env.error.message.length).toBeLessThanOrEqual(2100);
      expect(env.error.message).toContain("e".repeat(100));
    }
  });

  it("passes permission_mode inherit and codex_sandbox into resolvePerm as host_sandbox", async () => {
    const deps = mockDeps({});
    await handleGrokRun(
      {
        prompt: "x",
        permission_mode: "inherit",
        codex_sandbox: "workspace-write",
        codex_approval: "never",
      },
      deps,
    );

    expect(deps.resolvePerm).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "inherit",
        host_sandbox: "workspace-write",
        codex_approval: "never",
        allow_inherit: true,
        allow_full_access_inherit: true,
      }),
    );
  });

  it("passes host_sandbox into resolvePerm as host_sandbox", async () => {
    const deps = mockDeps({});
    await handleGrokRun(
      {
        prompt: "hi",
        permission_mode: "inherit",
        host_sandbox: "workspace-write",
      },
      deps,
    );
    expect(deps.resolvePerm).toHaveBeenCalledWith(
      expect.objectContaining({
        host_sandbox: "workspace-write",
      }),
    );
  });

  it("conflicting host_sandbox and codex_sandbox → INVALID_ARGS", async () => {
    const deps = mockDeps({});
    const env = await handleGrokRun(
      {
        prompt: "hi",
        permission_mode: "inherit",
        host_sandbox: "read-only",
        codex_sandbox: "workspace-write",
      },
      deps,
    );
    expect(env.ok).toBe(false);
    if (!env.ok) {
      expect(env.error.code).toBe("INVALID_ARGS");
      expect(env.error.message).toMatch(/disagree|conflict/i);
    }
    expect(deps.resolvePerm).not.toHaveBeenCalled();
    expect(deps.run).not.toHaveBeenCalled();
  });

  it("GROKODEX_HOST_SANDBOX and GROKODEX_CODEX_SANDBOX conflict → INVALID_ARGS", async () => {
    const deps = mockDeps({
      env: {
        GROKODEX_HOST_SANDBOX: "read-only",
        GROKODEX_CODEX_SANDBOX: "workspace-write",
      },
    });
    const env = await handleGrokRun(
      { prompt: "hi", permission_mode: "inherit" },
      deps,
    );
    expect(env.ok).toBe(false);
    if (!env.ok) {
      expect(env.error.code).toBe("INVALID_ARGS");
    }
    expect(deps.resolvePerm).not.toHaveBeenCalled();
  });

  it("does not pass --leader when use_leader is false", async () => {
    const deps = mockDeps({});
    await handleGrokRun({ prompt: "hi" }, deps);
    const runReq = deps.run.mock.calls[0]![0];
    expect(runReq.args).not.toContain("--leader");
    expect(deps.prepareLeader).toHaveBeenCalled();
  });

  it("passes --leader when prepareLeader returns use:true", async () => {
    const deps = mockDeps({
      config: {
        ...baseConfig,
        use_leader: true,
        leader_ensure: false,
      },
      prepareLeader: async () => leaderUsed,
    });
    const env = await handleGrokRun({ prompt: "hi" }, deps);
    expect(env.ok).toBe(true);
    const runReq = deps.run.mock.calls[0]![0];
    expect(runReq.args).toContain("--leader");
    expect(runReq.args).toContain("--leader-socket");
    expect(runReq.args).toContain("/tmp/l.sock");
    if (env.ok) {
      expect(env.meta?.leader).toMatchObject({ used: true, requested: true });
    }
  });

  it("falls back to one-shot and sets meta.leader.fallback", async () => {
    const deps = mockDeps({
      config: { ...baseConfig, use_leader: true, leader_fallback: true },
      prepareLeader: async () => leaderEnsureFallback,
    });
    const env = await handleGrokRun({ prompt: "hi" }, deps);
    expect(env.ok).toBe(true);
    const runReq = deps.run.mock.calls[0]![0];
    expect(runReq.args).not.toContain("--leader");
    if (env.ok) {
      expect(env.meta?.leader).toMatchObject({
        fallback: true,
        fallback_reason: "ensure_failed",
      });
    }
  });

  it("retries without leader when first run fails and leader was used", async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce({
        code: 1,
        stdout: "",
        stderr: "leader connection closed",
        timedOut: false,
        durationMs: 5,
      })
      .mockResolvedValueOnce({
        code: 0,
        stdout: JSON.stringify({ text: "recovered", session_id: "s2" }),
        stderr: "",
        timedOut: false,
        durationMs: 9,
      });
    const deps = mockDeps({
      run,
      config: { ...baseConfig, use_leader: true, leader_fallback: true },
      prepareLeader: async () => leaderUsed,
    });
    const env = await handleGrokRun({ prompt: "hi" }, deps);
    expect(env.ok).toBe(true);
    expect(run).toHaveBeenCalledTimes(2);
    const firstArgs = run.mock.calls[0]![0].args;
    expect(firstArgs).toContain("--leader");
    const secondArgs = run.mock.calls[1]![0].args;
    expect(secondArgs).not.toContain("--leader");
    if (env.ok) {
      expect(env.text).toBe("recovered");
      expect(env.meta?.leader).toMatchObject({
        used: false,
        fallback: true,
        fallback_reason: "run_failed",
      });
    }
  });
});
