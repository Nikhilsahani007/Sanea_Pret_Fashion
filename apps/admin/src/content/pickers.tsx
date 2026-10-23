// Shared pieces of the content editors: the reference lists (categories,
// collections, products, pages, images) and pickers for link targets, product
// sources, images and India Standard Time dates.
import { api, query } from "../api/client.ts";
import type {
  Category,
  Collection,
  List,
  MediaAsset,
  Page,
  PageView,
  ProductSummary,
  Target,
} from "../api/types.ts";
import { isoToLocal, localToIso } from "../lib/format.ts";
import { useResource } from "../lib/resource.ts";
import { SelectField, TextField } from "../ui/controls.tsx";
import { Stack, ui } from "../ui/feedback.tsx";
import { thumbOf } from "../catalogue/RichTextEditor.tsx";
import s from "./content.module.css";

export type Refs = {
  categories: Category[];
  collections: Collection[];
  products: ProductSummary[];
  pages: PageView[];
  media: MediaAsset[];
};

async function all<T>(path: string, signal: AbortSignal): Promise<T[]> {
  const out: T[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 20; i += 1) {
    const page = await api.get<Page<T>>(
      `${path}${query({ limit: 100, cursor })}`,
      { signal },
    );
    out.push(...page.items);
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  }
  return out;
}

/** Everything a content editor may point at, loaded once per screen. */
export function useRefs() {
  return useResource<Refs>(async (signal) => {
    const [categories, collections, pages, products, media] = await Promise.all(
      [
        api.get<List<Category>>("/admin/categories", { signal }),
        api.get<List<Collection>>("/admin/collections", { signal }),
        api.get<List<PageView>>("/admin/content/pages", { signal }),
        all<ProductSummary>("/admin/products", signal),
        all<MediaAsset>("/admin/media", signal),
      ],
    );
    return {
      categories: categories.items,
      collections: collections.items,
      pages: pages.items,
      products,
      media,
    };
  }, []);
}

const KIND_LABELS = {
  CATEGORY: "Category",
  COLLECTION: "Collection",
  PRODUCT: "Product",
  PAGE: "Page",
} as const;

/** Options for one entity kind, marking what is not public yet. */
function options(refs: Refs, kind: keyof typeof KIND_LABELS) {
  switch (kind) {
    case "CATEGORY":
      return refs.categories.map((c) => ({
        id: c.id,
        label: c.name,
        note: c.status !== "PUBLISHED" ? " (not published)" : "",
      }));
    case "COLLECTION":
      return refs.collections.map((c) => ({
        id: c.id,
        label: c.name,
        note: c.status !== "PUBLISHED" ? " (not published)" : "",
      }));
    case "PRODUCT":
      return refs.products.map((p) => ({
        id: p.id,
        label: p.name,
        note: p.status !== "PUBLISHED" ? " (not published)" : "",
      }));
    case "PAGE":
      return refs.pages.map((p) => ({
        id: p.id,
        label: p.title,
        note: p.status !== "PUBLISHED" ? " (not published)" : "",
      }));
  }
}

/** A link target: an entity (resolved when shown) or an internal path. */
export function TargetPicker({
  label,
  value,
  onChange,
  refs,
  error,
  allowPath = true,
  optional = false,
  idPrefix,
}: {
  label: string;
  value: Target | undefined;
  onChange: (t: Target | undefined) => void;
  refs: Refs;
  error?: string | undefined;
  allowPath?: boolean;
  optional?: boolean;
  idPrefix: string;
}) {
  const kind = value?.kind ?? "";
  return (
    <fieldset className={`${ui.fieldset} ${s.inline}`}>
      <legend>{label}</legend>
      <Stack gap="3">
        <SelectField
          id={`${idPrefix}-kind`}
          label="Links to"
          value={kind}
          optional={optional}
          onChange={(e) => {
            const k = e.target.value;
            if (!k) onChange(undefined);
            else if (k === "PATH") onChange({ kind: "PATH", path: "/" });
            else onChange({ kind: k as keyof typeof KIND_LABELS, id: "" });
          }}
        >
          <option value="">{optional ? "No link" : "Choose"}</option>
          {Object.entries(KIND_LABELS).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
          {allowPath ? (
            <option value="PATH">Page on this site (path)</option>
          ) : null}
        </SelectField>
        {value && value.kind !== "PATH" ? (
          <SelectField
            id={idPrefix}
            label={KIND_LABELS[value.kind]}
            value={value.id}
            error={error}
            onChange={(e) => onChange({ kind: value.kind, id: e.target.value })}
          >
            <option value="">Choose</option>
            {options(refs, value.kind).map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
                {o.note}
              </option>
            ))}
          </SelectField>
        ) : null}
        {value?.kind === "PATH" ? (
          <TextField
            id={idPrefix}
            label="Path"
            hint="For example /search or /collections/eid-edit."
            value={value.path}
            error={error}
            spellCheck={false}
            onChange={(e) => onChange({ kind: "PATH", path: e.target.value })}
          />
        ) : null}
        <p className={ui.hint}>
          A link to something not published is hidden on the shop until it is
          published.
        </p>
      </Stack>
    </fieldset>
  );
}

