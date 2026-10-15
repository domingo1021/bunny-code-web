"use client";

import { FolderSearch } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { describeError } from "@/lib/api-client";
import { useCatalogue } from "../hooks/use-projects";
import { ProjectGrid } from "./project-card";

/**
 * The browsable project list, with search and pagination driven by the URL.
 *
 * Keeping page and search term in the URL is what makes a result shareable and
 * the back button work. The original kept them in refs and pushed routes as a
 * side effect, then watched `route.fullPath` to refetch — and when a page came
 * back empty it called `searchProjectPage(1)`, which could push a route that
 * triggered the same watcher again.
 */
export function ProjectCatalogue({
  keywords,
  page,
}: {
  keywords: string;
  page: number;
}) {
  const { data, isPending, isError, error, isPlaceholderData } = useCatalogue(
    keywords,
    page - 1,
  );

  if (isPending) return <CatalogueSkeleton />;

  if (isError) {
    return (
      <EmptyState
        title="Could not load projects"
        description={describeError(error)}
        action={
          <Button asChild variant="secondary">
            <Link href="/workspace">Try again</Link>
          </Button>
        }
      />
    );
  }

  if (data.content.length === 0) {
    return keywords === "" ? (
      <EmptyState
        icon={<FolderSearch className="size-8" />}
        title="No projects yet"
        description="Once someone records a session it will show up here."
      />
    ) : (
      <EmptyState
        icon={<FolderSearch className="size-8" />}
        title={`Nothing matches “${keywords}”`}
        description="Try a shorter term, or browse everything instead."
        action={
          <Button asChild variant="secondary">
            <Link href="/workspace">Browse all projects</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Dim rather than unmount while the next page loads, so the grid does
          not jump and the reader keeps their place. */}
      <div
        aria-busy={isPlaceholderData}
        className={
          isPlaceholderData ? "opacity-60 transition-opacity" : undefined
        }
      >
        <ProjectGrid
          projects={data.content}
          label={keywords === "" ? "Projects" : `Projects matching ${keywords}`}
        />
      </div>

      <Pagination
        page={page}
        pageCount={data.totalPages}
        hrefFor={(target) => catalogueHref(keywords, target)}
      />
    </div>
  );
}

export function catalogueHref(keywords: string, page: number): string {
  const params = new URLSearchParams();
  if (keywords !== "") params.set("keywords", keywords);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query === "" ? "/workspace" : `/workspace?${query}`;
}

function CatalogueSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <span className="sr-only" role="status">
        Loading projects
      </span>
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} className="h-[9.5rem]" />
      ))}
    </div>
  );
}
