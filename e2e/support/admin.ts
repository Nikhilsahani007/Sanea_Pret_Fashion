import {
  expect,
  type Browser,
  type BrowserContextOptions,
  type Page,
} from "@playwright/test";

import { ADMINS, PASSWORD, type Role } from "./env.ts";
import { totp } from "./totp.ts";

/** Signs in through the real two-step form. */
export async function signIn(page: Page, role: Role) {
  const a = ADMINS[role];
  await page.goto("/");
  await page.getByLabel("Email").fill(a.email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Authenticator code").fill(totp(Buffer.from(a.secret)));
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("navigation", { name: "Admin" })).toBeVisible();
}

// The API allows 10 sign-in requests per 15 minutes per IP (D-074), so each
// role signs in once and later tests reuse its session cookies.
const saved = new Map<Role, BrowserContextOptions["storageState"]>();

export async function rememberSession(page: Page, role: Role) {
  saved.set(role, await page.context().storageState());
}

export async function pageAs(
  browser: Browser,
  role: Role,
  viewport?: { width: number; height: number },
): Promise<Page> {
  const state = saved.get(role);
  const context = await browser.newContext({
    baseURL: "http://localhost:5174",
    ...(state ? { storageState: state } : {}),
    ...(viewport ? { viewport } : { viewport: { width: 1440, height: 900 } }),
  });
  const page = await context.newPage();
  if (state) {
    await page.goto("/");
    await expect(page.getByRole("navigation", { name: "Admin" })).toBeVisible();
  } else {
    await signIn(page, role);
    await rememberSession(page, role);
  }
  return page;
}
