import type {
  CodexApproval,
  CodexSandbox,
  PermissionAudit,
  PermissionMode,
} from "./types.js";

export interface PermissionInput {
  mode: PermissionMode;
  codex_sandbox?: CodexSandbox | null;
  codex_approval?: CodexApproval | null;
  allow_inherit: boolean;
  allow_full_access_inherit: boolean;
  /** optional injected static config */
  configSandbox?: CodexSandbox | null;
  envSandbox?: CodexSandbox | null;
}

export type ResolvedPermission =
  | {
      ok: true;
      audit: PermissionAudit;
      /** args after `grok` binary, before -p */
      cliArgs: string[];
      /** extra env for child */
      env?: Record<string, string>;
    }
  | {
      ok: false;
      audit: PermissionAudit;
      code: "INHERIT_UNAVAILABLE" | "PERMISSION_DENIED";
      message: string;
      hint?: string;
    };

const BASE_CLI_ARGS = ["--output-format", "json", "--max-turns", "30"] as const;

/** High-risk patterns blocked at restricted / workspace-write level. */
const RESTRICTED_DENY_RULES = [
  "Bash(rm -rf*)",
  "Bash(sudo*)",
  "Bash(mkfs*)",
  "Bash(*shutdown*)",
  "Bash(*reboot*)",
  "Bash(git push --force*)",
  "Bash(git push -f*)",
] as const;

/**
 * Absolute deny list retained even under full-access inherit.
 * Intentionally smaller than restricted — full still blocks disk-wipe / sudo class.
 */
const ABSOLUTE_DENY_RULES = [
  "Bash(rm -rf /)",
  "Bash(rm -rf /*)",
  "Bash(mkfs*)",
  "Bash(sudo*)",
] as const;

/** Built-in tools that mutate files — stripped for read-only inherit. */
const READ_ONLY_DISALLOWED_TOOLS = "Write,Edit,MultiEdit,NotebookEdit";

function pushDenyRules(args: string[], rules: readonly string[]): void {
  for (const rule of rules) {
    args.push("--deny", rule);
  }
}

function buildRestrictedCliArgs(): string[] {
  const args: string[] = [...BASE_CLI_ARGS];
  pushDenyRules(args, RESTRICTED_DENY_RULES);
  return args;
}

function buildReadOnlyCliArgs(): string[] {
  const args: string[] = [...BASE_CLI_ARGS];
  args.push("--disallowed-tools", READ_ONLY_DISALLOWED_TOOLS);
  pushDenyRules(args, RESTRICTED_DENY_RULES);
  return args;
}

function buildFullAccessCliArgs(): string[] {
  const args: string[] = [...BASE_CLI_ARGS];
  args.push("--always-approve");
  // Keep absolute deny even when auto-approving tools.
  pushDenyRules(args, ABSOLUTE_DENY_RULES);
  return args;
}

interface SandboxResolution {
  sandbox: CodexSandbox | null;
  source: PermissionAudit["source"];
}

/**
 * Resolve Codex sandbox signal: caller > env > config.
 * Null/undefined at a layer falls through to the next.
 */
function resolveSandboxSource(input: PermissionInput): SandboxResolution {
  if (input.codex_sandbox != null) {
    return { sandbox: input.codex_sandbox, source: "caller_args" };
  }
  if (input.envSandbox != null) {
    return { sandbox: input.envSandbox, source: "env" };
  }
  if (input.configSandbox != null) {
    return { sandbox: input.configSandbox, source: "config_toml" };
  }
  return { sandbox: null, source: "unavailable" };
}

function fail(
  audit: PermissionAudit,
  code: "INHERIT_UNAVAILABLE" | "PERMISSION_DENIED",
  message: string,
  hint?: string,
): ResolvedPermission {
  return { ok: false, audit, code, message, hint };
}

function ok(
  audit: PermissionAudit,
  cliArgs: string[],
  env?: Record<string, string>,
): ResolvedPermission {
  return env ? { ok: true, audit, cliArgs, env } : { ok: true, audit, cliArgs };
}

/**
 * Map restricted / inherit (+ Codex sandbox) to Grok CLI flags.
 * Calibrated against local `grok --help` (`--deny`, `--always-approve`,
 * `--disallowed-tools`, `--output-format`, `--max-turns`).
 */
