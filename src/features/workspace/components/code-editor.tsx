"use client";

import { javascript } from "@codemirror/lang-javascript";
import { Annotation, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { dracula } from "@uiw/codemirror-theme-dracula";
import CodeMirror from "@uiw/react-codemirror";
import { useEffect, useMemo, useState } from "react";
import { type Keystroke, type PointerMove } from "@/core/replay/recordEdit";
import { docToText, type DocState } from "@/core/replay/types";

/**
 * The editor.
 *
 * It is **fully controlled by the recorder**: every keystroke is intercepted,
 * routed through `core/replay`, and the resulting document is pushed back into
 * CodeMirror. CodeMirror never edits its own document.
 *
 * That inversion is the point. The original let CodeMirror apply each edit and
 * separately hand-wrote a record of what it believed had happened — two
 * implementations of the same transformation, which is how recording and replay
 * drifted apart. Here there is one path, so a recording cannot describe
 * something other than what the editor did.
 *
 * The original pursued the same goal by overwriting `CodeMirror.commands` with
 * no-ops at module scope — mutating the library's global command table, so
 * every editor on the page lost its keybindings, including read-only ones.
 * CodeMirror 6 does it properly, with extensions scoped to one instance.
 *
 * Known limits, inherited from the same design: no IME composition, no paste,
 * no multi-cursor. The original blocked paste outright and swallowed every
 * modifier combination, so this is not a regression — but it is the trade made
 * for a provably faithful recording.
 */

/**
 * Marks a transaction as coming from the recorder.
 *
 * The transaction filter rejects every document change that is not annotated
 * with this, which is what stops CodeMirror editing its own document behind
 * the recorder's back — a change with no matching record would make the
 * recording wrong.
 */
const fromRecorder = Annotation.define<boolean>();

/**
 * How the editor treats its own edits.
 *
 * - `recorded` — the workspace. Every keystroke goes through the recorder and
 *   CodeMirror may not change the document itself, which is what makes a
 *   recording provably match the file.
 * - `plain` — a battle. Battles are not recorded (the original did not record
 *   them either; it streamed the whole file on each change), so CodeMirror
 *   edits normally and the resulting text is reported through `onChange`.
 */
export type EditMode = "recorded" | "plain";

export interface CodeEditorProps {
  doc: DocState;
  readOnly: boolean;
  mode?: EditMode;
  /** Required in `plain` mode: receives the document after every edit. */
  onChange?: (text: string) => void;
  /** Returns "save" for the save shortcut, true when handled, false to pass on. */
  onKeystroke?: (stroke: Keystroke) => "save" | boolean;
  onPointer?: (to: PointerMove) => void;
  onSaveShortcut?: () => void;
  /** Accessible name; an editor is a control with no visible label. */
  label: string;
  className?: string;
  height?: string;
}

export function CodeEditor({
  doc,
  readOnly,
  mode = "recorded",
  onChange,
  onKeystroke,
  onPointer,
  onSaveShortcut,
  label,
  className,
  height = "100%",
}: CodeEditorProps) {
  const [view, setView] = useState<EditorView | null>(null);
  const text = useMemo(() => docToText(doc), [doc]);

  /*
   * Extensions are built once and never depend on props, because rebuilding
   * them recreates the editor state and loses the selection.
   */
  const extensions = useMemo(
    () => [
      javascript(),
      EditorView.lineWrapping,
      // Only recorded mode locks CodeMirror out of its own document.
      ...(mode === "recorded"
        ? [
            EditorState.transactionFilter.of((transaction) =>
              transaction.docChanged &&
              transaction.annotation(fromRecorder) !== true
                ? []
                : transaction,
            ),
          ]
        : []),
    ],
    [mode],
  );

  /*
   * Input is handled with ordinary DOM listeners on the editor's content
   * element, in the capture phase so they run before CodeMirror's own
   * handling.
   *
   * Doing it here rather than inside a CodeMirror extension is what keeps the
   * extensions static while the handlers always see current props: the effect
   * simply re-attaches when a prop changes. The alternative — stashing props
   * in a ref read from inside an extension — needs a mutable escape hatch and
   * can go stale.
   */
  useEffect(() => {
    // Captured into a const so the nested handlers keep the non-null narrowing.
    const editor = view;
    if (editor === null) return;
    const content = editor.contentDOM;

    const onKeyDown = (event: KeyboardEvent): void => {
      // In plain mode CodeMirror owns the keymap; nothing to intercept.
      if (mode !== "recorded" || readOnly || onKeystroke === undefined) return;

      const outcome = onKeystroke({
        key: event.key,
        ctrl: event.ctrlKey,
        meta: event.metaKey,
        alt: event.altKey,
        shift: event.shiftKey,
      });

      if (outcome === "save") {
        event.preventDefault();
        event.stopPropagation();
        onSaveShortcut?.();
        return;
      }
      if (outcome) {
        // Claimed: stop CodeMirror and the browser acting on it too, or the
        // character would be inserted twice.
        event.preventDefault();
        event.stopPropagation();
      }
    };

    const onMouseUp = (): void => {
      if (mode !== "recorded" || readOnly || onPointer === undefined) return;
      const position = editor.state.selection.main.head;
      const line = editor.state.doc.lineAt(position);
      onPointer({ line: line.number - 1, index: position - line.from });
    };

    // Both would change the document without producing any record.
    const block = (event: Event): void => {
      event.preventDefault();
      event.stopPropagation();
    };

    content.addEventListener("keydown", onKeyDown, true);
    content.addEventListener("mouseup", onMouseUp);
    content.addEventListener("paste", block, true);
    content.addEventListener("drop", block, true);

    return () => {
      content.removeEventListener("keydown", onKeyDown, true);
      content.removeEventListener("mouseup", onMouseUp);
      content.removeEventListener("paste", block, true);
      content.removeEventListener("drop", block, true);
    };
  }, [view, mode, readOnly, onKeystroke, onPointer, onSaveShortcut]);

  /*
   * Push the recorder's document and cursor into CodeMirror.
   *
   * A transaction rather than a re-render with a new `value`, so the scroll
   * position survives and the editor state is not rebuilt per keystroke.
   */
  useEffect(() => {
    if (view === null) return;

    if (view.state.doc.toString() === text) {
      /*
       * Only recorded mode drives the caret. In plain mode the incoming text
       * is an echo of what the author just typed, and `docFromText` puts the
       * cursor at the end — so driving it would yank the caret to the bottom
       * of the file on every keystroke.
       */
      if (mode !== "recorded") return;
      const cursor = cursorOffset(view, doc);
      if (view.state.selection.main.head !== cursor) {
        view.dispatch({ selection: { anchor: cursor } });
      }
      return;
    }

    const previousCursor = view.state.selection.main.head;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: text },
      annotations: fromRecorder.of(true),
    });
    // Position the cursor after the text has landed, so the line lookup sees
    // the new document rather than the old one.
    view.dispatch({
      selection: {
        anchor:
          mode === "recorded"
            ? cursorOffset(view, doc)
            : Math.min(previousCursor, text.length),
      },
      // Keeps the caret on screen while a replay types past the viewport.
      scrollIntoView: mode === "recorded",
    });
  }, [view, mode, text, doc]);

  return (
    <CodeMirror
      value={text}
      height={height}
      theme={dracula}
      extensions={extensions}
      editable={!readOnly}
      className={className}
      onCreateEditor={setView}
      onChange={mode === "plain" ? onChange : undefined}
      basicSetup={{
        lineNumbers: true,
        foldGutter: false,
        highlightActiveLine: !readOnly,
        bracketMatching: true,
        /*
         * In recorded mode everything below is the recorder's job, and letting
         * CodeMirror also do it would produce edits with no matching record.
         * In plain mode CodeMirror handles its own editing, so it keeps its
         * keymap, history and bracket closing.
         */
        autocompletion: false,
        closeBrackets: mode === "plain",
        history: mode === "plain",
        indentOnInput: mode === "plain",
        defaultKeymap: mode === "plain",
        searchKeymap: false,
        historyKeymap: mode === "plain",
        completionKeymap: false,
        lintKeymap: false,
      }}
      aria-label={label}
    />
  );
}

/** Translate a (line, column) cursor into a CodeMirror document offset. */
function cursorOffset(view: EditorView, doc: DocState): number {
  const lineCount = view.state.doc.lines;
  const lineNumber = Math.min(Math.max(doc.line + 1, 1), lineCount);
  const line = view.state.doc.line(lineNumber);
  return Math.min(line.from + doc.index, line.to);
}
