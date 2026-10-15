import { recordKeystroke, type Keystroke } from "@/core/replay/recordEdit";
import {
  docFromText,
  EMPTY_DOC,
  type DocState,
  type EditRecord,
} from "@/core/replay/types";

/**
 * Generates a seeded coding session by *actually typing* the source.
 *
 * The demo needs recordings to replay, and hand-writing an edit log is both
 * tedious and untrustworthy — a typo in the fixture looks exactly like a bug in
 * the player. Instead this drives the real recorder one keystroke at a time, so
 * every seeded recording is by construction a recording the app could have
 * produced, and replaying it is guaranteed to reproduce the source.
 * `typesBackTo` asserts exactly that.
 *
 * It types *adaptively*: after each newline the editor has already auto-indented
 * and auto-close has already inserted the matching bracket, so the generator
 * compares where the cursor actually is against the target line and emits
 * spaces or backspaces to converge. That is also a decent smoke test of
 * auto-indent and auto-close themselves.
 */

export interface TypedSession {
  readonly records: readonly EditRecord[];
  readonly doc: DocState;
  readonly text: string;
}

export interface TypeSourceOptions {
  /** Document to start typing into. Defaults to an empty one. */
  readonly from?: DocState;
  /** Epoch milliseconds of the first keystroke. */
  readonly startedAtMs?: number;
  /** Average milliseconds between keystrokes. */
  readonly keystrokeMs?: number;
  /**
   * Seed for the deterministic jitter applied to keystroke timing. Replay
   * should look like a person typing, not a metronome, but the fixture must be
   * identical on every run or snapshot-style tests become flaky.
   */
  readonly seed?: number;
}

export function typeSource(
  source: string,
  options: TypeSourceOptions = {},
): TypedSession {
  const {
    from = EMPTY_DOC,
    startedAtMs = Date.UTC(2026, 8, 12, 9, 30, 0),
    keystrokeMs = 95,
    seed = 1,
  } = options;

  const random = mulberry32(seed);
  let doc = from;
  const records: EditRecord[] = [];
  let elapsed = 0;

  const press = (stroke: Keystroke): void => {
    // Jitter between 0.45x and 1.75x, with an occasional "thinking" pause, so
    // the replay slider has something human-looking to scrub through.
    const jitter = 0.45 + random() * 1.3;
    const pause = random() < 0.04 ? 900 + random() * 1_400 : 0;
    elapsed += Math.round(keystrokeMs * jitter + pause);

    const timestamp = `${(BigInt(startedAtMs) + BigInt(elapsed)) * 1_000_000n}`;
    const result = recordKeystroke(doc, stroke, timestamp);
    if (result === null) return;
    records.push(result.record);
    doc = result.doc;
  };

  const targetLines = source.split("\n");

  targetLines.forEach((targetLine, i) => {
    // Text already on the line when typing starts. Only the first line of a
    // session that continues an existing document has any, and it must survive
    // the indent convergence below rather than being backspaced away.
    const prefix = i === 0 ? doc.index : 0;
    if (i > 0) press({ key: "Enter" });

    // Auto-indent has already placed the cursor; nudge it to the target indent.
    const targetIndent = targetLine.length - targetLine.trimStart().length;
    const cursorBeforeTyping = prefix + targetIndent;
    let guard = 0;
    while (doc.index > cursorBeforeTyping && guard++ < 200) {
      press({ key: "Backspace" });
    }
    while (doc.index < cursorBeforeTyping && guard++ < 200) {
      press({ key: " " });
    }

    for (const character of targetLine.slice(targetIndent)) {
      press({ key: character });
    }

    // Auto-close may have left a bracket after the cursor that the target line
    // does not want (an unbalanced line); remove the surplus.
    const current = doc.lines[doc.line] ?? "";
    let surplus = current.length - (prefix + targetLine.length);
    while (surplus > 0 && guard++ < 200) {
      press({ key: "ArrowRight" });
      press({ key: "Backspace" });
      surplus -= 1;
    }
  });

  return { records, doc, text: doc.lines.join("\n") };
}

/**
 * Whether a generated session really types back to its source.
 *
 * Used by the seed tests as the contract for every fixture: if this is false
 * the fixture is wrong, and no amount of player correctness will save it.
 */
export function typesBackTo(session: TypedSession, source: string): boolean {
  return session.text === source;
}

/** Re-derive the starting document a recording was made against. */
export function baseDocFor(source: string): DocState {
  return docFromText(source);
}

/** Small deterministic PRNG, so fixtures are byte-identical on every run. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
