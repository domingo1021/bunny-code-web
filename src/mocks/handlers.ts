import { http, HttpResponse, type RequestHandler } from "msw";
import {
  BATTLE_STATUSES,
  QUESTION_LEVELS,
  type BattleStatus,
  type QuestionLevel,
} from "@/core/realtime/protocol";
import { EDIT_ACTIONS, type EditRecord } from "@/core/replay/types";
import {
  addVersion,
  battleById,
  battleByName,
  CDN,
  createProject,
  createUser,
  db,
  fileContent,
  issueToken,
  projectByName,
  recordingFor,
  saveRecording,
  userByEmail,
  userById,
  userForToken,
  type DbBattle,
  type DbProject,
  type DbUser,
  type DbVersion,
} from "./db";

/**
 * The Bunny Code API v2, re-implemented in the browser.
 *
 * These handlers run in four places from one definition — `next dev`, Vitest,
 * Playwright, and the deployed demo's service worker — so there is no second
 * implementation to drift. Paths, bodies, status codes and problem details
 * follow the real API (`api-surface.md` in the backend repo), so the app
 * cannot tell this from the server; pointing `NEXT_PUBLIC_API_URL` at a real
 * backend switches over without a code change.
 *
 * `/executions` is the one endpoint not reimplemented: without a backend the
 * workspace runs code in a Web Worker instead.
 */

const BASE = "/api/v2";
const DEFAULT_PAGE_SIZE = 6;
const RESOURCE_NAME = /^[a-zA-Z0-9_\-.]{1,20}$/;
const VERSION_NAME = /^[^\s\p{Cc}](?:[^\p{Cc}]{0,28}[^\s\p{Cc}])?$/u;
const PASSWORD = /^(?=.*[a-z])(?=.*\d).{6,30}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

/** An RFC 9457 problem detail, as the server sends every failure. */
export interface Problem {
  type: string;
  title: string;
  status: number;
  detail: string;
  code: string;
}

const TITLES: Readonly<Record<number, string>> = {
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  409: "Conflict",
};

function problem(status: number, code: string, detail: string) {
  return HttpResponse.json<Problem>(
    {
      type: "about:blank",
      title: TITLES[status] ?? "Error",
      status,
      detail,
      code,
    },
    { status, headers: { "Content-Type": "application/problem+json" } },
  );
}

const invalid = (detail: string) => problem(400, "request.invalid", detail);
const signInRequired = () =>
  problem(401, "auth.required", "Please log in to continue.");

function noContent() {
  return new HttpResponse(null, { status: 204 });
}

// ---------------------------------------------------------------------------
// Request helpers
// ---------------------------------------------------------------------------

function viewerOf(request: Request): DbUser | undefined {
  const header = request.headers.get("Authorization");
  if (header === null) return undefined;
  const [scheme, token] = header.split(" ");
  return scheme === "Bearer" && token !== undefined
    ? userForToken(token)
    : undefined;
}

