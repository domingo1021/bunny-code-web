import {
  expect,
  type APIRequestContext,
  type Browser,
  type Page,
} from "@playwright/test";
import { API_URL } from "../playwright.integration.config";

/**
 * Helpers for the integration suite. Users and projects are created through
 * the real API — fast, and independent of the UI being tested — and every
 * name is unique, so the suite can run again and again on the same database.
 */

export interface TestUser {
  id: number;
  name: string;
  email: string;
  password: string;
  token: string;
}

let counter = 0;

/** A short unique suffix: names are limited to 20 characters. */
export function unique(prefix: string): string {
  counter += 1;
  const stamp = Date.now().toString(36).slice(-5);
  return `${prefix}${stamp}${counter}`.slice(0, 20);
}

export async function newUser(
  request: APIRequestContext,
  prefix = "it",
): Promise<TestUser> {
  const name = unique(prefix);
  const email = `${name}@example.com`;
  const password = "secret123";
  const response = await request.post(`${API_URL}/auth/sign-up`, {
    data: { name, email, password },
  });
  expect(response.status(), await response.text()).toBe(201);
  const body = (await response.json()) as {
    accessToken: string;
    user: { id: number };
  };
  return { id: body.user.id, name, email, password, token: body.accessToken };
}

export async function api(
  request: APIRequestContext,
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  user: TestUser | null,
  data?: unknown,
) {
  const response = await request.fetch(`${API_URL}${path}`, {
    method,
    headers: user === null ? {} : { Authorization: `Bearer ${user.token}` },
    ...(data === undefined ? {} : { data }),
  });
  return response;
}

export async function newProject(
  request: APIRequestContext,
  owner: TestUser,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const name = unique("p");
  const response = await api(request, "POST", "/projects", owner, {
    name,
    description: "made by the integration suite",
    visibility: "PUBLIC",
    versionName: "version 1",
    fileName: "index.js",
    ...overrides,
  });
  expect(response.status(), await response.text()).toBe(201);
  return name;
}

/**
 * Open the login page once it has finished streaming. Until React swaps the
 * streamed content into place, a hidden copy of the form sits in the DOM too.
 */
export async function openLogin(page: Page, path = "/login"): Promise<void> {
  await page.goto(path);
  await expect(page.locator("#signin-email")).toHaveCount(1);
}

/** Sign in through the real form. */
export async function signIn(page: Page, user: TestUser): Promise<void> {
  await openLogin(page);
  await page.locator("#signin-email").fill(user.email);
  await page.locator("#signin-password").fill(user.password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/user/${user.id}$`));
}

/** A second, independent browser — another person. */
export async function anotherPerson(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  return context.newPage();
}

export function editor(page: Page) {
  return page.locator(".cm-content");
}

/** Move the cursor to the end of the file, with keys the recorder knows. */
export async function goToEnd(page: Page): Promise<void> {
  for (let i = 0; i < 40; i += 1) await page.keyboard.press("ArrowDown");
  await page.keyboard.press("End");
}
