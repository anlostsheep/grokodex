export interface RunCmdResult {
    exitCode: number;
    stdout: string;
    stderr: string;
}
export type RunCmd = (bin: string, args: string[]) => Promise<RunCmdResult>;
export interface AuthCheckResult {
    version?: string;
    auth_ok: boolean;
    /** Safe human-readable status; never include secrets from auth.json. */
    detail?: string;
}
export interface AuthCheckOptions {
    /** Override auth file path (default: ~/.grok/auth.json). */
    authFilePath?: string;
    existsSync?: (path: string) => boolean;
    /** Return file size in bytes; used to detect non-empty without reading contents. */
    fileSize?: (path: string) => number | null;
    /** Optional reader — only used to check non-emptiness; contents never returned. */
    readFileSync?: (path: string) => string;
    homeDir?: string;
}
/**
 * Probe grok version and login health without side effects.
 * Never returns or logs contents of auth.json.
 */
export declare function checkGrokAuth(bin: string, runCmd: RunCmd, opts?: AuthCheckOptions): Promise<AuthCheckResult>;
