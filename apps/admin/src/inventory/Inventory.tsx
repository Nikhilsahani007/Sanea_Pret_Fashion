// Inventory (phase-9-plan.md §3.6): stock per variant for everyone; O M F
// receive and adjust stock and set the low-stock level. On hand never goes
// below what is reserved for customers; the API refuses it (SR-12).
import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router";

import {
  api,
  query,
  toApiError,
  withMessage,
  type ApiError,
} from "../api/client.ts";
import type { Page, StockRow } from "../api/types.ts";
import { useCan } from "../auth/session.tsx";
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
  Empty,
  ErrorState,
  ErrorSummary,
  Loading,
  Notice,
  PageHeader,
  Stack,
  TableRegion,
  ui,
} from "../ui/feedback.tsx";
import s from "./inventory.module.css";

type AdjustType = "RECEIVED" | "ADJUSTMENT" | "CORRECTION";

export const ADJUST_TYPES: {
  value: AdjustType;
  label: string;
  hint: string;
}[] = [
  {
    value: "RECEIVED",
    label: "Stock received",
    hint: "A delivery or new units. Adds to on hand; a note is optional.",
  },
  {
    value: "ADJUSTMENT",
    label: "Stock adjustment",
    hint: "Damaged, lost or found units. A reason is required.",
  },
  {
    value: "CORRECTION",
    label: "Count correction",
    hint: "Fixes a miscount after a stocktake. A reason is required.",
  },
];

/** The signed change for the API, or a problem to show. */
export function adjustmentDelta(
  type: AdjustType,
  direction: "add" | "remove",
  quantity: string,
): { ok: true; delta: number } | { ok: false; message: string } {
  if (
    !/^\d{1,5}$/.test(quantity.trim()) ||
    Number(quantity) === 0 ||
    Number(quantity) > 10_000
  )
    return {
      ok: false,
      message: "Enter a whole number of units from 1 to 10,000.",
    };
  const n = Number(quantity);
  return {
    ok: true,
    delta: type === "RECEIVED" || direction === "add" ? n : -n,
  };
}

