export type ErrorCode = "GROK_NOT_FOUND" | "GROK_NOT_LOGGED_IN" | "TIMEOUT" | "PERMISSION_DENIED" | "INVALID_ARGS" | "GROK_EXIT_NONZERO" | "INHERIT_UNAVAILABLE";
export type PermissionMode = "restricted" | "inherit";
/** Host capability band for permission_mode=inherit (Codex/Claude/etc.). */
export type HostSandbox = "read-only" | "workspace-write" | "danger-full-access";
/** @deprecated Prefer HostSandbox; kept as alias for callers and audit mirror. */
export type CodexSandbox = HostSandbox;
export type HostApproval = "untrusted" | "on-failure" | "on-request" | "never";
/** @deprecated Prefer HostApproval. */
export type CodexApproval = HostApproval;
export type ToolName = "grok_run" | "grok_imagine" | "grok_x_search" | "grok_setup";
export interface PermissionAudit {
    requested: PermissionMode;
    effective: string;
    /** Canonical host capability band used for inherit mapping. */
    host_sandbox: HostSandbox | null;
    /**
     * Mirror of host_sandbox for backward-compatible consumers.
     * Prefer reading host_sandbox.
     */
    codex_sandbox: HostSandbox | null;
    source: "default" | "caller_args" | "env" | "config_toml" | "unavailable";
    notes: string[];
}
export interface Artifact {
    type: "image" | "file";
    path: string;
}
export type ToolEnvelope = {
    ok: true;
    tool: ToolName;
    session_id?: string;
    permission_mode?: PermissionMode;
    permission?: PermissionAudit;
    text?: string;
    results?: unknown[];
    artifacts?: Artifact[];
    meta?: Record<string, unknown>;
} | {
    ok: false;
    tool: ToolName;
    error: {
        code: ErrorCode;
        message: string;
        hint?: string;
    };
    permission?: PermissionAudit;
};
export type LeaderMode = "shared" | "isolated" | "off";
export interface LeaderMeta {
    requested: boolean;
    used: boolean;
    mode: LeaderMode;
    socket: string | null;
    ensured: boolean;
    fallback: boolean;
    fallback_reason: string | null;
}
export type SessionResumeReason = "host_map_hit" | "explicit_session_id" | "fresh_requested" | "no_host_key" | "map_miss" | "fingerprint_miss" | "permission_changed" | "resume_failed_fallback" | "reuse_disabled";
export interface SessionMeta {
    resumed: boolean;
    reason: SessionResumeReason;
    host_thread_id: string | null;
    fingerprint: string | null;
    grok_session_id: string | null;
    map_updated: boolean;
}
