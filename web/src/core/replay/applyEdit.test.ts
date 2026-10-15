import { describe, expect, it } from "vitest";
import { applyEdit, applyEdits } from "./applyEdit";
import {
  docFromText,
  docToText,
  type DocState,
  type EditAction,
  type EditRecord,
} from "./types";

function record(
  action: EditAction,
  line: number,
  index: number,
  code = "",
): EditRecord {
  return { action, line, index, code, timestamp: "1700000000000000000" };
}

/** A document with an explicit cursor, written as `text` plus a position. */
function doc(text: string, line: number, index: number): DocState {
  return { lines: text.split("\n"), line, index };
}

describe("applyEdit · create", () => {
  it("inserts a character at the cursor", () => {
    const next = applyEdit(doc("ab", 0, 1), record("create", 0, 1, "X"));
    expect(docToText(next)).toBe("aXb");
    expect(next.index).toBe(2);
  });

  it("places the cursor between an auto-closed pair", () => {
    const next = applyEdit(doc("f", 0, 1), record("create", 0, 1, "()"));
    expect(docToText(next)).toBe("f()");
    // Between the parens, not after them — so the next keystroke types inside.
    expect(next.index).toBe(2);
  });

  it("inserts into the correct line of a multi-line document", () => {
    const next = applyEdit(doc("one\ntwo", 1, 0), record("create", 1, 0, "X"));
    expect(docToText(next)).toBe("one\nXtwo");
    expect(next.line).toBe(1);
  });

  it("is a no-op for an empty payload", () => {
    const before = doc("ab", 0, 1);
    expect(applyEdit(before, record("create", 0, 1, ""))).toEqual(before);
  });
});

describe("applyEdit · delete", () => {
  it("removes the character before the cursor", () => {
    const next = applyEdit(doc("abc", 0, 2), record("delete", 0, 2));
    expect(docToText(next)).toBe("ac");
    expect(next.index).toBe(1);
  });

  /*
   * The regression this whole rewrite is built around. The Vue recorder stored
   * `code: "\n"` for a line join while the replayer only joined when it saw
   * `"\r\n"`, so replaying a backspace at column 0 deleted a character instead
   * of joining the lines. Deciding from the cursor position removes the
   * possibility entirely, so the payload is irrelevant here.
   */
  it.each([
    ["\n", "recorded by the original recorder"],
    ["\r\n", "expected by the original replayer"],
    ["", "missing entirely"],
  ])("joins lines when the cursor is at column 0 (payload %j, %s)", (code) => {
    const next = applyEdit(doc("one\ntwo", 1, 0), record("delete", 1, 0, code));
    expect(docToText(next)).toBe("onetwo");
    expect(next.line).toBe(0);
    expect(next.index).toBe(3);
  });

  it("is a no-op at the very start of the document", () => {
    const before = doc("abc", 0, 0);
    expect(applyEdit(before, record("delete", 0, 0))).toEqual(before);
  });
});

describe("applyEdit · enter", () => {
  it("splits the line at the cursor", () => {
    const next = applyEdit(doc("abcd", 0, 2), record("enter", 0, 0));
    expect(docToText(next)).toBe("ab\ncd");
    expect(next.line).toBe(1);
    expect(next.index).toBe(0);
  });

  it("indents the continuation to the recorded width", () => {
    const next = applyEdit(doc("  ab", 0, 4), record("enter", 0, 2));
    expect(docToText(next)).toBe("  ab\n  ");
    expect(next.index).toBe(2);
  });

  it("does not indent moved text twice", () => {
    // Cursor before "cd"; the continuation is indented to 2, and the text that
    // moves down must not keep its own leading spaces on top of that.
    const next = applyEdit(doc("ab  cd", 0, 2), record("enter", 0, 2));
    expect(docToText(next)).toBe("ab\n  cd");
  });

  it("keeps following lines intact", () => {
    const next = applyEdit(doc("a\nb\nc", 1, 1), record("enter", 1, 0));
    expect(docToText(next)).toBe("a\nb\n\nc");
  });
});

describe("applyEdit · tab", () => {
  it("inserts the recorded indent", () => {
    const next = applyEdit(doc("ab", 0, 0), record("tab", 0, 0, "  "));
    expect(docToText(next)).toBe("  ab");
    expect(next.index).toBe(1);
  });

  it("falls back to two spaces when the payload is empty", () => {
    const next = applyEdit(doc("ab", 0, 0), record("tab", 0, 0, ""));
    expect(docToText(next)).toBe("  ab");
  });
});

