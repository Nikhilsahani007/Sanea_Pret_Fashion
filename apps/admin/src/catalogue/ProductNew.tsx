// New product (POST /admin/products): the required fields only. Variants,
// images and the description follow in the editor.
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";

import { api, toApiError, type ApiError } from "../api/client.ts";
import type { Category, List, Product } from "../api/types.ts";
import { slugify } from "../lib/format.ts";
import { useResource } from "../lib/resource.ts";
import { Button, SelectField, TextArea, TextField } from "../ui/controls.tsx";
import {
  Cluster,
  ErrorState,
  ErrorSummary,
  Loading,
  Notice,
  PageHeader,
  Stack,
} from "../ui/feedback.tsx";

export const PRODUCT_LABELS = {
  name: "Name",
  slug: "Web address",
  categoryId: "Category",
  shortDescription: "Short description",
};

export function ProductNew() {
  const navigate = useNavigate();
  const categories = useResource<Category[]>(
    async (signal) =>
      (await api.get<List<Category>>("/admin/categories", { signal })).items,
    [],
  );
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const [shortDescription, setShortDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await api.post<Product>("/admin/products", {
        name,
        slug,
        categoryId,
        shortDescription,
      });
      navigate(`/products/${created.id}`, { state: { created: true } });
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  const fields = error?.fieldErrors ?? {};
  return (
    <Stack gap="6">
      <PageHeader title="New product" />
      {categories.status === "loading" ? <Loading /> : null}
      {categories.status === "error" ? (
        <ErrorState error={categories.error} onRetry={categories.reload} />
      ) : null}
      {categories.status === "ready" && categories.data.length === 0 ? (
        <Notice title="Create a category first">
          <p>
            Every product belongs to a category.{" "}
            <Link to="/categories">Add a category</Link>.
          </p>
        </Notice>
      ) : null}
      {categories.status === "ready" && categories.data.length > 0 ? (
        <form onSubmit={submit} noValidate>
          <Stack>
            <ErrorSummary
              error={error}
              fields={fields}
              labels={PRODUCT_LABELS}
            />
            <TextField
              id="name"
              label="Name"
              maxLength={120}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!slugEdited) setSlug(slugify(e.target.value));
              }}
              error={fields.name}
            />
            <TextField
              id="slug"
              label="Web address"
              hint="Lowercase words joined by hyphens, used in the product's link. It cannot change after the product is first published."
              maxLength={100}
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value);
                setSlugEdited(true);
              }}
              error={fields.slug}
              spellCheck={false}
            />
            <SelectField
              id="categoryId"
              label="Category"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              error={fields.categoryId}
            >
              <option value="">Choose a category</option>
              {categories.data.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectField>
            <TextArea
              id="shortDescription"
              label="Short description"
              hint="One or two sentences shown on product cards. At most 200 characters."
              maxLength={200}
              value={shortDescription}
              onChange={(e) => setShortDescription(e.target.value)}
              error={fields.shortDescription}
            />
            <Cluster>
              <Button type="submit" busy={busy} busyLabel="Creating…">
                Create product
              </Button>
              <Link to="/products">Cancel</Link>
            </Cluster>
          </Stack>
        </form>
      ) : null}
    </Stack>
  );
}