export function Inventory() {
  const can = useCan();
  const canManage = can("inventory.adjust");
  const [params, setParams] = useSearchParams();
  const lowStock = params.get("lowStock") === "true";
  const sku = params.get("sku") ?? "";
  const productId = params.get("product") ?? "";
  const [skuDraft, setSkuDraft] = useState(sku);
  const [selected, setSelected] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const page = useResource<Page<StockRow>>(
    (signal) =>
      api.get(
        `/admin/inventory${query({ lowStock: lowStock ? "true" : undefined, sku, productId, limit: 100 })}`,
        { signal },
      ),
    [lowStock, sku, productId],
  );

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
    setSelected(null);
  }

  const rows = page.status === "ready" ? page.data.items : [];
  const current = rows.find((r) => r.variantId === selected) ?? null;

  return (
    <Stack gap="6">
      <PageHeader
        title="Inventory"
        description={
          canManage
            ? "Stock for every variant. Available is on hand minus units reserved for customers."
            : "Stock for every variant. Your role can view stock but not change it."
        }
      />
      {message ? <Notice tone="success" title={message} /> : null}
      <form
        aria-label="Filter inventory"
        onSubmit={(e) => {
          e.preventDefault();
          setFilter("sku", skuDraft.trim());
        }}
      >
        <Cluster gap="4">
          <div>
            <TextField
              label="SKU starts with"
              optional
              value={skuDraft}
              onChange={(e) => setSkuDraft(e.target.value.toUpperCase())}
              maxLength={40}
              spellCheck={false}
            />
          </div>
          <Button type="submit" variant="secondary">
            Search
          </Button>
          <Checkbox
            label="Low stock only"
            checked={lowStock}
            onChange={(e) =>
              setFilter("lowStock", e.target.checked ? "true" : "")
            }
          />
          {productId ? (
            <Button variant="quiet" onClick={() => setFilter("product", "")}>
              Show all products
            </Button>
          ) : null}
        </Cluster>
      </form>

      {page.status === "loading" ? <Loading label="Loading stock…" /> : null}
      {page.status === "error" ? (
        <ErrorState error={page.error} onRetry={page.reload} />
      ) : null}
      {page.status === "ready" && rows.length === 0 ? (
        <Empty>
          <p>
            {lowStock || sku || productId
              ? "No variants match these filters."
              : "No variants yet. Variants are added in the product editor."}
          </p>
        </Empty>
      ) : null}
      {rows.length > 0 ? (
        <TableRegion label="Stock by variant">
          <table className={ui.table}>
            <caption className="visually-hidden">
              Stock by variant, by SKU
            </caption>
            <thead>
              <tr>
                <th scope="col">SKU</th>
                <th scope="col" className={ui.numeric}>
                  Available
                </th>
                <th scope="col" className={ui.numeric}>
                  On hand
                </th>
                <th scope="col" className={ui.numeric}>
                  Reserved
                </th>
                <th scope="col">Status</th>
                {canManage ? <th scope="col">Actions</th> : null}
                <th scope="col">Product</th>
                <th scope="col">Colour</th>
                <th scope="col">Size</th>
                <th scope="col" className={ui.numeric}>
                  Low-stock level
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.variantId}>
                  <td className={ui.code}>{r.sku}</td>
                  <td className={ui.numeric}>{r.available}</td>
                  <td className={ui.numeric}>{r.onHand}</td>
                  <td className={ui.numeric}>{r.reserved}</td>
                  <td>
                    <StockStatus row={r} />
                  </td>
                  {canManage ? (
                    <td>
                      <Button
                        variant="secondary"
                        size="small"
                        aria-expanded={selected === r.variantId}
                        aria-controls="stock-change"
                        onClick={() =>
                          setSelected(
                            selected === r.variantId ? null : r.variantId,
                          )
                        }
                        aria-label={`Change stock for ${r.sku}`}
                      >
                        Change stock
                      </Button>
                    </td>
                  ) : null}
                  <td>
                    <Link to={`/products/${r.productId}`}>{r.productName}</Link>
                  </td>
                  <td>{r.colour}</td>
                  <td>{r.size}</td>
                  <td className={ui.numeric}>{r.lowStockThreshold}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableRegion>
      ) : null}
      {page.status === "ready" && page.data.nextCursor ? (
        <p className={ui.hint}>
          Showing the first 100 variants by SKU. Narrow the list with the SKU
          search.
        </p>
      ) : null}

      {canManage && current ? (
        <div id="stock-change">
          <Stack gap="4">
            <AdjustForm
              key={`adjust-${current.variantId}`}
              row={current}
              onDone={(text) => {
                setMessage(text);
                setSelected(null);
                page.reload();
              }}
              onCancel={() => setSelected(null)}
            />
            <ThresholdForm
              key={`threshold-${current.variantId}-${current.lowStockThreshold}`}
              row={current}
              onDone={(text) => {
                setMessage(text);
                setSelected(null);
                page.reload();
              }}
            />
          </Stack>
        </div>
      ) : null}
    </Stack>
  );
}

function StockStatus({ row }: { row: StockRow }) {
  if (!row.isActive)
    return (
      <span className={`${ui.chip} ${ui["chip-ARCHIVED"]}`}>Inactive</span>
    );
  if (row.available <= 0)
    return <span className={`${ui.chip} ${s.soldOut}`}>Sold out</span>;
  if (row.lowStock)
    return <span className={`${ui.chip} ${s.low}`}>Low stock</span>;
  return <span className={ui.chip}>In stock</span>;
}

