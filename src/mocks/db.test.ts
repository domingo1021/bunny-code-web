import { beforeEach, describe, expect, it } from "vitest";
import { applyEdits } from "@/core/replay/applyEdit";
import { docFromText, docToText } from "@/core/replay/types";
import {
  addVersion,
  avatarFor,
  battleById,
  createBattle,
  createProject,
  createUser,
  db,
  fileContent,
  finishBattle,
  issueToken,
  projectByName,
  recordingFor,
  resetDatabase,
  saveRecording,
  userByEmail,
  userById,
  userForToken,
} from "./db";
import { typeSource } from "./seed/typeSource";

beforeEach(() => {
  resetDatabase();
});

describe("seed integrity", () => {
  it("seeds the two demo accounts the README advertises", () => {
    expect(userByEmail("domingoos@gmail.com")).toBeDefined();
    expect(userByEmail("guest@gmail.com")).toBeDefined();
    expect(userByEmail("domingoos@gmail.com")?.password).toBe("test1234");
  });

  it("gives every user a name, an avatar and a unique id", () => {
    const ids = db().users.map((user) => user.userID);
    expect(new Set(ids).size).toBe(ids.length);
    for (const user of db().users) {
      expect(user.userName).not.toBe("");
      expect(user.picture).toContain("data:image/svg+xml");
    }
  });

  it("seeds public and private projects, each owned by a real user", () => {
    expect(db().projects.length).toBeGreaterThanOrEqual(8);
    expect(db().projects.some((p) => p.isPublic === 0)).toBe(true);
    for (const project of db().projects) {
      expect(userById(project.userID)).toBeDefined();
      expect(project.version.length).toBeGreaterThan(0);
    }
  });

  it("numbers versions from one, without gaps", () => {
    for (const project of db().projects) {
      expect(project.version.map((v) => v.versionNumber)).toEqual(
        project.version.map((_, i) => i + 1),
      );
    }
  });

  it("gives every seeded version a file whose content is served", () => {
    for (const project of db().projects) {
      for (const version of project.version) {
        for (const file of version.files) {
          expect(fileContent(file.fileURL)).toBeDefined();
        }
      }
    }
  });

  it("serves the base content each recording rewinds to", () => {
    for (const project of db().projects) {
      for (const version of project.version) {
        for (const record of version.records) {
          expect(fileContent(record.baseURL)).toBeDefined();
        }
      }
    }
  });

  /*
   * The property the whole demo rests on: every seeded recording, replayed
   * from its own base content, must reproduce the file the workspace serves.
   * If this fails the fixtures are lying and the replay UI will look broken.
   */
  it("every seeded recording replays to the file it belongs to", () => {
    let checked = 0;
    for (const project of db().projects) {
      for (const version of project.version) {
        for (const record of version.records) {
          const base = fileContent(record.baseURL) ?? "";
          const file = version.files.find((f) => f.fileID === record.fileID);
          expect(file).toBeDefined();

          const records = recordingFor(version.versionID, record.fileID);
          expect(records.length).toBeGreaterThan(0);

          const replayed = applyEdits(docFromText(base), records);
          expect(docToText(replayed)).toBe(fileContent(file!.fileURL));
          checked += 1;
        }
      }
    }
    expect(checked).toBeGreaterThanOrEqual(8);
  });

  it("starts a later version from the previous version's result", () => {
    const project = projectByName("debounce-from-scratch");
    expect(project?.version).toHaveLength(2);

    const [first, second] = project!.version;
    const firstFinal = fileContent(first!.files[0]!.fileURL);
    const secondBase = fileContent(second!.records[0]!.baseURL);
    expect(secondBase).toBe(firstFinal);
  });

  it("seeds finished battles with a winner and shared code", () => {
    const finished = db().battles.filter((b) => b.status === "FINISHED");
    expect(finished.length).toBeGreaterThanOrEqual(3);
    for (const battle of finished) {
      expect(battle.winnerID).not.toBeNull();
      expect([battle.firstUserID, battle.secondUserID]).toContain(
        battle.winnerID,
      );
      expect(battle.winnerCode).toBeTruthy();
      expect(
        fileContent(
          `https://cdn.bunnycode.test/battles/${battle.battleID}-winner.js`,
        ),
      ).toBeTruthy();
    }
  });

  it("seeds a battle in progress so spectating has something to show", () => {
    const live = db().battles.filter((b) => b.status === "RUNNING");
    expect(live.length).toBeGreaterThanOrEqual(1);
    expect(live[0]?.winnerID).toBeNull();
  });

  it("gives battles unique ids and real participants", () => {
    const ids = db().battles.map((b) => b.battleID);
    expect(new Set(ids).size).toBe(ids.length);
    for (const battle of db().battles) {
      expect(userById(battle.firstUserID)).toBeDefined();
      expect(userById(battle.secondUserID)).toBeDefined();
      expect(battle.firstUserID).not.toBe(battle.secondUserID);
    }
  });

  it("serves a prompt and starting code for every question", () => {
    for (const name of ["two-sum", "valid-parentheses", "longest-substring"]) {
      expect(
        fileContent(`https://cdn.bunnycode.test/questions/${name}.md`),
      ).toContain("#");
      expect(
        fileContent(`https://cdn.bunnycode.test/questions/${name}-base.js`),
      ).toContain("function");
    }
  });

  it("is deterministic: two fresh databases are identical", () => {
    const before = JSON.stringify(db().projects);
    resetDatabase();
    expect(JSON.stringify(db().projects)).toBe(before);
  });
});

