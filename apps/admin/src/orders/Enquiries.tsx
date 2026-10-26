// Enquiries inbox (project-requirements.md §3.2, phase-16-plan.md): website
// enquiries with status and assignee, and anonymous WhatsApp interest per
// product. Owner and Manager (`enquiries.manage`). Replies happen by email,
// phone or WhatsApp outside the system; this screen tracks who has it.
import { useState } from "react";
import { useSearchParams } from "react-router";

import { api, query, toApiError, type ApiError } from "../api/client.ts";
import { when } from "../lib/format.ts";
import { useResource } from "../lib/resource.ts";
import { SelectField } from "../ui/controls.tsx";
import {
  Empty,
  ErrorState,
  Loading,
  Notice,
  PageHeader,
  Panel,
  Stack,
  TableRegion,
  ui,
} from "../ui/feedback.tsx";
import s from "./orders.module.css";

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
type Inbox = { enquiries: Enquiry[]; nextBefore: string | null };
type Assignee = { id: string; name: string };
type Clicks = {
  days: number;
  products: {
    product: { name: string; slug: string } | null;
    clicks: number;
  }[];
};

const STATUS: Record<Enquiry["status"], string> = {
  NEW: "New",
  IN_PROGRESS: "In progress",
  CLOSED: "Closed",
};

export function Enquiries() {
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? "";
  const inbox = useResource<Inbox>(
    (signal) =>
      api.get(`/admin/enquiries${query({ status, limit: 100 })}`, { signal }),
    [status],
  );
  const assignees = useResource<{ assignees: Assignee[] }>(
    (signal) => api.get("/admin/enquiries/assignees", { signal }),
    [],
  );
  const clicks = useResource<Clicks>(
    (signal) => api.get("/admin/enquiries/whatsapp-clicks", { signal }),
    [],
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  async function update(e: Enquiry, change: Record<string, unknown>) {
    setError(null);
    setMessage(null);
    try {
      await api.patch(`/admin/enquiries/${e.id}`, change);
      setMessage(`Enquiry from ${e.name} updated.`);
      inbox.reload();
    } catch (err) {
      setError(toApiError(err));
    }
  }

  const people = assignees.status === "ready" ? assignees.data.assignees : [];
  const rows = inbox.status === "ready" ? inbox.data.enquiries : [];

  return (
    <Stack gap="6">
      <PageHeader
        title="Enquiries"
        description="Questions sent from the website. Reply by email, phone or WhatsApp, then record it here."
      />
      {message ? <Notice tone="success" title={message} /> : null}
      {error ? <Notice tone="error" title={error.message} /> : null}
      <div>
        <SelectField
          label="Show"
          optional
          value={status}
          onChange={(e) => {
            const next = new URLSearchParams(params);
            if (e.target.value) next.set("status", e.target.value);
            else next.delete("status");
            setParams(next, { replace: true });
          }}
        >
          <option value="">All enquiries</option>
          {Object.entries(STATUS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </SelectField>
      </div>
      {inbox.status === "loading" ? (
        <Loading label="Loading enquiries…" />
      ) : null}
      {inbox.status === "error" ? (
        <ErrorState error={inbox.error} onRetry={inbox.reload} />
      ) : null}
      {inbox.status === "ready" && rows.length === 0 ? (
        <Empty>
          <p>
            {status
              ? "No enquiries with this status."
              : "No enquiries yet. Questions from product pages appear here."}
          </p>
        </Empty>
      ) : null}
      {rows.length > 0 ? (
        <TableRegion label="Enquiries">
          <table className={ui.table}>
            <caption className="visually-hidden">
              Enquiries, newest first
            </caption>
            <thead>
              <tr>
                <th scope="col">Received</th>
                <th scope="col">From</th>
                <th scope="col">Message</th>
                <th scope="col">About</th>
                <th scope="col">Status</th>
                <th scope="col">Assigned to</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id}>
                  <td>{when(e.createdAt)}</td>
                  <td>
                    {e.name}
                    {e.email ? (
                      <>
                        <br />
                        <a href={`mailto:${e.email}`}>{e.email}</a>
                      </>
                    ) : null}
                    {e.phone ? (
                      <>
                        <br />
                        <a href={`tel:${e.phone}`}>{e.phone}</a>
                      </>
                    ) : null}
                  </td>
                  <td>
                    <p className={s.message}>{e.message}</p>
                  </td>
                  <td>
                    {e.product ? e.product.name : e.sourcePath}
                    {e.sku ? (
                      <>
                        <br />
                        <span className={ui.code}>{e.sku}</span>
                      </>
                    ) : null}
                  </td>
                  <td>
                    <label className="visually-hidden" htmlFor={`st-${e.id}`}>
                      Status of the enquiry from {e.name}
                    </label>
                    <select
                      id={`st-${e.id}`}
                      className={ui.control}
                      value={e.status}
                      onChange={(ev) => update(e, { status: ev.target.value })}
                    >
                      {Object.entries(STATUS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <label className="visually-hidden" htmlFor={`as-${e.id}`}>
                      Assign the enquiry from {e.name}
                    </label>
                    <select
                      id={`as-${e.id}`}
                      className={ui.control}
                      value={e.assignedTo?.id ?? ""}
                      onChange={(ev) =>
                        update(e, { assignedAdminId: ev.target.value || null })
                      }
                    >
                      <option value="">Nobody</option>
                      {people.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableRegion>
      ) : null}

      <Panel title="WhatsApp interest">
        {clicks.status === "ready" ? (
          clicks.data.products.length === 0 ? (
            <p className={ui.muted}>
              No WhatsApp button taps in the last {clicks.data.days} days.
            </p>
          ) : (
            <Stack gap="3">
              <p className={ui.muted}>
                Taps on the WhatsApp button in the last {clicks.data.days} days.
                They are anonymous: no names or numbers are recorded.
              </p>
              <ul>
                {clicks.data.products.map((p, i) => (
                  <li key={p.product?.slug ?? `other-${i}`}>
                    {p.product?.name ?? "Pages without a product"}: {p.clicks}
                  </li>
                ))}
              </ul>
            </Stack>
          )
        ) : clicks.status === "error" ? (
          <ErrorState error={clicks.error} onRetry={clicks.reload} />
        ) : (
          <Loading />
        )}
      </Panel>
    </Stack>
  );
}
