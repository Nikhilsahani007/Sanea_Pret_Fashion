import {
  formatInr,
  paise,
  parseRupeesToPaise,
  validationMessage,
} from "@sanea/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";

import { get, send } from "../api.ts";
import { useAuth } from "../auth.tsx";
import {
  thumb,
  type Asset,
  type Category,
  type Colour,
  type Product,
  type ProductImage,
  type RichText,
  type Size,
} from "../types.ts";
import {
  Button,
  ErrorSummary,
  Notice,
  Select,
  Status,
  TextArea,
  TextField,
  ui,
} from "../ui/ui.tsx";

const LABELS = [
  { value: "NEW", label: "New" },
  { value: "LIMITED", label: "Limited" },
];

/** Paragraphs separated by blank lines; other block types are kept as they are. */
function toText(description: RichText): string {
  return description.blocks
    .filter(
      (b): b is { type: "paragraph"; text: string } => b.type === "paragraph",
    )
    .map((b) => b.text)
    .join("\n\n");
}
function fromText(text: string, previous?: RichText): RichText {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => ({ type: "paragraph" as const, text: t }));
  const others = (previous?.blocks ?? []).filter((b) => b.type !== "paragraph");
  return { blocks: [...paragraphs, ...others] };
}

const optional = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
};

export function ProductEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { can } = useAuth();
  const canEdit = can("products.editContent");
  const product = useQuery({
    queryKey: ["product", id],
    queryFn: () => get<{ product: Product }>(`/admin/products/${id}`),
    enabled: Boolean(id),
  });
  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: () => get<{ categories: Category[] }>("/admin/categories"),
  });
  const [saved, setSaved] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      id
        ? send<{ product: Product }>("PATCH", `/admin/products/${id}`, body)
        : send<{ product: Product }>("POST", "/admin/products", body),
    onSuccess: (res) => {
      qc.setQueryData(["product", res.product.id], { product: res.product });
      void qc.invalidateQueries({ queryKey: ["products"] });
      setSaved("Details saved.");
      if (!id) navigate(`/products/${res.product.id}`, { replace: true });
    },
  });
  const lifecycle = useMutation({
    mutationFn: (action: "publish" | "archive") =>
      send<{ product: Product }>("POST", `/admin/products/${id}/${action}`),
    onSuccess: (res, action) => {
      qc.setQueryData(["product", id], { product: res.product });
      void qc.invalidateQueries({ queryKey: ["products"] });
      setSaved(
        action === "publish"
          ? "Published. It is now visible on the storefront."
          : "Archived. It is no longer visible on the storefront.",
      );
    },
  });

  if (id && product.isPending) return <p role="status">Loading product…</p>;
  if (id && product.error) return <ErrorSummary error={product.error} />;
  const p = product.data?.product;

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaved(null);
    const f = new FormData(e.currentTarget);
    save.mutate({
      name: String(f.get("name")).trim(),
      ...(optional(f.get("slug")) ? { slug: optional(f.get("slug")) } : {}),
      categoryId: String(f.get("categoryId")),
      shortDescription: String(f.get("shortDescription")).trim(),
      description: fromText(String(f.get("description")), p?.description),
      fabric: optional(f.get("fabric")),
      care: optional(f.get("care")),
      fit: optional(f.get("fit")),
      hsnCode: optional(f.get("hsnCode")),
      labels: f.getAll("labels").map(String),
      seoTitle: optional(f.get("seoTitle")),
      seoDescription: optional(f.get("seoDescription")),
    });
  }
  const errors =
    save.error && "fieldErrors" in save.error
      ? (save.error as { fieldErrors(): Record<string, string> }).fieldErrors()
      : {};

  return (
    <div className={ui.stack}>
      <p>
        <Link to="/products">← Products</Link>
      </p>
      <div className={ui.pageHead}>
        <h1>{p ? p.name : "New product"}</h1>
        {p ? (
          <div className={ui.row}>
            <Status value={p.status} />
            {can("products.publish") && p.status !== "PUBLISHED" ? (
              <Button
                onClick={() => lifecycle.mutate("publish")}
                busy={lifecycle.isPending}
              >
                Publish
              </Button>
            ) : null}
            {can("products.publish") && p.status === "PUBLISHED" ? (
              <Button
                variant="danger"
                onClick={() =>
                  window.confirm(
                    "Archive this product? It disappears from the storefront.",
                  ) && lifecycle.mutate("archive")
                }
                busy={lifecycle.isPending}
              >
                Archive
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      <ErrorSummary
        error={lifecycle.error}
        title="Could not change the status"
      />
      {saved ? <Notice>{saved}</Notice> : null}

      <form
        className={`${ui.panel} ${ui.stack}`}
        onSubmit={onSubmit}
        noValidate
        aria-labelledby="details-h"
      >
        <h2 id="details-h">Details</h2>
        <ErrorSummary error={save.error} title="The product was not saved" />
        <fieldset
          disabled={!canEdit}
          style={{ border: 0, padding: 0, margin: 0 }}
          className={ui.stack}
        >
          <TextField
            label="Name"
            name="name"
            defaultValue={p?.name}
            required
            maxLength={160}
            error={errors.name}
          />
          <TextField
            label="URL slug"
            name="slug"
            defaultValue={p?.slug}
            hint="Lowercase words joined by hyphens. Leave empty to make one from the name."
            error={errors.slug}
          />
          <Select
            label="Category"
            name="categoryId"
            defaultValue={p?.category.id ?? ""}
            required
            error={errors.categoryId}
          >
            <option value="" disabled>
              Choose a category
            </option>
            {categories.data?.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.status !== "PUBLISHED" ? " (not published)" : ""}
              </option>
            ))}
          </Select>
          <TextField
            label="Short description"
            name="shortDescription"
            defaultValue={p?.shortDescription}
            required
            maxLength={200}
            hint="Up to 200 characters, shown under the name."
            error={errors.shortDescription}
          />
          <TextArea
            label="Description"
            name="description"
            defaultValue={p ? toText(p.description) : ""}
            rows={6}
            hint="Separate paragraphs with a blank line. Plain text only."
            error={errors["description"] ?? errors["description.blocks"]}
          />
          <div className={ui.row}>
            <TextField
              label="Fabric"
              name="fabric"
              defaultValue={p?.fabric ?? ""}
              maxLength={500}
            />
            <TextField
              label="Care"
              name="care"
              defaultValue={p?.care ?? ""}
              maxLength={500}
            />
            <TextField
              label="Fit"
              name="fit"
              defaultValue={p?.fit ?? ""}
              maxLength={500}
            />
          </div>
          <TextField
            label="HSN code"
            name="hsnCode"
            defaultValue={p?.hsnCode ?? ""}
            inputMode="numeric"
            hint="4, 6 or 8 digits, for GST invoices. Confirm with your accountant."
            error={errors.hsnCode}
          />
          <fieldset style={{ border: 0, padding: 0 }}>
            <legend className={ui.muted}>Labels</legend>
            <div className={ui.row}>
              {LABELS.map((l) => (
                <label
                  key={l.value}
                  style={{
                    display: "flex",
                    gap: "var(--sp-space-2)",
                    alignItems: "center",
                    minHeight: "var(--sp-tap)",
                  }}
                >
                  <input
                    type="checkbox"
                    name="labels"
                    value={l.value}
                    defaultChecked={p?.labels.includes(l.value)}
                  />{" "}
                  {l.label}
                </label>
              ))}
            </div>
          </fieldset>
          <TextField
            label="Search engine title"
            name="seoTitle"
            defaultValue={p?.seoTitle ?? ""}
            maxLength={70}
          />
          <TextField
            label="Search engine description"
            name="seoDescription"
            defaultValue={p?.seoDescription ?? ""}
            maxLength={160}
          />
          {canEdit ? (
            <div>
              <Button type="submit" busy={save.isPending}>
                {p ? "Save details" : "Create draft"}
              </Button>
            </div>
          ) : null}
        </fieldset>
      </form>

      {p ? <Variants product={p} /> : null}
      {p ? <Images product={p} /> : null}
    </div>
  );
}

