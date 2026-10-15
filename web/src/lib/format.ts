/** Small presentation helpers shared across features. */

/** Compact counts, so a 612-watch project does not widen its card. */
export function formatCount(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "0";
  if (value < 1_000) return String(Math.trunc(value));
  if (value < 1_000_000) {
    const thousands = value / 1_000;
    return `${thousands < 10 ? thousands.toFixed(1).replace(/\.0$/, "") : Math.round(thousands)}k`;
  }
  return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

/** `m:ss`, for replay position and duration. */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0:00";
  const totalSeconds = Math.floor(ms / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** `x1`, `x0.25` — the replay speed badge. */
export function formatSpeed(speed: number): string {
  return `x${Number.isInteger(speed) ? speed : speed.toString()}`;
}

/** The language tag shown beside a file name, derived from its extension. */
export function languageOf(fileName: string): string {
  const parts = fileName.split(".");
  return parts.length > 1 ? (parts.pop() ?? "").toUpperCase() : "";
}