function AdjustForm({
  row,
  onDone,
  onCancel,
}: {
  row: StockRow;
  onDone: (message: string) => void;
  onCancel: () => void;
}) {
  const [type, setType] = useState<AdjustType>("RECEIVED");
  const [direction, setDirection] = useState<"add" | "remove">("remove");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const parsed = adjustmentDelta(type, direction, quantity);
  const preview = parsed.ok ? row.onHand + parsed.delta : null;
  const typeInfo = ADJUST_TYPES.find((t) => t.value === type)!;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problems: Record<string, string> = {};
    if (!parsed.ok) problems.quantity = parsed.message;
    if (type !== "RECEIVED" && reason.trim().length < 3)
      problems.reason = "Give a reason of at least 3 characters.";
    if (preview !== null && preview < row.reserved)
      problems.quantity =
        row.reserved > 0
          ? `On hand cannot go below the ${row.reserved} units reserved for customers.`
          : "On hand cannot go below 0.";
    setFields(problems);
    if (Object.keys(problems).length || !parsed.ok) {
      setError(null);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post(`/admin/inventory/${row.variantId}/adjustments`, {
        type,
        delta: parsed.delta,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      });
      onDone(
        `${row.sku}: on hand ${row.onHand} → ${row.onHand + parsed.delta}.`,
      );
    } catch (err) {
      const apiError = toApiError(err);
      const below = (
        apiError.details as { code?: string; reserved?: number }[] | undefined
      )?.[0];
      if (below?.code === "STOCK_BELOW_RESERVED") {
        setError(
          withMessage(
            apiError,
            `Not saved: on hand cannot go below the ${below.reserved} units now reserved for customers.`,
          ),
        );
        const most = row.onHand - (below.reserved ?? 0);
        setFields({
          quantity: `At most ${most} ${most === 1 ? "unit" : "units"} can be removed now.`,
        });
      } else {
        setError(apiError);
        const f = apiError.fieldErrors;
        setFields({
          ...(f.delta ? { quantity: f.delta } : {}),
          ...(f.reason ? { reason: f.reason } : {}),
        });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-label={`Change stock for ${row.sku}`}
    >
      <fieldset className={ui.fieldset}>
        <legend>Change stock for {row.sku}</legend>
        <Stack>
          <p className={ui.muted}>
            {row.productName}, {row.colour}, {row.size}. On hand {row.onHand},
            reserved {row.reserved}.
          </p>
          <ErrorSummary
            error={error}
            fields={fields}
            idPrefix="stock-"
            labels={{ quantity: "Units", reason: "Reason" }}
          />
          <div className={s.formGrid}>
            <SelectField
              id="stock-type"
              label="Kind of change"
              hint={typeInfo.hint}
              value={type}
              onChange={(e) => setType(e.target.value as AdjustType)}
            >
              {ADJUST_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </SelectField>
            {type === "RECEIVED" ? null : (
              <SelectField
                id="stock-direction"
                label="Direction"
                value={direction}
                onChange={(e) =>
                  setDirection(e.target.value as "add" | "remove")
                }
              >
                <option value="remove">Remove units</option>
                <option value="add">Add units</option>
              </SelectField>
            )}
            <TextField
              id="stock-quantity"
              label="Units"
              inputMode="numeric"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value.replace(/\D/g, ""))}
              error={fields.quantity}
            />
            <TextArea
              id="stock-reason"
              label={type === "RECEIVED" ? "Note" : "Reason"}
              optional={type === "RECEIVED"}
              rows={2}
              maxLength={200}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              error={fields.reason}
              hint="Kept with the stock movement. Do not include customer details."
            />
          </div>
          <p role="status" className={s.preview}>
            {preview === null
              ? "Enter the number of units to see the result."
              : `On hand will change from ${row.onHand} to ${preview}; available from ${row.available} to ${preview - row.reserved}.`}
          </p>
          <Cluster>
            <Button type="submit" busy={busy} busyLabel="Saving…">
              Save stock change
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

function ThresholdForm({
  row,
  onDone,
}: {
  row: StockRow;
  onDone: (message: string) => void;
}) {
  const [value, setValue] = useState(String(row.lowStockThreshold));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const valid = /^\d{1,4}$/.test(value) && Number(value) <= 1000;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/admin/inventory/${row.variantId}`, {
        lowStockThreshold: Number(value),
      });
      onDone(`${row.sku}: low-stock level set to ${value}.`);
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-label={`Low-stock level for ${row.sku}`}
    >
      <fieldset className={ui.fieldset}>
        <legend>Low-stock level for {row.sku}</legend>
        <Stack>
          {error ? <Notice tone="error" title={error.message} /> : null}
          <div className={s.formGrid}>
            <TextField
              id="stock-threshold"
              label="Low-stock level"
              hint="At or below this many available units, the variant is low stock: it appears in the low-stock list, and shoppers are shown how many remain (D-082). 0 to 1,000."
              inputMode="numeric"
              value={value}
              onChange={(e) => setValue(e.target.value.replace(/\D/g, ""))}
              error={
                valid ? undefined : "Enter a whole number from 0 to 1,000."
              }
            />
          </div>
          <div>
            <Button
              type="submit"
              variant="secondary"
              disabled={!valid || Number(value) === row.lowStockThreshold}
              busy={busy}
              busyLabel="Saving…"
            >
              Save low-stock level
            </Button>
          </div>
        </Stack>
      </fieldset>
    </form>
  );
}
