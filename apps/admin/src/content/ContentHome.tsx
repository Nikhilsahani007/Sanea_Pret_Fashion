// Content overview (phase-10-plan.md §3.9): homepage blocks with their state,
// pages, and the navigation menus. O M C.
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";

import { api, toApiError, withMessage, type ApiError } from "../api/client.ts";
import type { BlockView, List, PageView } from "../api/types.ts";
import { slugify } from "../lib/format.ts";
import { useResource } from "../lib/resource.ts";
import { Button, TextField } from "../ui/controls.tsx";
import {
  Empty,
  ErrorState,
  ErrorSummary,
  Loading,
  PageHeader,
  Panel,
  Stack,
  StatusChip,
  TableRegion,
  ui,
} from "../ui/feedback.tsx";
import s from "./content.module.css";

export const BLOCK_NAMES: Record<string, string> = {
  "site.announcement": "Announcement bar",
  "home.hero": "Hero slides",
  "home.newIns": "New Ins row",
  "home.row2": "Second product row",
  "home.tabbedGrid": "Tabbed grid",
  "home.editorial": "Editorial band",
  "site.footer": "Footer contact and social links",
};

export const MENU_NAMES: Record<string, string> = {
  HEADER: "Header",
  CATEGORY_PILLS: "Category pills",
  FOOTER_SHOP: "Footer: Shop",
  FOOTER_HELP: "Footer: Help",
  FOOTER_ABOUT: "Footer: About",
};

/** The block's state in words; colour is never the only signal. */
export function blockState(b: {
  published: unknown;
  unpublishedChanges: boolean;
  draft: unknown;
}) {
  if (!b.draft) return "Not started";
  if (!b.published) return "Not published";
  return b.unpublishedChanges
    ? "Published, with unpublished changes"
    : "Published";
}

export function ContentHome() {
  const blocks = useResource<BlockView[]>(
    async (signal) =>
      (await api.get<List<BlockView>>("/admin/content/blocks", { signal }))
        .items,
    [],
  );
  const pages = useResource<PageView[]>(
    async (signal) =>
      (await api.get<List<PageView>>("/admin/content/pages", { signal })).items,
    [],
  );

  return (
    <Stack gap="6">
      <PageHeader
        title="Content"
        description="Homepage sections, pages and menus. Changes are drafts until published; the shop shows only published content."
      />
      <Panel title="Homepage and site sections">
        {blocks.status === "loading" ? <Loading /> : null}
        {blocks.status === "error" ? (
          <ErrorState error={blocks.error} onRetry={blocks.reload} />
        ) : null}
        {blocks.status === "ready" ? (
          <ul className={s.list} aria-label="Content sections">
            {blocks.data.map((b) => (
              <li key={b.key} className={s.item}>
                <Link to={`/content/blocks/${b.key}`}>
                  {BLOCK_NAMES[b.key] ?? b.key}
                </Link>
                <p className={ui.hint}>
                  {blockState(b)}
                  {b.key === "home.editorial"
                    ? ". Not shown on the shop until approved (OD-23)."
                    : ""}
                </p>
              </li>
            ))}
          </ul>
        ) : null}
      </Panel>

      <Panel title="Pages">
        <Stack gap="4">
          {pages.status === "loading" ? <Loading /> : null}
          {pages.status === "error" ? (
            <ErrorState error={pages.error} onRetry={pages.reload} />
          ) : null}
          {pages.status === "ready" && pages.data.length === 0 ? (
            <Empty>
              <p>No pages yet.</p>
            </Empty>
          ) : null}
          {pages.status === "ready" && pages.data.length > 0 ? (
            <TableRegion label="Pages">
              <table className={ui.table}>
                <caption className="visually-hidden">Pages</caption>
                <thead>
                  <tr>
                    <th scope="col">Page</th>
                    <th scope="col">Status</th>
                    <th scope="col">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {pages.data.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <Link to={`/content/pages/${p.slug}`}>{p.title}</Link>
                      </td>
                      <td>
                        <StatusChip status={p.status} />
                      </td>
                      <td>
                        {p.requiresVerification
                          ? "Owner verification required. "
                          : ""}
                        {p.unpublishedChanges && p.status === "PUBLISHED"
                          ? "Unpublished changes."
                          : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableRegion>
          ) : null}
          <NewPage onCreated={pages.reload} />
        </Stack>
      </Panel>

      <Panel title="Menus">
        <ul className={s.list}>
          {Object.entries(MENU_NAMES).map(([menu, name]) => (
            <li key={menu}>
              <Link to={`/content/navigation/${menu}`}>{name}</Link>
            </li>
          ))}
        </ul>
      </Panel>
    </Stack>
  );
}

function NewPage({ onCreated }: { onCreated: () => void }) {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [edited, setEdited] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const page = await api.post<PageView>("/admin/content/pages", {
        title,
        slug,
      });
      onCreated();
      navigate(`/content/pages/${page.slug}`);
    } catch (err) {
      const apiError = toApiError(err);
      setError(
        apiError.status === 409
          ? withMessage(apiError, "Another page already uses this web address.")
          : apiError,
      );
    } finally {
      setBusy(false);
    }
  }

  const fields = error?.fieldErrors ?? {};
  return (
    <form onSubmit={submit} noValidate aria-label="New page">
      <fieldset className={ui.fieldset}>
        <legend>New page</legend>
        <Stack>
          <ErrorSummary
            error={error}
            fields={fields}
            idPrefix="page-"
            labels={{ title: "Title", slug: "Web address" }}
          />
          <div className={s.grid}>
            <TextField
              id="page-title"
              label="Title"
              maxLength={120}
              value={title}
              error={fields.title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (!edited) setSlug(slugify(e.target.value));
              }}
            />
            <TextField
              id="page-slug"
              label="Web address"
              hint="Fixed once the page is created."
              spellCheck={false}
              maxLength={100}
              value={slug}
              error={fields.slug}
              onChange={(e) => {
                setSlug(e.target.value);
                setEdited(true);
              }}
            />
          </div>
          <div>
            <Button type="submit" busy={busy} busyLabel="Creating…">
              Create page
            </Button>
          </div>
        </Stack>
      </fieldset>
    </form>
  );
}
