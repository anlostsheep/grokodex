import { describe, it, expect } from "vitest";
import { loadConfig } from "../src/config.js";

describe("loadConfig narrow tools", () => {
  it("defaults match spec", () => {
    const c = loadConfig({});
    expect(c.x_search_max_turns).toBe(5);
    expect(c.imagine_max_turns).toBe(4);
    expect(c.x_search_tools).toBe("x_search");
    expect(c.imagine_tools).toBe("image_gen");
    expect(c.x_search_timeout_ms).toBe(90_000);
    expect(c.imagine_timeout_ms).toBe(120_000);
    expect(c.narrow_tools_strict).toBe(true);
  });

  it("reads env overrides", () => {
    const c = loadConfig({
      GROKODEX_X_SEARCH_MAX_TURNS: "8",
      GROKODEX_IMAGINE_MAX_TURNS: "3",
      GROKODEX_X_SEARCH_TOOLS: "x_search,x_media_search",
      GROKODEX_IMAGINE_TOOLS: "image_gen",
      GROKODEX_X_SEARCH_TIMEOUT_MS: "60000",
      GROKODEX_IMAGINE_TIMEOUT_MS: "100000",
      GROKODEX_NARROW_TOOLS_STRICT: "0",
    });
    expect(c.x_search_max_turns).toBe(8);
    expect(c.imagine_max_turns).toBe(3);
    expect(c.x_search_tools).toBe("x_search,x_media_search");
    expect(c.x_search_timeout_ms).toBe(60_000);
    expect(c.imagine_timeout_ms).toBe(100_000);
    expect(c.narrow_tools_strict).toBe(false);
  });

  it("invalid numbers fall back to defaults", () => {
    const c = loadConfig({
      GROKODEX_X_SEARCH_MAX_TURNS: "nope",
      GROKODEX_X_SEARCH_TIMEOUT_MS: "-5",
      GROKODEX_IMAGINE_MAX_TURNS: "0",
    });
    expect(c.x_search_max_turns).toBe(5);
    expect(c.x_search_timeout_ms).toBe(90_000);
    expect(c.imagine_max_turns).toBe(4);
  });
});
