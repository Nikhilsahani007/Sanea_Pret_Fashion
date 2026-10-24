// Enquiries inbox (project-requirements.md §3.2): website enquiries with
// status and assignee, and anonymous WhatsApp interest per product.
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useSearchParams } from "react-router";

import { get, send } from "../api.ts";
import { dateTime } from "../orders.ts";
import { Button, ErrorSummary, Select, ui } from "../ui/ui.tsx";

type Enquiry = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  message: string;
  status: "NEW" | "IN_PROGRESS" | "CLOSED";
  sourcePath: string;
  product: { name: string; slug: string } | null;
  sku: string | null;
  assignedTo: { id: string; name: string } | null;
  createdAt: string;
};
const LABEL = {
  NEW: "New",
  IN_PROGRESS: "In progress",
  CLOSED: "Closed",
} as const;

export function Enquiries() {
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? "";
  const qc = useQueryClient();
  const list = useInfiniteQuery({
    queryKey: ["enquiries", status],
    queryFn: ({ pageParam }) =>
      get<{ enquiries: Enquiry[]; nextBefore: string | null }>(
        "/admin/enquiries",
        {
          status: status || undefined,
          before: pageParam,
        },
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (l) => l.nextBefore ?? undefined,
  });
  const clicks = useQuery({
    queryKey: ["whatsapp-clicks"],
    queryFn: () =>
      get<{
        days: number;
        products: { product: { name: string } | null; clicks: number }[];
      }>("/admin/enquiries/whatsapp-clicks"),
  });
  const update = useMutation({
    mutationFn: (v: { id: string; status: string }) =>
      send("PATCH", `/admin/enquiries/${v.id}`, { status: v.status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["enquiries"] }),
  });
  const rows = list.data?.pages.flatMap((p) => p.enquiries) ?? [];

  return (
    <div className={ui.stack}>
      <h1>Enquiries</h1>
      <div className={ui.row}>
        <Select
          label="Show"
          value={status}
          onChange={(e) =>
            setParams(e.target.value ? { status: e.target.value } : {})
          }
        >
          <option value="">All</option>
          {Object.entries(LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
      </div>
      <ErrorSummary error={list.error ?? update.error} />
      {list.data && rows.length === 0 ? (
        <p className={ui.panel}>No enquiries.</p>
      ) : null}
      {rows.map((e) => (
        <article
          key={e.id}
          className={ui.panel}
          aria-labelledby={`enq-${e.id}`}
        >
          <h2 id={`enq-${e.id}`}>
            {e.name} · <span className={ui.muted}>{dateTime(e.createdAt)}</span>
          </h2>
          <p className={ui.muted}>
            {e.product
              ? `About ${e.product.name}${e.sku ? ` (${e.sku})` : ""} · `
              : ""}
            from {e.sourcePath}
          </p>
          <p style={{ whiteSpace: "pre-wrap" }}>{e.message}</p>
          <p>
            {e.email ? <a href={`mailto:${e.email}`}>{e.email}</a> : null}
            {e.email && e.phone ? " · " : null}
            {e.phone ? <a href={`tel:${e.phone}`}>{e.phone}</a> : null}
          </p>
          <div className={ui.row}>
            <span className={ui.status} data-status={e.status}>
              {LABEL[e.status]}
            </span>
            {e.status !== "IN_PROGRESS" ? (
              <Button
                variant="secondary"
                onClick={() =>
                  update.mutate({ id: e.id, status: "IN_PROGRESS" })
                }
              >
                Mark in progress
              </Button>
            ) : null}
            {e.status !== "CLOSED" ? (
              <Button
                variant="secondary"
                onClick={() => update.mutate({ id: e.id, status: "CLOSED" })}
              >
                Close
              </Button>
            ) : null}
          </div>
        </article>
      ))}
      {list.hasNextPage ? (
        <Button
          variant="secondary"
          busy={list.isFetchingNextPage}
          onClick={() => list.fetchNextPage()}
        >
          Show more
        </Button>
      ) : null}
      <section className={ui.panel} aria-labelledby="wa">
        <h2 id="wa">WhatsApp interest, last {clicks.data?.days ?? 30} days</h2>
        <p className={ui.muted}>
          Anonymous clicks on “Ask on WhatsApp”. The conversations happen in
          WhatsApp.
        </p>
        {clicks.data && clicks.data.products.length === 0 ? (
          <p>No clicks yet.</p>
        ) : null}
        <ul>
          {clicks.data?.products.map((p, i) => (
            <li key={i}>
              {p.product?.name ?? "No product (general)"}: {p.clicks}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
