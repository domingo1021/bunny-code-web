import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { applyEdits } from "@/core/replay/applyEdit";
import { docFromText, docToText } from "@/core/replay/types";
import { useRecorder } from "./use-recorder";

/**
 * The bridge between keystrokes and the pure core.
 *
 * What matters here is that the hook never produces a document the recording
 * cannot explain — so most of these assert the recorded log against the
 * document the hook is showing.
 */
describe("useRecorder", () => {
  it("starts empty and clean", () => {
    const { result } = renderHook(() => useRecorder());
    expect(result.current.text).toBe("");
    expect(result.current.pending).toEqual([]);
    expect(result.current.isDirty).toBe(false);
  });

  it("starts from initial text", () => {
    const { result } = renderHook(() => useRecorder("const a = 1;"));
    expect(result.current.text).toBe("const a = 1;");
    expect(result.current.doc.index).toBe(12);
  });

  it("records a typed character and reports the document", () => {
    const { result } = renderHook(() => useRecorder());

    act(() => {
      result.current.handleKeystroke({ key: "a" });
    });

    expect(result.current.text).toBe("a");
    expect(result.current.pending).toHaveLength(1);
    expect(result.current.pending[0]).toMatchObject({
      action: "create",
      code: "a",
    });
    expect(result.current.isDirty).toBe(true);
  });

  it("reports the save shortcut without recording an edit", () => {
    const { result } = renderHook(() => useRecorder());

    let outcome: "save" | boolean = false;
    act(() => {
      outcome = result.current.handleKeystroke({ key: "s", meta: true });
    });

    expect(outcome).toBe("save");
    expect(result.current.pending).toEqual([]);
  });

  it("leaves an unbound keystroke to the browser", () => {
    const { result } = renderHook(() => useRecorder());

    let outcome: "save" | boolean = true;
    act(() => {
      outcome = result.current.handleKeystroke({ key: "F5" });
    });

    expect(outcome).toBe(false);
    expect(result.current.pending).toEqual([]);
  });

  /* A no-op edit is still *handled*: the browser must not also act on it. */
  it("claims a backspace at the start of the document", () => {
    const { result } = renderHook(() => useRecorder());

    let outcome: "save" | boolean = false;
    act(() => {
      outcome = result.current.handleKeystroke({ key: "Backspace" });
    });

    expect(outcome).toBe(true);
    expect(result.current.pending).toEqual([]);
    expect(result.current.text).toBe("");
  });

  /*
   * The invariant the whole design exists for, at the hook level: replaying
   * what was recorded reproduces what the editor is showing.
   */
  it("produces a log that replays to the document it is showing", () => {
    const { result } = renderHook(() => useRecorder());

    act(() => {
      for (const key of "const total = 1 + 2;") {
        result.current.handleKeystroke({ key });
      }
    });
    act(() => {
      result.current.handleKeystroke({ key: "Enter" });
    });
    act(() => {
      for (const key of "go();") {
        result.current.handleKeystroke({ key });
      }
    });

    const replayed = applyEdits(docFromText(""), result.current.pending);
    expect(docToText(replayed)).toBe(result.current.text);
    expect(replayed.line).toBe(result.current.doc.line);
    expect(replayed.index).toBe(result.current.doc.index);
  });

  it("records a pointer move only when the cursor actually moves", () => {
    const { result } = renderHook(() => useRecorder("one\ntwo"));

    act(() => {
      result.current.handlePointer({ line: 0, index: 1 });
    });
    expect(result.current.pending).toHaveLength(1);
    expect(result.current.doc).toMatchObject({ line: 0, index: 1 });

    act(() => {
      result.current.handlePointer({ line: 0, index: 1 });
    });
    expect(result.current.pending).toHaveLength(1);
  });

  it("writes nanosecond timestamps, matching the stored format", () => {
    const { result } = renderHook(() => useRecorder());

    act(() => {
      result.current.handleKeystroke({ key: "x" });
    });

    const stamp = result.current.pending[0]?.timestamp ?? "";
    expect(stamp).toMatch(/^\d{19}$/);
  });

  it("loads a new document, discarding pending edits", () => {
    const { result } = renderHook(() => useRecorder());

    act(() => {
      result.current.handleKeystroke({ key: "a" });
    });
    expect(result.current.isDirty).toBe(true);

    act(() => {
      result.current.load("replaced");
    });

    expect(result.current.text).toBe("replaced");
    expect(result.current.pending).toEqual([]);
    expect(result.current.isDirty).toBe(false);
  });

  it("clears the pending log and the dirty flag on save", () => {
    const { result } = renderHook(() => useRecorder());

    act(() => {
      result.current.handleKeystroke({ key: "a" });
    });
    act(() => {
      result.current.markSaved();
    });

    expect(result.current.pending).toEqual([]);
    expect(result.current.isDirty).toBe(false);
    expect(result.current.text).toBe("a");
  });

  it("is not dirty when edits cancel out", () => {
    const { result } = renderHook(() => useRecorder("ab"));

    act(() => {
      result.current.handleKeystroke({ key: "c" });
    });
    act(() => {
      result.current.handleKeystroke({ key: "Backspace" });
    });

    // Two edits recorded, but the text is back to where it started.
    expect(result.current.pending).toHaveLength(2);
    expect(result.current.text).toBe("ab");
    expect(result.current.isDirty).toBe(false);
  });

  /* Replay drives the document without recording anything. */
  it("sets the document from a replay without logging an edit", () => {
    const { result } = renderHook(() => useRecorder());

    act(() => {
      result.current.setDoc(docFromText("from replay"));
    });

    expect(result.current.text).toBe("from replay");
    expect(result.current.pending).toEqual([]);
  });

  it("shows a replayed log applied to a base document", () => {
    const { result } = renderHook(() => useRecorder());

    const records = [
      {
        action: "create" as const,
        line: 0,
        index: 0,
        code: "X",
        timestamp: "1700000000000000000",
      },
    ];

    act(() => {
      result.current.showReplayed("base", records);
    });

    expect(result.current.text).toBe("Xbase");
    expect(result.current.pending).toEqual([]);
  });
});
