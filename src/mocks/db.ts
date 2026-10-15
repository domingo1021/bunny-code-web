import { docFromText } from "@/core/replay/types";
import { type EditRecord } from "@/core/replay/types";
import {
  type BattleStatus,
  type QuestionLevel,
} from "@/core/realtime/protocol";
import { PROJECT_SOURCES } from "./seed/projects";
import { QUESTIONS } from "./seed/questions";
import { typeSource } from "./seed/typeSource";

/**
 * The in-memory backend.
 *
 * `domingoos.store` is gone (NXDOMAIN), so this module *is* the backend: one
 * seeded domain model that the MSW handlers serve in the browser, in Vitest and
 * in the deployed demo, plus the server components read directly. Having a
 * single source of behaviour is what stops "works in tests, broken in the app".
 *
 * It is deliberately a plain mutable object graph rather than anything clever:
 * it only has to be correct and resettable.
 */

export const CDN = "https://cdn.bunnycode.test";

export interface DbUser {
  userID: number;
  userName: string;
  email: string;
  /** Plain text on purpose: a fixture password for a demo with no server. */
  password: string;
  picture: string;
  profile: string | null;
  userLevel: number;
}

export interface DbFile {
  fileID: number;
  fileName: string;
  fileURL: string;
}

/**
 * A saved recording. `baseURL` holds the file as it was *before* the session,
 * which is what replay rewinds to before applying the edit log.
 */
export interface DbSaveRecord {
  recordID: number;
  versionID: number;
  fileID: number;
  baseURL: string;
  startTime: string;
  endTime: string;
}

export interface DbVersion {
  versionID: number;
  versionName: string;
  versionNumber: number;

  files: DbFile[];
  records: DbSaveRecord[];
}

export interface DbProject {
  projectID: number;
  userID: number;
  projectName: string;
  projectDescription: string;
  isPublic: number;
  starCount: number;
  watchCount: number;
  /** ISO instant. */
  createdAt: string;
  /** Who has starred it; a user's star counts once. */
  starredBy: Set<number>;
  version: DbVersion[];
}

export interface DbBattle {
  battleID: number;
  battleName: string;
  level: QuestionLevel;
  questionName: string;
  firstUserID: number;
  secondUserID: number;
  winnerID: number | null;
  status: BattleStatus;
  watchCount: number;
  /** Set once a battle finishes; the winner's submitted code. */
  winnerCode: string | null;
}

export interface Database {
  users: DbUser[];
  projects: DbProject[];
  battles: DbBattle[];
  /** Pseudo-CDN: URL to file contents, standing in for the dead S3 bucket. */
  files: Map<string, string>;
  /** `${versionID}:${fileID}` to that session's edit log. */
  recordings: Map<string, EditRecord[]>;
  nextID: {
    user: number;
    project: number;
    version: number;
    file: number;
    record: number;
    battle: number;
  };
}

const AVATARS = [
  "#7c5cff",
  "#2ec4b6",
  "#ff8c42",
  "#ef476f",
  "#06b6d4",
] as const;

/** A deterministic inline avatar, so the demo needs no image hosting. */
export function avatarFor(name: string, index: number): string {
  const initials = name.slice(0, 2).toUpperCase();
  const background = AVATARS[index % AVATARS.length] ?? AVATARS[0];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${background}"/><text x="32" y="41" font-family="system-ui,sans-serif" font-size="26" font-weight="600" fill="#fff" text-anchor="middle">${initials}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const SEED_USERS: readonly Omit<DbUser, "userID" | "picture">[] = [
  {
    userName: "domingoos",
    email: "domingoos@gmail.com",
    password: "test1234",
    profile: "Building Bunny Code. Interested in editors and replay.",
    userLevel: 7,
  },
  {
    userName: "guest",
    email: "guest@gmail.com",
    password: "test1234",
    profile: "Here for the battles.",
    userLevel: 5,
  },
  {
    userName: "mei",
    email: "mei@example.com",
    password: "test1234",
    profile: "Frontend, mostly. Likes a good abstraction.",
    userLevel: 6,
  },
  {
    userName: "arjun",
    email: "arjun@example.com",
    password: "test1234",
    profile: null,
    userLevel: 3,
  },
];

