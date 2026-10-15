import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/** Signs in with the seeded demo account and waits for the redirect. */
async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/user\/\d+$/);
}

test.describe("home", () => {
  test("renders the most-starred projects from the server", async ({
    page,
  }) => {
    await page.goto("/");
    const grid = page.getByRole("list", { name: "Most starred projects" });
    await expect(grid.getByRole("listitem")).toHaveCount(3);

    // Server-rendered, so it is in the HTML before any client fetch.
    await expect(page.getByText(/public projects/)).toBeVisible();
  });

  test("links through to a project's workspace", async ({ page }) => {
    await page.goto("/");
    await page
      .getByRole("list", { name: "Most starred projects" })
      .getByRole("link", { name: "lru-cache" })
      .click();
    await expect(page).toHaveURL("/workspace/lru-cache");
  });
});

test.describe("the project catalogue", () => {
  test("lists a page of projects and paginates", async ({ page }) => {
    await page.goto("/workspace");
    const grid = page.getByRole("list", { name: "Projects" });
    await expect(grid.getByRole("listitem")).toHaveCount(6);

    await page.getByRole("link", { name: "Page 2" }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByRole("link", { name: "Page 2" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  test("searches, and offers a way back when nothing matches", async ({
    page,
  }) => {
    await page.goto("/workspace?keywords=debounce");
    await expect(
      page.getByRole("heading", { name: /Results for/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "debounce-from-scratch" }),
    ).toBeVisible();

    await page.goto("/workspace?keywords=zzzznothing");
    await expect(page.getByText(/Nothing matches/)).toBeVisible();
    await page.getByRole("link", { name: "Browse all projects" }).click();
    await expect(page).toHaveURL("/workspace");
  });

  test("does not show private projects to visitors", async ({ page }) => {
    await page.goto("/workspace");
    await expect(page.getByText("private-scratchpad")).toHaveCount(0);
  });
});

test.describe("a user's page", () => {
  test("shows a profile and their public projects to a visitor", async ({
    page,
  }) => {
    await page.goto("/user/3");
    await expect(
      page.getByRole("heading", { name: "mei", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Projects", exact: true }),
    ).toBeVisible();

    // Visitor: no owner controls.
    await expect(page.getByRole("button", { name: "New project" })).toHaveCount(
      0,
    );
    await expect(page.getByRole("button", { name: "Log out" })).toHaveCount(0);
  });

  test("shows owner controls and private projects on your own page", async ({
    page,
  }) => {
    await signIn(page);

    await expect(
      page.getByRole("heading", { name: "Your projects" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "New project" }),
    ).toBeVisible();
    // Only the owner sees this one.
    await expect(
      page.getByRole("link", { name: "private-scratchpad" }),
    ).toBeVisible();
  });

  test("404s a non-numeric user id", async ({ page }) => {
    await page.goto("/user/not-a-number");
    await expect(
      page.getByRole("heading", { name: /ran away/i }),
    ).toBeVisible();
  });

  test("creates a project, which then appears in the list", async ({
    page,
  }) => {
    await signIn(page);

    const name = `e2e-${Date.now().toString().slice(-6)}`;
    await page.getByRole("button", { name: "New project" }).click();
    await page.getByLabel("Project name").fill(name);
    await page.getByLabel("Description").fill("made by a test");
    await page.getByRole("button", { name: "Create project" }).click();

    await expect(page.getByRole("link", { name })).toBeVisible();
  });

  test("rejects a project name with spaces, naming the field", async ({
    page,
  }) => {
    await signIn(page);

    await page.getByRole("button", { name: "New project" }).click();
    await page.getByLabel("Project name").fill("has spaces");
    await page.getByRole("button", { name: "Create project" }).click();

    await expect(page.getByText(/Letters, digits/)).toBeVisible();
  });

  test("reports a duplicate project name from the server", async ({ page }) => {
    await signIn(page);

    await page.getByRole("button", { name: "New project" }).click();
    await page.getByLabel("Project name").fill("promise-pool");
    await page.getByRole("button", { name: "Create project" }).click();

    await expect(page.getByRole("alert")).toContainText(/already taken/i);
  });

  test("logging out returns to the login page", async ({ page }) => {
    await signIn(page);
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL("/login");
  });
});

test.describe("accessibility", () => {
  for (const path of ["/workspace", "/user/1"]) {
    test(`${path} has no axe violations`, async ({ page }) => {
      await page.goto(path);
      // Wait for content, so axe does not scan a page of skeletons.
      await expect(
        page.getByRole("heading", { level: 1 }).first(),
      ).toBeVisible();

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      expect(results.violations).toEqual([]);
    });
  }
});

test.describe("searching the catalogue", () => {
  /* Works at every width, including phones where the header search is hidden. */
  test("searches from the catalogue's own field", async ({ page }) => {
    await page.goto("/workspace");

    await page.getByLabel("Search projects", { exact: true }).fill("lru");
    await page.getByRole("button", { name: "Search" }).click();

    await expect(page).toHaveURL(/keywords=lru/);
    await expect(page.getByRole("link", { name: "lru-cache" })).toBeVisible();
  });

  test("keeps the term in the field and offers a way to clear it", async ({
    page,
  }) => {
    await page.goto("/workspace?keywords=lru");
    await expect(
      page.getByLabel("Search projects", { exact: true }),
    ).toHaveValue("lru");

    await page.getByRole("link", { name: "Clear search" }).click();
    await expect(page).toHaveURL("/workspace");
    await expect(
      page.getByLabel("Search projects", { exact: true }),
    ).toHaveValue("");
  });
});

test.describe("the home page hero", () => {
  /* The hero is the product's subject matter, played by the real engine, so it
     has to actually type rather than show a still. */
  test("types the recording out over time", async ({ page }) => {
    await page.goto("/");

    const counter = page.getByText(/\d+ \/ \d+ edits/);
    await expect(counter).toBeVisible();

    const read = async () =>
      Number(/^(\d+)/.exec((await counter.textContent()) ?? "")?.[1] ?? 0);

    const first = await read();
    await expect.poll(read, { timeout: 10_000 }).toBeGreaterThan(first);
  });

  test("exposes the finished code to assistive technology, not the animation", async ({
    page,
  }) => {
    await page.goto("/");

    // The moving copy is decoration; the real content is present once.
    const figure = page.getByRole("figure");
    await expect(figure).toContainText("lru.js");
    expect(await figure.locator(".sr-only").innerText()).toContain("class LRU");
    await expect(figure.locator("[aria-hidden='true']").first()).toBeAttached();
  });

  test("does not animate when the reader asks for less motion", async ({
    browser,
  }) => {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.goto("/");

    // A static edit count, and the finished file rather than a partial one.
    await expect(page.getByText(/^\d+ edits$/)).toBeVisible();
    await expect(page.getByRole("figure")).toContainText("class LRU");
    await expect(page.getByText(/\d+ \/ \d+ edits/)).toHaveCount(0);

    await context.close();
  });
});
