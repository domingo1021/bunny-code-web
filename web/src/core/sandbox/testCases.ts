/**
 * Judging a battle submission.
 *
 * The battle screen shows a table of "expected answer" against "compiler
 * result" per test case. The original compared them server-side and sent back
 * pre-rendered strings, so the client could not say *why* a case failed and
 * whitespace differences looked like logic errors.
 */

export interface TestCase {
  /** Human-readable description of the input, shown in the results table. */
  readonly name: string;
  /** Source appended to the user's code to exercise it, printing one line. */
  readonly input: string;
  readonly expected: string;
}

export interface TestCaseResult {
  readonly name: string;
  readonly expected: string;
  readonly actual: string;
  readonly passed: boolean;
  /** Set when the case failed; explains how, for the results table. */
  readonly detail?: string;
}

export interface BattleVerdict {
  readonly results: readonly TestCaseResult[];
  readonly passedCount: number;
  readonly total: number;
  readonly allPassed: boolean;
}

/**
 * Compare one expected value against what the code printed.
 *
 * Comparison is on trimmed text with internal whitespace collapsed, because a
 * trailing newline or a double space is not a wrong answer. Numbers are
 * compared numerically so `1.0` matches `1`, and JSON-ish output is normalised
 * so `[1,2]` matches `[ 1, 2 ]` — otherwise a correct solution fails on
 * formatting, which is exactly the complaint the original's table invited.
 */
export function compareOutput(expected: string, actual: string): boolean {
  const a = normalise(expected);
  const b = normalise(actual);
  if (a === b) return true;

  const numericA = Number(a);
  const numericB = Number(b);
  if (
    a !== "" &&
    b !== "" &&
    Number.isFinite(numericA) &&
    Number.isFinite(numericB)
  ) {
    return numericA === numericB;
  }

  return false;
}

function normalise(value: string): string {
  return (
    value
      .trim()
      .replace(/\s+/g, " ")
      // Drop whitespace that only pads JSON-ish punctuation.
      .replace(/\s*([[\]{},:])\s*/g, "$1")
      // Treat single and double quotes alike; console output uses single.
      .replace(/'/g, '"')
  );
}

/** Judge a run's output lines against the expected test cases. */
export function judge(
  cases: readonly TestCase[],
  outputLines: readonly string[],
): BattleVerdict {
  const results = cases.map((testCase, i): TestCaseResult => {
    const actual = outputLines[i];

    if (actual === undefined) {
      return {
        name: testCase.name,
        expected: testCase.expected,
        actual: "",
        passed: false,
        detail: "No output for this case.",
      };
    }

    const passed = compareOutput(testCase.expected, actual);
    return {
      name: testCase.name,
      expected: testCase.expected,
      actual,
      passed,
      ...(passed
        ? {}
        : { detail: describeMismatch(testCase.expected, actual) }),
    };
  });

  const passedCount = results.filter((result) => result.passed).length;
  return {
    results,
    passedCount,
    total: cases.length,
    allPassed: cases.length > 0 && passedCount === cases.length,
  };
}

function describeMismatch(expected: string, actual: string): string {
  if (actual.trim() === "") return "Printed nothing.";
  if (normalise(expected).toLowerCase() === normalise(actual).toLowerCase()) {
    return "Differs only by letter case.";
  }
  return `Expected ${expected.trim()}, printed ${actual.trim()}.`;
}
