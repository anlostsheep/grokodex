import type { ErrorCode, ToolEnvelope, ToolName } from "./types.js";
type OkFields = Omit<Extract<ToolEnvelope, {
    ok: true;
}>, "ok" | "tool">;
export declare function okResult(tool: ToolName, fields?: OkFields): ToolEnvelope;
export declare function failResult(tool: ToolName, code: ErrorCode, message: string, hint?: string): ToolEnvelope;
export declare function envelopeToText(env: ToolEnvelope): string;
export {};
