import { apiRequest } from "@/lib/api-client";
import { userProfileSchema } from "@/lib/schemas";

export const userKeys = {
  detail: (userID: number) => ["user", "detail", userID] as const,
};

/** A user's public profile. */
export function fetchUserDetail(userID: number, signal?: AbortSignal) {
  return apiRequest(`/users/${userID}`, {
    schema: userProfileSchema,
    ...(signal === undefined ? {} : { signal }),
  });
}
