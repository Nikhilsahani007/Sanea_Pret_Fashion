// Navigation by role, and the shell's handling of an ended session.
import { screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { api } from "../api/client.ts";
import {
  ADMINS,
  apiError,
  renderAt,
  signedInAs,
  stubApi,
} from "../test/helpers.tsx";
import { SignIn } from "../auth/SignIn.tsx";
import { RequireSession } from "./AppShell.tsx";
import { navFor } from "./nav.ts";

describe("navigation by role", () => {
  it("shows catalogue screens to O M C and only products to F", () => {
    const labels = (role: keyof typeof ADMINS) =>
      navFor(ADMINS[role].role).map((i) => i.label);
    const full = [
      "Products",
      "Categories",
      "Collections",
      "Colours",
      "Size charts",
      "Media library",
    ];
    expect(labels("OWNER")).toEqual(full);
    expect(labels("MANAGER")).toEqual(full);
    expect(labels("CATALOGUE_EDITOR")).toEqual(full);
    expect(labels("FULFILMENT")).toEqual(["Products"]);
  });

  it("renders the role's links, name and role in the shell", async () => {
    stubApi(signedInAs(ADMINS.FULFILMENT));
    renderAt("/products", [{ path: "/products", element: <RequireSession /> }]);
    expect(
      await screen.findByText("Farid Fulfilment · Fulfilment"),
    ).toBeTruthy();
    const nav = screen.getByRole("navigation", { name: "Admin" });
    expect([...nav.querySelectorAll("a")].map((a) => a.textContent)).toEqual([
      "Products",
    ]);
    expect(
      screen
        .getByRole("link", { name: "Skip to content" })
        .getAttribute("href"),
    ).toBe("#main");
  });
});

describe("session", () => {
  it("sends a signed-out visitor to sign-in", async () => {
    stubApi({
      "GET /admin/auth/me": apiError(
        401,
        "UNAUTHENTICATED",
        "Sign in to continue.",
      ),
    });
    renderAt("/products", [
      { path: "/products", element: <RequireSession /> },
      { path: "/sign-in", element: <p>Sign-in screen</p> },
    ]);
    expect(await screen.findByText("Sign-in screen")).toBeTruthy();
  });

  it("moves to sign-in with a notice when a later request answers 401", async () => {
    stubApi({
      ...signedInAs(ADMINS.OWNER),
      "GET /admin/products": apiError(
        401,
        "UNAUTHENTICATED",
        "Sign in to continue.",
      ),
      "GET /auth/csrf": { body: { csrfToken: "g" } },
    });
    renderAt("/products", [
      { path: "/products", element: <RequireSession /> },
      { path: "/sign-in", element: <SignIn /> },
    ]);
    await screen.findByText("Olivia Owner · Owner");
    await api.get("/admin/products").catch(() => undefined);
    expect(await screen.findByText("Your session has ended")).toBeTruthy();
  });

  it("signs out and keeps the session when sign-out fails", async () => {
    const user = userEvent.setup();
    let fail = true;
    stubApi({
      ...signedInAs(ADMINS.MANAGER),
      "POST /admin/auth/sign-out": () =>
        fail
          ? apiError(500, "INTERNAL_ERROR", "Something went wrong.")
          : { status: 204 },
    });
    renderAt("/products", [
      { path: "/products", element: <RequireSession /> },
      { path: "/sign-in", element: <p>Sign-in screen</p> },
    ]);
    await user.click(await screen.findByRole("button", { name: "Sign out" }));
    expect(await screen.findByText("Sign-out did not complete")).toBeTruthy();
    fail = false;
    await user.click(screen.getByRole("button", { name: "Sign out" }));
    expect(await screen.findByText("Sign-in screen")).toBeTruthy();
  });

  it("shows an error with a retry when the session check fails", async () => {
    stubApi({
      "GET /admin/auth/me": apiError(
        500,
        "INTERNAL_ERROR",
        "Something went wrong.",
      ),
    });
    renderAt("/products", [{ path: "/products", element: <RequireSession /> }]);
    expect(await screen.findByText("This could not be loaded")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });
});
