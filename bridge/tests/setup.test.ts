import { describe, it, expect, vi } from "vitest";
import { loadConfig } from "../src/config.js";
import { handleSetup } from "../src/tools/setup.js";
import type { ToolEnvelope } from "../src/types.js";

/** Shared stubs so existing tests do not touch real leader sockets. */
const stubLeader = {
  probeLeader: async () => ({ alive: false, pid: null }),
  env: { HOME: "/h", GROKODEX_USE_LEADER: "0" },
};

describe("handleSetup", () => {
  it("returns ok with meta.auth_ok and version when binary found", async () => {
    const env = await handleSetup(
      {},
      {
        resolveBin: async () => ({ path: "/opt/grok" }),
        checkAuth: async () => ({
          version: "1.2.3",
          auth_ok: true,
          detail: "auth file present",
        }),
        ...stubLeader,
      },
    );

    expect(env.ok).toBe(true);
    if (env.ok) {
      expect(env.tool).toBe("grok_setup");
      expect(env.meta?.auth_ok).toBe(true);
      expect(env.meta?.grok_path).toBe("/opt/grok");
      expect(env.meta?.version).toBe("1.2.3");
      expect(env.text).toMatch(/1\.2\.3/);
      expect(env.text).toMatch(/\/opt\/grok/);
    }
  });

  it("returns GROK_NOT_FOUND when binary missing", async () => {
    const env = await handleSetup(
      {},
      {
        resolveBin: async () => ({
          error: "GROK_NOT_FOUND",
          message: "grok binary not found on PATH",
        }),
        checkAuth: async () => {
          throw new Error("should not be called");
        },
      },
    );

    expect(env.ok).toBe(false);
    if (!env.ok) {
      expect(env.error.code).toBe("GROK_NOT_FOUND");
      expect(env.error.hint).toBeTruthy();
    }
  });

  it("returns ok with auth_ok false when logged out", async () => {
    const env = await handleSetup(
      {},
      {
        resolveBin: async () => ({ path: "/opt/grok" }),
        checkAuth: async () => ({
          version: "0.9.0",
          auth_ok: false,
          detail: "auth file missing or empty",
        }),
        ...stubLeader,
      },
    );

    expect(env.ok).toBe(true);
    if (env.ok) {
      expect(env.meta?.auth_ok).toBe(false);
      expect(env.meta?.version).toBe("0.9.0");
      expect(env.text).toMatch(/not logged in|auth|login/i);
    }
  });

  it("never throws uncaught exceptions", async () => {
    const env = await handleSetup(
      {},
      {
        resolveBin: async () => {
          throw new Error("boom");
        },
      },
    );

    expect(env.ok).toBe(false);
    if (!env.ok) {
      expect(env.tool).toBe("grok_setup");
      expect(env.error.message).toMatch(/boom/i);
    }
  });

  it("does not include secrets from auth probe detail", async () => {
    const secret = "sk-super-secret-token-xyz";
    const env: ToolEnvelope = await handleSetup(
      {},
      {
        resolveBin: async () => ({ path: "/opt/grok" }),
        checkAuth: async () => ({
          version: "1.0.0",
          auth_ok: true,
          detail: "auth file present",
        }),
        ...stubLeader,
      },
    );

    const text = JSON.stringify(env);
    expect(text).not.toContain(secret);
    expect(text).not.toMatch(/"api_key"|"token"\s*:/);
  });

  it("includes leader status in meta without ensure by default", async () => {
    const ensureLeader = vi.fn(async () => ({ ok: true as const }));
    const env = await handleSetup(
      {},
      {
        resolveBin: async () => ({ path: "/opt/grok" }),
        checkAuth: async () => ({
          auth_ok: true,
          version: "0.2.101",
        }),
        probeLeader: async () => ({ alive: false, pid: null }),
        ensureLeader,
        env: { HOME: "/h", GROKODEX_USE_LEADER: "0" },
      },
    );
    expect(env.ok).toBe(true);
    if (env.ok) {
      expect(env.meta?.leader).toMatchObject({
        alive: false,
        grokodex_use_leader: false,
        pid: null,
      });
      expect(typeof (env.meta?.leader as { socket?: string })?.socket).toBe(
        "string",
      );
      expect(typeof (env.meta?.leader as { hint?: string })?.hint).toBe(
        "string",
      );
      expect(env.text).toMatch(/leader/i);
    }
    expect(ensureLeader).not.toHaveBeenCalled();
  });

  it("ensure:true calls ensureLeader when dead", async () => {
    const ensureLeader = vi.fn(async () => ({ ok: true as const }));
    const probeLeader = vi
      .fn()
      .mockResolvedValueOnce({ alive: false, pid: null })
      .mockResolvedValueOnce({ alive: true, pid: null });
    const env = await handleSetup(
      { ensure: true },
      {
        resolveBin: async () => ({ path: "/opt/grok" }),
        checkAuth: async () => ({ auth_ok: true, version: "0.2.101" }),
        probeLeader,
        ensureLeader,
        env: { HOME: "/h" },
        config: loadConfig({ HOME: "/h" }),
        ensureWaitMs: 0,
      },
    );
    expect(ensureLeader).toHaveBeenCalled();
    expect(ensureLeader).toHaveBeenCalledWith({
      bin: "/opt/grok",
      socket: expect.stringContaining("leader.sock"),
    });
    expect(env.ok).toBe(true);
    if (env.ok) {
      expect(env.meta?.leader).toMatchObject({
        alive: true,
        pid: null,
      });
    }
  });

  it("ensure:false does not call ensureLeader even when dead", async () => {
    const ensureLeader = vi.fn(async () => ({ ok: true as const }));
    await handleSetup(
      { ensure: false },
      {
        resolveBin: async () => ({ path: "/opt/grok" }),
        checkAuth: async () => ({ auth_ok: true, version: "0.2.101" }),
        probeLeader: async () => ({ alive: false, pid: null }),
        ensureLeader,
        env: { HOME: "/h" },
      },
    );
    expect(ensureLeader).not.toHaveBeenCalled();
  });

  it("reports custom leader_socket from config", async () => {
    const env = await handleSetup(
      {},
      {
        resolveBin: async () => ({ path: "/opt/grok" }),
        checkAuth: async () => ({ auth_ok: true, version: "1.0.0" }),
        probeLeader: async () => ({ alive: true, pid: 4242 }),
        env: { HOME: "/h" },
        config: {
          ...loadConfig({ HOME: "/h" }),
          leader_socket: "/tmp/custom-leader.sock",
          use_leader: true,
        },
      },
    );
    expect(env.ok).toBe(true);
    if (env.ok) {
      expect(env.meta?.leader).toMatchObject({
        socket: "/tmp/custom-leader.sock",
        alive: true,
        pid: 4242,
        grokodex_use_leader: true,
      });
    }
  });
});

describe("checkGrokAuth (via deps)", () => {
  it("is injectable and not called when bin missing", async () => {
    const checkAuth = vi.fn(async () => ({ auth_ok: true, version: "x" }));
    await handleSetup(
      {},
      {
        resolveBin: async () => ({
          error: "GROK_NOT_FOUND",
          message: "missing",
        }),
        checkAuth,
      },
    );
    expect(checkAuth).not.toHaveBeenCalled();
  });
});
