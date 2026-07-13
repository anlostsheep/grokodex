import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { failResult, okResult } from "../errors.js";
import { checkGrokAuth, type AuthCheckResult, type RunCmd } from "../auth-check.js";
import {
  findInPath,
  resolveGrokBinary,
  type ResolveGrokResult,
  type WhichFn,
} from "../grok-bin.js";
import type { ToolEnvelope } from "../types.js";

export interface SetupDeps {
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  resolveBin?: (
    env: NodeJS.ProcessEnv | Record<string, string | undefined>,
    pathModule: { existsSync: (p: string) => boolean },
    whichFn: WhichFn,
  ) => ResolveGrokResult | Promise<ResolveGrokResult>;
  checkAuth?: (
    bin: string,
    runCmd: RunCmd,
  ) => AuthCheckResult | Promise<AuthCheckResult>;
  existsSync?: (p: string) => boolean;
  whichFn?: WhichFn;
  runCmd?: RunCmd;
}

function defaultRunCmd(bin: string, args: string[]): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
}> {
  return new Promise((resolve) => {
    const child = spawn(bin, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer | string) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderr += String(chunk);
    });
    child.on("error", (err) => {
      resolve({ exitCode: 1, stdout, stderr: err.message });
    });
    child.on("close", (code) => {
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });
  });
}

function defaultWhich(env: NodeJS.ProcessEnv | Record<string, string | undefined>): WhichFn {
  return () =>
    findInPath("grok", env, existsSync, join, process.platform === "win32" ? ";" : ":");
}

function buildSuccessText(
  grokPath: string,
  auth: AuthCheckResult,
): string {
  const lines = [
    `Grok found at ${grokPath}`,
    `version: ${auth.version ?? "unknown"}`,
    `auth_ok: ${auth.auth_ok}`,
  ];
  if (auth.detail) lines.push(`detail: ${auth.detail}`);
  if (!auth.auth_ok) {
    lines.push(
      "Next steps: run `grok login` (or the CLI auth flow) so ~/.grok/auth.json is present, then re-run grok_setup.",
    );
  } else {
    lines.push("Ready. You can use grok_run, grok_imagine, and grok_x_search.");
  }
  return lines.join("\n");
}

/**
 * Diagnostic tool: locate grok, report version and login health.
 * Never throws; never prints secrets from auth.json.
 */
export async function handleSetup(
  _args: Record<string, unknown> = {},
  deps: SetupDeps = {},
): Promise<ToolEnvelope> {
  try {
    const env = deps.env ?? process.env;
    const exists = deps.existsSync ?? existsSync;
    const whichFn = deps.whichFn ?? defaultWhich(env);
    const resolveBin = deps.resolveBin ?? resolveGrokBinary;
    const checkAuth = deps.checkAuth ?? checkGrokAuth;
    const runCmd = deps.runCmd ?? defaultRunCmd;

    const resolved = await Promise.resolve(resolveBin(env, { existsSync: exists }, whichFn));
    if ("error" in resolved) {
      return failResult(
        "grok_setup",
        resolved.error,
        resolved.message,
        "Install the Grok CLI, ensure `grok` is on PATH, or set GROK_PATH to the binary.",
      );
    }

    const auth = await Promise.resolve(checkAuth(resolved.path, runCmd));

    return okResult("grok_setup", {
      text: buildSuccessText(resolved.path, auth),
      meta: {
        grok_path: resolved.path,
        version: auth.version,
        auth_ok: auth.auth_ok,
        detail: auth.detail,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failResult(
      "grok_setup",
      "GROK_EXIT_NONZERO",
      `setup failed: ${message}`,
      "Retry grok_setup; if it persists, check GROK_PATH and local Grok CLI install.",
    );
  }
}
