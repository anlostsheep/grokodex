import { describe, it, expect, vi } from "vitest";
import {
  applyLeaderCliFlags,
  defaultLeaderSocketPath,
  resolveLeaderPlan,
  prepareLeader,
} from "../src/leader.js";
import type { GrokodexConfig } from "../src/config.js";

const baseConfig: GrokodexConfig = {
  default_permission: "restricted",
  allow_inherit: true,
  allow_full_access_inherit: true,
  use_leader: false,
  leader_isolate: false,
  leader_fallback: true,
  leader_ensure: true,
};

/** Fast ensure path: skip post-spawn wait in unit tests. */
const fastEnsureDeps = {
  ensureWaitMs: 0,
  sleep: async () => {},
};

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

  it("uses leader when probe says alive", async () => {
    const r = await prepareLeader(
      { ...baseConfig, use_leader: true },
      undefined,
      {
        probe: async () => ({ alive: true, pid: 9 }),
        ensure: vi.fn(),
        env: { HOME: "/h" },
      },
    );
    expect(r.cli.use).toBe(true);
    expect(r.meta.used).toBe(true);
    expect(r.meta.ensured).toBe(false);
    expect(r.meta.fallback).toBe(false);
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
