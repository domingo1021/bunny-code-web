import {
  clampCursor,
  currentLine,
  type DocState,
  type EditRecord,
} from "./types";

/**
 * Apply one recorded action to a document.
 *
 * This is the whole point of the rewrite. In the Vue original the same thirteen
 * transformations existed twice — once in `checkEventUp` (while recording) and
 * once in `triggerEvent` (while replaying) — written independently, so they
 * drifted. The clearest example: recording a backspace at column 0 stored
 * `code: "\n"`, while replay only joined lines when it saw `"\r\n"`, so
 * replaying a line-join silently did the wrong thing.
 *
 * Here there is one implementation, and both recording and replay go through
 * it, so the two cannot disagree. Line joins are decided from the *cursor
 * position* (`index === 0 && line > 0`) rather than by sniffing the recorded
 * text, which makes the behaviour independent of what the payload happens to
 * contain.
 *
 * The function is pure and total: it never throws and never returns an invalid
 * cursor, so a corrupt or out-of-order record degrades to a no-op instead of
 * corrupting the rest of the replay.
 */
export function applyEdit(doc: DocState, record: EditRecord): DocState {
  // Anchor to the position the record was made at, clamped into this document.
  const at = clampCursor(doc.lines, record.line, record.index);

  switch (record.action) {
    case "create":
      return insertText(at, record.code);

    case "tab":
      // Legacy payloads carry the literal indent in `code`; fall back to two
      // spaces when it is missing so an empty payload still indents.
      return insertText(at, record.code === "" ? INDENT : record.code);

    case "delete":
      return deleteBackwards(at);

    case "enter":
      return splitLine(doc, record);

    case "duplicate-line":
      return duplicateLine(at);

    case "delete-line":
      return deleteLine(at);

    case "click":
    case "up":
    case "down":
    case "left":
    case "right":
    case "line-start":
    case "line-end":
      // Cursor-only actions: the recorded position *is* the result.
      return at;
  }
}

/** Replay a whole recording over a starting document. */
export function applyEdits(
  doc: DocState,
  records: readonly EditRecord[],
): DocState {
  return records.reduce(applyEdit, doc);
}

export const INDENT = "  ";

/**
 * Insert `text` at the cursor and advance the cursor by one.
 *
 * Advancing by one rather than by `text.length` is deliberate and matches the
 * recorder: when auto-close inserts a pair (`(` becomes `()`), the cursor
 * belongs *between* the two characters. For a plain single character the two
 * rules coincide.
 */
function insertText(at: DocState, text: string): DocState {
  if (text === "") return at;

  const line = currentLine(at);
  const next = line.slice(0, at.index) + text + line.slice(at.index);
  const lines = replaceLine(at.lines, at.line, next);

  // A payload containing newlines (paste-like) still has to land somewhere
  // sensible, so re-split and place the cursor after the inserted text.
  if (text.includes("\n")) {
    const inserted = text.split("\n");
    const lastChunk = inserted[inserted.length - 1] ?? "";
    const reflowed = lines.join("\n").split("\n");
    return clampCursor(
      reflowed,
      at.line + inserted.length - 1,
      inserted.length > 1 ? lastChunk.length : at.index + 1,
    );
  }

  return clampCursor(lines, at.line, at.index + 1);
}

/**
 * Backspace.
 *
 * At column 0 this joins with the previous line; the cursor lands where the
 * join happened. At the very start of the document it is a no-op.
 */
function deleteBackwards(at: DocState): DocState {
  if (at.index === 0 && at.line === 0) return at;

  if (at.index === 0) {
    const previous = at.lines[at.line - 1] ?? "";
    const joined = previous + currentLine(at);
    const lines = [
      ...at.lines.slice(0, at.line - 1),
      joined,
      ...at.lines.slice(at.line + 1),
    ];
    return clampCursor(lines, at.line - 1, previous.length);
  }

  const line = currentLine(at);
  const next = line.slice(0, at.index - 1) + line.slice(at.index);
  return clampCursor(
    replaceLine(at.lines, at.line, next),
    at.line,
    at.index - 1,
  );
}

/**
 * Newline with auto-indent.
 *
 * `enter` is the one action whose record carries two different positions: the
 * line is split at the *live cursor*, while `record.index` is the column the
 * cursor ended up at when the keystroke was recorded, which doubles as the
 * width the continuation line is indented to. Replay therefore reproduces
 * exactly the indentation the author saw. Leading whitespace on the text that
 * moves down is dropped so it is not indented twice.
 */
function splitLine(doc: DocState, record: EditRecord): DocState {
  const cursor = clampCursor(doc.lines, doc.line, doc.index);
  const line = cursor.lines[cursor.line] ?? "";
  const head = line.slice(0, cursor.index);
  const tail = line.slice(cursor.index);
  const indentWidth = Math.max(Math.trunc(record.index) || 0, 0);

  const continuation =
    indentWidth > 0 ? " ".repeat(indentWidth) + tail.trimStart() : tail;

  const lines = [
    ...cursor.lines.slice(0, cursor.line),
    head,
    continuation,
    ...cursor.lines.slice(cursor.line + 1),
  ];
  return clampCursor(lines, cursor.line + 1, indentWidth);
}

/** Duplicate the cursor's line below itself; the cursor follows the copy. */
function duplicateLine(at: DocState): DocState {
  const line = currentLine(at);
  const lines = [
    ...at.lines.slice(0, at.line + 1),
    line,
    ...at.lines.slice(at.line + 1),
  ];
  return clampCursor(lines, at.line + 1, line.length);
}

/**
 * Remove the cursor's line.
 *
 * Deleting the only line empties the document rather than leaving zero lines,
 * because a document always has at least one line. Deleting the last line
 * parks the cursor at the end of the new last line; otherwise it sits at the
 * start of the line that moved up.
 */
function deleteLine(at: DocState): DocState {
  if (at.lines.length <= 1) {
    return { lines: [""], line: 0, index: 0 };
  }

  const lines = [...at.lines.slice(0, at.line), ...at.lines.slice(at.line + 1)];

  if (at.line >= lines.length) {
    const lastIndex = lines.length - 1;
    return clampCursor(lines, lastIndex, lines[lastIndex]?.length ?? 0);
  }

  return clampCursor(lines, at.line, 0);
}

function replaceLine(
  lines: readonly string[],
  at: number,
  value: string,
): string[] {
  const next = [...lines];
  next[at] = value;
  return next;
}
