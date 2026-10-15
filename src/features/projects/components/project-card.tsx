import { Eye, Lock, Star } from "lucide-react";
import Link from "next/link";
import { Card, CardBody, CardMeta } from "@/components/ui/card";
import { formatCount } from "@/lib/format";
import { type ProjectSummary } from "@/lib/schemas";

/**
 * One project in a grid.
 *
 * The original made the owner name and project name separate click targets
 * inside an `<h5>`, each a `<div>` with a `@click` handler and `cursor:
 * pointer` — so neither was reachable by keyboard, neither had an href to open
 * in a new tab, and a screen reader announced two unlabelled divs. Both are
 * real links here, and the card is a fixed height so a long description cannot
 * make one card taller than its neighbours.
 */
export function ProjectCard({ project }: { project: ProjectSummary }) {
  const isPrivate = project.visibility === "PRIVATE";

  return (
    <Card className="hover:border-edge-strong flex h-full flex-col">
      <CardBody className="flex flex-1 flex-col gap-2">
        <h3 className="flex flex-wrap items-baseline gap-x-1 text-sm leading-tight">
          <Link
            href={`/user/${project.owner.id}`}
            className="text-ink-muted hover:text-brand font-medium hover:underline"
          >
            {project.owner.name}
          </Link>
          <span aria-hidden="true" className="text-ink-subtle">
            /
          </span>
          <Link
            href={`/workspace/${encodeURIComponent(project.name)}`}
            className="text-ink hover:text-brand font-semibold hover:underline"
          >
            {project.name}
          </Link>
          {isPrivate && (
            <span className="border-edge text-ink-subtle ml-1 inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[0.6875rem]">
              <Lock aria-hidden="true" className="size-3" />
              Private
            </span>
          )}
        </h3>

        {/* Reserve two lines so every card in a row is the same height. */}
        <p className="text-ink-muted line-clamp-2 min-h-10 text-sm">
          {project.description || "No description yet."}
        </p>

        <CardMeta className="mt-auto flex items-center gap-4">
          <span className="inline-flex items-center gap-1">
            <Star aria-hidden="true" className="size-3.5" />
            {formatCount(project.starCount)}
            <span className="sr-only">stars</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <Eye aria-hidden="true" className="size-3.5" />
            {formatCount(project.watchCount)}
            <span className="sr-only">views</span>
          </span>
          {project.latestVersionName !== null && (
            <span className="text-ink-subtle truncate">
              {project.latestVersionName}
            </span>
          )}
        </CardMeta>
      </CardBody>
    </Card>
  );
}

export function ProjectGrid({
  projects,
  label,
}: {
  projects: readonly ProjectSummary[];
  label: string;
}) {
  return (
    <ul aria-label={label} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {projects.map((project) => (
        <li key={project.id}>
          <ProjectCard project={project} />
        </li>
      ))}
    </ul>
  );
}