function rupees(value: number | null): string {
  return value === null ? "" : (value / 100).toFixed(2).replace(/\.00$/, "");
}

/** Rupees typed by a person → paise, or a validation message. */
function readRupees(
  raw: FormDataEntryValue | null,
  required: boolean,
): { paise: number | null; error?: string } {
  const text = String(raw ?? "").trim();
  if (!text)
    return required
      ? { paise: null, error: "Enter a price." }
      : { paise: null };
  const r = parseRupeesToPaise(text);
  return r.ok
    ? { paise: r.value }
    : { paise: null, error: validationMessage(r.code) };
}

function Variants({ product }: { product: Product }) {
  const qc = useQueryClient();
  const { can } = useAuth();
  const canPrice = can("products.editPrices");
  const canEdit = can("products.editContent");
  const colours = useQuery({
    queryKey: ["colours"],
    queryFn: () => get<{ colours: Colour[] }>("/admin/colours"),
  });
  const sizes = useQuery({
    queryKey: ["sizes"],
    queryFn: () => get<{ sizes: Size[] }>("/admin/sizes"),
  });
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});
  const refresh = () =>
    qc.invalidateQueries({ queryKey: ["product", product.id] });

  const create = useMutation({
    mutationFn: (body: object) =>
      send("POST", `/admin/products/${product.id}/variants`, body),
    onSuccess: refresh,
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: object }) =>
      send("PATCH", `/admin/products/${product.id}/variants/${id}`, body),
    onSuccess: refresh,
  });

  function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const price = readRupees(f.get("price"), true);
    const compare = readRupees(f.get("compare"), false);
    const errs: Record<string, string> = {};
    if (price.error) errs.price = price.error;
    if (compare.error) errs.compare = compare.error;
    setLocalErrors(errs);
    if (Object.keys(errs).length) return;
    create.mutate(
      {
        colourId: String(f.get("colourId")),
        sizeId: String(f.get("sizeId")),
        sku: String(f.get("sku")).trim(),
        pricePaise: price.paise,
        ...(compare.paise !== null
          ? { compareAtPricePaise: compare.paise }
          : {}),
      },
      { onSuccess: () => form.reset() },
    );
  }

  function onPrice(e: FormEvent<HTMLFormElement>, variantId: string) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const price = readRupees(f.get("price"), true);
    const compare = readRupees(f.get("compare"), false);
    if (price.error || compare.error) {
      setLocalErrors({ [variantId]: price.error ?? compare.error ?? "" });
      return;
    }
    setLocalErrors({});
    update.mutate({
      id: variantId,
      body: { pricePaise: price.paise, compareAtPricePaise: compare.paise },
    });
  }

  return (
    <section className={`${ui.panel} ${ui.stack}`} aria-labelledby="variants-h">
      <h2 id="variants-h">Variants (colour × size)</h2>
      <p className={ui.muted}>
        Stock is changed in Inventory. New variants start at zero stock.
      </p>
      <ErrorSummary error={update.error} title="The variant was not changed" />
      {product.variants.length === 0 ? <p>No variants yet.</p> : null}
      {product.variants.length > 0 ? (
        <div className={ui.tableWrap}>
          <table className={ui.table}>
            <thead>
              <tr>
                <th scope="col">Colour</th>
                <th scope="col">Size</th>
                <th scope="col">SKU</th>
                <th scope="col">Price</th>
                <th scope="col">On hand</th>
                <th scope="col">Active</th>
              </tr>
            </thead>
            <tbody>
              {product.variants.map((v) => (
                <tr key={v.id}>
                  <td>
                    <span
                      aria-hidden="true"
                      style={{
                        display: "inline-block",
                        width: 14,
                        height: 14,
                        background: v.colour.swatchHex,
                        border: "1px solid var(--sp-border)",
                        marginRight: 8,
                        verticalAlign: "middle",
                      }}
                    />
                    {v.colour.name}
                  </td>
                  <td>{v.size.label}</td>
                  <td>{v.sku}</td>
                  <td>
                    {canPrice ? (
                      <form
                        className={ui.row}
                        onSubmit={(e) => onPrice(e, v.id)}
                        aria-label={`Price for ${v.sku}`}
                      >
                        <TextField
                          label="Price (₹)"
                          name="price"
                          defaultValue={rupees(v.pricePaise)}
                          inputMode="decimal"
                          size={9}
                          error={localErrors[v.id]}
                        />
                        <TextField
                          label="Compare at (₹)"
                          name="compare"
                          defaultValue={rupees(v.compareAtPricePaise)}
                          inputMode="decimal"
                          size={9}
                        />
                        <Button
                          type="submit"
                          variant="secondary"
                          busy={
                            update.isPending && update.variables?.id === v.id
                          }
                        >
                          Save
                        </Button>
                      </form>
                    ) : (
                      <>
                        {formatInr(paise(v.pricePaise))}
                        {v.compareAtPricePaise ? (
                          <span className={ui.muted}>
                            {" "}
                            (was {formatInr(paise(v.compareAtPricePaise))})
                          </span>
                        ) : null}
                      </>
                    )}
                  </td>
                  <td>
                    {v.stock ? v.stock.onHand - v.stock.reserved : 0} free
                  </td>
                  <td>
                    <label
                      style={{
                        display: "flex",
                        gap: 8,
                        alignItems: "center",
                        minHeight: "var(--sp-tap)",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={v.isActive}
                        disabled={!canEdit || update.isPending}
                        onChange={(e) =>
                          update.mutate({
                            id: v.id,
                            body: { isActive: e.target.checked },
                          })
                        }
                      />
                      <span className="visually-hidden">Active: {v.sku}</span>
                      {v.isActive ? "Yes" : "No"}
                    </label>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {canPrice && canEdit ? (
        <form
          className={ui.stack}
          onSubmit={onCreate}
          noValidate
          aria-labelledby="add-variant-h"
        >
          <h3 id="add-variant-h">Add a variant</h3>
          <ErrorSummary
            error={create.error}
            title="The variant was not added"
          />
          <div className={ui.row}>
            <Select label="Colour" name="colourId" required defaultValue="">
              <option value="" disabled>
                Choose
              </option>
              {colours.data?.colours.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Select label="Size" name="sizeId" required defaultValue="">
              <option value="" disabled>
                Choose
              </option>
              {sizes.data?.sizes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
            <TextField
              label="SKU"
              name="sku"
              required
              hint="Letters, digits and hyphens."
            />
            <TextField
              label="Price (₹)"
              name="price"
              required
              inputMode="decimal"
              error={localErrors.price}
            />
            <TextField
              label="Compare at (₹)"
              name="compare"
              inputMode="decimal"
              error={localErrors.compare}
              hint="Optional, higher than the price."
            />
            <Button type="submit" busy={create.isPending}>
              Add variant
            </Button>
          </div>
          {colours.data?.colours.length === 0 ? (
            <p>
              No colours yet. <Link to="/colours">Add a colour</Link> first.
            </p>
          ) : null}
        </form>
      ) : null}
    </section>
  );
}

type Draft = {
  mediaAssetId: string;
  asset: Asset;
  alt: string;
  role: ProductImage["role"];
  colourId: string | null;
};

function Images({ product }: { product: Product }) {
  const qc = useQueryClient();
  const { can } = useAuth();
  const canEdit = can("products.editContent");
  const [drafts, setDrafts] = useState<Draft[]>(() =>
    product.images.map((i) => ({
      mediaAssetId: i.asset.id,
      asset: i.asset,
      alt: i.alt,
      role: i.role,
      colourId: i.colourId,
    })),
  );
  const [picking, setPicking] = useState(false);
  const media = useQuery({
    queryKey: ["media"],
    queryFn: () => get<{ assets: Asset[] }>("/admin/media"),
    enabled: picking,
  });
  const colours = [
    ...new Map(product.variants.map((v) => [v.colour.id, v.colour])).values(),
  ];
  const saveImages = useMutation({
    mutationFn: () =>
      send<{ product: Product }>(
        "PUT",
        `/admin/products/${product.id}/images`,
        {
          images: drafts.map((d) => ({
            mediaAssetId: d.mediaAssetId,
            alt: d.alt,
            role: d.role,
            colourId: d.colourId,
          })),
        },
      ),
    onSuccess: (res) =>
      qc.setQueryData(["product", product.id], { product: res.product }),
  });
  const set = (i: number, patch: Partial<Draft>) =>
    setDrafts((list) => list.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const move = (i: number, by: number) =>
    setDrafts((list) => {
      const next = [...list];
      const [item] = next.splice(i, 1);
      next.splice(i + by, 0, item!);
      return next;
    });

  return (
    <section className={`${ui.panel} ${ui.stack}`} aria-labelledby="images-h">
      <h2 id="images-h">Images</h2>
      <p className={ui.muted}>
        Use Sanéa Pret's own photography only. Every image needs alt text
        describing the garment. One primary and one hover image per colour.
      </p>
      <ErrorSummary
        error={saveImages.error}
        title="The images were not saved"
      />
      {saveImages.isSuccess ? <Notice>Images saved.</Notice> : null}
      <ol
        className={ui.stack}
        style={{ listStyle: "none", padding: 0, margin: 0 }}
      >
        {drafts.map((d, i) => (
          <li
            key={`${d.mediaAssetId}-${i}`}
            className={ui.row}
            style={{ alignItems: "center" }}
          >
            <img
              src={thumb(d.asset)}
              alt=""
              width={64}
              height={80}
              style={{ objectFit: "cover" }}
            />
            <TextField
              label={`Alt text, image ${i + 1}`}
              value={d.alt}
              onChange={(e) => set(i, { alt: e.target.value })}
              required
              disabled={!canEdit}
            />
            <Select
              label="Role"
              value={d.role}
              onChange={(e) =>
                set(i, { role: e.target.value as Draft["role"] })
              }
              disabled={!canEdit}
            >
              <option value="PRIMARY">Primary</option>
              <option value="HOVER">Hover</option>
              <option value="GALLERY">Gallery</option>
            </Select>
            <Select
              label="Colour"
              value={d.colourId ?? ""}
              onChange={(e) => set(i, { colourId: e.target.value || null })}
              disabled={!canEdit}
            >
              <option value="">All colours</option>
              {colours.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            {canEdit ? (
              <>
                <Button
                  variant="secondary"
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                  aria-label={`Move image ${i + 1} up`}
                >
                  ↑
                </Button>
                <Button
                  variant="secondary"
                  disabled={i === drafts.length - 1}
                  onClick={() => move(i, 1)}
                  aria-label={`Move image ${i + 1} down`}
                >
                  ↓
                </Button>
                <Button
                  variant="quiet"
                  onClick={() => setDrafts((l) => l.filter((_, j) => j !== i))}
                >
                  Remove
                </Button>
              </>
            ) : null}
          </li>
        ))}
      </ol>
      {drafts.length === 0 ? <p>No images yet.</p> : null}
      {canEdit ? (
        <div className={ui.row}>
          <Button
            variant="secondary"
            onClick={() => setPicking((v) => !v)}
            aria-expanded={picking}
          >
            {picking ? "Close library" : "Add from media library"}
          </Button>
          <Button
            onClick={() => saveImages.mutate()}
            busy={saveImages.isPending}
          >
            Save images
          </Button>
        </div>
      ) : null}
      {picking ? (
        <div className={ui.stack}>
          {media.data?.assets.length === 0 ? (
            <p>
              The library is empty. <Link to="/media">Upload images</Link>{" "}
              first.
            </p>
          ) : null}
          <ul className={ui.row} style={{ listStyle: "none", padding: 0 }}>
            {media.data?.assets.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() =>
                    setDrafts((l) => [
                      ...l,
                      {
                        mediaAssetId: a.id,
                        asset: a,
                        alt: "",
                        role: l.length === 0 ? "PRIMARY" : "GALLERY",
                        colourId: null,
                      },
                    ])
                  }
                  style={{
                    padding: 0,
                    border: "1px solid var(--sp-border)",
                    background: "var(--sp-field)",
                    cursor: "pointer",
                  }}
                >
                  <img
                    src={thumb(a)}
                    alt=""
                    width={80}
                    height={100}
                    style={{ objectFit: "cover", display: "block" }}
                  />
                  <span className="visually-hidden">
                    Add {a.originalFilename}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
