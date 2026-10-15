import { describe, expect, it } from "vitest";
import { runUserCode } from "@/core/sandbox/evaluate";
import { judge } from "@/core/sandbox/testCases";
import { QUESTION_LEVEL_LABELS } from "@/core/realtime/protocol";
import { typeSource, typesBackTo } from "./typeSource";
import { QUESTIONS, questionByName } from "./questions";

/**
 * Fixtures verified against each other rather than eyeballed: every reference
 * solution is actually executed in the sandbox and judged by the same code the
 * battle screen uses. A wrong expected value in a test case, or a bug in a
 * seeded solution, fails here instead of looking like a broken feature in the
 * demo.
 */
describe.each(QUESTIONS.map((q) => [q.questionName, q] as const))(
  "question · %s",
  (_name, question) => {
    it("passes every one of its own test cases", () => {
      const program = [
        question.solution,
        ...question.testCases.map((testCase) => testCase.input),
      ].join("\n");

      const result = runUserCode(program);
      expect(result.error).toBeUndefined();
      expect(result.status).toBe("ok");

      const verdict = judge(question.testCases, result.output.split("\n"));
      const failures = verdict.results.filter((r) => !r.passed);
      expect(failures).toEqual([]);
      expect(verdict.allPassed).toBe(true);
    });

    it("has starting code that runs but does not solve the problem", () => {
      const result = runUserCode(question.baseCode);
      // The stub must at least parse, or a battler starts from a broken file.
      expect(result.status).toBe("ok");

      const attempt = runUserCode(
        [question.baseCode, ...question.testCases.map((t) => t.input)].join(
          "\n",
        ),
      );
      const verdict = judge(question.testCases, attempt.output.split("\n"));
      expect(verdict.allPassed).toBe(false);
    });

    it("is typable, so the opponent can be seen writing it", () => {
      const session = typeSource(question.solution);
      expect(typesBackTo(session, question.solution)).toBe(true);
      expect(session.records.length).toBeGreaterThan(20);
    });

    it("has a prompt, a title and a labelled level", () => {
      expect(question.prompt).toMatch(/^# /);
      expect(question.title).not.toBe("");
      expect(QUESTION_LEVEL_LABELS[question.level]).toBeTruthy();
    });

    it("has at least four test cases, each with a description", () => {
      expect(question.testCases.length).toBeGreaterThanOrEqual(4);
      for (const testCase of question.testCases) {
        expect(testCase.name).not.toBe("");
        expect(testCase.expected).not.toBe("");
        expect(testCase.input).toContain("console.log");
      }
    });
  },
);

describe("question catalogue", () => {
  it("has a question at every difficulty", () => {
    expect(new Set(QUESTIONS.map((q) => q.level)).size).toBe(3);
  });

  it("has unique names", () => {
    const names = QUESTIONS.map((q) => q.questionName);
    expect(new Set(names).size).toBe(names.length);
  });

  it("looks questions up by name", () => {
    expect(questionByName("two-sum")?.title).toBe("Two Sum");
    expect(questionByName("nope")).toBeUndefined();
  });
});
