import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";

import { get } from "../api.ts";
import { useAuth } from "../auth.tsx";
import { thumb, type ProductRow } from "../types.ts";
import {
  Button,
  ErrorSummary,
  Select,
  Status,
  TextField,
  ui,
} from "../ui/ui.tsx";

export function Products() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? "";
  const q = params.get("q") ?? "";
  const [draftQ, setDraftQ] = useState(q);
  const list = useQuery({
    queryKey: ["products", status, q],
    queryFn: () =>
      get<{ products: ProductRow[] }>("/admin/products", {
        status: status || undefined,
        q: q || undefined,
        limit: "100",
      }),
  });

  return (
    <div className={ui.stack}>
      <div className={ui.pageHead}>
        <h1>Products</h1>
        {can("products.editContent") ? (
          <Button onClick={() => navigate("/products/new")}>New product</Button>
        ) : null}
      </div>
      <form
        className={ui.row}
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          setParams((p) => {
            if (draftQ) p.set("q", draftQ);
            else p.delete("q");
            return p;
          });
        }}
      >
        <TextField
          label="Search name or SKU"
          value={draftQ}
          onChange={(e) => setDraftQ(e.target.value)}
          type="search"
        />
        <Select
          label="Status"
          value={status}
          onChange={(e) =>
            setParams((p) => {
              if (e.target.value) p.set("status", e.target.value);
              else p.delete("status");
              return p;
            })
          }
        >
          <option value="">All</option>
          <option value="DRAFT">Draft</option>
          <option value="PUBLISHED">Published</option>
          <option value="ARCHIVED">Archived</option>
        </Select>
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>
      <ErrorSummary error={list.error} />
      {list.data && list.data.products.length === 0 ? (
        <p className={ui.panel}>
          No products match.{" "}
          {can("products.editContent")
            ? "Create the first one with “New product”."
            : null}
        </p>
      ) : null}
      {list.data && list.data.products.length > 0 ? (
        <div className={ui.tableWrap}>
          <table className={ui.table}>
            <caption className="visually-hidden">
              Products, newest first
            </caption>
            <thead>
              <tr>
                <th scope="col">Image</th>
                <th scope="col">Name</th>
                <th scope="col">Category</th>
                <th scope="col">Variants</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {list.data.products.map((p) => (
                <tr key={p.id}>
                  <td>
                    {p.primaryImage ? (
                      <img
                        src={thumb(p.primaryImage.asset)}
                        alt=""
                        width={48}
                        height={60}
                        style={{ objectFit: "cover", display: "block" }}
                      />
                    ) : (
                      <span className={ui.muted}>None</span>
                    )}
                  </td>
                  <td>
                    <Link to={`/products/${p.id}`}>{p.name}</Link>
                    <br />
                    <span className={ui.muted}>/{p.slug}</span>
                  </td>
                  <td>{p.category.name}</td>
                  <td>{p.variantCount}</td>
                  <td>
                    <Status value={p.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {list.isPending ? <p role="status">Loading products…</p> : null}
    </div>
  );
}
