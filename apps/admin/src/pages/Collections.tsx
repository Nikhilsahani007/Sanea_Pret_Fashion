import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { get, send } from "../api.ts";
import { useAuth } from "../auth.tsx";
import type { Collection, ProductRow } from "../types.ts";
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

type Detail = Collection & {
  products: { id: string; name: string; status: string }[];
};

export function Collections() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const canEdit = can("products.editContent");
  const list = useQuery({
    queryKey: ["collections"],
    queryFn: () => get<{ collections: Collection[] }>("/admin/collections"),
  });
  const [selected, setSelected] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: (body: object) =>
      send<{ collection: Collection }>("POST", "/admin/collections", body),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ["collections"] });
      setSelected(res.collection.id);
    },
  });

  function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const description = String(f.get("description")).trim();
    create.mutate(
      {
        name: String(f.get("name")).trim(),
        ...(description ? { description } : {}),
      },
      { onSuccess: () => form.reset() },
    );
  }

  return (
    <div className={ui.stack}>
      <h1>Collections</h1>
      <div className={ui.tableWrap}>
        <table className={ui.table}>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Products</th>
              <th scope="col">Schedule</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {list.data?.collections.map((c) => (
              <tr key={c.id}>
                <td>
                  <Button
                    variant="quiet"
                    onClick={() => setSelected(c.id)}
                    aria-pressed={selected === c.id}
                  >
                    {c.name}
                  </Button>
                </td>
                <td>{c.productCount}</td>
                <td>
                  {c.startsAt
                    ? new Date(c.startsAt).toLocaleString("en-IN", {
                        timeZone: "Asia/Kolkata",
                      })
                    : "Any time"}
                  {c.endsAt
                    ? ` – ${new Date(c.endsAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`
                    : ""}
                </td>
                <td>
                  <Status value={c.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {list.data?.collections.length === 0 ? <p>No collections yet.</p> : null}
      {selected ? <CollectionEditor id={selected} canEdit={canEdit} /> : null}
      {canEdit ? (
        <form
          className={`${ui.panel} ${ui.stack}`}
          onSubmit={onCreate}
          noValidate
          aria-labelledby="new-col"
        >
          <h2 id="new-col">New collection</h2>
          <ErrorSummary
            error={create.error}
            title="The collection was not created"
          />
          <TextField label="Name" name="name" required maxLength={120} />
          <TextArea
            label="Description"
            name="description"
            maxLength={1000}
            rows={3}
          />
          <div>
            <Button type="submit" busy={create.isPending}>
              Create
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function CollectionEditor({ id, canEdit }: { id: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const detail = useQuery({
    queryKey: ["collection", id],
    queryFn: () => get<{ collection: Detail }>(`/admin/collections/${id}`),
  });
  const products = useQuery({
    queryKey: ["products", "all"],
    queryFn: () =>
      get<{ products: ProductRow[] }>("/admin/products", { limit: "100" }),
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["collection", id] });
    void qc.invalidateQueries({ queryKey: ["collections"] });
  };
  const update = useMutation({
    mutationFn: (body: object) =>
      send("PATCH", `/admin/collections/${id}`, body),
    onSuccess: refresh,
  });
  const setProducts = useMutation({
    mutationFn: (productIds: string[]) =>
      send("PUT", `/admin/collections/${id}/products`, { productIds }),
    onSuccess: refresh,
  });
  const c = detail.data?.collection;
  if (!c) return <p role="status">Loading collection…</p>;
  const ids = c.products.map((p) => p.id);

  function onSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const at = (name: string) =>
      f.get(name) ? new Date(String(f.get(name))).toISOString() : null;
    update.mutate({
      status: String(f.get("status")),
      startsAt: at("startsAt"),
      endsAt: at("endsAt"),
    });
  }

  return (
    <section className={`${ui.panel} ${ui.stack}`} aria-labelledby="col-edit">
      <h2 id="col-edit">{c.name}</h2>
      <ErrorSummary
        error={update.error ?? setProducts.error}
        title="The collection was not saved"
      />
      {update.isSuccess || setProducts.isSuccess ? (
        <Notice>Collection saved.</Notice>
      ) : null}
      <form
        className={ui.row}
        onSubmit={onSave}
        key={`${c.status}${c.startsAt}${c.endsAt}`}
      >
        <fieldset
          disabled={!canEdit}
          className={ui.row}
          style={{ border: 0, padding: 0, margin: 0 }}
        >
          <Select label="Status" name="status" defaultValue={c.status}>
            <option value="DRAFT">Draft</option>
            <option value="PUBLISHED">Published</option>
            <option value="ARCHIVED">Archived</option>
          </Select>
          <TextField
            label="Starts (India time)"
            name="startsAt"
            type="datetime-local"
            defaultValue={toLocalInput(c.startsAt)}
          />
          <TextField
            label="Ends (India time)"
            name="endsAt"
            type="datetime-local"
            defaultValue={toLocalInput(c.endsAt)}
          />
          <Button type="submit" busy={update.isPending}>
            Save
          </Button>
        </fieldset>
      </form>
      <fieldset disabled={!canEdit} style={{ border: 0, padding: 0 }}>
        <legend>Products in this collection</legend>
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            display: "grid",
            gap: "var(--sp-space-1)",
          }}
        >
          {products.data?.products.map((p) => (
            <li key={p.id}>
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
                  checked={ids.includes(p.id)}
                  onChange={(e) =>
                    setProducts.mutate(
                      e.target.checked
                        ? [...ids, p.id]
                        : ids.filter((x) => x !== p.id),
                    )
                  }
                />
                {p.name} <Status value={p.status} />
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
    </section>
  );
}
