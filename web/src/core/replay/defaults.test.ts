import { afterEach, describe, expect, it, vi } from "vitest";
import { applyEdit } from "./applyEdit";
import { ReplayClock } from "./clock";
import { buildTimeline } from "./timeline";
import {
  CURSOR_ACTIONS,
  clampCursor,
  docFromText,
  docToText,
  EDIT_ACTIONS,
  EMPTY_DOC,
  isCursorAction,
  type EditRecord,
} from "./types";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("action metadata", () => {
  it("lists every action exactly once", () => {
    expect(new Set(EDIT_ACTIONS).size).toBe(EDIT_ACTIONS.length);
    expect(EDIT_ACTIONS).toHaveLength(13);
  });

  it("classifies cursor-only actions", () => {
    for (const action of CURSOR_ACTIONS) {
      expect(isCursorAction(action)).toBe(true);
    }
    for (const action of ["create", "delete", "enter", "tab"] as const) {
      expect(isCursorAction(action)).toBe(false);
    }
  });

  it("treats exactly the text-changing actions as non-cursor", () => {
    const changing = EDIT_ACTIONS.filter((a) => !isCursorAction(a));
    expect(changing).toEqual([
      "create",
      "delete",
      "enter",
      "tab",
      "duplicate-line",
      "delete-line",
    ]);
  });
});

describe("document helpers", () => {
  it("EMPTY_DOC is a single empty line at the origin", () => {
    expect(EMPTY_DOC).toEqual({ lines: [""], line: 0, index: 0 });
    expect(docToText(EMPTY_DOC)).toBe("");
  });

  it("docFromText puts the cursor at the very end", () => {
    expect(docFromText("ab\ncde")).toEqual({
      lines: ["ab", "cde"],
      line: 1,
      index: 3,
    });
  });

  it("docFromText round-trips through docToText", () => {
    for (const text of ["", "\n", "a", "a\nb", "a\n\nb\n"]) {
      expect(docToText(docFromText(text))).toBe(text);
    }
  });

  it("clampCursor repairs an empty line array", () => {
    expect(clampCursor([], 3, 3)).toEqual({ lines: [""], line: 0, index: 0 });
  });
});

describe("applyEdit · multi-line payload", () => {
  /* A `create` payload normally holds one character, or two when auto-close
     fires. A payload with newlines should still land somewhere coherent rather
     than leaving a literal "\n" inside a single line. */
  function create(code: string, line: number, index: number): EditRecord {
    return { action: "create", line, index, code, timestamp: "0" };
  }

  it("re-splits the document and parks the cursor after the insert", () => {
    const next = applyEdit(docFromText("ab"), create("X\nY", 0, 1));
    expect(docToText(next)).toBe("aX\nYb");
    expect(next.line).toBe(1);
    expect(next.index).toBe(1);
  });

  it("handles a payload that is only a newline", () => {
    const next = applyEdit(docFromText("ab"), create("\n", 0, 1));
    expect(docToText(next)).toBe("a\nb");
    expect(next.line).toBe(1);
    expect(next.index).toBe(0);
  });

  it("handles a payload with several newlines", () => {
    const next = applyEdit(docFromText("ab"), create("1\n2\n3", 0, 2));
    expect(docToText(next)).toBe("ab1\n2\n3");
    expect(next.line).toBe(2);
  });

  it("keeps the cursor inside the document", () => {
    const next = applyEdit(docFromText("ab"), create("X\nY", 0, 1));
    expect(next.index).toBeLessThanOrEqual(next.lines[next.line]?.length ?? 0);
  });
});

describe("ReplayClock · built-in time sources", () => {
  const timeline = buildTimeline([
    {
      action: "create",
      line: 0,
      index: 0,
      code: "a",
      timestamp: "1700000000000000000",
    },
    {
      action: "create",
      line: 0,
      index: 1,
      code: "b",
      timestamp: "1700000000050000000",
    },
  ]);

  /* The injected clock covers every behavioural test; these cover the fallback
     chain itself, since it is what actually runs in the browser. */
  it("falls back to setTimeout when requestAnimationFrame is unavailable", async () => {
    vi.stubGlobal("requestAnimationFrame", undefined);
    vi.useFakeTimers();

    const seen: number[] = [];
    const clock = new ReplayClock({
      timeline,
      onIndexChange: (index) => seen.push(index),
    });

    clock.play();
    await vi.advanceTimersByTimeAsync(200);
    clock.dispose();

    expect(seen).toContain(2);
  });

  it("uses requestAnimationFrame when it exists, and cancels on pause", () => {
    const cancel = vi.fn();
    vi.stubGlobal("requestAnimationFrame", vi.fn().mockReturnValue(7));
    vi.stubGlobal("cancelAnimationFrame", cancel);

    const clock = new ReplayClock({ timeline, onIndexChange: () => {} });
    clock.play();
    expect(requestAnimationFrame).toHaveBeenCalled();

    clock.pause();
    expect(cancel).toHaveBeenCalledWith(7);
  });

  it("falls back to Date.now when performance is unavailable", () => {
    vi.stubGlobal("performance", undefined);
    const clock = new ReplayClock({ timeline, onIndexChange: () => {} });
    expect(() => clock.play()).not.toThrow();
    clock.dispose();
  });
});