/** Build a fresh, fully seeded database. */
export function createDatabase(): Database {
  const db: Database = {
    users: [],
    projects: [],
    battles: [],
    files: new Map(),
    recordings: new Map(),
    nextID: { user: 1, project: 1, version: 1, file: 1, record: 1, battle: 1 },
  };

  for (const [index, seed] of SEED_USERS.entries()) {
    db.users.push({
      ...seed,
      userID: db.nextID.user++,
      picture: avatarFor(seed.userName, index),
    });
  }

  for (const source of PROJECT_SOURCES) {
    const owner = db.users.find((user) => user.email === source.ownerEmail);
    if (owner === undefined) continue;

    const project: DbProject = {
      projectID: db.nextID.project++,
      userID: owner.userID,
      projectName: source.projectName,
      projectDescription: source.projectDescription,
      isPublic: source.isPublic ? 1 : 0,
      starCount: source.starCount,
      watchCount: source.watchCount,
      createdAt: new Date(
        Date.UTC(2026, 8, 1) + db.nextID.project * 86_400_000,
      ).toISOString(),
      starredBy: new Set(),
      version: [],
    };

    // Each version is recorded as a continuation of the previous one, so
    // replaying version 2 starts from version 1's result — the behaviour the
    // original's "compare versions by replaying them" feature relied on.
    let previousText = "";
    let startedAtMs = Date.UTC(2026, 8, 12, 9, 30, 0);

    source.versions.forEach((versionSource, versionIndex) => {
      const session = typeSource(versionSource.source, {
        from: previousText === "" ? undefined : docFromText(previousText),
        startedAtMs,
        seed: project.projectID * 17 + versionIndex,
      });

      const fileID = db.nextID.file++;
      const versionID = db.nextID.version++;
      const baseURL = `${CDN}/files/${fileID}-v${versionIndex}-base.js`;
      const fileURL = `${CDN}/files/${fileID}-v${versionIndex}.js`;

      db.files.set(baseURL, previousText);
      db.files.set(fileURL, session.text);
      db.recordings.set(`${versionID}:${fileID}`, [...session.records]);

      const first = session.records[0];
      const last = session.records[session.records.length - 1];

      project.version.push({
        versionID,
        versionName: versionSource.versionName,
        versionNumber: versionIndex + 1,
        files: [{ fileID, fileName: versionSource.fileName, fileURL }],
        records:
          first === undefined || last === undefined
            ? []
            : [
                {
                  recordID: db.nextID.record++,
                  versionID,
                  fileID,
                  baseURL,
                  startTime: first.timestamp,
                  endTime: last.timestamp,
                },
              ],
      });

      previousText = session.text;
      startedAtMs += 1000 * 60 * 60 * 24 * 3;
    });

    db.projects.push(project);
  }

  for (const question of QUESTIONS) {
    db.files.set(
      `${CDN}/questions/${question.questionName}.md`,
      question.prompt,
    );
    db.files.set(
      `${CDN}/questions/${question.questionName}-base.js`,
      question.baseCode,
    );
  }

  seedBattles(db);

  return db;
}

