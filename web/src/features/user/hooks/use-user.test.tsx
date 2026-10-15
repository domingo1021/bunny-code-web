import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useAuthStore } from "@/features/auth";
import { issueToken, resetDatabase } from "@/mocks/db";
import { Providers } from "@/test/render";
import { useIsOwner, useUserDetail } from "./use-user";

function signIn(userID: number) {
  useAuthStore.setState({
    token: issueToken(userID),
    userID,
    status: "authenticated",
  });
}

beforeEach(() => {
  resetDatabase();
  useAuthStore.setState({ token: null, userID: null, status: "anonymous" });
});

describe("useUserDetail", () => {
  it("returns a user's public profile", async () => {
    const { result } = renderHook(() => useUserDetail(1), {
      wrapper: Providers,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toMatchObject({ id: 1, name: "domingoos" });
    expect(result.current.data?.pictureUrl).toContain("data:image/svg+xml");
    expect(result.current.data?.email).toBeUndefined();
  });

  it("errors for an unknown user", async () => {
    const { result } = renderHook(() => useUserDetail(9_999), {
      wrapper: Providers,
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("does not fetch for a non-numeric id", () => {
    const { result } = renderHook(() => useUserDetail(Number.NaN), {
      wrapper: Providers,
    });
    expect(result.current.fetchStatus).toBe("idle");
  });
});

describe("useIsOwner", () => {
  it("is false for an anonymous viewer", () => {
    const { result } = renderHook(() => useIsOwner(1), { wrapper: Providers });
    expect(result.current).toEqual({ isOwner: false, isPending: false });
  });

  it("recognises the owner of the page", () => {
    signIn(1);
    const { result } = renderHook(() => useIsOwner(1), { wrapper: Providers });
    expect(result.current.isOwner).toBe(true);
  });

  it("is false for another signed-in member", () => {
    signIn(2);
    const { result } = renderHook(() => useIsOwner(1), { wrapper: Providers });
    expect(result.current.isOwner).toBe(false);
  });

  /* Owner-only controls (create project, log out) must never flash for
     someone else while a restored token is still being checked. */
  it("stays false and pending until the session settles", () => {
    useAuthStore.setState({ token: "demo.1.x", userID: 1, status: "unknown" });
    const { result } = renderHook(() => useIsOwner(1), { wrapper: Providers });
    expect(result.current).toEqual({ isOwner: false, isPending: true });
  });
});
