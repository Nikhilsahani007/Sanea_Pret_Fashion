// Phase 12 landing page: testing-strategy.md §5 and the screenshots listed in
// the index (docs/reviews/landing/<date>/). Runs on the demo seed: TEST data
// and grey placeholder images, so these screenshots are for layout review
// only; the gate cannot pass on placeholders (D-120).
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const shots = join(
  import.meta.dirname,
  "..",
  "docs",
  "reviews",
  "landing",
  "2026-10-24",
);
mkdirSync(shots, { recursive: true });
test.use({ baseURL: "http://localhost:5173" });

const VIEWPORTS = [
  { name: "desktop-large", width: 1440, height: 900 },
  { name: "desktop-small", width: 1024, height: 768 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "mobile", width: 390, height: 844 },
  { name: "mobile-small", width: 360, height: 800 },
] as const;

/** Scrolls through the page so lazy images and entrances run, then back to the top. */
async function settle(page: Page) {
  await page.evaluate(async () => {
    for (
      let y = 0;
      y < document.body.scrollHeight;
      y += window.innerHeight / 2
    ) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 120));
    }
    window.scrollTo(0, 0);
    // Images scrolled past have started loading; offscreen ones in the
    // horizontal rows stay lazy, so wait a bounded time only.
    await Promise.race([
      Promise.all(
        [...document.images]
          .filter(
            (i) =>
              !i.complete &&
              i.getBoundingClientRect().right <= window.innerWidth,
          )
          .map(
            (i) =>
              new Promise((r) => i.addEventListener("load", r, { once: true })),
          ),
      ),
      new Promise((r) => setTimeout(r, 3000)),
    ]);
  });
  await page.waitForTimeout(600);
}

async function geometry(page: Page) {
  return page.evaluate(() => {
    const hero = document
      .querySelector("section[aria-roledescription='carousel']")!
      .getBoundingClientRect();
    const header = document.querySelector("header")!.getBoundingClientRect();
    const mark = document.querySelector(
      "section[aria-roledescription='carousel'] h1",
    )!;
    const range = document.createRange();
    range.selectNodeContents(mark);
    const markBox = range.getBoundingClientRect();
    const markLines = Math.round(
      (mark as HTMLElement).clientHeight /
        parseFloat(getComputedStyle(mark).lineHeight),
    );
    const main = document.querySelector("main")!;
    const sections = [...main.children].filter(
      (el) => el.tagName === "SECTION",
    );
    return {
      heroTop: hero.top,
      heroBottom: hero.bottom,
      headerBottom: header.bottom,
      markLeft: markBox.left,
      markRight: markBox.right,
      markLines,
      order: sections.map(
        (el) =>
          el.getAttribute("aria-label") ??
          el.querySelector("h2")?.textContent ??
          "",
      ),
      overflow: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
}

for (const vp of VIEWPORTS) {
  test(`${vp.name} ${vp.width}×${vp.height}: hero fills the first screen, wordmark fits, New Ins next, no sideways scroll`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "SANÉA PRET", level: 1 }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "New Ins" })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const g = await geometry(page);
    // Directly below the header, to the bottom of the viewport (phones keep the top of New Ins in view).
    expect(Math.abs(g.heroTop - g.headerBottom)).toBeLessThanOrEqual(1);
    const target = vp.width <= 640 ? vp.height - 72 : vp.height;
    expect(Math.abs(g.heroBottom - target)).toBeLessThanOrEqual(2);
    expect(g.markLeft).toBeGreaterThanOrEqual(0);
    expect(g.markRight).toBeLessThanOrEqual(vp.width);
    expect(g.markLines).toBe(vp.width <= 640 ? 2 : 1);
    expect(g.order[0]).toBe("Campaign");
    expect(g.order[1]).toBe("New Ins");
    expect(g.overflow).toBeLessThanOrEqual(0);
    if (vp.width <= 640) {
      const newIns = await page
        .getByRole("heading", { name: "New Ins" })
        .boundingBox();
      expect(newIns!.y).toBeLessThan(vp.height);
    }
    await page.screenshot({
      path: join(shots, `${vp.name}-${vp.width}-first-screen.png`),
    });
    await settle(page);
    await page.screenshot({
      path: join(shots, `${vp.name}-${vp.width}-full-page.png`),
      fullPage: true,
    });
  });
}