function seedBattles(db: Database): void {
  const [first, second, third, fourth] = db.users;
  if (
    first === undefined ||
    second === undefined ||
    third === undefined ||
    fourth === undefined
  ) {
    return;
  }

  const finished: readonly {
    name: string;
    question: string;
    level: QuestionLevel;
    a: number;
    b: number;
    winner: number;
    watch: number;
  }[] = [
    {
      name: "friday-night-twosum",
      question: "two-sum",
      level: "EASY",
      a: first.userID,
      b: second.userID,
      winner: first.userID,
      watch: 128,
    },
    {
      name: "bracket-brawl",
      question: "valid-parentheses",
      level: "MEDIUM",
      a: third.userID,
      b: fourth.userID,
      winner: third.userID,
      watch: 76,
    },
    {
      name: "sliding-window-showdown",
      question: "longest-substring",
      level: "HARD",
      a: second.userID,
      b: third.userID,
      winner: third.userID,
      watch: 211,
    },
  ];

  for (const entry of finished) {
    const question = QUESTIONS.find((q) => q.questionName === entry.question);
    const battleID = db.nextID.battle++;
    const winnerURL = `${CDN}/battles/${battleID}-winner.js`;
    db.files.set(winnerURL, question?.solution ?? "");

    db.battles.push({
      battleID,
      battleName: entry.name,
      level: entry.level,
      questionName: entry.question,
      firstUserID: entry.a,
      secondUserID: entry.b,
      winnerID: entry.winner,
      status: "FINISHED",
      watchCount: entry.watch,
      winnerCode: question?.solution ?? null,
    });
  }

  // One battle already in progress, so the lobby's "live" filter and the
  // read-only spectator view both have something to show.
  db.battles.push({
    battleID: db.nextID.battle++,
    battleName: "live-right-now",
    level: "EASY",
    questionName: "two-sum",
    firstUserID: third.userID,
    secondUserID: fourth.userID,
    winnerID: null,
    status: "RUNNING",
    watchCount: 19,
    winnerCode: null,
  });
}

let database = createDatabase();

export function db(): Database {
  return database;
}

