"use client";

import { Clock, FileCode2, Plus } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { languageOf } from "@/lib/format";
import { type ProjectDetail } from "@/lib/schemas";

/**
 * Versions and files for the project being viewed.
 *
 * The original split this into two panes toggled by a pair of `<div @click>`
 * "tabs" with ids `#folder-control` and `#version-control`, each 110% wide
 * inside a fixed 100vh column. Versions are links here, so a particular
 * version of a project is a URL someone can share — which is the whole point
 * of versioning a recording.
 */
export function VersionSidebar({
  project,
  currentVersionNumber,
  canCreateVersion,
  onCreateVersion,
}: {
  project: ProjectDetail;
  currentVersionNumber: number;
  canCreateVersion: boolean;
  onCreateVersion: () => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-ink-muted text-xs font-medium">Versions</h2>
          {canCreateVersion && (
            <button
              type="button"
              onClick={onCreateVersion}
              className="text-brand hover:bg-surface-raised focus-visible:outline-brand inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <Plus aria-hidden="true" className="size-3.5" />
              New
            </button>
          )}
        </div>

        <ul className="flex flex-col gap-0.5">
          {project.versions.map((version) => {
            const active = version.number === currentVersionNumber;
            return (
              <li key={version.id}>
                <Link
                  href={`/workspace/${encodeURIComponent(project.name)}/${version.number}`}
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "flex items-baseline gap-2 rounded px-2 py-1.5 text-sm",
                    "focus-visible:outline-brand focus-visible:outline-2 focus-visible:outline-offset-2",
                    active
                      ? "bg-surface-raised text-ink"
                      : "text-ink-muted hover:bg-surface-raised hover:text-ink",
                  )}
                >
                  <span className="text-ink-subtle font-mono text-xs">
                    v{version.number}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {version.name}
                  </span>
                  {version.recording !== null && (
                    <Clock
                      aria-label="Has a recording"
                      className="text-brand size-3.5 shrink-0"
                    />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <h2 className="text-ink-muted mb-2 text-xs font-medium">Files</h2>
        <ul className="flex flex-col gap-0.5">
          {[
            project.versions.find(
              (version) => version.number === currentVersionNumber,
            )?.file,
          ]
            .filter((file) => file !== undefined && file !== null)
            .map((file) => (
              <li
                key={file.id}
                className="text-ink flex items-center gap-2 rounded px-2 py-1.5 text-sm"
              >
                <FileCode2
                  aria-hidden="true"
                  className="text-ink-subtle size-3.5"
                />
                <span className="min-w-0 flex-1 truncate">{file.name}</span>
                <span className="text-warning font-mono text-[0.6875rem]">
                  {languageOf(file.name)}
                </span>
              </li>
            ))}
        </ul>
      </section>
    </div>
  );
}
