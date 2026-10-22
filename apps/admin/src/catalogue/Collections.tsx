// Collections: list and create; the editor sets details, the schedule (times
// in India Standard Time) and the product order, moved with buttons.
import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";

import {
  api,
  query,
  toApiError,
  withMessage,
  type ApiError,
} from "../api/client.ts";
import type {
  Collection,
  CollectionDetail,
  List,
  Page,
  ProductSummary,
  Status,
} from "../api/types.ts";
import { isoToLocal, localToIso, slugify, when } from "../lib/format.ts";
import { useResource } from "../lib/resource.ts";
import { Button, SelectField, TextArea, TextField } from "../ui/controls.tsx";
import {
  Cluster,
  Empty,
  ErrorState,
  ErrorSummary,
  Loading,
  Notice,
  PageHeader,
  Panel,
  Stack,
  TableRegion,
  StatusChip,
  ui,
} from "../ui/feedback.tsx";
import s from "./catalogue.module.css";

type Listed = Collection & { productCount: number };

export function Collections() {
  const navigate = useNavigate();
  const list = useResource<Listed[]>(
    async (signal) =>
      (await api.get<List<Listed>>("/admin/collections", { signal })).items,
    [],
  );
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const c = await api.post<Collection>("/admin/collections", {
        name,
        slug,
      });
      navigate(`/collections/${c.id}`);
    } catch (err) {
      const apiError = toApiError(err);
      setError(
        apiError.status === 409
          ? withMessage(
              apiError,
              "Another collection already uses this web address.",
            )
          : apiError,
      );
    } finally {
      setBusy(false);
    }
  }

  const fields = error?.fieldErrors ?? {};
  return (
    <Stack gap="6">
      <PageHeader
        title="Collections"
        description="Curated groups of products, such as a season or an occasion, optionally shown only between two dates."
      />
      {list.status === "loading" ? (
        <Loading label="Loading collections…" />
      ) : null}
      {list.status === "error" ? (
        <ErrorState error={list.error} onRetry={list.reload} />
      ) : null}
      {list.status === "ready" ? (
        list.data.length === 0 ? (
          <Empty>
            <p>No collections yet.</p>
          </Empty>
        ) : (
          <TableRegion label="Collections table">
            <table className={ui.table}>
              <caption className="visually-hidden">Collections</caption>
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Status</th>
                  <th scope="col" className={ui.numeric}>
                    Products
                  </th>
                  <th scope="col">Shown from</th>
                  <th scope="col">Shown until</th>
                </tr>
              </thead>
              <tbody>
                {list.data.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link to={`/collections/${c.id}`}>{c.name}</Link>
                    </td>
                    <td>
                      <StatusChip status={c.status} />
                    </td>
                    <td className={ui.numeric}>{c.productCount}</td>
                    <td>{c.startsAt ? when(c.startsAt) : "Any time"}</td>
                    <td>{c.endsAt ? when(c.endsAt) : "No end"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableRegion>
        )
      ) : null}
      <Panel title="New collection">
        <form onSubmit={create} noValidate>
          <Stack>
            <ErrorSummary
              error={error}
              fields={fields}
              idPrefix="new-"
              labels={{ name: "Name", slug: "Web address" }}
            />
            <div className={s.twoColumns}>
              <TextField
                id="new-name"
                label="Name"
                maxLength={120}
                value={name}
                error={fields.name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!slugEdited) setSlug(slugify(e.target.value));
                }}
              />
              <TextField
                id="new-slug"
                label="Web address"
                spellCheck={false}
                maxLength={100}
                value={slug}
                error={fields.slug}
                onChange={(e) => {
                  setSlug(e.target.value);
                  setSlugEdited(true);
                }}
              />
            </div>
            <div>
              <Button type="submit" busy={busy} busyLabel="Creating…">
                Create collection
              </Button>
            </div>
          </Stack>
        </form>
      </Panel>
    </Stack>
  );
}

/** Every product summary, following cursors (the admin list pages by 100). */
async function allProducts(signal: AbortSignal): Promise<ProductSummary[]> {
  const out: ProductSummary[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 20; i += 1) {
    const page = await api.get<Page<ProductSummary>>(
      `/admin/products${query({ limit: 100, cursor })}`,
      { signal },
    );
    out.push(...page.items);
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  }
  return out;
}

