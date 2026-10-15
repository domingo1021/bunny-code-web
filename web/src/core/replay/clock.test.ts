import { beforeEach, describe, expect, it, vi } from "vitest";
import { PLAYBACK_SPEEDS, ReplayClock } from "./clock";
import { buildTimeline, type Timeline } from "./timeline";
import { type EditRecord } from "./types";

/**
 * A hand-cranked clock and scheduler.
 *
 * Replay timing is pure arithmetic over injected time, so these tests advance
 * time explicitly and never wait. The original's scheduler could not be tested
 * at all: position lived in a `for` loop counter and the delay came from a real
 * `setTimeout`, so any test of replay was really a test of the event loop.
 */
function harness(timeline: Timeline) {
  let now = 0;
  const pending: (() => void)[] = [];
  const indices: number[] = [];
  const onEnd = vi.fn();

  const clock = new ReplayClock({
    timeline,
    now: () => now,
    schedule: (callback) => {
      pending.push(callback);
      return () => {
        const i = pending.indexOf(callback);
        if (i >= 0) pending.splice(i, 1);
      };
    },
    onIndexChange: (index) => indices.push(index),
    onEnd,
  });

  /** Advance wall-clock time by `ms` and run one scheduled frame. */
  function frame(ms: number) {
    now += ms;
    const next = pending.shift();
    next?.();
  }

  return {
    clock,
    indices,
    onEnd,
    frame,
    pendingCount: () => pending.length,
    advanceTime: (ms: number) => {
      now += ms;
    },
  };
}

function recordsEvery(count: number, stepMs: number): EditRecord[] {
  const base = 1_700_000_000_000;
  return Array.from({ length: count }, (_, i) => ({
    action: "create" as const,
    line: 0,
    index: i,
    code: "x",
    timestamp: `${BigInt(base + i * stepMs) * 1_000_000n}`,
  }));
}

/** Four records 100ms apart: offsets [0, 100, 200, 300], duration 300. */
let timeline: Timeline;

beforeEach(() => {
  timeline = buildTimeline(recordsEvery(4, 100));
});

describe("ReplayClock · initial state", () => {
  /* The first record has offset 0, so a fresh clock already counts it as
     applied — the same way a paused video still shows its first frame. */
  it("starts paused at the first record", () => {
    const { clock } = harness(timeline);
    expect(clock.state).toMatchObject({
      playing: false,
      elapsedMs: 0,
      index: 1,
      durationMs: 300,
      progress: 0,
    });
  });

  it("reports an index of 0 only when there is nothing to play", () => {
    const { clock } = harness(buildTimeline([]));
    expect(clock.state.index).toBe(0);
  });

  it("reports zero progress for a recording with no duration", () => {
    const { clock } = harness(buildTimeline([]));
    expect(clock.state.progress).toBe(0);
    expect(clock.state.durationMs).toBe(0);
  });
});

