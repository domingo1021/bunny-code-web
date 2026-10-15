"use client";

import { Swords, FolderCode, LogIn, Search } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, Suspense, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/features/auth";
import { cn } from "@/lib/cn";

/**
 * The top navigation.
 *
 * Differences from the original that matter:
 *
 * - It is a real `<nav>` with an `aria-current` link, instead of `<div>`s
 *   styled to look clickable (`.flex-container-2:hover { cursor: pointer }`).
 * - It works on a phone. The original fixed a `100vw` bar with `padding-left:
 *   30px; padding-right: 50px` and a 1.5rem font, which overflowed below about
 *   700px and pushed a horizontal scrollbar onto every page.
 * - The original's markup put this header outside `<body>` and then styled
 *   `header + body { padding-top: 60px }`, which only worked because browsers
 *   silently relocate stray elements into the body.
 */

const LINKS = [
  { href: "/workspace", label: "Workspace", icon: FolderCode },
  { href: "/battle", label: "Battle valleys", icon: Swords },
] as const;

export function SiteHeader() {
  const { userID, isAuthenticated, isPending } = useSession();

  return (
    <header className="border-edge bg-canvas/90 sticky top-0 z-40 border-b backdrop-blur">
      <nav
        aria-label="Main"
        className="h-nav mx-auto flex max-w-7xl items-center gap-2 px-4 sm:gap-4"
      >
        <Link
          href="/"
          className="text-ink hover:text-brand focus-visible:outline-brand flex shrink-0 items-center gap-2 rounded-md px-1 py-1 focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <span aria-hidden="true" className="text-lg">
            🐰
          </span>
          <span className="font-semibold tracking-tight">Bunny Code</span>
        </Link>

        {/* The active link depends on the URL, which on a dynamic route is
            only known at request time; the fallback is the same links with
            none marked, so the shell around them stays prerendered. */}
        <Suspense fallback={<NavLinks pathname={null} />}>
          <CurrentNavLinks />
        </Suspense>

        <div className="ml-auto flex items-center gap-2">
          {/* Reads the URL, which only exists at request time: suspending
              here keeps the rest of the shell prerenderable. */}
          <Suspense fallback={<Skeleton className="h-9 w-40" />}>
            <ProjectSearch />
          </Suspense>

          {isPending ? (
            <Skeleton className="h-9 w-20" />
          ) : isAuthenticated && userID !== null ? (
            <Button asChild variant="ghost" size="sm">
              <Link href={`/user/${userID}`}>Your page</Link>
            </Button>
          ) : (
            <Button asChild variant="primary" size="sm">
              <Link href="/login">
                <LogIn aria-hidden="true" />
                Log in
              </Link>
            </Button>
          )}
        </div>
      </nav>
    </header>
  );
}

function CurrentNavLinks() {
  return <NavLinks pathname={usePathname()} />;
}

function NavLinks({ pathname }: { pathname: string | null }) {
  return (
    <ul className="flex min-w-0 items-center gap-1">
      {LINKS.map(({ href, label, icon: Icon }) => {
        const active =
          pathname !== null &&
          (pathname === href || pathname.startsWith(`${href}/`));
        return (
          <li key={href}>
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm transition-colors sm:px-3",
                "focus-visible:outline-brand focus-visible:outline-2 focus-visible:outline-offset-2",
                active
                  ? "bg-surface-raised text-brand"
                  : "text-ink-muted hover:bg-surface-raised hover:text-ink",
              )}
            >
              <Icon aria-hidden="true" className="size-4 shrink-0" />
              {/* The label is the accessible name on every size; it is
                  only visually hidden on the narrowest screens. */}
              <span className="hidden sm:inline">{label}</span>
              <span className="sr-only sm:hidden">{label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Jump-to-project search.
 *
 * A real form, so Enter submits and the field is labelled. The original bound
 * `@keyup` on a wrapper `<div>` and checked `e.key === "Enter"` by hand, with
 * an unlabelled input and `outline: none` on focus.
 */
function ProjectSearch() {
  const searchParams = useSearchParams();
  const urlKeywords = searchParams.get("keywords") ?? "";

  /*
   * Keyed on the URL term so the field resets when the URL changes — a back
   * navigation or a shared link must not leave a stale term in the box. This
   * is the "reset state with a key" pattern rather than syncing state inside an
   * effect, which cascades renders (and which the React Compiler lint rules
   * reject outright).
   */
  return <ProjectSearchForm key={urlKeywords} initialKeywords={urlKeywords} />;
}

function ProjectSearchForm({ initialKeywords }: { initialKeywords: string }) {
  const router = useRouter();
  const [keywords, setKeywords] = useState(initialKeywords);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const term = keywords.trim();
    router.push(
      term === ""
        ? "/workspace"
        : `/workspace?keywords=${encodeURIComponent(term)}`,
    );
  }

  return (
    <form onSubmit={onSubmit} role="search" className="hidden sm:block">
      {/* Distinct from the catalogue page's own "Search projects" field, so
          each has an unambiguous accessible name. */}
      <label htmlFor="project-search" className="sr-only">
        Quick search projects
      </label>
      <div className="relative">
        <Search
          aria-hidden="true"
          className="text-ink-subtle pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
        />
        <Input
          id="project-search"
          type="search"
          name="keywords"
          value={keywords}
          onChange={(event) => setKeywords(event.target.value)}
          placeholder="Search projects…"
          className="h-9 w-44 pl-8 md:w-56"
        />
      </div>
    </form>
  );
}
