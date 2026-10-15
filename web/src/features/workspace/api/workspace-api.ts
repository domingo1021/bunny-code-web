import { type EditRecord } from "@/core/replay/types";
import { apiRequest, fetchText } from "@/lib/api-client";
import {
  executionOutcomeSchema,
  recordingSchema,
  savedRecordingSchema,
  toWireEvent,
} from "@/lib/schemas";

export const workspaceKeys = {
  recording: (projectName: string, versionNumber: number) =>
    ["workspace", "recording", projectName, versionNumber] as const,
  file: (url: string) => ["workspace", "file", url] as const,
};

function recordingPath(projectName: string, versionNumber: number): string {
  return `/projects/${encodeURIComponent(projectName)}/versions/${versionNumber}/recording`;
}

/** A version's recorded session: where it started from, and every edit. */
export function fetchRecording(input: {
  projectName: string;
  versionNumber: number;
  token: string | null;
  signal?: AbortSignal;
}) {
  return apiRequest(recordingPath(input.projectName, input.versionNumber), {
    schema: recordingSchema,
    token: input.token,
    ...(input.signal === undefined ? {} : { signal: input.signal }),
  });
}

export function fetchFile(url: string, signal?: AbortSignal) {
  return fetchText(url, signal);
}

/**
 * Save a session in one request: the edit log and the file it produced.
 *
 * The server stores both and makes the version replay-only. It also chooses
 * the base the recording replays from — the file as it stood before this
 * session — so the client never nominates a URL that is about to change.
 */
export function saveSession(input: {
  projectName: string;
  versionNumber: number;
  records: readonly EditRecord[];
  content: string;
  token: string | null;
}) {
  return apiRequest(recordingPath(input.projectName, input.versionNumber), {
    method: "POST",
    token: input.token,
    schema: savedRecordingSchema,
    body: {
      events: input.records.map(toWireEvent),
      code: input.content,
    },
  });
}

/** Run a program in the server's sandbox (Docker: no network, 0.2 CPU, 20 MB, 10 s). */
export function runCode(code: string, token: string | null) {
  return apiRequest("/executions", {
    method: "POST",
    token,
    schema: executionOutcomeSchema,
    body: { code },
  });
}
