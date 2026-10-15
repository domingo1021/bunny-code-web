import { expect, test, type Browser } from "@playwright/test";

/**
 * Guards the code splitting.
 *
 * CodeMirror is the heaviest dependency in the app and only the editor screens
 * need it, so it must not be in the JavaScript a reader downloads to look at
 * the home page. A regression here is invisible until someone profiles it, so
 * it is asserted instead.
 *
 * The assertion is *differential* rather than a byte budget. Next prefetches
 * the links in the navigation, so the absolute total for a route depends on
 * how much prefetching has finished — a fixed budget measures that as much as
 * it measures the bundle, and fails at random. The relationship between the
 * two routes is stable.
 */
async function loadAndCollectJs(
  browser: Browser,
  path: string,
): Promise<{ urls: Set<string>; bytes: number }> {
  // A fresh context each time, so one route is not measured against the
  // other's warm cache.
  const context = await browser.newContext();
  const page = await context.newPage();

  const urls = new Set<string>();
  let bytes = 0;

  page.on("response", async (response) => {
    const url = response.url();
    if (!url.endsWith(".js")) return;
    urls.add(new URL(url).pathname);
    try {
      bytes += (await response.body()).byteLength;
    } catch {
      // A body that has already been discarded does not change the comparison.
    }
  });

  await page.goto(path);
  await page.waitForLoadState("networkidle");
  await context.close();

  return { urls, bytes };
}

test("the editor is not in the home page's JavaScript", async ({ browser }) => {
  const home = await loadAndCollectJs(browser, "/");
  const workspace = await loadAndCollectJs(browser, "/workspace/lru-cache");

  expect(home.bytes).toBeGreaterThan(0);
  expect(workspace.bytes).toBeGreaterThan(0);

  // The workspace pulls chunks the home page never asks for: that is the
  // editor, lazily loaded.
  const editorOnly = [...workspace.urls].filter((url) => !home.urls.has(url));
  expect(editorOnly.length).toBeGreaterThan(0);

  // And it costs more, which it would not if the editor shipped everywhere.
  expect(workspace.bytes).toBeGreaterThan(home.bytes);
});

test("the editor still arrives when the workspace needs it", async ({
  page,
}) => {
  await page.goto("/workspace/lru-cache");
  await expect(page.locator(".cm-content")).toBeVisible();
  await expect(page.locator(".cm-content")).toContainText("class LRU");
});
