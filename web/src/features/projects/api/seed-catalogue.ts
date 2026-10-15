import { cacheLife } from "next/cache";
import { type EditRecord } from "@/core/replay/types";
import { db, fileContent, recordingFor, userById } from "@/mocks/db";
import { type ProjectSummary } from "@/lib/schemas";

/**
 * Server-side reads of the seeded catalogue, for Server Components.
 *
 * **Why this exists alongside the MSW handlers.** MSW serves the API from a
 * service worker, and service workers do not exist on the server — so a Server
 * Component cannot call the mock API over HTTP. Rather than give up on server
 * rendering data, the read-only slice of the seed is read directly here, from
 * the same `mocks/db` module the handlers use. One seed, two access paths, no
 * duplicated behaviour.
 *
 * Only **immutable seed data** belongs here. Anything a reader can change
 * (their projects, recordings, battles) lives in their browser's copy of the
 * database and must be fetched client-side through MSW, or the server would
 * serve a stale view that cannot see their writes.
 */

/** The three most-starred public projects, for the home page. */
export async function topSeededProjects(): Promise<ProjectSummary[]> {
  "use cache";
  // Seed data never changes within a deployment, so this is effectively
  // permanent; the build id is already part of the cache key.
  cacheLife("max");

  return db()
    .projects.filter((project) => project.isPublic === 1)
    .sort((a, b) => b.starCount - a.starCount)
    .slice(0, 3)
    .map(toCard);
}

/** Headline counts for the home page. */
export async function seededStats(): Promise<{
  projects: number;
  recordings: number;
}> {
  "use cache";
  cacheLife("max");

  const database = db();
  return {
    projects: database.projects.filter((p) => p.isPublic === 1).length,
    recordings: [...database.recordings.values()].filter(
      (records) => records.length > 0,
    ).length,
  };
}

function toCard(
  project: ReturnType<typeof db>["projects"][number],
): ProjectSummary {
  const owner = userById(project.userID);
  return {
    id: project.projectID,
    name: project.projectName,
    description: project.projectDescription,
    visibility: project.isPublic === 1 ? "PUBLIC" : "PRIVATE",
    watchCount: project.watchCount,
    starCount: project.starCount,
    createdAt: project.createdAt,
    latestVersionName: project.version.at(-1)?.versionName ?? null,
    owner: {
      id: project.userID,
      name: owner?.userName ?? "unknown",
      pictureUrl: owner?.picture ?? "",
    },
  };
}

/**
 * A recording for the home page to play.
 *
 * Returned whole rather than fetched over HTTP, because the home page is a
 * Server Component: the log is part of the static payload, so the hero starts
 * typing on the first frame instead of after a round trip.
 */
export async function heroRecording(): Promise<{
  records: EditRecord[];
  baseText: string;
  finalText: string;
  fileName: string;
} | null> {
  "use cache";
  cacheLife("max");

  const project = db().projects.find((p) => p.projectName === "lru-cache");
  const version = project?.version[0];
  const file = version?.files[0];
  const record = version?.records[0];
  if (file === undefined || record === undefined) return null;

  return {
    records: [...recordingFor(version!.versionID, file.fileID)],
    baseText: fileContent(record.baseURL) ?? "",
    finalText: fileContent(file.fileURL) ?? "",
    fileName: file.fileName,
  };
}
