import { createHash } from "node:crypto";
function emptyMeta(partial) {
    return {
        resumed: false,
        host_thread_id: null,
        fingerprint: null,
        grok_session_id: null,
        map_updated: false,
        ...partial,
    };
}
/** Normalize host thread id; add codex:/claude: prefix when env hints allow. */
export function normalizeHostThreadId(raw, env) {
    const t = typeof raw === "string" ? raw.trim() : "";
    if (!t)
        return null;
    if (t.startsWith("codex:") || t.startsWith("claude:"))
        return t;
    if (env.CLAUDECODE === "1" || env.CLAUDE_CODE_ENTRYPOINT) {
        return `claude:${t}`;
    }
    const origin = env.CODEX_INTERNAL_ORIGINATOR_OVERRIDE?.toLowerCase() ?? "";
    if (origin.includes("codex") || env.CODEX_THREAD_ID || env.CODEX_SHELL === "1") {
        return `codex:${t}`;
    }
    return t;
}
function extractDenyAllowTokens(cliArgs) {
    const out = [];
    for (let i = 0; i < cliArgs.length; i++) {
        const a = cliArgs[i];
        if ((a === "--deny" || a === "--allow" || a === "--disallowed-tools" || a === "--tools") &&
            i + 1 < cliArgs.length) {
            out.push(`${a}=${cliArgs[i + 1]}`);
        }
        if (a === "--always-approve")
            out.push(a);
    }
    return out.sort();
}
/**
 * Stable permission fingerprint (spec §5).
 * Includes effective audit fields, sorted deny/allow tokens, cwd, model, alwaysApprove.
 */
export function buildPermissionFingerprint(input) {
    const cwd = input.cwd.trim() || ".";
    const model = (input.model?.trim() || "default");
    const tokens = extractDenyAllowTokens(input.cliArgs);
    const payload = {
        v: 1,
        requested: input.audit.requested,
        effective: input.audit.effective,
        host_sandbox: input.audit.host_sandbox,
        alwaysApprove: input.alwaysApprove || tokens.includes("--always-approve"),
        tokens,
        cwd,
        model,
    };
    const json = JSON.stringify(payload);
    const hash = createHash("sha256").update(json).digest("hex").slice(0, 16);
    return `v1|${hash}`;
}
export function createSessionMap(opts = {}) {
    const maxEntries = opts.maxEntries ?? 200;
    const entries = [];
    function key(h, f) {
        return `${h}\0${f}`;
    }
    const index = new Map();
    return {
        get(hostThreadId, fingerprint) {
            const e = index.get(key(hostThreadId, fingerprint));
            return e?.grokSessionId ?? null;
        },
        set(hostThreadId, fingerprint, grokSessionId) {
            const k = key(hostThreadId, fingerprint);
            const existing = index.get(k);
            if (existing) {
                existing.grokSessionId = grokSessionId;
                existing.updatedAt = Date.now();
                return;
            }
            const entry = {
                hostThreadId,
                fingerprint,
                grokSessionId,
                updatedAt: Date.now(),
            };
            index.set(k, entry);
            entries.push(entry);
            while (entries.length > maxEntries) {
                const old = entries.shift();
                if (!old)
                    break;
                const ok = key(old.hostThreadId, old.fingerprint);
                const cur = index.get(ok);
                if (cur === old)
                    index.delete(ok);
            }
        },
    };
}
/** Process-wide default map (bridge singleton). Tests inject their own. */
let defaultMap = null;
export function getDefaultSessionMap() {
    if (!defaultMap)
        defaultMap = createSessionMap();
    return defaultMap;
}
/** Test helper: reset singleton. */
export function resetDefaultSessionMapForTests() {
    defaultMap = null;
}
export function resolveSessionPlan(input) {
    const host = input.hostThreadId;
    const fp = input.fingerprint;
    const base = (reason, extra = {}) => emptyMeta({
        reason,
        host_thread_id: host,
        fingerprint: fp,
        ...extra,
    });
    if (input.fresh) {
        return {
            resumeSid: null,
            shouldUpdateMap: Boolean(host),
            meta: base("fresh_requested", { resumed: false }),
        };
    }
    const explicit = input.explicitSessionId?.trim() || null;
    if (explicit) {
        return {
            resumeSid: explicit,
            shouldUpdateMap: Boolean(host),
            meta: base("explicit_session_id", {
                resumed: true,
                grok_session_id: explicit,
            }),
        };
    }
    if (!input.reuseEnabled) {
        return {
            resumeSid: null,
            shouldUpdateMap: false,
            meta: base("reuse_disabled"),
        };
    }
    if (!host) {
        return {
            resumeSid: null,
            shouldUpdateMap: false,
            meta: base("no_host_key"),
        };
    }
    const hit = input.map.get(host, fp);
    if (hit) {
        return {
            resumeSid: hit,
            shouldUpdateMap: true,
            meta: base("host_map_hit", {
                resumed: true,
                grok_session_id: hit,
            }),
        };
    }
    // Spec: fingerprint miss when host has other slots is still "fingerprint_miss"
    // for this simple map API (no list-by-host). map_miss when never seen is fine same reason.
    return {
        resumeSid: null,
        shouldUpdateMap: true,
        meta: base("fingerprint_miss"),
    };
}
export function applyResumeCliFlags(args, resumeSid) {
    if (!resumeSid)
        return [...args];
    return [...args, "--resume", resumeSid];
}
export function markSessionMapUpdated(meta, updated) {
    return { ...meta, map_updated: updated };
}
export function attachGrokSessionId(meta, sid) {
    return {
        ...meta,
        grok_session_id: sid ?? meta.grok_session_id,
    };
}
//# sourceMappingURL=session-map.js.map