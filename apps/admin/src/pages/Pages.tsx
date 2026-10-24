import type { RichTextBlock } from "@sanea/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { get, send } from "../api.ts";
import { useAuth } from "../auth.tsx";
import { ImagePicker } from "../ui/pickers.tsx";
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

type PageRow = {
  slug: string;
  title: string;
  status: string;
  requiresVerification: boolean;
  verifiedAt: string | null;
};
type PageFull = PageRow & {
  draftBody: { blocks: RichTextBlock[] };
  publishedBody: unknown;
  seoTitle: string | null;
  seoDescription: string | null;
};

const REHMA = "rehma-foundation";

export function Pages() {
  const qc = useQueryClient();
  const { state } = useAuth();
  const role = state.status === "signedIn" ? state.admin.role : null;
  const list = useQuery({
    queryKey: ["pages"],
    queryFn: () => get<{ pages: PageRow[] }>("/admin/content/pages"),
  });
  const [selected, setSelected] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: (body: object) =>
      send<{ page: PageFull }>("POST", "/admin/content/pages", body),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ["pages"] });
      setSelected(res.page.slug);
    },
  });

  function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    create.mutate({
      slug: String(f.get("slug")).trim(),
      title: String(f.get("title")).trim(),
      body: { blocks: [] },
    });
  }

  return (
    <div className={ui.stack}>
      <h1>Pages</h1>
      <p className={ui.muted}>
        About, policies and the Rehma Foundation page. Text only, no HTML.
        Policy and legal text must come from you or your lawyer.
      </p>
      <div className={ui.tableWrap}>
        <table className={ui.table}>
          <thead>
            <tr>
              <th scope="col">Page</th>
              <th scope="col">Address</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {list.data?.pages.map((p) => (
              <tr key={p.slug}>
                <td>
                  <Button
                    variant="quiet"
                    onClick={() => setSelected(p.slug)}
                    aria-pressed={selected === p.slug}
                  >
                    {p.title}
                  </Button>
                </td>
                <td>/pages/{p.slug}</td>
                <td>
                  <Status value={p.status} />
                  {p.requiresVerification ? (
                    <span className={ui.muted}>
                      {" "}
                      ·{" "}
                      {p.verifiedAt
                        ? "Verified by the Owner"
                        : "Needs Owner verification"}
                    </span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {list.data?.pages.length === 0 ? <p>No pages yet.</p> : null}
      {selected ? (
        <PageEditor key={selected} slug={selected} role={role} />
      ) : null}
      <form
        className={`${ui.panel} ${ui.stack}`}
        onSubmit={onCreate}
        noValidate
        aria-labelledby="new-page"
      >
        <h2 id="new-page">New page</h2>
        <ErrorSummary error={create.error} title="The page was not created" />
        <div className={ui.row}>
          <TextField label="Title" name="title" required maxLength={120} />
          <TextField
            label="Address"
            name="slug"
            required
            hint={`Lowercase words with hyphens, for example “about”. The Rehma Foundation page is “${REHMA}”.`}
          />
          <Button type="submit" busy={create.isPending}>
            Create
          </Button>
        </div>
      </form>
    </div>
  );
}

const EMPTY: Record<RichTextBlock["type"], RichTextBlock> = {
  paragraph: { type: "paragraph", text: "" },
  heading: { type: "heading", level: 2, text: "" },
  list: { type: "list", ordered: false, items: [""] },
  link: { type: "link", text: "", href: "/" },
  image: { type: "image", mediaAssetId: "", alt: "" },
};

function PageEditor({ slug, role }: { slug: string; role: string | null }) {
  const qc = useQueryClient();
  const page = useQuery({
    queryKey: ["page", slug],
    queryFn: () => get<{ page: PageFull }>(`/admin/content/pages/${slug}`),
  });
  const [blocks, setBlocks] = useState<RichTextBlock[] | null>(null);
  const [verified, setVerified] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const p = page.data?.page;
  const current = blocks ?? p?.draftBody.blocks ?? [];
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["page", slug] });
    void qc.invalidateQueries({ queryKey: ["pages"] });
  };
  const save = useMutation({
    mutationFn: (body: object) =>
      send("PATCH", `/admin/content/pages/${slug}`, body),
    onSuccess: () => {
      setMessage("Draft saved.");
      refresh();
    },
  });
  const publish = useMutation({
    mutationFn: () =>
      send(
        "POST",
        `/admin/content/pages/${slug}/publish`,
        p?.requiresVerification ? { verified: true } : {},
      ),
    onSuccess: () => {
      setMessage("Published.");
      refresh();
    },
  });
  const unpublish = useMutation({
    mutationFn: () => send("POST", `/admin/content/pages/${slug}/unpublish`),
    onSuccess: () => {
      setMessage("Unpublished. The page now returns “not found”.");
      refresh();
    },
  });
  if (!p) return <p role="status">Loading page…</p>;
  const isRehma = p.requiresVerification;
  const canPublish = !isRehma || role === "OWNER";

  function onSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const opt = (k: string) => String(f.get(k) ?? "").trim() || null;
    save.mutate({
      title: String(f.get("title")).trim(),
      body: { blocks: current },
      seoTitle: opt("seoTitle"),
      seoDescription: opt("seoDescription"),
    });
  }
  const put = (i: number, b: RichTextBlock) =>
    setBlocks(current.map((x, j) => (j === i ? b : x)));

  return (
    <section className={`${ui.panel} ${ui.stack}`} aria-labelledby="page-edit">
      <div className={ui.pageHead}>
        <h2 id="page-edit">{p.title}</h2>
        <Status value={p.status} />
      </div>
      {isRehma ? (
        <p
          className={ui.notice}
          style={{ borderLeftColor: "var(--sp-danger)" }}
        >
          Rehma Foundation: publish only facts you have verified, such as
          registration and purpose. No donation figures, partnerships,
          beneficiary numbers or links between sales and giving unless verified.
          Only the Owner can publish.
        </p>
      ) : null}
      <ErrorSummary
        error={save.error ?? publish.error ?? unpublish.error}
        title="The page was not changed"
      />
      {message ? <Notice>{message}</Notice> : null}
      <form className={ui.stack} onSubmit={onSave} noValidate>
        <TextField
          label="Title"
          name="title"
          defaultValue={p.title}
          required
          maxLength={120}
        />
        <ol
          className={ui.stack}
          style={{ listStyle: "none", padding: 0, margin: 0 }}
        >
          {current.map((b, i) => (
            <li
              key={i}
              className={ui.stack}
              style={{
                borderLeft: "3px solid var(--sp-divider)",
                paddingLeft: "var(--sp-space-4)",
              }}
            >
              {b.type === "paragraph" ? (
                <TextArea
                  label={`Paragraph (block ${i + 1})`}
                  value={b.text}
                  onChange={(e) => put(i, { ...b, text: e.target.value })}
                  rows={4}
                />
              ) : null}
              {b.type === "heading" ? (
                <div className={ui.row}>
                  <TextField
                    label={`Heading (block ${i + 1})`}
                    value={b.text}
                    onChange={(e) => put(i, { ...b, text: e.target.value })}
                    maxLength={200}
                  />
                  <Select
                    label="Level"
                    value={b.level}
                    onChange={(e) =>
                      put(i, { ...b, level: Number(e.target.value) as 2 | 3 })
                    }
                  >
                    <option value={2}>Section</option>
                    <option value={3}>Subsection</option>
                  </Select>
                </div>
              ) : null}
              {b.type === "list" ? (
                <TextArea
                  label={`List, one item per line (block ${i + 1})`}
                  value={b.items.join("\n")}
                  onChange={(e) =>
                    put(i, { ...b, items: e.target.value.split("\n") })
                  }
                  rows={4}
                />
              ) : null}
              {b.type === "link" ? (
                <div className={ui.row}>
                  <TextField
                    label={`Link text (block ${i + 1})`}
                    value={b.text}
                    onChange={(e) => put(i, { ...b, text: e.target.value })}
                  />
                  <TextField
                    label="Address"
                    value={b.href}
                    onChange={(e) => put(i, { ...b, href: e.target.value })}
                    hint="/path, https://, mailto: or tel:"
                  />
                </div>
              ) : null}
              {b.type === "image" ? (
                <div className={ui.row}>
                  <ImagePicker
                    label={`Image (block ${i + 1})`}
                    value={b.mediaAssetId || null}
                    onChange={(id) => put(i, { ...b, mediaAssetId: id ?? "" })}
                  />
                  <TextField
                    label="Alt text"
                    value={b.alt}
                    onChange={(e) => put(i, { ...b, alt: e.target.value })}
                  />
                </div>
              ) : null}
              <Button
                variant="quiet"
                onClick={() => setBlocks(current.filter((_, j) => j !== i))}
              >
                Remove block {i + 1}
              </Button>
            </li>
          ))}
        </ol>
        <div className={ui.row}>
          {(["paragraph", "heading", "list", "link", "image"] as const).map(
            (t) => (
              <Button
                key={t}
                variant="secondary"
                onClick={() =>
                  setBlocks([...current, structuredClone(EMPTY[t])])
                }
              >
                Add {t}
              </Button>
            ),
          )}
        </div>
        <TextField
          label="Search engine title"
          name="seoTitle"
          defaultValue={p.seoTitle ?? ""}
          maxLength={70}
        />
        <TextField
          label="Search engine description"
          name="seoDescription"
          defaultValue={p.seoDescription ?? ""}
          maxLength={160}
        />
        <div>
          <Button type="submit" variant="secondary" busy={save.isPending}>
            Save draft
          </Button>
        </div>
      </form>
      {canPublish ? (
        <div className={ui.stack}>
          {isRehma ? (
            <label
              style={{ display: "flex", gap: 8, alignItems: "flex-start" }}
            >
              <input
                type="checkbox"
                checked={verified}
                onChange={(e) => setVerified(e.target.checked)}
              />
              I have verified every statement on this page, including the
              organisation's name and status, and it makes no unverified claims.
            </label>
          ) : null}
          <div className={ui.row}>
            <Button
              onClick={() => publish.mutate()}
              busy={publish.isPending}
              disabled={isRehma && !verified}
            >
              Publish the saved draft
            </Button>
            {p.status === "PUBLISHED" ? (
              <Button
                variant="danger"
                onClick={() =>
                  window.confirm("Unpublish this page?") && unpublish.mutate()
                }
              >
                Unpublish
              </Button>
            ) : null}
          </div>
        </div>
      ) : (
        <p className={ui.muted}>Only the Owner can publish this page.</p>
      )}
    </section>
  );
}
