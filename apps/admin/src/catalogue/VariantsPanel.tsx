// Variants: one row per colour × size. Adding a variant and changing prices
// need price rights (O M, Q8-4); catalogue editors see prices read-only and can
// switch variants on or off. Stock is shown read-only; adjustments arrive in
// Phase 9. The API refuses anything a role may not do, whatever is shown here.
import { useState, type FormEvent } from "react";

import { api, toApiError, withMessage, type ApiError } from "../api/client.ts";
import type { ProductDetail, Variant } from "../api/types.ts";
import { useCan } from "../auth/session.tsx";
import { inr, paiseToRupeesText, rupeesToPaise } from "../lib/format.ts";
import { Button, SelectField, TextField } from "../ui/controls.tsx";
import {
  Cluster,
  ErrorSummary,
  Notice,
  Panel,
  Stack,
  TableRegion,
  ui,
} from "../ui/feedback.tsx";
import type { Reference } from "./ProductEditor.tsx";
import s from "./catalogue.module.css";

type Props = {
  product: ProductDetail;
  reference: Reference;
  onChange: () => void;
};

export function VariantsPanel({ product, reference, onChange }: Props) {
  const can = useCan();
  const canPrices = can("products.editPrices");
  const canEdit = can("products.editContent");
  const [message, setMessage] = useState<string | null>(null);
  const [rowError, setRowError] = useState<ApiError | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const colourName = (id: string) =>
    reference.colours.find((c) => c.id === id)?.name ?? "—";
  const sizeLabel = (id: string) =>
    reference.sizes.find((z) => z.id === id)?.label ?? "—";
  const sizeOrder = (id: string) =>
    reference.sizes.find((z) => z.id === id)?.position ?? 0;
  const variants = [...product.variants].sort(
    (a, b) =>
      colourName(a.colourId).localeCompare(colourName(b.colourId)) ||
      sizeOrder(a.sizeId) - sizeOrder(b.sizeId),
  );

  async function toggle(v: Variant) {
    setBusyId(v.id);
    setRowError(null);
    setMessage(null);
    try {
      await api.patch(`/admin/products/${product.id}/variants/${v.id}`, {
        isActive: !v.isActive,
      });
      setMessage(`${v.sku} is now ${v.isActive ? "inactive" : "active"}.`);
      onChange();
    } catch (err) {
      setRowError(toApiError(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Panel title="Variants">
      <Stack gap="4">
        {!canPrices ? (
          <p className={ui.muted}>
            Prices are set by an Owner or Manager. They are shown here
            read-only.
          </p>
        ) : null}
        {message ? <Notice tone="success" title={message} /> : null}
        {rowError ? <Notice tone="error" title={rowError.message} /> : null}
        {variants.length === 0 ? (
          <p className={ui.muted}>
            No variants yet. A product needs at least one active variant to be
            published.
          </p>
        ) : (
          <TableRegion label="Variants table">
            <table className={ui.table}>
              <caption className="visually-hidden">
                Variants of {product.name}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Colour</th>
                  <th scope="col">Size</th>
                  <th scope="col">SKU</th>
                  <th scope="col" className={ui.numeric}>
                    Price
                  </th>
                  <th scope="col" className={ui.numeric}>
                    Compare at
                  </th>
                  <th scope="col" className={ui.numeric}>
                    In stock
                  </th>
                  <th scope="col">Status</th>
                  {canEdit ? <th scope="col">Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {variants.map((v) => (
                  <tr key={v.id}>
                    <td>{colourName(v.colourId)}</td>
                    <td>{sizeLabel(v.sizeId)}</td>
                    <td className={ui.code}>{v.sku}</td>
                    <td className={ui.numeric}>{inr(v.pricePaise)}</td>
                    <td className={ui.numeric}>
                      {v.compareAtPricePaise === null
                        ? "—"
                        : inr(v.compareAtPricePaise)}
                    </td>
                    <td className={ui.numeric}>
                      {v.inventory
                        ? Math.max(0, v.inventory.onHand - v.inventory.reserved)
                        : 0}
                    </td>
                    <td>{v.isActive ? "Active" : "Inactive"}</td>
                    {canEdit ? (
                      <td>
                        <Cluster gap="2">
                          <Button
                            variant="secondary"
                            size="small"
                            onClick={() => toggle(v)}
                            busy={busyId === v.id}
                            busyLabel="Saving…"
                            aria-label={`${v.isActive ? "Deactivate" : "Activate"} ${v.sku}`}
                          >
                            {v.isActive ? "Deactivate" : "Activate"}
                          </Button>
                          {canPrices ? (
                            <Button
                              variant="quiet"
                              size="small"
                              onClick={() =>
                                setEditing(editing === v.id ? null : v.id)
                              }
                              aria-expanded={editing === v.id}
                              aria-label={`Change price of ${v.sku}`}
                            >
                              Change price
                            </Button>
                          ) : null}
                        </Cluster>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </TableRegion>
        )}
        {editing && canPrices ? (
          <PriceForm
            key={editing}
            productId={product.id}
            variant={product.variants.find((v) => v.id === editing)!}
            onDone={(text) => {
              setEditing(null);
              setMessage(text);
              onChange();
            }}
            onCancel={() => setEditing(null)}
          />
        ) : null}
        {canPrices ? (
          <AddVariantForm
            product={product}
            reference={reference}
            onAdded={(sku) => {
              setMessage(
                `${sku} added. Stock starts at 0 until inventory is added.`,
              );
              onChange();
            }}
          />
        ) : null}
      </Stack>
    </Panel>
  );
}

function priceFields(price: string, compareAt: string) {
  const errors: Record<string, string> = {};
  const p = rupeesToPaise(price);
  if (!p.ok) errors.pricePaise = p.message;
  let compareAtPricePaise: number | null = null;
  if (compareAt.trim()) {
    const c = rupeesToPaise(compareAt);
    if (!c.ok) errors.compareAtPricePaise = c.message;
    else compareAtPricePaise = c.value;
  }
  if (p.ok && p.value <= 0) errors.pricePaise = "The price must be above ₹0.";
  if (p.ok && compareAtPricePaise !== null && compareAtPricePaise <= p.value)
    errors.compareAtPricePaise =
      "The compare-at price must be above the price.";
  return { errors, pricePaise: p.ok ? p.value : 0, compareAtPricePaise };
}

function PriceForm({
  productId,
  variant,
  onDone,
  onCancel,
}: {
  productId: string;
  variant: Variant;
  onDone: (message: string) => void;
  onCancel: () => void;
}) {
  const [price, setPrice] = useState(paiseToRupeesText(variant.pricePaise));
  const [compareAt, setCompareAt] = useState(
    variant.compareAtPricePaise === null
      ? ""
      : paiseToRupeesText(variant.compareAtPricePaise),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  async function submit(e: FormEvent) {
    e.preventDefault();
    const checked = priceFields(price, compareAt);
    setFields(checked.errors);
    if (Object.keys(checked.errors).length) return;
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/admin/products/${productId}/variants/${variant.id}`, {
        pricePaise: checked.pricePaise,
        compareAtPricePaise: checked.compareAtPricePaise,
      });
      onDone(`Price of ${variant.sku} updated.`);
    } catch (err) {
      const apiError = toApiError(err);
      setError(apiError);
      setFields(apiError.fieldErrors);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-label={`Change price of ${variant.sku}`}
    >
      <fieldset className={ui.fieldset}>
        <legend>Change price of {variant.sku}</legend>
        <Stack>
          <ErrorSummary error={error} fields={fields} idPrefix="price-" />
          <div className={s.twoColumns}>
            <TextField
              id="price-pricePaise"
              label="Price (₹)"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              error={fields.pricePaise}
              hint="Including GST."
            />
            <TextField
              id="price-compareAtPricePaise"
              label="Compare-at price (₹)"
              optional
              inputMode="decimal"
              value={compareAt}
              onChange={(e) => setCompareAt(e.target.value)}
              error={fields.compareAtPricePaise}
              hint="The earlier price, shown struck through. Leave empty for none."
            />
          </div>
          <Cluster>
            <Button type="submit" busy={busy} busyLabel="Saving…">
              Save price
            </Button>
            <Button variant="quiet" onClick={onCancel}>
              Cancel
            </Button>
          </Cluster>
        </Stack>
      </fieldset>
    </form>
  );
}

function AddVariantForm({
  product,
  reference,
  onAdded,
}: {
  product: ProductDetail;
  reference: Reference;
  onAdded: (sku: string) => void;
}) {
  const [colourId, setColourId] = useState("");
  const [sizeId, setSizeId] = useState("");
  const [sku, setSku] = useState("");
  const [price, setPrice] = useState("");
  const [compareAt, setCompareAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const taken = (c: string, z: string) =>
    product.variants.some((v) => v.colourId === c && v.sizeId === z);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const checked = priceFields(price, compareAt);
    const errors = { ...checked.errors };
    if (!colourId) errors.colourId = "Choose a colour.";
    if (!sizeId) errors.sizeId = "Choose a size.";
    if (colourId && sizeId && taken(colourId, sizeId))
      errors.sizeId = "This colour and size already exist for this product.";
    if (!/^[A-Z0-9][A-Z0-9-]{2,39}$/.test(sku))
      errors.sku =
        "Use 3 to 40 capital letters, digits and hyphens, starting with a letter or digit.";
    setFields(errors);
    if (Object.keys(errors).length) {
      setError(null);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post(`/admin/products/${product.id}/variants`, {
        colourId,
        sizeId,
        sku,
        pricePaise: checked.pricePaise,
        ...(checked.compareAtPricePaise === null
          ? {}
          : { compareAtPricePaise: checked.compareAtPricePaise }),
      });
      setSku("");
      setSizeId("");
      onAdded(sku);
    } catch (err) {
      const apiError = toApiError(err);
      setError(
        apiError.status === 409
          ? withMessage(
              apiError,
              "A variant with this SKU, or this colour and size, already exists.",
            )
          : apiError,
      );
      setFields(apiError.fieldErrors);
    } finally {
      setBusy(false);
    }
  }

  if (reference.colours.length === 0)
    return (
      <Notice title="Add a colour first">
        <p>Variants need a colour. Create colours on the Colours screen.</p>
      </Notice>
    );

  return (
    <form onSubmit={submit} noValidate aria-label="Add a variant">
      <fieldset className={ui.fieldset}>
        <legend>Add a variant</legend>
        <Stack>
          <ErrorSummary error={error} fields={fields} idPrefix="add-" />
          <div className={s.twoColumns}>
            <SelectField
              id="add-colourId"
              label="Colour"
              value={colourId}
              onChange={(e) => setColourId(e.target.value)}
              error={fields.colourId}
            >
              <option value="">Choose a colour</option>
              {reference.colours.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectField>
            <SelectField
              id="add-sizeId"
              label="Size"
              value={sizeId}
              onChange={(e) => setSizeId(e.target.value)}
              error={fields.sizeId}
            >
              <option value="">Choose a size</option>
              {reference.sizes.map((z) => (
                <option
                  key={z.id}
                  value={z.id}
                  disabled={Boolean(colourId) && taken(colourId, z.id)}
                >
                  {z.label}
                </option>
              ))}
            </SelectField>
            <TextField
              id="add-sku"
              label="SKU"
              value={sku}
              onChange={(e) => setSku(e.target.value.toUpperCase())}
              error={fields.sku}
              spellCheck={false}
              hint="For example SP-KURTA-ROSE-M."
            />
            <TextField
              id="add-pricePaise"
              label="Price (₹)"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              error={fields.pricePaise}
              hint="Including GST."
            />
            <TextField
              id="add-compareAtPricePaise"
              label="Compare-at price (₹)"
              optional
              inputMode="decimal"
              value={compareAt}
              onChange={(e) => setCompareAt(e.target.value)}
              error={fields.compareAtPricePaise}
            />
          </div>
          <div>
            <Button type="submit" busy={busy} busyLabel="Adding…">
              Add variant
            </Button>
          </div>
        </Stack>
      </fieldset>
    </form>
  );
}
