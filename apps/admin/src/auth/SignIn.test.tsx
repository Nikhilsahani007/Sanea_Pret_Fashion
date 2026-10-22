// Sign-in steps (D-066): password, then a code or a recovery code; one generic
// error; focus on the code field; redirect to the page first asked for.
import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it } from "vitest";

import { ADMINS, apiError, renderAt, stubApi } from "../test/helpers.tsx";
import { SessionProvider } from "./session.tsx";
import { SignIn } from "./SignIn.tsx";

const routes = [
  { path: "/sign-in", element: <SignIn /> },
  { path: "/products", element: <p>Products screen</p> },
];

function signedOutApi(extra = {}) {
  return stubApi({
    "GET /admin/auth/me": apiError(
      401,
      "UNAUTHENTICATED",
      "Sign in to continue.",
    ),
    "GET /auth/csrf": { body: { csrfToken: "guest" } },
    ...extra,
  });
}

describe("sign-in", () => {
  it("signs in with a password and a 6-digit code, then opens the products screen", async () => {
    const user = userEvent.setup();
    const { calls } = signedOutApi({
      "POST /admin/auth/sign-in": {
        body: { challenge: "ch-1", expiresAt: "2026-10-22T10:05:00Z" },
      },
      "POST /admin/auth/mfa": {
        body: { admin: ADMINS.MANAGER, csrfToken: "session" },
      },
    });
    renderAt("/sign-in", routes);
    await user.type(
      await screen.findByLabelText("Email"),
      "manager@example.test",
    );
    await user.type(screen.getByLabelText("Password"), "a long passphrase");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    const code = await screen.findByLabelText("6-digit code");
    expect(document.activeElement).toBe(code);
    await user.type(code, "12a3456");
    expect((code as HTMLInputElement).value).toBe("123456");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Products screen")).toBeTruthy();
    expect(calls.find((c) => c.path === "/admin/auth/sign-in")?.body).toEqual({
      email: "manager@example.test",
      password: "a long passphrase",
    });
    expect(calls.find((c) => c.path === "/admin/auth/mfa")?.body).toEqual({
      challenge: "ch-1",
      code: "123456",
    });
  });

  it("shows only the API's generic message when the details are wrong", async () => {
    const user = userEvent.setup();
    signedOutApi({
      "POST /admin/auth/sign-in": apiError(
        401,
        "SIGN_IN_FAILED",
        "The details are not correct, or the account is locked.",
      ),
    });
    renderAt("/sign-in", routes);
    await user.type(await screen.findByLabelText("Email"), "x@example.test");
    await user.type(screen.getByLabelText("Password"), "wrong password!");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(
      "The details are not correct, or the account is locked.",
    );
    expect(screen.queryByLabelText("6-digit code")).toBeNull();
  });

  it("sends a recovery code instead of a code when chosen, and keeps the challenge on a wrong code", async () => {
    const user = userEvent.setup();
    let attempts = 0;
    const { calls } = signedOutApi({
      "POST /admin/auth/sign-in": { body: { challenge: "ch-2" } },
      "POST /admin/auth/mfa": () =>
        ++attempts === 1
          ? apiError(
              401,
              "SIGN_IN_FAILED",
              "The details are not correct, or the account is locked.",
            )
          : { body: { admin: ADMINS.OWNER, csrfToken: "s" } },
    });
    renderAt("/sign-in", routes);
    await user.type(
      await screen.findByLabelText("Email"),
      "owner@example.test",
    );
    await user.type(screen.getByLabelText("Password"), "a long passphrase");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(
      await screen.findByRole("button", {
        name: "Use a recovery code instead",
      }),
    );
    const field = screen.getByLabelText("Recovery code");
    await waitFor(() => expect(document.activeElement).toBe(field));
    await user.type(field, "ABCDE-FGHJK");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    await user.type(screen.getByLabelText("Recovery code"), "ABCDE-FGHJK");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Products screen")).toBeTruthy();
    const mfa = calls
      .filter((c) => c.path === "/admin/auth/mfa")
      .map((c) => c.body);
    expect(mfa).toEqual([
      { challenge: "ch-2", recoveryCode: "ABCDE-FGHJK" },
      { challenge: "ch-2", recoveryCode: "ABCDE-FGHJK" },
    ]);
  });

  it("explains an ended session", async () => {
    signedOutApi();
    render(
      <MemoryRouter
        initialEntries={[
          { pathname: "/sign-in", state: { from: "/colours", expired: true } },
        ]}
      >
        <SessionProvider>
          <Routes>
            <Route path="/sign-in" element={<SignIn />} />
          </Routes>
        </SessionProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByText("Your session has ended")).toBeTruthy();
  });
});
