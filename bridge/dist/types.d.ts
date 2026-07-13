export type ErrorCode = "GROK_NOT_FOUND" | "GROK_NOT_LOGGED_IN" | "TIMEOUT" | "PERMISSION_DENIED" | "INVALID_ARGS" | "GROK_EXIT_NONZERO" | "INHERIT_UNAVAILABLE";
export type PermissionMode = "restricted" | "inherit";
export type CodexSandbox = "read-only" | "workspace-write" | "danger-full-access";
export type CodexApproval = "untrusted" | "on-failure" | "on-request" | "never";
export type ToolName = "grok_run" | "grok_imagine" | "grok_x_search" | "grok_setup";
export interface PermissionAudit {
    requested: PermissionMode;
    effective: string;
    codex_sandbox: CodexSandbox | null;
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