export function CollectionEditor() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const data = useResource<{
    collection: CollectionDetail;
    products: ProductSummary[];
  }>(
    async (signal) => {
      const [collection, products] = await Promise.all([
        api.get<CollectionDetail>(`/admin/collections/${id}`, { signal }),
        allProducts(signal),
      ]);
      return { collection, products };
    },
    [id],
  );
  const [message, setMessage] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<ApiError | null>(null);

  if (data.status === "loading") return <Loading label="Loading collection…" />;
  if (data.status === "error")
    return <ErrorState error={data.error} onRetry={data.reload} />;
  const { collection, products } = data.data;

  async function remove() {
    if (
      !window.confirm(
        `Delete the collection “${collection.name}”? Its products are not affected.`,
      )
    )
      return;
    try {
      await api.delete(`/admin/collections/${collection.id}`);
      navigate("/collections");
    } catch (err) {
      setDeleteError(toApiError(err));
    }
  }

  return (
    <Stack gap="6">
      <p>
        <Link to="/collections">All collections</Link>
      </p>
      <PageHeader title={collection.name}>
        <StatusChip status={collection.status} />
      </PageHeader>
      {message ? <Notice tone="success" title={message} /> : null}
      <CollectionDetails
        key={`${collection.id}`}
        collection={collection}
        onSaved={() => {
          setMessage("Collection saved.");
          data.reload();
        }}
      />
      <ProductOrder
        collection={collection}
        products={products}
        onSaved={() => {
          setMessage("Product order saved.");
          data.reload();
        }}
      />
      <Panel title="Delete collection">
        <Stack gap="3">
          {deleteError ? (
            <Notice tone="error" title={deleteError.message} />
          ) : null}
          <div>
            <Button variant="danger" onClick={remove}>
              Delete collection
            </Button>
          </div>
        </Stack>
      </Panel>
    </Stack>
  );
}

