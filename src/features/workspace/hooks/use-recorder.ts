"use client";

import { useCallback, useMemo, useReducer } from "react";
import { applyEdits } from "@/core/replay/applyEdit";
import {
  recordKeystroke,
  recordPointerMove,
  resolveKeystroke,
  type Keystroke,
  type PointerMove,
} from "@/core/replay/recordEdit";
import { nowAsNanos } from "@/core/replay/timeline";
import {
  docFromText,
  docToText,
  EMPTY_DOC,
  type DocState,
  type EditRecord,
} from "@/core/replay/types";

/**
 * Owns the document being edited and the log of edits made to it.
 *
 * All editing goes through `core/replay`, so the recording is produced by the
 * same function that replays it. The Vue version instead let CodeMirror apply
 * the edit *and* hand-wrote a parallel record of what it thought had happened,
 * which is how the two drifted apart.
 *
 * State lives in a reducer rather than several `useState` calls because a
 * keystroke changes the document, the cursor and the log together; splitting
 * them allows a render where the cursor has moved but the text has not.
 */

export interface RecorderState {
  readonly doc: DocState;
  /** Edits made since the last save. */
  readonly pending: readonly EditRecord[];
  /** Content as it was at the last save, for the dirty check. */
  readonly savedText: string;
}

type RecorderAction =
  | { type: "reset"; text: string }
  /*
   * The reducer derives the record from its *own* current document rather than
   * being handed one computed in the component. Computing it outside meant
   * closing over `state.doc`, so two keystrokes dispatched before React
   * re-rendered both applied to the same stale document — the second landing
   * at the first's cursor position. It also makes the callbacks stable, which
   * matters because the editor re-attaches its DOM listeners when they change.
   */
  | { type: "keystroke"; stroke: Keystroke; timestamp: string }
  | { type: "pointer"; to: PointerMove; timestamp: string }
  | { type: "replace"; doc: DocState }
  | { type: "saved" };

function reducer(state: RecorderState, action: RecorderAction): RecorderState {
  switch (action.type) {
    case "reset": {
      const doc = docFromText(action.text);
      return { doc, pending: [], savedText: action.text };
    }
    case "keystroke": {
      const result = recordKeystroke(
        state.doc,
        action.stroke,
        action.timestamp,
      );
      if (result === null) return state;
      return {
        ...state,
        doc: result.doc,
        pending: [...state.pending, result.record],
      };
    }
    case "pointer": {
      const result = recordPointerMove(state.doc, action.to, action.timestamp);
      if (result === null) return state;
      return {
        ...state,
        doc: result.doc,
        pending: [...state.pending, result.record],
      };
    }
    case "replace":
      // Used by replay, which drives the document without recording anything.
      return { ...state, doc: action.doc };
    case "saved":
      return { ...state, pending: [], savedText: docToText(state.doc) };
  }
}

export interface Recorder {
  readonly doc: DocState;
  readonly text: string;
  readonly pending: readonly EditRecord[];
  /** True when there are unsaved edits. */
  readonly isDirty: boolean;
  /**
   * Handle a keystroke. Returns `"save"` when the keystroke was the save
   * shortcut, `true` when it produced an edit, and `false` when it should be
   * left to the browser.
   */
  handleKeystroke: (stroke: Keystroke) => "save" | boolean;
  handlePointer: (to: PointerMove) => void;
  /** Load a document, discarding any pending edits. */
  load: (text: string) => void;
  /** Drive the document from a replay, without recording. */
  setDoc: (doc: DocState) => void;
  /** Replay a log onto a base document and show the result. */
  showReplayed: (base: string, records: readonly EditRecord[]) => void;
  markSaved: () => void;
}

export function useRecorder(initialText = ""): Recorder {
  const [state, dispatch] = useReducer(reducer, initialText, (text) => ({
    doc: docFromText(text),
    pending: [],
    savedText: text,
  }));

  const handleKeystroke = useCallback((stroke: Keystroke): "save" | boolean => {
    // What a keystroke *means* is a pure function of the keystroke, so it is
    // answered here without consulting the document.
    const resolved = resolveKeystroke(stroke);
    if (resolved.kind === "command") return "save";
    if (resolved.kind === "ignored") return false;

    // `nowAsNanos` matches the nanosecond format recordings are stored in,
    // so a session recorded here is indistinguishable from a seeded one.
    dispatch({ type: "keystroke", stroke, timestamp: nowAsNanos() });
    // Even a no-op edit (backspace at the start of the file) counts as
    // handled: the browser must not also act on it.
    return true;
  }, []);

  const handlePointer = useCallback((to: PointerMove) => {
    dispatch({ type: "pointer", to, timestamp: nowAsNanos() });
  }, []);

  const load = useCallback((text: string) => {
    dispatch({ type: "reset", text });
  }, []);

  const setDoc = useCallback((doc: DocState) => {
    dispatch({ type: "replace", doc });
  }, []);

  const showReplayed = useCallback(
    (base: string, records: readonly EditRecord[]) => {
      dispatch({
        type: "replace",
        doc: applyEdits(docFromText(base), records),
      });
    },
    [],
  );

  const markSaved = useCallback(() => {
    dispatch({ type: "saved" });
  }, []);

  const text = useMemo(() => docToText(state.doc), [state.doc]);

  return {
    doc: state.doc,
    text,
    pending: state.pending,
    isDirty: state.pending.length > 0 && text !== state.savedText,
    handleKeystroke,
    handlePointer,
    load,
    setDoc,
    showReplayed,
    markSaved,
  };
}

export { EMPTY_DOC };