test("carousel: indicators change the slide; mobile hero slide 2", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByText("TEST campaign line, replace with the real campaign"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Show slide 2 of 2" }).click();
  await expect(page.getByText("TEST second campaign line")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Show slide 2 of 2" }),
  ).toHaveAttribute("aria-current", "true");
  await page.waitForTimeout(700); // the 600 ms crossfade
  await page.screenshot({ path: join(shots, "mobile-390-hero-slide-2.png") });
});

test("carousel: auto-advances, and pause, focus and hover stop it", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("/");
  await expect(
    page.getByText("TEST campaign line, replace with the real campaign"),
  ).toBeVisible();
  await page.mouse.move(5, 5); // keep the pointer off the hero
  await page.clock.fastForward(6_500);
  await expect(page.getByText("TEST second campaign line")).toBeVisible();
  await page.getByRole("button", { name: /^Pause/ }).click();
  await page.mouse.move(5, 5);
  await page.getByRole("button", { name: /^Play/ }).blur();
  await page.clock.fastForward(20_000);
  await expect(page.getByText("TEST second campaign line")).toBeVisible();
  // Play again, then focus inside the hero holds it.
  await page.getByRole("button", { name: /^Play/ }).click();
  await page.getByRole("button", { name: "Show slide 1 of 2" }).focus();
  await page.clock.fastForward(20_000);
  await expect(page.getByText("TEST second campaign line")).toBeVisible();
});

test("carousel: reduced motion turns auto-advance off", async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: "http://localhost:5173",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await page.clock.install();
  await page.goto("/");
  await expect(page.getByRole("button", { name: /^Play/ })).toBeVisible();
  await page.clock.fastForward(20_000);
  await expect(
    page.getByText("TEST campaign line, replace with the real campaign"),
  ).toBeVisible();
  await context.close();
});

test("size sheet from New Ins: sold-out sizes disabled, nothing added without a size", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const newIns = page.locator("section", {
    has: page.getByRole("heading", { name: "New Ins" }),
  });
  await newIns
    .getByRole("button", { name: "Add TEST Kurta B: choose a size" })
    .click();
  const sheet = page.getByRole("dialog", { name: "TEST Kurta B" });
  await expect(sheet).toBeVisible();
  await expect(
    sheet.getByRole("button", { name: "L, sold out" }),
  ).toBeDisabled();
  await expect(
    sheet.getByRole("button", { name: "Choose a size" }),
  ).toBeDisabled();
  await page.screenshot({
    path: join(shots, "mobile-390-size-picker-from-new-ins.png"),
  });
  await sheet.getByRole("button", { name: "M", exact: true }).click();
  await expect(sheet.getByText(/^Only \d+ left$/)).toBeVisible();
  await sheet.getByRole("button", { name: "Add to bag" }).click();
  const bag = page.getByRole("dialog", { name: /^Bag/ });
  await expect(bag).toBeVisible();
  await expect(bag.getByRole("link", { name: "TEST Kurta B" })).toBeVisible();
});

test("keyboard: pills, search and bag are reachable and work", async ({
  page,
}) => {
  await page.goto("/");
  const pill = page
    .getByRole("navigation", { name: "Categories" })
    .getByRole("link", { name: "Kurtas" });
  await pill.focus();
  await expect(pill).toBeFocused();
  await page.getByRole("button", { name: "Search" }).focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("combobox", { name: "Search the shop" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /^Bag, / }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: /^Bag/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: /^Bag, / })).toBeFocused();
});

test("tabs: arrow keys switch the grid", async ({ page }) => {
  await page.goto("/");
  const tabs = page.getByRole("tablist");
  await tabs.getByRole("tab", { name: "Kurtas" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(tabs.getByRole("tab", { name: "Co-ord sets" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(
    page.getByRole("tabpanel").getByRole("link", { name: "TEST Co-ord Set A" }),
  ).toBeVisible();
});
