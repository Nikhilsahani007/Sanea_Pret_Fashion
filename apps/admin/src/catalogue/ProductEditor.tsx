// Product editor (phase-8-ui-plan.md §3.4): details and SEO, the description
// blocks, labels, variants, images, and publish or archive (D-083). What each
// role sees follows the API's matrix; the API still checks every request.
import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useParams } from "react-router";

import { api, toApiError, type ApiError } from "../api/client.ts";
import type {
  Category,
  Colour,
  List,
  Product,
  ProductDetail,
  Size,
  SizeChart,
} from "../api/types.ts";
import { useCan } from "../auth/session.tsx";
import { when } from "../lib/format.ts";
import { useResource } from "../lib/resource.ts";
import {
  Button,
  Checkbox,
  SelectField,
  TextArea,
  TextField,
} from "../ui/controls.tsx";
import {
  Cluster,
  ErrorState,
  ErrorSummary,
  Loading,
  Notice,
  PageHeader,
  Panel,
  Stack,
  StatusChip,
} from "../ui/feedback.tsx";
import { ImagesPanel } from "./ImagesPanel.tsx";
import { RichTextEditor } from "./RichTextEditor.tsx";
import { VariantsPanel } from "./VariantsPanel.tsx";
import { blocksToDoc, readStored, type Block } from "./rich-text-blocks.ts";
import s from "./catalogue.module.css";

export type Reference = {
  categories: Category[];
  colours: Colour[];
  sizes: Size[];
  sizeCharts: SizeChart[];
};

const EMPTY_REFERENCE: Reference = {
  categories: [],
  colours: [],
  sizes: [],
  sizeCharts: [],
};

export function ProductEditor() {
  const { id = "" } = useParams();
  const location = useLocation();
  const can = useCan();
  const canEdit = can("products.editContent");

  const product = useResource<ProductDetail>(
    (signal) => api.get(`/admin/products/${id}`, { signal }),
    [id],
  );
  // Reference data is O M C only; Fulfilment sees the product without it.
  const reference = useResource<Reference>(
    async (signal) => {
      if (!canEdit) return EMPTY_REFERENCE;
      const [categories, colours, sizes, sizeCharts] = await Promise.all([
        api.get<List<Category>>("/admin/categories", { signal }),
        api.get<List<Colour>>("/admin/colours", { signal }),
        api.get<List<Size>>("/admin/sizes", { signal }),
        api.get<List<SizeChart>>("/admin/size-charts", { signal }),
      ]);
      return {
        categories: categories.items,
        colours: colours.items,
        sizes: sizes.items,
        sizeCharts: sizeCharts.items,
      };
    },
    [canEdit],
  );

  if (product.status === "loading" || reference.status === "loading")
    return <Loading label="Loading product…" />;
  if (product.status === "error")
    return <ErrorState error={product.error} onRetry={product.reload} />;
  if (reference.status === "error")
    return <ErrorState error={reference.error} onRetry={reference.reload} />;

  const p = product.data;
  return (
    <Stack gap="6">
      <p>
        <Link to="/products">All products</Link>
      </p>
      <PageHeader title={p.name}>
        <StatusChip status={p.status} />
      </PageHeader>
      {(location.state as { created?: boolean } | null)?.created &&
      p.status === "DRAFT" ? (
        <Notice tone="success" title="Product created as a draft">
          <p>
            Add a description, variants and a primary image, then publish it.
          </p>
        </Notice>
      ) : null}
      {!canEdit ? (
        <Notice>
          <p>Your role can view this product but not change it.</p>
        </Notice>
      ) : null}
      <PublishPanel product={p} onChange={product.reload} />
      <DetailsForm
        key={p.id}
        product={p}
        reference={reference.data}
        disabled={!canEdit}
        onSaved={(row) => product.set({ ...p, ...row })}
      />
      <VariantsPanel
        product={p}
        reference={reference.data}
        onChange={product.reload}
      />
      <ImagesPanel
        product={p}
        reference={reference.data}
        onChange={product.reload}
      />
    </Stack>
  );
}

// ── Publish and archive ──────────────────────────────────────────────────

