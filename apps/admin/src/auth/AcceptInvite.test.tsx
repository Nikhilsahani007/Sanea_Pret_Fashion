// Account set-up with QR enrolment (U8-3). Covers: the token read from the
// fragment and removed from the address bar; an invalid link; the QR code
// encodes exactly the provisioning URI (decoded back here); a wrong code;
// recovery codes shown once with a "saved" confirmation; the secret never
// written to browser storage or sent anywhere but the enrol response.
import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import encodeQR from "qr";
import decodeQR from "qr/decode.js";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";

import { setSessionCsrfToken } from "../api/client.ts";
import { apiError, stubApi } from "../test/helpers.tsx";
import {
  AcceptInvite,
  groupSecret,
  passwordProblem,
  tokenFromHash,
} from "./AcceptInvite.tsx";
import { SessionProvider } from "./session.tsx";

const TOKEN = "Tq3_tokenFromTheOwnersLink-0123456789abcdef";
const SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
const URI = `otpauth://totp/Sanéa%20Pret%20Admin:editor%40example.test?secret=${SECRET}&issuer=Sanéa%20Pret%20Admin&algorithm=SHA1&digits=6&period=30`;

function open() {
  window.history.replaceState(null, "", `/accept-invite#token=${TOKEN}`);
  setSessionCsrfToken(null);
  return render(
    <MemoryRouter initialEntries={["/accept-invite"]}>
      <SessionProvider>
        <Routes>
          <Route path="/accept-invite" element={<AcceptInvite />} />
          <Route path="/sign-in" element={<p>Sign-in screen</p>} />
        </Routes>
      </SessionProvider>
    </MemoryRouter>,
  );
}

const base = {
  "GET /admin/auth/me": apiError(
    401,
    "UNAUTHENTICATED",
    "Sign in to continue.",
  ),
  "GET /auth/csrf": { body: { csrfToken: "guest" } },
  "POST /admin/auth/invites/inspect": {
    body: {
      email: "editor@example.test",
      role: "CATALOGUE_EDITOR",
      kind: "invite",
      expiresAt: "2026-10-24T10:00:00Z",
    },
  },
  "POST /admin/auth/invites/enrol": {
    body: { otpauthUri: URI, secret: SECRET },
  },
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

async function fillDetails(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText("Your name"), "Esha Editor");
  await user.type(
    screen.getByLabelText("New password"),
    "correct horse battery",
  );
  await user.type(
    screen.getByLabelText("Confirm password"),
    "correct horse battery",
  );
  await user.click(
    screen.getByRole("button", { name: "Continue to two-factor set-up" }),
  );
}

