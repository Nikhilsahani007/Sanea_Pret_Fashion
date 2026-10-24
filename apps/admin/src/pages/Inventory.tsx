import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";

import { get, send } from "../api.ts";
import { useAuth } from "../auth.tsx";
import {
  Button,
  ErrorSummary,
  Notice,
  Select,
  TextField,
  ui,
} from "../ui/ui.tsx";

type Level = {
  variantId: string;
  sku: string;
  isActive: boolean;
  product: { id: string; name: string; status: string };
  colour: string;
  size: string;
  onHand: number;
  reserved: number;
  available: number;
  lowStockThreshold: number;
  lowStock: boolean;
};
type Movement = {
  id: string;
  sku: string;
  type: string;
  onHandDelta: number;
  reservedDelta: number;
  reason: string | null;
  actor: string | null;
  createdAt: string;
};

const TYPE_LABELS: Record<string, string> = {
  RECEIVED: "Received",
  ADJUSTMENT: "Adjustment",
  CORRECTION: "Correction",
  RESERVED: "Reserved",
  RELEASED: "Released",
  SHIPPED: "Shipped",
  RETURNED: "Returned",
  RESTOCKED: "Restocked",
};
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

export function Inventory() {
  const { can } = useAuth();
  const canAdjust = can("inventory.adjust");
  const [params, setParams] = useSearchParams();
  const lowStock = params.get("lowStock") === "true";
  const sku = params.get("sku") ?? "";
  const [selected, setSelected] = useState<Level | null>(null);
  const list = useQuery({
    queryKey: ["inventory", lowStock, sku],
    queryFn: () =>
      get<{ items: Level[] }>("/admin/inventory", {
        lowStock: lowStock ? "true" : undefined,
        sku: sku || undefined,
        limit: "200",
      }),
  });

  return (
    <div className={ui.stack}>
      <h1>Inventory</h1>
      <p className={ui.muted}>
        Free = on hand − reserved. Reserved units are held by checkouts and
        unshipped orders; stock can never be set below them.
      </p>
      <form
        className={ui.row}
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          const value = String(new FormData(e.currentTarget).get("sku")).trim();
          setParams((p) => {
            if (value) p.set("sku", value);
            else p.delete("sku");
            return p;
          });
        }}
      >
        <TextField label="SKU" name="sku" defaultValue={sku} type="search" />
        <Button type="submit" variant="secondary">
          Search
        </Button>
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
            checked={lowStock}
            onChange={(e) =>
              setParams((p) => {
                if (e.target.checked) p.set("lowStock", "true");
                else p.delete("lowStock");
                return p;
              })
            }
          />
          Low stock only
        </label>
      </form>
      <ErrorSummary error={list.error} />
      {list.data?.items.length === 0 ? (
        <p className={ui.panel}>
          {lowStock ? "Nothing is low on stock." : "No variants found."}
        </p>
      ) : null}
      {list.data && list.data.items.length > 0 ? (
        <div className={ui.tableWrap}>
          <table className={ui.table}>
            <thead>
              <tr>
                <th scope="col">SKU</th>
                <th scope="col">Product</th>
                <th scope="col">On hand</th>
                <th scope="col">Reserved</th>
                <th scope="col">Free</th>
                <th scope="col">Low at</th>
                {canAdjust ? <th scope="col">Action</th> : null}
              </tr>
            </thead>
            <tbody>
              {list.data.items.map((l) => (
                <tr key={l.variantId}>
                  <td>
                    {l.sku}
                    {!l.isActive ? (
                      <span className={ui.muted}> (inactive)</span>
                    ) : null}
                  </td>
                  <td>
                    {l.product.name}
                    <br />
                    <span className={ui.muted}>
                      {l.colour} · {l.size}
                    </span>
                  </td>
                  <td>{l.onHand}</td>
                  <td>{l.reserved}</td>
                  <td>
                    <strong>{l.available}</strong>
                    {l.lowStock ? (
                      <span className={ui.status} style={{ marginLeft: 8 }}>
                        Low
                      </span>
                    ) : null}
                  </td>
                  <td>{l.lowStockThreshold}</td>
                  {canAdjust ? (
                    <td>
                      <Button
                        variant="secondary"
                        onClick={() => setSelected(l)}
                        aria-label={`Adjust ${l.sku}`}
                      >
                        Adjust
                      </Button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {selected && canAdjust ? (
        <Adjust
          key={selected.variantId}
          level={selected}
          onDone={() => setSelected(null)}
        />
      ) : null}
    </div>
  );
}

function Adjust({ level, onDone }: { level: Level; onDone: () => void }) {
  const qc = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const movements = useQuery({
    queryKey: ["movements", level.variantId],
    queryFn: () =>
      get<{ movements: Movement[] }>("/admin/inventory/movements", {
        variantId: level.variantId,
        limit: "20",
      }),
  });
  const adjust = useMutation({
    mutationFn: (body: object) =>
      send<{ level: { onHand: number; available: number } }>(
        "POST",
        `/admin/inventory/${level.variantId}/adjustments`,
        body,
      ),
    onSuccess: (res) => {
      setMessage(
        `Saved. On hand is now ${res.level.onHand}, free ${res.level.available}.`,
      );
      void qc.invalidateQueries({ queryKey: ["inventory"] });
      void qc.invalidateQueries({ queryKey: ["movements", level.variantId] });
    },
  });
  const threshold = useMutation({
    mutationFn: (value: number) =>
      send("PATCH", `/admin/inventory/${level.variantId}`, {
        lowStockThreshold: value,
      }),
    onSuccess: () => {
      setMessage("Low-stock level saved.");
      void qc.invalidateQueries({ queryKey: ["inventory"] });
    },
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const type = String(f.get("type"));
    const amount = Number(f.get("amount"));
    const reason = String(f.get("reason")).trim();
    const errs: Record<string, string> = {};
    if (!Number.isInteger(amount) || amount <= 0)
      errs.amount = "Enter a whole number of units, at least 1.";
    if (reason.length < 3)
      errs.reason =
        "Say why, for example “Delivery from tailor” or “Damaged in storage”.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const direction = String(f.get("direction"));
    const delta = type === "RECEIVED" || direction === "add" ? amount : -amount;
    adjust.mutate({ type, delta, reason }, { onSuccess: () => form.reset() });
  }

  return (
    <section className={`${ui.panel} ${ui.stack}`} aria-labelledby="adjust-h">
      <div className={ui.pageHead}>
        <h2 id="adjust-h">Adjust {level.sku}</h2>
        <Button variant="quiet" onClick={onDone}>
          Close
        </Button>
      </div>
      <p>
        On hand {level.onHand}, reserved {level.reserved}. You can remove at
        most {level.available} units.
      </p>
      {message ? <Notice>{message}</Notice> : null}
      <ErrorSummary error={adjust.error} title="Stock was not changed" />
      <form className={ui.row} onSubmit={onSubmit} noValidate>
        <Select label="Type" name="type" defaultValue="RECEIVED">
          <option value="RECEIVED">Delivery received (adds)</option>
          <option value="ADJUSTMENT">Adjustment (count, damage)</option>
          <option value="CORRECTION">Correction of a mistake</option>
        </Select>
        <Select
          label="Direction"
          name="direction"
          defaultValue="add"
          hint="Deliveries always add."
        >
          <option value="add">Add</option>
          <option value="remove">Remove</option>
        </Select>
        <TextField
          label="Units"
          name="amount"
          inputMode="numeric"
          required
          error={errors.amount}
        />
        <TextField
          label="Reason"
          name="reason"
          required
          maxLength={300}
          error={errors.reason}
        />
        <Button type="submit" busy={adjust.isPending}>
          Save
        </Button>
      </form>
      <form
        className={ui.row}
        onSubmit={(e) => {
          e.preventDefault();
          threshold.mutate(
            Number(new FormData(e.currentTarget).get("threshold")),
          );
        }}
      >
        <TextField
          label="Low-stock level"
          name="threshold"
          type="number"
          min={0}
          max={10000}
          defaultValue={level.lowStockThreshold}
        />
        <Button type="submit" variant="secondary" busy={threshold.isPending}>
          Save level
        </Button>
      </form>
      <ErrorSummary error={threshold.error} title="The level was not saved" />
      <h3>Recent movements</h3>
      <div className={ui.tableWrap}>
        <table className={ui.table}>
          <thead>
            <tr>
              <th scope="col">When (India time)</th>
              <th scope="col">Type</th>
              <th scope="col">On hand</th>
              <th scope="col">Reserved</th>
              <th scope="col">Reason</th>
              <th scope="col">By</th>
            </tr>
          </thead>
          <tbody>
            {movements.data?.movements.map((m) => (
              <tr key={m.id}>
                <td>
                  {new Date(m.createdAt).toLocaleString("en-IN", {
                    timeZone: "Asia/Kolkata",
                  })}
                </td>
                <td>{TYPE_LABELS[m.type] ?? m.type}</td>
                <td>{m.onHandDelta ? signed(m.onHandDelta) : "—"}</td>
                <td>{m.reservedDelta ? signed(m.reservedDelta) : "—"}</td>
                <td>{m.reason ?? "—"}</td>
                <td>{m.actor ?? "System"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
