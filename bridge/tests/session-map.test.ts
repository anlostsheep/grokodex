import { describe, it, expect, beforeEach } from "vitest";
import {
  applyResumeCliFlags,
  buildPermissionFingerprint,
  createSessionMap,
  normalizeHostThreadId,
  resolveSessionPlan,
  type FingerprintInput,
} from "../src/session-map.js";
import type { PermissionAudit } from "../src/types.js";

const baseAudit: PermissionAudit = {
  requested: "restricted",
  effective: "restricted",
  host_sandbox: null,
  codex_sandbox: null,
  source: "default",
  notes: [],
};

function fpInput(over: Partial<FingerprintInput> = {}): FingerprintInput {
  return {
    audit: baseAudit,
    cliArgs: ["--output-format", "json", "--deny", "Bash(sudo*)"],
    cwd: "/proj",
    model: undefined,
    alwaysApprove: false,
    ...over,
  };
}

describe("normalizeHostThreadId", () => {
  it("keeps codex/claude prefixes", () => {
    expect(normalizeHostThreadId("codex:abc", {})).toBe("codex:abc");
    expect(normalizeHostThreadId("claude:xyz", {})).toBe("claude:xyz");
  });

  it("prefixes claude when CLAUDECODE=1", () => {
    expect(normalizeHostThreadId("abc-1", { CLAUDECODE: "1" })).toBe(
      "claude:abc-1",
    );
  });

  it("prefixes codex when originator looks like Codex", () => {
    expect(
      normalizeHostThreadId("tid-1", {
        CODEX_INTERNAL_ORIGINATOR_OVERRIDE: "Codex Desktop",
      }),
    ).toBe("codex:tid-1");
  });

  it("returns null for empty", () => {
    expect(normalizeHostThreadId("  ", {})).toBeNull();
    expect(normalizeHostThreadId(undefined, {})).toBeNull();
  });
});

describe("buildPermissionFingerprint", () => {
  it("is stable for same inputs", () => {
    const a = buildPermissionFingerprint(fpInput());
    const b = buildPermissionFingerprint(fpInput());
    expect(a).toBe(b);
    expect(a.startsWith("v1|")).toBe(true);
  });

  it("changes when sandbox effective changes", () => {
    const a = buildPermissionFingerprint(fpInput());
    const b = buildPermissionFingerprint(
      fpInput({
        audit: {
          ...baseAudit,
          effective: "inherit:danger-full-access",
          host_sandbox: "danger-full-access",
          codex_sandbox: "danger-full-access",
        },
        alwaysApprove: true,
      }),
    );
    expect(a).not.toBe(b);
  });

  it("changes when cwd changes", () => {
    const a = buildPermissionFingerprint(fpInput({ cwd: "/a" }));
    const b = buildPermissionFingerprint(fpInput({ cwd: "/b" }));
    expect(a).not.toBe(b);
  });

  it("changes when model changes", () => {
    const a = buildPermissionFingerprint(fpInput({ model: undefined }));
    const b = buildPermissionFingerprint(fpInput({ model: "grok-x" }));
    expect(a).not.toBe(b);
  });
});

describe("resolveSessionPlan", () => {
  let map: ReturnType<typeof createSessionMap>;

  beforeEach(() => {
    map = createSessionMap({ maxEntries: 10 });
  });

  it("no host key → no resume", () => {
    const plan = resolveSessionPlan({
      map,
      hostThreadId: null,
      fingerprint: "v1|fp",
      fresh: false,
      explicitSessionId: null,
      reuseEnabled: true,
    });
    expect(plan.resumeSid).toBeNull();
    expect(plan.meta.reason).toBe("no_host_key");
    expect(plan.meta.resumed).toBe(false);
    expect(plan.shouldUpdateMap).toBe(false);
  });

  it("fresh → no resume but should update map when host present", () => {
    const plan = resolveSessionPlan({
      map,
      hostThreadId: "codex:t1",
      fingerprint: "v1|fp",
      fresh: true,
      explicitSessionId: null,
      reuseEnabled: true,
    });
    expect(plan.resumeSid).toBeNull();
    expect(plan.meta.reason).toBe("fresh_requested");
    expect(plan.shouldUpdateMap).toBe(true);
  });

  it("explicit session_id wins over map", () => {
    map.set("codex:t1", "v1|fp", "sid-map");
    const plan = resolveSessionPlan({
      map,
      hostThreadId: "codex:t1",
      fingerprint: "v1|fp",
      fresh: false,
      explicitSessionId: "sid-explicit",
      reuseEnabled: true,
    });
    expect(plan.resumeSid).toBe("sid-explicit");
    expect(plan.meta.reason).toBe("explicit_session_id");
    expect(plan.meta.resumed).toBe(true);
  });

  it("map hit on same fingerprint → resume", () => {
    map.set("codex:t1", "v1|fp", "sid-1");
    const plan = resolveSessionPlan({
      map,
      hostThreadId: "codex:t1",
      fingerprint: "v1|fp",
      fresh: false,
      explicitSessionId: null,
      reuseEnabled: true,
    });
    expect(plan.resumeSid).toBe("sid-1");
    expect(plan.meta.reason).toBe("host_map_hit");
    expect(plan.meta.resumed).toBe(true);
  });

  it("same host different fingerprint → no resume (fingerprint_miss)", () => {
    map.set("codex:t1", "v1|fp-a", "sid-a");
    const plan = resolveSessionPlan({
      map,
      hostThreadId: "codex:t1",
      fingerprint: "v1|fp-b",
      fresh: false,
      explicitSessionId: null,
      reuseEnabled: true,
    });
    expect(plan.resumeSid).toBeNull();
    expect(plan.meta.reason).toBe("fingerprint_miss");
    expect(plan.shouldUpdateMap).toBe(true);
  });

  it("reuse disabled → no map resume", () => {
    map.set("codex:t1", "v1|fp", "sid-1");
    const plan = resolveSessionPlan({
      map,
      hostThreadId: "codex:t1",
      fingerprint: "v1|fp",
      fresh: false,
      explicitSessionId: null,
      reuseEnabled: false,
    });
    expect(plan.resumeSid).toBeNull();
    expect(plan.meta.reason).toBe("reuse_disabled");
  });

  it("reuse disabled still allows explicit session_id", () => {
    const plan = resolveSessionPlan({
      map,
      hostThreadId: null,
      fingerprint: "v1|fp",
      fresh: false,
      explicitSessionId: "sid-x",
      reuseEnabled: false,
    });
    expect(plan.resumeSid).toBe("sid-x");
    expect(plan.meta.reason).toBe("explicit_session_id");
  });
});

describe("applyResumeCliFlags", () => {
  it("appends --resume sid", () => {
    expect(applyResumeCliFlags(["--leader", "-p", "hi"], "abc")).toEqual([
      "--leader",
      "-p",
      "hi",
      "--resume",
      "abc",
    ]);
  });

  it("no-op when sid null", () => {
    expect(applyResumeCliFlags(["-p", "hi"], null)).toEqual(["-p", "hi"]);
  });
});

describe("createSessionMap LRU", () => {
  it("evicts oldest when over maxEntries", () => {
    const map = createSessionMap({ maxEntries: 2 });
    map.set("h1", "fp", "s1");
    map.set("h2", "fp", "s2");
    map.set("h3", "fp", "s3");
    expect(map.get("h1", "fp")).toBeNull();
    expect(map.get("h2", "fp")).toBe("s2");
    expect(map.get("h3", "fp")).toBe("s3");
  });
});
