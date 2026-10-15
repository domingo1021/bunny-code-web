import { indexAtTime, type Timeline } from "./timeline";

/**
 * Drives replay along a {@link Timeline}.
 *
 * The original scheduler was a `for` loop wrapped around a `Promise`-wrapped
 * `setTimeout`, gated on a reactive `keepPlay` flag. That shape has three
 * problems this class exists to fix:
 *
 * - **It leaked.** Teardown set `keepPlay = false` on the ref *object* instead
 *   of `keepPlay.value`, so the flag never became false and the pending timers
 *   kept firing against an unmounted editor.
 * - **It could not seek.** Position lived in a loop counter, so there was
 *   nowhere to seek *to*; changing speed mid-playback only took effect on the
 *   next tick because the delay was already baked into a scheduled timeout.
 * - **It was untestable.** Real wall-clock timing meant a test of replay was a
 *   test of `setTimeout`.
 *
 * Here, position is derived state: elapsed virtual time is the single source of
 * truth, and the applied-record count is always `indexAtTime(timeline,
 * elapsed)`. Time and scheduling are injected, so tests drive playback frame by
 * frame with no timers at all.
 */
export interface ReplayClockOptions {
  readonly timeline: Timeline;
  /**
   * Called whenever the number of records that should be applied changes.
   * Receives the new count, in `0 .. records.length`. Optional: a React
   * consumer subscribes with {@link ReplayClock.subscribe} instead.
   */
  readonly onIndexChange?: (index: number) => void;
  /** Called once when playback reaches the end. */
  readonly onEnd?: () => void;
  /** Milliseconds source. Defaults to `performance.now`/`Date.now`. */
  readonly now?: () => number;
  /**
   * Schedules a callback for the next frame and returns a cancel function.
   * Defaults to `requestAnimationFrame`, falling back to a timeout.
   */
  readonly schedule?: (callback: () => void) => () => void;
}

export interface ReplayState {
  readonly playing: boolean;
  readonly elapsedMs: number;
  readonly durationMs: number;
  readonly index: number;
  readonly speed: number;
  /** `0 .. 1`; `0` when the recording has no duration. */
  readonly progress: number;
}

/** The speed multipliers the player offers, matching the original's controls. */
export const PLAYBACK_SPEEDS: readonly number[] = [
  0.25, 0.5, 0.75, 1, 1.25, 1.5, 2,
] as const;

export const DEFAULT_SPEED_INDEX = 3;

export class ReplayClock {
  #timeline: Timeline;
  #onIndexChange: ((index: number) => void) | undefined;
  #onEnd: (() => void) | undefined;
  #now: () => number;
  #schedule: (callback: () => void) => () => void;

  #playing = false;
  #speed = 1;
  /** Virtual elapsed time; the only piece of real state. */
  #elapsedMs = 0;
  /**
   * Applied-record count. Always equal to `indexAtTime(timeline, elapsedMs)` —
   * it is cached rather than computed so `onIndexChange` can fire only on an
   * actual change. The first record has offset 0, so a recording sits at index
   * 1 from the start, the same way a paused video still shows frame 0.
   */
  #index: number;
  /** Wall-clock reading at the last frame, used to advance virtual time. */
  #lastTick = 0;
  #cancel: (() => void) | null = null;
  #disposed = false;

  /**
   * Store plumbing, so React can bind to the clock with
   * `useSyncExternalStore` instead of mirroring its state into `useState`.
   * Mirroring meant every tick, seek and speed change had to be copied by
   * hand, and the copies could disagree with the clock.
   *
   * The snapshot is cached and only rebuilt when something actually changes,
   * because `useSyncExternalStore` compares snapshots by identity and would
   * loop forever on a fresh object each call.
   */
  #listeners = new Set<() => void>();
  #snapshot: ReplayState | null = null;

  constructor(options: ReplayClockOptions) {
    this.#timeline = options.timeline;
    this.#onIndexChange = options.onIndexChange;
    this.#onEnd = options.onEnd;
    this.#now = options.now ?? defaultNow;
    this.#schedule = options.schedule ?? defaultSchedule;
    this.#index = indexAtTime(this.#timeline, 0);
  }

