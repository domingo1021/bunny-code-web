import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyEdits } from "@/core/replay/applyEdit";
import { docFromText, docToText } from "@/core/replay/types";
import { useAuthStore } from "@/features/auth";
import { useProjectDetail } from "@/features/projects";
import { createProject, issueToken, resetDatabase } from "@/mocks/db";
import { typeSource } from "@/mocks/seed/typeSource";
import { Providers } from "@/test/render";
import { useSaveSession, useVersionContent } from "./use-workspace";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

beforeEach(() => {
  resetDatabase();
  useAuthStore.setState({ token: null, userID: null, status: "anonymous" });
});

/** The detail, then the content of one of its versions. */
function useVersion(projectName: string, versionNumber: number) {
  const detail = useProjectDetail(projectName);
  const version = detail.data?.versions.find((v) => v.number === versionNumber);
  return { detail, content: useVersionContent(detail.data, version) };
}

describe("useVersionContent", () => {
  it("loads a recorded version's file, base and log, which agree", async () => {
    const { result } = renderHook(
      () => useVersion("debounce-from-scratch", 1),
      { wrapper: Providers },
    );

    await waitFor(() => expect(result.current.detail.isSuccess).toBe(true));
    await waitFor(() => expect(result.current.content.isPending).toBe(false));

    const { content, baseText, records } = result.current.content;
    expect(records.length).toBeGreaterThan(0);
    expect(docToText(applyEdits(docFromText(baseText), records))).toBe(content);
  });

  it("loads only the file for a version that has not been recorded", async () => {
    createProject({
      userID: 1,
      projectName: "blank",
      projectDescription: "",
      isPublic: 1,
      versionName: "v1",
      fileName: "a.js",
    });
    const { result } = renderHook(() => useVersion("blank", 1), {
      wrapper: Providers,
    });

    await waitFor(() => expect(result.current.detail.isSuccess).toBe(true));
    await waitFor(() => expect(result.current.content.isPending).toBe(false));
    expect(result.current.content).toMatchObject({
      content: "",
      baseText: "",
      records: [],
      isError: false,
    });
  });

  it("is pending, not failed, before the project arrives", () => {
    const { result } = renderHook(
      () => useVersionContent(undefined, undefined),
      { wrapper: Providers },
    );
    expect(result.current.isPending).toBe(false);
    expect(result.current.isError).toBe(false);
  });
});

describe("useSaveSession", () => {
  it("records the version, after which it replays the session", async () => {
    useAuthStore.setState({
      token: issueToken(1),
      userID: 1,
      status: "authenticated",
    });
    createProject({
      userID: 1,
      projectName: "to-record",
      projectDescription: "",
      isPublic: 1,
      versionName: "v1",
      fileName: "a.js",
    });
    const session = typeSource("const saved = true;\n");

    const { result } = renderHook(
      () => ({
        save: useSaveSession({ projectName: "to-record", versionNumber: 1 }),
        version: useVersion("to-record", 1),
      }),
      { wrapper: Providers },
    );
    await waitFor(() =>
      expect(result.current.version.detail.isSuccess).toBe(true),
    );
    expect(
      result.current.version.detail.data?.versions[0]?.recording,
    ).toBeNull();

    act(() =>
      result.current.save.mutate({
        records: session.records,
        content: session.text,
      }),
    );

    await waitFor(() => expect(result.current.save.isSuccess).toBe(true));
    await waitFor(() =>
      expect(
        result.current.version.detail.data?.versions[0]?.recording,
      ).not.toBeNull(),
    );
    await waitFor(() =>
      expect(result.current.version.content.records).toHaveLength(
        session.records.length,
      ),
    );
    expect(result.current.version.content.content).toBe(session.text);
  });
});
