import { type TestCase } from "@/core/sandbox/testCases";
import { type QuestionLevel } from "@/core/realtime/protocol";

/**
 * Battle questions.
 *
 * The originals lived as Markdown files on CloudFront and are gone with the
 * rest of the backend, so they are re-created here. Each one carries the
 * starting code both battlers begin from, the prompt shown on the board, a
 * reference solution (used by the scripted opponent) and the test cases the
 * submission is judged against.
 */

export interface SeedQuestion {
  readonly questionName: string;
  readonly title: string;
  readonly level: QuestionLevel;
  /** Markdown shown on the battle board. */
  readonly prompt: string;
  /** Code both battlers start from. */
  readonly baseCode: string;
  /** A correct solution; the mock opponent types this. */
  readonly solution: string;
  readonly testCases: readonly TestCase[];
}

export const QUESTIONS: readonly SeedQuestion[] = [
  {
    questionName: "two-sum",
    title: "Two Sum",
    level: "EASY",
    prompt: `# Two Sum

Given an array of integers \`nums\` and an integer \`target\`, return the
**indices** of the two numbers that add up to \`target\`.

Each input has exactly one solution, and you may not use the same element
twice. Return the indices in ascending order.

### Examples

| Input | Output |
| --- | --- |
| \`nums = [2, 7, 11, 15]\`, \`target = 9\` | \`[0, 1]\` |
| \`nums = [3, 2, 4]\`, \`target = 6\` | \`[1, 2]\` |
| \`nums = [3, 3]\`, \`target = 6\` | \`[0, 1]\` |

### Constraints

- \`2 <= nums.length <= 10^4\`
- Aim for \`O(n)\` time — a nested loop will pass the tests but a reviewer
  will notice.
`,
    baseCode: `function twoSum(nums, target) {
  // your code here
}
`,
    solution: `function twoSum(nums, target) {
  const seen = new Map();
  for (let i = 0; i < nums.length; i++) {
    const need = target - nums[i];
    if (seen.has(need)) {
      return [seen.get(need), i];
    }
    seen.set(nums[i], i);
  }
  return [];
}
`,
    testCases: [
      {
        name: "nums = [2, 7, 11, 15], target = 9",
        input: "console.log(twoSum([2, 7, 11, 15], 9));",
        expected: "[0,1]",
      },
      {
        name: "nums = [3, 2, 4], target = 6",
        input: "console.log(twoSum([3, 2, 4], 6));",
        expected: "[1,2]",
      },
      {
        name: "nums = [3, 3], target = 6",
        input: "console.log(twoSum([3, 3], 6));",
        expected: "[0,1]",
      },
      {
        name: "nums = [-1, -2, -3, -4], target = -6",
        input: "console.log(twoSum([-1, -2, -3, -4], -6));",
        expected: "[1,3]",
      },
    ],
  },

  {
    questionName: "valid-parentheses",
    title: "Valid Parentheses",
    level: "MEDIUM",
    prompt: `# Valid Parentheses

Given a string \`s\` containing only \`()[]{}\`, decide whether it is valid.

A string is valid when every bracket is closed by the matching kind, in the
right order, and nothing is left open.

### Examples

| Input | Output |
| --- | --- |
| \`"()"\` | \`true\` |
| \`"()[]{}"\` | \`true\` |
| \`"(]"\` | \`false\` |
| \`"([)]"\` | \`false\` |
| \`"{[]}"\` | \`true\` |

### Constraints

- \`1 <= s.length <= 10^4\`
- A counter is not enough — \`"([)]"\` has balanced counts and is still invalid.
`,
    baseCode: `function isValid(s) {
  // your code here
}
`,
    solution: `function isValid(s) {
  const pairs = { ")": "(", "]": "[", "}": "{" };
  const stack = [];
  for (const char of s) {
    if (pairs[char] === undefined) {
      stack.push(char);
    } else if (stack.pop() !== pairs[char]) {
      return false;
    }
  }
  return stack.length === 0;
}
`,
    testCases: [
      {
        name: `s = "()"`,
        input: `console.log(isValid("()"));`,
        expected: "true",
      },
      {
        name: `s = "()[]{}"`,
        input: `console.log(isValid("()[]{}"));`,
        expected: "true",
      },
      {
        name: `s = "(]"`,
        input: `console.log(isValid("(]"));`,
        expected: "false",
      },
      {
        name: `s = "([)]"`,
        input: `console.log(isValid("([)]"));`,
        expected: "false",
      },
      {
        name: `s = "{[]}"`,
        input: `console.log(isValid("{[]}"));`,
        expected: "true",
      },
      {
        name: `s = "("`,
        input: `console.log(isValid("("));`,
        expected: "false",
      },
    ],
  },

  {
    questionName: "longest-substring",
    title: "Longest Substring Without Repeating Characters",
    level: "HARD",
    prompt: `# Longest Substring Without Repeating Characters

Given a string \`s\`, return the **length** of the longest substring that
contains no repeated characters.

### Examples

| Input | Output | Why |
| --- | --- | --- |
| \`"abcabcbb"\` | \`3\` | \`"abc"\` |
| \`"bbbbb"\` | \`1\` | \`"b"\` |
| \`"pwwkew"\` | \`3\` | \`"wke"\` |
| \`""\` | \`0\` | nothing to take |

### Constraints

- \`0 <= s.length <= 5 * 10^4\`
- A sliding window gets this in \`O(n)\`. Watch the case where the repeat is
  *behind* the window's left edge.
`,
    baseCode: `function lengthOfLongestSubstring(s) {
  // your code here
}
`,
    solution: `function lengthOfLongestSubstring(s) {
  const lastSeen = new Map();
  let best = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const previous = lastSeen.get(s[i]);
    if (previous !== undefined && previous >= start) {
      start = previous + 1;
    }
    lastSeen.set(s[i], i);
    best = Math.max(best, i - start + 1);
  }
  return best;
}
`,
    testCases: [
      {
        name: `s = "abcabcbb"`,
        input: `console.log(lengthOfLongestSubstring("abcabcbb"));`,
        expected: "3",
      },
      {
        name: `s = "bbbbb"`,
        input: `console.log(lengthOfLongestSubstring("bbbbb"));`,
        expected: "1",
      },
      {
        name: `s = "pwwkew"`,
        input: `console.log(lengthOfLongestSubstring("pwwkew"));`,
        expected: "3",
      },
      {
        name: `s = ""`,
        input: `console.log(lengthOfLongestSubstring(""));`,
        expected: "0",
      },
      {
        name: `s = "abba"`,
        input: `console.log(lengthOfLongestSubstring("abba"));`,
        expected: "2",
      },
    ],
  },
];

export function questionByName(name: string): SeedQuestion | undefined {
  return QUESTIONS.find((question) => question.questionName === name);
}
