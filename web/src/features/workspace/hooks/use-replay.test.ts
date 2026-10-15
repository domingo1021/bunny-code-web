import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { docToText, type DocState, type EditRecord } from "@/core/replay/types";
import { typeSource } from "@/mocks/seed/typeSource";
import { useReplay } from "./use-replay";

/**
 * The replay controller.
 *
 * The clock itself is tested exhaustively in `core/replay/clock.test.ts` with
 * an injected clock; this covers the React binding — that the view is derived
 * from the clock rather than mirrored, that the document matches the position,
 * and that the whole thing is disposed on unmount.
 */

const SOURCE = "const a = 1;\nconst b = 2;\nconsole.log(a + b);\n";
let records: readonly EditRecord[];

beforeEach(() => {
  vi.useFakeTimers();
  records = typeSource(SOURCE, { seed: 3 }).records;
});

afterEach(() => {
  vi.useRealTimers();
});

function setup(input?: {
  baseText?: string;
  records?: readonly EditRecord[];
  onDocChange?: (doc: DocState) => void;
}) {
  return renderHook(() =>
    useReplay({
      baseText: input?.baseText ?? "",
      records: input?.records ?? records,
      ...(input?.onDocChange === undefined
        ? {}
        : { onDocChange: input.onDocChange }),
    }),
  );
}

describe("useReplay", () => {
  /*
   * Opening a project shows the finished file: the file is what someone came
   * to look at, and the recording is how it got there. Pressing play rewinds.
   */
  it("starts parked at the end, showing the finished document", () => {
    const { result } = setup();

    expect(result.current.isAvailable).toBe(true);
    expect(result.current.total).toBe(records.length);
    expect(result.current.index).toBe(records.length);
    expect(docToText(result.current.doc)).toBe(SOURCE);
    expect(result.current.isPlaying).toBe(false);
    expect(result.current.hasStarted).toBe(false);
  });

  it("reports no recording when there is none", () => {
    const { result } = setup({ baseText: "already here", records: [] });

    expect(result.current.isAvailable).toBe(false);
    expect(result.current.total).toBe(0);
    expect(result.current.durationMs).toBe(0);
    expect(result.current.progress).toBe(0);
    // With nothing to replay, the base text is the document.
    expect(docToText(result.current.doc)).toBe("already here");
  });

  it("rewinds to the beginning when played from the end", () => {
    const { result } = setup();

    act(() => {
      result.current.toggle();
    });

    expect(result.current.isPlaying).toBe(true);
    expect(result.current.hasStarted).toBe(true);
    expect(result.current.elapsedMs).toBe(0);
    // Only the first record has been applied at t=0.
    expect(result.current.index).toBe(1);
    expect(docToText(result.current.doc).length).toBeLessThan(SOURCE.length);
  });

  it("advances the document as time passes", async () => {
    const { result } = setup();

    act(() => {
      result.current.toggle();
    });

    const startIndex = result.current.index;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });

    expect(result.current.index).toBeGreaterThan(startIndex);
    expect(result.current.elapsedMs).toBeGreaterThan(0);
  });

  it("pauses, and stops advancing", async () => {
    const { result } = setup();

    act(() => {
      result.current.toggle();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    act(() => {
      result.current.toggle();
    });

    const frozen = result.current.index;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });

    expect(result.current.isPlaying).toBe(false);
    expect(result.current.index).toBe(frozen);
  });

  /* Seeking is the capability the original lacked entirely. */
  it("seeks to a fraction, in both directions", () => {
    const { result } = setup();

    act(() => {
      result.current.seekProgress(0);
    });
    const atStart = docToText(result.current.doc).length;

    act(() => {
      result.current.seekProgress(1);
    });
    expect(docToText(result.current.doc)).toBe(SOURCE);

    act(() => {
      result.current.seekProgress(0.5);
    });
    const atMiddle = docToText(result.current.doc).length;

    expect(atStart).toBeLessThan(atMiddle);
    expect(atMiddle).toBeLessThan(SOURCE.length);
  });

  it("clamps a seek outside the recording", () => {
    const { result } = setup();

    act(() => {
      result.current.seekProgress(-5);
    });
    expect(result.current.elapsedMs).toBe(0);

    act(() => {
      result.current.seekProgress(5);
    });
    expect(result.current.elapsedMs).toBe(result.current.durationMs);
  });

  it("changes speed within the preset range", () => {
    const { result } = setup();

    expect(result.current.speed).toBe(1);
    act(() => {
      result.current.speedUp();
    });
    expect(result.current.speed).toBe(1.25);

    act(() => {
      result.current.slowDown();
      result.current.slowDown();
    });
    expect(result.current.speed).toBe(0.75);
  });

  it("stops at the ends of the speed range", () => {
    const { result } = setup();

    act(() => {
      for (let i = 0; i < 10; i += 1) result.current.speedUp();
    });
    expect(result.current.speed).toBe(2);
    expect(result.current.canSpeedUp).toBe(false);
    expect(result.current.canSlowDown).toBe(true);

    act(() => {
      for (let i = 0; i < 10; i += 1) result.current.slowDown();
    });
    expect(result.current.speed).toBe(0.25);
    expect(result.current.canSlowDown).toBe(false);
  });

  it("reports finished only after playing to the end", async () => {
    const { result } = setup();

    // Parked at the end on arrival, but nothing has been played yet.
    expect(result.current.isFinished).toBe(false);

    act(() => {
      result.current.toggle();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(result.current.durationMs + 2_000);
    });

    expect(result.current.isFinished).toBe(true);
    expect(result.current.isPlaying).toBe(false);
  });

  it("publishes the document to the editor as it changes", () => {
    const onDocChange = vi.fn();
    const { result } = setup({ onDocChange });

    // Once for the initial (finished) document.
    expect(onDocChange).toHaveBeenCalled();
    onDocChange.mockClear();

    act(() => {
      result.current.seekProgress(0.25);
    });

    expect(onDocChange).toHaveBeenCalled();
    const published = onDocChange.mock.calls.at(-1)?.[0] as DocState;
    expect(docToText(published)).toBe(docToText(result.current.doc));
  });

  it("resets when the recording is replaced", async () => {
    const { result, rerender } = renderHook(
      ({ recs }: { recs: readonly EditRecord[] }) =>
        useReplay({ baseText: "", records: recs }),
      { initialProps: { recs: records } },
    );

    act(() => {
      result.current.toggle();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(result.current.hasStarted).toBe(true);

    // A rerender is synchronous; `waitFor` would poll on real timers and never
    // progress while they are faked.
    const other = typeSource("let x = 1;\n", { seed: 9 }).records;
    rerender({ recs: other });

    expect(result.current.total).toBe(other.length);
    expect(result.current.hasStarted).toBe(false);
    expect(result.current.isPlaying).toBe(false);
    expect(result.current.index).toBe(other.length);
  });

  /*
   * The leak the original shipped: its teardown set the flag on the ref object
   * rather than `.value`, so timers kept firing at an unmounted editor.
   */
  it("stops publishing once unmounted", async () => {
    const onDocChange = vi.fn();
    const { result, unmount } = setup({ onDocChange });

    act(() => {
      result.current.toggle();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    unmount();
    onDocChange.mockClear();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(onDocChange).not.toHaveBeenCalled();
  });
});