function CollectionDetails({
  collection,
  onSaved,
}: {
  collection: CollectionDetail;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState({
    name: collection.name,
    slug: collection.slug,
    description: collection.description ?? "",
    status: collection.status,
    startsAt: isoToLocal(collection.startsAt),
    endsAt: isoToLocal(collection.endsAt),
    seoTitle: collection.seoTitle ?? "",
    seoDescription: collection.seoDescription ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/admin/collections/${collection.id}`, {
        name: draft.name,
        slug: draft.slug,
        description: draft.description.trim() || null,
        status: draft.status,
        startsAt: localToIso(draft.startsAt),
        endsAt: localToIso(draft.endsAt),
        seoTitle: draft.seoTitle.trim() || null,
        seoDescription: draft.seoDescription.trim() || null,
      });
      onSaved();
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  const fields = error?.fieldErrors ?? {};
  const set = (key: keyof typeof draft) => (e: { target: { value: string } }) =>
    setDraft((d) => ({ ...d, [key]: e.target.value }));
  return (
    <Panel title="Details and schedule">
      <form onSubmit={save} noValidate>
        <Stack>
          <ErrorSummary
            error={error}
            fields={fields}
            idPrefix="col-"
            labels={{
              name: "Name",
              slug: "Web address",
              endsAt: "Shown until",
              startsAt: "Shown from",
            }}
          />
          <div className={s.twoColumns}>
            <TextField
              id="col-name"
              label="Name"
              maxLength={120}
              value={draft.name}
              onChange={set("name")}
              error={fields.name}
            />
            <TextField
              id="col-slug"
              label="Web address"
              spellCheck={false}
              maxLength={100}
              value={draft.slug}
              onChange={set("slug")}
              error={fields.slug}
            />
            <SelectField
              id="col-status"
              label="Status"
              value={draft.status}
              onChange={(e) =>
                setDraft((d) => ({ ...d, status: e.target.value as Status }))
              }
            >
              <option value="DRAFT">Draft</option>
              <option value="PUBLISHED">Published</option>
              <option value="ARCHIVED">Archived</option>
            </SelectField>
            <TextArea
              id="col-description"
              label="Description"
              optional
              maxLength={1000}
              rows={3}
              value={draft.description}
              onChange={set("description")}
              error={fields.description}
            />
            <TextField
              id="col-startsAt"
              label="Shown from"
              optional
              type="datetime-local"
              hint="India Standard Time. Empty: as soon as it is published."
              value={draft.startsAt}
              onChange={set("startsAt")}
              error={fields.startsAt}
            />
            <TextField
              id="col-endsAt"
              label="Shown until"
              optional
              type="datetime-local"
              hint="India Standard Time. Empty: no end date."
              value={draft.endsAt}
              onChange={set("endsAt")}
              error={fields.endsAt}
            />
            <TextField
              id="col-seoTitle"
              label="Search title"
              optional
              maxLength={70}
              value={draft.seoTitle}
              onChange={set("seoTitle")}
              error={fields.seoTitle}
            />
            <TextArea
              id="col-seoDescription"
              label="Search description"
              optional
              maxLength={160}
              rows={2}
              value={draft.seoDescription}
              onChange={set("seoDescription")}
              error={fields.seoDescription}
            />
          </div>
          <div>
            <Button type="submit" busy={busy} busyLabel="Saving…">
              Save collection
            </Button>
          </div>
        </Stack>
      </form>
    </Panel>
  );
}

function ProductOrder({
  collection,
  products,
  onSaved,
}: {
  collection: CollectionDetail;
  products: ProductSummary[];
  onSaved: () => void;
}) {
  const [order, setOrder] = useState<string[]>(
    collection.products.map((p) => p.productId),
  );
  const [adding, setAdding] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const byId = new Map(products.map((p) => [p.id, p]));
  const dirty =
    order.join() !== collection.products.map((p) => p.productId).join();

  const move = (i: number, by: -1 | 1) =>
    setOrder((o) => {
      const next = [...o];
      const [id] = next.splice(i, 1);
      next.splice(i + by, 0, id!);
      return next;
    });

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api.put(`/admin/collections/${collection.id}/products`, {
        productIds: order,
      });
      onSaved();
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  const available = products.filter((p) => !order.includes(p.id));
  return (
    <Panel title="Products in this collection">
      <Stack gap="4">
        {error ? <Notice tone="error" title={error.message} /> : null}
        {order.length === 0 ? (
          <p className={ui.muted}>No products yet.</p>
        ) : (
          <ol className={s.orderList} aria-label="Products in display order">
            {order.map((pid, i) => {
              const p = byId.get(pid);
              const name = p?.name ?? "Unknown product";
              return (
                <li key={pid} className={s.orderItem}>
                  <span>
                    {i + 1}. {name}{" "}
                    {p ? <StatusChip status={p.status} /> : null}
                  </span>
                  <Cluster gap="2">
                    <Button
                      variant="secondary"
                      size="small"
                      disabled={i === 0}
                      onClick={() => move(i, -1)}
                      aria-label={`Move ${name} up`}
                    >
                      Move up
                    </Button>
                    <Button
                      variant="secondary"
                      size="small"
                      disabled={i === order.length - 1}
                      onClick={() => move(i, 1)}
                      aria-label={`Move ${name} down`}
                    >
                      Move down
                    </Button>
                    <Button
                      variant="danger"
                      size="small"
                      onClick={() =>
                        setOrder((o) => o.filter((x) => x !== pid))
                      }
                      aria-label={`Remove ${name} from the collection`}
                    >
                      Remove
                    </Button>
                  </Cluster>
                </li>
              );
            })}
          </ol>
        )}
        <Cluster gap="3">
          <div>
            <SelectField
              label="Add a product"
              optional
              value={adding}
              onChange={(e) => setAdding(e.target.value)}
            >
              <option value="">Choose a product</option>
              {available.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </SelectField>
          </div>
          <Button
            variant="secondary"
            disabled={!adding}
            onClick={() => {
              setOrder((o) => [...o, adding]);
              setAdding("");
            }}
          >
            Add to the list
          </Button>
        </Cluster>
        <Cluster>
          <Button
            onClick={save}
            disabled={!dirty}
            busy={busy}
            busyLabel="Saving…"
          >
            Save product order
          </Button>
          {dirty ? (
            <span className={ui.hint} role="status">
              Unsaved changes to the order.
            </span>
          ) : null}
        </Cluster>
      </Stack>
    </Panel>
  );
}