function PublishPanel({
  product,
  onChange,
}: {
  product: ProductDetail;
  onChange: () => void;
}) {
  const can = useCan();
  const [busy, setBusy] = useState<"publish" | "archive" | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [done, setDone] = useState<string | null>(null);

  if (!can("products.publish"))
    return (
      <Panel title="Publishing">
        <p>
          {product.status === "PUBLISHED"
            ? `Published ${when(product.publishedAt)}.`
            : "Not published."}
        </p>
      </Panel>
    );

  async function act(action: "publish" | "archive") {
    if (
      action === "archive" &&
      !window.confirm(
        "Archive this product? It disappears from the shop until it is published again.",
      )
    )
      return;
    setBusy(action);
    setError(null);
    setDone(null);
    try {
      await api.post<Product>(`/admin/products/${product.id}/${action}`);
      setDone(
        action === "publish"
          ? "Published. It is now visible in the shop."
          : "Archived. It is no longer visible in the shop.",
      );
      onChange();
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(null);
    }
  }

  const problems =
    error?.status === 409 && Array.isArray(error.details)
      ? (error.details as { code: string; message?: string }[])
      : [];

  return (
    <Panel title="Publishing">
      <Stack gap="4">
        <p>
          {product.status === "PUBLISHED"
            ? `Published ${when(product.publishedAt)}. Customers can see it.`
            : product.status === "ARCHIVED"
              ? "Archived. Customers cannot see it."
              : "Draft. Customers cannot see it yet."}
        </p>
        {done ? <Notice tone="success" title={done} /> : null}
        {problems.length ? (
          <Notice tone="error" title="Not published yet. Fix these first:">
            <ul aria-label="Publishing checklist">
              {problems.map((pr) => (
                <li key={pr.code}>{pr.message ?? pr.code}</li>
              ))}
            </ul>
          </Notice>
        ) : error ? (
          <Notice tone="error" title={error.message} />
        ) : null}
        <Cluster>
          {product.status !== "PUBLISHED" ? (
            <Button
              onClick={() => act("publish")}
              busy={busy === "publish"}
              busyLabel="Publishing…"
            >
              Publish
            </Button>
          ) : null}
          {product.status !== "ARCHIVED" ? (
            <Button
              variant="danger"
              onClick={() => act("archive")}
              busy={busy === "archive"}
              busyLabel="Archiving…"
            >
              Archive
            </Button>
          ) : null}
        </Cluster>
      </Stack>
    </Panel>
  );
}

// ── Details, description, labels and SEO ─────────────────────────────────

const DETAIL_LABELS: Record<string, string> = {
  name: "Name",
  slug: "Web address",
  categoryId: "Category",
  shortDescription: "Short description",
  description: "Description",
  fabric: "Fabric",
  care: "Care",
  fit: "Fit",
  hsnCode: "HSN code",
  sizeChartId: "Size chart",
  seoTitle: "Search title",
  seoDescription: "Search description",
};

type Draft = {
  name: string;
  slug: string;
  categoryId: string;
  shortDescription: string;
  fabric: string;
  care: string;
  fit: string;
  hsnCode: string;
  sizeChartId: string;
  isNew: boolean;
  seoTitle: string;
  seoDescription: string;
};

function draftOf(p: Product): Draft {
  return {
    name: p.name,
    slug: p.slug,
    categoryId: p.categoryId,
    shortDescription: p.shortDescription,
    fabric: p.fabric ?? "",
    care: p.care ?? "",
    fit: p.fit ?? "",
    hsnCode: p.hsnCode ?? "",
    sizeChartId: p.sizeChartId ?? "",
    isNew: p.labels.includes("NEW"),
    seoTitle: p.seoTitle ?? "",
    seoDescription: p.seoDescription ?? "",
  };
}

/** Only the fields that changed, with empty optional text sent as null. */
export function changesOf(
  before: Draft,
  after: Draft,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const nullable = [
    "fabric",
    "care",
    "fit",
    "hsnCode",
    "sizeChartId",
    "seoTitle",
    "seoDescription",
  ];
  for (const key of Object.keys(after) as (keyof Draft)[]) {
    if (key === "isNew" || after[key] === before[key]) continue;
    const value = after[key] as string;
    out[key] = nullable.includes(key) && value.trim() === "" ? null : value;
  }
  if (after.isNew !== before.isNew) out.labels = after.isNew ? ["NEW"] : [];
  return out;
}

