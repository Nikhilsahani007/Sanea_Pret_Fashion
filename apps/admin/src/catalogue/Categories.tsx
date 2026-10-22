// Categories: the tree, one form to create or edit, and delete (refused with
// 409 while products or sub-categories use it; archive instead).
import { useState, type FormEvent } from "react";

import { api, toApiError, withMessage, type ApiError } from "../api/client.ts";
import type { Category, List, Status } from "../api/types.ts";
import { slugify } from "../lib/format.ts";
import { useResource } from "../lib/resource.ts";
import { Button, SelectField, TextField } from "../ui/controls.tsx";
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
  StatusChip,
  ui,
} from "../ui/feedback.tsx";
import s from "./catalogue.module.css";

type Draft = {
  name: string;
  slug: string;
  parentId: string;
  status: Status;
  position: string;
};
const EMPTY: Draft = {
  name: "",
  slug: "",
  parentId: "",
  status: "DRAFT",
  position: "0",
};

export function Categories() {
  const list = useResource<Category[]>(
    async (signal) =>
      (await api.get<List<Category>>("/admin/categories", { signal })).items,
    [],
  );
  const [editing, setEditing] = useState<Category | null>(null);
  // A new key after each save gives an empty form for the next item.
  const [formVersion, setFormVersion] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  async function remove(c: Category) {
    if (
      !window.confirm(`Delete the category “${c.name}”? This cannot be undone.`)
    )
      return;
    setError(null);
    setMessage(null);
    try {
      await api.delete(`/admin/categories/${c.id}`);
      setMessage(`“${c.name}” deleted.`);
      if (editing?.id === c.id) setEditing(null);
      list.reload();
    } catch (err) {
      const e = toApiError(err);
      setError(
        e.status === 409
          ? withMessage(
              e,
              `“${c.name}” still has products or sub-categories, so it cannot be deleted. Archive it instead, or move them first.`,
            )
          : e,
      );
    }
  }

  if (list.status === "loading") return <Loading label="Loading categories…" />;
  if (list.status === "error")
    return <ErrorState error={list.error} onRetry={list.reload} />;
  const categories = list.data;

  function tree(parentId: string | null, depth = 0): React.ReactNode {
    const children = categories.filter((c) => c.parentId === parentId);
    if (!children.length || depth > 10) return null;
    return (
      <ul className={s.tree}>
        {children.map((c) => (
          <li key={c.id}>
            <div className={s.treeItem}>
              <span>{c.name}</span>
              <StatusChip status={c.status} />
              <span className={ui.hint}>/{c.slug}</span>
              <Cluster gap="2">
                <Button
                  variant="secondary"
                  size="small"
                  onClick={() => setEditing(c)}
                  aria-label={`Edit ${c.name}`}
                >
                  Edit
                </Button>
                <Button
                  variant="danger"
                  size="small"
                  onClick={() => remove(c)}
                  aria-label={`Delete ${c.name}`}
                >
                  Delete
                </Button>
              </Cluster>
            </div>
            {tree(c.id, depth + 1)}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <Stack gap="6">
      <PageHeader
        title="Categories"
        description="Products belong to one category. A category must be published before its products can be."
      />
      {message ? <Notice tone="success" title={message} /> : null}
      {error ? <Notice tone="error" title={error.message} /> : null}
      <Panel title="All categories">
        {categories.length === 0 ? (
          <Empty>
            <p>No categories yet. Create the first one below.</p>
          </Empty>
        ) : (
          tree(null)
        )}
      </Panel>
      <CategoryForm
        key={editing?.id ?? `new-${formVersion}`}
        categories={categories}
        editing={editing}
        onCancel={() => setEditing(null)}
        onSaved={(name, created) => {
          setMessage(created ? `“${name}” created.` : `“${name}” saved.`);
          setEditing(null);
          setFormVersion((v) => v + 1);
          list.reload();
        }}
      />
    </Stack>
  );
}

function CategoryForm({
  categories,
  editing,
  onSaved,
  onCancel,
}: {
  categories: Category[];
  editing: Category | null;
  onSaved: (name: string, created: boolean) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(
    editing
      ? {
          name: editing.name,
          slug: editing.slug,
          parentId: editing.parentId ?? "",
          status: editing.status,
          position: String(editing.position),
        }
      : EMPTY,
  );
  const [slugEdited, setSlugEdited] = useState(Boolean(editing));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = {
      name: draft.name,
      slug: draft.slug,
      parentId: draft.parentId || null,
      status: draft.status,
      position: Number(draft.position) || 0,
    };
    try {
      if (editing) await api.patch(`/admin/categories/${editing.id}`, body);
      else await api.post("/admin/categories", body);
      onSaved(draft.name, !editing);
    } catch (err) {
      const apiError = toApiError(err);
      setError(
        apiError.status === 409 && !apiError.details
          ? withMessage(
              apiError,
              "Another category already uses this web address, or the parent would create a loop.",
            )
          : apiError,
      );
    } finally {
      setBusy(false);
    }
  }

  const fields = error?.fieldErrors ?? {};
  const parents = categories.filter((c) => c.id !== editing?.id);
  return (
    <Panel title={editing ? `Edit “${editing.name}”` : "New category"}>
      <form onSubmit={submit} noValidate>
        <Stack>
          <ErrorSummary
            error={error}
            fields={fields}
            idPrefix="cat-"
            labels={{
              name: "Name",
              slug: "Web address",
              parentId: "Parent",
              position: "Order",
            }}
          />
          <div className={s.twoColumns}>
            <TextField
              id="cat-name"
              label="Name"
              maxLength={120}
              value={draft.name}
              error={fields.name}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  name: e.target.value,
                  slug: slugEdited ? d.slug : slugify(e.target.value),
                }))
              }
            />
            <TextField
              id="cat-slug"
              label="Web address"
              spellCheck={false}
              maxLength={100}
              value={draft.slug}
              error={fields.slug}
              onChange={(e) => {
                setSlugEdited(true);
                setDraft((d) => ({ ...d, slug: e.target.value }));
              }}
            />
            <SelectField
              id="cat-parentId"
              label="Parent category"
              optional
              value={draft.parentId}
              error={fields.parentId}
              onChange={(e) =>
                setDraft((d) => ({ ...d, parentId: e.target.value }))
              }
            >
              <option value="">None (top level)</option>
              {parents.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectField>
            <SelectField
              id="cat-status"
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
            <TextField
              id="cat-position"
              label="Order"
              hint="Lower numbers appear first."
              inputMode="numeric"
              value={draft.position}
              error={fields.position}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  position: e.target.value.replace(/\D/g, ""),
                }))
              }
            />
          </div>
          <Cluster>
            <Button type="submit" busy={busy} busyLabel="Saving…">
              {editing ? "Save category" : "Create category"}
            </Button>
            {editing ? (
              <Button variant="quiet" onClick={onCancel}>
                Cancel
              </Button>
            ) : null}
          </Cluster>
        </Stack>
      </form>
    </Panel>
  );
}
