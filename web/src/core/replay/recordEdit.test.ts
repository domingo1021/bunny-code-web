import { describe, expect, it } from "vitest";
import {
  nextIndentWidth,
  recordKeystroke,
  recordPointerMove,
  resolveKeystroke,
  type Keystroke,
} from "./recordEdit";
import { docToText, type DocState } from "./types";

const TS = "1700000000000000000";

function doc(text: string, line: number, index: number): DocState {
  return { lines: text.split("\n"), line, index };
}

function type(state: DocState, stroke: Keystroke) {
  return recordKeystroke(state, stroke, TS);
}

describe("resolveKeystroke", () => {
  it.each<[Keystroke, string]>([
    [{ key: "Enter" }, "enter"],
    [{ key: "Backspace" }, "delete"],
    [{ key: "Tab" }, "tab"],
    [{ key: "ArrowLeft" }, "left"],
    [{ key: "ArrowRight" }, "right"],
    [{ key: "ArrowUp" }, "up"],
    [{ key: "ArrowDown" }, "down"],
    [{ key: "Home" }, "line-start"],
    [{ key: "End" }, "line-end"],
    [{ key: "a", ctrl: true }, "line-start"],
    [{ key: "e", ctrl: true }, "line-end"],
    [{ key: "x", meta: true }, "delete-line"],
    [{ key: "ArrowDown", shift: true, alt: true }, "duplicate-line"],
    [{ key: "q" }, "create"],
  ])("maps %o to the %s action", (stroke, action) => {
    expect(resolveKeystroke(stroke)).toEqual({ kind: "edit", action });
  });

  it("treats cmd+s as a save command, not an edit", () => {
    expect(resolveKeystroke({ key: "s", meta: true })).toEqual({
      kind: "command",
      command: "save",
    });
  });

  /*
   * The original fell through to a catch-all that re-set the document for any
   * unrecognised modifier combination. Unbound keys must simply do nothing.
   */
  it.each<Keystroke>([
    { key: "F5" },
    { key: "Shift" },
    { key: "p", meta: true },
    { key: "p", ctrl: true },
    { key: "Dead" },
  ])("ignores %o", (stroke) => {
    expect(resolveKeystroke(stroke)).toEqual({ kind: "ignored" });
  });
});

describe("recordKeystroke · insertion", () => {
  it("records a typed character", () => {
    const result = type(doc("ab", 0, 1), { key: "X" });
    expect(result?.record).toMatchObject({
      action: "create",
      line: 0,
      index: 1,
      code: "X",
    });
    expect(docToText(result!.doc)).toBe("aXb");
  });

  it.each([
    ["(", "()"],
    ["[", "[]"],
    ["{", "{}"],
    ['"', '""'],
    ["'", "''"],
  ])("auto-closes %s as %s", (key, expected) => {
    const result = type(doc("", 0, 0), { key });
    expect(result?.record.code).toBe(expected);
    expect(docToText(result!.doc)).toBe(expected);
    expect(result?.doc.index).toBe(1);
  });

  /*
   * Typing the closer when it is already in front of the cursor steps over it.
   * The original inserted a second one, so typing `()` left you with `())`.
   */
  it("steps over an existing closing character instead of doubling it", () => {
    const afterOpen = type(doc("", 0, 0), { key: "(" })!;
    expect(docToText(afterOpen.doc)).toBe("()");

    const afterClose = type(afterOpen.doc, { key: ")" })!;
    expect(docToText(afterClose.doc)).toBe("()");
    expect(afterClose.record.action).toBe("right");
    expect(afterClose.doc.index).toBe(2);
  });
});

describe("recordKeystroke · deletion", () => {
  it("records a backspace", () => {
    const result = type(doc("ab", 0, 2), { key: "Backspace" });
    expect(result?.record.action).toBe("delete");
    expect(docToText(result!.doc)).toBe("a");
  });

  it("records a line join at column 0", () => {
    const result = type(doc("one\ntwo", 1, 0), { key: "Backspace" });
    expect(docToText(result!.doc)).toBe("onetwo");
    expect(result?.doc.index).toBe(3);
  });

  it("returns null at the start of the document", () => {
    expect(type(doc("abc", 0, 0), { key: "Backspace" })).toBeNull();
  });
});