function DetailsForm({
  product,
  reference,
  disabled,
  onSaved,
}: {
  product: ProductDetail;
  reference: Reference;
  disabled: boolean;
  onSaved: (row: Product) => void;
}) {
  const initial = draftOf(product);
  const stored = readStored(product.description);
  const [draft, setDraft] = useState<Draft>(initial);
  const [blocks, setBlocks] = useState<Block[]>(stored.ok ? stored.blocks : []);
  const [blocksTouched, setBlocksTouched] = useState(false);
  const [replaceUnreadable, setReplaceUnreadable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [saved, setSaved] = useState(false);
  const slugLocked = product.publishedAt !== null;

  useEffect(() => setSaved(false), [draft, blocks]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  async function save(e: FormEvent) {
    e.preventDefault();
    const body = changesOf(initial, draft);
    if (blocksTouched) body.description = blocksToDoc(blocks);
    if (Object.keys(body).length === 0) {
      setSaved(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const row = await api.patch<Product>(
        `/admin/products/${product.id}`,
        body,
      );
      setBlocksTouched(false);
      onSaved(row);
      setSaved(true);
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  const fields = error?.fieldErrors ?? {};
  const descriptionError = Object.entries(fields).find(([k]) =>
    k.startsWith("description"),
  )?.[1];
  const canEditDescription = stored.ok || replaceUnreadable;

  return (
    <form onSubmit={save} noValidate aria-label="Product details">
      <Stack gap="6">
        <ErrorSummary error={error} fields={fields} labels={DETAIL_LABELS} />
        {saved ? <Notice tone="success" title="Changes saved" /> : null}
        <Panel title="Details">
          <fieldset
            disabled={disabled}
            className={`${s.twoColumns} ${s.plainFieldset}`}
          >
            <TextField
              id="name"
              label="Name"
              maxLength={120}
              value={draft.name}
              onChange={(e) => set("name", e.target.value)}
              error={fields.name}
            />
            <TextField
              id="slug"
              label="Web address"
              hint={
                slugLocked
                  ? "Locked: the product has been published, so its link stays the same."
                  : "Lowercase words joined by hyphens. It locks when the product is first published."
              }
              value={draft.slug}
              readOnly={slugLocked}
              spellCheck={false}
              onChange={(e) => set("slug", e.target.value)}
              error={fields.slug}
            />
            <SelectField
              id="categoryId"
              label="Category"
              value={draft.categoryId}
              onChange={(e) => set("categoryId", e.target.value)}
              error={fields.categoryId}
            >
              {reference.categories.length === 0 ? (
                <option value={draft.categoryId}>Current category</option>
              ) : null}
              {reference.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.status !== "PUBLISHED" ? " (not published)" : ""}
                </option>
              ))}
            </SelectField>
            <SelectField
              id="sizeChartId"
              label="Size chart"
              optional
              value={draft.sizeChartId}
              onChange={(e) => set("sizeChartId", e.target.value)}
              error={fields.sizeChartId}
            >
              <option value="">None</option>
              {reference.sizeCharts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectField>
            <TextArea
              id="shortDescription"
              label="Short description"
              hint="Shown on product cards. At most 200 characters."
              maxLength={200}
              value={draft.shortDescription}
              onChange={(e) => set("shortDescription", e.target.value)}
              error={fields.shortDescription}
            />
            <Stack gap="2">
              <Checkbox
                label="Show the “New” label"
                checked={draft.isNew}
                onChange={(e) => set("isNew", e.target.checked)}
                hint="The only product label in this release."
              />
            </Stack>
            <TextArea
              id="fabric"
              label="Fabric"
              optional
              maxLength={500}
              rows={2}
              value={draft.fabric}
              onChange={(e) => set("fabric", e.target.value)}
              error={fields.fabric}
              hint="Only confirmed information; leave empty if unknown."
            />
            <TextArea
              id="care"
              label="Care"
              optional
              maxLength={500}
              rows={2}
              value={draft.care}
              onChange={(e) => set("care", e.target.value)}
              error={fields.care}
            />
            <TextArea
              id="fit"
              label="Fit"
              optional
              maxLength={500}
              rows={2}
              value={draft.fit}
              onChange={(e) => set("fit", e.target.value)}
              error={fields.fit}
            />
            <TextField
              id="hsnCode"
              label="HSN code"
              optional
              inputMode="numeric"
              maxLength={8}
              value={draft.hsnCode}
              onChange={(e) => set("hsnCode", e.target.value)}
              error={fields.hsnCode}
              hint="4 to 8 digits, for GST invoices."
            />
          </fieldset>
        </Panel>

        <Panel title="Description">
          {canEditDescription ? (
            <RichTextEditor
              blocks={blocks}
              disabled={disabled}
              serverError={descriptionError}
              onChange={(next) => {
                setBlocks(next);
                setBlocksTouched(true);
              }}
            />
          ) : (
            <Notice tone="error" title="The stored description cannot be read">
              <Stack gap="3">
                <p>
                  It is not in the expected format, so it is left unchanged.
                </p>
                {disabled ? null : (
                  <div>
                    <Button
                      variant="secondary"
                      size="small"
                      onClick={() => setReplaceUnreadable(true)}
                    >
                      Write a new description instead
                    </Button>
                  </div>
                )}
              </Stack>
            </Notice>
          )}
        </Panel>

        <Panel title="Search engines">
          <fieldset
            disabled={disabled}
            className={`${s.twoColumns} ${s.plainFieldset}`}
          >
            <TextField
              id="seoTitle"
              label="Search title"
              optional
              maxLength={70}
              value={draft.seoTitle}
              onChange={(e) => set("seoTitle", e.target.value)}
              error={fields.seoTitle}
              hint="At most 70 characters. Empty uses the product name."
            />
            <TextArea
              id="seoDescription"
              label="Search description"
              optional
              maxLength={160}
              rows={2}
              value={draft.seoDescription}
              onChange={(e) => set("seoDescription", e.target.value)}
              error={fields.seoDescription}
              hint="At most 160 characters."
            />
          </fieldset>
        </Panel>

        {disabled ? null : (
          <div>
            <Button type="submit" busy={busy} busyLabel="Saving…">
              Save changes
            </Button>
          </div>
        )}
      </Stack>
    </form>
  );
}
