import { expect, test } from "@playwright/test";
import {
  anotherPerson,
  api,
  newProject,
  newUser,
  openLogin,
  signIn,
  unique,
} from "./support";

/**
 * Accounts, profiles and projects against the real API: what the server
 * stores, what it hides, and that its answers reach the screen.
 */

test.describe("accounts", () => {
  test("signs up through the form, survives a reload, and signs out", async ({
    page,
  }) => {
    const name = unique("su");
    await openLogin(page);
    await page.getByRole("tab", { name: "Sign up" }).click();
    await page.locator("#signup-name").fill(name);
    await page.locator("#signup-email").fill(`${name}@example.com`);
    await page.locator("#signup-password").fill("secret123");
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page).toHaveURL(/\/user\/\d+$/);
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("link", { name: "Your page" })).toBeVisible();

    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("link", { name: "Log in" })).toBeVisible();
  });

  test("shows the server's reason for a wrong password", async ({
    page,
    request,
  }) => {
    const user = await newUser(request);
    await openLogin(page);
    await page.locator("#signin-email").fill(user.email);
    await page.locator("#signin-password").fill("wrong-password1");
    await page.getByRole("button", { name: "Log in", exact: true }).click();

    await expect(
      page.locator("#signin-panel").getByRole("alert"),
    ).toContainText(/incorrect/i);
  });

  test("refuses an e-mail address that is already registered", async ({
    page,
    request,
  }) => {
    const user = await newUser(request);
    await openLogin(page);
    await page.getByRole("tab", { name: "Sign up" }).click();
    await page.locator("#signup-name").fill(unique("dup"));
    await page.locator("#signup-email").fill(user.email);
    await page.locator("#signup-password").fill("secret123");
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(
      page.locator("#signup-panel").getByRole("alert"),
    ).toContainText(/already/i);
  });
});

test.describe("projects", () => {
  test("creates a private project that only its owner can open", async ({
    page,
    browser,
    request,
  }) => {
    const owner = await newUser(request);
    await signIn(page, owner);

    const name = unique("priv");
    await page.getByRole("button", { name: "New project" }).first().click();
    await page.getByLabel("Project name").fill(name);
    await page.getByLabel("Description").fill("for my eyes only");
    await page.getByText("Private", { exact: true }).click();
    await page.getByRole("button", { name: "Create project" }).click();

    const card = page
      .getByRole("list", { name: "Your projects" })
      .getByRole("listitem")
      .filter({ hasText: name });
    await expect(card).toContainText("Private");

    // The owner opens it…
    await card.getByRole("link", { name }).click();
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();

    // …a stranger gets nothing.
    const stranger = await anotherPerson(browser);
    await stranger.goto(`/workspace/${name}`);
    await expect(
      stranger.getByText(/Could not open this project/),
    ).toBeVisible();
    await stranger.goto(`/user/${owner.id}`);
    await expect(stranger.getByText(name)).toHaveCount(0);
  });

  test("validates a project name before the round trip", async ({
    page,
    request,
  }) => {
    await signIn(page, await newUser(request));
    await page.getByRole("button", { name: "New project" }).first().click();
    await page.getByLabel("Project name").fill("has spaces");
    await page.getByRole("button", { name: "Create project" }).click();
    await expect(page.getByText(/Letters, digits/)).toBeVisible();
  });

  test("reports a taken project name from the server", async ({
    page,
    request,
  }) => {
    const owner = await newUser(request);
    const taken = await newProject(request, owner);
    await signIn(page, owner);

    await page.getByRole("button", { name: "New project" }).first().click();
    await page.getByLabel("Project name").fill(taken);
    await page.getByRole("button", { name: "Create project" }).click();

    await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
      /already taken/i,
    );
  });

  test("finds a public project in the catalogue by name and by owner", async ({
    page,
    request,
  }) => {
    const owner = await newUser(request);
    const name = await newProject(request, owner);

    await page.goto(`/workspace?keywords=${name}`);
    await expect(page.getByRole("link", { name, exact: true })).toBeVisible();

    await page.goto(`/workspace?keywords=${owner.name}`);
    await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
  });

  test("stars and unstars someone else's project", async ({
    page,
    request,
  }) => {
    const owner = await newUser(request);
    const name = await newProject(request, owner);
    await signIn(page, await newUser(request));

    await page.goto(`/workspace/${name}`);
    const star = page.getByRole("button", { name: /stars/ });
    await expect(star).toHaveAttribute("aria-pressed", "false");
    await expect(star).toContainText("0");

    await star.click();
    await expect(star).toHaveAttribute("aria-pressed", "true");
    await expect(star).toContainText("1");

    await star.click();
    await expect(star).toHaveAttribute("aria-pressed", "false");
    await expect(star).toContainText("0");
  });

  test("counts a visitor's view after a few seconds", async ({
    page,
    request,
  }) => {
    const owner = await newUser(request);
    const name = await newProject(request, owner);

    await page.goto(`/workspace/${name}`);
    await expect
      .poll(
        async () =>
          (
            (await (
              await api(request, "GET", `/projects/${name}`, null)
            ).json()) as { watchCount: number }
          ).watchCount,
        { timeout: 15_000 },
      )
      .toBe(1);
  });
});
