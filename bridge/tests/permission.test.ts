import { describe, it, expect } from "vitest";
import {
  resolvePermission,
  type PermissionInput,
} from "../src/permission.js";

function baseInherit(
  overrides: Partial<PermissionInput> = {},
): PermissionInput {
  return {
    mode: "inherit",
    allow_inherit: true,
    allow_full_access_inherit: true,
    ...overrides,
  };
}

function hasAlwaysApproveOrYolo(args: string[]): boolean {
  const joined = args.join(" ").toLowerCase();
  return (
    args.includes("--always-approve") ||
    joined.includes("yolo") ||
    (args.includes("--permission-mode") &&
      args[args.indexOf("--permission-mode") + 1] === "bypassPermissions")
  );
}

function hasDenyRules(args: string[]): boolean {
  return args.includes("--deny") || args.some((a) => a.startsWith("--deny"));
}

describe("resolvePermission", () => {
  it("mode=restricted: effective contains restricted; no always-approve/yolo; has deny rules", () => {
    const r = resolvePermission({
      mode: "restricted",
      allow_inherit: true,
      allow_full_access_inherit: true,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.audit.requested).toBe("restricted");
    expect(r.audit.effective).toMatch(/restricted/i);
    expect(r.audit.codex_sandbox).toBeNull();
    expect(r.audit.source).toBe("default");
    expect(hasAlwaysApproveOrYolo(r.cliArgs)).toBe(false);
    expect(hasDenyRules(r.cliArgs)).toBe(true);
    expect(r.cliArgs).toContain("--output-format");
    expect(r.cliArgs).toContain("json");
  });

  it("mode=inherit with no caller/env/config sandbox → INHERIT_UNAVAILABLE", () => {
    const r = resolvePermission(baseInherit());
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("INHERIT_UNAVAILABLE");
    expect(r.audit.requested).toBe("inherit");
    expect(r.audit.source).toBe("unavailable");
    expect(r.audit.codex_sandbox).toBeNull();
  });

  it("mode=inherit, codex_sandbox=read-only: disallow edit tools or equivalent deny", () => {
    const r = resolvePermission(
      baseInherit({ codex_sandbox: "read-only" }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.audit.codex_sandbox).toBe("read-only");
    expect(r.audit.source).toBe("caller_args");
    expect(r.audit.effective).toMatch(/read-only|readonly|read_only/i);
    expect(hasAlwaysApproveOrYolo(r.cliArgs)).toBe(false);

    const joined = r.cliArgs.join(" ");
    const disallowsEdits =
      (r.cliArgs.includes("--disallowed-tools") &&
        /Write|Edit|MultiEdit/i.test(
          r.cliArgs[r.cliArgs.indexOf("--disallowed-tools") + 1] ?? "",
        )) ||
      /Write|Edit|MultiEdit/i.test(joined) ||
      (hasDenyRules(r.cliArgs) &&
        r.cliArgs.some(
          (a, i) =>
            r.cliArgs[i - 1] === "--deny" &&
            /Write|Edit|Bash/i.test(a),
        ));
    expect(disallowsEdits).toBe(true);
  });

  it("mode=inherit, workspace-write: same level as restricted (no always-approve, has deny)", () => {
    const restricted = resolvePermission({
      mode: "restricted",
      allow_inherit: true,
      allow_full_access_inherit: true,
    });
    const r = resolvePermission(
      baseInherit({ codex_sandbox: "workspace-write" }),
    );
    expect(r.ok).toBe(true);
    expect(restricted.ok).toBe(true);
    if (!r.ok || !restricted.ok) return;

    expect(r.audit.codex_sandbox).toBe("workspace-write");
    expect(r.audit.source).toBe("caller_args");
    expect(hasAlwaysApproveOrYolo(r.cliArgs)).toBe(false);
    expect(hasDenyRules(r.cliArgs)).toBe(true);

    // Same deny set as restricted
    const deniesOf = (args: string[]) =>
      args.filter((_, i) => args[i - 1] === "--deny").sort();
    expect(deniesOf(r.cliArgs)).toEqual(deniesOf(restricted.cliArgs));
  });

  it("mode=inherit, danger-full-access + allow_full true: always-approve/bypass; notes mark full", () => {
    const r = resolvePermission(
      baseInherit({
        codex_sandbox: "danger-full-access",
        allow_full_access_inherit: true,
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.audit.codex_sandbox).toBe("danger-full-access");
    expect(r.audit.effective).toMatch(/full|danger/i);
    expect(hasAlwaysApproveOrYolo(r.cliArgs)).toBe(true);
    expect(
      r.audit.notes.some((n) => /full/i.test(n)),
    ).toBe(true);
    // Absolute deny may still be present by design
    // (not required, but if present should not include yolo elsewhere)
  });

  it("mode=inherit, danger-full-access + allow_full false → PERMISSION_DENIED", () => {
    const r = resolvePermission(
      baseInherit({
        codex_sandbox: "danger-full-access",
        allow_full_access_inherit: false,
      }),
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("PERMISSION_DENIED");
    expect(r.audit.requested).toBe("inherit");
    expect(r.audit.codex_sandbox).toBe("danger-full-access");
  });

  it("mode=inherit, allow_inherit false → PERMISSION_DENIED", () => {
    const r = resolvePermission(
      baseInherit({
        allow_inherit: false,
        codex_sandbox: "workspace-write",
      }),
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("PERMISSION_DENIED");
    expect(r.audit.requested).toBe("inherit");
  });

  it("sandbox source priority: caller > env > config", () => {
    const callerWins = resolvePermission(
      baseInherit({
        codex_sandbox: "read-only",
        envSandbox: "danger-full-access",
        configSandbox: "workspace-write",
      }),
    );
    expect(callerWins.ok).toBe(true);
    if (callerWins.ok) {
      expect(callerWins.audit.codex_sandbox).toBe("read-only");
      expect(callerWins.audit.source).toBe("caller_args");
    }

    const envWins = resolvePermission(
      baseInherit({
        codex_sandbox: null,
        envSandbox: "workspace-write",
        configSandbox: "read-only",
      }),
    );
    expect(envWins.ok).toBe(true);
    if (envWins.ok) {
      expect(envWins.audit.codex_sandbox).toBe("workspace-write");
      expect(envWins.audit.source).toBe("env");
    }

    const configWins = resolvePermission(
      baseInherit({
        configSandbox: "read-only",
      }),
    );
    expect(configWins.ok).toBe(true);
    if (configWins.ok) {
      expect(configWins.audit.codex_sandbox).toBe("read-only");
      expect(configWins.audit.source).toBe("config_toml");
    }
  });
});