  get state(): ReplayState {
    if (this.#snapshot === null) {
      const { durationMs } = this.#timeline;
      this.#snapshot = {
        playing: this.#playing,
        elapsedMs: this.#elapsedMs,
        durationMs,
        index: this.#index,
        speed: this.#speed,
        progress: durationMs > 0 ? this.#elapsedMs / durationMs : 0,
      };
    }
    return this.#snapshot;
  }

  /** Subscribe to state changes. Returns an unsubscribe function. */
  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  /** Current state, stable by identity until something changes. */
  getSnapshot = (): ReplayState => this.state;

  /** Invalidate the cached snapshot and notify subscribers. */
  #changed(): void {
    this.#snapshot = null;
    for (const listener of [...this.#listeners]) listener();
  }

  get playing(): boolean {
    return this.#playing;
  }

  /**
   * Replace the timeline, for instance when a recording finishes loading.
   * Resets playback, since offsets from the previous recording are meaningless.
   */
  setTimeline(timeline: Timeline): void {
    this.#timeline = timeline;
    this.pause();
    this.seek(0);
    // The duration changed even if the position did not, so the snapshot is
    // stale regardless of what `pause`/`seek` reported.
    this.#changed();
  }

  setSpeed(speed: number): void {
    if (!Number.isFinite(speed) || speed <= 0) return;
    if (speed === this.#speed) return;
    // Settle virtual time at the old rate first, so the change applies from
    // *now* rather than retroactively to the whole frame.
    if (this.#playing) this.#accrue();
    this.#speed = speed;
    this.#changed();
  }

  play(): void {
    if (this.#disposed || this.#playing) return;
    // Starting from the end rewinds, so the play button is never a dead end.
    if (this.#elapsedMs >= this.#timeline.durationMs) this.seek(0);
    this.#playing = true;
    this.#lastTick = this.#now();
    this.#changed();
    this.#queue();
  }

  pause(): void {
    if (!this.#playing) return;
    this.#accrue();
    this.#playing = false;
    this.#clearScheduled();
    this.#changed();
  }

  toggle(): void {
    if (this.#playing) {
      this.pause();
    } else {
      this.play();
    }
  }

  /** Jump to a point in time, clamped to the recording, playing or paused. */
  seek(elapsedMs: number): void {
    const clamped = Math.min(
      Math.max(Number.isFinite(elapsedMs) ? elapsedMs : 0, 0),
      this.#timeline.durationMs,
    );
    const moved = clamped !== this.#elapsedMs;
    this.#elapsedMs = clamped;
    this.#lastTick = this.#now();
    this.#emitIndex();
    if (moved) this.#changed();
  }

  /** Jump to a fraction of the recording, `0 .. 1`. */
  seekProgress(progress: number): void {
    this.seek(progress * this.#timeline.durationMs);
  }

  /** Stop playback and release the scheduled frame. Safe to call twice. */
  dispose(): void {
    this.#disposed = true;
    const wasPlaying = this.#playing;
    this.#playing = false;
    this.#clearScheduled();
    if (wasPlaying) this.#changed();
  }

  #queue(): void {
    if (!this.#playing || this.#disposed) return;
    this.#cancel = this.#schedule(() => {
      this.#cancel = null;
      this.#tick();
    });
  }

  #tick(): void {
    if (!this.#playing || this.#disposed) return;

    this.#accrue();
    this.#emitIndex();

    if (this.#elapsedMs >= this.#timeline.durationMs) {
      this.#playing = false;
      this.#clearScheduled();
      this.#changed();
      this.#onEnd?.();
      return;
    }

    this.#queue();
  }

  /** Move virtual time forward by the wall-clock time since the last reading. */
  #accrue(): void {
    const now = this.#now();
    const delta = Math.max(now - this.#lastTick, 0);
    this.#lastTick = now;
    const next = Math.min(
      this.#elapsedMs + delta * this.#speed,
      this.#timeline.durationMs,
    );
    if (next === this.#elapsedMs) return;
    this.#elapsedMs = next;
    this.#changed();
  }

  #emitIndex(): void {
    const next = indexAtTime(this.#timeline, this.#elapsedMs);
    if (next === this.#index) return;
    this.#index = next;
    this.#changed();
    this.#onIndexChange?.(next);
  }

  #clearScheduled(): void {
    this.#cancel?.();
    this.#cancel = null;
  }
}

function defaultNow(): number {
  return typeof performance !== "undefined" &&
    typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function defaultSchedule(callback: () => void): () => void {
  if (typeof requestAnimationFrame === "function") {
    const handle = requestAnimationFrame(() => callback());
    return () => cancelAnimationFrame(handle);
  }
  const handle = setTimeout(callback, 16);
  return () => clearTimeout(handle);
}
