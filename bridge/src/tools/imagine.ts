import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, isAbsolute, join, resolve } from "node:path";
import type { GrokodexConfig } from "../config.js";
import { failResult, okResult } from "../errors.js";
import {
  findInPath,
  resolveGrokBinary,
  type WhichFn,
} from "../grok-bin.js";
import {
  applyLeaderCliFlags,
  markLeaderRunFallback,
  prepareLeader,
  shouldFallbackAfterLeaderRun,
} from "../leader.js";
import {
  applyNarrowCliArgs,
  parseToolsAllowlist,
} from "../narrow-cli.js";
import {
  resolvePermissionForImagine,
  type ResolvedPermission,
} from "../permission.js";
import {
  parseGrokJsonOutput,
  runGrok,
  type RunGrokRequest,
  type RunGrokResult,
} from "../runner.js";
import type { Artifact, ToolEnvelope } from "../types.js";

export interface GrokImagineArgs {
  prompt: string;
  aspect_ratio?: string;
  /** Directory for saved images; default: `<cwd>/.grokodex/images` */
  save_dir?: string;
  cwd?: string;
  timeout_ms?: number;
  model?: string;
  /** Per-call override for GROKODEX_USE_LEADER. */
  use_leader?: boolean;
}

export interface GrokImagineDeps {
  resolveBin: typeof resolveGrokBinary;
  /** Defaults to resolvePermissionForImagine; injectable for tests. */
  resolvePermImagine?: typeof resolvePermissionForImagine;
  run: typeof runGrok;
  config: GrokodexConfig;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  existsSync?: (p: string) => boolean;
  whichFn?: WhichFn;
  /** Injectable process.cwd */
  getCwd?: () => string;
  prepareLeader?: typeof prepareLeader;
}

const STDERR_TRUNCATE = 2000;

/** Image-like path suffixes used when harvesting artifacts from model text. */
const IMAGE_EXT_RE = /\.(?:png|jpe?g|webp|gif|bmp|svg|heic|avif)\b/i;

/**
 * Constrained headless prompt: image generation only, never full shell inherit.
 * Exported for unit tests of prompt assembly.
 */
export function buildImaginePrompt(opts: {
  prompt: string;
  saveDirAbs: string;
  aspectRatio: string;
}): string {
  const { prompt, saveDirAbs, aspectRatio } = opts;
  return [
    "You are running inside Grokodex. ONLY generate an image with the image generation tool (image_gen).",
    "Do not edit source code or run unrelated shell commands.",
    "Complete in as few turns as possible. Prefer a single image_gen call. Do not spawn subagents.",
    `Save the image under: ${saveDirAbs}`,
    `Aspect ratio: ${aspectRatio}`,
    "User request:",
    prompt,
    "",
    "When done, reply with the absolute path(s) of the saved image file(s).",
    "Prefer a final line like: ARTIFACT: /absolute/path/to/file.png",
    "You may also include a JSON object: {\"artifacts\":[{\"type\":\"image\",\"path\":\"/abs/path.png\"}]}",
    "",
    "## Extra rules",
    `Only write files under: ${saveDirAbs}`,
    "Do not create or modify files outside that directory.",
    "Do not run shell commands except those required to save the image in save_dir.",
  ].join("\n");
}

/**
 * Extract image path strings from free text (absolute, relative, bare filenames).
 * Exported for unit tests. Paths are not resolved here.
 */
