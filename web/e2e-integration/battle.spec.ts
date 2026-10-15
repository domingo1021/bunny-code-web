import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { newUser, signIn, unique, type TestUser } from "./support";

/**
 * Live battles between two real people — two browsers, two accounts — over
 * the STOMP connection, judged by the server's sandbox.
 *
 * The EASY level holds one seeded question, "Hello world": return the
 * argument unchanged. That makes the outcome of a submission predictable.
 */

const SOLUTION = "function helloWorld(text) { return text; }";
const WRONG = "function helloWorld(text) { return 'nope'; }";

/* Every person is a browser context; close them all after each test so no
   one from an earlier test is still online to receive invitations. */
const contexts: BrowserContext[] = [];
test.afterEach(async () => {
  await Promise.all(contexts.splice(0).map((context) => context.close()));
});

async function newContext(browser: Browser): Promise<BrowserContext> {
  const context = await browser.newContext();
  contexts.push(context);
  return context;
}

interface Player {
  user: TestUser;
  page: Page;
}

async function player(browser: Browser, prefix: string): Promise<Player> {
  const context = await newContext(browser);
  const page = await context.newPage();
  const user = await newUser(context.request, prefix);
  await signIn(page, user);
  return { user, page };
}

/** The inviter launches; the other accepts from their invitation inbox. */
async function startBattle(inviter: Player, accepter: Player) {
  const battleName = unique("bt");
  // The accepter waits somewhere else in the app: invitations reach every page.
  await accepter.page.goto("/workspace");

  await inviter.page.goto("/battle");
  await inviter.page.getByRole("button", { name: "Start a battle" }).click();
  await inviter.page.getByLabel("Battle name").fill(battleName);
  await inviter.page
    .getByRole("dialog")
    .getByRole("radio", { name: "Easy" })
    .check();
  await inviter.page.getByRole("button", { name: "Launch" }).click();
  await expect(inviter.page.getByText(/Invitation sent/)).toBeVisible();

  const invitation = accepter.page
    .getByRole("region", { name: "Battle invitations" })
    .getByRole("alert")
    .filter({ hasText: battleName });
  await expect(invitation).toContainText(inviter.user.name);
  await invitation.getByRole("button", { name: "Accept" }).click();

  // Both are taken to the new room.
  await expect(accepter.page).toHaveURL(/\/battle\/\d+$/);
  await expect(inviter.page).toHaveURL(/\/battle\/\d+$/);
  expect(inviter.page.url()).toBe(accepter.page.url());
  return { battleName, url: new URL(inviter.page.url()).pathname };
}

async function readyUp(...players: Player[]) {
  for (const { page } of players) {
    await page.getByRole("button", { name: "I’m ready" }).click();
  }
  for (const { page } of players) {
    await expect(page.getByRole("button", { name: "Submit" })).toBeEnabled({
      timeout: 20_000,
    });
  }
}