/** Restore the seed. Called between tests so they cannot leak into each other. */
export function resetDatabase(): void {
  database = createDatabase();
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function userById(id: number): DbUser | undefined {
  return database.users.find((user) => user.userID === id);
}

export function userByEmail(email: string): DbUser | undefined {
  const needle = email.trim().toLowerCase();
  return database.users.find((user) => user.email.toLowerCase() === needle);
}

export function projectByName(name: string): DbProject | undefined {
  return database.projects.find((project) => project.projectName === name);
}

export function projectById(id: number): DbProject | undefined {
  return database.projects.find((project) => project.projectID === id);
}

export function battleById(id: number): DbBattle | undefined {
  return database.battles.find((battle) => battle.battleID === id);
}

export function battleByName(name: string): DbBattle | undefined {
  return database.battles.find((battle) => battle.battleName === name);
}

export function recordingFor(
  versionID: number,
  fileID: number,
): readonly EditRecord[] {
  return database.recordings.get(`${versionID}:${fileID}`) ?? [];
}

export function fileContent(url: string): string | undefined {
  return database.files.get(url);
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Issue a demo token.
 *
 * Deliberately **stateless**: it encodes the user id rather than being looked
 * up in a session table. A table would live in this in-memory database, which
 * is re-created on every page load — so a token issued before a reload would
 * stop working immediately afterwards, and a signed-in user would appear
 * signed out every time they refreshed.
 *
 * The checksum is shape validation, not security: it stops an arbitrary string
 * from authenticating, and nothing more. A real backend signs a JWT with a
 * secret; this has no secret because it runs entirely in the reader's browser.
 */
export function issueToken(userID: number): string {
  return `demo.${userID}.${checksum(userID)}`;
}

export function userForToken(token: string | null): DbUser | undefined {
  if (token === null) return undefined;
  const match = /^demo\.(\d+)\.([a-z0-9]+)$/.exec(token);
  if (match === null) return undefined;

  const userID = Number(match[1]);
  if (match[2] !== checksum(userID)) return undefined;
  return userById(userID);
}

function checksum(userID: number): string {
  // FNV-1a over a fixed prefix, so the value is stable across page loads.
  let hash = 0x811c9dc5;
  for (const char of `bunnycode.demo.${userID}`) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

export interface CreateUserInput {
  userName: string;
  email: string;
  password: string;
}

export function createUser(input: CreateUserInput): DbUser {
  const user: DbUser = {
    userID: database.nextID.user++,
    userName: input.userName,
    email: input.email,
    password: input.password,
    picture: avatarFor(input.userName, database.users.length),
    profile: null,
    userLevel: 1,
  };
  database.users.push(user);
  return user;
}

export interface CreateProjectInput {
  userID: number;
  projectName: string;
  projectDescription: string;
  isPublic: number;
  versionName: string;
  fileName: string;
}

export function createProject(input: CreateProjectInput): DbProject {
  const project: DbProject = {
    projectID: database.nextID.project++,
    userID: input.userID,
    projectName: input.projectName,
    projectDescription: input.projectDescription,
    isPublic: input.isPublic,
    starCount: 0,
    watchCount: 0,
    createdAt: new Date().toISOString(),
    starredBy: new Set(),
    version: [],
  };
  database.projects.push(project);
  addVersion(project, input.versionName, input.fileName);
  return project;
}

export function addVersion(
  project: DbProject,
  versionName: string,
  fileName: string,
): DbVersion {
  const fileID = database.nextID.file++;
  const versionID = database.nextID.version++;
  const versionNumber = project.version.length + 1;
  const fileURL = `${CDN}/files/${fileID}-v${versionNumber}.js`;

  // A new version starts from the previous version's final content, which is
  // what makes "create a version, then replay the difference" meaningful.
  const previous = project.version[project.version.length - 1];
  const previousFile = previous?.files[0];
  const starting =
    previousFile === undefined
      ? ""
      : (database.files.get(previousFile.fileURL) ?? "");
  database.files.set(fileURL, starting);

  const version: DbVersion = {
    versionID,
    versionName,
    versionNumber,
    files: [{ fileID, fileName, fileURL }],
    records: [],
  };
  project.version.push(version);
  return version;
}

/**
 * Save a version's one recorded session, and the file it produced.
 *
 * As on the server, a version is recorded once and is replay-only after that,
 * and the server — not the client — decides the base the recording replays
 * from: the file as it stood before the session. Letting the client nominate a
 * base URL once meant a first save pointed the base at the file's own URL,
 * which the same save then overwrote, so replay "rewound" to the finished file
 * and appeared to do nothing.
 */
export function saveRecording(input: {
  version: DbVersion;
  records: readonly EditRecord[];
  content: string;
}): DbSaveRecord | undefined {
  const { version } = input;
  const file = version.files[0];
  const first = input.records[0];
  const last = input.records[input.records.length - 1];
  if (file === undefined || first === undefined || last === undefined) {
    return undefined;
  }

  const baseURL = `${CDN}/files/${file.fileID}-base.js`;
  database.files.set(baseURL, database.files.get(file.fileURL) ?? "");
  database.files.set(file.fileURL, input.content);
  database.recordings.set(`${version.versionID}:${file.fileID}`, [
    ...input.records,
  ]);

  const record: DbSaveRecord = {
    recordID: database.nextID.record++,
    versionID: version.versionID,
    fileID: file.fileID,
    baseURL,
    startTime: first.timestamp,
    endTime: last.timestamp,
  };
  version.records = [record];
  return record;
}

export function createBattle(input: {
  battleName: string;
  level: QuestionLevel;
  firstUserID: number;
  secondUserID: number;
}): DbBattle {
  const question =
    QUESTIONS.find((q) => q.level === input.level) ?? QUESTIONS[0];
  const battle: DbBattle = {
    battleID: database.nextID.battle++,
    battleName: input.battleName,
    level: input.level,
    questionName: question?.questionName ?? "two-sum",
    firstUserID: input.firstUserID,
    secondUserID: input.secondUserID,
    winnerID: null,
    status: "WAITING",
    watchCount: 0,
    winnerCode: null,
  };
  database.battles.push(battle);
  return battle;
}

export function finishBattle(
  battleID: number,
  winnerID: number,
  winnerCode: string,
): void {
  const battle = battleById(battleID);
  if (battle === undefined) return;
  battle.status = "FINISHED";
  battle.winnerID = winnerID;
  battle.winnerCode = winnerCode;
  database.files.set(`${CDN}/battles/${battleID}-winner.js`, winnerCode);
}
