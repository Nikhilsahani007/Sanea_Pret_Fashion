// Test helpers: a fetch stub that answers by method and path and records every
// request, and a renderer with the router and the cart around the routes.
import { EMPTY_CART } from "@sanea/shared";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { vi } from "vitest";

import { AppRoutes } from "../App.tsx";
import { CartProvider } from "../cart/CartProvider.tsx";

export type Call = { method: string; path: string; body: unknown };
type Reply = { status?: number; body?: unknown };
type Handler = (call: Call) => Reply | undefined;

export function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const apiError = (status: number, code: string, message: string) => ({
  status,
  body: { error: { code, message, requestId: "req-test" } },
});

/** Stubs fetch. Routes are "METHOD /path" (without /api/v1 or the query). */
export function stubApi(routes: Record<string, Reply | Handler>) {
  const calls: Call[] = [];
  const all: Record<string, Reply | Handler> = {
    "GET /auth/csrf": { body: { csrfToken: "csrf-test" } },
    "GET /cart": { body: EMPTY_CART },
    "GET /content/navigation": { body: { menus: {}, footer: null } },
    "GET /content/home": { body: { announcement: null } },
    ...routes,
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://localhost:5173");
      const method = (init?.method ?? "GET").toUpperCase();
      const path = url.pathname.replace(/^\/api\/v1/, "");
      if (init?.signal?.aborted)
        throw new DOMException("The operation was aborted.", "AbortError");
      const call: Call = {
        method,
        path: `${path}${url.search}`,
        body:
          typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
      };
      calls.push(call);
      const route = all[`${method} ${path}`];
      const reply = typeof route === "function" ? route(call) : route;
      if (!reply)
        return json(404, {
          error: { code: "NOT_FOUND", message: "Not found.", requestId: "x" },
        });
      return json(reply.status ?? 200, reply.body);
    }),
  );
  return { calls };
}

export function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <CartProvider>
        <AppRoutes />
      </CartProvider>
    </MemoryRouter>,
  );
}
