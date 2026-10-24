import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent } from "react";

import { get, send } from "../api.ts";
import { useAuth } from "../auth.tsx";
import type { Category, Status as PublishStatus } from "../types.ts";
import {
  Button,
  ErrorSummary,
  Select,
  Status,
  TextField,
  ui,
} from "../ui/ui.tsx";

export function Categories() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const canEdit = can("products.editContent");
  const list = useQuery({
    queryKey: ["categories"],
    queryFn: () => get<{ categories: Category[] }>("/admin/categories"),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["categories"] });
  const create = useMutation({
    mutationFn: (body: object) => send("POST", "/admin/categories", body),
    onSuccess: refresh,
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: object }) =>
      send("PATCH", `/admin/categories/${id}`, body),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => send("DELETE", `/admin/categories/${id}`),
    onSuccess: refresh,
  });
  const byId = new Map(list.data?.categories.map((c) => [c.id, c]));

  function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const parentId = String(f.get("parentId"));
    create.mutate(
      {
        name: String(f.get("name")).trim(),
        ...(parentId ? { parentId } : {}),
        ...(f.get("slug") ? { slug: String(f.get("slug")) } : {}),
      },
      { onSuccess: () => form.reset() },
    );
  }

  return (
    <div className={ui.stack}>
      <h1>Categories</h1>
      <p className={ui.muted}>
        Only published categories and their published products appear on the
        storefront.
      </p>
      <ErrorSummary
        error={update.error ?? remove.error}
        title="The category was not changed"
      />
      <div className={ui.tableWrap}>
        <table className={ui.table}>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Parent</th>
              <th scope="col">Products</th>
              <th scope="col">Status</th>
              {canEdit ? <th scope="col">Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {list.data?.categories.map((c) => (
              <tr key={c.id}>
                <td>
                  {c.name}
                  <br />
                  <span className={ui.muted}>/{c.slug}</span>
                </td>
                <td>{c.parentId ? byId.get(c.parentId)?.name : "—"}</td>
                <td>{c.productCount}</td>
                <td>
                  <Status value={c.status} />
                </td>
                {canEdit ? (
                  <td>
                    <div className={ui.row}>
                      <Select
                        label={`Status of ${c.name}`}
                        value={c.status}
                        onChange={(e) =>
                          update.mutate({
                            id: c.id,
                            body: { status: e.target.value as PublishStatus },
                          })
                        }
                      >
                        <option value="DRAFT">Draft</option>
                        <option value="PUBLISHED">Published</option>
                        <option value="ARCHIVED">Archived</option>
                      </Select>
                      <Button
                        variant="danger"
                        disabled={c.productCount > 0 || c.childCount > 0}
                        onClick={() =>
                          window.confirm(
                            `Delete “${c.name}”? This cannot be undone.`,
                          ) && remove.mutate(c.id)
                        }
                      >
                        Delete
                      </Button>
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {list.data?.categories.length === 0 ? <p>No categories yet.</p> : null}
      {canEdit ? (
        <form
          className={`${ui.panel} ${ui.stack}`}
          onSubmit={onCreate}
          noValidate
          aria-labelledby="new-cat"
        >
          <h2 id="new-cat">New category</h2>
          <ErrorSummary
            error={create.error}
            title="The category was not created"
          />
          <div className={ui.row}>
            <TextField label="Name" name="name" required maxLength={80} />
            <TextField
              label="URL slug"
              name="slug"
              hint="Optional; made from the name."
            />
            <Select label="Parent" name="parentId" defaultValue="">
              <option value="">None (top level)</option>
              {list.data?.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Button type="submit" busy={create.isPending}>
              Create
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
