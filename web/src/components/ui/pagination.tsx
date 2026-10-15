"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/cn";

/**
 * Page links.
 *
 * Differences from the original that matter: these are links, so they can be
 * opened in a new tab and read by a screen reader as navigation; the current
 * page is marked with `aria-current`; and the window is capped so a catalogue
 * with 40 pages does not render 40 controls. The Vue version built a
 * `projectPageArray` of every page number and rendered a `<div @click>` per
 * entry.
 */
export function Pagination({
  page,
  pageCount,
  hrefFor,
  className,
}: {
  /** 1-based. */
  page: number;
  pageCount: number;
  hrefFor: (page: number) => string;
  className?: string;
}) {
  if (pageCount <= 1) return null;

  const current = Math.min(Math.max(page, 1), pageCount);

  return (
    <nav
      aria-label="Pagination"
      className={cn("flex justify-center", className)}
    >
      <ul className="flex items-center gap-1">
        <li>
          <PageLink
            href={hrefFor(current - 1)}
            disabled={current === 1}
            label="Previous page"
          >
            <ChevronLeft aria-hidden="true" className="size-4" />
          </PageLink>
        </li>

        {windowAround(current, pageCount).map((entry, i) =>
          entry === "gap" ? (
            <li
              key={`gap-${i}`}
              aria-hidden="true"
              className="text-ink-subtle px-1"
            >
              …
            </li>
          ) : (
            <li key={entry}>
              <PageLink
                href={hrefFor(entry)}
                current={entry === current}
                label={`Page ${entry}`}
              >
                {entry}
              </PageLink>
            </li>
          ),
        )}

        <li>
          <PageLink
            href={hrefFor(current + 1)}
            disabled={current === pageCount}
            label="Next page"
          >
            <ChevronRight aria-hidden="true" className="size-4" />
          </PageLink>
        </li>
      </ul>
    </nav>
  );
}

function PageLink({
  href,
  children,
  current = false,
  disabled = false,
  label,
}: {
  href: string;
  children: React.ReactNode;
  current?: boolean;
  disabled?: boolean;
  label: string;
}) {
  const classes = cn(
    "inline-flex size-9 items-center justify-center rounded-md border text-sm",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
    current
      ? "border-brand bg-brand text-brand-ink font-semibold"
      : "border-edge text-ink-muted hover:border-edge-strong hover:text-ink",
    disabled && "pointer-events-none opacity-40",
  );

  /*
   * A real disabled button, not a `<span aria-disabled>`. `aria-label` is
   * prohibited on a span with no role, so the span version was both an axe
   * violation and genuinely unreadable — a screen reader got no name for it.
   */
  if (disabled) {
    return (
      <button type="button" disabled aria-label={label} className={classes}>
        {children}
      </button>
    );
  }

  return (
    <Link
      href={href}
      aria-label={label}
      aria-current={current ? "page" : undefined}
      className={classes}
    >
      {children}
    </Link>
  );
}

/** First, last, and a window around the current page, with gaps marked. */
export function windowAround(
  current: number,
  pageCount: number,
  span = 1,
): (number | "gap")[] {
  const pages = new Set<number>([1, pageCount]);
  for (let p = current - span; p <= current + span; p += 1) {
    if (p >= 1 && p <= pageCount) pages.add(p);
  }

  const sorted = [...pages].sort((a, b) => a - b);
  const result: (number | "gap")[] = [];
  let previous = 0;
  for (const p of sorted) {
    if (previous !== 0 && p - previous > 1) result.push("gap");
    result.push(p);
    previous = p;
  }
  return result;
}
