// Lighthouse on the production storefront build (Phase 17; index budget:
// mobile performance ≥ 85 and accessibility ≥ 95 on landing, listing,
// product and checkout). Starts the end-to-end stack (disposable database,
// API, production builds), loads the fictional demo catalogue (D-187), then
// runs Lighthouse's default mobile profile with simulated throttling three
// times per page and judges the median. Reports go to
// docs/reviews/lighthouse/<date>/. Placeholder images and a local API make
// the numbers provisional until real photographs and hosting exist.
//
//   TEST_DATABASE_URL=postgresql://…@127.0.0.1:5433/sanea_test \
//   CHROME_PATH=/path/to/chrome npm run lighthouse
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const STORE = "http://localhost:5173";
const RUNS = 3;
const BUDGET = { performance: 85, accessibility: 95 };
const PAGES = [
  ["landing", "/"],
  ["listing", "/shop/festive-wear"],
  ["product", "/products/noor-embroidered-suit"],
  ["checkout", "/checkout"],
] as const;

if (!process.env.TEST_DATABASE_URL)
  throw new Error("Set TEST_DATABASE_URL (a disposable sanea_test database).");
if (!process.env.CHROME_PATH)
  throw new Error("Set CHROME_PATH to a Chrome or Chromium executable.");

const date = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
}).format(new Date());
const out = join(root, "docs", "reviews", "lighthouse", date);
mkdirSync(out, { recursive: true });

/** A bag with one demo item, so the checkout page shows its form. */
async function bagCookie(): Promise<string> {
  const csrf = await fetch(`${STORE}/api/v1/auth/csrf`, {
    headers: { Origin: STORE },
  });
  const csrfCookie = csrf.headers.getSetCookie()[0]!.split(";")[0]!;
  const { csrfToken } = (await csrf.json()) as { csrfToken: string };
  const product = (await (
    await fetch(`${STORE}/api/v1/catalogue/products/noor-embroidered-suit`)
  ).json()) as { variants: { id: string }[] };
  const add = await fetch(`${STORE}/api/v1/cart/items`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: STORE,
      Cookie: csrfCookie,
      "X-CSRF-Token": csrfToken,
    },
    body: JSON.stringify({ variantId: product.variants[0]!.id, quantity: 1 }),
  });
  if (!add.ok) throw new Error(`Could not add to the bag: ${add.status}`);
  return add.headers.getSetCookie()[0]!.split(";")[0]!;
}

const median = (xs: number[]) =>
  [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;

const { default: setup } = await import("../e2e/global-setup.ts");
const teardown = await setup();
let failed = false;
try {
  const db = new URL(process.env.TEST_DATABASE_URL);
  db.pathname = "/sanea_test_e2e";
  execFileSync(process.execPath, ["apps/api/src/db/demo-seed.ts"], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: "development",
      DATABASE_URL: db.toString(),
      MEDIA_STORAGE_DIR: process.env.E2E_MEDIA_DIR,
    },
    stdio: "pipe",
  });
  const cookie = await bagCookie();
  const summary: Record<string, unknown> = {};
  for (const [name, path] of PAGES) {
    const runs: { performance: number; accessibility: number; base: string }[] =
      [];
    for (let i = 1; i <= RUNS; i++) {
      const base = join(out, `${name}-run${i}`);
      execFileSync(
        join(root, "node_modules", ".bin", "lighthouse"),
        [
          `${STORE}${path}`,
          "--only-categories=performance,accessibility,best-practices,seo",
          "--output=json",
          "--output=html",
          `--output-path=${base}`,
          "--chrome-flags=--headless=new --no-sandbox",
          "--quiet",
          ...(name === "checkout"
            ? [`--extra-headers=${JSON.stringify({ Cookie: cookie })}`]
            : []),
        ],
        { cwd: root, stdio: "pipe", maxBuffer: 64 * 1024 * 1024 },
      );
      const report = JSON.parse(
        readFileSync(`${base}.report.json`, "utf8"),
      ) as { categories: Record<string, { score: number | null }> };
      const score = (k: string) =>
        Math.round((report.categories[k]?.score ?? 0) * 100);
      runs.push({
        performance: score("performance"),
        accessibility: score("accessibility"),
        base,
      });
    }
    const perf = median(runs.map((r) => r.performance));
    const a11y = median(runs.map((r) => r.accessibility));
    // Keep the reports of the run at the median; the bag cookie is redacted.
    const keep = runs.find((r) => r.performance === perf)!;
    for (const ext of ["html", "json"]) {
      const text = readFileSync(`${keep.base}.report.${ext}`, "utf8");
      writeFileSync(
        join(out, `${name}.${ext}`),
        text.replaceAll(cookie, "[redacted]"),
      );
    }
    const kept = JSON.parse(
      readFileSync(join(out, `${name}.json`), "utf8"),
    ) as {
      categories: Record<string, { score: number | null }>;
      audits: Record<string, { displayValue?: string }>;
    };
    for (const r of runs) {
      rmSync(`${r.base}.report.html`);
      rmSync(`${r.base}.report.json`);
    }
    const ok = perf >= BUDGET.performance && a11y >= BUDGET.accessibility;
    if (!ok) failed = true;
    summary[name] = {
      path,
      runs: runs.map(({ performance, accessibility }) => ({
        performance,
        accessibility,
      })),
      medianPerformance: perf,
      medianAccessibility: a11y,
      bestPractices: Math.round(
        (kept.categories["best-practices"]?.score ?? 0) * 100,
      ),
      seo: Math.round((kept.categories.seo?.score ?? 0) * 100),
      largestContentfulPaint:
        kept.audits["largest-contentful-paint"]?.displayValue,
      cumulativeLayoutShift:
        kept.audits["cumulative-layout-shift"]?.displayValue,
      totalBlockingTime: kept.audits["total-blocking-time"]?.displayValue,
      meetsBudget: ok,
    };
    process.stdout.write(
      `${name.padEnd(9)} performance ${perf}, accessibility ${a11y}${ok ? "" : "  BELOW BUDGET"}\n`,
    );
  }
  writeFileSync(
    join(out, "summary.json"),
    `${JSON.stringify(
      {
        date,
        profile: "Lighthouse default mobile profile, simulated throttling",
        data: "fictional demo catalogue (D-187), placeholder images, local API",
        budget: BUDGET,
        pages: summary,
      },
      null,
      2,
    )}\n`,
  );
} finally {
  await teardown();
}
process.exitCode = failed ? 1 : 0;
