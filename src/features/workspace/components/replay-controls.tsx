"use client";

import * as Slider from "@radix-ui/react-slider";
import { FastForward, Pause, Play, Rewind } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDuration, formatSpeed } from "@/lib/format";
import { type ReplayController } from "../hooks/use-replay";

/**
 * Playback controls for a recording.
 *
 * The scrubber is new. The original could only play forwards from wherever it
 * had got to, because its position was a `for` loop counter — there was no
 * value to seek *to*. Here position is elapsed time, so the slider is just a
 * two-way view of it.
 *
 * It is a real slider: arrow keys, Home/End and Page Up/Down all work, and the
 * value is announced as a timestamp rather than a raw millisecond count. The
 * original's controls were `<button>`s that were duplicated in the template —
 * once enabled and once disabled — and swapped with `v-if`, so the same control
 * appeared twice in the accessibility tree.
 */
export function ReplayControls({
  replay,
  className,
}: {
  replay: ReplayController;
  className?: string;
}) {
  const disabled = !replay.isAvailable;

  return (
    <div className={className} role="group" aria-label="Replay controls">
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="icon"
          onClick={replay.slowDown}
          disabled={disabled || !replay.canSlowDown}
          aria-label="Slow down"
        >
          <Rewind aria-hidden="true" />
        </Button>

        <Button
          variant="primary"
          size="icon"
          onClick={replay.toggle}
          disabled={disabled}
          aria-label={replay.isPlaying ? "Pause replay" : "Play replay"}
        >
          {replay.isPlaying ? (
            <Pause aria-hidden="true" />
          ) : (
            <Play aria-hidden="true" />
          )}
        </Button>

        <Button
          variant="secondary"
          size="icon"
          onClick={replay.speedUp}
          disabled={disabled || !replay.canSpeedUp}
          aria-label="Speed up"
        >
          <FastForward aria-hidden="true" />
        </Button>

        <span
          className="text-ink-muted w-12 shrink-0 text-center font-mono text-xs"
          // The speed changes without the user acting on this element, so it
          // has to announce itself.
          aria-live="polite"
        >
          {formatSpeed(replay.speed)}
        </span>

        <Slider.Root
          className="relative flex h-5 min-w-0 flex-1 touch-none items-center select-none"
          value={[disabled ? 0 : Math.round(replay.progress * 1000)]}
          max={1000}
          step={5}
          disabled={disabled}
          onValueChange={([next]) => {
            replay.seekProgress((next ?? 0) / 1000);
          }}
          aria-label="Replay position"
        >
          <Slider.Track className="bg-surface-overlay relative h-1 grow rounded-full">
            <Slider.Range className="bg-brand absolute h-full rounded-full" />
          </Slider.Track>
          <Slider.Thumb
            className="border-brand bg-canvas focus-visible:outline-brand block size-4 rounded-full border-2 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
            aria-label="Replay position"
            aria-valuetext={`${formatDuration(replay.elapsedMs)} of ${formatDuration(replay.durationMs)}`}
          />
        </Slider.Root>

        <span className="text-ink-muted shrink-0 font-mono text-xs tabular-nums">
          {formatDuration(replay.elapsedMs)} /{" "}
          {formatDuration(replay.durationMs)}
        </span>
      </div>

      {disabled ? (
        <p className="text-ink-subtle mt-2 text-xs">
          Nothing recorded for this version yet. Start typing, then save to
          record a session.
        </p>
      ) : !replay.hasStarted ? (
        <p className="text-ink-subtle mt-2 text-xs">
          Showing the finished file. Press play to watch its {replay.total}{" "}
          edits being typed.
        </p>
      ) : (
        <p className="text-ink-subtle mt-2 text-xs">
          {replay.index} of {replay.total} edits ·{" "}
          {replay.isFinished
            ? "finished"
            : replay.isPlaying
              ? "playing"
              : "paused"}
        </p>
      )}
    </div>
  );
}
