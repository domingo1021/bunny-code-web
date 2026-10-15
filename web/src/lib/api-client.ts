import { type z } from "zod";
import { API_BASE_URL, SERVER_API_BASE_URL } from "./env";

/**
 * The one way the app talks HTTP.
 *
 * Three things are centralised here:
 *
 * - **One base URL**, from `env.ts`.
 * - **One error type.** The API answers failures with an RFC 9457 problem
 *   detail — `{ status, detail, code }` — and every failure, including a
 *   network drop, a proxy's HTML error page or a CORS rejection, becomes an
 *   `ApiError` with a message worth showing and, when the server sent one, the
 *   stable `code` to branch on.
 * - **Response validation.** Every successful body is parsed with a Zod schema,
 *   so a contract change fails loudly at the boundary with a useful message
 *   instead of surfacing as `undefined` three components deep.
 */

export class ApiError extends Error {
  readonly status: number;
  /** The problem detail's machine-readable code, e.g. `project.name-taken`. */
  readonly code: string | null;
  /** True when the request never reached the server. */
  readonly offline: boolean;

  constructor(
    message: string,
    status: number,
    options: { code?: string | null; offline?: boolean } = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = options.code ?? null;
    this.offline = options.offline ?? false;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  /** A conflict the user can fix by choosing a different value. */
  get isConflict(): boolean {
    return this.status === 409;
  }
}

/** Thrown when a response does not match the schema it was parsed against. */
export class ApiSchemaError extends Error {
  readonly issues: readonly z.core.$ZodIssue[];

  constructor(path: string, issues: readonly z.core.$ZodIssue[]) {
    const summary = issues
      .slice(0, 3)
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    super(`Unexpected response shape from ${path} — ${summary}`);
    this.name = "ApiSchemaError";
    this.issues = issues;
  }
}

export type QueryValue = string | number | boolean | null | undefined;

export interface RequestOptions<TSchema extends z.ZodType> {
  readonly method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  readonly body?: unknown;
  readonly token?: string | null;
  /** Schema for the response body. Use `noContentSchema` for 204s. */
  readonly schema: TSchema;
  readonly searchParams?: Readonly<Record<string, QueryValue>>;
  readonly signal?: AbortSignal;
}

/** Build a URL, dropping empty parameters so `?keyword=` is not sent. */
export function buildUrl(
  path: string,
  searchParams?: Readonly<Record<string, QueryValue>>,
): string {
  const base = `${apiBaseUrl()}${path}`;
  if (searchParams === undefined) return base;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const query = params.toString();
  return query === "" ? base : `${base}?${query}`;
}

/** The browser uses the public API URL; the server may use a private one. */
function apiBaseUrl(): string {
  return typeof window === "undefined" ? SERVER_API_BASE_URL : API_BASE_URL;
}

export async function apiRequest<TSchema extends z.ZodType>(
  path: string,
  options: RequestOptions<TSchema>,
): Promise<z.infer<TSchema>> {
  const { method = "GET", body, token, schema, signal } = options;
  const url = buildUrl(path, options.searchParams);

  const headers = new Headers({ Accept: "application/json" });
  if (token !== undefined && token !== null) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (body !== undefined) headers.set("Content-Type", "application/json");

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      ...(signal === undefined ? {} : { signal }),
    });
  } catch (cause) {
    if (isAbort(cause)) throw cause;
    throw new ApiError(
      "Could not reach the server. Check your connection and try again.",
      0,
      { offline: true },
    );
  }

  const payload = await readJson(response);

  if (!response.ok) {
    const problem = asProblem(payload);
    throw new ApiError(
      problem?.detail ?? defaultMessageFor(response.status),
      response.status,
      { code: problem?.code ?? null },
    );
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiSchemaError(path, parsed.error.issues);
  }
  return parsed.data;
}

/**
 * Whether a rejection is a cancelled request.
 *
 * Checked by name rather than `instanceof DOMException`: an aborted fetch
 * rejects with a `DOMException` in the browser but not necessarily elsewhere
 * (undici throws its own class), and an abort reported as a network failure
 * would surface "could not reach the server" every time a component unmounted
 * mid-request.
 */
function isAbort(cause: unknown): boolean {
  return cause instanceof Error && cause.name === "AbortError";
}

/**
 * Read a JSON body, or `null` for 204, non-JSON or unparseable bodies — so an
 * HTML error page from a proxy produces a clean `ApiError` with the real status
 * instead of a parse failure that masks it.
 */
async function readJson(response: Response): Promise<unknown> {
  if (response.status === 204) return null;
  const contentType = response.headers.get("Content-Type") ?? "";
  if (!contentType.includes("json")) return null;
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

interface Problem {
  detail?: string;
  code?: string;
}

function asProblem(payload: unknown): Problem | null {
  if (payload === null || typeof payload !== "object") return null;
  const { detail, code } = payload as Record<string, unknown>;
  return {
    ...(typeof detail === "string" && detail !== "" ? { detail } : {}),
    ...(typeof code === "string" ? { code } : {}),
  };
}

function defaultMessageFor(status: number): string {
  if (status === 401) return "Please log in to continue.";
  if (status === 403) return "You do not have access to this.";
  if (status === 404) return "We could not find what you were looking for.";
  if (status === 409)
    return "That conflicts with something that already exists.";
  if (status === 429) return "Too many requests — please wait a moment.";
  if (status >= 500) return "The server had a problem. Please try again.";
  return "Something went wrong.";
}

/**
 * Fetch a file's text content from object storage (S3/CloudFront).
 *
 * File bodies are plain text at an absolute URL rather than JSON under the API
 * base, so they bypass the schema entirely.
 */
export async function fetchText(
  url: string,
  signal?: AbortSignal,
): Promise<string> {
  let response: Response;
  try {
    response = await fetch(url, signal === undefined ? {} : { signal });
  } catch (cause) {
    if (isAbort(cause)) throw cause;
    throw new ApiError(`Could not load ${url}.`, 0, { offline: true });
  }
  if (!response.ok) {
    throw new ApiError(`Could not load ${url}.`, response.status);
  }
  return response.text();
}

/** Turn any thrown value into something worth showing a person. */
export function describeError(error: unknown): string {
  if (error instanceof ApiError || error instanceof ApiSchemaError) {
    return error.message;
  }
  if (error instanceof Error && error.message !== "") return error.message;
  return "Something went wrong.";
}
