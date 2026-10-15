import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { server } from "@/mocks/server";
import {
  ApiError,
  ApiSchemaError,
  apiRequest,
  describeError,
  buildUrl,
  fetchText,
} from "./api-client";
import { noContentSchema } from "./schemas";

/**
 * The failure paths.
 *
 * Anything that is not a well-formed API response — a dropped connection, a
 * proxy's HTML error page, a 204 — must still become one clean `ApiError`
 * rather than a second error thrown while reporting the first.
 */

afterEach(() => {
  vi.restoreAllMocks();
});

const anything = z.unknown();

describe("apiRequest · transport failures", () => {
  it("reports an unreachable server as an offline ApiError", async () => {
    server.use(http.get("/api/v2/stats/projects", () => HttpResponse.error()));

    const error = await apiRequest("/stats/projects", {
      schema: anything,
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).offline).toBe(true);
    expect((error as ApiError).status).toBe(0);
    expect(describeError(error)).toMatch(/could not reach the server/i);
  });

  it("rethrows an abort rather than disguising it as an error", async () => {
    const controller = new AbortController();
    server.use(
      http.get("/api/v2/stats/projects", async () => {
        controller.abort();
        return HttpResponse.json({ projects: 0, recordings: 0 });
      }),
    );

    const error = await apiRequest("/stats/projects", {
      schema: anything,
      signal: controller.signal,
    }).catch((e: unknown) => e);

    // Asserted by name, not by class: the abort is constructed in another
    // realm, so `instanceof DOMException` is false even though it is one.
    expect((error as Error).name).toBe("AbortError");
  });
});

describe("apiRequest · error bodies", () => {
  /* An HTML error page from a proxy must produce a clean status-based message,
     not a JSON parse failure that hides the real status code. */
  it("handles a non-JSON error body", async () => {
    server.use(
      http.get("/api/v2/stats/projects", () =>
        HttpResponse.text("<html>502 Bad Gateway</html>", { status: 502 }),
      ),
    );

    const error = await apiRequest("/stats/projects", {
      schema: anything,
    }).catch((e: unknown) => e);

    expect((error as ApiError).status).toBe(502);
    expect(describeError(error)).toMatch(/server had a problem/i);
  });

  it("handles malformed JSON in an error body", async () => {
    server.use(
      http.get(
        "/api/v2/stats/projects",
        () =>
          new HttpResponse("{not json", {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }),
      ),
    );

    const error = await apiRequest("/stats/projects", {
      schema: anything,
    }).catch((e: unknown) => e);
    expect((error as ApiError).status).toBe(500);
  });

  it.each([
    [401, /log in/i],
    [403, /do not have access/i],
    [404, /could not find/i],
    [409, /conflicts/i],
    [418, /something went wrong/i],
  ])("gives status %i a usable default message", async (status, pattern) => {
    server.use(
      http.get("/api/v2/stats/projects", () =>
        HttpResponse.text("", { status }),
      ),
    );

    const error = await apiRequest("/stats/projects", {
      schema: anything,
    }).catch((e: unknown) => e);
    expect(describeError(error)).toMatch(pattern);
  });

  it("prefers the server's own message when there is one", async () => {
    server.use(
      http.get("/api/v2/stats/projects", () =>
        HttpResponse.json(
          {
            type: "about:blank",
            title: "Conflict",
            status: 409,
            detail: "That project name is already taken.",
            code: "project.name-taken",
          },
          {
            status: 409,
            headers: { "Content-Type": "application/problem+json" },
          },
        ),
      ),
    );

    const error = await apiRequest("/stats/projects", {
      schema: anything,
    }).catch((e: unknown) => e);
    expect(describeError(error)).toBe("That project name is already taken.");
    expect((error as ApiError).isConflict).toBe(true);
    expect((error as ApiError).code).toBe("project.name-taken");
  });

  it("classifies statuses", () => {
    expect(new ApiError("x", 401).isUnauthorized).toBe(true);
    expect(new ApiError("x", 404).isNotFound).toBe(true);
    expect(new ApiError("x", 409).isConflict).toBe(true);
    expect(new ApiError("x", 500).isUnauthorized).toBe(false);
  });
});

