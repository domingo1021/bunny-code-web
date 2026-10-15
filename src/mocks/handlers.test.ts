import { beforeEach, describe, expect, it } from "vitest";
import { applyEdits } from "@/core/replay/applyEdit";
import { docFromText, docToText } from "@/core/replay/types";
import { ApiError, apiRequest, fetchText } from "@/lib/api-client";
import {
  authResultSchema,
  battleDetailSchema,
  battlePageSchema,
  battleStatsSchema,
  nameAvailabilitySchema,
  noContentSchema,
  projectDetailSchema,
  projectPageSchema,
  projectReferenceSchema,
  projectStatsSchema,
  projectVersionSchema,
  recordingSchema,
  savedRecordingSchema,
  toWireEvent,
  userProfileSchema,
} from "@/lib/schemas";
import { db, resetDatabase } from "./db";
import { typeSource } from "./seed/typeSource";

/**
 * Exercises the mock API through the real client and the real schemas, so this
 * covers the whole boundary at once: the handler's behaviour, the v2 contract
 * (bodies, status codes, problem details) and the error mapping. Anything
 * these tests rely on is behaviour the running app genuinely has — and that
 * the real backend has too, since both answer to the same schemas.
 */

beforeEach(() => {
  resetDatabase();
});

async function signIn(email = "domingoos@gmail.com"): Promise<string> {
  const result = await apiRequest("/auth/sign-in", {
    method: "POST",
    body: { email, password: "test1234" },
    schema: authResultSchema,
  });
  return result.accessToken;
}

async function failure(promise: Promise<unknown>): Promise<ApiError> {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ApiError);
  return error as ApiError;
}

function newProject(token: string, overrides: Record<string, unknown> = {}) {
  return apiRequest("/projects", {
    method: "POST",
    token,
    body: {
      name: "fresh",
      description: "brand new",
      visibility: "PUBLIC",
      versionName: "version 1",
      fileName: "index.js",
      ...overrides,
    },
    schema: projectReferenceSchema,
  });
}

describe("identity", () => {
  it("signs in with the demo credentials and returns a usable token", async () => {
    const result = await apiRequest("/auth/sign-in", {
      method: "POST",
      body: { email: "domingoos@gmail.com", password: "test1234" },
      schema: authResultSchema,
    });

    expect(result.tokenType).toBe("Bearer");
    const me = await apiRequest("/users/me", {
      token: result.accessToken,
      schema: userProfileSchema,
    });
    expect(me.id).toBe(result.user.id);
    expect(me.email).toBe("domingoos@gmail.com");
  });

  it("rejects a wrong password with a problem detail worth showing", async () => {
    const error = await failure(
      apiRequest("/auth/sign-in", {
        method: "POST",
        body: { email: "domingoos@gmail.com", password: "nope" },
        schema: authResultSchema,
      }),
    );
    expect(error.status).toBe(401);
    expect(error.code).toBe("auth.invalid-credentials");
    expect(error.message).toMatch(/incorrect/i);
  });

  it("refuses /users/me without a token, or with a bogus one", async () => {
    for (const token of [null, "demo.1.forged"]) {
      const error = await failure(
        apiRequest("/users/me", { token, schema: userProfileSchema }),
      );
      expect(error.isUnauthorized).toBe(true);
    }
  });

  describe("sign up", () => {
    it("creates an account and signs it in", async () => {
      const result = await apiRequest("/auth/sign-up", {
        method: "POST",
        body: { name: "newbie", email: "new@example.com", password: "abc123" },
        schema: authResultSchema,
      });
      expect(result.user.name).toBe("newbie");
      expect(result.user.level).toBe(1);
      expect(result.user.profile).toBeNull();
    });

    it.each([
      [{ name: "", email: "a@b.co", password: "abc123" }, /user name/i],
      [{ name: "x", email: "not-an-email", password: "abc123" }, /e-mail/i],
      [{ name: "x", email: "a@b.co", password: "short" }, /password/i],
      [{ name: "x", email: "a@b.co", password: "NODIGITS" }, /password/i],
    ])("validates like the server: %j", async (body, message) => {
      const error = await failure(
        apiRequest("/auth/sign-up", {
          method: "POST",
          body,
          schema: authResultSchema,
        }),
      );
      expect(error.status).toBe(400);
      expect(error.code).toBe("request.invalid");
      expect(error.message).toMatch(message);
    });

    it("rejects an e-mail address that is already registered", async () => {
      const error = await failure(
        apiRequest("/auth/sign-up", {
          method: "POST",
          body: {
            name: "someone",
            email: "domingoos@gmail.com",
            password: "abc123",
          },
          schema: authResultSchema,
        }),
      );
      expect(error.status).toBe(409);
      expect(error.code).toBe("user.email-taken");
    });
  });

  it("shows a profile without the e-mail to everyone else", async () => {
    const profile = await apiRequest("/users/1", { schema: userProfileSchema });
    expect(profile.name).toBe(db().users[0]?.userName);
    expect(profile.email).toBeUndefined();
  });

  it("404s for an unknown user", async () => {
    const error = await failure(
      apiRequest("/users/999", { schema: userProfileSchema }),
    );
    expect(error.code).toBe("user.not-found");
  });
});

