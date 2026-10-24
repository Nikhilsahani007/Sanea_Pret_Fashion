import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";

import { get } from "../api.ts";
import { ROLE_LABELS, useAuth } from "../auth.tsx";
import type { ProductRow } from "../types.ts";
import { ui } from "../ui/ui.tsx";

/** Overview. The role-tailored dashboard arrives in Phase 16. */
export function Home() {
  const { state } = useAuth();
  const drafts = useQuery({
    queryKey: ["products", "DRAFT"],
    queryFn: () =>
      get<{ products: ProductRow[] }>("/admin/products", {
        status: "DRAFT",
        limit: "100",
      }),
  });
  const live = useQuery({
    queryKey: ["products", "PUBLISHED"],
    queryFn: () =>
      get<{ products: ProductRow[] }>("/admin/products", {
        status: "PUBLISHED",
        limit: "100",
      }),
  });
  if (state.status !== "signedIn") return null;
  return (
    <div className={ui.stack}>
      <h1>Welcome, {state.admin.name}</h1>
      <p className={ui.muted}>Signed in as {ROLE_LABELS[state.admin.role]}.</p>
      <div className={ui.row}>
        <section className={ui.panel} aria-labelledby="live">
          <h2 id="live">Published products</h2>
          <p style={{ fontSize: "var(--sp-step-head)" }}>
            {live.data ? live.data.products.length : "…"}
          </p>
        </section>
        <section className={ui.panel} aria-labelledby="drafts">
          <h2 id="drafts">Drafts</h2>
          <p style={{ fontSize: "var(--sp-step-head)" }}>
            {drafts.data ? drafts.data.products.length : "…"}
          </p>
        </section>
      </div>
      <p>
        <Link to="/products">Go to products</Link>
      </p>
    </div>
  );
}
