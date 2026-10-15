import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * Runs against a production build, so this covers the path the deployed demo
 * actually takes: the service worker registers, MSW answers every API call, and
 * the app signs in with no backend anywhere.
 */

test.describe("signing in", () => {
  test("signs in with the demo account and lands on the user page", async ({
    page,
  }) => {
    await page.goto("/login");

    // The form is pre-filled with the demo account.
    await expect(page.getByLabel("Email")).toHaveValue("domingoos@gmail.com");
    await page.getByRole("button", { name: "Log in" }).click();

    await expect(page).toHaveURL(/\/user\/\d+$/);
    await expect(page.getByRole("link", { name: "Your page" })).toBeVisible();
  });

  test("shows the server's message for a wrong password", async ({ page }) => {
    await page.goto("/login");

    await page.getByLabel("Password").fill("definitely-wrong");
    await page.getByRole("button", { name: "Log in" }).click();

    await expect(page.getByRole("tabpanel").getByRole("alert")).toContainText(
      /incorrect/i,
    );
    await expect(page).toHaveURL(/\/login/);
  });

  test("validates before submitting, and says which field is wrong", async ({
    page,
  }) => {
    await page.goto("/login");

    await page.getByLabel("Email").fill("not-an-email");
    await page.getByRole("button", { name: "Log in" }).click();

    const email = page.getByLabel("Email");
    await expect(email).toHaveAttribute("aria-invalid", "true");
    await expect(
      page.getByText(/does not look like an email address/i),
    ).toBeVisible();
  });

  test("creates an account and signs straight in", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("tab", { name: "Sign up" }).click();

    const unique = `user${Date.now().toString().slice(-6)}`;
    await page.getByLabel("User name").fill(unique);
    await page.getByLabel("Email").fill(`${unique}@example.com`);
    await page.getByLabel("Password").fill("longenough1");
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page).toHaveURL(/\/user\/\d+$/);
  });

  test("rejects a password that is too short, before any request", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByRole("tab", { name: "Sign up" }).click();

    await page.getByLabel("User name").fill("shorty");
    await page.getByLabel("Email").fill("shorty@example.com");
    await page.getByLabel("Password").fill("abc");
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page.getByText(/at least 6 characters/i)).toBeVisible();
  });

  test("survives a reload, because the token is mirrored to the tab", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/user\/\d+$/);

    await page.reload();
    await expect(page.getByRole("link", { name: "Your page" })).toBeVisible();
  });
});

test.describe("the shell", () => {
  test("offers a skip link as the first tab stop", async ({ page }) => {
    await page.goto("/");
    // The demo API starts behind a gate, so wait for the shell to be
    // interactive before tabbing — until then nothing is focusable.
    await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();

    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("link", { name: "Skip to content" }),
    ).toBeFocused();
  });

  test("marks the current section in the nav", async ({ page }) => {
    await page.goto("/workspace");
    await expect(page.getByRole("link", { name: "Workspace" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  /*
   * The header search is hidden below the `sm` breakpoint to keep the
   * navigation usable on a phone, so this covers the desktop shortcut only.
   * The catalogue's own search field is what works at every width, and is
   * covered in projects.spec.ts.
   */
  test("searching from the header navigates to the catalogue", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile === true, "the header search is desktop-only");

    await page.goto("/");
    await page.getByLabel("Quick search projects").fill("debounce");
    await page.getByLabel("Quick search projects").press("Enter");
    await expect(page).toHaveURL(/\/workspace\?keywords=debounce/);
  });

  test("shows the 404 page for an unknown route", async ({ page }) => {
    await page.goto("/no-such-page");
    await expect(
      page.getByRole("heading", { name: /ran away/i }),
    ).toBeVisible();
  });

  test("has no horizontal scrollbar at phone width", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 700 });
    await page.goto("/login");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(overflow).toBe(false);
  });
});

test.describe("accessibility", () => {
  for (const path of ["/", "/login", "/no-such-page"]) {
    test(`${path} has no axe violations`, async ({ page }) => {
      await page.goto(path);
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      expect(results.violations).toEqual([]);
    });
  }
});