describe("a user's projects", () => {
  it("includes private projects for the owner only", async () => {
    const token = await signIn();
    await newProject(token, { name: "secret", visibility: "PRIVATE" });
    const ownerID = db().users[0]!.userID;

    const asOwner = await apiRequest(`/users/${ownerID}/projects`, {
      token,
      schema: projectPageSchema,
      searchParams: { size: 50 },
    });
    const asVisitor = await apiRequest(`/users/${ownerID}/projects`, {
      schema: projectPageSchema,
      searchParams: { size: 50 },
    });

    const names = (page: typeof asOwner) => page.content.map((p) => p.name);
    expect(names(asOwner)).toContain("secret");
    expect(names(asVisitor)).not.toContain("secret");
    expect(asVisitor.content.every((p) => p.visibility === "PUBLIC")).toBe(
      true,
    );
  });

  it("filters by keyword", async () => {
    const ownerID = db().users[0]!.userID;
    const page = await apiRequest(`/users/${ownerID}/projects`, {
      schema: projectPageSchema,
      searchParams: { keyword: "zzz-no-match" },
    });
    expect(page.content).toEqual([]);
    expect(page.totalPages).toBe(0);
  });
});

describe("projects", () => {
  it("pages the public catalogue, newest first, with a total", async () => {
    const first = await apiRequest("/projects", {
      schema: projectPageSchema,
      searchParams: { page: 0, size: 2 },
    });
    const second = await apiRequest("/projects", {
      schema: projectPageSchema,
      searchParams: { page: 1, size: 2 },
    });

    expect(first.content).toHaveLength(2);
    expect(first.totalElements).toBeGreaterThan(2);
    expect(first.totalPages).toBe(Math.ceil(first.totalElements / 2));
    expect(second.content[0]?.name).not.toBe(first.content[0]?.name);
    const created = first.content.map((p) => p.createdAt ?? "");
    expect(created).toEqual(created.toSorted().reverse());
    expect(first.content.every((p) => p.visibility === "PUBLIC")).toBe(true);
  });

  it("sorts by stars for the home page's top three", async () => {
    const page = await apiRequest("/projects", {
      schema: projectPageSchema,
      searchParams: { sort: "STARRED", size: 3 },
    });
    const stars = page.content.map((p) => p.starCount);
    expect(stars).toEqual(stars.toSorted((a, b) => b - a));
    expect(page.content[0]?.latestVersionName).not.toBeNull();
  });

  it("searches name, description and owner", async () => {
    const owner = db().users[0]!.userName;
    const page = await apiRequest("/projects", {
      schema: projectPageSchema,
      searchParams: { keyword: owner.toUpperCase(), size: 50 },
    });
    expect(page.content.length).toBeGreaterThan(0);
    expect(page.content.every((p) => p.owner.name === owner)).toBe(true);
  });

  it("returns a project's detail with every version", async () => {
    const detail = await apiRequest("/projects/lru-cache", {
      schema: projectDetailSchema,
    });
    expect(detail.versions.length).toBeGreaterThan(0);
    expect(detail.versions[0]?.file?.url).toMatch(/^https:\/\/cdn/);
    expect(detail.versions[0]?.recording).not.toBeNull();
    expect(detail.starredByViewer).toBe(false);
  });

  it("hides a private project from everyone but its owner", async () => {
    const token = await signIn();
    await newProject(token, { name: "hidden", visibility: "PRIVATE" });

    const error = await failure(
      apiRequest("/projects/hidden", { schema: projectDetailSchema }),
    );
    expect(error.code).toBe("project.not-found");
    await expect(
      apiRequest("/projects/hidden", { token, schema: projectDetailSchema }),
    ).resolves.toMatchObject({ visibility: "PRIVATE" });
  });

  describe("creating", () => {
    it("creates a project with its first version and file", async () => {
      const token = await signIn();
      const created = await newProject(token);
      expect(created.name).toBe("fresh");

      const detail = await apiRequest("/projects/fresh", {
        schema: projectDetailSchema,
      });
      expect(detail.versions).toHaveLength(1);
      expect(detail.versions[0]).toMatchObject({
        name: "version 1",
        number: 1,
        recording: null,
      });
    });

    it("requires a signed-in user", async () => {
      const error = await failure(
        apiRequest("/projects", {
          method: "POST",
          body: {},
          schema: projectReferenceSchema,
        }),
      );
      expect(error.status).toBe(401);
    });

    it.each([
      [{ name: "has space" }],
      [{ name: "x".repeat(21) }],
      [{ description: "x".repeat(51) }],
      [{ versionName: " padded" }],
      [{ fileName: "bad/name.js" }],
    ])("validates like the server: %j", async (overrides) => {
      const token = await signIn();
      const error = await failure(newProject(token, overrides));
      expect(error.code).toBe("request.invalid");
    });

    it("refuses a name that is taken", async () => {
      const token = await signIn();
      const error = await failure(newProject(token, { name: "lru-cache" }));
      expect(error.code).toBe("project.name-taken");
    });
  });

  describe("versions", () => {
    it("adds a version that starts from the previous content", async () => {
      const token = await signIn();
      await newProject(token);
      const version = await apiRequest("/projects/fresh/versions", {
        method: "POST",
        token,
        body: { versionName: "second take", fileName: "index.js" },
        schema: projectVersionSchema,
      });
      expect(version).toMatchObject({ name: "second take", number: 2 });
    });

    it("lets only the owner add one", async () => {
      // lru-cache belongs to guest@gmail.com.
      const token = await signIn("domingoos@gmail.com");
      const error = await failure(
        apiRequest("/projects/lru-cache/versions", {
          method: "POST",
          token,
          body: { versionName: "mine now", fileName: "index.js" },
          schema: projectVersionSchema,
        }),
      );
      expect(error.status).toBe(403);
      expect(error.code).toBe("project.not-owner");
    });
  });

  describe("views and stars", () => {
    it("counts a visitor's view but not the owner's", async () => {
      const before = (
        await apiRequest("/projects/lru-cache", { schema: projectDetailSchema })
      ).watchCount;

      await apiRequest("/projects/lru-cache/views", {
        method: "POST",
        schema: noContentSchema,
      });
      const owner = await signIn("guest@gmail.com");
      await apiRequest("/projects/lru-cache/views", {
        method: "POST",
        token: owner,
        schema: noContentSchema,
      });

      const after = (
        await apiRequest("/projects/lru-cache", { schema: projectDetailSchema })
      ).watchCount;
      expect(after).toBe(before + 1);
    });

    it("stars idempotently and reports it to the viewer", async () => {
      const token = await signIn("domingoos@gmail.com");
      const star = () =>
        apiRequest("/projects/lru-cache/star", {
          method: "PUT",
          token,
          schema: noContentSchema,
        });
      const before = (
        await apiRequest("/projects/lru-cache", { schema: projectDetailSchema })
      ).starCount;

      await star();
      await star();
      const starred = await apiRequest("/projects/lru-cache", {
        token,
        schema: projectDetailSchema,
      });
      expect(starred.starCount).toBe(before + 1);
      expect(starred.starredByViewer).toBe(true);

      await apiRequest("/projects/lru-cache/star", {
        method: "DELETE",
        token,
        schema: noContentSchema,
      });
      const unstarred = await apiRequest("/projects/lru-cache", {
        token,
        schema: projectDetailSchema,
      });
      expect(unstarred.starCount).toBe(before);
      expect(unstarred.starredByViewer).toBe(false);
    });
  });

  it("reports headline statistics", async () => {
    const stats = await apiRequest("/stats/projects", {
      schema: projectStatsSchema,
    });
    expect(stats.projects).toBeGreaterThan(0);
    expect(stats.recordings).toBeGreaterThan(0);
  });
});