export function extractImagePaths(text: string): string[] {
  if (!text.trim()) return [];

  const found: string[] = [];
  const seen = new Set<string>();
  const candidates: string[] = [];

  // ARTIFACT: /path or ARTIFACT path
  const artifactLineRe =
    /ARTIFACT\s*[:=]?\s*[`"'"]?([^\s`"'"]+\.(?:png|jpe?g|webp|gif|bmp|svg|heic|avif))[`"'"]?/gi;
  let m: RegExpExecArray | null;
  while ((m = artifactLineRe.exec(text)) !== null) {
    candidates.push(m[1]!);
  }

  // JSON-ish "path": "..."
  const jsonPathRe =
    /"path"\s*:\s*"((?:\\.|[^"\\])+?\.(?:png|jpe?g|webp|gif|bmp|svg|heic|avif))"/gi;
  while ((m = jsonPathRe.exec(text)) !== null) {
    candidates.push(m[1]!.replace(/\\"/g, '"'));
  }

  // Pure path lines (no prose)
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim().replace(/^[`"'\[\]]+|[`"'\[\],;]+$/g, "");
    if (!line || /\s/.test(line)) continue;
    if (isPathOnly(line) || isBareImageName(line)) candidates.push(line);
  }

  // Markdown / prose image links: ![alt](path) or (path.ext)
  const mdRe =
    /(?:!?\[[^\]]*\]\(|['"`(:=\s])(\.?\.?\/?(?:[\w.@%+\-]+\/)*[\w.@%+\-]+\.(?:png|jpe?g|webp|gif|bmp|svg|heic|avif))(?:\)|['"`\s,]|$)/gi;
  while ((m = mdRe.exec(text)) !== null) {
    candidates.push(m[1]!);
  }

  // Inline Unix absolute paths with image extensions
  const inlineRe =
    /(?:^|[\s"'`(:=])(\/(?:[\w.@%+\-]+\/)+[\w.@%+\-]+\.(?:png|jpe?g|webp|gif|bmp|svg|heic|avif))\b/gi;
  while ((m = inlineRe.exec(text)) !== null) {
    candidates.push(m[1]!);
  }

  // Windows-style paths
  const winRe =
    /(?:^|[\s"'`(:=])([A-Za-z]:\\(?:[^\\/:*?"<>|\r\n]+\\)*[^\\/:*?"<>|\r\n]+\.(?:png|jpe?g|webp|gif|bmp|svg|heic|avif))\b/gi;
  while ((m = winRe.exec(text)) !== null) {
    candidates.push(m[1]!);
  }

  // Bare filenames with image extensions anywhere (e.g. g-plugin-icon.jpg)
  const bareRe =
    /(?:^|[\s"'`(/:=])([\w.@%+\-]+\.(?:png|jpe?g|webp|gif|bmp|svg|heic|avif))\b/gi;
  while ((m = bareRe.exec(text)) !== null) {
    candidates.push(m[1]!);
  }

  for (const c of candidates) {
    const cleaned = c.trim().replace(/[,;:]+$/, "");
    if (!cleaned || seen.has(cleaned)) continue;
    if (!IMAGE_EXT_RE.test(cleaned) && !isPathOnly(cleaned)) continue;
    seen.add(cleaned);
    found.push(cleaned);
  }

  const withExt = found.filter((p) => IMAGE_EXT_RE.test(p));
  return withExt.length > 0 ? withExt : found;
}

/** True if s is a single path token (no spaces), absolute or relative file path. */
function isPathOnly(s: string): boolean {
  if (s.length < 2 || s.length > 1024) return false;
  if (/\s/.test(s)) return false;
  if (isAbsolute(s)) return true;
  if (/^[A-Za-z]:[\\/]/.test(s)) return true;
  if (s.startsWith("./") || s.startsWith("../")) return true;
  // relative path with at least one separator
  if (s.includes("/") || s.includes("\\")) return IMAGE_EXT_RE.test(s);
  return false;
}

function isBareImageName(s: string): boolean {
  if (s.length < 3 || s.length > 255) return false;
  if (/\s/.test(s) || s.includes("/") || s.includes("\\")) return false;
  return IMAGE_EXT_RE.test(s);
}

export interface FsLike {
  existsSync: (p: string) => boolean;
  readdirSync?: (p: string) => string[];
  /** mtime ms; optional for tests */
  mtimeMs?: (p: string) => number;
}

/**
 * Resolve extracted path tokens + scan save_dir into concrete image artifacts.
 * Prefers existing files under saveDirAbs.
 */
export function collectImagineArtifacts(
  text: string,
  saveDirAbs: string,
  cwd: string,
  fs: FsLike = { existsSync },
): { artifacts: Artifact[]; notes: string[] } {
  const notes: string[] = [];
  const ordered: string[] = [];
  const seen = new Set<string>();

  const push = (p: string | undefined | null) => {
    if (!p) return;
    const abs = resolveCandidatePath(p, saveDirAbs, cwd);
    if (!abs || seen.has(abs)) return;
    seen.add(abs);
    ordered.push(abs);
  };

  for (const raw of extractImagePaths(text)) {
    push(raw);
  }

  // Prefer paths that currently exist
  let existing = ordered.filter((p) => fs.existsSync(p));

  // Fallback: scan save_dir for image files (newest first)
  if (existing.length === 0) {
    const scanned = scanSaveDirImages(saveDirAbs, fs);
    if (scanned.length > 0) {
      notes.push(
        `Resolved image path(s) by scanning save_dir (${saveDirAbs}).`,
      );
      for (const p of scanned) push(p);
      existing = ordered.filter((p) => fs.existsSync(p));
    }
  }

  // If nothing exists on disk yet, still return best-effort resolved paths from text
  // so callers get artifacts even when existence check fails (sandbox lag).
  const finalPaths = existing.length > 0 ? existing : ordered;

  const artifacts: Artifact[] = finalPaths.map((path) => ({
    type: "image" as const,
    path,
  }));

  if (artifacts.length === 0) {
    notes.push(
      "No image path found in Grok output; inspect text manually for saved files under save_dir.",
    );
  } else if (existing.length === 0 && ordered.length > 0) {
    notes.push(
      "Image path(s) taken from Grok text but file(s) not found on disk at response time.",
    );
  }

  return { artifacts, notes };
}

function resolveCandidatePath(
  raw: string,
  saveDirAbs: string,
  cwd: string,
): string | null {
  const cleaned = raw.trim().replace(/^['"`]+|['"`]+$/g, "");
  if (!cleaned) return null;

  if (isAbsolute(cleaned) || /^[A-Za-z]:[\\/]/.test(cleaned)) {
    return cleaned;
  }

  // bare filename → under save_dir
  if (
    isBareImageName(cleaned) ||
    (!cleaned.includes("/") && !cleaned.includes("\\") && IMAGE_EXT_RE.test(cleaned))
  ) {
    return resolve(saveDirAbs, basename(cleaned));
  }

  if (cleaned.startsWith("./") || cleaned.startsWith("../")) {
    // Relative to save_dir first (images land there by prompt contract)
    return resolve(saveDirAbs, cleaned);
  }

  // relative with separators: under save_dir
  if (IMAGE_EXT_RE.test(cleaned)) {
    return resolve(saveDirAbs, cleaned);
  }

  return resolve(cwd, cleaned);
}

function scanSaveDirImages(saveDirAbs: string, fs: FsLike): string[] {
  if (!fs.existsSync(saveDirAbs)) return [];
  const read = fs.readdirSync ?? ((p: string) => readdirSync(p));
  const mtime =
    fs.mtimeMs ??
    ((p: string) => {
      try {
        return statSync(p).mtimeMs;
      } catch {
        return 0;
      }
    });

  let names: string[] = [];
  try {
    names = read(saveDirAbs);
  } catch {
    return [];
  }

  const files = names
    .filter((n) => IMAGE_EXT_RE.test(n))
    .map((n) => resolve(saveDirAbs, n))
    .filter((p) => fs.existsSync(p));

  files.sort((a, b) => mtime(b) - mtime(a));
  return files;
}

function defaultWhich(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
): WhichFn {
  return () =>
    findInPath(
      "grok",
      env,
      existsSync,
      join,
      process.platform === "win32" ? ";" : ":",
    );
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + "…";
}

function failWithPermission(
  code: Parameters<typeof failResult>[1],
  message: string,
  hint: string | undefined,
  audit: ResolvedPermission["audit"],
): ToolEnvelope {
  const base = failResult("grok_imagine", code, message, hint);
  return { ...base, permission: audit };
}

function resolveSaveDir(args: GrokImagineArgs, cwd: string): string {
  const raw = args.save_dir?.trim();
  if (raw) {
    return isAbsolute(raw) ? raw : resolve(cwd, raw);
  }
  return resolve(cwd, ".grokodex", "images");
}

/**
 * Run a constrained headless Grok image-generation task.
 * Always uses restricted-class CLI (never full shell inherit).
 * Never throws; all failures are envelope errors.
 */
export async function handleGrokImagine(
  args: GrokImagineArgs,
  deps: GrokImagineDeps,
): Promise<ToolEnvelope> {
  try {
    const prompt = typeof args.prompt === "string" ? args.prompt.trim() : "";
    if (!prompt) {
      return failResult(
        "grok_imagine",
        "INVALID_ARGS",
        "prompt is required and must be a non-empty string",
        "Pass a non-empty prompt describing the image to generate",
      );
    }

    const env = deps.env ?? process.env;
    const exists = deps.existsSync ?? existsSync;
    const whichFn = deps.whichFn ?? defaultWhich(env);
    const getCwd = deps.getCwd ?? (() => process.cwd());
    const resolvePermImagine =
      deps.resolvePermImagine ?? resolvePermissionForImagine;

    const resolved = await Promise.resolve(
      deps.resolveBin(env, { existsSync: exists }, whichFn),
    );
    if ("error" in resolved) {
      return failResult(
        "grok_imagine",
        resolved.error,
        resolved.message,
        "Install the Grok CLI, ensure `grok` is on PATH, or set GROK_PATH",
      );
    }

    const perm = resolvePermImagine();
    if (!perm.ok) {
      // resolvePermissionForImagine always succeeds today; defensive branch.
      return failWithPermission(perm.code, perm.message, perm.hint, perm.audit);
    }

    const cwd = args.cwd?.trim() || getCwd();
    const saveDirAbs = resolveSaveDir(args, cwd);
    const aspectRatio =
      args.aspect_ratio?.trim() && args.aspect_ratio.trim() !== ""
        ? args.aspect_ratio.trim()
        : "auto";

    const fullPrompt = buildImaginePrompt({
      prompt,
      saveDirAbs,
      aspectRatio,
    });

    const timeoutMs =
      typeof args.timeout_ms === "number" && args.timeout_ms > 0
        ? args.timeout_ms
        : deps.config.imagine_timeout_ms;

    const narrowMeta = {
      max_turns: deps.config.imagine_max_turns,
      tools_allowlist: parseToolsAllowlist(deps.config.imagine_tools),
    };

    const prepare = deps.prepareLeader ?? prepareLeader;
    let leader = await prepare(deps.config, args.use_leader, {
      env,
      bin: resolved.path,
      existsSync: exists,
    });
    if (leader.error) {
      return failResult(
        "grok_imagine",
        leader.error.code,
        leader.error.message,
        leader.error.hint,
      );
    }

    const baseCliArgs = [...perm.cliArgs];
    if (args.model !== undefined && args.model.trim() !== "") {
      baseCliArgs.push("-m", args.model.trim());
    }
    baseCliArgs.push("-p", fullPrompt);

    const narrowArgs = applyNarrowCliArgs(baseCliArgs, {
      maxTurns: deps.config.imagine_max_turns,
      toolsCsv: deps.config.imagine_tools,
    });
    const cliArgs = applyLeaderCliFlags(narrowArgs, leader.cli);
    const runReq: RunGrokRequest = {
      bin: resolved.path,
      args: cliArgs,
      cwd,
      timeoutMs,
      env: perm.env,
    };

    let result: RunGrokResult = await deps.run(runReq);

    // One-shot retry when leader-path run fails and config allows fallback.
    if (
      !result.timedOut &&
      result.code !== 0 &&
      shouldFallbackAfterLeaderRun(leader.meta, deps.config)
    ) {
      leader = {
        cli: { use: false, socket: leader.meta.socket },
        meta: markLeaderRunFallback(leader.meta),
      };
      const retryArgs = applyLeaderCliFlags(narrowArgs, leader.cli);
      result = await deps.run({
        ...runReq,
        args: retryArgs,
      });
    }

    if (result.timedOut) {
      return failWithPermission(
        "TIMEOUT",
        `grok timed out after ${timeoutMs}ms`,
        "Increase timeout_ms or simplify the image prompt; default short-path timeout is 120000ms",
        perm.audit,
      );
    }

    if (result.code !== 0) {
      const stderr = truncate(
        result.stderr || result.stdout || "(no output)",
        STDERR_TRUNCATE,
      );
      return failWithPermission(
        "GROK_EXIT_NONZERO",
        `grok exited with code ${result.code ?? "null"}: ${stderr}`,
        "Check prompt / Grok image tool availability; run grok_setup if auth may be wrong",
        perm.audit,
      );
    }

    const parsed = parseGrokJsonOutput(result.stdout);
    const text =
      parsed?.text ??
      (result.stdout.trim() ? result.stdout.trim() : undefined);

    // Include full stdout in harvest so nested JSON / mixed logs still yield paths
    const harvestText = [text ?? "", result.stdout ?? "", result.stderr ?? ""]
      .filter(Boolean)
      .join("\n");

    const { artifacts, notes: harvestNotes } = collectImagineArtifacts(
      harvestText,
      saveDirAbs,
      cwd,
      {
        existsSync: exists,
        readdirSync: (p) => readdirSync(p),
        mtimeMs: (p) => {
          try {
            return statSync(p).mtimeMs;
          } catch {
            return 0;
          }
        },
      },
    );

    const notes: string[] = [...perm.audit.notes, ...harvestNotes];

    return okResult("grok_imagine", {
      text,
      session_id: parsed?.sessionId,
      permission_mode: "restricted",
      permission: { ...perm.audit, notes },
      // Always set artifacts array when non-empty so MCP clients can rely on the field
      artifacts: artifacts.length > 0 ? artifacts : undefined,
      meta: {
        duration_ms: result.durationMs,
        cwd,
        save_dir: saveDirAbs,
        aspect_ratio: aspectRatio,
        model: args.model,
        exit_code: result.code,
        artifact_count: artifacts.length,
        leader: leader.meta,
        ...narrowMeta,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failResult(
      "grok_imagine",
      "GROK_EXIT_NONZERO",
      `grok_imagine failed: ${message}`,
      "Retry; if it persists, check GROK_PATH and local Grok CLI image support",
    );
  }
}
