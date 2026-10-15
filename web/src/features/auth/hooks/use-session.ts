"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ApiError } from "@/lib/api-client";
import {
  signIn,
  signUp,
  verifyToken,
  type Credentials,
  type SignUpInput,
} from "../api/auth-api";
import { useAuthStore, waitForAuthHydration } from "../model/auth-store";

/**
 * The signed-in viewer, and the actions that change who that is.
 *
 * The original did this inside `App.vue`'s setup body: a bare `axios(...)` call
 * at module evaluation time, outside any lifecycle hook, whose `.then` wrote to
 * a ref. That fired on every page load including the login page, could not be
 * awaited, and had no way to report failure — the `.catch` set `isLogin = false`
 * and discarded the error.
 */

export interface Session {
  userID: number | null;
  token: string | null;
  isAuthenticated: boolean;
  /** True until the restored token has been checked. Render skeletons, not a
   *  signed-out UI, while this is true — otherwise the nav flickers. */
  isPending: boolean;
}

export function useSession(): Session {
  const token = useAuthStore((state) => state.token);
  const userID = useAuthStore((state) => state.userID);
  const status = useAuthStore((state) => state.status);

  return {
    userID,
    token,
    isAuthenticated: status === "authenticated" && userID !== null,
    isPending: status === "unknown",
  };
}

/**
 * Verify a token restored from storage, once, on mount.
 *
 * Mounted by the root providers. A token that no longer verifies is discarded
 * rather than left to fail the next request, so the UI never shows a signed-in
 * nav for a dead session.
 *
 * It waits for `persist` to rehydrate first. Without that wait the first run
 * sees `token === null`, concludes nobody is signed in, and the status is no
 * longer `unknown` by the time the real token arrives — so a signed-in user
 * who reloads the page appears signed out until they log in again.
 */
export function useRestoreSession(): void {
  useEffect(() => {
    let active = true;

    void (async () => {
      await waitForAuthHydration();
      if (!active) return;

      const store = useAuthStore.getState();
      // Another tab's sign-in, or a sign-in that happened while we waited.
      if (store.status === "authenticated") return;

      const token = store.token;
      if (token === null) {
        store.rejected();
        return;
      }

      try {
        const userID = await verifyToken(token);
        if (active) useAuthStore.getState().confirmed(userID);
      } catch {
        if (active) useAuthStore.getState().rejected();
      }
    })();

    return () => {
      active = false;
    };
  }, []);
}

/** Where to go after signing in; falls back to the user's own page. */
function destinationFor(userID: number, redirect: string | null): string {
  // Only same-origin paths, so `?redirect=https://elsewhere` cannot be used to
  // bounce someone off-site straight after they authenticate.
  if (
    redirect !== null &&
    redirect.startsWith("/") &&
    !redirect.startsWith("//")
  ) {
    return redirect;
  }
  return `/user/${userID}`;
}

export function useSignIn(redirect: string | null = null) {
  const router = useRouter();
  const signedIn = useAuthStore((state) => state.signedIn);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (credentials: Credentials) => signIn(credentials),
    onSuccess: (result) => {
      signedIn({ token: result.accessToken, userID: result.user.id });
      // Anything cached for the previous (anonymous) viewer is no longer
      // correct — private projects and viewer roles both change.
      void queryClient.invalidateQueries();
      router.push(destinationFor(result.user.id, redirect));
    },
  });
}

export function useSignUp(redirect: string | null = null) {
  const router = useRouter();
  const signedIn = useAuthStore((state) => state.signedIn);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: SignUpInput) => signUp(input),
    onSuccess: (result) => {
      signedIn({ token: result.accessToken, userID: result.user.id });
      void queryClient.invalidateQueries();
      router.push(destinationFor(result.user.id, redirect));
    },
  });
}

export function useSignOut() {
  const router = useRouter();
  const signedOut = useAuthStore((state) => state.signedOut);
  const queryClient = useQueryClient();

  return () => {
    signedOut();
    queryClient.clear();
    router.push("/login");
  };
}

/** True when a failure means "your session ended", so the UI can say so. */
export function isAuthFailure(error: unknown): boolean {
  return error instanceof ApiError && error.isUnauthorized;
}
