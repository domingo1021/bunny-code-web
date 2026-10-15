"use client";

import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { applyEdits } from "@/core/replay/applyEdit";
import {
  DEFAULT_SPEED_INDEX,
  PLAYBACK_SPEEDS,
  ReplayClock,
} from "@/core/replay/clock";
import { buildTimeline, EMPTY_TIMELINE } from "@/core/replay/timeline";
import {
  docFromText,
  type DocState,
  type EditRecord,
} from "@/core/replay/types";

/**
 * Drives replay of a recording.
 *
 * React's view is *derived* from the clock through `useSyncExternalStore`
 * rather than mirrored into `useState`. Mirroring would mean copying every
 * tick, seek and speed change by hand — and letting the copy disagree with the
 * clock, which is a whole class of bug this avoids by not having two sources of
 * truth.
 *
 * The document is a pure function of (base text, log, index), so scrubbing
 * backwards costs exactly what scrubbing forwards does. The original could only
 * move forwards, because its position *was* a `for` loop counter.
 */

export interface ReplayController {
  readonly isPlaying: boolean;
  readonly index: number;
  readonly total: number;
  readonly elapsedMs: number;
  readonly durationMs: number;
  readonly progress: number;
  readonly speed: number;
  readonly canSpeedUp: boolean;
  readonly canSlowDown: boolean;
  /** True when there is a recording to play. */
  readonly isAvailable: boolean;
  readonly isFinished: boolean;
  /**
   * False until the reader first presses play or scrubs. Replay opens parked
   * at the end showing the finished file, which would otherwise be reported as
   * "finished" before anyone had played anything.
   */
  readonly hasStarted: boolean;
  toggle: () => void;
  speedUp: () => void;
  slowDown: () => void;
  seekProgress: (progress: number) => void;
  /** The document as of the current position. */
  readonly doc: DocState;
}

export function useReplay(input: {
  baseText: string;
  records: readonly EditRecord[];
  /** Called whenever the replayed document changes, to drive the editor. */
  onDocChange?: (doc: DocState) => void;
}): ReplayController {
  const { baseText, records, onDocChange } = input;
  const [speedIndex, setSpeedIndex] = useState(DEFAULT_SPEED_INDEX);
  /*
   * Which clock the reader has started. Storing the clock rather than a
   * boolean makes the reset derived: a new recording means a new clock, so
   * `hasStarted` becomes false without an effect that resets it (which would
   * cascade renders).
   */
  const [startedClock, setStartedClock] = useState<ReplayClock | null>(null);

  const timeline = useMemo(
    () => (records.length === 0 ? EMPTY_TIMELINE : buildTimeline(records)),
    [records],
  );

  /*
   * One clock per recording, created during render rather than in an effect so
   * the very first paint already has the right position. `useMemo` is the
   * right tool because the clock is derived from the timeline; the effect
   * below exists purely to dispose it.
   *
   * It starts at the *end*, so opening a project shows the finished file
   * rather than a nearly blank one — the file is what someone came to look at,
   * and the recording is how it got there. Pressing play rewinds first
   * (`ReplayClock.play` does this when it is already at the end), which is the
   * behaviour the original had.
   */
  const clock = useMemo(() => {
    const created = new ReplayClock({ timeline });
    created.seek(timeline.durationMs);
    return created;
  }, [timeline]);

  useEffect(() => {
    // Cleanup runs on unmount and before every re-run, so a running clock can
    // never outlive the component — the leak the original shipped.
    return () => {
      clock.dispose();
    };
  }, [clock]);

  // Re-apply the chosen speed when the recording changes, so switching
  // versions does not silently reset playback to 1x.
  useEffect(() => {
    clock.setSpeed(PLAYBACK_SPEEDS[speedIndex] ?? 1);
  }, [clock, speedIndex]);

  const state = useSyncExternalStore(
    clock.subscribe,
    clock.getSnapshot,
    clock.getSnapshot,
  );

  const doc = useMemo(() => {
    const base = docFromText(baseText);
    if (records.length === 0) return base;
    return applyEdits(base, records.slice(0, state.index));
  }, [baseText, records, state.index]);

  /*
   * Push the replayed document into the editor.
   *
   * `useEffectEvent` rather than a dependency: the effect must re-run when the
   * document changes but not when the caller passes a new function identity,
   * and callers pass an inline callback that changes on every parent render.
   */
  const publishDoc = useEffectEvent((next: DocState) => {
    onDocChange?.(next);
  });

  useEffect(() => {
    publishDoc(doc);
  }, [doc]);

  const toggle = useCallback(() => {
    setStartedClock(clock);
    clock.toggle();
  }, [clock]);

  const seekProgress = useCallback(
    (progress: number) => {
      setStartedClock(clock);
      clock.seekProgress(progress);
    },
    [clock],
  );

  const hasStarted = startedClock === clock;

  const speedUp = useCallback(() => {
    setSpeedIndex((current) =>
      Math.min(current + 1, PLAYBACK_SPEEDS.length - 1),
    );
  }, []);

  const slowDown = useCallback(() => {
    setSpeedIndex((current) => Math.max(current - 1, 0));
  }, []);

  return {
    isPlaying: state.playing,
    index: state.index,
    total: records.length,
    elapsedMs: state.elapsedMs,
    durationMs: state.durationMs,
    progress: state.progress,
    speed: state.speed,
    canSpeedUp: speedIndex < PLAYBACK_SPEEDS.length - 1,
    canSlowDown: speedIndex > 0,
    isAvailable: records.length > 0,
    isFinished:
      hasStarted && state.durationMs > 0 && state.elapsedMs >= state.durationMs,
    hasStarted,
    toggle,
    speedUp,
    slowDown,
    seekProgress,
    doc,
  };
}
