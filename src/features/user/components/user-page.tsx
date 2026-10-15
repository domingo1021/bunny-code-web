"use client";

import { FolderPlus, LogOut } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { useSignOut } from "@/features/auth";
import {
  CreateProjectDialog,
  ProjectGrid,
  useUserProjects,
} from "@/features/projects";
import { describeError } from "@/lib/api-client";
import { useIsOwner, useUserDetail } from "../hooks/use-user";
import { UserProfile, UserProfileSkeleton } from "./user-profile";

/**
 * A user's page: their profile, their projects, and — if it is their own page —
 * the controls to add a project or sign out.
 *
 * The original gated these on a `userAuth` number compared against an inline
 * `CLIENT_CATEGORY` map that it redeclared in this view and in three others.
 */
export function UserPage({ userID, page }: { userID: number; page: number }) {
  const detail = useUserDetail(userID);
  const { isOwner } = useIsOwner(userID);
  const projects = useUserProjects(userID, page - 1, "");
  const signOut = useSignOut();

  if (detail.isError) {
    return (
      <EmptyState
        className="mt-10"
        title="No such user"
        description={describeError(detail.error)}
        action={
          <Button asChild variant="secondary">
            <Link href="/workspace">Browse projects</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[18rem_1fr] lg:gap-10">
      <aside className="flex flex-col gap-4">
        {detail.isPending ? (
          <UserProfileSkeleton />
        ) : (
          <UserProfile user={detail.data} headingLevel="h1" />
        )}

        {isOwner && (
          <div className="flex flex-col gap-2">
            <CreateProjectDialog />
            <Button variant="ghost" onClick={signOut}>
              <LogOut aria-hidden="true" />
              Log out
            </Button>
          </div>
        )}
      </aside>

      <section className="min-w-0">
        <h2 className="mb-6 text-2xl font-semibold tracking-tight">
          {isOwner ? "Your projects" : "Projects"}
        </h2>

        {projects.isPending ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <span className="sr-only" role="status">
              Loading projects
            </span>
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-[9.5rem]" />
            ))}
          </div>
        ) : projects.isError ? (
          <EmptyState
            title="Could not load projects"
            description={describeError(projects.error)}
          />
        ) : projects.data.content.length === 0 ? (
          <EmptyState
            icon={<FolderPlus className="size-8" />}
            title={isOwner ? "No projects yet" : "Nothing public here yet"}
            description={
              isOwner
                ? "Create a project, then open it and start typing — everything you type is recorded."
                : "This person has not published a project yet."
            }
            action={isOwner ? <CreateProjectDialog /> : undefined}
          />
        ) : (
          <div className="flex flex-col gap-8">
            <div
              className={
                projects.isPlaceholderData
                  ? "opacity-60 transition-opacity"
                  : undefined
              }
            >
              <ProjectGrid
                projects={projects.data.content}
                label={isOwner ? "Your projects" : "Projects"}
              />
            </div>

            <Pagination
              page={page}
              pageCount={projects.data.totalPages}
              hrefFor={(target) =>
                target <= 1
                  ? `/user/${userID}`
                  : `/user/${userID}?page=${target}`
              }
            />
          </div>
        )}
      </section>
    </div>
  );
}
