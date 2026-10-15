import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { applyEdits } from "@/core/replay/applyEdit";
import { docFromText, docToText } from "@/core/replay/types";
import { ApiError } from "@/lib/api-client";
import { createProject, db, issueToken, resetDatabase } from "@/mocks/db";
import { server } from "@/mocks/server";
import { typeSource } from "@/mocks/seed/typeSource";
import {
  fetchFile,
  fetchRecording,
  runCode,
  saveSession,
  workspaceKeys,
} from "./workspace-api";

beforeEach(() => {
  resetDatabase();
});

describe("workspaceKeys", () => {
  it("keys a recording by project and version number", () => {
    expect(workspaceKeys.recording("lru-cache", 2)).toEqual([
      "workspace",
      "recording",
      "lru-cache",
      2,
    ]);
    expect(workspaceKeys.file("https://cdn/x.js")).toEqual([
      "workspace",
      "file",
      "https://cdn/x.js",
    ]);
  });
});

describe("fetchRecording", () => {
  it("returns a version's edit log in the replay engine's units", async () => {
    const recording = await fetchRecording({
      projectName: "debounce-from-scratch",
      versionNumber: 1,
      token: null,
    });

    expect(recording.records.length).toBeGreaterThan(10);
    // Nanosecond epoch strings, converted from the API's milliseconds.
    expect(recording.records[0]?.timestamp).toMatch(/^\d{19}$/);
    expect(typeof recording.records[0]?.line).toBe("number");
  });

  it("errors for a version without a recording", async () => {
    await expect(
      fetchRecording({
        projectName: "debounce-from-scratch",
        versionNumber: 99,
        token: null,
      }),
    ).rejects.toThrow(ApiError);
  });
});

describe("fetchFile", () => {
  it("returns a file's contents", async () => {
    const file = db().projects[0]!.version[0]!.files[0]!;
    await expect(fetchFile(file.fileURL)).resolves.toContain("function");
  });
});

describe("saveSession", () => {
  function freshProject() {
    return createProject({
      userID: 1,
      projectName: "fresh",
      projectDescription: "",
      isPublic: 1,
      versionName: "v1",
      fileName: "index.js",
    });
  }

  /*
   * One request carries the log and the file it produced, so they cannot land
   * separately; and the server, not the client, picks the base to replay from.
   */
  it("saves a session that replays back to the file it produced", async () => {
    freshProject();
    const session = typeSource("const extra = 1;\n", {
      startedAtMs: Date.UTC(2026, 9, 14),
    });

    const saved = await saveSession({
      projectName: "fresh",
      versionNumber: 1,
      records: session.records,
      content: session.text,
      token: issueToken(1),
    });

    const recording = await fetchRecording({
      projectName: "fresh",
      versionNumber: 1,
      token: null,
    });
    const base = await fetchFile(recording.baseFileUrl);
    expect(docToText(applyEdits(docFromText(base), recording.records))).toBe(
      await fetchFile(saved.file.url),
    );
    expect(recording.records).toEqual(session.records);
  });

  it("refuses an empty session", async () => {
    freshProject();
    await expect(
      saveSession({
        projectName: "fresh",
        versionNumber: 1,
        records: [],
        content: "",
        token: issueToken(1),
      }),
    ).rejects.toThrow(/nothing to save/i);
  });

  it("refuses someone else's project", async () => {
    freshProject();
    await expect(
      saveSession({
        projectName: "fresh",
        versionNumber: 1,
        records: typeSource("x").records,
        content: "x",
        token: issueToken(2),
      }),
    ).rejects.toThrow(/only the owner/i);
  });
});

describe("runCode", () => {
  it("posts the program and returns the sandbox's outcome", async () => {
    let body: unknown = null;
    server.use(
      http.post("/api/v2/executions", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ status: "SUCCEEDED", output: "2\n" });
      }),
    );

    await expect(runCode("console.log(1 + 1)", "t")).resolves.toEqual({
      status: "SUCCEEDED",
      output: "2\n",
    });
    expect(body).toEqual({ code: "console.log(1 + 1)" });
  });
});