describe("resetDatabase", () => {
  it("discards changes made by a test", () => {
    const countBefore = db().projects.length;
    createProject({
      userID: 1,
      projectName: "throwaway",
      projectDescription: "",
      isPublic: 1,
      versionName: "v1",
      fileName: "a.js",
    });
    expect(db().projects).toHaveLength(countBefore + 1);

    resetDatabase();
    expect(db().projects).toHaveLength(countBefore);
    expect(projectByName("throwaway")).toBeUndefined();
  });
});

describe("tokens", () => {
  it("issues a token that resolves back to its user", () => {
    const token = issueToken(1);
    expect(userForToken(token)?.userID).toBe(1);
  });

  /*
   * Tokens must be stateless. The database is rebuilt on every page load, so a
   * token validated against an in-memory session table would stop working the
   * moment the reader refreshed — which is exactly the bug this replaced.
   */
  it("still resolves after the database is rebuilt", () => {
    const token = issueToken(2);
    resetDatabase();
    expect(userForToken(token)?.userID).toBe(2);
  });

  it("is deterministic for a given user", () => {
    expect(issueToken(1)).toBe(issueToken(1));
    expect(issueToken(1)).not.toBe(issueToken(2));
  });

  it.each([
    ["an absent token", null],
    ["an arbitrary string", "nonsense"],
    ["a token with no checksum", "demo.1."],
    ["a token with a wrong checksum", "demo.1.deadbeef"],
    ["a token for a user that does not exist", "demo.9999.xyz"],
    ["a token with a non-numeric id", "demo.abc.xyz"],
  ])("rejects %s", (_label, token) => {
    expect(userForToken(token)).toBeUndefined();
  });

  it("does not accept another user's checksum", () => {
    const parts = issueToken(1).split(".");
    expect(userForToken(`demo.2.${parts[2]}`)).toBeUndefined();
  });
});

describe("createUser", () => {
  it("adds a user with a fresh id and a level of one", () => {
    const user = createUser({
      userName: "newbie",
      email: "newbie@example.com",
      password: "secret123",
    });
    expect(user.userID).toBeGreaterThan(0);
    expect(user.userLevel).toBe(1);
    expect(userByEmail("newbie@example.com")).toEqual(user);
  });
});

describe("userByEmail", () => {
  it("matches regardless of case or surrounding space", () => {
    expect(userByEmail("  DOMINGOOS@Gmail.com ")?.userName).toBe("domingoos");
  });

  it("returns undefined for an unknown address", () => {
    expect(userByEmail("nobody@example.com")).toBeUndefined();
  });
});

describe("createProject", () => {
  it("creates a project with its first version and an empty file", () => {
    const project = createProject({
      userID: 1,
      projectName: "fresh",
      projectDescription: "brand new",
      isPublic: 1,
      versionName: "v1",
      fileName: "index.js",
    });

    expect(project.version).toHaveLength(1);
    const version = project.version[0]!;
    expect(version.versionNumber).toBe(1);
    expect(version.records).toEqual([]);
    expect(fileContent(version.files[0]!.fileURL)).toBe("");
  });
});

describe("addVersion", () => {
  it("starts the new version from the previous one's content", () => {
    const project = projectByName("promise-pool")!;
    const previousText = fileContent(project.version[0]!.files[0]!.fileURL);

    const version = addVersion(project, "second", "pool.js");

    expect(version.versionNumber).toBe(2);
    expect(fileContent(version.files[0]!.fileURL)).toBe(previousText);
  });

  it("starts from empty when there is no previous version", () => {
    const project = createProject({
      userID: 1,
      projectName: "solo",
      projectDescription: "",
      isPublic: 1,
      versionName: "v1",
      fileName: "a.js",
    });
    project.version = [];
    const version = addVersion(project, "v1", "a.js");
    expect(fileContent(version.files[0]!.fileURL)).toBe("");
  });
});

