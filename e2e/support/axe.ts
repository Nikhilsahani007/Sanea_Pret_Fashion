// axe-core scan shared by the accessibility checks (D-165): WCAG 2.0, 2.1 and
// 2.2 A and AA rules; serious and critical violations are returned.
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

export async function scan(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const blocking = result.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.slice(0, 3).map((n) => n.target.join(" ")),
    }));
  return blocking;
}