describe("ReplayClock · playback", () => {
  it("advances the applied-record count as time passes", () => {
    const { clock, indices, frame } = harness(timeline);
    clock.play();

    frame(100);
    expect(clock.state.index).toBe(2);

    frame(100);
    expect(clock.state.index).toBe(3);

    frame(100);
    expect(clock.state.index).toBe(4);
    expect(indices).toEqual([2, 3, 4]);
  });

  it("stops at the end and reports it once", () => {
    const { clock, onEnd, frame } = harness(timeline);
    clock.play();
    frame(300);

    expect(clock.playing).toBe(false);
    expect(clock.state.elapsedMs).toBe(300);
    expect(clock.state.progress).toBe(1);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("never reports an index beyond the record count", () => {
    const { clock, indices, frame } = harness(timeline);
    clock.play();
    frame(10_000);
    expect(Math.max(...indices)).toBe(4);
  });

  it("only emits when the count actually changes", () => {
    const { clock, indices, frame } = harness(timeline);
    clock.play();
    // Four frames well inside the first gap: the count stays at its initial 1,
    // so there is nothing to report.
    frame(10);
    frame(10);
    frame(10);
    frame(10);
    expect(indices).toEqual([]);
    expect(clock.state.index).toBe(1);
  });

  it("ignores a second play() while already playing", () => {
    const h = harness(timeline);
    h.clock.play();
    h.clock.play();
    expect(h.pendingCount()).toBe(1);
  });
});

describe("ReplayClock · pause", () => {
  it("freezes elapsed time", () => {
    const { clock, frame, advanceTime } = harness(timeline);
    clock.play();
    frame(150);
    clock.pause();

    const frozen = clock.state.elapsedMs;
    advanceTime(5_000);
    expect(clock.state.elapsedMs).toBe(frozen);
    expect(clock.playing).toBe(false);
  });

  it("resumes from where it stopped rather than from the wall clock", () => {
    const { clock, frame, advanceTime } = harness(timeline);
    clock.play();
    frame(100);
    clock.pause();
    expect(clock.state.elapsedMs).toBe(100);

    // Time passes while paused; it must not count towards the recording.
    advanceTime(10_000);
    clock.play();
    frame(100);
    expect(clock.state.elapsedMs).toBe(200);
  });

  it("releases the scheduled frame, so nothing fires after teardown", () => {
    const h = harness(timeline);
    h.clock.play();
    expect(h.pendingCount()).toBe(1);
    h.clock.pause();
    expect(h.pendingCount()).toBe(0);
  });

  it("toggles", () => {
    const { clock, frame } = harness(timeline);
    clock.toggle();
    expect(clock.playing).toBe(true);
    frame(50);
    clock.toggle();
    expect(clock.playing).toBe(false);
  });

  it("rewinds when played from the end, so the button is never a dead end", () => {
    const { clock, frame } = harness(timeline);
    clock.play();
    frame(300);
    expect(clock.state.elapsedMs).toBe(300);

    clock.play();
    expect(clock.state.elapsedMs).toBe(0);
    expect(clock.playing).toBe(true);
  });
});

describe("ReplayClock · seek", () => {
  /* Seeking is new: the original kept its position in a loop counter, so there
     was nowhere to seek to and no way to scrub a recording. */
  it("jumps to a point in time while paused", () => {
    const { clock, indices } = harness(timeline);
    clock.seek(200);
    expect(clock.state.elapsedMs).toBe(200);
    expect(clock.state.index).toBe(3);
    expect(indices).toEqual([3]);
  });

  it("seeks backwards", () => {
    const { clock } = harness(timeline);
    clock.seek(300);
    clock.seek(50);
    expect(clock.state.index).toBe(1);
  });

  it("clamps out-of-range and non-finite targets", () => {
    const { clock } = harness(timeline);
    clock.seek(-100);
    expect(clock.state.elapsedMs).toBe(0);
    clock.seek(99_999);
    expect(clock.state.elapsedMs).toBe(300);
    clock.seek(Number.NaN);
    expect(clock.state.elapsedMs).toBe(0);
  });

  it("seeks by fraction", () => {
    const { clock } = harness(timeline);
    clock.seekProgress(0.5);
    expect(clock.state.elapsedMs).toBe(150);
    expect(clock.state.progress).toBeCloseTo(0.5);
  });

  it("continues from the new position when seeking mid-playback", () => {
    const { clock, frame } = harness(timeline);
    clock.play();
    frame(50);
    clock.seek(200);
    frame(50);
    expect(clock.state.elapsedMs).toBe(250);
    expect(clock.playing).toBe(true);
  });
});

describe("ReplayClock · speed", () => {
  it("scales elapsed time", () => {
    const { clock, frame } = harness(timeline);
    clock.setSpeed(2);
    clock.play();
    frame(100);
    expect(clock.state.elapsedMs).toBe(200);
  });

  it("slows down", () => {
    const { clock, frame } = harness(timeline);
    clock.setSpeed(0.25);
    clock.play();
    frame(100);
    expect(clock.state.elapsedMs).toBe(25);
  });

  /*
   * Changing speed mid-playback must apply from that moment, not retroactively
   * to the frame already in flight. The original baked the delay into a
   * scheduled timeout, so a speed change was ignored until the next record.
   */
  it("applies a mid-playback change from that moment onward", () => {
    const { clock, frame } = harness(timeline);
    clock.play();
    frame(100);
    expect(clock.state.elapsedMs).toBe(100);

    clock.setSpeed(2);
    frame(50);
    expect(clock.state.elapsedMs).toBe(200);
  });

  it.each(PLAYBACK_SPEEDS)("supports the %fx preset", (speed) => {
    const { clock, frame } = harness(timeline);
    clock.setSpeed(speed);
    clock.play();
    frame(100);
    expect(clock.state.elapsedMs).toBeCloseTo(Math.min(100 * speed, 300));
    expect(clock.state.speed).toBe(speed);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects the invalid speed %f",
    (speed) => {
      const { clock } = harness(timeline);
      clock.setSpeed(speed);
      expect(clock.state.speed).toBe(1);
    },
  );
});

describe("ReplayClock · lifecycle", () => {
  /*
   * The leak this replaces: the Vue component's teardown assigned to the ref
   * object (`keepPlay = false`) instead of `keepPlay.value`, so the loop never
   * saw the flag change and kept firing timers against a destroyed editor.
   */
  it("stops scheduling and emitting once disposed", () => {
    const h = harness(timeline);
    h.clock.play();
    h.clock.dispose();

    expect(h.pendingCount()).toBe(0);
    expect(h.clock.playing).toBe(false);

    const emitted = h.indices.length;
    h.frame(1_000);
    h.clock.play();
    h.frame(1_000);
    expect(h.indices.length).toBe(emitted);
  });

  it("is safe to dispose twice", () => {
    const { clock } = harness(timeline);
    clock.dispose();
    expect(() => clock.dispose()).not.toThrow();
  });

  it("is safe to pause when never played", () => {
    const { clock, indices } = harness(timeline);
    expect(() => clock.pause()).not.toThrow();
    expect(indices).toEqual([]);
  });

  it("resets playback when the recording is replaced", () => {
    const { clock, frame } = harness(timeline);
    clock.play();
    frame(200);

    clock.setTimeline(buildTimeline(recordsEvery(3, 500)));
    expect(clock.state).toMatchObject({
      playing: false,
      elapsedMs: 0,
      index: 1,
      durationMs: 1_000,
    });
  });
});

describe("ReplayClock · store interface", () => {
  /*
   * `useSyncExternalStore` compares snapshots by identity, so a getter that
   * built a fresh object on every call would re-render forever. The snapshot
   * must be stable until something actually changes.
   */
  it("returns the same snapshot object until state changes", () => {
    const { clock, frame } = harness(timeline);

    const first = clock.getSnapshot();
    expect(clock.getSnapshot()).toBe(first);

    clock.play();
    const afterPlay = clock.getSnapshot();
    expect(afterPlay).not.toBe(first);
    expect(afterPlay.playing).toBe(true);

    frame(100);
    expect(clock.getSnapshot()).not.toBe(afterPlay);
  });

  it("notifies subscribers on play, tick, pause, seek and speed", () => {
    const { clock, frame } = harness(timeline);
    const listener = vi.fn();
    clock.subscribe(listener);

    clock.play();
    expect(listener).toHaveBeenCalledTimes(1);

    frame(100);
    expect(listener.mock.calls.length).toBeGreaterThan(1);

    const beforePause = listener.mock.calls.length;
    clock.pause();
    expect(listener.mock.calls.length).toBeGreaterThan(beforePause);

    const beforeSeek = listener.mock.calls.length;
    clock.seek(250);
    expect(listener.mock.calls.length).toBeGreaterThan(beforeSeek);

    const beforeSpeed = listener.mock.calls.length;
    clock.setSpeed(2);
    expect(listener.mock.calls.length).toBeGreaterThan(beforeSpeed);
  });

  it("does not notify when a mutation changes nothing", () => {
    const { clock } = harness(timeline);
    const listener = vi.fn();
    clock.subscribe(listener);

    clock.seek(0); // already at 0
    clock.setSpeed(1); // already 1x
    clock.pause(); // not playing

    expect(listener).not.toHaveBeenCalled();
  });

  it("stops notifying once unsubscribed", () => {
    const { clock } = harness(timeline);
    const listener = vi.fn();
    const unsubscribe = clock.subscribe(listener);

    unsubscribe();
    clock.play();

    expect(listener).not.toHaveBeenCalled();
  });

  it("notifies when the recording is replaced, because the duration changed", () => {
    const { clock } = harness(timeline);
    const listener = vi.fn();
    clock.subscribe(listener);

    clock.setTimeline(buildTimeline(recordsEvery(2, 400)));

    expect(listener).toHaveBeenCalled();
    expect(clock.getSnapshot().durationMs).toBe(400);
  });

  it("still calls onIndexChange when one was provided", () => {
    const { clock, indices, frame } = harness(timeline);
    clock.play();
    frame(100);
    expect(indices).toEqual([2]);
  });

  it("works with no onIndexChange at all", () => {
    const clock = new ReplayClock({ timeline });
    expect(() => {
      clock.play();
      clock.seek(200);
      clock.dispose();
    }).not.toThrow();
  });
});
