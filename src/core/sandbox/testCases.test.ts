import { describe, expect, it } from "vitest";
import { compareOutput, judge, type TestCase } from "./testCases";

describe("compareOutput", () => {
  it("matches identical output", () => {
    expect(compareOutput("42", "42")).toBe(true);
  });

  /* Formatting is not a wrong answer: the original's table failed correct
     solutions over a trailing newline or a space after a comma. */
  it.each([
    ["trailing newline", "42", "42\n"],
    ["leading space", "42", "  42"],
    ["collapsed whitespace", "a b", "a   b"],
    ["array spacing", "[1,2]", "[ 1, 2 ]"],
    ["nested array spacing", "[[1,2],[3]]", "[ [ 1, 2 ], [ 3 ] ]"],
    ["object spacing", "{a:1}", "{ a: 1 }"],
    ["quote style", `["a"]`, "[ 'a' ]"],
    ["numeric equality", "1", "1.0"],
    ["numeric equality with sign", "-3", "-3.00"],
  ])("ignores a %s difference", (_label, expected, actual) => {
    expect(compareOutput(expected, actual)).toBe(true);
  });

  it.each([
    ["different numbers", "42", "43"],
    ["different text", "yes", "no"],
    ["different order", "[1,2]", "[2,1]"],
    ["empty output", "42", ""],
    ["case difference", "True", "true"],
  ])("rejects a %s", (_label, expected, actual) => {
    expect(compareOutput(expected, actual)).toBe(false);
  });

  it("does not treat two empty strings as a numeric match", () => {
    expect(compareOutput("", "")).toBe(true);
    expect(compareOutput("", "0")).toBe(false);
  });

  it("does not coerce non-finite numbers into equality", () => {
    expect(compareOutput("Infinity", "NaN")).toBe(false);
  });
});

describe("judge", () => {
  const cases: TestCase[] = [
    { name: "nums = [2,7], target = 9", input: "", expected: "[0,1]" },
    { name: "nums = [3,3], target = 6", input: "", expected: "[0,1]" },
    { name: "no solution", input: "", expected: "[]" },
  ];

  it("passes a fully correct submission", () => {
    const verdict = judge(cases, ["[ 0, 1 ]", "[ 0, 1 ]", "[]"]);
    expect(verdict.allPassed).toBe(true);
    expect(verdict.passedCount).toBe(3);
    expect(verdict.total).toBe(3);
    expect(verdict.results.every((r) => r.detail === undefined)).toBe(true);
  });

  it("reports which cases failed", () => {
    const verdict = judge(cases, ["[ 0, 1 ]", "[ 1, 0 ]", "[]"]);
    expect(verdict.allPassed).toBe(false);
    expect(verdict.passedCount).toBe(2);
    expect(verdict.results[1]).toMatchObject({
      passed: false,
      actual: "[ 1, 0 ]",
    });
    expect(verdict.results[1]?.detail).toContain("Expected [0,1]");
  });

  it("flags missing output rather than silently passing", () => {
    const verdict = judge(cases, ["[ 0, 1 ]"]);
    expect(verdict.passedCount).toBe(1);
    expect(verdict.results[1]?.detail).toBe("No output for this case.");
    expect(verdict.results[2]?.detail).toBe("No output for this case.");
  });

  it("calls out a case-only difference, which is easy to miss in a table", () => {
    const verdict = judge(
      [{ name: "flag", input: "", expected: "True" }],
      ["true"],
    );
    expect(verdict.results[0]?.detail).toBe("Differs only by letter case.");
  });

  it("calls out empty output", () => {
    const verdict = judge([{ name: "one", input: "", expected: "1" }], ["  "]);
    expect(verdict.results[0]?.detail).toBe("Printed nothing.");
  });

  it("ignores extra output beyond the number of cases", () => {
    const verdict = judge(
      [{ name: "one", input: "", expected: "1" }],
      ["1", "noise"],
    );
    expect(verdict.allPassed).toBe(true);
  });

  it("is not a pass when there are no cases at all", () => {
    const verdict = judge([], []);
    expect(verdict.allPassed).toBe(false);
    expect(verdict.total).toBe(0);
  });
});
