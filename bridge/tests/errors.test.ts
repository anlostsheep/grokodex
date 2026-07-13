import { describe, it, expect } from "vitest";
import { failResult, okResult, envelopeToText } from "../src/errors.js";

describe("envelope", () => {
  it("failResult sets ok false and code", () => {
    const e = failResult("grok_setup", "GROK_NOT_FOUND", "missing", "install grok");
    expect(e.ok).toBe(false);
    if (!e.ok) {
      expect(e.error.code).toBe("GROK_NOT_FOUND");
      expect(e.error.hint).toBe("install grok");
    }
  });

  it("okResult sets ok true", () => {
    const e = okResult("grok_setup", { text: "ready", meta: { duration_ms: 1 } });
    expect(e.ok).toBe(true);
    if (e.ok) expect(e.text).toBe("ready");
  });

  it("envelopeToText is valid JSON", () => {
    const e = okResult("grok_run", { text: "hi" });
    expect(JSON.parse(envelopeToText(e)).tool).toBe("grok_run");
  });
});
