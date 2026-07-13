import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync, readFileSync, statSync } from "node:fs";

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

function defaultFileSize(path: string): number | null {
  try {
    return statSync(path).size;
  } catch {
    return null;
  }
}

function parseVersion(stdout: string, stderr: string): string | undefined {
  const text = `${stdout}\n${stderr}`.trim();
  if (!text) return undefined;
  // Prefer first non-empty line; strip common prefixes like "grok "
  const line = text.split(/\r?\n/).map((l) => l.trim()).find(Boolean);
  if (!line) return undefined;
  const m = line.match(/(\d+\.\d+\.\d+(?:[-+][\w.]+)?)/);
  if (m) return m[1];
  // Fall back to whole first line if it looks version-like / short
  if (line.length <= 80) return line.replace(/^grok\s+/i, "").trim() || undefined;
  return undefined;
}

/**
 * Probe grok version and login health without side effects.
 * Never returns or logs contents of auth.json.
 */
export async function checkGrokAuth(
  bin: string,
  runCmd: RunCmd,
  opts: AuthCheckOptions = {},
): Promise<AuthCheckResult> {
  let version: string | undefined;
  const notes: string[] = [];

  try {
    const ver = await runCmd(bin, ["--version"]);
    version = parseVersion(ver.stdout, ver.stderr);
    if (ver.exitCode !== 0 && !version) {
      notes.push(`grok --version exited ${ver.exitCode}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    notes.push(`grok --version failed: ${msg}`);
  }

  const home = opts.homeDir ?? homedir();
  const authPath = opts.authFilePath ?? join(home, ".grok", "auth.json");
  const exists = opts.existsSync ?? existsSync;
  const fileSize = opts.fileSize ?? defaultFileSize;

  let auth_ok = false;

  if (exists(authPath)) {
    const size = fileSize(authPath);
    if (size !== null && size > 0) {
      auth_ok = true;
      notes.push("auth file present");
    } else if (size === 0) {
      notes.push("auth file empty");
    } else {
      // size unknown — try non-empty read without retaining content
      try {
        const read = opts.readFileSync ?? ((p: string) => readFileSync(p, "utf8"));
        const raw = read(authPath);
        if (raw && raw.trim().length > 0) {
          auth_ok = true;
          notes.push("auth file present");
        } else {
          notes.push("auth file empty");
        }
      } catch {
        notes.push("auth file unreadable");
      }
    }
  } else {
    notes.push("auth file missing");
  }

  // Optional harmless CLI probe when auth file check failed
  if (!auth_ok) {
    try {
      const probe = await runCmd(bin, ["plugin", "list"]);
      if (probe.exitCode === 0) {
        auth_ok = true;
        notes.push("plugin list succeeded");
      } else {
        notes.push("plugin list not authenticated");
      }
    } catch {
      // ignore — auth_ok stays false
    }
  }

  return {
    version,
    auth_ok,
    detail: notes.join("; ") || undefined,
  };
}
