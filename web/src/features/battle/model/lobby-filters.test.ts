import { describe, expect, it } from "vitest";
import { lobbyHref, parseLobbyFilters } from "./lobby-filters";

describe("parseLobbyFilters", () => {
  it("reads known filters from the URL", () => {
    expect(
      parseLobbyFilters({
        status: "RUNNING",
        level: "HARD",
        keyword: "duel",
        page: "3",
      }),
    ).toEqual({ status: "RUNNING", level: "HARD", keyword: "duel", page: 3 });
  });

  it("ignores anything it does not recognise", () => {
    expect(
      parseLobbyFilters({
        status: "battling",
        level: "2",
        keyword: "",
        page: "-1",
      }),
    ).toEqual({ status: "", level: "", keyword: "", page: 1 });
  });

  it("caps the keyword at the server's limit", () => {
    const filters = parseLobbyFilters({
      status: "",
      level: "",
      keyword: "x".repeat(80),
      page: "",
    });
    expect(filters.keyword).toHaveLength(50);
  });
});

describe("lobbyHref", () => {
  it("is the bare lobby without filters, and omits page one", () => {
    expect(lobbyHref({})).toBe("/battle");
    expect(lobbyHref({ status: "", level: "", page: 1 })).toBe("/battle");
  });

  it("puts every filter in the query string", () => {
    expect(
      lobbyHref({ status: "FINISHED", level: "EASY", keyword: "a b", page: 2 }),
    ).toBe("/battle?status=FINISHED&level=EASY&keyword=a+b&page=2");
  });
});
