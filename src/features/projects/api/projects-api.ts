import { apiRequest } from "@/lib/api-client";
import {
  noContentSchema,
  projectDetailSchema,
  projectPageSchema,
  projectReferenceSchema,
  projectStatsSchema,
  projectVersionSchema,
  type Visibility,
} from "@/lib/schemas";

/** Projects per page in every list. */
export const PAGE_SIZE = 6;

/** Query keys, in one place so invalidation cannot miss a cache. */
export const projectKeys = {
  all: ["projects"] as const,
  catalogue: (keyword: string, page: number) =>
    ["projects", "catalogue", keyword, page] as const,
  top: ["projects", "top"] as const,
  stats: ["projects", "stats"] as const,
  detail: (projectName: string) => ["projects", "detail", projectName] as const,
  ofUser: (userID: number, page: number, keyword: string) =>
    ["projects", "user", userID, page, keyword] as const,
};

/** Public projects, newest first; `keyword` matches name, description or owner. */
export function fetchCatalogue(
  keyword: string,
  page: number,
  signal?: AbortSignal,
) {
  return apiRequest("/projects", {
    schema: projectPageSchema,
    searchParams: { keyword, page, size: PAGE_SIZE },
    ...(signal === undefined ? {} : { signal }),
  });
}

/** The three most-starred public projects. */
export async function fetchTopProjects(signal?: AbortSignal) {
  const page = await apiRequest("/projects", {
    schema: projectPageSchema,
    searchParams: { sort: "STARRED", size: 3 },
    ...(signal === undefined ? {} : { signal }),
  });
  return page.content;
}

export function fetchProjectStats(signal?: AbortSignal) {
  return apiRequest("/stats/projects", {
    schema: projectStatsSchema,
    ...(signal === undefined ? {} : { signal }),
  });
}

/**
 * One project with its versions. Sends the token when there is one: private
 * projects exist only for their owner, and `starredByViewer` is per viewer.
 */
export function fetchProjectDetail(
  projectName: string,
  token: string | null,
  signal?: AbortSignal,
) {
  return apiRequest(`/projects/${encodeURIComponent(projectName)}`, {
    schema: projectDetailSchema,
    token,
    ...(signal === undefined ? {} : { signal }),
  });
}

/** A user's projects: all of them for the owner, public ones for others. */
export function fetchUserProjects(input: {
  userID: number;
  page: number;
  keyword: string;
  token: string | null;
  signal?: AbortSignal;
}) {
  return apiRequest(`/users/${input.userID}/projects`, {
    schema: projectPageSchema,
    token: input.token,
    searchParams: { page: input.page, keyword: input.keyword, size: PAGE_SIZE },
    ...(input.signal === undefined ? {} : { signal: input.signal }),
  });
}

export interface CreateProjectInput {
  name: string;
  description: string;
  visibility: Visibility;
  versionName: string;
  fileName: string;
}

export function createProject(token: string | null, input: CreateProjectInput) {
  return apiRequest("/projects", {
    method: "POST",
    token,
    body: input,
    schema: projectReferenceSchema,
  });
}

export function createVersion(
  projectName: string,
  token: string | null,
  input: { versionName: string; fileName: string },
) {
  return apiRequest(`/projects/${encodeURIComponent(projectName)}/versions`, {
    method: "POST",
    token,
    body: input,
    schema: projectVersionSchema,
  });
}

/**
 * Count a view. Fire-and-forget: a failed view count must never surface as an
 * error on a page the reader is already looking at. The server counts each
 * viewer once per hour and never the owner.
 */
export function recordWatch(projectName: string, token: string | null) {
  return apiRequest(`/projects/${encodeURIComponent(projectName)}/views`, {
    method: "POST",
    token,
    schema: noContentSchema,
  });
}

/** Star or unstar a project. Idempotent: a user's star counts once. */
export function setStarred(
  projectName: string,
  token: string | null,
  starred: boolean,
) {
  return apiRequest(`/projects/${encodeURIComponent(projectName)}/star`, {
    method: starred ? "PUT" : "DELETE",
    token,
    schema: noContentSchema,
  });
}