describe("account set-up", () => {
  it("enrols with a QR code, then shows the recovery codes once", async () => {
    const user = userEvent.setup();
    const { calls } = stubApi({
      ...base,
      "POST /admin/auth/invites/accept": {
        status: 201,
        body: { recoveryCodes: ["ABCDE-FGHJK", "LMNPQ-RSTUV"] },
      },
    });
    open();
    // The token is taken from the fragment and removed from the address bar.
    await screen.findByText("editor@example.test · Catalogue editor");
    expect(window.location.hash).toBe("");

    await fillDetails(user);
    const qr = await screen.findByRole("img", {
      name: /QR code to add Sanéa Pret Admin/,
    });
    expect(qr.tagName.toLowerCase()).toBe("svg");
    expect(screen.getByTestId("totp-secret").textContent).toBe(
      groupSecret(SECRET),
    );

    await user.type(screen.getByLabelText("6-digit code"), "123456");
    await user.click(
      screen.getByRole("button", { name: "Confirm and finish" }),
    );
    expect(await screen.findByText("ABCDE-FGHJK")).toBeTruthy();
    // The secret and QR code are gone once set-up is done.
    expect(screen.queryByTestId("totp-secret")).toBeNull();
    expect(screen.queryByRole("img", { name: /QR code/ })).toBeNull();

    // Continuing needs the "saved" confirmation.
    expect(
      screen.queryByRole("link", { name: "Continue to sign-in" }),
    ).toBeNull();
    await user.click(screen.getByLabelText("I have saved my recovery codes"));
    await user.click(screen.getByRole("link", { name: "Continue to sign-in" }));
    expect(await screen.findByText("Sign-in screen")).toBeTruthy();

    // Requests: the token only in JSON bodies, never in a URL; the secret never sent.
    for (const c of calls) {
      expect(c.path).not.toContain(TOKEN);
      expect(JSON.stringify(c.body ?? {})).not.toContain(SECRET);
    }
    expect(
      calls.find((c) => c.path === "/admin/auth/invites/accept")?.body,
    ).toEqual({
      token: TOKEN,
      name: "Esha Editor",
      password: "correct horse battery",
      code: "123456",
    });
    // Nothing kept in browser storage.
    expect(localStorage.length + sessionStorage.length).toBe(0);
  });

  it("shows a wrong code next to the field and lets the admin try again", async () => {
    const user = userEvent.setup();
    let n = 0;
    stubApi({
      ...base,
      "POST /admin/auth/invites/accept": () =>
        ++n === 1
          ? apiError(400, "VALIDATION_FAILED", "The request is not valid.", [
              { path: "code", code: "MFA_CODE_INVALID" },
            ])
          : { status: 201, body: { recoveryCodes: ["ABCDE-FGHJK"] } },
    });
    open();
    await fillDetails(user);
    const code = await screen.findByLabelText("6-digit code");
    await user.type(code, "000000");
    await user.click(
      screen.getByRole("button", { name: "Confirm and finish" }),
    );
    await waitFor(() => expect(code.getAttribute("aria-invalid")).toBe("true"));
    const describedBy = code.getAttribute("aria-describedby") ?? "";
    expect(
      document.getElementById(describedBy.split(" ").at(-1)!)?.textContent,
    ).toMatch(/not correct/);
    await user.type(code, "654321");
    await user.click(
      screen.getByRole("button", { name: "Confirm and finish" }),
    );
    expect(await screen.findByText("ABCDE-FGHJK")).toBeTruthy();
  });

  it("returns to the password step when the API rejects the password", async () => {
    const user = userEvent.setup();
    stubApi({
      ...base,
      "POST /admin/auth/invites/accept": apiError(
        400,
        "PASSWORD_REJECTED",
        "Choose a different password.",
        [{ path: "password", code: "TOO_COMMON" }],
      ),
    });
    open();
    await fillDetails(user);
    await user.type(await screen.findByLabelText("6-digit code"), "123456");
    await user.click(
      screen.getByRole("button", { name: "Confirm and finish" }),
    );
    const password = await screen.findByLabelText("New password");
    expect(password.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getAllByText(/too common/).length).toBeGreaterThan(0);
  });

  it("checks the password locally before asking for an authenticator", async () => {
    const user = userEvent.setup();
    const { calls } = stubApi(base);
    open();
    await user.type(await screen.findByLabelText("Your name"), "E");
    await user.type(screen.getByLabelText("New password"), "short");
    await user.click(
      screen.getByRole("button", { name: "Continue to two-factor set-up" }),
    );
    expect(await screen.findByText("Use at least 12 characters.")).toBeTruthy();
    expect(calls.some((c) => c.path === "/admin/auth/invites/enrol")).toBe(
      false,
    );
  });

  it("explains an invalid or expired link", async () => {
    stubApi({
      ...base,
      "POST /admin/auth/invites/inspect": apiError(
        400,
        "INVITE_INVALID",
        "This link is not valid or has expired.",
      ),
    });
    open();
    expect(
      await screen.findByText("This link is not valid or has expired."),
    ).toBeTruthy();
    expect(screen.getByText(/expire after 48 hours/)).toBeTruthy();
  });

  it("cancels back to sign-in without completing anything", async () => {
    const user = userEvent.setup();
    const { calls } = stubApi(base);
    open();
    await user.click(await screen.findByRole("link", { name: "Cancel" }));
    expect(await screen.findByText("Sign-in screen")).toBeTruthy();
    expect(calls.some((c) => c.path === "/admin/auth/invites/accept")).toBe(
      false,
    );
  });
});

describe("helpers", () => {
  it("reads only a well-formed token from the fragment", () => {
    expect(tokenFromHash(`#token=${TOKEN}`)).toBe(TOKEN);
    expect(tokenFromHash("#token=")).toBeNull();
    expect(tokenFromHash("#token=<script>")).toBeNull();
    expect(tokenFromHash("")).toBeNull();
  });

  it("applies the API's length rule", () => {
    expect(passwordProblem("a".repeat(11))).toMatch(/12/);
    expect(passwordProblem("a".repeat(12))).toBeNull();
    expect(passwordProblem("a".repeat(129))).toMatch(/128/);
  });

  it("the QR matrix decodes back to the exact provisioning URI", () => {
    const matrix = encodeQR(URI, "raw", { ecc: "medium" });
    const scale = 4;
    const quiet = 4;
    const size = (matrix.length + quiet * 2) * scale;
    const data = new Uint8ClampedArray(size * size * 4).fill(255);
    matrix.forEach((row, y) =>
      row.forEach((dark, x) => {
        if (!dark) return;
        for (let dy = 0; dy < scale; dy += 1)
          for (let dx = 0; dx < scale; dx += 1) {
            const i =
              (((y + quiet) * scale + dy) * size + (x + quiet) * scale + dx) *
              4;
            data[i] = data[i + 1] = data[i + 2] = 0;
          }
      }),
    );
    expect(decodeQR({ width: size, height: size, data })).toBe(URI);
  });
});
