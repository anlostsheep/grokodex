import type { CodexApproval, CodexSandbox, PermissionAudit, PermissionMode } from "./types.js";
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
export type ResolvedPermission = {
    ok: true;
    audit: PermissionAudit;
    /** args after `grok` binary, before -p */
    cliArgs: string[];
    /** extra env for child */
    env?: Record<string, string>;
} | {
    ok: false;
    audit: PermissionAudit;
    code: "INHERIT_UNAVAILABLE" | "PERMISSION_DENIED";
    message: string;
    hint?: string;
};
/**
 * Map restricted / inherit (+ Codex sandbox) to Grok CLI flags.
 * Calibrated against local `grok --help` (`--deny`, `--always-approve`,
 * `--disallowed-tools`, `--output-format`, `--max-turns`).
 */
export declare function resolvePermission(input: PermissionInput): ResolvedPermission;
/**
 * Imagine tool permissions: always restricted-class CLI flags.
 * Narrow write-to-save_dir is enforced in the imagine tool via extra_rules / prompt.
 */
export declare function resolvePermissionForImagine(): ResolvedPermission;
/**
 * X search permissions: restricted-class + disallowed edit tools (read-only).
 * Never inherits full shell; search-only constraints enforced in the tool prompt.
 */
export declare function resolvePermissionForXSearch(): ResolvedPermission;
