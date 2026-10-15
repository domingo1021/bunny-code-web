import { expect, test } from "@playwright/test";
import { api, editor, goToEnd, newProject, newUser, signIn } from "./support";

/**
 * Recording, replaying, versioning and running code — through the real
 * recording store (MySQL + InfluxDB), object storage (S3) and the Docker
 * sandbox.
 */

test.describe("recording a session", () => {
  test("saves what was typed, then replays it back to the saved file", async ({
    page,
    request,
  }) => {
    const owner = await newUser(request);
    const name = await newProject(request, owner);
    await signIn(page, owner);
    await page.goto(`/workspace/${name}`);

    // A new project starts from the server's template file.
    await expect(editor(page)).toContainText("Welcome to Bunny Code");
    await editor(page).click();
    await goToEnd(page);
    await page.keyboard.press("Enter");
    await page.keyboard.type("const total = 1 + 2;");
    await page.keyboard.press("Enter");
    await page.keyboard.type("console.log(total);");
    await expect(page.getByText("Unsaved")).toBeVisible();
    const typed = (await editor(page).textContent()) ?? "";

    await page.getByRole("button", { name: "Save session" }).click();
    await expect(page.getByText(/Session saved/)).toBeVisible();
    await expect(page.getByText("Read only")).toBeVisible();

    // The server has the events and the new file revision.
    const recording = await api(
      request,
      "GET",
      `/projects/${name}/versions/1/recording`,
      null,
    );
    expect(recording.status()).toBe(200);
    const body = (await recording.json()) as { events: unknown[] };
    expect(body.events.length).toBeGreaterThan(30);

    // A fresh load replays from the base to exactly what was typed.
    await page.reload();
    await expect(page.getByText("Read only")).toBeVisible();
    // The slider is live once the log and its base file have loaded.
    await expect(
      page.getByText(/Press play to watch its \d+ edits/),
    ).toBeVisible();
    const slider = page.getByRole("slider", { name: "Replay position" });
    await slider.focus();
    await page.keyboard.press("Home");
    await expect
      .poll(async () => (await editor(page).textContent()) ?? "")
      .not.toContain("console.log(total)");
    await page.keyboard.press("End");
    await expect
      .poll(async () => (await editor(page).textContent()) ?? "")
      .toBe(typed);
  });

  test("lets nobody but the owner edit", async ({ page, request }) => {
    const owner = await newUser(request);
    const name = await newProject(request, owner);
    await signIn(page, await newUser(request));

    await page.goto(`/workspace/${name}`);
    await expect(page.getByText("Read only")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Save session" }),
    ).toHaveCount(0);
  });

  test("creates a version that starts from the previous one", async ({
    page,
    request,
  }) => {
    const owner = await newUser(request);
    const name = await newProject(request, owner);
    await signIn(page, owner);
    await page.goto(`/workspace/${name}`);

    await page.getByRole("button", { name: "New" }).click();
    await page.getByLabel("Version name").fill("second take");
    await page.getByRole("button", { name: /create version/i }).click();

    await expect(page).toHaveURL(new RegExp(`/workspace/${name}/2$`));
    await expect(
      page.getByRole("link", { name: /second take/ }),
    ).toHaveAttribute("aria-current", "true");
    // Still editable: version 2 has no recording yet.
    await expect(
      page.getByRole("button", { name: "Save session" }),
    ).toBeVisible();
    await expect(editor(page)).toContainText("Welcome to Bunny Code");
  });
});

test.describe("running code on the server", () => {
  test("shows a program's output", async ({ page, request }) => {
    const owner = await newUser(request);
    const name = await newProject(request, owner);
    await signIn(page, owner);
    await page.goto(`/workspace/${name}`);

    await page.getByRole("button", { name: "Run code" }).click();
    // The template greets the bunny.
    await expect(page.getByText("Hello, Bunny!")).toBeVisible({
      timeout: 30_000,
    });
  });

  test("reports a program that throws", async ({ page, request }) => {
    const owner = await newUser(request);
    const name = await newProject(request, owner);
    await signIn(page, owner);
    await page.goto(`/workspace/${name}`);

    await editor(page).click();
    await goToEnd(page);
    await page.keyboard.press("Enter");
    await page.keyboard.type("null.boom;");
    await page.getByRole("button", { name: "Run code" }).click();

    await expect(page.getByText(/exited with an error/)).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/TypeError/).first()).toBeVisible();
  });

  test("asks an anonymous visitor to log in first", async ({
    page,
    request,
  }) => {
    const name = await newProject(request, await newUser(request));
    await page.goto(`/workspace/${name}`);
    await page.getByRole("button", { name: "Run code" }).click();
    await expect(page.getByText("Log in to run code.")).toBeVisible();
  });
});
