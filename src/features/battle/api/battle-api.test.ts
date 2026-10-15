import { beforeEach, describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api-client";
import { db, resetDatabase } from "@/mocks/db";
import {
  battleKeys,
  fetchBattleDetail,
  fetchBattles,
  fetchBattleStats,
  isBattleNameAvailable,
  LOBBY_PAGE_SIZE,
} from "./battle-api";

beforeEach(() => {
  resetDatabase();
});

describe("fetchBattles", () => {
  it("treats an empty filter as any", async () => {
    const page = await fetchBattles({
      status: "",
      level: "",
      keyword: "",
      page: 0,
    });
    expect(page.size).toBe(LOBBY_PAGE_SIZE);
    expect(page.totalElements).toBe(db().battles.length);
  });

  it("filters by status, level and keyword together", async () => {
    const page = await fetchBattles({
      status: "FINISHED",
      level: "MEDIUM",
      keyword: "brawl",
      page: 0,
    });
    expect(page.content.map((b) => b.name)).toEqual(["bracket-brawl"]);
  });
});

describe("isBattleNameAvailable", () => {
  it("answers for taken and free names", async () => {
    await expect(isBattleNameAvailable("bracket-brawl")).resolves.toBe(false);
    await expect(isBattleNameAvailable("all-mine")).resolves.toBe(true);
  });
});

describe("fetchBattleDetail", () => {
  it("returns a battle with its question", async () => {
    const detail = await fetchBattleDetail(1);
    expect(detail.question.starterCodeUrl).toMatch(/-base\.js$/);
  });

  it("rejects an unknown battle", async () => {
    await expect(fetchBattleDetail(404)).rejects.toThrow(ApiError);
  });
});

describe("fetchBattleStats", () => {
  it("counts battles", async () => {
    await expect(fetchBattleStats()).resolves.toEqual({
      battles: db().battles.length,
    });
  });
});

describe("battleKeys", () => {
  it("keys the lobby by every filter", () => {
    expect(battleKeys.lobby("RUNNING", "", "x", 2)).toEqual([
      "battles",
      "lobby",
      "RUNNING",
      "",
      "x",
      2,
    ]);
  });
});
