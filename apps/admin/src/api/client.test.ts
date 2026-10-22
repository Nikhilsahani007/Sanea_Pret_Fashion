// The API client: CSRF headers, error mapping and the session-expiry hook.
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiError, json, stubApi } from "../test/helpers.tsx";
import {
  ApiError,
  api,
  fieldErrorsOf,
  query,
  setSessionCsrfToken,
  setUnauthenticatedHandler,
} from "./client.ts";

beforeEach(() => {
  setSessionCsrfToken(null);
  setUnauthenticatedHandler(null);
});

describe("CSRF", () => {
  it("fetches the guest token once and sends it on state-changing requests", async () => {
    const { calls } = stubApi({
      "GET /auth/csrf": { body: { csrfToken: "guest-1" } },
      "POST /admin/auth/sign-in": { body: { challenge: "c" } },
    });
    await api.post("/admin/auth/sign-in", { email: "a@b.test", password: "x" });
    await api.post("/admin/auth/sign-in", { email: "a@b.test", password: "x" });
    expect(calls.filter((c) => c.path === "/auth/csrf")).toHaveLength(1);
    const posts = calls.filter((c) => c.method === "POST");
    expect(posts.map((c) => c.headers.get("X-CSRF-Token"))).toEqual([
      "guest-1",
      "guest-1",
    ]);
    expect(posts[0]!.headers.get("Content-Type")).toBe("application/json");
  });

  it("uses the session token once signed in, and none on GET", async () => {
    setSessionCsrfToken("session-1");
    const { calls } = stubApi({
      "PATCH /admin/products/p1": { body: { id: "p1" } },
      "GET /admin/products": { body: { items: [], nextCursor: null } },
    });
    await api.patch("/admin/products/p1", { name: "N" });
    await api.get("/admin/products");
    expect(calls.map((c) => [c.method, c.headers.get("X-CSRF-Token")])).toEqual(
      [
        ["PATCH", "session-1"],
        ["GET", null],
      ],
    );
  });

  it("fetches a fresh guest token after CSRF_FAILED", async () => {
    let n = 0;
    const { calls } = stubApi({
      "GET /auth/csrf": () => ({ body: { csrfToken: `guest-${++n}` } }),
      "POST /admin/auth/sign-in": (c) =>
        c.headers.get("X-CSRF-Token") === "guest-1"
          ? apiError(403, "CSRF_FAILED", "The request could not be verified.")
          : { body: { challenge: "c" } },
    });
    await expect(api.post("/admin/auth/sign-in", {})).rejects.toMatchObject({
      code: "CSRF_FAILED",
    });
    await api.post("/admin/auth/sign-in", {});
    expect(calls.filter((c) => c.path === "/auth/csrf")).toHaveLength(2);
  });
});

describe("errors", () => {
  it("keeps the documented code, message, details and request id", async () => {
    stubApi({
      "GET /admin/products/x": apiError(404, "NOT_FOUND", "Not found."),
    });
    const error = await api.get("/admin/products/x").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 404,
      code: "NOT_FOUND",
      message: "Not found.",
      requestId: "req-test",
    });
  });

  it("maps field errors without the body prefix, with shared messages as fallback", () => {
    expect(
      fieldErrorsOf([
        {
          path: "body.slug",
          code: "SLUG_INVALID",
          message: "Use lowercase words.",
        },
        { path: "body.slug", code: "TOO_LONG" },
        { path: "password", code: "TOO_SHORT" },
        { path: "code", code: "MFA_CODE_INVALID" },
        { path: "", code: "NO_PRIMARY_IMAGE" },
        "junk",
      ]),
    ).toEqual({
      slug: "Use lowercase words.",
      password: expect.stringMatching(/short/i),
      code: expect.stringMatching(/not correct/),
    });
  });

  it("tells the session about 401 UNAUTHENTICATED, not about sign-in failures", async () => {
    const expired = vi.fn();
    setUnauthenticatedHandler(expired);
    stubApi({
      "GET /auth/csrf": { body: { csrfToken: "g" } },
      "GET /admin/products": apiError(
        401,
        "UNAUTHENTICATED",
        "Sign in to continue.",
      ),
      "POST /admin/auth/sign-in": apiError(
        401,
        "SIGN_IN_FAILED",
        "The details are not correct.",
      ),
    });
    await expect(api.post("/admin/auth/sign-in", {})).rejects.toMatchObject({
      code: "SIGN_IN_FAILED",
    });
    expect(expired).not.toHaveBeenCalled();
    await expect(api.get("/admin/products")).rejects.toMatchObject({
      status: 401,
    });
    expect(expired).toHaveBeenCalledOnce();
  });

  it("reports an unreachable server, and a non-JSON failure, without guessing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    await expect(api.get("/admin/products")).rejects.toMatchObject({
      code: "NETWORK_ERROR",
      status: 0,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response("<html>bad gateway</html>", { status: 502 }),
      ),
    );
    await expect(api.get("/admin/products")).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
      status: 502,
    });
  });

  it("returns nothing for 204", async () => {
    setSessionCsrfToken("s");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json(204)),
    );
    await expect(api.delete("/admin/categories/c1")).resolves.toBeUndefined();
  });
});

describe("query", () => {
  it("drops empty values", () => {
    expect(
      query({ status: "DRAFT", categoryId: "", limit: 25, cursor: undefined }),
    ).toBe("?status=DRAFT&limit=25");
    expect(query({})).toBe("");
  });
});