async function bodyOf(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = (await request.json()) as unknown;
    return body !== null && typeof body === "object"
      ? (body as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function paging(url: URL): { page: number; size: number } {
  const page = Number(url.searchParams.get("page") ?? 0);
  const size = Number(url.searchParams.get("size") ?? DEFAULT_PAGE_SIZE);
  return {
    page: Number.isInteger(page) && page >= 0 ? page : 0,
    size:
      Number.isInteger(size) && size >= 1 && size <= 50
        ? size
        : DEFAULT_PAGE_SIZE,
  };
}

function pageOf<T, R>(
  items: readonly T[],
  { page, size }: { page: number; size: number },
  map: (item: T) => R,
) {
  return {
    content: items.slice(page * size, page * size + size).map(map),
    page,
    size,
    totalElements: items.length,
    totalPages: Math.ceil(items.length / size),
  };
}

function contains(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

function userSummary(id: number) {
  const user = userById(id);
  return {
    id,
    name: user?.userName ?? "unknown",
    pictureUrl: user?.picture ?? "",
  };
}

function userProfile(user: DbUser, includeEmail: boolean) {
  return {
    id: user.userID,
    name: user.userName,
    ...(includeEmail ? { email: user.email } : {}),
    pictureUrl: user.picture,
    profile: user.profile,
    level: user.userLevel,
  };
}

function authResult(user: DbUser) {
  return {
    accessToken: issueToken(user.userID),
    tokenType: "Bearer",
    expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    user: userProfile(user, true),
  };
}

function visibility(project: DbProject) {
  return project.isPublic === 1 ? "PUBLIC" : "PRIVATE";
}

function projectSummary(project: DbProject) {
  return {
    id: project.projectID,
    name: project.projectName,
    description: project.projectDescription,
    visibility: visibility(project),
    watchCount: project.watchCount,
    starCount: project.starCount,
    createdAt: project.createdAt,
    latestVersionName: project.version.at(-1)?.versionName ?? null,
    owner: userSummary(project.userID),
  };
}

function recordingSummary(version: DbVersion) {
  const record = version.records[0];
  if (record === undefined) return null;
  return {
    id: record.recordID,
    baseFileUrl: record.baseURL,
    startedAt: nanosToIso(record.startTime),
    endedAt: nanosToIso(record.endTime),
  };
}

function versionView(version: DbVersion) {
  const file = version.files[0];
  return {
    id: version.versionID,
    name: version.versionName,
    number: version.versionNumber,
    file:
      file === undefined
        ? null
        : {
            id: file.fileID,
            name: file.fileName,
            url: file.fileURL,
            revision: String(version.records.length + 1),
          },
    recording: recordingSummary(version),
  };
}

function projectDetail(project: DbProject, viewer: DbUser | undefined) {
  return {
    ...projectSummary(project),
    starredByViewer:
      viewer !== undefined && project.starredBy.has(viewer.userID),
    versions: project.version.map(versionView),
  };
}

function battleSummary(battle: DbBattle) {
  return {
    id: battle.battleID,
    name: battle.battleName,
    status: battle.status,
    watchCount: battle.watchCount,
    questionName: battle.questionName,
    questionLevel: battle.level,
    players: [
      userSummary(battle.firstUserID),
      userSummary(battle.secondUserID),
    ],
    winnerId: battle.winnerID,
  };
}

function battleDetail(battle: DbBattle) {
  const finished = battle.status === "FINISHED" && battle.winnerID !== null;
  return {
    id: battle.battleID,
    name: battle.battleName,
    status: battle.status,
    watchCount: battle.watchCount,
    question: {
      name: battle.questionName,
      level: battle.level,
      descriptionUrl: `${CDN}/questions/${battle.questionName}.md`,
      starterCodeUrl: `${CDN}/questions/${battle.questionName}-base.js`,
    },
    players: [
      userSummary(battle.firstUserID),
      userSummary(battle.secondUserID),
    ],
    winner:
      finished && battle.winnerID !== null
        ? userSummary(battle.winnerID)
        : null,
    winnerCodeUrl: finished
      ? `${CDN}/battles/${battle.battleID}-winner.js`
      : null,
  };
}

const NANOS_PER_MILLI = BigInt(1_000_000);

function nanosToMillis(nanos: string): number {
  try {
    return Number(BigInt(nanos) / NANOS_PER_MILLI);
  } catch {
    return 0;
  }
}

function nanosToIso(nanos: string): string {
  return new Date(nanosToMillis(nanos)).toISOString();
}

// ---------------------------------------------------------------------------
// Access
// ---------------------------------------------------------------------------

/** A project as this viewer may see it: private ones exist only for their owner. */
function visibleProject(name: string, viewer: DbUser | undefined) {
  const project = projectByName(name);
  if (
    project === undefined ||
    (project.isPublic !== 1 && project.userID !== viewer?.userID)
  ) {
    return undefined;
  }
  return project;
}

const projectNotFound = () =>
  problem(404, "project.not-found", "That project does not exist.");

function versionOf(project: DbProject, number: number) {
  return project.version.find((v) => v.versionNumber === number);
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export const handlers: RequestHandler[] = [
  // Identity -----------------------------------------------------------------

  http.post(`${BASE}/auth/sign-up`, async ({ request }) => {
    const body = await bodyOf(request);
    const name = text(body.name).trim();
    const email = text(body.email).trim();
    const password = text(body.password);

    if (name === "" || name.length > 30) {
      return invalid("User names can be 1 to 30 characters.");
    }
    if (!EMAIL.test(email))
      return invalid("Please enter a valid e-mail address.");
    if (!PASSWORD.test(password)) {
      return invalid(
        "Passwords need 6 to 30 characters, including a lowercase letter and a digit.",
      );
    }
    if (userByEmail(email) !== undefined) {
      return problem(
        409,
        "user.email-taken",
        "That e-mail address is already registered.",
      );
    }
    if (db().users.some((user) => user.userName === name)) {
      return problem(
        409,
        "user.name-taken",
        "That user name is already taken.",
      );
    }

    const user = createUser({ userName: name, email, password });
    return HttpResponse.json(authResult(user), { status: 201 });
  }),

  http.post(`${BASE}/auth/sign-in`, async ({ request }) => {
    const body = await bodyOf(request);
    const user = userByEmail(text(body.email));
    if (user === undefined || user.password !== text(body.password)) {
      return problem(
        401,
        "auth.invalid-credentials",
        "The e-mail address or password is incorrect.",
      );
    }
    return HttpResponse.json(authResult(user));
  }),

  http.get(`${BASE}/users/me`, ({ request }) => {
    const viewer = viewerOf(request);
    if (viewer === undefined) return signInRequired();
    return HttpResponse.json(userProfile(viewer, true));
  }),

  http.get(`${BASE}/users/:userId`, ({ params, request }) => {
    const user = userById(Number(params.userId));
    if (user === undefined) {
      return problem(404, "user.not-found", "That user does not exist.");
    }
    const isSelf = viewerOf(request)?.userID === user.userID;
    return HttpResponse.json(userProfile(user, isSelf));
  }),

  http.get(`${BASE}/users/:userId/projects`, ({ params, request }) => {
    const url = new URL(request.url);
    const ownerID = Number(params.userId);
    const isOwner = viewerOf(request)?.userID === ownerID;
    const keyword = url.searchParams.get("keyword") ?? "";

    const projects = db()
      .projects.filter(
        (project) =>
          project.userID === ownerID &&
          (isOwner || project.isPublic === 1) &&
          (keyword === "" ||
            contains(project.projectName, keyword) ||
            contains(project.projectDescription, keyword)),
      )
      .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt));

    return HttpResponse.json(pageOf(projects, paging(url), projectSummary));
  }),

  // Projects -----------------------------------------------------------------

  http.get(`${BASE}/projects`, ({ request }) => {
    const url = new URL(request.url);
    const keyword = url.searchParams.get("keyword") ?? "";
    const sort = url.searchParams.get("sort") ?? "RECENT";

    const matches = db().projects.filter(
      (project) =>
        project.isPublic === 1 &&
        (keyword === "" ||
          contains(project.projectName, keyword) ||
          contains(project.projectDescription, keyword) ||
          contains(userById(project.userID)?.userName ?? "", keyword)),
    );
    const sorted = matches.toSorted((a, b) =>
      sort === "STARRED"
        ? b.starCount - a.starCount
        : sort === "POPULAR"
          ? b.watchCount - a.watchCount
          : b.createdAt.localeCompare(a.createdAt),
    );

    return HttpResponse.json(pageOf(sorted, paging(url), projectSummary));
  }),

  http.post(`${BASE}/projects`, async ({ request }) => {
    const viewer = viewerOf(request);
    if (viewer === undefined) return signInRequired();

    const body = await bodyOf(request);
    const name = text(body.name);
    const description = text(body.description);
    const versionName = text(body.versionName);
    const fileName = text(body.fileName);

    if (!RESOURCE_NAME.test(name) || !RESOURCE_NAME.test(fileName)) {
      return invalid(
        "Names may only use letters, digits, '_', '-' or '.', up to 20 characters.",
      );
    }
    if (description.length > 50) {
      return invalid("Descriptions can be up to 50 characters.");
    }
    if (!VERSION_NAME.test(versionName)) {
      return invalid("Version names can be 1 to 30 characters.");
    }
    if (projectByName(name) !== undefined) {
      return problem(
        409,
        "project.name-taken",
        "That project name is already taken.",
      );
    }

    const project = createProject({
      userID: viewer.userID,
      projectName: name,
      projectDescription: description,
      isPublic: body.visibility === "PRIVATE" ? 0 : 1,
      versionName,
      fileName,
    });
    return HttpResponse.json(
      { id: project.projectID, name: project.projectName },
      { status: 201 },
    );
  }),

  http.get(`${BASE}/projects/:projectName`, ({ params, request }) => {
    const viewer = viewerOf(request);
    const project = visibleProject(String(params.projectName), viewer);
    if (project === undefined) return projectNotFound();
    return HttpResponse.json(projectDetail(project, viewer));
  }),

  http.post(
    `${BASE}/projects/:projectName/versions`,
    async ({ params, request }) => {
      const viewer = viewerOf(request);
      if (viewer === undefined) return signInRequired();
      const project = visibleProject(String(params.projectName), viewer);
      if (project === undefined) return projectNotFound();
      if (project.userID !== viewer.userID) {
        return problem(403, "project.not-owner", "Only the owner can do that.");
      }

      const body = await bodyOf(request);
      const versionName = text(body.versionName);
      const fileName = text(body.fileName);
      if (!VERSION_NAME.test(versionName)) {
        return invalid("Version names can be 1 to 30 characters.");
      }
      if (!RESOURCE_NAME.test(fileName)) {
        return invalid(
          "Names may only use letters, digits, '_', '-' or '.', up to 20 characters.",
        );
      }
      if (project.version.some((v) => v.versionName === versionName)) {
        return problem(
          409,
          "version.name-taken",
          "That version name is already used in this project.",
        );
      }

      const version = addVersion(project, versionName, fileName);
      return HttpResponse.json(versionView(version), { status: 201 });
    },
  ),

  http.post(`${BASE}/projects/:projectName/views`, ({ params, request }) => {
    const viewer = viewerOf(request);
    const project = visibleProject(String(params.projectName), viewer);
    if (project === undefined) return projectNotFound();
    // The owner's own visits are not views.
    if (project.userID !== viewer?.userID) project.watchCount += 1;
    return noContent();
  }),

  http.put(`${BASE}/projects/:projectName/star`, ({ params, request }) => {
    const viewer = viewerOf(request);
    if (viewer === undefined) return signInRequired();
    const project = visibleProject(String(params.projectName), viewer);
    if (project === undefined) return projectNotFound();
    if (!project.starredBy.has(viewer.userID)) {
      project.starredBy.add(viewer.userID);
      project.starCount += 1;
    }
    return noContent();
  }),

  http.delete(`${BASE}/projects/:projectName/star`, ({ params, request }) => {
    const viewer = viewerOf(request);
    if (viewer === undefined) return signInRequired();
    const project = visibleProject(String(params.projectName), viewer);
    if (project === undefined) return projectNotFound();
    if (project.starredBy.delete(viewer.userID)) project.starCount -= 1;
    return noContent();
  }),

  http.get(`${BASE}/stats/projects`, () => {
    const projects = db().projects.filter((p) => p.isPublic === 1);
    return HttpResponse.json({
      projects: projects.length,
      recordings: projects
        .flatMap((p) => p.version)
        .filter((v) => v.records.length > 0).length,
    });
  }),

  // Recordings ---------------------------------------------------------------

  http.get(
    `${BASE}/projects/:projectName/versions/:versionNumber/recording`,
    ({ params, request }) => {
      const project = visibleProject(
        String(params.projectName),
        viewerOf(request),
      );
      if (project === undefined) return projectNotFound();
      const version = versionOf(project, Number(params.versionNumber));
      const record = version?.records[0];
      if (version === undefined || record === undefined) {
        return problem(
          404,
          "recording.not-found",
          "This version has no recording yet.",
        );
      }

      return HttpResponse.json({
        id: record.recordID,
        baseFileUrl: record.baseURL,
        startedAt: nanosToIso(record.startTime),
        endedAt: nanosToIso(record.endTime),
        format: "V2",
        events: recordingFor(version.versionID, record.fileID).map((r) => ({
          action: r.action,
          line: r.line,
          index: r.index,
          code: r.code,
          timestamp: nanosToMillis(r.timestamp),
        })),
      });
    },
  ),

  http.post(
    `${BASE}/projects/:projectName/versions/:versionNumber/recording`,
    async ({ params, request }) => {
      const viewer = viewerOf(request);
      if (viewer === undefined) return signInRequired();
      const project = visibleProject(String(params.projectName), viewer);
      if (project === undefined) return projectNotFound();
      if (project.userID !== viewer.userID) {
        return problem(403, "project.not-owner", "Only the owner can do that.");
      }
      const version = versionOf(project, Number(params.versionNumber));
      if (version === undefined) {
        return problem(
          404,
          "version.not-found",
          "That version does not exist.",
        );
      }
      if (version.records.length > 0) {
        return problem(
          409,
          "recording.exists",
          "This version has already been recorded.",
        );
      }

      const body = await bodyOf(request);
      const events = Array.isArray(body.events) ? body.events : [];
      if (events.length === 0) {
        return invalid("There is nothing to save yet — write some code first.");
      }
      if (typeof body.code !== "string") return invalid("The code is missing.");

      const records = events.map(toRecord);
      if (records.includes(null)) return invalid("The recording is malformed.");

      const saved = saveRecording({
        version,
        records: records as EditRecord[],
        content: body.code,
      });
      if (saved === undefined) {
        return problem(
          409,
          "version.no-file",
          "This version has no file to record.",
        );
      }
      return HttpResponse.json(
        {
          recording: recordingSummary(version),
          file: versionView(version).file,
        },
        { status: 201 },
      );
    },
  ),

  // Battles ------------------------------------------------------------------

  http.get(`${BASE}/battles`, ({ request }) => {
    const url = new URL(request.url);
    const statuses = url.searchParams
      .getAll("status")
      .filter((s): s is BattleStatus =>
        (BATTLE_STATUSES as readonly string[]).includes(s),
      );
    const wanted: readonly BattleStatus[] =
      statuses.length > 0 ? statuses : ["WAITING", "RUNNING", "FINISHED"];
    const levelParam = url.searchParams.get("level") ?? "";
    const level = (QUESTION_LEVELS as readonly string[]).includes(levelParam)
      ? (levelParam as QuestionLevel)
      : null;
    const keyword = url.searchParams.get("keyword") ?? "";

    const matches = db()
      .battles.filter(
        (battle) =>
          wanted.includes(battle.status) &&
          (level === null || battle.level === level) &&
          (keyword === "" || contains(battle.battleName, keyword)),
      )
      // As on the server: most watched first, then newest.
      .toSorted(
        (a, b) => b.watchCount - a.watchCount || b.battleID - a.battleID,
      );

    return HttpResponse.json(pageOf(matches, paging(url), battleSummary));
  }),

  http.get(`${BASE}/battles/name-availability`, ({ request }) => {
    const name = new URL(request.url).searchParams.get("name") ?? "";
    if (!RESOURCE_NAME.test(name)) {
      return invalid(
        "Names may only use letters, digits, '_', '-' or '.', up to 20 characters.",
      );
    }
    return HttpResponse.json({
      name,
      available: battleByName(name) === undefined,
    });
  }),

  http.get(`${BASE}/battles/:battleId`, ({ params }) => {
    const battle = battleById(Number(params.battleId));
    if (battle === undefined) {
      return problem(404, "battle.not-found", "That battle does not exist.");
    }
    return HttpResponse.json(battleDetail(battle));
  }),

  http.get(`${BASE}/stats/battles`, () =>
    HttpResponse.json({
      battles: db().battles.filter((b) => b.status !== "TERMINATED").length,
    }),
  ),

  // Object storage, standing in for S3 -----------------------------------------

  http.get(`${CDN}/*`, ({ request }) => {
    const content = fileContent(request.url);
    if (content === undefined) {
      return HttpResponse.text("Not found", { status: 404 });
    }
    return HttpResponse.text(content, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }),
];

/** An event as posted by the client, back into the replay engine's record. */
function toRecord(event: unknown): EditRecord | null {
  if (event === null || typeof event !== "object") return null;
  const { action, line, index, code, timestamp } = event as Record<
    string,
    unknown
  >;
  if (
    typeof action !== "string" ||
    !(EDIT_ACTIONS as readonly string[]).includes(action) ||
    typeof line !== "number" ||
    typeof index !== "number" ||
    typeof code !== "string" ||
    typeof timestamp !== "number"
  ) {
    return null;
  }
  return {
    action: action as EditRecord["action"],
    line,
    index,
    code,
    timestamp: (BigInt(Math.trunc(timestamp)) * NANOS_PER_MILLI).toString(),
  };
}
