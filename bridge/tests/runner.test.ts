import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  parseGrokJsonOutput,
  resetRunGrokQueueForTests,
  runGrok,
  type RunGrokRequest,
  type SpawnFn,
} from "../src/runner.js";
import type { ChildProcess } from "node:child_process";

function baseReq(overrides: Partial<RunGrokRequest> = {}): RunGrokRequest {
  return {
    bin: "/usr/bin/grok",
    args: ["-p", "hi", "--output-format", "json"],
    cwd: "/tmp",
    timeoutMs: 5_000,
    ...overrides,
  };
}

type MockChild = EventEmitter & {
  stdout: EventEmitter;
  stderr: EventEmitter;
  kill: ReturnType<typeof vi.fn>;
};

function createMockChild(): MockChild {
  const child = new EventEmitter() as MockChild;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn((signal?: NodeJS.Signals) => {
    // Simulate process exit after kill so runGrok can settle.
    queueMicrotask(() => {
      child.emit("close", signal === "SIGKILL" ? null : null, signal);
    });
    return true;
  });
  return child;
}

describe("parseGrokJsonOutput", () => {
  it("parses a single JSON object with text and sessionId", () => {
    const out = parseGrokJsonOutput(
      JSON.stringify({ text: "hello", sessionId: "sess-1" }),
    );
    expect(out).not.toBeNull();
    expect(out!.text).toBe("hello");
    expect(out!.sessionId).toBe("sess-1");
    expect(out!.raw).toEqual({ text: "hello", sessionId: "sess-1" });
  });

  it("maps session_id snake_case to sessionId", () => {
    const out = parseGrokJsonOutput(
      JSON.stringify({ text: "ok", session_id: "abc" }),
    );
    expect(out?.sessionId).toBe("abc");
    expect(out?.text).toBe("ok");
  });

  it("returns null for non-JSON stdout", () => {
    expect(parseGrokJsonOutput("not json at all")).toBeNull();
    expect(parseGrokJsonOutput("")).toBeNull();
    expect(parseGrokJsonOutput("[1,2,3]")).toBeNull();
  });

  it("extracts the last JSON object when mixed with log lines", () => {
    const stdout = [
      "loading model...",
      "debug: skip",
      JSON.stringify({ text: "final answer", session_id: "s9" }),
      "done",
    ].join("\n");
    // last line is not JSON; brace/line scan should still find the object
    const out = parseGrokJsonOutput(stdout);
    expect(out?.text).toBe("final answer");
    expect(out?.sessionId).toBe("s9");
  });

  it("extracts trailing object glued to log prefix via brace scan", () => {
    const stdout = `info starting\n{"text":"from braces","sessionId":"b1"}\n`;
    const out = parseGrokJsonOutput(stdout);
    expect(out?.text).toBe("from braces");
    expect(out?.sessionId).toBe("b1");
  });
});

describe("runGrok serial mutex", () => {
  beforeEach(() => {
    resetRunGrokQueueForTests();
  });

  afterEach(() => {
    resetRunGrokQueueForTests();
    vi.useRealTimers();
  });

  it("starts the second spawn only after the first child closes", async () => {
    const order: string[] = [];
    const children: MockChild[] = [];
    let spawnCount = 0;

    const spawn: SpawnFn = () => {
      spawnCount += 1;
      const id = spawnCount;
      order.push(`start-${id}`);
      const child = createMockChild();
      children.push(child);
      return child as unknown as ChildProcess;
    };

    const p1 = runGrok(baseReq({ args: ["-p", "one"] }), { spawn });
    const p2 = runGrok(baseReq({ args: ["-p", "two"] }), { spawn });

    // First spawn must have started; second must wait.
    await vi.waitFor(() => {
      expect(order).toEqual(["start-1"]);
    });

    order.push("close-1");
    children[0]!.emit("close", 0);

    await vi.waitFor(() => {
      expect(order).toContain("start-2");
    });

    order.push("close-2");
    children[1]!.emit("close", 0);

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.code).toBe(0);
    expect(r2.code).toBe(0);
    expect(order).toEqual(["start-1", "close-1", "start-2", "close-2"]);
  });

  it("times out, sets timedOut, and kills the child", async () => {
    vi.useFakeTimers();

    const child = createMockChild();
    // Override kill: do not auto-close so we can observe SIGTERM then SIGKILL.
    const killCalls: Array<NodeJS.Signals | undefined> = [];
    child.kill = vi.fn((signal?: NodeJS.Signals) => {
      killCalls.push(signal);
      if (signal === "SIGKILL") {
        queueMicrotask(() => child.emit("close", null));
      }
      return true;
    });

    const spawn: SpawnFn = () => child as unknown as ChildProcess;

    const promise = runGrok(baseReq({ timeoutMs: 50 }), {
      spawn,
      killGraceMs: 20,
    });

    // Advance past timeout → SIGTERM
    await vi.advanceTimersByTimeAsync(50);
    expect(killCalls).toContain("SIGTERM");

    // Advance past grace → SIGKILL and close
    await vi.advanceTimersByTimeAsync(20);
    // flush microtasks from kill handler
    await Promise.resolve();
    await Promise.resolve();

    // If still pending, emit close after kill
    if (killCalls.includes("SIGKILL")) {
      child.emit("close", null);
    }

    const result = await promise;
    expect(result.timedOut).toBe(true);
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    expect(killCalls[0]).toBe("SIGTERM");
  });

  it("collects stdout/stderr and duration on normal exit", async () => {
    const child = createMockChild();
    const spawn: SpawnFn = () => {
      queueMicrotask(() => {
        child.stdout.emit("data", Buffer.from('{"text":"ok"}'));
        child.stderr.emit("data", "warn\n");
        child.emit("close", 0);
      });
      return child as unknown as ChildProcess;
    };

    const result = await runGrok(baseReq(), { spawn });
    expect(result.code).toBe(0);
    expect(result.timedOut).toBe(false);
    expect(result.stdout).toContain('"text":"ok"');
    expect(result.stderr).toContain("warn");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});
