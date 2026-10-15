import { describe, expect, it } from "vitest";
import { formatCount, formatDuration, formatSpeed, languageOf } from "./format";

describe("formatCount", () => {
  it.each([
    [0, "0"],
    [1, "1"],
    [999, "999"],
    [1_000, "1k"],
    [1_100, "1.1k"],
    [9_949, "9.9k"],
    [12_400, "12k"],
    [999_000, "999k"],
    [1_000_000, "1M"],
    [2_500_000, "2.5M"],
  ])("formats %i as %s", (value, expected) => {
    expect(formatCount(value)).toBe(expected);
  });

  it("truncates rather than rounding fractional input", () => {
    expect(formatCount(12.7)).toBe("12");
  });

  /* A watch count arriving as NaN or negative must not render "NaN" on a card. */
  it.each([Number.NaN, -1, Number.POSITIVE_INFINITY])(
    "falls back to 0 for %f",
    (value) => {
      expect(formatCount(value)).toBe("0");
    },
  );
});

describe("formatDuration", () => {
  it.each([
    [0, "0:00"],
    [999, "0:00"],
    [1_000, "0:01"],
    [9_000, "0:09"],
    [59_000, "0:59"],
    [60_000, "1:00"],
    [61_500, "1:01"],
    [600_000, "10:00"],
    [3_661_000, "61:01"],
  ])("formats %ims as %s", (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });

  it.each([Number.NaN, -500, Number.POSITIVE_INFINITY])(
    "falls back to 0:00 for %f",
    (ms) => {
      expect(formatDuration(ms)).toBe("0:00");
    },
  );

  it("always pads the seconds to two digits", () => {
    expect(formatDuration(65_000)).toBe("1:05");
  });
});

describe("formatSpeed", () => {
  it.each([
    [1, "x1"],
    [2, "x2"],
    [0.25, "x0.25"],
    [1.25, "x1.25"],
  ])("formats %f as %s", (speed, expected) => {
    expect(formatSpeed(speed)).toBe(expected);
  });
});

describe("languageOf", () => {
  it.each([
    ["index.js", "JS"],
    ["Component.tsx", "TSX"],
    ["styles.CSS", "CSS"],
    ["archive.tar.gz", "GZ"],
    ["Makefile", ""],
    ["", ""],
  ])("derives %s as %s", (fileName, expected) => {
    expect(languageOf(fileName)).toBe(expected);
  });
});
