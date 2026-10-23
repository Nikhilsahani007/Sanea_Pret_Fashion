// One page (phase-10-plan.md §3.4, §3.5, §3.9): edit the draft, then publish.
// Pages that need verification (the Rehma Foundation page) are edited by the
// Owner or a Manager, and only the Owner can verify and publish them: the
// Owner sees exactly the saved draft that will be published, ticks the
// confirmation, and the API checks it is still that draft (Q10-8).
import { AdminRole, pageRichTextSchema } from "@sanea/shared";
import { useState } from "react";
import { Link, useParams } from "react-router";

import { api, query, toApiError, type ApiError } from "../api/client.ts";
import type { MediaAsset, Page, PageView } from "../api/types.ts";
import { useAdmin } from "../auth/session.tsx";
import {
  RichTextEditor,
  RichTextPreview,
} from "../catalogue/RichTextEditor.tsx";
import {
  blocksToDoc,
  readStored,
  type Block,
} from "../catalogue/rich-text-blocks.ts";
import { when } from "../lib/format.ts";
import { useResource } from "../lib/resource.ts";
import { Button, Checkbox, TextArea, TextField } from "../ui/controls.tsx";
import {
  Cluster,
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
import s from "./content.module.css";

export const VERIFY_STATEMENT =
  "I have verified that every statement on this page is accurate and approved for publication.";

export function PageEditor() {
  const { slug = "" } = useParams();
  const page = useResource<PageView>(
    (signal) => api.get(`/admin/content/pages/${slug}`, { signal }),
    [slug],
  );
  const media = useResource<MediaAsset[]>(
    async (signal) =>
      (
        await api.get<Page<MediaAsset>>(
          `/admin/media${query({ limit: 100 })}`,
          { signal },
        )
      ).items,
    [],
  );
  if (page.status === "loading" || media.status === "loading")
    return <Loading label="Loading page…" />;
  if (page.status === "error")
    return <ErrorState error={page.error} onRetry={page.reload} />;
  if (media.status === "error")
    return <ErrorState error={media.error} onRetry={media.reload} />;
  return (
    <Editor
      key={page.data.slug}
      page={page.data}
      media={media.data}
      onChanged={page.set}
      onReload={page.reload}
    />
  );
}

function Editor({
  page,
  media,
  onChanged,
  onReload,
}: {
  page: PageView;
  media: MediaAsset[];
  onChanged: (p: PageView) => void;
  onReload: () => void;
}) {
  const admin = useAdmin();
  const isOwner = admin.role === AdminRole.OWNER;
  const canEdit =
    !page.requiresVerification || isOwner || admin.role === AdminRole.MANAGER;
  const stored = readStored(page.draftBody, pageRichTextSchema);
  const [title, setTitle] = useState(page.title);
  const [seoTitle, setSeoTitle] = useState(page.seoTitle ?? "");
  const [seoDescription, setSeoDescription] = useState(
    page.seoDescription ?? "",
  );
  const [blocks, setBlocks] = useState<Block[]>(stored.ok ? stored.blocks : []);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const dirty =
    touched ||
    title !== page.title ||
    seoTitle !== (page.seoTitle ?? "") ||
    seoDescription !== (page.seoDescription ?? "");

  async function run(
    action: string,
    fn: () => Promise<PageView>,
    done: string,
  ) {
    setBusy(action);
    setError(null);
    setMessage(null);
    try {
      const next = await fn();
      onChanged(next);
      setTouched(false);
      setVerified(false);
      setMessage(done);
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(null);
    }
  }

  const path = `/admin/content/pages/${page.slug}`;
  const save = () =>
    run(
      "save",
      () =>
        api.patch<PageView>(path, {
          title,
          seoTitle: seoTitle.trim() || null,
          seoDescription: seoDescription.trim() || null,
          ...(touched ? { draftBody: blocksToDoc(blocks) } : {}),
        }),
      "Draft saved. It is not on the shop until published.",
    );

  const fields = error?.fieldErrors ?? {};
  const drafted = readStored(page.draftBody, pageRichTextSchema);
  return (
    <Stack gap="6">
      <p>
        <Link to="/content">All content</Link>
      </p>
      <PageHeader title={page.title} description={`/pages/${page.slug}`}>
        <StatusChip status={page.status} />
      </PageHeader>
      {message ? <Notice tone="success" title={message} /> : null}
      <ErrorSummary
        error={error}
        fields={fields}
        idPrefix="pg-"
        labels={{ title: "Title", draftBody: "Content" }}
      />
      {page.requiresVerification ? (
        <Notice title="This page needs the Owner's verification">
          <p>
            The Owner or a Manager can edit the draft. Only the Owner can
            publish it, after verifying every statement. Do not add figures,
            registration numbers, donation or tax claims, or partner names that
            have not been verified.
            {page.verifiedAt
              ? ` Last verified ${when(page.verifiedAt)}.`
              : " Never verified."}
          </p>
        </Notice>
      ) : null}
      {!canEdit ? (
        <Notice>
          <p>Only the Owner or a Manager can edit this page.</p>
        </Notice>
      ) : null}

      <Panel title="Draft">
        <fieldset disabled={!canEdit} className={s.plain}>
          <Stack>
            <TextField
              id="pg-title"
              label="Title"
              maxLength={120}
              value={title}
              error={fields.title}
              onChange={(e) => setTitle(e.target.value)}
            />
            {stored.ok ? (
              <RichTextEditor
                blocks={blocks}
                media={media}
                schema={pageRichTextSchema}
                disabled={!canEdit}
                serverError={
                  Object.entries(fields).find(([k]) =>
                    k.startsWith("draftBody"),
                  )?.[1]
                }
                onChange={(next) => {
                  setBlocks(next);
                  setTouched(true);
                }}
              />
            ) : (
              <Notice tone="error" title="The stored draft cannot be read">
                <p>It is left unchanged.</p>
              </Notice>
            )}
            <div className={s.grid}>
              <TextField
                id="pg-seoTitle"
                label="Search title"
                optional
                maxLength={70}
                value={seoTitle}
                onChange={(e) => setSeoTitle(e.target.value)}
              />
              <TextArea
                id="pg-seoDescription"
                label="Search description"
                optional
                maxLength={160}
                rows={2}
                value={seoDescription}
                onChange={(e) => setSeoDescription(e.target.value)}
              />
            </div>
          </Stack>
        </fieldset>
      </Panel>

      {canEdit ? (
        <Cluster>
          <Button
            onClick={save}
            busy={busy === "save"}
            busyLabel="Saving…"
            disabled={!dirty}
          >
            Save draft
          </Button>
          {!page.requiresVerification ? (
            <Button
              variant="secondary"
              disabled={dirty}
              busy={busy === "publish"}
              busyLabel="Publishing…"
              onClick={() =>
                run(
                  "publish",
                  () => api.post<PageView>(`${path}/publish`, {}),
                  "Published. The shop shows it within a minute.",
                )
              }
            >
              Publish
            </Button>
          ) : null}
          {page.status === "PUBLISHED" &&
          (!page.requiresVerification || isOwner) ? (
            <Button
              variant="danger"
              busy={busy === "unpublish"}
              busyLabel="Unpublishing…"
              onClick={() =>
                window.confirm("Remove this page from the shop?") &&
                run(
                  "unpublish",
                  () => api.post<PageView>(`${path}/unpublish`),
                  "Unpublished. The page is no longer on the shop.",
                )
              }
            >
              Unpublish
            </Button>
          ) : null}
          {page.publishedBody && page.unpublishedChanges ? (
            <Button
              variant="quiet"
              onClick={() =>
                window.confirm(
                  "Throw away the draft and go back to the published version?",
                ) &&
                run(
                  "discard",
                  () => api.post<PageView>(`${path}/discard`),
                  "Draft changes discarded.",
                )
              }
            >
              Discard draft changes
            </Button>
          ) : null}
        </Cluster>
      ) : null}
      {dirty ? (
        <p className={ui.hint} role="status">
          Save the draft before publishing.
        </p>
      ) : null}

      {page.requiresVerification && isOwner ? (
        <section className={s.verify} aria-labelledby="verify-title">
          <Stack>
            <h2 id="verify-title">Verify and publish</h2>
            <p>
              This is exactly what will be published (the saved draft, version{" "}
              {when(page.draftVersion)}):
            </p>
            <div className={s.published}>
              <h3>{page.title}</h3>
              {drafted.ok ? (
                <RichTextPreview blocks={drafted.blocks} media={media} />
              ) : (
                <p>The draft cannot be read.</p>
              )}
            </div>
            {error?.code === "CONFLICT" &&
            (error.details as { code?: string }[] | undefined)?.[0]?.code ===
              "DRAFT_CHANGED" ? (
              <Notice
                tone="error"
                title="The draft changed after you opened it"
              >
                <Stack gap="2">
                  <p>Reload to review the latest draft before verifying.</p>
                  <div>
                    <Button variant="secondary" size="small" onClick={onReload}>
                      Reload the draft
                    </Button>
                  </div>
                </Stack>
              </Notice>
            ) : null}
            <Checkbox
              label={VERIFY_STATEMENT}
              checked={verified}
              disabled={dirty}
              onChange={(e) => setVerified(e.target.checked)}
            />
            <div>
              <Button
                disabled={!verified || dirty}
                busy={busy === "verify"}
                busyLabel="Publishing…"
                onClick={() =>
                  run(
                    "verify",
                    () =>
                      api.post<PageView>(`${path}/publish`, {
                        verified: true,
                        draftVersion: page.draftVersion,
                      }),
                    "Verified and published. Your verification is recorded in the audit log.",
                  )
                }
              >
                Verify and publish
              </Button>
            </div>
          </Stack>
        </section>
      ) : null}
    </Stack>
  );
}
