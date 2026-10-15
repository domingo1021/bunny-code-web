"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/features/auth";
import {
  createProject,
  createVersion,
  fetchCatalogue,
  fetchProjectDetail,
  fetchProjectStats,
  fetchTopProjects,
  fetchUserProjects,
  projectKeys,
  setStarred,
  type CreateProjectInput,
} from "../api/projects-api";

/**
 * Server state for projects: cached, deduplicated, and invalidated together
 * through `projectKeys`, so a write can never leave one list stale while
 * another updates.
 */

export function useCatalogue(keyword: string, page: number) {
  return useQuery({
    queryKey: projectKeys.catalogue(keyword, page),
    queryFn: ({ signal }) => fetchCatalogue(keyword, page, signal),
    // Keeps the previous page on screen while the next one loads, instead of
    // collapsing the grid to skeletons on every page change.
    placeholderData: (previous) => previous,
  });
}

export function useTopProjects() {
  return useQuery({
    queryKey: projectKeys.top,
    queryFn: ({ signal }) => fetchTopProjects(signal),
    staleTime: 5 * 60_000,
  });
}

export function useProjectStats() {
  return useQuery({
    queryKey: projectKeys.stats,
    queryFn: ({ signal }) => fetchProjectStats(signal),
    staleTime: 5 * 60_000,
  });
}

/**
 * One project. Waits for the session: a private project exists only for its
 * owner, and asking before the token is known would answer 404 to them.
 */
export function useProjectDetail(projectName: string) {
  const { token, isPending } = useSession();
  return useQuery({
    queryKey: projectKeys.detail(projectName),
    queryFn: ({ signal }) => fetchProjectDetail(projectName, token, signal),
    enabled: projectName !== "" && !isPending,
  });
}

export function useUserProjects(userID: number, page: number, keyword: string) {
  const { token, isPending } = useSession();
  return useQuery({
    queryKey: projectKeys.ofUser(userID, page, keyword),
    queryFn: ({ signal }) =>
      fetchUserProjects({ userID, page, keyword, token, signal }),
    // Waiting for the session avoids fetching twice, and avoids briefly
    // showing the anonymous view (which hides private projects) to the owner.
    enabled: Number.isFinite(userID) && !isPending,
    placeholderData: (previous) => previous,
  });
}

export function useCreateProject() {
  const { token } = useSession();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateProjectInput) => createProject(token, input),
    onSuccess: () => {
      // A new project changes this user's list and the public catalogue.
      void queryClient.invalidateQueries({ queryKey: projectKeys.all });
    },
  });
}

export function useCreateVersion(projectName: string) {
  const { token } = useSession();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { versionName: string; fileName: string }) =>
      createVersion(projectName, token, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: projectKeys.detail(projectName),
      });
    },
  });
}

/** Star or unstar; the detail is refetched so the count is the server's. */
export function useToggleStar(projectName: string) {
  const { token } = useSession();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (starred: boolean) => setStarred(projectName, token, starred),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: projectKeys.all });
    },
  });
}