describe("applyEdit · duplicate-line", () => {
  it("copies the cursor's line below itself", () => {
    const next = applyEdit(
      doc("one\ntwo", 0, 1),
      record("duplicate-line", 0, 1),
    );
    expect(docToText(next)).toBe("one\none\ntwo");
    expect(next.line).toBe(1);
    expect(next.index).toBe(3);
  });

  it("works on the last line", () => {
    const next = applyEdit(
      doc("one\ntwo", 1, 0),
      record("duplicate-line", 1, 0),
    );
    expect(docToText(next)).toBe("one\ntwo\ntwo");
  });
});

describe("applyEdit · delete-line", () => {
  it("removes a middle line and parks the cursor at the start of the next", () => {
    const next = applyEdit(doc("a\nb\nc", 1, 1), record("delete-line", 1, 1));
    expect(docToText(next)).toBe("a\nc");
    expect(next.line).toBe(1);
    expect(next.index).toBe(0);
  });

  it("moves the cursor up when the last line is removed", () => {
    const next = applyEdit(doc("aa\nbb", 1, 1), record("delete-line", 1, 1));
    expect(docToText(next)).toBe("aa");
    expect(next.line).toBe(0);
    expect(next.index).toBe(2);
  });

  it("empties a single-line document rather than leaving no lines", () => {
    const next = applyEdit(doc("only", 0, 2), record("delete-line", 0, 2));
    expect(docToText(next)).toBe("");
    expect(next.lines).toEqual([""]);
    expect(next.line).toBe(0);
    expect(next.index).toBe(0);
  });
});

describe("applyEdit · cursor actions", () => {
  it.each([
    "click",
    "up",
    "down",
    "left",
    "right",
    "line-start",
    "line-end",
  ] as const)("%s moves the cursor and leaves the text alone", (action) => {
    const before = doc("one\ntwo", 0, 0);
    const next = applyEdit(before, record(action, 1, 2));
    expect(docToText(next)).toBe("one\ntwo");
    expect(next.line).toBe(1);
    expect(next.index).toBe(2);
  });
});

describe("applyEdit · totality", () => {
  /*
   * A recording replayed against a document it does not match must degrade,
   * not explode. The original indexed `splitContents[line]` unguarded and threw
   * `Cannot read properties of undefined`, which aborted the rest of a replay.
   */
  it("clamps a cursor beyond the last line", () => {
    const next = applyEdit(doc("a", 0, 0), record("create", 99, 99, "X"));
    expect(docToText(next)).toBe("aX");
    expect(next.line).toBe(0);
  });

  it("clamps a negative cursor", () => {
    const next = applyEdit(doc("ab", 0, 1), record("click", -5, -5));
    expect(next.line).toBe(0);
    expect(next.index).toBe(0);
  });

  it("survives a non-numeric cursor", () => {
    const bad = {
      action: "create",
      line: Number.NaN,
      index: Number.NaN,
      code: "X",
      timestamp: "0",
    } satisfies EditRecord;
    expect(docToText(applyEdit(doc("ab", 0, 1), bad))).toBe("Xab");
  });

  it("never returns a cursor outside the document", () => {
    const actions: EditAction[] = [
      "create",
      "delete",
      "enter",
      "tab",
      "duplicate-line",
      "delete-line",
      "click",
    ];
    for (const action of actions) {
      const next = applyEdit(doc("a\nbb", 1, 1), record(action, 5, 5, "z"));
      expect(next.line).toBeGreaterThanOrEqual(0);
      expect(next.line).toBeLessThan(next.lines.length);
      expect(next.index).toBeGreaterThanOrEqual(0);
      expect(next.index).toBeLessThanOrEqual(
        next.lines[next.line]?.length ?? 0,
      );
    }
  });
});

describe("applyEdits", () => {
  it("replays a sequence in order", () => {
    const records: EditRecord[] = [
      record("create", 0, 0, "c"),
      record("create", 0, 1, "o"),
      record("create", 0, 2, "n"),
      record("enter", 0, 0),
      record("create", 1, 0, "s"),
    ];
    expect(docToText(applyEdits(docFromText(""), records))).toBe("con\ns");
  });

  it("returns the starting document for an empty recording", () => {
    const before = docFromText("untouched");
    expect(applyEdits(before, [])).toEqual(before);
  });
});