describe("recordings", () => {
  it("replays a fetched recording back to the file the API serves", async () => {
    const detail = await apiRequest("/projects/lru-cache", {
      schema: projectDetailSchema,
    });
    const version = detail.versions[0]!;
    const recording = await apiRequest(
      `/projects/lru-cache/versions/${version.number}/recording`,
      { schema: recordingSchema },
    );

    const base = await fetchText(recording.baseFileUrl);
    const final = await fetchText(version.file!.url);
    expect(recording.records.length).toBeGreaterThan(0);
    expect(docToText(applyEdits(docFromText(base), recording.records))).toBe(
      final,
    );
  });

  it("404s for a version that has not been recorded", async () => {
    const token = await signIn();
    await newProject(token);
    const error = await failure(
      apiRequest("/projects/fresh/versions/1/recording", {
        schema: recordingSchema,
      }),
    );
    expect(error.code).toBe("recording.not-found");
  });

  it("saves a session once, after which the version is replay-only", async () => {
    const token = await signIn();
    await newProject(token);
    const session = typeSource("const answer = 42;\n", {
      startedAtMs: Date.UTC(2026, 9, 14),
    });
    const save = () =>
      apiRequest("/projects/fresh/versions/1/recording", {
        method: "POST",
        token,
        body: {
          events: session.records.map(toWireEvent),
          code: session.text,
        },
        schema: savedRecordingSchema,
      });

    const saved = await save();
    expect(await fetchText(saved.file.url)).toBe(session.text);

    const replayed = await apiRequest("/projects/fresh/versions/1/recording", {
      schema: recordingSchema,
    });
    expect(replayed.records).toEqual(session.records);
    expect(await fetchText(replayed.baseFileUrl)).toBe("");

    const again = await failure(save());
    expect(again.code).toBe("recording.exists");
  });

  it("refuses an empty session", async () => {
    const token = await signIn();
    await newProject(token);
    const error = await failure(
      apiRequest("/projects/fresh/versions/1/recording", {
        method: "POST",
        token,
        body: { events: [], code: "" },
        schema: savedRecordingSchema,
      }),
    );
    expect(error.code).toBe("request.invalid");
  });
});