export function resolvePermission(input: PermissionInput): ResolvedPermission {
  if (input.mode === "restricted") {
    const audit: PermissionAudit = {
      requested: "restricted",
      effective: "restricted",
      codex_sandbox: null,
      source: "default",
      notes: [
        "Default restricted: workspace-level write with high-risk shell denies; always-approve off.",
      ],
    };
    return ok(audit, buildRestrictedCliArgs());
  }

  // mode === "inherit"
  if (!input.allow_inherit) {
    const audit: PermissionAudit = {
      requested: "inherit",
      effective: "denied",
      codex_sandbox: input.codex_sandbox ?? null,
      source: "default",
      notes: ["inherit disabled by GROKODEX_ALLOW_INHERIT / allow_inherit=false"],
    };
    return fail(
      audit,
      "PERMISSION_DENIED",
      "permission_mode=inherit is disabled by configuration",
      "Set GROKODEX_ALLOW_INHERIT=true or use permission_mode=restricted",
    );
  }

  const { sandbox, source } = resolveSandboxSource(input);

  if (sandbox == null) {
    const audit: PermissionAudit = {
      requested: "inherit",
      effective: "unavailable",
      codex_sandbox: null,
      source: "unavailable",
      notes: [
        "No codex_sandbox from caller, env, or config.toml; refuse silent full upgrade.",
      ],
    };
    return fail(
      audit,
      "INHERIT_UNAVAILABLE",
      "inherit requested but Codex sandbox could not be determined",
      "Pass codex_sandbox (read-only | workspace-write | danger-full-access) or use restricted",
    );
  }

  if (sandbox === "read-only") {
    const audit: PermissionAudit = {
      requested: "inherit",
      effective: "read-only",
      codex_sandbox: sandbox,
      source,
      notes: [
        "Mapped Codex read-only → disallowed edit/write tools + restricted shell denies.",
      ],
    };
    return ok(audit, buildReadOnlyCliArgs());
  }

  if (sandbox === "workspace-write") {
    const audit: PermissionAudit = {
      requested: "inherit",
      effective: "restricted",
      codex_sandbox: sandbox,
      source,
      notes: [
        "Mapped Codex workspace-write → same capability level as restricted.",
      ],
    };
    return ok(audit, buildRestrictedCliArgs());
  }

  // sandbox === "danger-full-access"
  if (!input.allow_full_access_inherit) {
    const audit: PermissionAudit = {
      requested: "inherit",
      effective: "denied",
      codex_sandbox: sandbox,
      source,
      notes: [
        "danger-full-access blocked by GROKODEX_ALLOW_FULL_ACCESS_INHERIT / allow_full_access_inherit=false",
      ],
    };
    return fail(
      audit,
      "PERMISSION_DENIED",
      "full-access inherit is disabled by configuration",
      "Set GROKODEX_ALLOW_FULL_ACCESS_INHERIT=true only if you accept elevated risk",
    );
  }

  const audit: PermissionAudit = {
    requested: "inherit",
    effective: "danger-full-access",
    codex_sandbox: sandbox,
    source,
    notes: [
      "Full-access inherit: --always-approve enabled; absolute deny list retained.",
      "Capability approximation of Codex danger-full-access — not a shared OS sandbox token.",
    ],
  };
  return ok(audit, buildFullAccessCliArgs());
}

/**
 * Imagine tool permissions: always restricted-class CLI flags.
 * Narrow write-to-save_dir is enforced in the imagine tool via extra_rules / prompt.
 */
export function resolvePermissionForImagine(): ResolvedPermission {
  const audit: PermissionAudit = {
    requested: "restricted",
    effective: "restricted-imagine",
    codex_sandbox: null,
    source: "default",
    notes: [
      "Imagine never inherits full shell; write narrowed to save_dir in tool layer.",
    ],
  };
  return ok(audit, buildRestrictedCliArgs());
}

/**
 * X search permissions: restricted-class + disallowed edit tools (read-only).
 * Never inherits full shell; search-only constraints enforced in the tool prompt.
 */
export function resolvePermissionForXSearch(): ResolvedPermission {
  const audit: PermissionAudit = {
    requested: "restricted",
    effective: "restricted-x-search",
    codex_sandbox: null,
    source: "default",
    notes: [
      "X search never inherits full shell; edit/write tools disallowed; search-only via prompt.",
    ],
  };
  return ok(audit, buildReadOnlyCliArgs());
}
