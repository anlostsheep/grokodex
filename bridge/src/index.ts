import { existsSync } from "node:fs";
import { join } from "node:path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { loadConfig } from "./config.js";
import { envelopeToText, failResult } from "./errors.js";
import { findInPath, resolveGrokBinary } from "./grok-bin.js";
import { resolvePermission } from "./permission.js";
import { runGrok } from "./runner.js";
import {
  handleGrokImagine,
  type GrokImagineArgs,
} from "./tools/imagine.js";
import { handleGrokRun, type GrokRunArgs } from "./tools/run.js";
import { handleSetup, type SetupArgs } from "./tools/setup.js";
import {
  handleGrokXSearch,
  type GrokXSearchArgs,
  type XSearchMode,
} from "./tools/x-search.js";
import type {
  CodexApproval,
  CodexSandbox,
  PermissionMode,
  ToolEnvelope,
} from "./types.js";

const config = loadConfig();

const server = new Server(
  {
    name: "grokodex",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

const TOOLS = [
  {
    name: "grok_setup",
    description:
      "Diagnose local Grok CLI: binary path, version, login health, and leader status. Read-only by default; pass ensure=true to start leader if down.",
    inputSchema: {
      type: "object" as const,
      properties: {
        fix: {
          type: "boolean",
          description: "Reserved for future auto-fix hints; currently ignored",
        },
        ensure: {
          type: "boolean",
          description:
            "If true, try to start local grok leader when socket is down (default false)",
        },
      },
    },
  },
  {
    name: "grok_run",
    description:
      "Run a headless local Grok agent task (restricted by default; optional inherit with Codex sandbox signal).",
    inputSchema: {
      type: "object" as const,
      properties: {
        prompt: {
          type: "string",
          description: "Task description passed to Grok",
        },
        cwd: {
          type: "string",
          description: "Working directory for the Grok process",
        },
        permission_mode: {
          type: "string",
          enum: ["restricted", "inherit"],
          description: "Permission mode (default restricted)",
        },
        codex_sandbox: {
          type: "string",
          enum: ["read-only", "workspace-write", "danger-full-access"],
          description: "Codex sandbox signal used when permission_mode=inherit",
        },
        codex_approval: {
          type: "string",
          enum: ["untrusted", "on-failure", "on-request", "never"],
          description: "Optional Codex approval policy signal",
        },
        model: {
          type: "string",
          description: "Optional Grok model override",
        },
        max_turns: {
          type: "number",
          description: "Override max agent turns (default 30)",
        },
        timeout_ms: {
          type: "number",
          description: "Kill the process after this many ms (default 600000)",
        },
        extra_rules: {
          type: "string",
          description: "Additional rules appended to the prompt",
        },
        use_leader: {
          type: "boolean",
          description:
            "Override GROKODEX_USE_LEADER for this call (default: env/config, on by default)",
        },
      },
      required: ["prompt"],
    },
  },
  {
    name: "grok_imagine",
    description:
      "Generate an image via constrained headless Grok (image-only; never full shell inherit). Returns artifact paths when parseable.",
    inputSchema: {
      type: "object" as const,
      properties: {
        prompt: {
          type: "string",
          description: "Image description / generation request",
        },
        aspect_ratio: {
          type: "string",
          description: "Aspect ratio passed to the image tool (default auto)",
        },
        save_dir: {
          type: "string",
          description:
            "Directory for saved images (default: <cwd>/.grokodex/images)",
        },
        cwd: {
          type: "string",
          description: "Working directory for the Grok process",
        },
        timeout_ms: {
          type: "number",
          description: "Kill the process after this many ms (default 600000)",
        },
        model: {
          type: "string",
          description: "Optional Grok model override",
        },
        use_leader: {
          type: "boolean",
          description:
            "Override GROKODEX_USE_LEADER for this call (default: env/config, on by default)",
        },
      },
      required: ["prompt"],
    },
  },
  {
    name: "grok_x_search",
    description:
      "Search X/Twitter via constrained headless Grok (read-only; never full shell inherit). Returns structured results when parseable.",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Search query or semantic question",
        },
        mode: {
          type: "string",
          enum: ["semantic", "keyword"],
          description: "Search mode (default semantic)",
        },
        limit: {
          type: "number",
          description: "Max number of results (default 5)",
        },
        from_date: {
          type: "string",
          description: "Optional start date (YYYY-MM-DD)",
        },
        to_date: {
          type: "string",
          description: "Optional end date (YYYY-MM-DD)",
        },
        usernames: {
          type: "array",
          items: { type: "string" },
          description: "Optional list of usernames to limit search to",
        },
        cwd: {
          type: "string",
          description: "Working directory for the Grok process",
        },
        timeout_ms: {
          type: "number",
          description: "Kill the process after this many ms (default 180000)",
        },
        model: {
          type: "string",
          description: "Optional Grok model override",
        },
        use_leader: {
          type: "boolean",
          description:
            "Override GROKODEX_USE_LEADER for this call (default: env/config, on by default)",
        },
      },
      required: ["query"],
    },
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function asBoolean(v: unknown): boolean | undefined {
  return typeof v === "boolean" ? v : undefined;
}

function parseSetupArgs(raw: Record<string, unknown> | undefined): SetupArgs {
  const args = raw ?? {};
  return {
    fix: asBoolean(args.fix),
    ensure: asBoolean(args.ensure),
  };
}

function asNumber(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function asPermissionMode(v: unknown): PermissionMode | undefined {
  return v === "restricted" || v === "inherit" ? v : undefined;
}

function asCodexSandbox(v: unknown): CodexSandbox | undefined {
  return v === "read-only" || v === "workspace-write" || v === "danger-full-access"
    ? v
    : undefined;
}

function asCodexApproval(v: unknown): CodexApproval | undefined {
  return v === "untrusted" ||
    v === "on-failure" ||
    v === "on-request" ||
    v === "never"
    ? v
    : undefined;
}

function parseGrokRunArgs(raw: Record<string, unknown> | undefined): GrokRunArgs {
  const args = raw ?? {};
  return {
    prompt: asString(args.prompt) ?? "",
    cwd: asString(args.cwd),
    permission_mode: asPermissionMode(args.permission_mode),
    codex_sandbox: asCodexSandbox(args.codex_sandbox),
    codex_approval: asCodexApproval(args.codex_approval),
    model: asString(args.model),
    max_turns: asNumber(args.max_turns),
    timeout_ms: asNumber(args.timeout_ms),
    extra_rules: asString(args.extra_rules),
    use_leader:
      typeof args.use_leader === "boolean" ? args.use_leader : undefined,
  };
}

function parseGrokImagineArgs(
  raw: Record<string, unknown> | undefined,
): GrokImagineArgs {
  const args = raw ?? {};
  return {
    prompt: asString(args.prompt) ?? "",
    aspect_ratio: asString(args.aspect_ratio),
    save_dir: asString(args.save_dir),
    cwd: asString(args.cwd),
    timeout_ms: asNumber(args.timeout_ms),
    model: asString(args.model),
    use_leader:
      typeof args.use_leader === "boolean" ? args.use_leader : undefined,
  };
}

function asXSearchMode(v: unknown): XSearchMode | undefined {
  return v === "semantic" || v === "keyword" ? v : undefined;
}

function asStringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.filter((x): x is string => typeof x === "string");
  return out.length > 0 ? out : undefined;
}

function parseGrokXSearchArgs(
  raw: Record<string, unknown> | undefined,
): GrokXSearchArgs {
  const args = raw ?? {};
  return {
    query: asString(args.query) ?? "",
    mode: asXSearchMode(args.mode),
    limit: asNumber(args.limit),
    from_date: asString(args.from_date),
    to_date: asString(args.to_date),
    usernames: asStringArray(args.usernames),
    cwd: asString(args.cwd),
    timeout_ms: asNumber(args.timeout_ms),
    model: asString(args.model),
    use_leader:
      typeof args.use_leader === "boolean" ? args.use_leader : undefined,
  };
}

function textResult(env: ToolEnvelope) {
  return {
    content: [{ type: "text" as const, text: envelopeToText(env) }],
  };
}

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const name = request.params.name;
  const rawArgs = (request.params.arguments ?? {}) as Record<string, unknown>;

  if (name === "grok_setup") {
    const env = await handleSetup(parseSetupArgs(rawArgs));
    return textResult(env);
  }

  if (name === "grok_run") {
    const env = await handleGrokRun(parseGrokRunArgs(rawArgs), {
      resolveBin: resolveGrokBinary,
      resolvePerm: resolvePermission,
      run: runGrok,
      config,
      env: process.env,
      existsSync,
      whichFn: () =>
        findInPath(
          "grok",
          process.env,
          existsSync,
          join,
          process.platform === "win32" ? ";" : ":",
        ),
    });
    return textResult(env);
  }

  if (name === "grok_imagine") {
    const env = await handleGrokImagine(parseGrokImagineArgs(rawArgs), {
      resolveBin: resolveGrokBinary,
      run: runGrok,
      config,
      env: process.env,
      existsSync,
      whichFn: () =>
        findInPath(
          "grok",
          process.env,
          existsSync,
          join,
          process.platform === "win32" ? ";" : ":",
        ),
    });
    return textResult(env);
  }

  if (name === "grok_x_search") {
    const env = await handleGrokXSearch(parseGrokXSearchArgs(rawArgs), {
      resolveBin: resolveGrokBinary,
      run: runGrok,
      config,
      env: process.env,
      existsSync,
      whichFn: () =>
        findInPath(
          "grok",
          process.env,
          existsSync,
          join,
          process.platform === "win32" ? ";" : ":",
        ),
    });
    return textResult(env);
  }

  return textResult(
    failResult(
      "grok_run",
      "INVALID_ARGS",
      `Unknown tool: ${name}`,
      "Use grok_setup, grok_run, grok_imagine, or grok_x_search",
    ),
  );
});

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  console.error("Fatal error starting Grokodex MCP server:", error);
  process.exit(1);
});
