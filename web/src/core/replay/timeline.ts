import { type EditRecord } from "./types";

/**
 * Turns a recording's timestamps into playable time.
 *
 * Two things were wrong with how the original did this:
 *
 * 1. Timestamps are nanosecond epoch strings (the backend wrote them to
 *    InfluxDB as `Date.now() + "000000"`). The Vue code parsed them with
 *    `new Date(nanosecondString).getTime()`, which is not a date format — it
 *    evaluates to `NaN`. Every gap it computed was therefore `NaN`, so
 *    `setTimeout(fn, NaN)` behaved as `setTimeout(fn, 0)` and replay ran flat
 *    out instead of at the speed the session was typed.
 *
 * 2. It stored only the gap between consecutive records, which is enough to
 *    play forwards and nothing else. Storing cumulative offsets means replay
 *    can seek, scrub and report progress.
 */
export interface Timeline {
  /** Milliseconds from the start of the recording to record `i`. Non-decreasing. */
  readonly offsets: readonly number[];
  /** Total playable length in milliseconds. */
  readonly durationMs: number;
}

export interface TimelineOptions {
  /**
   * Longest pause to preserve between two actions, in milliseconds.
   *
   * Recordings contain real human pauses — coffee breaks, context switches —
   * and replaying a 4-minute gap verbatim looks like the player has frozen.
   * Gaps longer than this are compressed to it. Pass `Infinity` for verbatim
   * timing.
   */
  readonly maxGapMs?: number;
}

export const DEFAULT_MAX_GAP_MS = 3_000;

export const EMPTY_TIMELINE: Timeline = { offsets: [], durationMs: 0 };

/** Build a seekable timeline from a recording. */
export function buildTimeline(
  records: readonly EditRecord[],
  options: TimelineOptions = {},
): Timeline {
  const maxGapMs = options.maxGapMs ?? DEFAULT_MAX_GAP_MS;
  if (records.length === 0) return EMPTY_TIMELINE;

  const offsets: number[] = [0];
  let elapsed = 0;
  let previous = parseNanosToMs(records[0]?.timestamp);

  for (let i = 1; i < records.length; i += 1) {
    const current = parseNanosToMs(records[i]?.timestamp);

    // An unparseable or out-of-order timestamp contributes no time rather than
    // a negative or NaN gap, keeping `offsets` non-decreasing and finite.
    const gap =
      previous === null || current === null || current < previous
        ? 0
        : Math.min(current - previous, maxGapMs);

    elapsed += gap;
    offsets.push(elapsed);

    // The reference point only ever moves forward. Letting a single rogue
    // out-of-order timestamp drag it backwards would make the *next* gap
    // enormous, injecting a fake pause into the rest of the recording.
    if (current !== null && (previous === null || current > previous)) {
      previous = current;
    }
  }

  return { offsets, durationMs: elapsed };
}

/**
 * How many records should have been applied by `elapsedMs`.
 *
 * Returns a count in `0 .. offsets.length`, found by binary search so that
 * seeking into a long recording does not walk it.
 */
export function indexAtTime(timeline: Timeline, elapsedMs: number): number {
  const { offsets } = timeline;
  if (offsets.length === 0) return 0;
  if (elapsedMs < 0) return 0;

  let low = 0;
  let high = offsets.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if ((offsets[mid] ?? 0) <= elapsedMs) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low;
}

/** The time at which record `index` plays, clamped into the timeline. */
export function timeAtIndex(timeline: Timeline, index: number): number {
  if (timeline.offsets.length === 0) return 0;
  if (index <= 0) return 0;
  if (index >= timeline.offsets.length) return timeline.durationMs;
  return timeline.offsets[index] ?? 0;
}

/**
 * Parse a nanosecond epoch string to whole milliseconds, or `null` if it is
 * not a non-negative integer string.
 *
 * Nanoseconds is the one format recordings are written in, so the unit is not
 * inferred from the magnitude: guessing would silently reinterpret data, and a
 * wrong guess is far worse than a rejected timestamp. `BigInt` does the divide
 * so the arithmetic is exact rather than merely close enough.
 */
export function parseNanosToMs(value: string | undefined): number | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;

  return Number(BigInt(trimmed) / 1_000_000n);
}

/** The timestamp format recordings are written in: nanoseconds since the epoch. */
export function nowAsNanos(now: number = Date.now()): string {
  return `${BigInt(Math.trunc(now)) * 1_000_000n}`;
}
