import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import {
  applyLeaderCliFlags,
  defaultEnsureLeader,
  defaultLeaderSocketPath,
  defaultProbeLeader,
  markLeaderRunFallback,
  resolveLeaderPlan,
  prepareLeader,
  shouldFallbackAfterLeaderRun,
  waitUntilLeaderReady,
} from "../src/leader.js";
import type { GrokodexConfig } from "../src/config.js";
import type { LeaderMeta } from "../src/types.js";

const baseConfig: GrokodexConfig = {
  default_permission: "restricted",
  allow_inherit: true,
  allow_full_access_inherit: true,
  use_leader: false,
  leader_isolate: false,
  leader_fallback: true,
  leader_ensure: true,
  x_search_max_turns: 5,
  imagine_max_turns: 4,
  x_search_tools: "x_search",
  imagine_tools: "image_gen",
  x_search_timeout_ms: 90_000,
  imagine_timeout_ms: 120_000,
  narrow_tools_strict: true,
  session_reuse: true,
  session_resume_fallback: true,
};

/** Fast ensure path: single re-probe, no poll sleep (unit tests). */
const fastEnsureDeps = {
  ensureTimeoutMs: 0,
  ensurePollMs: 1,
  sleep: async () => {},
};

function fakeChild(): ChildProcess {
  const ee = new EventEmitter() as ChildProcess;
  ee.unref = vi.fn(() => ee);
  return ee;
}

describe("defaultLeaderSocketPath", () => {
  it("uses GROK_HOME or ~/.grok and isolate name", () => {
    const shared = defaultLeaderSocketPath(
      { HOME: "/home/u", GROK_HOME: undefined },
      false,
    );
    expect(shared).toBe("/home/u/.grok/leader.sock");

    const isolated = defaultLeaderSocketPath(
      { HOME: "/home/u", GROK_HOME: "/custom" },
      true,
    );
    expect(isolated).toBe("/custom/grokodex-leader.sock");
  });
});

describe("resolveLeaderPlan", () => {
  it("is off when config and override are false/undefined", () => {
    const p = resolveLeaderPlan(baseConfig, undefined, { HOME: "/h" });
    expect(p.requested).toBe(false);
    expect(p.mode).toBe("off");
  });

  it("override true forces on even if config false", () => {
    const p = resolveLeaderPlan(baseConfig, true, { HOME: "/h" });
    expect(p.requested).toBe(true);
    expect(p.mode).toBe("shared");
    expect(p.socket).toBe("/h/.grok/leader.sock");
  });

  it("override false forces off even if config true", () => {
    const p = resolveLeaderPlan({ ...baseConfig, use_leader: true }, false, {
      HOME: "/h",
    });
    expect(p.requested).toBe(false);
    expect(p.mode).toBe("off");
  });

  it("uses explicit leader_socket; isolate sets mode", () => {
    const p = resolveLeaderPlan(
      {
        ...baseConfig,
        use_leader: true,
        leader_socket: "/tmp/x.sock",
        leader_isolate: true,
      },
      undefined,
      { HOME: "/h" },
    );
    expect(p.socket).toBe("/tmp/x.sock");
    expect(p.mode).toBe("isolated");
  });
});

describe("applyLeaderCliFlags", () => {
  it("appends --leader and optional socket", () => {
    const a = applyLeaderCliFlags(["--output-format", "json"], {
      use: true,
      socket: "/tmp/l.sock",
    });
    expect(a).toEqual([
      "--output-format",
      "json",
      "--leader",
      "--leader-socket",
      "/tmp/l.sock",
    ]);
  });

  it("no-ops when use is false", () => {
    const a = applyLeaderCliFlags(["-p", "x"], { use: false, socket: null });
    expect(a).toEqual(["-p", "x"]);
  });
});

