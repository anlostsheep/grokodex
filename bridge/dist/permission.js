/**
 * Merge host_sandbox + codex_sandbox at one layer.
 * Both set and unequal → conflict.
 */
export function resolveCallerSandbox(args) {
    const h = args.host_sandbox ?? null;
    const c = args.codex_sandbox ?? null;
    if (h != null && c != null && h !== c) {
        return {
            ok: false,
            code: "SANDBOX_CONFLICT",
            message: "host_sandbox and codex_sandbox disagree; pass only one or make them equal",
            hint: "Use host_sandbox (preferred) or codex_sandbox (compat), not conflicting values",
        };
    }
    return { ok: true, sandbox: h ?? c };
}
function auditSandboxFields(sandbox) {
    return { host_sandbox: sandbox, codex_sandbox: sandbox };
}
const BASE_CLI_ARGS = ["--output-format", "json", "--max-turns", "30"];
/** High-risk patterns blocked at restricted / workspace-write level. */
const RESTRICTED_DENY_RULES = [
    "Bash(rm -rf*)",
    "Bash(sudo*)",
    "Bash(mkfs*)",
    "Bash(*shutdown*)",
    "Bash(*reboot*)",
    "Bash(git push --force*)",
    "Bash(git push -f*)",
];
/**
 * Absolute deny list retained even under full-access inherit.
 * Intentionally smaller than restricted — full still blocks disk-wipe / sudo class.
 */
const ABSOLUTE_DENY_RULES = [
    "Bash(rm -rf /)",
    "Bash(rm -rf /*)",
    "Bash(mkfs*)",
    "Bash(sudo*)",
];
/** Built-in tools that mutate files — stripped for read-only inherit. */
const READ_ONLY_DISALLOWED_TOOLS = "Write,Edit,MultiEdit,NotebookEdit";
function pushDenyRules(args, rules) {
    for (const rule of rules) {
        args.push("--deny", rule);
    }
}
function buildRestrictedCliArgs() {
    const args = [...BASE_CLI_ARGS];
    pushDenyRules(args, RESTRICTED_DENY_RULES);
    return args;
}
function buildReadOnlyCliArgs() {
    const args = [...BASE_CLI_ARGS];
    args.push("--disallowed-tools", READ_ONLY_DISALLOWED_TOOLS);
    pushDenyRules(args, RESTRICTED_DENY_RULES);
    return args;
}
function buildFullAccessCliArgs() {
    const args = [...BASE_CLI_ARGS];
    args.push("--always-approve");
    // Keep absolute deny even when auto-approving tools.
    pushDenyRules(args, ABSOLUTE_DENY_RULES);
    return args;
}
/**
 * Resolve host sandbox signal: caller (host_sandbox | codex_sandbox) > env > config.
 * Null/undefined at a layer falls through to the next.
 * Caller fields must already be non-conflicting (use resolveCallerSandbox upstream).
 */
function resolveSandboxSource(input) {
    const caller = input.host_sandbox ?? input.codex_sandbox ?? null;
    if (caller != null) {
        return { sandbox: caller, source: "caller_args" };
    }
    if (input.envSandbox != null) {
        return { sandbox: input.envSandbox, source: "env" };
    }
    if (input.configSandbox != null) {
        return { sandbox: input.configSandbox, source: "config_toml" };
    }
    return { sandbox: null, source: "unavailable" };
}
function fail(audit, code, message, hint) {
    return { ok: false, audit, code, message, hint };
}
function ok(audit, cliArgs, env) {
    return env ? { ok: true, audit, cliArgs, env } : { ok: true, audit, cliArgs };
}
/**
 * Map restricted / inherit (+ host sandbox) to Grok CLI flags.
 * Calibrated against local `grok --help` (`--deny`, `--always-approve`,
 * `--disallowed-tools`, `--output-format`, `--max-turns`).
 */
export function resolvePermission(input) {
    if (input.mode === "restricted") {
        const audit = {
            requested: "restricted",
            effective: "restricted",
            ...auditSandboxFields(null),
            source: "default",
            notes: [
                "Default restricted: workspace-level write with high-risk shell denies; always-approve off.",
            ],
        };
        return ok(audit, buildRestrictedCliArgs());
    }
    // mode === "inherit"
    if (!input.allow_inherit) {
        const caller = input.host_sandbox ?? input.codex_sandbox ?? null;
        const audit = {
            requested: "inherit",
            effective: "denied",
            ...auditSandboxFields(caller),
            source: "default",
            notes: ["inherit disabled by GROKODEX_ALLOW_INHERIT / allow_inherit=false"],
        };
        return fail(audit, "PERMISSION_DENIED", "permission_mode=inherit is disabled by configuration", "Set GROKODEX_ALLOW_INHERIT=true or use permission_mode=restricted");
    }
    const { sandbox, source } = resolveSandboxSource(input);
    if (sandbox == null) {
        const audit = {
            requested: "inherit",
            effective: "unavailable",
            ...auditSandboxFields(null),
            source: "unavailable",
            notes: [
                "No host_sandbox from caller, env, or config; refuse silent full upgrade.",
            ],
        };
        return fail(audit, "INHERIT_UNAVAILABLE", "inherit requested but host sandbox could not be determined", "Pass host_sandbox (read-only | workspace-write | danger-full-access) or use restricted");
    }
    if (sandbox === "read-only") {
        const audit = {
            requested: "inherit",
            effective: "read-only",
            ...auditSandboxFields(sandbox),
            source,
            notes: [
                "Mapped host read-only → disallowed edit/write tools + restricted shell denies.",
            ],
        };
        return ok(audit, buildReadOnlyCliArgs());
    }
    if (sandbox === "workspace-write") {
        const audit = {
            requested: "inherit",
            effective: "restricted",
            ...auditSandboxFields(sandbox),
            source,
            notes: [
                "Mapped host workspace-write → same capability level as restricted.",
            ],
        };
        return ok(audit, buildRestrictedCliArgs());
    }
    // sandbox === "danger-full-access"
    if (!input.allow_full_access_inherit) {
        const audit = {
            requested: "inherit",
            effective: "denied",
            ...auditSandboxFields(sandbox),
            source,
            notes: [
                "danger-full-access blocked by GROKODEX_ALLOW_FULL_ACCESS_INHERIT / allow_full_access_inherit=false",
            ],
        };
        return fail(audit, "PERMISSION_DENIED", "full-access inherit is disabled by configuration", "Set GROKODEX_ALLOW_FULL_ACCESS_INHERIT=true only if you accept elevated risk");
    }
    const audit = {
        requested: "inherit",
        effective: "danger-full-access",
        ...auditSandboxFields(sandbox),
        source,
        notes: [
            "Full-access inherit: --always-approve enabled; absolute deny list retained.",
            "Capability approximation of host danger-full-access — not a shared OS sandbox token.",
        ],
    };
    return ok(audit, buildFullAccessCliArgs());
}
/**
 * Imagine tool permissions: always restricted-class CLI flags.
 * Narrow write-to-save_dir is enforced in the imagine tool via extra_rules / prompt.
 */
export function resolvePermissionForImagine() {
    const audit = {
        requested: "restricted",
        effective: "restricted-imagine",
        ...auditSandboxFields(null),
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
export function resolvePermissionForXSearch() {
    const audit = {
        requested: "restricted",
        effective: "restricted-x-search",
        ...auditSandboxFields(null),
        source: "default",
        notes: [
            "X search never inherits full shell; edit/write tools disallowed; search-only via prompt.",
        ],
    };
    return ok(audit, buildReadOnlyCliArgs());
}
//# sourceMappingURL=permission.js.map