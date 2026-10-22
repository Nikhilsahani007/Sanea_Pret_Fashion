// Publishing rules (D-083, Q8-6). A product is published only when its
// category is published, it has at least one active variant and a primary
// image (alt text is required by the database). Publishing sets
// `publishedAt` the first time and keeps it afterwards; there is no scheduled
// publishing. A slug cannot change once `publishedAt` is set.

export const PUBLISH_PROBLEMS = [
  "CATEGORY_NOT_PUBLISHED",
  "NO_ACTIVE_VARIANT",
  "NO_PRIMARY_IMAGE",
] as const;
export type PublishProblem = (typeof PUBLISH_PROBLEMS)[number];

export function publishProblems(product: {
  readonly categoryStatus: string;
  readonly activeVariants: number;
  readonly primaryImages: number;
}): PublishProblem[] {
  const problems: PublishProblem[] = [];
  if (product.categoryStatus !== "PUBLISHED")
    problems.push("CATEGORY_NOT_PUBLISHED");
  if (product.activeVariants < 1) problems.push("NO_ACTIVE_VARIANT");
  if (product.primaryImages < 1) problems.push("NO_PRIMARY_IMAGE");
  return problems;
}

/** `publishedAt` after publishing: the first date is kept on re-publish. */
export function publishedAtFor(current: Date | null, now: Date): Date {
  return current ?? now;
}

export function slugLocked(publishedAt: Date | null): boolean {
  return publishedAt !== null;
}
