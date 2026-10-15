import { applyEdit, INDENT } from "./applyEdit";
import {
  currentLine,
  type DocState,
  type EditAction,
  type EditRecord,
} from "./types";

/**
 * A keystroke, described without reference to the DOM so that `src/core` stays
 * framework-free and the keymap is testable without a browser.
 */
export interface Keystroke {
  /** `KeyboardEvent.key`. */
  readonly key: string;
  readonly ctrl?: boolean;
  /** The Command key on macOS. */
  readonly meta?: boolean;
  readonly alt?: boolean;
  readonly shift?: boolean;
}

/** A pointer-driven cursor move, which is recorded as a `click`. */
export interface PointerMove {
  readonly line: number;
  readonly index: number;
}

/**
 * What a keystroke means. `"save"` is an app command rather than an edit, so it
 * is surfaced separately instead of being silently swallowed.
 */
export type ResolvedKeystroke =
  | { readonly kind: "edit"; readonly action: EditAction }
  | { readonly kind: "command"; readonly command: "save" }
  | { readonly kind: "ignored" };

/** Characters that auto-close, and what they close with. */
export const AUTO_CLOSE_PAIRS: Readonly<Record<string, string>> = {
  "(": ")",
  "[": "]",
  "{": "}",
  '"': '"',
  "'": "'",
};

const CLOSING_CHARS = new Set(Object.values(AUTO_CLOSE_PAIRS));

/**
 * The editor keymap, mirroring the shortcut list the original app advertised in
 * its help dialog.
 *
 * Returning a value for every branch — rather than falling through to a
 * catch-all that re-sets the document, as the Vue version did — is what makes
 * unhandled modifier combinations a no-op instead of a surprise edit.
 */
export function resolveKeystroke(stroke: Keystroke): ResolvedKeystroke {
  const { key, ctrl, meta, alt, shift } = stroke;

  if (meta && (key === "s" || key === "S")) {
    return { kind: "command", command: "save" };
  }
  if (meta && (key === "x" || key === "X")) {
    return { kind: "edit", action: "delete-line" };
  }
  if (shift && alt && key === "ArrowDown") {
    return { kind: "edit", action: "duplicate-line" };
  }
  if (ctrl && (key === "a" || key === "A")) {
    return { kind: "edit", action: "line-start" };
  }
  if (ctrl && (key === "e" || key === "E")) {
    return { kind: "edit", action: "line-end" };
  }

  switch (key) {
    case "Enter":
      return { kind: "edit", action: "enter" };
    case "Backspace":
      return { kind: "edit", action: "delete" };
    case "Tab":
      return { kind: "edit", action: "tab" };
    case "ArrowLeft":
      return { kind: "edit", action: "left" };
    case "ArrowRight":
      return { kind: "edit", action: "right" };
    case "ArrowUp":
      return { kind: "edit", action: "up" };
    case "ArrowDown":
      return { kind: "edit", action: "down" };
    case "Home":
      return { kind: "edit", action: "line-start" };
    case "End":
      return { kind: "edit", action: "line-end" };
    default:
      break;
  }

  // A single printable character inserts text. Anything else (F-keys, modifier
  // combinations we do not bind, dead keys) is ignored rather than recorded.
  if (isPrintable(key) && !ctrl && !meta && !alt) {
    return { kind: "edit", action: "create" };
  }

  return { kind: "ignored" };
}

/**
 * Turn a keystroke into a record plus the resulting document, or `null` when
 * the keystroke changes nothing (an ignored key, or backspace at the very
 * start of the document).
 *
 * The returned document is produced by `applyEdit`, never by a second
 * hand-written transformation. That is what guarantees a recording replays to
 * exactly the document its author was looking at, and it is asserted directly
 * by the round-trip property test.
 */
export function recordKeystroke(
  doc: DocState,
  stroke: Keystroke,
  timestamp: string,
): { readonly record: EditRecord; readonly doc: DocState } | null {
  const resolved = resolveKeystroke(stroke);
  if (resolved.kind !== "edit") return null;

  const record = buildRecord(doc, resolved.action, stroke, timestamp);
  if (record === null) return null;

  return { record, doc: applyEdit(doc, record) };
}

/** Record a pointer-driven cursor move, or `null` if the cursor did not move. */
export function recordPointerMove(
  doc: DocState,
  to: PointerMove,
  timestamp: string,
): { readonly record: EditRecord; readonly doc: DocState } | null {
  const record: EditRecord = {
    action: "click",
    line: to.line,
    index: to.index,
    code: "",
    timestamp,
  };
  const next = applyEdit(doc, record);
  if (next.line === doc.line && next.index === doc.index) return null;
  return { record, doc: next };
}