function myPane(page: Page) {
  return page
    .getByRole("region", { name: /'s code$/ })
    .filter({ has: page.getByText("(you)") });
}

async function submit(page: Page, code: string) {
  const pane = myPane(page);
  await pane.locator(".cm-content").click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.insertText(code);
  await page.getByRole("button", { name: "Submit" }).click();
}

test.describe("a battle between two people", () => {
  test("invite, accept, ready, submit — and the right person wins", async ({
    browser,
  }) => {
    const alice = await player(browser, "al");
    const bob = await player(browser, "bo");
    const { battleName, url } = await startBattle(alice, bob);

    // The question is withheld until both are ready.
    for (const { page } of [alice, bob]) {
      await expect(
        page.getByRole("heading", { name: battleName }),
      ).toBeVisible();
      await expect(
        page.getByRole("region", { name: "Question" }),
      ).toContainText("Battle Valley");
      await expect(page.getByText("3 left")).toHaveCount(2);
    }

    await readyUp(alice, bob);
    await expect(
      alice.page.getByRole("region", { name: "Question" }),
    ).not.toContainText("Battle Valley");
    // Both editors start from the question's starter code.
    await expect(myPane(alice.page)).toContainText("function helloWorld");

    // Alice's wrong answer is judged, costs her a submission, and Bob sees it.
    await submit(alice.page, WRONG);
    await expect(myPane(alice.page).getByText("Wrong answer")).toBeVisible({
      timeout: 30_000,
    });
    await expect(myPane(alice.page).getByText("2 left")).toBeVisible();
    const alicePaneForBob = bob.page.getByRole("region", {
      name: `${alice.user.name}'s code`,
    });
    await expect(alicePaneForBob.getByText("Wrong answer")).toBeVisible();
    // Her code streamed to him as she typed.
    await expect(alicePaneForBob).toContainText("nope");

    // Bob gets it right and wins, for both of them.
    await submit(bob.page, SOLUTION);
    for (const { page } of [alice, bob]) {
      await expect(page.getByText(`${bob.user.name} won`)).toBeVisible({
        timeout: 30_000,
      });
    }

    // Then the review: the winner and the winning code, from object storage.
    await expect(alice.page).toHaveURL(new RegExp(`/battle/review/\\d+$`), {
      timeout: 15_000,
    });
    await expect(
      alice.page.getByRole("region", { name: "Winning solution" }),
    ).toContainText("return text;");
    await expect(
      alice.page.getByText(`${bob.user.name} won`, { exact: true }),
    ).toBeVisible();

    // And the lobby lists it as finished.
    await alice.page.goto("/battle?status=FINISHED");
    await expect(
      alice.page.getByRole("link", { name: battleName }),
    ).toHaveAttribute("href", url.replace("/battle/", "/battle/review/"));
  });

  test("leaving a running battle forfeits it", async ({ browser }) => {
    const alice = await player(browser, "al");
    const bob = await player(browser, "bo");
    await startBattle(alice, bob);
    await readyUp(alice, bob);

    // Navigating elsewhere in the app keeps the connection open, so the room
    // has to say it is leaving.
    await alice.page.getByRole("link", { name: "Workspace" }).click();
    await expect(alice.page).toHaveURL(/\/workspace$/);

    await expect(bob.page.getByText(/Battle terminated/)).toBeVisible();
    await expect(bob.page.getByText(/left the battle/)).toBeVisible();
  });

  test("a third person watches read-only", async ({ browser }) => {
    const alice = await player(browser, "al");
    const bob = await player(browser, "bo");
    const { url } = await startBattle(alice, bob);
    await readyUp(alice, bob);

    const carol = await player(browser, "ca");
    await carol.page.goto(url);
    await expect(
      carol.page.getByText("You are watching this battle."),
    ).toBeVisible();
    await expect(
      carol.page.getByRole("button", { name: "Submit" }),
    ).toHaveCount(0);

    // Live code reaches the spectator.
    await myPane(alice.page).locator(".cm-content").click();
    await alice.page.keyboard.press("ControlOrMeta+a");
    await alice.page.keyboard.insertText("// spectated");
    await expect(
      carol.page.getByRole("region", { name: `${alice.user.name}'s code` }),
    ).toContainText("// spectated");
  });

  test("an anonymous visitor is asked to log in to watch", async ({
    browser,
  }) => {
    const alice = await player(browser, "al");
    const bob = await player(browser, "bo");
    const { url } = await startBattle(alice, bob);

    const anonymous = await (await newContext(browser)).newPage();
    await anonymous.goto(url);
    await expect(
      anonymous.getByText("Log in to join the battle"),
    ).toBeVisible();
  });
});

test.describe("invitations", () => {
  test("nobody accepting in time is reported", async ({ browser }) => {
    test.setTimeout(90_000);
    const alice = await player(browser, "al");

    await alice.page.goto("/battle");
    await alice.page.getByRole("button", { name: "Start a battle" }).click();
    await alice.page.getByLabel("Battle name").fill(unique("lonely"));
    await alice.page.getByRole("button", { name: "Launch" }).click();
    await expect(alice.page.getByText(/s left/)).toBeVisible();

    await expect(alice.page.getByText(/Nobody accepted in time/)).toBeVisible({
      timeout: 45_000,
    });
  });

  test("a battle name in use is refused before inviting anyone", async ({
    browser,
  }) => {
    const alice = await player(browser, "al");
    const bob = await player(browser, "bo");
    const { battleName } = await startBattle(alice, bob);

    const carol = await player(browser, "ca");
    await carol.page.goto("/battle");
    await carol.page.getByRole("button", { name: "Start a battle" }).click();
    await carol.page.getByLabel("Battle name").fill(battleName);
    await carol.page.getByRole("button", { name: "Launch" }).click();

    await expect(
      carol.page.getByRole("dialog").getByRole("alert"),
    ).toContainText(/already taken/i);
  });
});
