import { spawn as defaultSpawn, type ChildProcess, type SpawnOptions } from "node:child_process";

export interface RunGrokRequest {
  bin: string;
  /** Full argv after bin; must include -p / --single for headless use. */
  args: string[];
  cwd: string;
  timeoutMs: number;
  env?: Record<string, string>;
}

export interface RunGrokResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  durationMs: number;
}

export type SpawnFn = (
  command: string,
  args: readonly string[],
  options: SpawnOptions,
) => ChildProcess;

export interface RunGrokDeps {
  spawn?: SpawnFn;
  /** Delay after SIGTERM before SIGKILL (ms). */
  killGraceMs?: number;
  now?: () => number;
}

const KILL_GRACE_MS_DEFAULT = 200;

/** Global mutex: only one grok child at a time. */
let chain: Promise<void> = Promise.resolve();

/** @internal Reset serial queue between unit tests. */
export function resetRunGrokQueueForTests(): void {
  chain = Promise.resolve();
}

/**
 * Run a single grok process under the global serial mutex.
 * Concurrent callers queue; the next spawn starts only after the previous child closes.
 */
export function runGrok(req: RunGrokRequest, deps: RunGrokDeps = {}): Promise<RunGrokResult> {
  const run = () => executeOne(req, deps);
  const result = chain.then(run, run);
  chain = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function executeOne(req: RunGrokRequest, deps: RunGrokDeps): Promise<RunGrokResult> {
  const spawnFn = deps.spawn ?? defaultSpawn;
  const killGraceMs = deps.killGraceMs ?? KILL_GRACE_MS_DEFAULT;
  const now = deps.now ?? Date.now;
  const started = now();

  return new Promise<RunGrokResult>((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    let termTimer: ReturnType<typeof setTimeout> | undefined;

    const finish = (code: number | null) => {
      if (settled) return;
      settled = true;
      if (termTimer !== undefined) clearTimeout(termTimer);
      if (killTimer !== undefined) clearTimeout(killTimer);
      resolve({
        code,
        stdout,
        stderr,
        timedOut,
        durationMs: Math.max(0, now() - started),
      });
    };

    let child: ChildProcess;
    try {
      child = spawnFn(req.bin, req.args, {
        cwd: req.cwd,
        env: req.env ? { ...process.env, ...req.env } : process.env,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      resolve({
        code: null,
        stdout: "",
        stderr: message,
        timedOut: false,
        durationMs: Math.max(0, now() - started),
      });
      return;
    }

    child.stdout?.on("data", (chunk: Buffer | string) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderr += String(chunk);
    });

    child.on("error", (err: Error) => {
      if (!stderr) stderr = err.message;
      finish(null);
    });

    child.on("close", (code: number | null) => {
      finish(code);
    });

    if (req.timeoutMs > 0) {
      termTimer = setTimeout(() => {
        if (settled) return;
        timedOut = true;
        try {
          child.kill("SIGTERM");
        } catch {
          /* ignore */
        }
        killTimer = setTimeout(() => {
          if (settled) return;
          try {
            child.kill("SIGKILL");
          } catch {
            /* ignore */
          }
        }, killGraceMs);
      }, req.timeoutMs);
    }
  });
}

export interface ParsedGrokJson {
  text?: string;
  sessionId?: string;
  raw: unknown;
}

/**
 * Parse grok `--output-format json` stdout.
 * Accepts a bare object, last non-empty JSON line, or last brace-balanced object
 * embedded in log noise. Returns null when no object can be recovered.
 */
export function parseGrokJsonOutput(stdout: string): ParsedGrokJson | null {
  const trimmed = stdout.trim();
  if (!trimmed) return null;

  const whole = tryParseObject(trimmed);
  if (whole) return whole;

  const lines = trimmed.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]!.trim();
    if (!line) continue;
    const parsed = tryParseObject(line);
    if (parsed) return parsed;
  }

  return extractLastJsonObject(trimmed);
}

function tryParseObject(s: string): ParsedGrokJson | null {
  try {
    const raw: unknown = JSON.parse(s);
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      return null;
    }
    return normalizeParsed(raw as Record<string, unknown>);
  } catch {
    return null;
  }
}

function normalizeParsed(raw: Record<string, unknown>): ParsedGrokJson {
  const text =
    typeof raw.text === "string"
      ? raw.text
      : typeof raw.result === "string"
        ? raw.result
        : typeof raw.message === "string"
          ? raw.message
          : undefined;

  const sessionId =
    typeof raw.sessionId === "string"
      ? raw.sessionId
      : typeof raw.session_id === "string"
        ? raw.session_id
        : undefined;

  return { text, sessionId, raw };
}

/** Scan for the last brace-balanced `{...}` substring that parses as a JSON object. */
function extractLastJsonObject(s: string): ParsedGrokJson | null {
  const ends: number[] = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "}") ends.push(i);
  }

  for (let e = ends.length - 1; e >= 0; e--) {
    const end = ends[e]!;
    let depth = 0;
    for (let i = end; i >= 0; i--) {
      const c = s[i];
      if (c === "}") depth++;
      else if (c === "{") {
        depth--;
        if (depth === 0) {
          const candidate = s.slice(i, end + 1);
          const parsed = tryParseObject(candidate);
          if (parsed) return parsed;
          break;
        }
      }
    }
  }
  return null;
}