export type Source =
  | { kind: "NEWEST" }
  | { kind: "COLLECTION" | "CATEGORY"; id: string }
  | { kind: "MANUAL"; productIds: string[] };

/** Where a product row's products come from. */
export function SourcePicker({
  value,
  onChange,
  refs,
  error,
  idPrefix,
}: {
  value: Source;
  onChange: (s: Source) => void;
  refs: Refs;
  error?: string | undefined;
  idPrefix: string;
}) {
  return (
    <Stack gap="3">
      <SelectField
        id={`${idPrefix}-kind`}
        label="Products from"
        value={value.kind}
        onChange={(e) => {
          const k = e.target.value;
          onChange(
            k === "NEWEST"
              ? { kind: "NEWEST" }
              : k === "MANUAL"
                ? { kind: "MANUAL", productIds: [] }
                : { kind: k as "COLLECTION" | "CATEGORY", id: "" },
          );
        }}
      >
        <option value="NEWEST">Newest published products</option>
        <option value="COLLECTION">A collection, in its own order</option>
        <option value="CATEGORY">A category, newest first</option>
        <option value="MANUAL">Products I choose</option>
      </SelectField>
      {value.kind === "COLLECTION" || value.kind === "CATEGORY" ? (
        <SelectField
          id={idPrefix}
          label={value.kind === "COLLECTION" ? "Collection" : "Category"}
          value={value.id}
          error={error}
          onChange={(e) => onChange({ kind: value.kind, id: e.target.value })}
        >
          <option value="">Choose</option>
          {options(refs, value.kind).map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
              {o.note}
            </option>
          ))}
        </SelectField>
      ) : null}
      {value.kind === "MANUAL" ? (
        <fieldset className={ui.fieldset}>
          <legend>Products (up to 24)</legend>
          <div className={s.checkGrid}>
            {refs.products.map((p) => (
              <label key={p.id} className={s.check}>
                <input
                  type="checkbox"
                  checked={value.productIds.includes(p.id)}
                  onChange={(e) =>
                    onChange({
                      kind: "MANUAL",
                      productIds: e.target.checked
                        ? [...value.productIds, p.id]
                        : value.productIds.filter((x) => x !== p.id),
                    })
                  }
                />
                {p.name}
                {p.status !== "PUBLISHED" ? " (not published)" : ""}
              </label>
            ))}
          </div>
          {error ? <p className={ui.error}>{error}</p> : null}
          <p className={ui.hint}>
            Only published products with an available variant are shown on the
            shop.
          </p>
        </fieldset>
      ) : null}
    </Stack>
  );
}

/** An image from the media library, with a thumbnail. */
export function ImageSelect({
  id,
  label,
  value,
  onChange,
  refs,
  error,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (id: string) => void;
  refs: Refs;
  error?: string | undefined;
}) {
  const thumb = thumbOf(refs.media.find((m) => m.id === value));
  return (
    <Stack gap="2">
      <SelectField
        id={id}
        label={label}
        value={value}
        error={error}
        hint="From the media library."
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Choose an image</option>
        {refs.media.map((m) => (
          <option key={m.id} value={m.id}>
            {m.width} × {m.height} px, uploaded{" "}
            {new Date(m.createdAt).toLocaleDateString("en-IN")}
          </option>
        ))}
      </SelectField>
      {thumb ? (
        <img
          className={s.thumb}
          src={thumb.url}
          alt=""
          width={120}
          height={90}
        />
      ) : null}
    </Stack>
  );
}

/** An optional date and time in India Standard Time, stored as ISO with offset. */
export function DateTimeField({
  id,
  label,
  value,
  onChange,
  error,
}: {
  id: string;
  label: string;
  value: string | undefined;
  onChange: (iso: string | undefined) => void;
  error?: string | undefined;
}) {
  return (
    <TextField
      id={id}
      label={label}
      optional
      type="datetime-local"
      hint="India Standard Time."
      value={isoToLocal(value ?? null)}
      error={error}
      onChange={(e) => onChange(localToIso(e.target.value) ?? undefined)}
    />
  );
}