function buildRecord(
  doc: DocState,
  action: EditAction,
  stroke: Keystroke,
  timestamp: string,
): EditRecord | null {
  const at = { line: doc.line, index: doc.index };
  const line = currentLine(doc);

  switch (action) {
    case "create": {
      // Typing a closing character that is already in front of the cursor
      // steps over it instead of doubling it, which is recorded as a plain
      // cursor move. The original had no such handling and produced `))`.
      if (CLOSING_CHARS.has(stroke.key) && line[doc.index] === stroke.key) {
        return { action: "right", ...cursorRight(doc), code: "", timestamp };
      }
      const close = AUTO_CLOSE_PAIRS[stroke.key];
      return {
        action: "create",
        ...at,
        code: close === undefined ? stroke.key : stroke.key + close,
        timestamp,
      };
    }

    case "tab":
      return { action: "tab", ...at, code: INDENT, timestamp };

    case "delete":
      if (doc.line === 0 && doc.index === 0) return null;
      return { action: "delete", ...at, code: "", timestamp };

    case "enter":
      // `index` doubles as the width the continuation line is indented to:
      // the current line's leading whitespace, one level deeper after a `{`.
      return {
        action: "enter",
        line: doc.line,
        index: nextIndentWidth(line, doc.index),
        code: "",
        timestamp,
      };

    case "duplicate-line":
    case "delete-line":
      return { action, ...at, code: "", timestamp };

    case "left":
      return {
        action: "left",
        ...cursorLeft(doc, stroke.alt === true),
        code: "",
        timestamp,
      };
    case "right":
      return {
        action: "right",
        ...cursorRight(doc, stroke.alt === true),
        code: "",
        timestamp,
      };
    case "up":
      return { action: "up", ...cursorVertical(doc, -1), code: "", timestamp };
    case "down":
      return { action: "down", ...cursorVertical(doc, 1), code: "", timestamp };
    case "line-start":
      return {
        action: "line-start",
        line: doc.line,
        index: 0,
        code: "",
        timestamp,
      };
    case "line-end":
      return {
        action: "line-end",
        line: doc.line,
        index: line.length,
        code: "",
        timestamp,
      };

    case "click":
      // Pointer moves come in through `recordPointerMove`, which knows the
      // target position; there is nothing to derive from a keystroke.
      return null;
  }
}

/**
 * Indent width for the line created by pressing Enter: the current line's
 * leading whitespace, plus one level if the text before the cursor opens a block.
 */
export function nextIndentWidth(line: string, cursor: number): number {
  const leading = line.length - line.trimStart().length;
  const base = Math.min(leading, cursor);
  const head = line.slice(0, cursor).trimEnd();
  return head.endsWith("{") ? base + INDENT.length : base;
}

function cursorLeft(doc: DocState, byWord = false): PointerMove {
  const line = currentLine(doc);
  if (doc.index > 0) {
    return {
      line: doc.line,
      index: byWord ? wordBoundaryLeft(line, doc.index) : doc.index - 1,
    };
  }
  if (doc.line > 0) {
    const previous = doc.lines[doc.line - 1] ?? "";
    return { line: doc.line - 1, index: previous.length };
  }
  return { line: 0, index: 0 };
}

function cursorRight(doc: DocState, byWord = false): PointerMove {
  const line = currentLine(doc);
  if (doc.index < line.length) {
    return {
      line: doc.line,
      index: byWord ? wordBoundaryRight(line, doc.index) : doc.index + 1,
    };
  }
  if (doc.line < doc.lines.length - 1) {
    return { line: doc.line + 1, index: 0 };
  }
  return { line: doc.line, index: line.length };
}

function cursorVertical(doc: DocState, delta: -1 | 1): PointerMove {
  const target = doc.line + delta;
  if (target < 0 || target > doc.lines.length - 1) {
    return { line: doc.line, index: doc.index };
  }
  const targetLine = doc.lines[target] ?? "";
  return { line: target, index: Math.min(doc.index, targetLine.length) };
}

const WORD_CHAR = /[\p{L}\p{N}_]/u;

function wordBoundaryLeft(line: string, from: number): number {
  let i = from;
  while (i > 0 && !WORD_CHAR.test(line[i - 1] ?? "")) i -= 1;
  while (i > 0 && WORD_CHAR.test(line[i - 1] ?? "")) i -= 1;
  return i;
}

function wordBoundaryRight(line: string, from: number): number {
  let i = from;
  while (i < line.length && !WORD_CHAR.test(line[i] ?? "")) i += 1;
  while (i < line.length && WORD_CHAR.test(line[i] ?? "")) i += 1;
  return i;
}

/** A key that represents one typed character (as opposed to a named key). */
export function isPrintable(key: string): boolean {
  return [...key].length === 1;
}
