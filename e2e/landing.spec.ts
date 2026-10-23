// Landing page end to end (phase-12-plan.md §6; testing-strategy.md §5; index
// Phase 12). L-8 runs first on an empty landing; the rest run on the
// development placeholders seeded by support/seed-landing.ts, which are
// labelled "PLACEHOLDER" and cannot pass the visual gate (D-120, B-06).
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const SHOP = "http://localhost:5173";
const SHOTS = `docs/reviews/landing/${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date())}`;
const VIEWPORTS = [
  { name: "1440", width: 1440, height: 900 },
  { name: "1024", width: 1024, height: 768 },
  { name: "768", width: 768, height: 1024 },
  { name: "390", width: 390, height: 844 },
  { name: "360", width: 360, height: 800 },
] as const;

test.describe.configure({ mode: "serial" });

async function axe(page: Page, label: string) {
  // Entrance animations fade content in; measure contrast once they end.
  await page.waitForFunction(() =>
    document
      .getAnimations()
      // Scroll-driven animations (the monument) never finish; skip them.
      .filter((a) => a.timeline instanceof DocumentTimeline)
      .every((a) => a.playState !== "running"),
  );
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    result.violations.map(
      (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
    ),
    `axe on ${label}`,
  ).toEqual([]);
}

const overflow = (page: Page) =>
  page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );

test("L-8: with nothing published the monument stands alone", async ({
  page,
}) => {
  await page.goto(SHOP);
  await expect(
    page.getByRole("heading", { name: "Sanéa Pret", level: 1 }),
  ).toBeAttached();
  await expect(page.getByRole("region", { name: "Sanéa Pret" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Show slide/ })).toHaveCount(0);
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  await axe(page, "empty landing");
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/landing-empty-1440.png` });
});

test("seed the development placeholders", () => {
  execFileSync(process.execPath, ["e2e/support/seed-landing.ts"], {
    env: process.env,
    stdio: "pipe",
  });
});

test("L-1, L-2, L-4, L-6, L-7: the composition at every viewport, with screenshots", async ({
  page,
}) => {
  mkdirSync(SHOTS, { recursive: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const v of VIEWPORTS) {
    await page.setViewportSize({ width: v.width, height: v.height });
    await page.goto(SHOP);
    await expect(page.getByRole("heading", { name: "New Ins" })).toBeVisible({
      timeout: 15_000,
    });
    await page.waitForLoadState("networkidle");
    const carousel = page.locator("[aria-roledescription='carousel']");
    const box = (await carousel.boundingBox())!;
    // L-1: the hero fills the viewport below its top edge; on a phone a
    // little less, so the top of New Ins shows.
    const bottom = box.y + box.height;
    if (v.width < 768) {
      expect(bottom, `hero bottom at ${v.name}`).toBeLessThan(v.height);
      expect(bottom, `hero bottom at ${v.name}`).toBeGreaterThan(
        v.height - 140,
      );
      const newIns = (await page
        .getByRole("heading", { name: "New Ins" })
        .boundingBox())!;
      expect(newIns.y, `New Ins visible at ${v.name}`).toBeLessThan(v.height);
    } else {
      expect(
        Math.abs(bottom - v.height),
        `hero bottom at ${v.name}`,
      ).toBeLessThanOrEqual(2);
    }
    // L-2: the monument is one image inside the viewport.
    const monument = (await carousel
      .locator("img[aria-hidden='true']")
      .boundingBox())!;
    expect(monument.x).toBeGreaterThanOrEqual(0);
    expect(monument.x + monument.width).toBeLessThanOrEqual(v.width);
    // L-4 and L-7: the order of D-012, and nothing about the Foundation.
    const order = await page.evaluate(() =>
      [
        ...document.querySelectorAll(
          "[aria-roledescription='carousel'], h2#new-ins, h2#row-2, main [role='tablist']",
        ),
      ].map(
        (el) =>
          el.getAttribute("aria-roledescription") ??
          el.getAttribute("role") ??
          el.textContent,
      ),
    );
    expect(order).toEqual([
      "carousel",
      "New Ins",
      "TEST The second row",
      "tablist",
    ]);
    await expect(page.getByText(/Rehma|Foundation/)).toHaveCount(0);
    // L-6
    expect(await overflow(page), `overflow at ${v.name}`).toBeLessThanOrEqual(
      0,
    );
    await axe(page, `landing at ${v.name}`);
    await page.screenshot({
      path: `${SHOTS}/landing-first-screen-${v.name}.png`,
    });
    await page.screenshot({
      path: `${SHOTS}/landing-full-${v.name}.png`,
      fullPage: true,
    });
  }
});

test("L-3: indicators, pause, focus and reduced motion", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(SHOP);
  const carousel = page.locator("[aria-roledescription='carousel']");
  await expect(carousel).toHaveAttribute("data-playing", "true");
  const slide = (n: number) =>
    page.locator(`[aria-roledescription='slide'][aria-label='${n} of 3']`);
  await page.getByRole("button", { name: "Show slide 2 of 3" }).click();
  await expect(slide(2)).toHaveAttribute("aria-hidden", "false");
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${SHOTS}/landing-hero-slide-2-390.png` });
  // Focus inside (on the indicator) stops it.
  await expect(carousel).toHaveAttribute("data-playing", "false");
  await page.getByRole("button", { name: "Pause slides" }).click();
  await expect(carousel).toHaveAttribute("data-playing", "false");
  await expect(page.getByRole("button", { name: "Play slides" })).toBeVisible();
  // Under reduced motion it never plays, and the button says so.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await expect(carousel).toHaveAttribute("data-playing", "false");
  await expect(
    page.getByRole("button", { name: "Play slides" }),
  ).toBeDisabled();
});

test("L-5: pills, search and bag by keyboard; the size picker from New Ins", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(SHOP);
  await expect(page.getByRole("heading", { name: "New Ins" })).toBeVisible();
  // Keyboard: the bag opens and closes with focus returned.
  const bag = page.getByRole("button", { name: /^Bag, / });
  await bag.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Your bag" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(bag).toBeFocused();
  // The size picker from the first New Ins card.
  const first = page
    .getByRole("region", { name: "New Ins" })
    .getByRole("button", { name: /^Add .* to bag$/ })
    .first();
  await first.click();
  const sheet = page.getByRole("dialog", { name: /^Add / });
  await expect(
    sheet.getByRole("button", { name: "Choose a size" }),
  ).toBeDisabled();
  await axe(page, "size picker from New Ins at 390");
  await page.screenshot({ path: `${SHOTS}/landing-size-picker-390.png` });
  await page.keyboard.press("Escape");
  // Search from the header by keyboard.
  await page.getByRole("combobox", { name: "Search the shop" }).focus();
  await page.keyboard.type("Landing");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/search\?q=Landing/);
});
