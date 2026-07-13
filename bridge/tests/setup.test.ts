import { describe, it, expect, vi } from "vitest";
import { handleSetup } from "../src/tools/setup.js";
import type { ToolEnvelope } from "../src/types.js";

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
      },
    );

    const text = JSON.stringify(env);
    expect(text).not.toContain(secret);
    expect(text).not.toMatch(/"api_key"|"token"\s*:/);
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