describe("battles", () => {
  it("lists open and finished battles by default, most watched first", async () => {
    const page = await apiRequest("/battles", { schema: battlePageSchema });
    expect(page.content.length).toBeGreaterThan(0);
    expect(page.content.every((b) => b.status !== "TERMINATED")).toBe(true);
    const watched = page.content.map((b) => b.watchCount);
    expect(watched).toEqual(watched.toSorted((a, b) => b - a));
  });

  it.each([
    [{ status: "RUNNING" }, (b: { status: string }) => b.status === "RUNNING"],
    [
      { status: "FINISHED" },
      (b: { status: string }) => b.status === "FINISHED",
    ],
    [
      { level: "HARD" },
      (b: { questionLevel: string }) => b.questionLevel === "HARD",
    ],
  ] as const)("filters by %j", async (searchParams, matches) => {
    const page = await apiRequest("/battles", {
      schema: battlePageSchema,
      searchParams,
    });
    expect(page.content.length).toBeGreaterThan(0);
    expect(page.content.every((b) => matches(b as never))).toBe(true);
  });

  it("checks whether a battle name is free", async () => {
    const taken = await apiRequest("/battles/name-availability", {
      schema: nameAvailabilitySchema,
      searchParams: { name: "bracket-brawl" },
    });
    const free = await apiRequest("/battles/name-availability", {
      schema: nameAvailabilitySchema,
      searchParams: { name: "brand-new" },
    });
    expect(taken.available).toBe(false);
    expect(free.available).toBe(true);
  });

  it("describes a finished battle with its winner and winning code", async () => {
    const page = await apiRequest("/battles", {
      schema: battlePageSchema,
      searchParams: { status: "FINISHED" },
    });
    const id = page.content[0]!.id;
    const detail = await apiRequest(`/battles/${id}`, {
      schema: battleDetailSchema,
    });

    expect(detail.winner).not.toBeNull();
    expect(await fetchText(detail.winnerCodeUrl!)).toMatch(/function/);
    expect(await fetchText(detail.question.descriptionUrl)).toMatch(/^# /);
  });

  it("404s for an unknown battle", async () => {
    const error = await failure(
      apiRequest("/battles/9999", { schema: battleDetailSchema }),
    );
    expect(error.code).toBe("battle.not-found");
  });

  it("counts battles fought", async () => {
    const stats = await apiRequest("/stats/battles", {
      schema: battleStatsSchema,
    });
    expect(stats.battles).toBe(db().battles.length);
  });
});

describe("object storage", () => {
  it("serves a question prompt and its starter code", async () => {
    await expect(
      fetchText("https://cdn.bunnycode.test/questions/two-sum.md"),
    ).resolves.toMatch(/^# Two Sum/);
    await expect(
      fetchText("https://cdn.bunnycode.test/questions/two-sum-base.js"),
    ).resolves.toMatch(/function twoSum/);
  });

  it("404s for an unknown file", async () => {
    const error = await failure(
      fetchText("https://cdn.bunnycode.test/files/missing.js"),
    );
    expect(error.status).toBe(404);
  });
});
