/**
 * Server-only surface of the projects feature.
 *
 * Kept apart from `index.ts` because that barrel re-exports client components:
 * a single mixed barrel would pull `next/cache` into the browser bundle the
 * moment any client component imported it. Server Components import from here.
 *
 * In the demo there is no server to ask — MSW lives in the browser — so the
 * home page reads the seed directly (and caches it for good). With a backend
 * configured it asks the API on each request instead; callers render these
 * inside `<Suspense>`, so the rest of the page does not wait.
 */
import { USING_MOCK_API } from "@/lib/env";
import { type ProjectSummary } from "@/lib/schemas";
import { fetchProjectStats, fetchTopProjects } from "./api/projects-api";
import {
  heroRecording,
  seededStats,
  topSeededProjects,
} from "./api/seed-catalogue";

export { heroRecording };

/** The three most-starred public projects; empty if the API is unreachable. */
export async function topProjects(): Promise<ProjectSummary[]> {
  if (USING_MOCK_API) return topSeededProjects();
  try {
    return await fetchTopProjects();
  } catch {
    return [];
  }
}

/** Headline counts, or `null` if the API is unreachable. */
export async function projectStats(): Promise<{
  projects: number;
  recordings: number;
} | null> {
  if (USING_MOCK_API) return seededStats();
  try {
    return await fetchProjectStats();
  } catch {
    return null;
  }
}
