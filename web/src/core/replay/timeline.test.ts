import { describe, expect, it } from "vitest";
import {
  buildTimeline,
  DEFAULT_MAX_GAP_MS,
  indexAtTime,
  nowAsNanos,
  parseNanosToMs,
  timeAtIndex,
} from "./timeline";
import { type EditAction, type EditRecord } from "./types";

/** A record that only carries a timestamp; the action is irrelevant to timing. */
function at(timestamp: string, action: EditAction = "create"): EditRecord {
  return { action, line: 0, index: 0, code: "x", timestamp };
}

/** A realistic epoch base, so timestamps have the shape the app really writes. */
const EPOCH_MS = 1_700_000_000_000;

/** Nanosecond string for `offsetMs` milliseconds after the base epoch. */
function ns(offsetMs: number): string {
  return `${BigInt(EPOCH_MS + offsetMs) * 1_000_000n}`;
}

describe("parseNanosToMs", () => {
  it("parses a nanosecond timestamp", () => {
    expect(parseNanosToMs("1700000000000000000")).toBe(1_700_000_000_000);
  });

  it("parses the exact format the app writes", () => {
    expect(parseNanosToMs(`${Date.now()}000000`)).toBeGreaterThan(
      1_600_000_000_000,
    );
  });

  /*
   * This is the bug the original shipped. The recorder wrote nanosecond
   * strings; the player read them back with `new Date(...)`, which is not a
   * date format and evaluates to NaN. `setTimeout(fn, NaN)` fires immediately,
   * so every replay ran flat out instead of at the speed it was typed.
   */
  it("succeeds where the original's `new Date(ns)` yields NaN", () => {
    const stamp = "1700000000123000000";
    expect(new Date(stamp).getTime()).toBeNaN();
    expect(parseNanosToMs(stamp)).toBe(1_700_000_000_123);
  });

  it("truncates sub-millisecond precision rather than rounding", () => {
    expect(parseNanosToMs("1700000000123999999")).toBe(1_700_000_000_123);
  });

  /* The unit is never inferred from magnitude, so a millisecond value is read
     as the nanosecond value it literally is rather than silently rescaled. */
  it("treats every value as nanoseconds", () => {
    expect(parseNanosToMs("1700000000000")).toBe(1_700_000);
  });

  it.each([
    "",
    "   ",
    "not-a-number",
    "-1700000000",
    "1.7e18",
    "17000000000e6",
    "1700000000000000000.0",
  ])("returns null for %j", (value) => {
    expect(parseNanosToMs(value)).toBeNull();
  });

  it("returns null for a missing timestamp", () => {
    expect(parseNanosToMs(undefined)).toBeNull();
  });

  it("round-trips through nowAsNanos", () => {
    expect(parseNanosToMs(nowAsNanos(1_700_000_000_123))).toBe(
      1_700_000_000_123,
    );
  });
});

describe("buildTimeline", () => {
  it("is empty for no records", () => {
    expect(buildTimeline([])).toEqual({ offsets: [], durationMs: 0 });
  });

  it("starts at zero and accumulates gaps", () => {
    const timeline = buildTimeline([
      at(ns(1_000)),
      at(ns(1_120)),
      at(ns(1_500)),
    ]);
    expect(timeline.offsets).toEqual([0, 120, 500]);
    expect(timeline.durationMs).toBe(500);
  });

  it("gives a single record zero duration", () => {
    expect(buildTimeline([at(ns(1_000))])).toEqual({
      offsets: [0],
      durationMs: 0,
    });
  });

  it("compresses long human pauses so playback does not look frozen", () => {
    const timeline = buildTimeline([
      at(ns(0)),
      at(ns(240_000)),
      at(ns(240_100)),
    ]);
    expect(timeline.offsets).toEqual([
      0,
      DEFAULT_MAX_GAP_MS,
      DEFAULT_MAX_GAP_MS + 100,
    ]);
  });

  it("honours a custom gap cap", () => {
    const timeline = buildTimeline([at(ns(0)), at(ns(5_000))], {
      maxGapMs: 250,
    });
    expect(timeline.durationMs).toBe(250);
  });

  it("preserves gaps verbatim when the cap is Infinity", () => {
    const timeline = buildTimeline([at(ns(0)), at(ns(600_000))], {
      maxGapMs: Number.POSITIVE_INFINITY,
    });
    expect(timeline.durationMs).toBe(600_000);
  });

  it("treats out-of-order timestamps as zero rather than negative time", () => {
    const timeline = buildTimeline([
      at(ns(5_000)),
      at(ns(1_000)),
      at(ns(5_100)),
    ]);
    expect(timeline.offsets).toEqual([0, 0, 100]);
    expect(timeline.durationMs).toBe(100);
  });

  it("skips unparseable timestamps instead of poisoning the timeline with NaN", () => {
    const timeline = buildTimeline([at(ns(0)), at("garbage"), at(ns(300))]);
    expect(timeline.offsets.every(Number.isFinite)).toBe(true);
    expect(timeline.durationMs).toBe(300);
  });

  it("produces non-decreasing offsets", () => {
    const timeline = buildTimeline([
      at(ns(0)),
      at(ns(50)),
      at("nope"),
      at(ns(80)),
      at(ns(10)),
      at(ns(200)),
    ]);
    const offsets = [...timeline.offsets];
    expect(offsets).toEqual([...offsets].sort((a, b) => a - b));
  });
});

describe("indexAtTime", () => {
  const timeline = buildTimeline([
    at(ns(0)),
    at(ns(100)),
    at(ns(200)),
    at(ns(300)),
  ]);

  it.each([
    [-50, 0],
    [0, 1],
    [50, 1],
    [100, 2],
    [199, 2],
    [200, 3],
    [300, 4],
    [10_000, 4],
  ])("at %ims → %i records applied", (elapsed, expected) => {
    expect(indexAtTime(timeline, elapsed)).toBe(expected);
  });

  it("is 0 for an empty timeline", () => {
    expect(indexAtTime({ offsets: [], durationMs: 0 }, 1_000)).toBe(0);
  });

  it("agrees with a linear scan at every boundary", () => {
    const linear = (ms: number) =>
      timeline.offsets.filter((offset) => offset <= ms).length;
    for (let ms = -10; ms <= 320; ms += 1) {
      expect(indexAtTime(timeline, ms)).toBe(linear(ms));
    }
  });
});

describe("timeAtIndex", () => {
  const timeline = buildTimeline([at(ns(0)), at(ns(100)), at(ns(250))]);

  it.each([
    [-1, 0],
    [0, 0],
    [1, 100],
    [2, 250],
    [99, 250],
  ])("index %i → %ims", (index, expected) => {
    expect(timeAtIndex(timeline, index)).toBe(expected);
  });

  it("is 0 for an empty timeline", () => {
    expect(timeAtIndex({ offsets: [], durationMs: 0 }, 3)).toBe(0);
  });

  it("round-trips with indexAtTime", () => {
    for (let i = 0; i < timeline.offsets.length; i += 1) {
      expect(indexAtTime(timeline, timeAtIndex(timeline, i))).toBe(i + 1);
    }
  });
});
