// Listing filters and sort, kept in the URL so a filtered listing can be
// shared and survives a reload (phase-13-plan.md §2). Only the parameters the
// catalogue API documents are read; anything else in the address is ignored.

export const SORTS = {
  newest: "Newest",
  price_asc: "Price, low to high",
  price_desc: "Price, high to low",
} as const;
export type Sort = keyof typeof SORTS;

export type Filters = {
  sizes: string[];
  colours: string[];
  /** The price band's lower bound in paise, or null for any price. */
  band: number | null;
  inStock: boolean;
  sort: Sort;
};

/** Fixed price bands (api-specification.md §3): the upper bound is exclusive. */
export const PRICE_BANDS: readonly { min: number; max: number | null }[] = [
  { min: 0, max: 100_000 },
  { min: 100_000, max: 200_000 },
  { min: 200_000, max: 300_000 },
  { min: 300_000, max: 500_000 },
  { min: 500_000, max: null },
];

const isSort = (v: string | null): v is Sort =>
  v !== null && Object.hasOwn(SORTS, v);

export function readFilters(params: URLSearchParams): Filters {
  const sort = params.get("sort");
  const band = Number(params.get("price"));
  return {
    sizes: params.getAll("size").filter(Boolean).slice(0, 10),
    colours: params.getAll("colour").filter(Boolean).slice(0, 20),
    band:
      PRICE_BANDS.some((b) => b.min === band) && params.has("price")
        ? band
        : null,
    inStock: params.get("inStock") === "true",
    sort: isSort(sort) ? sort : "newest",
  };
}

/** The address's query string for a set of filters (defaults left out). */
export function writeFilters(f: Filters): URLSearchParams {
  const params = new URLSearchParams();
  for (const size of f.sizes) params.append("size", size);
  for (const colour of f.colours) params.append("colour", colour);
  if (f.band !== null) params.set("price", String(f.band));
  if (f.inStock) params.set("inStock", "true");
  if (f.sort !== "newest") params.set("sort", f.sort);
  return params;
}

/** The catalogue API query for a listing scope and its filters. */
export function apiQuery(
  scope: { category?: string; collection?: string },
  f: Filters,
  limit: number,
  cursor?: string,
): string {
  const q = new URLSearchParams();
  if (scope.category) q.set("category", scope.category);
  if (scope.collection) q.set("collection", scope.collection);
  for (const size of f.sizes) q.append("size", size);
  for (const colour of f.colours) q.append("colour", colour);
  const band = PRICE_BANDS.find((b) => b.min === f.band);
  if (band) {
    if (band.min > 0) q.set("priceMin", String(band.min));
    // priceMax is inclusive in the API; the band's upper bound is not.
    if (band.max !== null) q.set("priceMax", String(band.max - 1));
  }
  if (f.inStock) q.set("inStock", "true");
  q.set("sort", f.sort);
  q.set("limit", String(limit));
  if (cursor) q.set("cursor", cursor);
  return q.toString();
}

export const activeCount = (f: Filters) =>
  f.sizes.length +
  f.colours.length +
  (f.band === null ? 0 : 1) +
  (f.inStock ? 1 : 0);

export function bandLabel(
  b: { min: number; max: number | null },
  rupees: (paise: number) => string,
): string {
  if (b.min === 0 && b.max !== null) return `Under ${rupees(b.max)}`;
  if (b.max === null) return `${rupees(b.min)} and over`;
  return `${rupees(b.min)} to ${rupees(b.max)}`;
}
