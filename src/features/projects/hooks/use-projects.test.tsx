import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/features/auth";
import { db, issueToken, resetDatabase } from "@/mocks/db";
import { Providers } from "@/test/render";
import {
  useCatalogue,
  useCreateProject,
  useCreateVersion,
  useProjectDetail,
  useProjectStats,
  useToggleStar,
  useTopProjects,
  useUserProjects,
} from "./use-projects";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

/** Signed in as a seeded user, using the mock backend's own token issuer. */
function signIn(userID = 1) {
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

describe("useTopProjects", () => {
  it("returns the three most-starred projects", async () => {
    const { result } = renderHook(() => useTopProjects(), {
      wrapper: Providers,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(3);
    const stars = result.current.data?.map((p) => p.starCount) ?? [];
    expect(stars).toEqual([...stars].sort((a, b) => b - a));
  });
});

describe("useCatalogue", () => {
  it("returns a page of public projects", async () => {
    const { result } = renderHook(() => useCatalogue("", 0), {
      wrapper: Providers,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.content).toHaveLength(6);
    expect(result.current.data?.page).toBe(0);
    expect(result.current.data?.totalPages).toBeGreaterThan(1);
  });

  it("searches when given a keyword", async () => {
    const { result } = renderHook(() => useCatalogue("debounce", 0), {
      wrapper: Providers,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.content.map((p) => p.name)).toEqual([
      "debounce-from-scratch",
    ]);
  });

  it("returns an empty page rather than an error when nothing matches", async () => {
    const { result } = renderHook(() => useCatalogue("zzzznothing", 0), {
      wrapper: Providers,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.content).toEqual([]);
  });
});

describe("useProjectDetail", () => {
  it("returns a project with its versions", async () => {
    const { result } = renderHook(
      () => useProjectDetail("debounce-from-scratch"),
      { wrapper: Providers },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.versions).toHaveLength(2);
  });

  it("errors for an unknown project", async () => {
    const { result } = renderHook(() => useProjectDetail("nope"), {
      wrapper: Providers,
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toMatch(/does not exist/i);
  });

  /* A private project exists only for its owner: asking before the token is
     known would answer 404 to them. */
  it("waits for the session before fetching", () => {
    useAuthStore.setState({ token: null, userID: null, status: "unknown" });
    const { result } = renderHook(
      () => useProjectDetail("private-scratchpad"),
      { wrapper: Providers },
    );
    expect(result.current.fetchStatus).toBe("idle");
  });

  it("shows the owner their private project", async () => {
    signIn(1);
    const { result } = renderHook(
      () => useProjectDetail("private-scratchpad"),
      { wrapper: Providers },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.visibility).toBe("PRIVATE");
  });

  it("does not fetch without a project name", () => {
    const { result } = renderHook(() => useProjectDetail(""), {
      wrapper: Providers,
    });
    expect(result.current.fetchStatus).toBe("idle");
  });
});

describe("useUserProjects", () => {
  /* The privacy rule: a private project is listed to its owner and nobody else. */
  it("hides a private project from a visitor", async () => {
    const { result } = renderHook(() => useUserProjects(1, 0, ""), {
      wrapper: Providers,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(
      result.current.data?.content.some((p) => p.name === "private-scratchpad"),
    ).toBe(false);
  });

  it("includes it for the owner", async () => {
    signIn(1);
    const { result } = renderHook(() => useUserProjects(1, 0, ""), {
      wrapper: Providers,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(
      result.current.data?.content.some((p) => p.name === "private-scratchpad"),
    ).toBe(true);
  });

  /* Fetching before the session settles would show the anonymous view — which
     hides private projects — to the owner, then flip. */
  it("waits for the session before fetching", () => {
    useAuthStore.setState({ token: null, userID: null, status: "unknown" });
    const { result } = renderHook(() => useUserProjects(1, 0, ""), {
      wrapper: Providers,
    });
    expect(result.current.fetchStatus).toBe("idle");
  });
});

describe("useCreateProject", () => {
  it("creates a project for the signed-in owner", async () => {
    signIn(1);
    const { result } = renderHook(() => useCreateProject(), {
      wrapper: Providers,
    });

    result.current.mutate({
      name: "fresh-one",
      description: "new",
      visibility: "PUBLIC",
      versionName: "v1",
      fileName: "index.js",
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(db().projects.some((p) => p.projectName === "fresh-one")).toBe(true);
  });

  it("surfaces a duplicate name", async () => {
    signIn(1);
    const { result } = renderHook(() => useCreateProject(), {
      wrapper: Providers,
    });

    result.current.mutate({
      name: "promise-pool",
      description: "",
      visibility: "PUBLIC",
      versionName: "v1",
      fileName: "a.js",
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toMatch(/already taken/i);
  });

  it("refuses without a session", async () => {
    const { result } = renderHook(() => useCreateProject(), {
      wrapper: Providers,
    });

    result.current.mutate({
      name: "no-auth",
      description: "",
      visibility: "PUBLIC",
      versionName: "v1",
      fileName: "a.js",
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useCreateVersion", () => {
  it("adds a version to the owner's project", async () => {
    signIn(1);
    const { result } = renderHook(() => useCreateVersion("promise-pool"), {
      wrapper: Providers,
    });

    result.current.mutate({ versionName: "round two", fileName: "pool.js" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.number).toBe(2);
  });

  it("refuses when the signed-in user is not the owner", async () => {
    signIn(2);
    const { result } = renderHook(() => useCreateVersion("promise-pool"), {
      wrapper: Providers,
    });

    result.current.mutate({ versionName: "nope", fileName: "a.js" });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toMatch(/only the owner/i);
  });
});

describe("useToggleStar", () => {
  it("stars a project and refreshes what the viewer sees", async () => {
    signIn(1);
    const { result } = renderHook(
      () => ({
        star: useToggleStar("lru-cache"),
        detail: useProjectDetail("lru-cache"),
      }),
      { wrapper: Providers },
    );
    await waitFor(() => expect(result.current.detail.isSuccess).toBe(true));
    const before = result.current.detail.data!.starCount;

    result.current.star.mutate(true);

    await waitFor(() =>
      expect(result.current.detail.data?.starredByViewer).toBe(true),
    );
    expect(result.current.detail.data?.starCount).toBe(before + 1);
  });
});

describe("useProjectStats", () => {
  it("returns headline counts", async () => {
    const { result } = renderHook(() => useProjectStats(), {
      wrapper: Providers,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.projects).toBeGreaterThan(0);
  });
});
