"use client";

import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/features/auth";
import { fetchUserDetail, userKeys } from "../api/user-api";

export function useUserDetail(userID: number) {
  return useQuery({
    queryKey: userKeys.detail(userID),
    queryFn: ({ signal }) => fetchUserDetail(userID, signal),
    enabled: Number.isFinite(userID),
  });
}

/**
 * Whether the viewer is looking at their own page.
 *
 * Answered from the verified session rather than asked of the server: the
 * session already knows who is signed in, and the server enforces ownership on
 * every write regardless. `isOwner` stays false until the session settles, so
 * a page never briefly renders owner-only controls to someone else.
 */
export function useIsOwner(userID: number): {
  isOwner: boolean;
  isPending: boolean;
} {
  const { userID: viewerID, isAuthenticated, isPending } = useSession();
  return {
    isOwner: isAuthenticated && viewerID === userID,
    isPending,
  };
}
