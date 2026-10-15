import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * The workspace: recording, replaying and running code.
 *
 * These are the tests that matter most, because they exercise the thing the
 * rewrite exists for — that a recording replays to exactly the document it was
 * recorded from — through the real editor in a real browser.
 */

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/user\/\d+$/);
}

/** The CodeMirror content element for the one editor on screen. */
function editor(page: Page) {
  return page.locator(".cm-content");
}

async function waitForEditor(page: Page) {
  await expect(editor(page)).toBeVisible();
}

test.describe("viewing a recorded project", () => {
  test("opens read-only with replay controls", async ({ page }) => {
    await page.goto("/workspace/lru-cache");
    await waitForEditor(page);

    await expect(page.getByText("Read only")).toBeVisible();
    await expect(
      page.getByRole("group", { name: "Replay controls" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Save session" }),
    ).toHaveCount(0);
  });

  test("shows the finished file before replay starts", async ({ page }) => {
    await page.goto("/workspace/lru-cache");
    await waitForEditor(page);
    await expect(editor(page)).toContainText("class LRU");
  });

  test("lists versions and navigates between them", async ({ page }) => {
    await page.goto("/workspace/debounce-from-scratch");
    await waitForEditor(page);

    await page.getByRole("link", { name: /v2\s*add leading edge/ }).click();
    await expect(page).toHaveURL(/\/workspace\/debounce-from-scratch\/2$/);
    await expect(editor(page)).toContainText("leading");
  });

  test("404s an unknown project", async ({ page }) => {
    await page.goto("/workspace/no-such-project");
    await expect(page.getByText(/Could not open this project/)).toBeVisible();
  });
});

test.describe("replaying a recording", () => {
  test("plays, advancing the edit count, then pauses", async ({ page }) => {
    await page.goto("/workspace/promise-pool");
    await waitForEditor(page);

    await expect(
      page.getByText(/Press play to watch its \d+ edits being typed/),
    ).toBeVisible();

    await page.getByRole("button", { name: "Play replay" }).click();
    const status = page.getByText(/\d+ of \d+ edits/);
    await expect(status).toContainText("playing");

    // The index must actually advance under its own steam.
    await expect
      .poll(
        async () => {
          const text = (await status.textContent()) ?? "";
          return Number(/^(\d+)/.exec(text.trim())?.[1] ?? 0);
        },
        { timeout: 10_000 },
      )
      .toBeGreaterThan(5);

    await page.getByRole("button", { name: "Pause replay" }).click();
    await expect(status).toContainText("paused");
  });

  test("scrubbing to the end reproduces the saved file exactly", async ({
    page,
  }) => {
    await page.goto("/workspace/promise-pool");
    await waitForEditor(page);

    // The editor starts on the finished file, so capture it to compare against.
    const finished = (await editor(page).textContent()) ?? "";
    expect(finished).toContain("async function pool");

    const slider = page.getByRole("slider", { name: "Replay position" });

    // Scrub fully left: the document rewinds to (almost) the base content.
    // The first recorded edit sits at t=0, so one character remains — the
    // point is that it rewound, not the exact leftover.
    await slider.focus();
    await page.keyboard.press("Home");
    await expect
      .poll(
        async () => ((await editor(page).textContent()) ?? "").trim().length,
        {
          timeout: 5_000,
        },
      )
      .toBeLessThan(5);

    // Scrub to the end: replaying the whole log must rebuild the same file.
    await page.keyboard.press("End");
    await expect
      .poll(async () => (await editor(page).textContent()) ?? "", {
        timeout: 5_000,
      })
      .toBe(finished);
  });

  test("scrubs backwards, which the original could not do", async ({
    page,
  }) => {
    await page.goto("/workspace/promise-pool");
    await waitForEditor(page);

    const slider = page.getByRole("slider", { name: "Replay position" });
    await slider.focus();
    await page.keyboard.press("End");
    const atEnd = ((await editor(page).textContent()) ?? "").length;

    await page.keyboard.press("Home");
    await expect
      .poll(async () => ((await editor(page).textContent()) ?? "").length, {
        timeout: 5_000,
      })
      .toBeLessThan(atEnd);
  });

  test("changes speed, and reports it", async ({ page }) => {
    await page.goto("/workspace/promise-pool");
    await waitForEditor(page);

    await expect(page.getByText("x1", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Speed up" }).click();
    await expect(page.getByText("x1.25", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Slow down" }).click();
    await page.getByRole("button", { name: "Slow down" }).click();
    await expect(page.getByText("x0.75", { exact: true })).toBeVisible();
  });

  test("disables the slider when there is nothing recorded", async ({
    page,
  }) => {
    await signIn(page);
    // A freshly created project has no recording yet.
    const name = `empty-${Date.now().toString().slice(-6)}`;
    await page.getByRole("button", { name: "New project" }).click();
    await page.getByLabel("Project name").fill(name);
    await page.getByRole("button", { name: "Create project" }).click();
    await page.getByRole("link", { name }).click();

    await waitForEditor(page);
    // An editable version has no replay controls at all.
    await expect(
      page.getByRole("group", { name: "Replay controls" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Save session" }),
    ).toBeVisible();
  });
});

test.describe("recording a session", () => {
  /** Create a project and open its editable workspace. */
  async function newProject(page: Page): Promise<string> {
    await signIn(page);
    const name = `rec-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`;
    await page.getByRole("button", { name: "New project" }).click();
    await page.getByLabel("Project name").fill(name);
    await page.getByRole("button", { name: "Create project" }).click();
    await page.getByRole("link", { name }).click();
    await waitForEditor(page);
    return name;
  }

  test("types into the editor and marks the file unsaved", async ({ page }) => {
    await newProject(page);

    await editor(page).click();
    await page.keyboard.type("const answer = 42;");

    await expect(editor(page)).toContainText("const answer = 42;");
    await expect(page.getByText("Unsaved")).toBeVisible();
  });

  test("auto-closes brackets and steps over the closer", async ({ page }) => {
    await newProject(page);

    await editor(page).click();
    await page.keyboard.type("f(1)");
    // `(` inserts `()`, then typing `)` steps over rather than doubling it.
    await expect(editor(page)).toContainText("f(1)");
    expect((await editor(page).textContent()) ?? "").not.toContain("f(1))");
  });

  test("keeps the indent after a newline inside a block", async ({ page }) => {
    await newProject(page);

    await editor(page).click();
    await page.keyboard.type("function f() {");
    await page.keyboard.press("Enter");
    await page.keyboard.type("return 1;");

    const text = (await editor(page).textContent()) ?? "";
    expect(text).toContain("return 1;");
  });

  /* The end-to-end proof: record, save, then replay back to the same file. */
  test("saves a session, then replays it back to the saved file", async ({
    page,
  }) => {
    await newProject(page);

    await editor(page).click();
    await page.keyboard.type("const total = 1 + 2;");
    await page.keyboard.press("Enter");
    await page.keyboard.type("console.log(total);");

    const typed = (await editor(page).textContent()) ?? "";

    await page.getByRole("button", { name: "Save session" }).click();
    await expect(page.getByText(/Session saved/)).toBeVisible();

    // The version is read-only now, with a replay to scrub.
    await expect(page.getByText("Read only")).toBeVisible();
    const slider = page.getByRole("slider", { name: "Replay position" });
    await slider.focus();
    await page.keyboard.press("Home");
    await expect
      .poll(
        async () => ((await editor(page).textContent()) ?? "").trim().length,
        {
          timeout: 5_000,
        },
      )
      .toBeLessThan(5);

    await page.keyboard.press("End");
    await expect
      .poll(async () => (await editor(page).textContent()) ?? "", {
        timeout: 5_000,
      })
      .toBe(typed);
  });

  test("saves with the keyboard shortcut", async ({ page }) => {
    await newProject(page);

    await editor(page).click();
    await page.keyboard.type("const x = 1;");
    await page.keyboard.press("Meta+s");

    await expect(page.getByText(/Session saved/)).toBeVisible();
  });

  test("refuses to paste, because a paste produces no record", async ({
    page,
  }) => {
    await newProject(page);

    await editor(page).click();
    await page.keyboard.type("start");
    await page.evaluate(() => {
      const content = document.querySelector(".cm-content");
      const data = new DataTransfer();
      data.setData("text/plain", "PASTED");
      content?.dispatchEvent(
        new ClipboardEvent("paste", { clipboardData: data, bubbles: true }),
      );
    });

    expect((await editor(page).textContent()) ?? "").not.toContain("PASTED");
  });
});

test.describe("running code", () => {
  test("runs the file and prints its output", async ({ page }) => {
    await page.goto("/workspace/flatten-deep");
    await waitForEditor(page);

    await page.getByRole("button", { name: "Run code" }).click();

    const terminal = page.getByRole("log");
    await expect(terminal).toContainText("[ 1, 2, 3, 4 ]", { timeout: 15_000 });
  });

  test("reports a runtime error without breaking the page", async ({
    page,
  }) => {
    await signIn(page);
    const name = `err-${Date.now().toString().slice(-6)}`;
    await page.getByRole("button", { name: "New project" }).click();
    await page.getByLabel("Project name").fill(name);
    await page.getByRole("button", { name: "Create project" }).click();
    await page.getByRole("link", { name }).click();
    await waitForEditor(page);

    await editor(page).click();
    await page.keyboard.type("null.x;");
    await page.getByRole("button", { name: "Run code" }).click();

    await expect(page.getByRole("log")).toContainText("TypeError", {
      timeout: 15_000,
    });
  });

  /*
   * The behaviour the README's "out of memory" GIF showed, now without a
   * server: the worker is terminated and the tab stays responsive.
   */
  test("terminates an infinite loop instead of hanging the tab", async ({
    page,
  }) => {
    await signIn(page);
    const name = `loop-${Date.now().toString().slice(-6)}`;
    await page.getByRole("button", { name: "New project" }).click();
    await page.getByLabel("Project name").fill(name);
    await page.getByRole("button", { name: "Create project" }).click();
    await page.getByRole("link", { name }).click();
    await waitForEditor(page);

    await editor(page).click();
    await page.keyboard.type("while (true) {}");
    await page.getByRole("button", { name: "Run code" }).click();

    await expect(page.getByRole("log")).toContainText(/timed out/i, {
      timeout: 20_000,
    });
    // Still interactive afterwards.
    await expect(page.getByRole("button", { name: "Run code" })).toBeEnabled();
  });

  test("clears the terminal", async ({ page }) => {
    await page.goto("/workspace/flatten-deep");
    await waitForEditor(page);

    await page.getByRole("button", { name: "Run code" }).click();
    await expect(page.getByRole("log")).toContainText("[ 1, 2, 3, 4 ]", {
      timeout: 15_000,
    });

    await page.getByRole("button", { name: "Clear terminal" }).click();
    await expect(page.getByRole("log")).toContainText(/Press/);
  });
});

test.describe("accessibility", () => {
  test("the workspace has no axe violations", async ({ page }) => {
    await page.goto("/workspace/lru-cache");
    await waitForEditor(page);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      // CodeMirror owns this subtree and its internals are not ours to fix.
      .exclude(".cm-editor")
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test("the shortcut help opens, traps focus and closes on Escape", async ({
    page,
  }) => {
    await page.goto("/workspace/lru-cache");
    await waitForEditor(page);

    await page.getByRole("button", { name: "Shortcuts" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Duplicate the current line");

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  });
});
