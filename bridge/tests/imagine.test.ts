import { describe, it, expect, vi } from "vitest";
import {
  buildImaginePrompt,
  collectImagineArtifacts,
  extractImagePaths,
  handleGrokImagine,
} from "../src/tools/imagine.js";
import type { ResolvedPermission } from "../src/permission.js";
import type { RunGrokResult } from "../src/runner.js";
import type { ResolveGrokResult } from "../src/grok-bin.js";

const imaginePerm: ResolvedPermission = {
  ok: true,
  audit: {
    requested: "restricted",
    effective: "restricted-imagine",
    codex_sandbox: null,
    source: "default",
    notes: ["Imagine never inherits full shell; write narrowed to save_dir."],
  },
  cliArgs: [
    "--output-format",
    "json",
    "--max-turns",
    "30",
    "--deny",
    "Bash(sudo*)",
  ],
};

function mockDeps(overrides: {
  resolveBin?: () => ResolveGrokResult | Promise<ResolveGrokResult>;
  resolvePermImagine?: () => ResolvedPermission;
  run?: () => RunGrokResult | Promise<RunGrokResult>;
  getCwd?: () => string;
} = {}) {
  return {
    resolveBin: vi.fn(
      overrides.resolveBin ??
        (async () => ({ path: "/opt/grok" }) as ResolveGrokResult),
    ),
    resolvePermImagine: vi.fn(
      overrides.resolvePermImagine ?? (() => imaginePerm),
    ),
    run: vi.fn(
      overrides.run ??
        (async () =>
          ({
            code: 0,
            stdout: JSON.stringify({
              text: "Saved image to /tmp/work/.grokodex/images/out.png",
              session_id: "img-sess-1",
            }),
            stderr: "",
            timedOut: false,
            durationMs: 99,
          }) satisfies RunGrokResult),
    ),
    getCwd: overrides.getCwd ?? (() => "/tmp/work"),
  };
}

describe("buildImaginePrompt", () => {
  it("includes ONLY generate, absolute save_dir, aspect ratio, and user prompt", () => {
    const p = buildImaginePrompt({
      prompt: "a red fox in snow",
      saveDirAbs: "/tmp/work/.grokodex/images",
      aspectRatio: "16:9",
    });
    expect(p).toContain("ONLY generate an image");
    expect(p).toContain("Save the image under: /tmp/work/.grokodex/images");
    expect(p).toContain("Aspect ratio: 16:9");
    expect(p).toContain("a red fox in snow");
    expect(p).toContain("Only write files under: /tmp/work/.grokodex/images");
    expect(p).not.toMatch(/inherit|full.?access|always-approve/i);
  });
});

describe("extractImagePaths", () => {
  it("pulls absolute image paths from free text", () => {
    const paths = extractImagePaths(
      "Done.\n/Users/me/.grokodex/images/cat.png\nAlso see /tmp/other.txt",
    );
    expect(paths).toContain("/Users/me/.grokodex/images/cat.png");
    expect(paths.every((p) => /\.(png|jpe?g|webp|gif)/i.test(p))).toBe(true);
  });

  it("pulls bare image filenames like Grok often returns", () => {
    const paths = extractImagePaths(
      "Generated icon.\nPath: g-plugin-icon.jpg\n34 KB",
    );
    expect(paths).toContain("g-plugin-icon.jpg");
  });

  it("pulls ARTIFACT: lines and JSON path fields", () => {
    const paths = extractImagePaths(
      'ARTIFACT: /tmp/work/.grokodex/images/a.png\n{"path":"/tmp/work/.grokodex/images/b.webp"}',
    );
    expect(paths).toContain("/tmp/work/.grokodex/images/a.png");
    expect(paths).toContain("/tmp/work/.grokodex/images/b.webp");
  });
});

describe("collectImagineArtifacts", () => {
  it("resolves bare filename under save_dir and sets artifacts", () => {
    const saveDir = "/tmp/work/.grokodex/images";
    const abs = `${saveDir}/g-plugin-icon.jpg`;
    const { artifacts, notes } = collectImagineArtifacts(
      "saved as g-plugin-icon.jpg",
      saveDir,
      "/tmp/work",
      {
        existsSync: (p) => p === abs || p === saveDir,
        readdirSync: () => ["g-plugin-icon.jpg"],
        mtimeMs: () => 100,
      },
    );
    expect(artifacts).toEqual([{ type: "image", path: abs }]);
    expect(notes.some((n) => /no image path/i.test(n))).toBe(false);
  });

  it("scans save_dir when text has no path", () => {
    const saveDir = "/tmp/work/.grokodex/images";
    const abs = `${saveDir}/newest.png`;
    const { artifacts, notes } = collectImagineArtifacts(
      "Image generated successfully.",
      saveDir,
      "/tmp/work",
      {
        existsSync: (p) => p === saveDir || p === abs || p.endsWith(".png"),
        readdirSync: () => ["older.jpg", "newest.png"],
        mtimeMs: (p) => (p.endsWith("newest.png") ? 200 : 100),
      },
    );
    expect(artifacts[0]?.path).toBe(abs);
    expect(notes.some((n) => /scanning save_dir/i.test(n))).toBe(true);
  });
});

