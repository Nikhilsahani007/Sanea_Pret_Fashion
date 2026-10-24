// Lighthouse on the production storefront build (testing-strategy.md §2,
// Phase 17, D-165): landing, listing, product and checkout, Lighthouse's
// default mobile profile with simulated throttling, three runs per page, the
// median judged against performance ≥ 85 and accessibility ≥ 95. Reports go
// to docs/reviews/lighthouse/<date>/. The demo seed's placeholder images and a
// local API make the numbers provisional (B-06, Phase 19 staging).
//
//   TEST_DATABASE_URL=postgresql://…@127.0.0.1:5433/sanea_test \
//   CHROME_PATH=/path/to/chromium npm run lighthouse
import { execFile, spawn } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const root = join(import.meta.dirname, "..");
const STORE = "http://localhost:5173";
const RUNS = 3;
const BUDGET = { performance: 85, accessibility: 95 };
const PAGES = [
  ["landing", "/"],
  ["listing", "/shop/test-demo-kurtas"],
  ["product", "/products/test-demo-kurta-a"],
  ["checkout", "/checkout"],
] as const;

if (!process.env.TEST_DATABASE_URL)
  throw new Error("TEST_DATABASE_URL is not set");
if (!process.env.CHROME_PATH) throw new Error("CHROME_PATH is not set");

const date = new Date().toISOString().slice(0, 10);
const out = join(root, "docs", "reviews", "lighthouse", date);
mkdirSync(out, { recursive: true });

const stack = spawn(process.execPath, ["e2e/support/start-stack.ts"], {
  cwd: root,
  env: { ...process.env, STOREFRONT_MODE: "preview" },
  stdio: ["ignore", "inherit", "inherit"],
});
const stop = () => stack.kill("SIGTERM");
process.on("exit", stop);

async function waitFor(url: string, ms: number) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`${url} did not start`);
}

/** A bag with one TEST item, so the checkout page shows the form. */
async function bagCookie(): Promise<string> {
  const csrf = await fetch(`${STORE}/api/v1/auth/csrf`);
  const csrfCookie = csrf.headers.getSetCookie()[0]!.split(";")[0]!;
  const { csrfToken } = (await csrf.json()) as { csrfToken: string };
  const product = (await (
    await fetch(`${STORE}/api/v1/catalogue/products/test-demo-dupatta-a`)
  ).json()) as { product: { variants: { id: string }[] } };
  const add = await fetch(`${STORE}/api/v1/cart/items`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: STORE,
      Cookie: csrfCookie,
      "X-CSRF-Token": csrfToken,
    },
    body: JSON.stringify({
      variantId: product.product.variants[0]!.id,
      quantity: 1,
    }),
  });
  if (!add.ok) throw new Error(`could not add to the bag: ${add.status}`);
  return add.headers.getSetCookie()[0]!.split(";")[0]!;
}

const median = (xs: number[]) =>
  [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;

try {
  await waitFor(`${STORE}/`, 300_000);
  await waitFor(`${STORE}/api/v1/health`, 60_000);
  const cookie = await bagCookie();
  const summary: Record<string, unknown> = {};
  let failed = false;
  for (const [name, path] of PAGES) {
    const scores: {
      performance: number;
      accessibility: number;
      file: string;
    }[] = [];
    for (let i = 1; i <= RUNS; i++) {
      const base = join(out, `${name}-run${i}`);
      await run(
        join(root, "node_modules", ".bin", "lighthouse"),
        [
          `${STORE}${path}`,
          "--only-categories=performance,accessibility",
          "--output=json",
          "--output=html",
          `--output-path=${base}`,
          "--chrome-flags=--headless=new --no-sandbox",
          "--quiet",
          ...(name === "checkout"
            ? [`--extra-headers=${JSON.stringify({ Cookie: cookie })}`]
            : []),
        ],
        { cwd: root, maxBuffer: 64 * 1024 * 1024 },
      );
      const report = JSON.parse(
        readFileSync(`${base}.report.json`, "utf8"),
      ) as {
        categories: Record<string, { score: number | null }>;
      };
      scores.push({
        performance: Math.round(
          (report.categories.performance?.score ?? 0) * 100,
        ),
        accessibility: Math.round(
          (report.categories.accessibility?.score ?? 0) * 100,
        ),
        file: base,
      });
    }
    const perf = median(scores.map((s) => s.performance));
    const a11y = median(scores.map((s) => s.accessibility));
    // Keep the HTML of the run closest to the median performance; drop the rest.
    const keep = scores.find((s) => s.performance === perf)!;
    for (const s of scores) {
      if (s === keep) {
        // The report records the request headers: keep the bag cookie out.
        for (const ext of ["html", "json"]) {
          const text = readFileSync(`${s.file}.report.${ext}`, "utf8");
          writeFileSync(
            join(out, `${name}.${ext}`),
            cookie ? text.replaceAll(cookie, "[redacted]") : text,
          );
        }
      }
      rmSync(`${s.file}.report.html`);
      rmSync(`${s.file}.report.json`);
    }
    const ok = perf >= BUDGET.performance && a11y >= BUDGET.accessibility;
    if (!ok) failed = true;
    summary[name] = {
      path,
      runs: scores.map(({ performance, accessibility }) => ({
        performance,
        accessibility,
      })),
      medianPerformance: perf,
      medianAccessibility: a11y,
      meetsBudget: ok,
    };
    console.log(
      `${name.padEnd(9)} performance ${perf}, accessibility ${a11y}${ok ? "" : "  BELOW BUDGET"}`,
    );
  }
  writeFileSync(
    join(out, "summary.json"),
    JSON.stringify(
      {
        date,
        profile: "Lighthouse 13.5.0 default mobile, simulated throttling",
        data: "demo seed, placeholder images, local API",
        budget: BUDGET,
        pages: summary,
      },
      null,
      2,
    ) + "\n",
  );
  process.exitCode = failed ? 1 : 0;
} finally {
  stop();
}
