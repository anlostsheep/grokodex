import type { PermissionAudit, SessionMeta } from "./types.js";
export interface FingerprintInput {
    audit: PermissionAudit;
    /** Full permission CLI args (before -p / leader / resume). */
    cliArgs: string[];
    cwd: string;
    model?: string;
    /** True when argv implies always-approve / full bypass class. */
    alwaysApprove: boolean;
}
export interface SessionMapStore {
    get(hostThreadId: string, fingerprint: string): string | null;
    set(hostThreadId: string, fingerprint: string, grokSessionId: string): void;
}
export interface SessionPlan {
    resumeSid: string | null;
    shouldUpdateMap: boolean;
    meta: SessionMeta;
}
export interface ResolveSessionPlanInput {
    map: SessionMapStore;
    hostThreadId: string | null;
    fingerprint: string;
    fresh: boolean;
    explicitSessionId: string | null;
    reuseEnabled: boolean;
}
/** Normalize host thread id; add codex:/claude: prefix when env hints allow. */
export declare function normalizeHostThreadId(raw: string | undefined, env: NodeJS.ProcessEnv | Record<string, string | undefined>): string | null;
/**
 * Stable permission fingerprint (spec §5).
 * Includes effective audit fields, sorted deny/allow tokens, cwd, model, alwaysApprove.
 */
export declare function buildPermissionFingerprint(input: FingerprintInput): string;
export declare function createSessionMap(opts?: {
    maxEntries?: number;
}): SessionMapStore;
export declare function getDefaultSessionMap(): SessionMapStore;
/** Test helper: reset singleton. */
export declare function resetDefaultSessionMapForTests(): void;
export declare function resolveSessionPlan(input: ResolveSessionPlanInput): SessionPlan;
export declare function applyResumeCliFlags(args: string[], resumeSid: string | null): string[];
export declare function markSessionMapUpdated(meta: SessionMeta, updated: boolean): SessionMeta;
export declare function attachGrokSessionId(meta: SessionMeta, sid: string | undefined): SessionMeta;