describe("apiRequest · success bodies", () => {
  it("accepts a 204 with no body", async () => {
    server.use(
      http.put(
        "/api/v2/projects/demo/star",
        () => new HttpResponse(null, { status: 204 }),
      ),
    );

    await expect(
      apiRequest("/projects/demo/star", {
        method: "PUT",
        schema: noContentSchema,
      }),
    ).resolves.toBeNull();
  });

  it("sends a bearer token when given one", async () => {
    let seen: string | null = null;
    server.use(
      http.get("/api/v2/stats/battles", ({ request }) => {
        seen = request.headers.get("Authorization");
        return HttpResponse.json(1);
      }),
    );

    await apiRequest("/stats/battles", { schema: z.number(), token: "abc" });
    expect(seen).toBe("Bearer abc");
  });

  it("omits the header without a token", async () => {
    let seen: string | null = "unset";
    server.use(
      http.get("/api/v2/stats/battles", ({ request }) => {
        seen = request.headers.get("Authorization");
        return HttpResponse.json(1);
      }),
    );

    await apiRequest("/stats/battles", { schema: z.number(), token: null });
    expect(seen).toBeNull();
  });

  it("sends a JSON body with the right content type", async () => {
    let contentType: string | null = null;
    let body: unknown = null;
    server.use(
      http.post("/api/v2/executions", async ({ request }) => {
        contentType = request.headers.get("Content-Type");
        body = await request.json();
        return HttpResponse.json("ok");
      }),
    );

    await apiRequest("/executions", {
      method: "POST",
      body: { code: "1 + 1" },
      schema: z.string(),
    });

    expect(contentType).toBe("application/json");
    expect(body).toEqual({ code: "1 + 1" });
  });
});

describe("apiRequest · schema enforcement", () => {
  it("names the endpoint and the offending field", async () => {
    server.use(
      http.get("/api/v2/users/1", () =>
        HttpResponse.json({ id: "not-a-number" }),
      ),
    );

    const error = await apiRequest("/users/1", {
      schema: z.object({ id: z.number() }),
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiSchemaError);
    expect(describeError(error)).toContain("/users/1");
    expect(describeError(error)).toContain("id");
    expect((error as ApiSchemaError).issues.length).toBeGreaterThan(0);
  });

  it("returns the parsed value, not the raw body", async () => {
    server.use(
      http.get("/api/v2/stats/battles", () => HttpResponse.json("42")),
    );

    // The schema coerces, so the caller gets a number.
    await expect(
      apiRequest("/stats/battles", { schema: z.coerce.number() }),
    ).resolves.toBe(42);
  });
});

describe("fetchText", () => {
  it("returns a file's contents", async () => {
    await expect(
      fetchText("https://cdn.bunnycode.test/questions/two-sum.md"),
    ).resolves.toMatch(/^# Two Sum/);
  });

  it("reports a missing file with its status", async () => {
    const error = await fetchText(
      "https://cdn.bunnycode.test/files/nope.js",
    ).catch((e: unknown) => e);

    expect((error as ApiError).status).toBe(404);
    expect(describeError(error)).toContain("nope.js");
  });

  it("reports an unreachable file as offline", async () => {
    server.use(
      http.get("https://cdn.bunnycode.test/files/boom.js", () =>
        HttpResponse.error(),
      ),
    );

    const error = await fetchText(
      "https://cdn.bunnycode.test/files/boom.js",
    ).catch((e: unknown) => e);

    expect((error as ApiError).offline).toBe(true);
  });

  it("rethrows an abort", async () => {
    const controller = new AbortController();
    controller.abort();

    const error = await fetchText(
      "https://cdn.bunnycode.test/questions/two-sum.md",
      controller.signal,
    ).catch((e: unknown) => e);

    expect((error as Error).name).toBe("AbortError");
  });
});

describe("describeError", () => {
  it.each([
    ["an ApiError", new ApiError("no access", 403), "no access"],
    ["a plain Error", new Error("boom"), "boom"],
    ["an empty Error", new Error(""), "Something went wrong."],
    ["a string", "just a string", "Something went wrong."],
    ["null", null, "Something went wrong."],
    ["undefined", undefined, "Something went wrong."],
  ])("describes %s", (_label, thrown, expected) => {
    expect(describeError(thrown)).toBe(expected);
  });
});

describe("buildUrl", () => {
  it("drops empty parameters so `?keyword=` is never sent", () => {
    expect(
      buildUrl("/projects", { keyword: "", page: 0, sort: null, size: 6 }),
    ).toBe("/api/v2/projects?page=0&size=6");
  });

  it("leaves a path without parameters alone", () => {
    expect(buildUrl("/stats/projects")).toBe("/api/v2/stats/projects");
  });
});
