import { describe, it, expect } from "vitest";
import { applyNarrowCliArgs, parseToolsAllowlist } from "../src/narrow-cli.js";

const base = [
  "--output-format",
  "json",
  "--max-turns",
  "30",
  "--disallowed-tools",
  "Write,Edit,MultiEdit,NotebookEdit",
  "--deny",
  "Bash(sudo*)",
];

describe("applyNarrowCliArgs", () => {
  it("replaces max-turns and sets tools + Agent", () => {
    const out = applyNarrowCliArgs(base, {
      maxTurns: 5,
      toolsCsv: "x_search",
    });
    expect(out[out.indexOf("--max-turns") + 1]).toBe("5");
    expect(out).toContain("--tools");
    expect(out[out.indexOf("--tools") + 1]).toBe("x_search");
    const d = out[out.indexOf("--disallowed-tools") + 1] as string;
    expect(d.split(",").map((s) => s.trim())).toEqual(
      expect.arrayContaining([
        "Agent",
        "Write",
        "Edit",
        "MultiEdit",
        "NotebookEdit",
      ]),
    );
    expect(out).toContain("--output-format");
    expect(out).toContain("Bash(sudo*)");
  });

  it("adds --tools and --disallowed-tools Agent when missing", () => {
    const out = applyNarrowCliArgs(
      ["--output-format", "json", "--max-turns", "30"],
      { maxTurns: 4, toolsCsv: "image_gen" },
    );
    expect(out[out.indexOf("--max-turns") + 1]).toBe("4");
    expect(out[out.indexOf("--tools") + 1]).toBe("image_gen");
    expect(out[out.indexOf("--disallowed-tools") + 1]).toBe("Agent");
  });

  it("does not leave max-turns at 30 when overlaying", () => {
    const out = applyNarrowCliArgs(base, {
      maxTurns: 5,
      toolsCsv: "x_search",
    });
    const turns = out.filter((_, i, a) => a[i - 1] === "--max-turns");
    expect(turns).toEqual(["5"]);
  });
});

describe("parseToolsAllowlist", () => {
  it("splits csv", () => {
    expect(parseToolsAllowlist("x_search, x_media_search")).toEqual([
      "x_search",
      "x_media_search",
    ]);
  });
});
