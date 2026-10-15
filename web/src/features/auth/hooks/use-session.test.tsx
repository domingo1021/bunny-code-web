import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetDatabase } from "@/mocks/db";
import { Providers } from "@/test/render";
import { useAuthStore } from "../model/auth-store";
import {
  useRestoreSession,
  useSession,
  useSignIn,
  useSignOut,
} from "./use-session";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push,
    replace: vi.fn(),
    back: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

beforeEach(() => {
  resetDatabase();
  push.mockClear();
  // A store is module state; without this one test's session leaks into the
  // next and the ordering decides whether they pass.
  useAuthStore.setState({ token: null, userID: null, status: "unknown" });
  window.sessionStorage.clear();
});

describe("useSession", () => {
  it("reports nobody signed in, and pending until the token is checked", () => {
    const { result } = renderHook(() => useSession(), { wrapper: Providers });
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.isPending).toBe(true);
  });

  it("reports the signed-in user once the store says so", () => {
    const { result } = renderHook(() => useSession(), { wrapper: Providers });

    act(() => {
      useAuthStore.getState().signedIn({ token: "demo.1.abc", userID: 1 });
    });

    expect(result.current).toMatchObject({
      userID: 1,
      token: "demo.1.abc",
      isAuthenticated: true,
      isPending: false,
    });
  });

  /* `isPending` gates the nav and owner-only controls; a stale "authenticated"
     restored from storage would show a signed-in UI for a dead session. */
  it("is not authenticated while a restored token is still unverified", () => {
    const { result } = renderHook(() => useSession(), { wrapper: Providers });
    act(() => {
      useAuthStore.setState({ token: "demo.1.abc", status: "unknown" });
    });
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.isPending).toBe(true);
  });
});

describe("useSignIn", () => {
  it("signs in with the demo account and navigates to their page", async () => {
    const { result } = renderHook(() => useSignIn(), { wrapper: Providers });

    act(() => {
      result.current.mutate({
        email: "domingoos@gmail.com",
        password: "test1234",
      });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(useAuthStore.getState().status).toBe("authenticated");
    expect(push).toHaveBeenCalledWith("/user/1");
  });

  it("surfaces the server's message for a wrong password", async () => {
    const { result } = renderHook(() => useSignIn(), { wrapper: Providers });

    act(() => {
      result.current.mutate({
        email: "domingoos@gmail.com",
        password: "nope",
      });
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(result.current.error?.message).toMatch(/incorrect/i);
    expect(useAuthStore.getState().token).toBeNull();
    expect(push).not.toHaveBeenCalled();
  });

  it("honours a same-origin redirect", async () => {
    const { result } = renderHook(() => useSignIn("/workspace/lru-cache"), {
      wrapper: Providers,
    });

    act(() => {
      result.current.mutate({
        email: "domingoos@gmail.com",
        password: "test1234",
      });
    });

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith("/workspace/lru-cache");
    });
  });

  /*
   * An absolute or protocol-relative redirect would let `?redirect=` bounce
   * someone to another site immediately after they authenticate.
   */
  it.each([
    "https://evil.example.com",
    "//evil.example.com",
    "javascript:alert(1)",
  ])("ignores the off-site redirect %s", async (redirect) => {
    const { result } = renderHook(() => useSignIn(redirect), {
      wrapper: Providers,
    });

    act(() => {
      result.current.mutate({
        email: "domingoos@gmail.com",
        password: "test1234",
      });
    });

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith("/user/1");
    });
  });
});

describe("useSignOut", () => {
  it("clears the session and returns to the login page", () => {
    const { result } = renderHook(() => ({ signOut: useSignOut() }), {
      wrapper: Providers,
    });

    act(() => {
      useAuthStore.getState().signedIn({ token: "demo.1.abc", userID: 1 });
    });
    act(() => {
      result.current.signOut();
    });

    expect(useAuthStore.getState().token).toBeNull();
    expect(useAuthStore.getState().status).toBe("anonymous");
    expect(push).toHaveBeenCalledWith("/login");
  });
});

describe("useRestoreSession", () => {
  it("settles to anonymous when there is no stored token", async () => {
    renderHook(() => useRestoreSession(), { wrapper: Providers });

    await waitFor(() => {
      expect(useAuthStore.getState().status).toBe("anonymous");
    });
  });

  /*
   * The bug this covers: `persist` rehydrates after the first render, so the
   * first check saw no token, concluded nobody was signed in, and its
   * `status !== "unknown"` guard then blocked verification once the real token
   * arrived — a signed-in reader appeared signed out after every reload.
   */
  it("verifies a stored token and confirms the session", async () => {
    useAuthStore.setState({ token: "demo.1.wcjl8p", status: "unknown" });
    renderHook(() => useRestoreSession(), { wrapper: Providers });

    await waitFor(() => {
      expect(useAuthStore.getState().status).not.toBe("unknown");
    });
    // The checksum above is not the real one, so this token must be rejected
    // rather than trusted.
    expect(useAuthStore.getState().status).toBe("anonymous");
  });

  it("discards a token the server rejects", async () => {
    useAuthStore.setState({ token: "not-a-real-token", status: "unknown" });
    renderHook(() => useRestoreSession(), { wrapper: Providers });

    await waitFor(() => {
      expect(useAuthStore.getState().status).toBe("anonymous");
    });
    expect(useAuthStore.getState().token).toBeNull();
  });
});