describe("prepareLeader", () => {
  it("returns disabled meta without probing when not requested", async () => {
    const probe = vi.fn();
    const ensure = vi.fn();
    const r = await prepareLeader(
      baseConfig,
      undefined,
      { probe, ensure, env: { HOME: "/h" } },
    );
    expect(r.cli.use).toBe(false);
    expect(r.meta.requested).toBe(false);
    expect(r.meta.mode).toBe("off");
    expect(probe).not.toHaveBeenCalled();
    expect(ensure).not.toHaveBeenCalled();
  });

  it("uses leader when probe says alive and does not call ensure", async () => {
    const ensure = vi.fn();
    const r = await prepareLeader(
      { ...baseConfig, use_leader: true },
      undefined,
      {
        probe: async () => ({ alive: true, pid: 9 }),
        ensure,
        env: { HOME: "/h" },
      },
    );
    expect(r.cli.use).toBe(true);
    expect(r.meta.used).toBe(true);
    expect(r.meta.ensured).toBe(false);
    expect(r.meta.fallback).toBe(false);
    expect(ensure).not.toHaveBeenCalled();
  });

  it("ensures then uses when probe was dead", async () => {
    const ensure = vi.fn(async () => ({ ok: true as const }));
    const probe = vi
      .fn()
      .mockResolvedValueOnce({ alive: false, pid: null })
      .mockResolvedValueOnce({ alive: true, pid: 11 });
    const r = await prepareLeader(
      { ...baseConfig, use_leader: true, leader_ensure: true },
      undefined,
      { probe, ensure, env: { HOME: "/h" }, ...fastEnsureDeps },
    );
    expect(ensure).toHaveBeenCalled();
    expect(r.cli.use).toBe(true);
    expect(r.meta.ensured).toBe(true);
  });

  it("falls back with ensure_failed when ensure ok but re-probe still dead", async () => {
    const ensure = vi.fn(async () => ({ ok: true as const }));
    const probe = vi.fn(async () => ({ alive: false, pid: null }));
    const r = await prepareLeader(
      {
        ...baseConfig,
        use_leader: true,
        leader_ensure: true,
        leader_fallback: true,
      },
      undefined,
      { probe, ensure, env: { HOME: "/h" }, ...fastEnsureDeps },
    );
    expect(ensure).toHaveBeenCalled();
    // initial probe + one post-ensure probe (timeoutMs=0)
    expect(probe).toHaveBeenCalledTimes(2);
    expect(r.cli.use).toBe(false);
    expect(r.meta.ensured).toBe(true);
    expect(r.meta.fallback).toBe(true);
    expect(r.meta.fallback_reason).toBe("ensure_failed");
    expect(r.error).toBeUndefined();
  });

  it("polls until leader becomes ready after ensure (not fixed 400ms sleep)", async () => {
    const ensure = vi.fn(async () => ({ ok: true as const }));
    // 1st: pre-ensure dead; next few post-ensure still dead; then alive
    const probe = vi
      .fn()
      .mockResolvedValueOnce({ alive: false, pid: null })
      .mockResolvedValueOnce({ alive: false, pid: null })
      .mockResolvedValueOnce({ alive: false, pid: null })
      .mockResolvedValueOnce({ alive: false, pid: null })
      .mockResolvedValueOnce({ alive: true, pid: 42 });
    let clock = 0;
    const sleep = vi.fn(async (ms: number) => {
      clock += ms;
    });
    const r = await prepareLeader(
      { ...baseConfig, use_leader: true, leader_ensure: true },
      undefined,
      {
        probe,
        ensure,
        env: { HOME: "/h" },
        ensureTimeoutMs: 1000,
        ensurePollMs: 50,
        sleep,
        now: () => clock,
      },
    );
    expect(r.cli.use).toBe(true);
    expect(r.meta.used).toBe(true);
    expect(r.meta.ensured).toBe(true);
    expect(r.meta.fallback).toBe(false);
    expect(probe.mock.calls.length).toBeGreaterThanOrEqual(5);
    expect(sleep).toHaveBeenCalled();
  });
});

