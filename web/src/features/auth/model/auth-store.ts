"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/**
 * Who is signed in.
 *
 * This replaces passing `userID` and a `setUserID` emitter down through
 * `RouterView` into every screen, and then down three or four more levels. Any
 * component that needs the viewer reads it here.
 *
 * **On storing the token.** With a real backend this belongs in an httpOnly,
 * `SameSite=Lax` cookie that JavaScript cannot read. The demo has no server to
 * set one, so the token lives in memory with a `sessionStorage` mirror to
 * survive a reload. That is deliberately weaker than a cookie but stronger
 * than the original's `localStorage.setItem("jwt", ...)`: `sessionStorage` is
 * scoped to the tab and cleared when it closes, so a shared machine does not
 * keep a usable token around indefinitely.
 */

export type AuthStatus = "unknown" | "authenticated" | "anonymous";

interface AuthState {
  token: string | null;
  userID: number | null;
  /** `unknown` until the stored token has been checked against the server. */
  status: AuthStatus;
  signedIn: (input: { token: string; userID: number }) => void;
  signedOut: () => void;
  /** Record the outcome of verifying a restored token. */
  confirmed: (userID: number) => void;
  rejected: () => void;
}

/**
 * `sessionStorage` is unavailable in a server render and can throw in a private
 * window or with site data blocked, so every access is guarded and failure
 * degrades to "not signed in" rather than crashing the tree.
 */
const tabStorage = createJSONStorage(() => {
  const noop: Storage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
    key: () => null,
    length: 0,
  };
  try {
    if (typeof window === "undefined") return noop;
    // Touch it: access alone throws when site data is blocked.
    window.sessionStorage.getItem("__probe__");
    return window.sessionStorage;
  } catch {
    return noop;
  }
});

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      userID: null,
      status: "unknown",

      signedIn: ({ token, userID }) =>
        set({ token, userID, status: "authenticated" }),

      signedOut: () => set({ token: null, userID: null, status: "anonymous" }),

      confirmed: (userID) => set({ userID, status: "authenticated" }),

      rejected: () => set({ token: null, userID: null, status: "anonymous" }),
    }),
    {
      name: "bunnycode.auth",
      storage: tabStorage,
      // Only the token is persisted. `status` is always re-derived by
      // verifying that token, so a stale "authenticated" can never be
      // restored from storage and used to render a signed-in UI.
      partialize: (state) => ({ token: state.token }),
    },
  ),
);

/** Read the token outside React (query functions, the socket factory). */
export function currentToken(): string | null {
  return useAuthStore.getState().token;
}

/**
 * Resolve once the persisted token has been read back from storage.
 *
 * `persist` rehydrates *after* the first render, so anything that inspects the
 * token on mount sees `null` and would wrongly conclude nobody is signed in —
 * then never look again. Awaiting this closes that race.
 */
export function waitForAuthHydration(): Promise<void> {
  if (useAuthStore.persist.hasHydrated()) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const unsubscribe = useAuthStore.persist.onFinishHydration(() => {
      unsubscribe();
      resolve();
    });
  });
}
