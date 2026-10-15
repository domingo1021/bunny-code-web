import { describe, expect, it, vi } from "vitest";
import { createConsoleCapture, runUserCode, timeoutResult } from "./evaluate";
import { formatArgs, formatThrown, formatValue } from "./format";
import { DEFAULT_LIMITS, type SandboxLimits } from "./types";

function limits(overrides: Partial<SandboxLimits> = {}): SandboxLimits {
  return { ...DEFAULT_LIMITS, ...overrides };
}

describe("formatValue · primitives", () => {
  it.each([
    [undefined, "undefined"],
    [null, "null"],
    [42, "42"],
    [-0, "-0"],
    [0, "0"],
    [Number.NaN, "NaN"],
    [Number.POSITIVE_INFINITY, "Infinity"],
    [true, "true"],
    [10n, "10n"],
  ])("formats %o as %s", (value, expected) => {
    expect(formatValue(value)).toBe(expected);
  });

  it("prints a top-level string bare and a nested one quoted", () => {
    expect(formatValue("hello")).toBe("hello");
    expect(formatValue(["hello"])).toBe("[ 'hello' ]");
  });

  it("formats symbols and functions", () => {
    expect(formatValue(Symbol("tag"))).toBe("Symbol(tag)");
    expect(formatValue(function named() {})).toBe("[Function: named]");
    expect(formatValue(() => {})).toContain("[Function");
  });
});

describe("formatValue · structures", () => {
  it("formats arrays and objects", () => {
    expect(formatValue([1, 2, 3])).toBe("[ 1, 2, 3 ]");
    expect(formatValue([])).toBe("[]");
    expect(formatValue({ a: 1, b: "x" })).toBe("{ a: 1, b: 'x' }");
    expect(formatValue({})).toBe("{}");
  });

  it("quotes keys that are not identifiers", () => {
    expect(formatValue({ "not-an-ident": 1 })).toBe("{ 'not-an-ident': 1 }");
  });

  it("names a class instance", () => {
    class Point {
      constructor(
        public x: number,
        public y: number,
      ) {}
    }
    expect(formatValue(new Point(1, 2))).toBe("Point { x: 1, y: 2 }");
  });

  it("formats Map and Set", () => {
    expect(formatValue(new Map([["a", 1]]))).toBe("Map(1) { 'a' => 1 }");
    expect(formatValue(new Set([1, 2]))).toBe("Set(2) { 1, 2 }");
    expect(formatValue(new Map())).toBe("Map(0) {}");
  });

  it("formats dates and regexes", () => {
    expect(formatValue(new Date(0))).toBe("1970-01-01T00:00:00.000Z");
    expect(formatValue(new Date("nonsense"))).toBe("Invalid Date");
    expect(formatValue(/ab+c/gi)).toBe("/ab+c/gi");
  });

  /* A user logging a cyclic structure is ordinary; JSON.stringify would throw
     and take the whole run down with it. */
  it("survives a circular reference", () => {
    const node: Record<string, unknown> = { name: "root" };
    node.self = node;
    expect(formatValue(node)).toBe("{ name: 'root', self: [Circular *1] }");
  });

  it("survives a shared (non-circular) reference", () => {
    const shared = { v: 1 };
    expect(formatValue([shared, shared])).toBe("[ { v: 1 }, { v: 1 } ]");
  });

  it("stops at a depth limit instead of recursing forever", () => {
    const deep = { a: { b: { c: { d: { e: { f: 1 } } } } } };
    expect(formatValue(deep)).toContain("[Object]");
  });

  it("truncates a very long array", () => {
    expect(formatValue(Array.from({ length: 150 }, (_, i) => i))).toContain(
      "50 more items",
    );
  });

  it("survives an object with a throwing getter", () => {
    const hostile = {
      get boom(): never {
        throw new Error("nope");
      },
    };
    expect(formatValue(hostile)).toBe("[unserialisable]");
  });
});

describe("formatArgs", () => {
  it("joins arguments with a space, like a console", () => {
    expect(formatArgs(["count:", 3, { ok: true }])).toBe(
      "count: 3 { ok: true }",
    );
  });

  it("is empty for no arguments", () => {
    expect(formatArgs([])).toBe("");
  });
});

describe("formatThrown", () => {
  it("formats an Error", () => {
    expect(formatThrown(new TypeError("bad input"))).toBe(
      "TypeError: bad input",
    );
  });

  it("handles an Error with no message", () => {
    expect(formatThrown(new Error())).toBe("Error: (no message)");
  });

  /* JavaScript lets you throw anything. The original did
     `error.response.data.msg` unconditionally and threw while reporting. */
  it.each([
    ["a string", "oops", "Uncaught oops"],
    ["a number", 7, "Uncaught 7"],
    ["null", null, "Uncaught null"],
    ["undefined", undefined, "Uncaught undefined"],
    ["an object", { code: 1 }, "Uncaught { code: 1 }"],
  ])("handles throwing %s", (_label, thrown, expected) => {
    expect(formatThrown(thrown)).toBe(expected);
  });
});

