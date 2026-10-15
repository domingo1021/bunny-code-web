"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { applyEdits } from "@/core/replay/applyEdit";
import { ReplayClock } from "@/core/replay/clock";
import { buildTimeline } from "@/core/replay/timeline";
import { docToText, docFromText, type EditRecord } from "@/core/replay/types";

/**
 * A recording, typing itself out.
 *
 * The home page's job is to show what this product is, and what it is cannot
 * be conveyed by a screenshot: a session is a sequence of keystrokes over
 * time. So the page shows one, played by the same engine the workspace uses —
 * `buildTimeline` and `ReplayClock`, over a real recorded log.
 *
 * Accessibility: the animation is decoration of content that is also present
 * as static text, so the moving copy is hidden from assistive technology and
 * the finished file is exposed once instead of character by character. With
 * `prefers-reduced-motion` it does not animate at all.
 */
export function HeroReplay({
  records,
  baseText,
  fileName,
  finalText,
}: {
  records: readonly EditRecord[];
  baseText: string;
  fileName: string;
  finalText: string;
}) {
  const prefersReducedMotion = usePrefersReducedMotion();

  const timeline = useMemo(() => buildTimeline(records), [records]);
  const clock = useMemo(() => new ReplayClock({ timeline }), [timeline]);

  useEffect(() => {
    if (prefersReducedMotion) return;

    clock.play();
    /*
     * Loop, with a pause at the end so the finished file is readable before it
     * rewinds. This is the one piece of non-user-triggered motion on the page,
     * and it is the page's subject rather than an entrance effect.
     */
    const restart = setInterval(() => {
      if (!clock.playing) {
        clock.seek(0);
        clock.play();
      }
    }, 2_600);

    return () => {
      clearInterval(restart);
      clock.dispose();
    };
  }, [clock, prefersReducedMotion]);

  const state = useSyncExternalStore(
    clock.subscribe,
    clock.getSnapshot,
    clock.getSnapshot,
  );

  const doc = useMemo(() => {
    if (prefersReducedMotion) return docFromText(finalText);
    return applyEdits(docFromText(baseText), records.slice(0, state.index));
  }, [prefersReducedMotion, finalText, baseText, records, state.index]);

  const text = docToText(doc);
  const lines = text.split("\n");

  return (
    <figure className="rounded-panel border-edge bg-editor-bg m-0 overflow-hidden border">
      <figcaption className="border-edge flex items-center gap-2 border-b px-3 py-2">
        <span aria-hidden="true" className="bg-live size-1.5 rounded-full" />
        <span className="text-ink-muted font-mono text-xs">{fileName}</span>
        <span className="text-ink-subtle ml-auto font-mono text-xs">
          {prefersReducedMotion
            ? `${records.length} edits`
            : `${state.index} / ${records.length} edits`}
        </span>
      </figcaption>

      {/* The real content, exposed to assistive technology once. */}
      <pre className="sr-only">{finalText}</pre>

      <div
        aria-hidden="true"
        className="h-72 overflow-hidden px-3 py-3 font-mono text-[0.8125rem] leading-relaxed sm:h-80"
      >
        {lines.map((line, index) => {
          const isCaretLine = index === doc.line && !prefersReducedMotion;
          return (
            <div key={index} className="flex">
              <span className="text-ink-subtle/60 w-7 shrink-0 text-right tabular-nums">
                {index + 1}
              </span>
              <code className="text-ink pl-3 whitespace-pre">
                {isCaretLine ? (
                  <>
                    {line.slice(0, doc.index)}
                    <span
                      className="bg-live -mx-px inline-block w-px animate-pulse align-middle"
                      style={{ height: "1.1em" }}
                    />
                    {line.slice(doc.index)}
                  </>
                ) : (
                  line
                )}
              </code>
            </div>
          );
        })}
      </div>
    </figure>
  );
}

/**
 * Whether the reader has asked for less motion.
 *
 * Read with `useSyncExternalStore` so the value is correct on the first paint
 * rather than flipping after an effect — a looping animation that starts and
 * then stops is worse than one that never starts.
 */
function usePrefersReducedMotion(): boolean {
  const [query] = useState(() =>
    typeof window === "undefined"
      ? null
      : window.matchMedia("(prefers-reduced-motion: reduce)"),
  );

  return useSyncExternalStore(
    (onChange) => {
      query?.addEventListener("change", onChange);
      return () => query?.removeEventListener("change", onChange);
    },
    () => query?.matches ?? false,
    // Assume reduced motion on the server: no animation in the prerendered
    // HTML means no flash of movement before hydration decides.
    () => true,
  );
}
