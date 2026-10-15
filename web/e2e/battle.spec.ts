import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * Battles, played against the scripted in-browser opponent.
 *
 * The opponent implements the same transport interface as the STOMP client,
 * so these exercise the real battle flow — ready handshake, countdown, live
 * code streaming, judged submissions and the result — with no server. That is
 * also what makes a battle testable at all: a real opponent never does the same
 * thing twice.
 */

const TWO_SUM_SOLUTION = `function twoSum(nums, target) {
const seen = new Map();
for (let i = 0; i < nums.length; i++) {
const need = target - nums[i];
if (seen.has(need)) return [seen.get(need), i];
seen.set(nums[i], i);
}
return [];
}`;

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/user\/\d+$/);
}

/** Start a battle and land in its room. */
async function launchBattle(page: Page): Promise<string> {
  const name = `b${Date.now().toString().slice(-7)}`;
  await page.goto("/battle");
  await page.getByRole("button", { name: "Start a battle" }).click();
  await page.getByLabel("Battle name").fill(name);
  await page.getByRole("button", { name: "Launch" }).click();
  await expect(page).toHaveURL(/\/battle\/\d+$/);
  return name;
}

test.describe("the lobby", () => {
  test("lists seeded battles", async ({ page }) => {
    await page.goto("/battle");
    const list = page.getByRole("list", { name: "Battles" });
    await expect(list.getByRole("listitem")).toHaveCount(4);
    await expect(page.getByText("Live now")).toBeVisible();
  });

  test("filters by status, keeping the filter in the URL", async ({ page }) => {
    await page.goto("/battle");
    await page
      .getByRole("navigation", { name: "Status" })
      .getByRole("link", { name: "Finished" })
      .click();

    await expect(page).toHaveURL(/status=FINISHED/);
    const list = page.getByRole("list", { name: "Battles" });
    await expect(list.getByRole("listitem")).toHaveCount(3);
    await expect(page.getByText("Live now")).toHaveCount(0);
  });

  test("filters by difficulty", async ({ page }) => {
    await page.goto("/battle?level=HARD");
    const list = page.getByRole("list", { name: "Battles" });
    await expect(list.getByRole("listitem")).toHaveCount(1);
    await expect(
      page.getByRole("link", { name: "sliding-window-showdown" }),
    ).toBeVisible();
  });

  test("offers a way out when a filter matches nothing", async ({ page }) => {
    await page.goto("/battle?status=WAITING");
    await expect(page.getByText("No battles match")).toBeVisible();
    await page.getByRole("link", { name: "Clear filters" }).click();
    await expect(page).toHaveURL("/battle");
  });

  test("a finished battle links to its review", async ({ page }) => {
    await page.goto("/battle?status=FINISHED");
    await page.getByRole("link", { name: "bracket-brawl" }).click();
    await expect(page).toHaveURL(/\/battle\/review\/\d+$/);
  });

  test("tells an anonymous visitor they need to log in", async ({ page }) => {
    await page.goto("/battle");
    await page.getByRole("button", { name: "Start a battle" }).click();
    await expect(page.getByText(/need to be logged in/)).toBeVisible();
  });

  test("rejects a battle name that is already taken", async ({ page }) => {
    await signIn(page);
    await page.goto("/battle");
    await page.getByRole("button", { name: "Start a battle" }).click();
    await page.getByLabel("Battle name").fill("bracket-brawl");
    await page.getByRole("button", { name: "Launch" }).click();

    await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
      /already taken/i,
    );
  });

  test("rejects a battle name with spaces before asking the server", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/battle");
    await page.getByRole("button", { name: "Start a battle" }).click();
    await page.getByLabel("Battle name").fill("has spaces");
    await page.getByRole("button", { name: "Launch" }).click();

    await expect(page.getByText(/Letters, digits/)).toBeVisible();
  });
});