describe("recordKeystroke · enter and indentation", () => {
  it("carries the current indent onto the next line", () => {
    const result = type(doc("  const a = 1", 0, 13), { key: "Enter" });
    expect(result?.record.index).toBe(2);
    expect(docToText(result!.doc)).toBe("  const a = 1\n  ");
  });

  it("indents one level deeper after an opening brace", () => {
    const result = type(doc("function f() {", 0, 14), { key: "Enter" });
    expect(result?.record.index).toBe(2);
    expect(docToText(result!.doc)).toBe("function f() {\n  ");
  });

  it("nests indentation", () => {
    const result = type(doc("  if (x) {", 0, 10), { key: "Enter" });
    expect(result?.record.index).toBe(4);
  });

  describe("nextIndentWidth", () => {
    it.each([
      ["", 0, 0],
      ["abc", 3, 0],
      ["    abc", 7, 4],
      ["{", 1, 2],
      ["  {", 3, 4],
      ["  abc {", 7, 4],
      // Cursor before the indent has been typed: never indent past the cursor.
      ["    abc", 2, 2],
    ])("%j at %i → %i", (line, cursor, expected) => {
      expect(nextIndentWidth(line, cursor)).toBe(expected);
    });
  });
});

describe("recordKeystroke · cursor movement", () => {
  it("wraps left across a line boundary", () => {
    const result = type(doc("one\ntwo", 1, 0), { key: "ArrowLeft" });
    expect(result?.doc).toMatchObject({ line: 0, index: 3 });
  });

  it("wraps right across a line boundary", () => {
    const result = type(doc("one\ntwo", 0, 3), { key: "ArrowRight" });
    expect(result?.doc).toMatchObject({ line: 1, index: 0 });
  });

  it("clamps the column when moving onto a shorter line", () => {
    const result = type(doc("abcdef\nxy", 0, 6), { key: "ArrowDown" });
    expect(result?.doc).toMatchObject({ line: 1, index: 2 });
  });

  it("jumps by word with alt", () => {
    const result = type(doc("const value = 1", 0, 15), {
      key: "ArrowLeft",
      alt: true,
    });
    expect(result?.doc.index).toBe(14);

    const twice = type(result!.doc, { key: "ArrowLeft", alt: true });
    expect(twice?.doc.index).toBe(6);
  });

  it("records line-start and line-end at the line bounds", () => {
    const start = type(doc("  abc", 0, 3), { key: "a", ctrl: true });
    expect(start?.record).toMatchObject({ action: "line-start", index: 0 });

    const end = type(doc("  abc", 0, 1), { key: "e", ctrl: true });
    expect(end?.record).toMatchObject({ action: "line-end", index: 5 });
  });

  it("returns null for an ignored keystroke", () => {
    expect(type(doc("abc", 0, 1), { key: "F5" })).toBeNull();
  });
});

describe("recordPointerMove", () => {
  it("records a click as a cursor move", () => {
    const result = recordPointerMove(
      doc("one\ntwo", 0, 0),
      { line: 1, index: 2 },
      TS,
    );
    expect(result?.record).toMatchObject({
      action: "click",
      line: 1,
      index: 2,
    });
    expect(result?.doc).toMatchObject({ line: 1, index: 2 });
  });

  it("returns null when the cursor did not actually move", () => {
    expect(
      recordPointerMove(doc("one", 0, 2), { line: 0, index: 2 }, TS),
    ).toBeNull();
  });

  it("returns null when a click lands outside the document and clamps onto the cursor", () => {
    expect(
      recordPointerMove(doc("one", 0, 3), { line: 9, index: 9 }, TS),
    ).toBeNull();
  });
});
