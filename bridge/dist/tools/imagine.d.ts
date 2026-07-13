import { resolveGrokBinary, type WhichFn } from "../grok-bin.js";
import { resolvePermissionForImagine } from "../permission.js";
import { runGrok } from "../runner.js";
import type { ToolEnvelope } from "../types.js";
export interface GrokImagineArgs {
    prompt: string;
    aspect_ratio?: string;
    /** Directory for saved images; default: `<cwd>/.grokodex/images` */
    save_dir?: string;
    cwd?: string;
    timeout_ms?: number;
    model?: string;
}
export interface GrokImagineDeps {
    resolveBin: typeof resolveGrokBinary;
    /** Defaults to resolvePermissionForImagine; injectable for tests. */
    resolvePermImagine?: typeof resolvePermissionForImagine;
    run: typeof runGrok;
    env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
    existsSync?: (p: string) => boolean;
    whichFn?: WhichFn;
    /** Injectable process.cwd */
    getCwd?: () => string;
}
/**
 * Constrained headless prompt: image generation only, never full shell inherit.
 * Exported for unit tests of prompt assembly.
 */
export declare function buildImaginePrompt(opts: {
    prompt: string;
    saveDirAbs: string;
    aspectRatio: string;
}): string;
/**
 * Extract absolute-looking file paths (prefer image extensions) from free text.
 * Exported for unit tests.
 */
export declare function extractImagePaths(text: string): string[];
/**
 * Run a constrained headless Grok image-generation task.
 * Always uses restricted-class CLI (never full shell inherit).
 * Never throws; all failures are envelope errors.
 */
export declare function handleGrokImagine(args: GrokImagineArgs, deps: GrokImagineDeps): Promise<ToolEnvelope>;