describe("saveRecording", () => {
  function freshVersion(name: string) {
    const project = createProject({
      userID: 1,
      projectName: name,
      projectDescription: "",
      isPublic: 1,
      versionName: "v1",
      fileName: "a.js",
    });
    return project.version[0]!;
  }

  it("stores the log and the file, and timestamps the save", () => {
    const version = freshVersion("save-test");
    const session = typeSource("const extra = 1;\n");

    const record = saveRecording({
      version,
      records: session.records,
      content: session.text,
    });

    expect(record).toBeDefined();
    expect(record!.startTime).toBe(session.records[0]!.timestamp);
    expect(record!.endTime).toBe(session.records.at(-1)!.timestamp);
    expect(version.records).toEqual([record]);
    expect(fileContent(version.files[0]!.fileURL)).toBe(session.text);
    expect(recordingFor(version.versionID, version.files[0]!.fileID)).toEqual(
      session.records,
    );
  });

  it("returns undefined when there is nothing to save", () => {
    const version = freshVersion("empty-save");
    expect(
      saveRecording({ version, records: [], content: "" }),
    ).toBeUndefined();
    expect(version.records).toEqual([]);
  });
});

describe("battles", () => {
  it("creates a waiting battle with a question at the chosen level", () => {
    const battle = createBattle({
      battleName: "new-battle",
      level: "HARD",
      firstUserID: 1,
      secondUserID: 2,
    });
    expect(battle.status).toBe("WAITING");
    expect(battle.winnerID).toBeNull();
    expect(battle.questionName).toBe("longest-substring");
    expect(battleById(battle.battleID)).toEqual(battle);
  });

  it("finishes a battle and publishes the winner's code", () => {
    const battle = createBattle({
      battleName: "to-finish",
      level: "EASY",
      firstUserID: 1,
      secondUserID: 2,
    });

    finishBattle(battle.battleID, 2, "const answer = 1;");

    expect(battle.status).toBe("FINISHED");
    expect(battle.winnerID).toBe(2);
    expect(
      fileContent(
        `https://cdn.bunnycode.test/battles/${battle.battleID}-winner.js`,
      ),
    ).toBe("const answer = 1;");
  });

  it("ignores finishing an unknown battle", () => {
    expect(() => finishBattle(9_999, 1, "x")).not.toThrow();
  });
});

describe("avatarFor", () => {
  it("builds a deterministic inline SVG with the name's initials", () => {
    expect(avatarFor("mei", 0)).toBe(avatarFor("mei", 0));
    expect(decodeURIComponent(avatarFor("mei", 0))).toContain(">ME<");
  });

  it("cycles colours by index", () => {
    expect(avatarFor("ab", 0)).not.toBe(avatarFor("ab", 1));
  });
});

describe("saveRecording · base snapshots", () => {
  /*
   * Regression: a first save used to point the recording's base at the file's
   * own URL, which the same save then overwrote — so replaying the session
   * rewound to the finished file and looked like it did nothing.
   */
  it("snapshots the file as it was before the save", () => {
    const project = createProject({
      userID: 1,
      projectName: "snapshot-test",
      projectDescription: "",
      isPublic: 1,
      versionName: "v1",
      fileName: "a.js",
    });
    const version = project.version[0]!;
    const file = version.files[0]!;

    const session = typeSource("const written = true;\n");
    const record = saveRecording({
      version,
      records: session.records,
      content: session.text,
    })!;

    // The file was empty before this save, and that is what the base holds.
    expect(fileContent(record.baseURL)).toBe("");
    expect(record.baseURL).not.toBe(file.fileURL);
    expect(fileContent(file.fileURL)).toBe(session.text);
  });

  it("starts a later version's base from the earlier version's result", () => {
    const project = createProject({
      userID: 1,
      projectName: "two-versions",
      projectDescription: "",
      isPublic: 1,
      versionName: "v1",
      fileName: "a.js",
    });
    const first = typeSource("const a = 1;\n");
    saveRecording({
      version: project.version[0]!,
      records: first.records,
      content: first.text,
    });

    const second = addVersion(project, "v2", "a.js");
    const session = typeSource("const b = 2;\n", {
      from: docFromText(first.text),
    });
    const record = saveRecording({
      version: second,
      records: session.records,
      content: session.text,
    })!;

    expect(fileContent(record.baseURL)).toBe(first.text);
  });

  it("replays a saved session back to the file it produced", () => {
    const project = createProject({
      userID: 1,
      projectName: "replayable",
      projectDescription: "",
      isPublic: 1,
      versionName: "v1",
      fileName: "a.js",
    });
    const version = project.version[0]!;
    const file = version.files[0]!;

    const session = typeSource("function go() {\n  return 1;\n}\n");
    const record = saveRecording({
      version,
      records: session.records,
      content: session.text,
    })!;

    const base = fileContent(record.baseURL) ?? "";
    const log = recordingFor(version.versionID, file.fileID);
    expect(docToText(applyEdits(docFromText(base), log))).toBe(
      fileContent(file.fileURL),
    );
  });
});