describe("createConsoleCapture", () => {
  it("captures each level", () => {
    const capture = createConsoleCapture();
    capture.console.log("a");
    capture.console.info("b");
    capture.console.warn("c");
    capture.console.error("d");
    capture.console.debug("e");
    expect(capture.logs.map((l) => l.level)).toEqual([
      "log",
      "info",
      "warn",
      "error",
      "debug",
    ]);
  });

  it("caps the number of entries", () => {
    const capture = createConsoleCapture(limits({ maxLogEntries: 3 }));
    for (let i = 0; i < 10; i += 1) capture.console.log(i);
    expect(capture.logs).toHaveLength(3);
    expect(capture.truncated).toBe(true);
  });

  it("caps total characters", () => {
    const capture = createConsoleCapture(limits({ maxOutputChars: 10 }));
    capture.console.log("12345");
    capture.console.log("67890abcdef");
    expect(capture.logs.map((l) => l.text)).toEqual(["12345", "67890"]);
    expect(capture.truncated).toBe(true);
  });

  it("is not truncated when within budget", () => {
    const capture = createConsoleCapture();
    capture.console.log("short");
    expect(capture.truncated).toBe(false);
  });
});

describe("runUserCode", () => {
  const now = () => 1_000;

  it("captures output from a successful run", () => {
    const result = runUserCode('console.log("hello", 42);', { now });
    expect(result.status).toBe("ok");
    expect(result.output).toBe("hello 42");
    expect(result.error).toBeUndefined();
  });

  it("joins multiple lines of output", () => {
    const result = runUserCode("for (let i = 0; i < 3; i++) console.log(i);", {
      now,
    });
    expect(result.output).toBe("0\n1\n2");
  });

  it("runs an ordinary solution", () => {
    const result = runUserCode(
      `function twoSum(nums, target) {
         const seen = new Map();
         for (let i = 0; i < nums.length; i++) {
           const need = target - nums[i];
           if (seen.has(need)) return [seen.get(need), i];
           seen.set(nums[i], i);
         }
         return [];
       }
       console.log(twoSum([2, 7, 11, 15], 9));`,
      { now },
    );
    expect(result.status).toBe("ok");
    expect(result.output).toBe("[ 0, 1 ]");
  });

  it("reports a syntax error without throwing", () => {
    const result = runUserCode("function (", { now });
    expect(result.status).toBe("error");
    expect(result.error).toMatch(/SyntaxError/);
  });

  it("reports a runtime throw and keeps the output printed before it", () => {
    const result = runUserCode('console.log("before"); null.x;', { now });
    expect(result.status).toBe("error");
    expect(result.error).toMatch(/TypeError/);
    expect(result.output).toBe("before");
  });

  it("reports a thrown non-Error", () => {
    const result = runUserCode('throw "just a string";', { now });
    expect(result.status).toBe("error");
    expect(result.error).toBe("Uncaught just a string");
  });

  it("runs in strict mode, so accidental globals are an error", () => {
    const result = runUserCode("undeclared = 1;", { now });
    expect(result.status).toBe("error");
    expect(result.error).toMatch(/ReferenceError/);
  });

  it("reports a duration", () => {
    let t = 0;
    const result = runUserCode('console.log("x");', {
      now: () => (t += 5),
    });
    expect(result.durationMs).toBeGreaterThan(0);
  });

  it("marks runaway output as truncated rather than growing without bound", () => {
    const result = runUserCode(
      "for (let i = 0; i < 100000; i++) console.log(i);",
      { now, limits: limits({ maxLogEntries: 50 }) },
    );
    expect(result.truncated).toBe(true);
    expect(result.logs).toHaveLength(50);
  });

  it("does not leak the page's globals into user code", () => {
    // `document` must be unreachable; in a worker there is none, and the
    // sandbox never passes one in.
    const result = runUserCode("console.log(typeof document);", { now });
    expect(result.output).toBe("undefined");
  });
});

describe("timeoutResult", () => {
  /* The timeout is produced by whoever owns the worker, because a synchronous
     infinite loop cannot be interrupted from inside its own thread. */
  it("describes the limit it hit", () => {
    const result = timeoutResult(limits({ timeoutMs: 2_500 }));
    expect(result.status).toBe("timeout");
    expect(result.error).toContain("2500ms");
    expect(result.error).toMatch(/infinite loop/i);
  });
});

describe("sandbox defaults", () => {
  /* Behavioural tests inject `now`; this covers the fallback chain that
     actually runs in the worker. */
  it("works without an injected clock", () => {
    const result = runUserCode('console.log("ok");');
    expect(result.status).toBe("ok");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("falls back to Date.now when performance is unavailable", () => {
    vi.stubGlobal("performance", undefined);
    try {
      expect(runUserCode('console.log("ok");').status).toBe("ok");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("uses the default limits when none are given", () => {
    const capture = createConsoleCapture();
    // A single value is capped at 10k by the formatter, so several are needed
    // to reach the 20k output budget.
    for (let i = 0; i < 4; i += 1) capture.console.log("x".repeat(9_000));
    expect(capture.truncated).toBe(true);
    const total = capture.logs.reduce((sum, l) => sum + l.text.length, 0);
    expect(total).toBeLessThanOrEqual(DEFAULT_LIMITS.maxOutputChars);
  });

  it("caps a single enormous value at the formatter's string limit", () => {
    const capture = createConsoleCapture();
    capture.console.log("x".repeat(50_000));
    expect(capture.logs[0]?.text).toContain("more characters");
    expect(capture.truncated).toBe(false);
  });
});

describe("formatValue · Error without a stack", () => {
  it("falls back to name and message", () => {
    const error = new RangeError("out of range");
    Object.defineProperty(error, "stack", { value: undefined });
    expect(formatValue(error)).toBe("RangeError: out of range");
  });

  it("uses the first stack line when a stack is present", () => {
    expect(formatValue(new Error("boom"))).toBe("Error: boom");
  });
});