describe("handleGrokImagine", () => {
  it("returns INVALID_ARGS when prompt is missing or empty", async () => {
    const deps = mockDeps();
    const empty = await handleGrokImagine({ prompt: "" }, deps);
    expect(empty.ok).toBe(false);
    if (!empty.ok) {
      expect(empty.error.code).toBe("INVALID_ARGS");
      expect(empty.tool).toBe("grok_imagine");
    }

    const whitespace = await handleGrokImagine({ prompt: "   " }, deps);
    expect(whitespace.ok).toBe(false);
    if (!whitespace.ok) {
      expect(whitespace.error.code).toBe("INVALID_ARGS");
    }

    expect(deps.resolveBin).not.toHaveBeenCalled();
    expect(deps.run).not.toHaveBeenCalled();
  });

  it("assembles constrained prompt with default save_dir under cwd", async () => {
    const deps = mockDeps();
    await handleGrokImagine({ prompt: "sunset over mountains" }, deps);

    expect(deps.resolvePermImagine).toHaveBeenCalledOnce();
    expect(deps.run).toHaveBeenCalledOnce();
    const runReq = deps.run.mock.calls[0]![0];
    expect(runReq.bin).toBe("/opt/grok");
    expect(runReq.cwd).toBe("/tmp/work");
    expect(runReq.args).toContain("--output-format");
    expect(runReq.args).toContain("--deny");
    expect(runReq.args).not.toContain("--always-approve");

    const pIdx = runReq.args.indexOf("-p");
    expect(pIdx).toBeGreaterThanOrEqual(0);
    const fullPrompt = runReq.args[pIdx + 1] as string;
    expect(fullPrompt).toContain("ONLY generate an image");
    expect(fullPrompt).toContain("Save the image under: /tmp/work/.grokodex/images");
    expect(fullPrompt).toContain("Aspect ratio: auto");
    expect(fullPrompt).toContain("sunset over mountains");
  });

  it("uses custom save_dir and aspect_ratio in the prompt", async () => {
    const deps = mockDeps();
    await handleGrokImagine(
      {
        prompt: "logo mark",
        save_dir: "/var/out/imgs",
        aspect_ratio: "1:1",
      },
      deps,
    );

    const runReq = deps.run.mock.calls[0]![0];
    const fullPrompt = runReq.args[runReq.args.indexOf("-p") + 1] as string;
    expect(fullPrompt).toContain("Save the image under: /var/out/imgs");
    expect(fullPrompt).toContain("Aspect ratio: 1:1");
    expect(fullPrompt).toContain("Only write files under: /var/out/imgs");
  });

  it("returns artifacts from paths in Grok text", async () => {
    const deps = mockDeps();
    const env = await handleGrokImagine({ prompt: "cat" }, deps);

    expect(env.ok).toBe(true);
    if (env.ok) {
      expect(env.tool).toBe("grok_imagine");
      expect(env.artifacts).toEqual([
        { type: "image", path: "/tmp/work/.grokodex/images/out.png" },
      ]);
      expect(env.session_id).toBe("img-sess-1");
      expect(env.permission_mode).toBe("restricted");
      expect(env.permission?.effective).toBe("restricted-imagine");
      expect(env.meta?.save_dir).toBe("/tmp/work/.grokodex/images");
    }
  });

  it("ok with notes when exit 0 but no image path and empty save_dir", async () => {
    const deps = mockDeps({
      run: async () => ({
        code: 0,
        stdout: JSON.stringify({ text: "Image generated successfully." }),
        stderr: "",
        timedOut: false,
        durationMs: 10,
      }),
    });
    // No files on disk under save_dir
    deps.existsSync = () => false;

    const env = await handleGrokImagine({ prompt: "dog" }, deps);
    expect(env.ok).toBe(true);
    if (env.ok) {
      expect(env.artifacts).toBeUndefined();
      expect(env.permission?.notes.some((n) => /no image path/i.test(n))).toBe(
        true,
      );
      expect(env.text).toMatch(/generated successfully/i);
    }
  });

  it("returns artifacts when Grok only prints bare filename", async () => {
    const abs = "/tmp/work/.grokodex/images/g-plugin-icon.jpg";
    const deps = mockDeps({
      run: async () => ({
        code: 0,
        stdout: JSON.stringify({
          text: "Done. Path: g-plugin-icon.jpg",
        }),
        stderr: "",
        timedOut: false,
        durationMs: 50,
      }),
    });
    deps.existsSync = (p: string) =>
      p === abs ||
      p === "/tmp/work/.grokodex/images" ||
      p === "/opt/grok";

    const env = await handleGrokImagine({ prompt: "icon" }, deps);
    expect(env.ok).toBe(true);
    if (env.ok) {
      expect(env.artifacts).toEqual([{ type: "image", path: abs }]);
      expect(env.meta?.artifact_count).toBe(1);
    }
  });

  it("returns GROK_NOT_FOUND when binary is missing", async () => {
    const deps = mockDeps({
      resolveBin: async () => ({
        error: "GROK_NOT_FOUND",
        message: "grok binary not found on PATH",
      }),
    });

    const env = await handleGrokImagine({ prompt: "hi" }, deps);
    expect(env.ok).toBe(false);
    if (!env.ok) {
      expect(env.error.code).toBe("GROK_NOT_FOUND");
    }
    expect(deps.run).not.toHaveBeenCalled();
  });

  it("returns TIMEOUT when run times out", async () => {
    const deps = mockDeps({
      run: async () => ({
        code: null,
        stdout: "",
        stderr: "killed",
        timedOut: true,
        durationMs: 100,
      }),
    });

    const env = await handleGrokImagine({ prompt: "slow" }, deps);
    expect(env.ok).toBe(false);
    if (!env.ok) {
      expect(env.error.code).toBe("TIMEOUT");
      expect(env.tool).toBe("grok_imagine");
    }
  });
});