describe("waitUntilLeaderReady", () => {
  it("returns immediately when already alive", async () => {
    const probe = vi.fn(async () => ({ alive: true, pid: 1 }));
    const sleep = vi.fn(async () => {});
    const r = await waitUntilLeaderReady("/tmp/s", probe, {
      timeoutMs: 1000,
      pollMs: 50,
      sleep,
    });
    expect(r.alive).toBe(true);
    expect(probe).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("returns last dead result when timeout is zero", async () => {
    const probe = vi.fn(async () => ({ alive: false, pid: null }));
    const sleep = vi.fn(async () => {});
    const r = await waitUntilLeaderReady("/tmp/s", probe, {
      timeoutMs: 0,
      pollMs: 50,
      sleep,
    });
    expect(r.alive).toBe(false);
    expect(probe).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });
});

describe("defaultProbeLeader", () => {
  it("is dead when path does not exist", async () => {
    const r = await defaultProbeLeader(
      "/no/such/sock",
      () => false,
      async () => true,
    );
    expect(r.alive).toBe(false);
  });

  it("is dead when path exists but connect fails (stale socket)", async () => {
    const r = await defaultProbeLeader(
      "/tmp/stale.sock",
      () => true,
      async () => false,
    );
    expect(r.alive).toBe(false);
  });

  it("is alive when path exists and connect succeeds", async () => {
    const r = await defaultProbeLeader(
      "/tmp/live.sock",
      () => true,
      async () => true,
    );
    expect(r.alive).toBe(true);
  });
});

describe("prepareLeader (ensure off paths continued)", () => {
  it("does not call ensure when leader_ensure false and probe dead", async () => {
    const ensure = vi.fn();
    const r = await prepareLeader(
      {
        ...baseConfig,
        use_leader: true,
        leader_ensure: false,
        leader_fallback: true,
      },
      undefined,
      {
        probe: async () => ({ alive: false, pid: null }),
        ensure,
        env: { HOME: "/h" },
      },
    );
    expect(ensure).not.toHaveBeenCalled();
    expect(r.cli.use).toBe(false);
    expect(r.meta.ensured).toBe(false);
    expect(r.meta.fallback).toBe(true);
    expect(r.meta.fallback_reason).toBe("ensure_failed");
  });

  it("errors without ensure when leader_ensure false, dead, fallback false", async () => {
    const ensure = vi.fn();
    const r = await prepareLeader(
      {
        ...baseConfig,
        use_leader: true,
        leader_ensure: false,
        leader_fallback: false,
      },
      undefined,
      {
        probe: async () => ({ alive: false, pid: null }),
        ensure,
        env: { HOME: "/h" },
      },
    );
    expect(ensure).not.toHaveBeenCalled();
    expect(r.cli.use).toBe(false);
    expect(r.meta.fallback_reason).toBe("ensure_failed");
    expect(r.error).toEqual(
      expect.objectContaining({ code: "GROK_EXIT_NONZERO" }),
    );
  });

  it("falls back when ensure fails and fallback true", async () => {
    const r = await prepareLeader(
      {
        ...baseConfig,
        use_leader: true,
        leader_ensure: true,
        leader_fallback: true,
      },
      undefined,
      {
        probe: async () => ({ alive: false, pid: null }),
        ensure: async () => ({ ok: false as const, message: "spawn failed" }),
        env: { HOME: "/h" },
        ...fastEnsureDeps,
      },
    );
    expect(r.cli.use).toBe(false);
    expect(r.meta.fallback).toBe(true);
    expect(r.meta.fallback_reason).toBe("ensure_failed");
    expect(r.error).toBeUndefined();
  });

  it("returns error when ensure fails and fallback false", async () => {
    const r = await prepareLeader(
      {
        ...baseConfig,
        use_leader: true,
        leader_ensure: true,
        leader_fallback: false,
      },
      undefined,
      {
        probe: async () => ({ alive: false, pid: null }),
        ensure: async () => ({ ok: false as const, message: "spawn failed" }),
        env: { HOME: "/h" },
        ...fastEnsureDeps,
      },
    );
    expect(r.cli.use).toBe(false);
    expect(r.error).toEqual(
      expect.objectContaining({ code: "GROK_EXIT_NONZERO" }),
    );
  });
});

describe("defaultEnsureLeader", () => {
  it("spawns detached with leader args, env, and unrefs on success", async () => {
    const child = fakeChild();
    const spawnFn = vi.fn(() => child);
    const env = { HOME: "/h", PATH: "/bin", CUSTOM: "1" };

    const r = await defaultEnsureLeader({
      bin: "/usr/bin/grok",
      socket: "/tmp/leader.sock",
      spawnFn: spawnFn as typeof import("node:child_process").spawn,
      env,
    });

    expect(r).toEqual({ ok: true });
    expect(spawnFn).toHaveBeenCalledWith(
      "/usr/bin/grok",
      [
        "agent",
        "leader",
        "--no-exit-on-disconnect",
        "--leader-socket",
        "/tmp/leader.sock",
      ],
      expect.objectContaining({
        detached: true,
        stdio: "ignore",
        env,
      }),
    );
    expect(child.unref).toHaveBeenCalled();
  });

  it("returns ok:false when child emits error (e.g. missing binary)", async () => {
    const child = fakeChild();
    const spawnFn = vi.fn(() => {
      queueMicrotask(() => {
        child.emit("error", new Error("spawn ENOENT"));
      });
      return child;
    });

    const r = await defaultEnsureLeader({
      bin: "/missing/grok",
      socket: "/tmp/leader.sock",
      spawnFn: spawnFn as typeof import("node:child_process").spawn,
    });

    expect(r).toEqual({ ok: false, message: "spawn ENOENT" });
    expect(child.unref).not.toHaveBeenCalled();
  });
});

describe("shouldFallbackAfterLeaderRun", () => {
  const usedMeta: LeaderMeta = {
    requested: true,
    used: true,
    mode: "shared",
    socket: "/tmp/l.sock",
    ensured: false,
    fallback: false,
    fallback_reason: null,
  };

  it("is true when leader was used and fallback enabled", () => {
    expect(
      shouldFallbackAfterLeaderRun(usedMeta, {
        ...baseConfig,
        leader_fallback: true,
      }),
    ).toBe(true);
  });

  it("is false when leader was not used", () => {
    expect(
      shouldFallbackAfterLeaderRun(
        { ...usedMeta, used: false },
        { ...baseConfig, leader_fallback: true },
      ),
    ).toBe(false);
  });

  it("is false when fallback disabled", () => {
    expect(
      shouldFallbackAfterLeaderRun(usedMeta, {
        ...baseConfig,
        leader_fallback: false,
      }),
    ).toBe(false);
  });
});

describe("markLeaderRunFallback", () => {
  it("sets run_failed and clears used", () => {
    const meta: LeaderMeta = {
      requested: true,
      used: true,
      mode: "shared",
      socket: "/tmp/l.sock",
      ensured: true,
      fallback: false,
      fallback_reason: null,
    };
    const next = markLeaderRunFallback(meta);
    expect(next.used).toBe(false);
    expect(next.fallback).toBe(true);
    expect(next.fallback_reason).toBe("run_failed");
    expect(next.ensured).toBe(true);
    expect(next.socket).toBe("/tmp/l.sock");
  });
});
