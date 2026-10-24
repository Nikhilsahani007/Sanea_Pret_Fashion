// Controlled pickers for content: a link target, a product source and a
// media image. Options come from the admin catalogue and page lists.
import type { LinkTarget, ProductSource } from "@sanea/shared";
import { useQuery } from "@tanstack/react-query";

import { get } from "../api.ts";
import {
  thumb,
  type Asset,
  type Category,
  type Collection,
  type ProductRow,
} from "../types.ts";
import { Select, TextField, ui } from "./ui.tsx";

type PageRow = { slug: string; title: string; status: string };

export function useTargets() {
  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: () => get<{ categories: Category[] }>("/admin/categories"),
  });
  const collections = useQuery({
    queryKey: ["collections"],
    queryFn: () => get<{ collections: Collection[] }>("/admin/collections"),
  });
  const products = useQuery({
    queryKey: ["products", "all"],
    queryFn: () =>
      get<{ products: ProductRow[] }>("/admin/products", { limit: "100" }),
  });
  const pages = useQuery({
    queryKey: ["pages"],
    queryFn: () => get<{ pages: PageRow[] }>("/admin/content/pages"),
  });
  return {
    CATEGORY:
      categories.data?.categories.map((c) => ({
        slug: c.slug,
        label: c.name,
      })) ?? [],
    COLLECTION:
      collections.data?.collections.map((c) => ({
        slug: c.slug,
        label: c.name,
      })) ?? [],
    PRODUCT:
      products.data?.products.map((p) => ({ slug: p.slug, label: p.name })) ??
      [],
    PAGE:
      pages.data?.pages.map((p) => ({ slug: p.slug, label: p.title })) ?? [],
  };
}

const TYPE_LABELS = {
  CATEGORY: "Category",
  COLLECTION: "Collection",
  PRODUCT: "Product",
  PAGE: "Page",
  URL: "Web address",
} as const;

export function TargetPicker({
  label,
  value,
  onChange,
  optional = false,
}: {
  label: string;
  value: LinkTarget | null;
  onChange: (v: LinkTarget | null) => void;
  optional?: boolean;
}) {
  const targets = useTargets();
  const type = value?.type ?? "";
  return (
    <fieldset className={ui.row} style={{ border: 0, padding: 0, margin: 0 }}>
      <legend className={ui.muted}>{label}</legend>
      <Select
        label="Links to"
        value={type}
        onChange={(e) => {
          const t = e.target.value as LinkTarget["type"] | "";
          if (!t) onChange(null);
          else if (t === "URL") onChange({ type: "URL", href: "/" });
          else
            onChange({
              type: t,
              slug: targets[t][0]?.slug ?? "",
            } as LinkTarget);
        }}
      >
        {optional ? (
          <option value="">Nothing</option>
        ) : (
          <option value="" disabled>
            Choose
          </option>
        )}
        {Object.entries(TYPE_LABELS).map(([k, l]) => (
          <option key={k} value={k}>
            {l}
          </option>
        ))}
      </Select>
      {value && value.type !== "URL" ? (
        <Select
          label={TYPE_LABELS[value.type]}
          value={value.slug}
          onChange={(e) => onChange({ ...value, slug: e.target.value })}
        >
          {targets[value.type].length === 0 ? (
            <option value="">None available</option>
          ) : null}
          {targets[value.type].map((t) => (
            <option key={t.slug} value={t.slug}>
              {t.label}
            </option>
          ))}
        </Select>
      ) : null}
      {value?.type === "URL" ? (
        <TextField
          label="Address"
          value={value.href}
          onChange={(e) => onChange({ type: "URL", href: e.target.value })}
          hint="A path such as /pages/about, or an https:// address."
        />
      ) : null}
    </fieldset>
  );
}

export function SourcePicker({
  value,
  onChange,
}: {
  value: ProductSource;
  onChange: (v: ProductSource) => void;
}) {
  const targets = useTargets();
  return (
    <div className={ui.row}>
      <Select
        label="Products from"
        value={value.type}
        onChange={(e) => {
          const t = e.target.value as ProductSource["type"];
          if (t === "NEWEST") onChange({ type: "NEWEST" });
          else if (t === "MANUAL")
            onChange({
              type: "MANUAL",
              slugs: targets.PRODUCT.slice(0, 1).map((p) => p.slug),
            });
          else onChange({ type: t, slug: targets[t][0]?.slug ?? "" });
        }}
      >
        <option value="NEWEST">Newest products</option>
        <option value="COLLECTION">A collection</option>
        <option value="CATEGORY">A category</option>
        <option value="MANUAL">Chosen products</option>
      </Select>
      {value.type === "COLLECTION" || value.type === "CATEGORY" ? (
        <Select
          label={value.type === "COLLECTION" ? "Collection" : "Category"}
          value={value.slug}
          onChange={(e) => onChange({ ...value, slug: e.target.value })}
        >
          {targets[value.type].map((t) => (
            <option key={t.slug} value={t.slug}>
              {t.label}
            </option>
          ))}
        </Select>
      ) : null}
      {value.type === "MANUAL" ? (
        <Select
          label="Products (hold Ctrl or Cmd to choose several)"
          multiple
          value={value.slugs}
          onChange={(e) =>
            onChange({
              type: "MANUAL",
              slugs: [...e.target.selectedOptions].map((o) => o.value),
            })
          }
          style={{ minHeight: "8rem" }}
        >
          {targets.PRODUCT.map((t) => (
            <option key={t.slug} value={t.slug}>
              {t.label}
            </option>
          ))}
        </Select>
      ) : null}
    </div>
  );
}

export function ImagePicker({
  label,
  value,
  onChange,
  optional = false,
}: {
  label: string;
  value: string | null;
  onChange: (id: string | null) => void;
  optional?: boolean;
}) {
  const media = useQuery({
    queryKey: ["media"],
    queryFn: () => get<{ assets: Asset[] }>("/admin/media", { limit: "100" }),
  });
  const current = media.data?.assets.find((a) => a.id === value);
  return (
    <div className={ui.row} style={{ alignItems: "center" }}>
      {current ? (
        <img
          src={thumb(current)}
          alt=""
          width={80}
          height={60}
          style={{ objectFit: "cover" }}
        />
      ) : null}
      <Select
        label={label}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="" disabled={!optional}>
          {optional ? "None" : "Choose an uploaded image"}
        </option>
        {media.data?.assets.map((a) => (
          <option key={a.id} value={a.id}>
            {a.originalFilename} ({a.width} × {a.height})
          </option>
        ))}
      </Select>
    </div>
  );
}
