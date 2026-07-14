import { describe, it, expect } from "vitest";
import { resolveGrokBinary } from "../src/grok-bin.js";
import { loadConfig } from "../src/config.js";

describe("resolveGrokBinary", () => {
  it("uses GROK_PATH when set and file exists", async () => {
    const r = await resolveGrokBinary(
      { GROK_PATH: "/opt/grok" },
      { existsSync: (p: string) => p === "/opt/grok" },
      async () => null,
    );
    expect(r).toEqual({ path: "/opt/grok" });
  });

  it("returns GROK_NOT_FOUND when missing", async () => {
    const r = await resolveGrokBinary(
      {},
      { existsSync: () => false },
      async () => null,
    );
    expect("error" in r && r.error).toBe("GROK_NOT_FOUND");
  });

  it("uses whichFn when GROK_PATH is unset", async () => {
    const r = await resolveGrokBinary(
      {},
      { existsSync: (p: string) => p === "/usr/local/bin/grok" },
      async () => "/usr/local/bin/grok",
    );
    expect(r).toEqual({ path: "/usr/local/bin/grok" });
  });

  it("returns GROK_NOT_FOUND when GROK_PATH is set but missing", async () => {
    const r = await resolveGrokBinary(
      { GROK_PATH: "/missing/grok" },
      { existsSync: () => false },
      async () => "/usr/bin/grok",
    );
    expect("error" in r && r.error).toBe("GROK_NOT_FOUND");
    if ("error" in r) {
      expect(r.message).toMatch(/GROK_PATH|\/missing\/grok/);
    }
  });
});

describe("loadConfig", () => {
  it("defaults permission restricted and allow_inherit / full-access inherit true", () => {
    const c = loadConfig({});
    expect(c.default_permission).toBe("restricted");
    expect(c.allow_inherit).toBe(true);
    expect(c.allow_full_access_inherit).toBe(true);
    expect(c.grok_path).toBeUndefined();
  });

  it("parses boolean env true/1/yes", () => {
    expect(loadConfig({ GROKODEX_ALLOW_INHERIT: "false" }).allow_inherit).toBe(false);
    expect(loadConfig({ GROKODEX_ALLOW_INHERIT: "0" }).allow_inherit).toBe(false);
    expect(loadConfig({ GROKODEX_ALLOW_FULL_ACCESS_INHERIT: "yes" }).allow_full_access_inherit).toBe(
      true,
    );
    expect(loadConfig({ GROKODEX_ALLOW_FULL_ACCESS_INHERIT: "1" }).allow_full_access_inherit).toBe(
      true,
    );
    expect(loadConfig({ GROKODEX_ALLOW_INHERIT: "TRUE" }).allow_inherit).toBe(true);
  });

  it("reads GROK_PATH and default permission", () => {
    const c = loadConfig({
      GROK_PATH: "/opt/grok",
      GROKODEX_DEFAULT_PERMISSION: "inherit",
    });
    expect(c.grok_path).toBe("/opt/grok");
    expect(c.default_permission).toBe("inherit");
  });

  it("falls back invalid permission to restricted", () => {
    const c = loadConfig({ GROKODEX_DEFAULT_PERMISSION: "full" });
    expect(c.default_permission).toBe("restricted");
  });

  it("defaults leader on with safe fallbacks", () => {
    const c = loadConfig({});
    expect(c.use_leader).toBe(true);
    expect(c.leader_socket).toBeUndefined();
    expect(c.leader_isolate).toBe(false);
    expect(c.leader_fallback).toBe(true);
    expect(c.leader_ensure).toBe(true);
  });

  it("parses GROKODEX leader env vars including opt-out", () => {
    const c = loadConfig({
      GROKODEX_USE_LEADER: "0",
      GROKODEX_LEADER_SOCKET: " /tmp/custom.sock ",
      GROKODEX_LEADER_ISOLATE: "true",
      GROKODEX_LEADER_FALLBACK: "0",
      GROKODEX_LEADER_ENSURE: "no",
    });
    expect(c.use_leader).toBe(false);
    expect(c.leader_socket).toBe("/tmp/custom.sock");
    expect(c.leader_isolate).toBe(true);
    expect(c.leader_fallback).toBe(false);
    expect(c.leader_ensure).toBe(false);
  });
});
