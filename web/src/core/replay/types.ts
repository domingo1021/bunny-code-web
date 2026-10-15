/**
 * The vocabulary of a recorded coding session.
 *
 * A Bunny Code "recording" is not a diff or a video: it is an ordered log of
 * tiny editor actions, each with the cursor position it happened at and a
 * nanosecond timestamp. Replaying a session means re-applying that log.
 *
 * The original Vue implementation defined these action names implicitly, in two
 * places, with two different spellings (`CopyLine`/`DeleteLine` in PascalCase
 * next to `create`/`delete` in lowercase) and two independent implementations of
 * what each one *does*. This module is the single definition.
 */

/**
 * Every action a recording can contain.
 *
 * `line-start` / `line-end` / `duplicate-line` / `delete-line` are the
 * canonical names for what the legacy payloads called `front` / `end` /
 * `CopyLine` / `DeleteLine`; the API schema maps the old spellings onto these
 * (see `legacyEditActions` in the mock API layer).
 */
export type EditAction =
  /** Insert text at the cursor. Carries the inserted text in `code`. */
  | "create"
  /** Backspace at the cursor. */
  | "delete"
  /** Newline, with auto-indent. */
  | "enter"
  /** Insert one indent level. */
  | "tab"
  /** Cursor moved by pointer. */
  | "click"
  /** Cursor moved by arrow key. */
  | "up"
  | "down"
  | "left"
  | "right"
  /** Cursor jumped to the start/end of the current line. */
  | "line-start"
  | "line-end"
  /** Duplicate the cursor's line below itself. */
  | "duplicate-line"
  /** Remove the cursor's line. */
  | "delete-line";

export const EDIT_ACTIONS: readonly EditAction[] = [
  "create",
  "delete",
  "enter",
  "tab",
  "click",
  "up",
  "down",
  "left",
  "right",
  "line-start",
  "line-end",
  "duplicate-line",
  "delete-line",
] as const;

/** Actions that only move the cursor and never change the text. */
export const CURSOR_ACTIONS: readonly EditAction[] = [
  "click",
  "up",
  "down",
  "left",
  "right",
  "line-start",
  "line-end",
] as const;

export function isCursorAction(action: EditAction): boolean {
  return CURSOR_ACTIONS.includes(action);
}

/**
 * One entry in a recording.
 *
 * `line` and `index` are the cursor position the action applies to (0-based
 * line, 0-based column). `timestamp` is a nanosecond epoch *string*: the
 * backend stored these in InfluxDB, whose precision is nanoseconds, and a
 * 19-digit integer does not survive a JavaScript `number`. Keeping it a string
 * here and parsing it with `BigInt` is why `buildTimeline` is correct where the
 * original — which called `new Date(nanosecondString)` — was not.
 */
export interface EditRecord {
  readonly action: EditAction;
  readonly line: number;
  readonly index: number;
  /** Text payload. Only `create` and `tab` use it; empty for every other action. */
  readonly code: string;
  readonly timestamp: string;
}

/**
 * A document plus its cursor.
 *
 * Text is held pre-split as `lines`. The original stored one big string and
 * called `split("\n")` plus a string-concatenating `reduce` on *every
 * keystroke*, which is O(document) allocations per character typed; keeping the
 * split form means an edit touches one line.
 */
export interface DocState {
  readonly lines: readonly string[];
  /** Cursor line, clamped to `0 .. lines.length - 1`. */
  readonly line: number;
  /** Cursor column, clamped to `0 .. lines[line].length`. */
  readonly index: number;
}

/** An empty document with the cursor at the origin. */
export const EMPTY_DOC: DocState = { lines: [""], line: 0, index: 0 };

/** Split text into a `DocState`, cursor at the very end. */
export function docFromText(text: string): DocState {
  const lines = text.split("\n");
  const line = lines.length - 1;
  return { lines, line, index: lines[line]?.length ?? 0 };
}

/** Re-join a `DocState` into text. */
export function docToText(doc: DocState): string {
  return doc.lines.join("\n");
}

/** The line the cursor is on, or `""` if the cursor is somehow out of range. */
export function currentLine(doc: DocState): string {
  return doc.lines[doc.line] ?? "";
}

/**
 * Clamp a cursor into a document.
 *
 * Every public entry point runs its result through this, which is what makes
 * `applyEdit` total: a recording that disagrees with the document it is being
 * replayed against degrades to a sane cursor instead of producing `undefined`
 * and poisoning every later action.
 */
export function clampCursor(
  lines: readonly string[],
  line: number,
  index: number,
): DocState {
  const safeLines = lines.length > 0 ? lines : [""];
  const safeLine = Math.min(
    Math.max(Math.trunc(line) || 0, 0),
    safeLines.length - 1,
  );
  const lineLength = safeLines[safeLine]?.length ?? 0;
  const safeIndex = Math.min(Math.max(Math.trunc(index) || 0, 0), lineLength);
  return { lines: safeLines, line: safeLine, index: safeIndex };
}
