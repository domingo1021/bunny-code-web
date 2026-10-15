import { describe, expect, it } from "vitest";
import { applyEdits } from "@/core/replay/applyEdit";
import { buildTimeline } from "@/core/replay/timeline";
import { docToText, EMPTY_DOC } from "@/core/replay/types";
import { typeSource, typesBackTo } from "./typeSource";

/**
 * The contract for every seeded recording: typing a source produces a log that
 * replays back to exactly that source. If this fails, the fixtures are wrong
 * and nothing downstream can be trusted.
 */
const SOURCES: Record<string, string> = {
  "single line": "const answer = 42;",

  "two statements": "const a = 1;\nconst b = 2;\nconsole.log(a + b);",

  "nested blocks": `function twoSum(nums, target) {
  const seen = new Map();
  for (let i = 0; i < nums.length; i++) {
    const need = target - nums[i];
    if (seen.has(need)) {
      return [seen.get(need), i];
    }
    seen.set(nums[i], i);
  }
  return [];
}`,

  "strings and quotes": `const greeting = "hello";\nconsole.log('it works');`,

  "brackets and braces": "const shape = { points: [1, 2, 3], name: (x) => x };",

  "blank lines": "const a = 1;\n\nconst b = 2;\n",

  "dedent back to margin": "if (x) {\n  go();\n}\ndone();",

  "deep indentation": "a(\n  b(\n    c(\n      d\n    )\n  )\n);",

  "comment line": "// count the things\nlet count = 0;",

  "trailing blank line": "run();\n",

  "empty source": "",
};

describe("typeSource", () => {
  it.each(Object.entries(SOURCES))("types back %s exactly", (_name, source) => {
    const session = typeSource(source);
    expect(typesBackTo(session, source)).toBe(true);
  });

  it.each(Object.entries(SOURCES))(
    "replays %s back to the source from an empty document",
    (_name, source) => {
      const session = typeSource(source);
      const replayed = applyEdits(EMPTY_DOC, session.records);
      expect(docToText(replayed)).toBe(source);
    },
  );

  it("produces a record for all but the trivial case", () => {
    expect(typeSource(SOURCES["single line"]!).records.length).toBeGreaterThan(
      10,
    );
    expect(typeSource("").records).toHaveLength(0);
  });

  it("produces strictly increasing nanosecond timestamps", () => {
    const { records } = typeSource(SOURCES["nested blocks"]!);
    const stamps = records.map((r) => BigInt(r.timestamp));
    for (let i = 1; i < stamps.length; i += 1) {
      expect(stamps[i]! > stamps[i - 1]!).toBe(true);
    }
  });

  it("produces a timeline with a plausible duration", () => {
    const { records } = typeSource(SOURCES["nested blocks"]!);
    const timeline = buildTimeline(records);
    expect(timeline.offsets).toHaveLength(records.length);
    expect(timeline.durationMs).toBeGreaterThan(1_000);
    expect(timeline.offsets[0]).toBe(0);
  });

  it("is deterministic for a given seed", () => {
    const a = typeSource(SOURCES["two statements"]!, { seed: 7 });
    const b = typeSource(SOURCES["two statements"]!, { seed: 7 });
    expect(a.records).toEqual(b.records);
  });

  it("varies the timing with the seed, but not the result", () => {
    const a = typeSource(SOURCES["two statements"]!, { seed: 1 });
    const b = typeSource(SOURCES["two statements"]!, { seed: 2 });
    expect(a.text).toBe(b.text);
    expect(a.records.map((r) => r.timestamp)).not.toEqual(
      b.records.map((r) => r.timestamp),
    );
  });

  it("types human-paced keystrokes, not a metronome", () => {
    const { records } = typeSource(SOURCES["nested blocks"]!);
    const gaps = buildTimeline(records, {
      maxGapMs: Number.POSITIVE_INFINITY,
    }).offsets.map((offset, i, all) => offset - (all[i - 1] ?? 0));
    expect(new Set(gaps.slice(1)).size).toBeGreaterThan(5);
  });

  it("can continue typing into an existing document", () => {
    const first = typeSource("const a = 1;");
    const second = typeSource("const b = 2;", { from: first.doc });
    expect(second.text).toBe("const a = 1;const b = 2;");
  });
});
