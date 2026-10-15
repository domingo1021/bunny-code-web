"use client";

import { Search, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { catalogueHref } from "./project-catalogue";

/**
 * Search, on the page the results appear on.
 *
 * The header search is a convenience that is hidden below the `sm` breakpoint
 * to keep the navigation usable on a phone — which left no way to search at
 * all on a small screen, since the catalogue had no field of its own. This is
 * that field, so searching works at every width and sits next to what it
 * filters.
 *
 * Keyed on the URL term by the caller, so a back navigation resets it without
 * syncing state inside an effect.
 */
export function ProjectSearch({ keywords }: { keywords: string }) {
  const router = useRouter();
  const [term, setTerm] = useState(keywords);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    router.push(catalogueHref(term.trim(), 1));
  }

  return (
    <form
      role="search"
      onSubmit={onSubmit}
      className="flex w-full max-w-md items-center gap-2"
    >
      <label htmlFor="catalogue-search" className="sr-only">
        Search projects
      </label>
      <div className="relative min-w-0 flex-1">
        <Search
          aria-hidden="true"
          className="text-ink-subtle pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
        />
        <Input
          id="catalogue-search"
          type="search"
          name="keywords"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Search by project, description or author…"
          className="pl-8"
        />
      </div>
      <Button type="submit" variant="secondary">
        Search
      </Button>
      {keywords !== "" && (
        <Button asChild variant="ghost" size="icon" aria-label="Clear search">
          <Link href="/workspace">
            <X aria-hidden="true" />
          </Link>
        </Button>
      )}
    </form>
  );
}
