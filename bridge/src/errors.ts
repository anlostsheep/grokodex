import type { ErrorCode, ToolEnvelope, ToolName } from "./types.js";

type OkFields = Omit<Extract<ToolEnvelope, { ok: true }>, "ok" | "tool">;

export function okResult(tool: ToolName, fields: OkFields = {}): ToolEnvelope {
  return {
    ok: true,
    tool,
    ...fields,
  };
}

export function failResult(
  tool: ToolName,
  code: ErrorCode,
  message: string,
  hint?: string,
): ToolEnvelope {
  return {
    ok: false,
    tool,
    error: hint === undefined ? { code, message } : { code, message, hint },
  };
}

export function envelopeToText(env: ToolEnvelope): string {
  return JSON.stringify(env, null, 2);
}
