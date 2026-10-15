"use client";

import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { type EditRecord } from "@/core/replay/types";
import { useSession } from "@/features/auth";
import { projectKeys } from "@/features/projects";
import { type ProjectDetail, type ProjectVersion } from "@/lib/schemas";
import {
  fetchFile,
  fetchRecording,
  saveSession,
  workspaceKeys,
} from "../api/workspace-api";

/**
 * Loads everything one version of a project needs.
 *
 * A version needs up to three things from two places: the file's current
 * content and — once the version has been recorded — the edit log and the
 * content it started from. `useQueries` fetches them in parallel and reports
 * one combined state, so the screen has a single "still loading" condition
 * rather than three interleaved ones, and the editor never jumps.
 */
export function useVersionContent(
  project: ProjectDetail | undefined,
  version: ProjectVersion | undefined,
) {
  const { token } = useSession();
  const fileUrl = version?.file?.url ?? null;
  const hasRecording = (version?.recording ?? null) !== null;
  const projectName = project?.name ?? "";
  const versionNumber = version?.number ?? 0;

  const results = useQueries({
    queries: [
      {
        queryKey: workspaceKeys.file(fileUrl ?? ""),
        queryFn: ({ signal }: { signal: AbortSignal }) =>
          fetchFile(fileUrl ?? "", signal),
        enabled: fileUrl !== null,
        staleTime: 60_000,
      },
      {
        queryKey: workspaceKeys.recording(projectName, versionNumber),
        queryFn: ({ signal }: { signal: AbortSignal }) =>
          fetchRecording({ projectName, versionNumber, token, signal }),
        enabled: hasRecording,
        staleTime: Infinity,
      },
    ],
  });

  const [content, recording] = results;
  const baseUrl = recording?.data?.baseFileUrl ?? null;

  const [base] = useQueries({
    queries: [
      {
        queryKey: workspaceKeys.file(baseUrl ?? ""),
        queryFn: ({ signal }: { signal: AbortSignal }) =>
          fetchFile(baseUrl ?? "", signal),
        enabled: baseUrl !== null,
        staleTime: Infinity,
      },
    ],
  });

  const waiting = (query: { data?: unknown; isError: boolean } | undefined) =>
    query !== undefined && query.data === undefined && !query.isError;
  const all = [content, recording, base];

  return {
    /** The file as it stands now. */
    content: content?.data ?? "",
    /** The file as it was before the recorded session; replay starts here. */
    baseText: base?.data ?? "",
    records: recording?.data?.records ?? [],
    isPending:
      (fileUrl !== null && waiting(content)) ||
      (hasRecording && (waiting(recording) || waiting(base))),
    isError: all.some((query) => query?.isError === true),
    error: all.find((query) => query?.error)?.error ?? null,
  };
}

/**
 * Saves a session — the edit log and the file it produced — in one request.
 *
 * One request is the point: the server stores both or neither, so a file can
 * never be saved without the log that explains it. Saving records the version,
 * which makes it replay-only from then on.
 */
export function useSaveSession(input: {
  projectName: string;
  versionNumber: number;
}) {
  const { token } = useSession();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (session: {
      records: readonly EditRecord[];
      content: string;
    }) =>
      saveSession({
        projectName: input.projectName,
        versionNumber: input.versionNumber,
        records: session.records,
        content: session.content,
        token,
      }),
    onSuccess: () => {
      // The version now has a recording and a new file revision.
      void queryClient.invalidateQueries({
        queryKey: projectKeys.detail(input.projectName),
      });
      void queryClient.invalidateQueries({
        queryKey: workspaceKeys.recording(
          input.projectName,
          input.versionNumber,
        ),
      });
      void queryClient.invalidateQueries({ queryKey: ["workspace", "file"] });
    },
  });
}
