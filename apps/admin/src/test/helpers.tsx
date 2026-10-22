// Test helpers: a fetch stub that answers by method and path and records every
// request, and a renderer with the router and session around a screen.
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router";
import { vi } from "vitest";

import { setSessionCsrfToken } from "../api/client.ts";
import type { Admin } from "../api/types.ts";
import { SessionProvider } from "../auth/session.tsx";
import { RequireSession } from "../shell/AppShell.tsx";

export type Call = {
  method: string;
  path: string;
  headers: Headers;
  body: unknown;
};

type Reply = { status?: number; body?: unknown };
type Handler = (call: Call) => Reply | undefined;

export function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const apiError = (
  status: number,
  code: string,
  message: string,
  details?: unknown,
) => ({
  status,
  body: {
    error: {
      code,
      message,
      requestId: "req-test",
      ...(details ? { details } : {}),
    },
  },
});

/** Stubs fetch. Routes are "METHOD /path" (without /api/v1 or the query). */
export function stubApi(routes: Record<string, Reply | Handler>) {
  const calls: Call[] = [];
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://localhost:5174");
      const method = (init?.method ?? "GET").toUpperCase();
      const path = url.pathname.replace(/^\/api\/v1/, "");
      const call: Call = {
        method,
        path: `${path}${url.search}`,
        headers: new Headers(init?.headers),
        body:
          typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
      };
      calls.push(call);
      const route =
        routes[`${method} ${path}`] ?? routes[`${method} ${path}${url.search}`];
      const reply = typeof route === "function" ? route(call) : route;
      if (!reply)
        return json(404, {
          error: { code: "NOT_FOUND", message: "Not found.", requestId: "x" },
        });
      return json(reply.status ?? 200, reply.body);
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock };
}

export const ADMINS: Record<Admin["role"], Admin> = {
  OWNER: {
    id: "a1",
    email: "owner@example.test",
    name: "Olivia Owner",
    role: "OWNER",
  },
  MANAGER: {
    id: "a2",
    email: "manager@example.test",
    name: "Manav Manager",
    role: "MANAGER",
  },
  CATALOGUE_EDITOR: {
    id: "a3",
    email: "editor@example.test",
    name: "Esha Editor",
    role: "CATALOGUE_EDITOR",
  },
  FULFILMENT: {
    id: "a4",
    email: "ful@example.test",
    name: "Farid Fulfilment",
    role: "FULFILMENT",
  },
};

export const signedInAs = (admin: Admin) => ({
  "GET /admin/auth/me": { body: { admin, csrfToken: "session-csrf" } },
});

/** Renders routes; with `shell`, inside the signed-in shell (RequireSession). */
export function renderAt(
  path: string,
  routes: { path: string; element: ReactNode }[],
  { shell = false }: { shell?: boolean } = {},
) {
  setSessionCsrfToken(null);
  const children = routes.map((r) => (
    <Route key={r.path} path={r.path} element={r.element} />
  ));
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SessionProvider>
        <Routes>
          {shell ? (
            <Route element={<RequireSession />}>{children}</Route>
          ) : (
            children
          )}
        </Routes>
      </SessionProvider>
    </MemoryRouter>,
  );
}