test.describe("the battle room", () => {
  test("withholds the question until the battle starts", async ({ page }) => {
    await signIn(page);
    await launchBattle(page);

    // Before readying, the board explains the rules rather than the problem.
    const board = page.getByRole("region", { name: "Question" });
    await expect(board).toContainText("Battle Valley");
    await expect(board).not.toContainText("Two Sum");
  });

  test("runs the ready handshake, counts down, then unlocks the editors", async ({
    page,
  }) => {
    await signIn(page);
    await launchBattle(page);

    await expect(page.getByRole("button", { name: "I’m ready" })).toBeVisible();
    await page.getByRole("button", { name: "I’m ready" }).click();

    // The opponent readies up shortly after.
    await expect(page.getByText(/Starting in/)).toBeVisible({
      timeout: 10_000,
    });

    // Once battling, the question replaces the rules and Submit appears.
    await expect(page.getByRole("region", { name: "Question" })).toContainText(
      "Two Sum",
      { timeout: 15_000 },
    );
    await expect(page.getByRole("button", { name: "Submit" })).toBeEnabled();
  });

  test("shows both players with three submissions each", async ({ page }) => {
    await signIn(page);
    await launchBattle(page);

    await expect(page.getByText("3 left")).toHaveCount(2);
    await expect(page.getByText("(you)")).toBeVisible();
  });

  test("streams the opponent's code into their pane", async ({ page }) => {
    await signIn(page);
    await launchBattle(page);
    await page.getByRole("button", { name: "I’m ready" }).click();

    // The opponent types a real solution keystroke by keystroke.
    const opponentPane = page
      .getByRole("region", { name: /'s code$/ })
      .filter({ hasNot: page.getByText("(you)") });

    await expect(opponentPane).toContainText("twoSum", { timeout: 25_000 });
  });

  test("reports a failing submission and spends one", async ({ page }) => {
    await signIn(page);
    await launchBattle(page);
    await page.getByRole("button", { name: "I’m ready" }).click();
    await expect(page.getByRole("button", { name: "Submit" })).toBeEnabled({
      timeout: 15_000,
    });

    const mine = page
      .getByRole("region", { name: /'s code$/ })
      .filter({ has: page.getByText("(you)") });
    await mine.locator(".cm-content").click();
    await page.keyboard.insertText("function twoSum() { return [9, 9]; }");

    await page.getByRole("button", { name: "Submit" }).click();

    // A verdict with at least one failed case, and one submission gone.
    await expect(mine.getByText("Wrong answer")).toBeVisible({
      timeout: 20_000,
    });
    await expect(mine.getByRole("table")).toBeVisible();
    await expect(mine.getByLabel("failed").first()).toBeVisible();
    await expect(mine.getByText("2 left")).toBeVisible();
  });

  /* The whole point: a correct solution wins and takes you to the review. */
  test("wins with a correct solution and moves to the review", async ({
    page,
  }) => {
    await signIn(page);
    await launchBattle(page);
    await page.getByRole("button", { name: "I’m ready" }).click();
    await expect(page.getByRole("button", { name: "Submit" })).toBeEnabled({
      timeout: 15_000,
    });

    const mine = page
      .getByRole("region", { name: /'s code$/ })
      .filter({ has: page.getByText("(you)") });
    await mine.locator(".cm-content").click();
    await page.keyboard.press("Meta+a");
    await page.keyboard.insertText(TWO_SUM_SOLUTION);

    await page.getByRole("button", { name: "Submit" }).click();

    await expect(page.getByText(/won —/)).toBeVisible({ timeout: 25_000 });
    await expect(page).toHaveURL(/\/battle\/review\/\d+$/, { timeout: 15_000 });
  });

  test("404s an unknown battle", async ({ page }) => {
    await page.goto("/battle/99999");
    await expect(page.getByText("No such battle")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("a finished battle redirects to its review", async ({ page }) => {
    await page.goto("/battle/1");
    await expect(page).toHaveURL(/\/battle\/review\/1$/, { timeout: 10_000 });
  });
});

test.describe("spectating", () => {
  test("watches a live battle read-only", async ({ page }) => {
    // Battle 4 is seeded as already in progress between two other people.
    await page.goto("/battle/4");

    await expect(page.getByText("You are watching this battle.")).toBeVisible({
      timeout: 10_000,
    });
    // No controls for someone who is not in it.
    await expect(page.getByRole("button", { name: "Submit" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "I’m ready" })).toHaveCount(
      0,
    );
  });
});

test.describe("the review page", () => {
  test("shows the winner, the question and their solution", async ({
    page,
  }) => {
    await page.goto("/battle/review/2");

    await expect(
      page.getByRole("heading", { name: "bracket-brawl" }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/won$/)).toBeVisible();
    await expect(page.getByRole("region", { name: "Question" })).toContainText(
      "Valid Parentheses",
    );
    await expect(
      page.getByRole("region", { name: "Winning solution" }),
    ).toContainText("isValid", { timeout: 10_000 });
  });

  test("links back to the lobby", async ({ page }) => {
    await page.goto("/battle/review/2");
    await page.getByRole("link", { name: "Back to the lobby" }).click();
    await expect(page).toHaveURL("/battle");
  });

  test("reports a battle that has no result", async ({ page }) => {
    await page.goto("/battle/review/99999");
    await expect(page.getByText("No such battle")).toBeVisible({
      timeout: 10_000,
    });
  });
});

test.describe("accessibility", () => {
  for (const path of ["/battle", "/battle/review/2"]) {
    test(`${path} has no axe violations`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible(
        { timeout: 10_000 },
      );

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .exclude(".cm-editor")
        .analyze();
      expect(results.violations).toEqual([]);
    });
  }
});
