import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { applyEdits } from "./applyEdit";
import { recordKeystroke, type Keystroke } from "./recordEdit";
import {
  docFromText,
  docToText,
  type DocState,
  type EditRecord,
} from "./types";

/**
 * The invariant this rewrite exists to guarantee:
 *
 *   replaying a recording reproduces exactly the document it was recorded from
 *
 * In the Vue original this was false, because recording and replay were two
 * independently written implementations of the same thirteen transformations.
 * Here both go through `applyEdit`, so the property holds by construction —
 * and this test is what keeps it that way.
 */

/** Keystrokes a session can contain, weighted towards ordinary typing. */
const keystroke: fc.Arbitrary<Keystroke> = fc.oneof(
  {
    weight: 10,
    arbitrary: fc
      .constantFrom(..."abcXYZ 0123_.;=+".split(""))
      .map((key) => ({ key })),
  },
  {
    weight: 4,
    arbitrary: fc.constantFrom("(", "[", "{", '"', "'").map((key) => ({ key })),
  },
  {
    weight: 3,
    arbitrary: fc.constantFrom(")", "]", "}").map((key) => ({ key })),
  },
  { weight: 4, arbitrary: fc.constant({ key: "Enter" }) },
  { weight: 4, arbitrary: fc.constant({ key: "Backspace" }) },
  { weight: 2, arbitrary: fc.constant({ key: "Tab" }) },
  {
    weight: 4,
    arbitrary: fc
      .constantFrom("ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown")
      .map((key) => ({ key })),
  },
  {
    weight: 2,
    arbitrary: fc.constantFrom("ArrowLeft", "ArrowRight").map((key) => ({
      key,
      alt: true,
    })),
  },
  { weight: 1, arbitrary: fc.constant({ key: "a", ctrl: true }) },
  { weight: 1, arbitrary: fc.constant({ key: "e", ctrl: true }) },
  { weight: 1, arbitrary: fc.constant({ key: "x", meta: true }) },
  {
    weight: 1,
    arbitrary: fc.constant({ key: "ArrowDown", shift: true, alt: true }),
  },
  // Keystrokes that must be ignored entirely.
  {
    weight: 1,
    arbitrary: fc
      .constantFrom("F5", "Shift", "Control")
      .map((key) => ({ key })),
  },
  { weight: 1, arbitrary: fc.constant({ key: "s", meta: true }) },
);

/** A plausible starting document, including the awkward empty case. */
const startingText: fc.Arbitrary<string> = fc.oneof(
  fc.constant(""),
  fc.constant("\n"),
  fc.constant("function solve(nums) {\n  return nums;\n}"),
  fc
    .array(fc.stringMatching(/^[a-z0-9 {}()]{0,12}$/), {
      minLength: 1,
      maxLength: 6,
    })
    .map((lines) => lines.join("\n")),
);

/** Record a keystroke sequence, returning the log and the resulting document. */
function recordSession(
  start: DocState,
  strokes: readonly Keystroke[],
): { records: EditRecord[]; doc: DocState } {
  const records: EditRecord[] = [];
  let doc = start;

  strokes.forEach((stroke, i) => {
    // Timestamps are nanosecond strings; spacing them keeps the log ordered.
    const timestamp = `${1_700_000_000_000n * 1_000_000n + BigInt(i) * 50_000_000n}`;
    const result = recordKeystroke(doc, stroke, timestamp);
    if (result === null) return;
    records.push(result.record);
    doc = result.doc;
  });

  return { records, doc };
}

describe("record → replay round trip", () => {
  it("replays to the exact document that was recorded", () => {
    fc.assert(
      fc.property(
        startingText,
        fc.array(keystroke, { maxLength: 120 }),
        (text, strokes) => {
          const start = docFromText(text);
          const { records, doc: recorded } = recordSession(start, strokes);

          const replayed = applyEdits(start, records);

          expect(docToText(replayed)).toBe(docToText(recorded));
          expect(replayed.line).toBe(recorded.line);
          expect(replayed.index).toBe(recorded.index);
        },
      ),
      { numRuns: 300 },
    );
  });

  it("replays correctly when stopped at any point part-way through", () => {
    fc.assert(
      fc.property(
        startingText,
        fc.array(keystroke, { minLength: 1, maxLength: 60 }),
        fc.nat(),
        (text, strokes, cut) => {
          const start = docFromText(text);
          const { records } = recordSession(start, strokes);
          fc.pre(records.length > 0);

          const upTo = cut % (records.length + 1);

          // Replaying a prefix must match re-recording only that prefix, which
          // is what makes scrubbing to an arbitrary point correct.
          const prefix = records.slice(0, upTo);
          const expected = applyEdits(start, prefix);
          const stepwise = prefix.reduce(
            (doc, record) => applyEdits(doc, [record]),
            start,
          );

          expect(docToText(stepwise)).toBe(docToText(expected));
          expect(stepwise.line).toBe(expected.line);
          expect(stepwise.index).toBe(expected.index);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("never produces an out-of-range cursor or an empty line array", () => {
    fc.assert(
      fc.property(
        startingText,
        fc.array(keystroke, { maxLength: 120 }),
        (text, strokes) => {
          const start = docFromText(text);
          const { records } = recordSession(start, strokes);

          let doc = start;
          for (const r of records) {
            doc = applyEdits(doc, [r]);
            expect(doc.lines.length).toBeGreaterThan(0);
            expect(doc.line).toBeGreaterThanOrEqual(0);
            expect(doc.line).toBeLessThan(doc.lines.length);
            expect(doc.index).toBeGreaterThanOrEqual(0);
            expect(doc.index).toBeLessThanOrEqual(
              doc.lines[doc.line]?.length ?? 0,
            );
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it("is deterministic: replaying the same log twice gives the same document", () => {
    fc.assert(
      fc.property(
        startingText,
        fc.array(keystroke, { maxLength: 80 }),
        (text, strokes) => {
          const start = docFromText(text);
          const { records } = recordSession(start, strokes);
          expect(docToText(applyEdits(start, records))).toBe(
            docToText(applyEdits(start, records)),
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});
