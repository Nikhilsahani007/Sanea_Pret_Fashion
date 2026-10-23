// One content block (phase-10-plan.md §3.1, §3.9): edit the draft, then
// publish, unpublish or discard draft changes. The shop shows only what is
// published. Each registry key has its own form; the API validates again.
import { useState, type ReactNode } from "react";
import { Link, useParams } from "react-router";

import { api, toApiError, withMessage, type ApiError } from "../api/client.ts";
import type { BlockView, Target } from "../api/types.ts";
import { useResource } from "../lib/resource.ts";
import { when } from "../lib/format.ts";
import { Button, SelectField, TextArea, TextField } from "../ui/controls.tsx";
import {
  Cluster,
  ErrorState,
  ErrorSummary,
  Loading,
  Notice,
  PageHeader,
  Panel,
  Stack,
  ui,
} from "../ui/feedback.tsx";
import { BLOCK_NAMES, blockState } from "./ContentHome.tsx";
import {
  DateTimeField,
  ImageSelect,
  SourcePicker,
  TargetPicker,
  useRefs,
  type Refs,
  type Source,
} from "./pickers.tsx";
import s from "./content.module.css";

type Draft = Record<string, unknown>;
type Fields = Record<string, string>;
type FormProps = {
  value: Draft;
  set: (v: Draft) => void;
  refs: Refs;
  fields: Fields;
};

/** Removes empty optional values so the API sees them as absent. */
export function prune<T>(value: T): T {
  if (Array.isArray(value)) return value.map(prune) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined || v === "") continue;
      const p = prune(v);
      if (
        p &&
        typeof p === "object" &&
        !Array.isArray(p) &&
        Object.keys(p).length === 0
      )
        continue;
      out[k] = p;
    }
    return out as T;
  }
  return value;
}

const emptySlide = () => ({
  desktopImageId: "",
  mobileImageId: "",
  alt: "",
  ctaLabel: "",
  ctaTarget: undefined as Target | undefined,
});

export const DEFAULTS: Record<string, () => Draft> = {
  "site.announcement": () => ({ text: "" }),
  "home.hero": () => ({ slides: [emptySlide()] }),
  "home.newIns": () => ({
    title: "New Ins",
    source: { kind: "NEWEST" },
    maxItems: 12,
  }),
  "home.row2": () => ({ title: "", source: { kind: "NEWEST" }, maxItems: 8 }),
  "home.tabbedGrid": () => ({
    tabs: [
      { label: "", source: { kind: "NEWEST" } },
      { label: "", source: { kind: "NEWEST" } },
    ],
    maxItems: 8,
  }),
  "home.editorial": () => ({
    images: [{ mediaAssetId: "", alt: "" }],
    heading: "",
  }),
  "site.footer": () => ({ contact: { addressLines: [] }, social: [] }),
};

export function BlockEditor() {
  const { key = "" } = useParams();
  const block = useResource<BlockView>(
    (signal) => api.get(`/admin/content/blocks/${key}`, { signal }),
    [key],
  );
  const refs = useRefs();

  if (block.status === "loading" || refs.status === "loading")
    return <Loading label="Loading section…" />;
  if (block.status === "error")
    return <ErrorState error={block.error} onRetry={block.reload} />;
  if (refs.status === "error")
    return <ErrorState error={refs.error} onRetry={refs.reload} />;
  return (
    <Editor
      key={block.data.key}
      block={block.data}
      refs={refs.data}
      onChanged={block.set}
    />
  );
}

function Editor({
  block,
  refs,
  onChanged,
}: {
  block: BlockView;
  refs: Refs;
  onChanged: (b: BlockView) => void;
}) {
  const [draft, setDraft] = useState<Draft>(
    block.draft ?? DEFAULTS[block.key]!(),
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const dirty =
    JSON.stringify(prune(draft)) !== JSON.stringify(prune(block.draft ?? {}));

  async function act(action: "save" | "publish" | "unpublish" | "discard") {
    if (
      (action === "unpublish" || action === "discard") &&
      !window.confirm(
        action === "unpublish"
          ? "Remove this section from the shop?"
          : "Throw away the draft and go back to the published version?",
      )
    )
      return;
    setBusy(action);
    setError(null);
    setMessage(null);
    try {
      const path = `/admin/content/blocks/${block.key}`;
      const next =
        action === "save"
          ? await api.put<BlockView>(path, prune(draft))
          : await api.post<BlockView>(`${path}/${action}`);
      setMessage(
        {
          save: "Draft saved. It is not on the shop until published.",
          publish: "Published. The shop shows it within a minute.",
          unpublish: "Unpublished. The shop no longer shows it.",
          discard: "Draft changes discarded.",
        }[action],
      );
      // Keep this screen (and its message); take the draft back from the server.
      setDraft(next.draft ?? DEFAULTS[block.key]!());
      onChanged(next);
    } catch (err) {
      const e = toApiError(err);
      setError(
        e.code === "NOTHING_PUBLISHED"
          ? withMessage(e, "There is no published version yet.")
          : e,
      );
    } finally {
      setBusy(null);
    }
  }

  const fields = Object.fromEntries(
    Object.entries(error?.fieldErrors ?? {}).map(([k, v]) => [
      k.replace(/^draft\./, ""),
      v,
    ]),
  );
  const props: FormProps = { value: draft, set: setDraft, refs, fields };
  const forms: Record<string, ReactNode> = {
    "site.announcement": <AnnouncementForm {...props} />,
    "home.hero": <HeroForm {...props} />,
    "home.newIns": <RowForm {...props} fixedNewest />,
    "home.row2": <RowForm {...props} />,
    "home.tabbedGrid": <TabsForm {...props} />,
    "home.editorial": <EditorialForm {...props} />,
    "site.footer": <FooterForm {...props} />,
  };

  return (
    <Stack gap="6">
      <p>
        <Link to="/content">All content</Link>
      </p>
      <PageHeader
        title={BLOCK_NAMES[block.key] ?? block.key}
        description={`${blockState(block)}${block.publishedAt ? `. Last published ${when(block.publishedAt)}` : ""}.`}
      />
      {message ? <Notice tone="success" title={message} /> : null}
      <ErrorSummary error={error} fields={fields} idPrefix="blk-" />
      {block.key === "home.editorial" ? (
        <Notice>
          <p>
            This section can be prepared and published, but the shop shows it
            only after the landing-page decision (OD-23).
          </p>
        </Notice>
      ) : null}
      <Panel title="Draft">{forms[block.key]}</Panel>
      <Cluster>
        <Button
          onClick={() => act("save")}
          busy={busy === "save"}
          busyLabel="Saving…"
          disabled={!dirty}
        >
          Save draft
        </Button>
        <Button
          variant="secondary"
          onClick={() => act("publish")}
          busy={busy === "publish"}
          busyLabel="Publishing…"
          disabled={dirty || !block.draft}
        >
          Publish
        </Button>
        {block.published ? (
          <Button
            variant="danger"
            onClick={() => act("unpublish")}
            busy={busy === "unpublish"}
            busyLabel="Unpublishing…"
          >
            Unpublish
          </Button>
        ) : null}
        {block.published && block.unpublishedChanges ? (
          <Button variant="quiet" onClick={() => act("discard")}>
            Discard draft changes
          </Button>
        ) : null}
      </Cluster>
      {dirty ? (
        <p className={ui.hint} role="status">
          Save the draft before publishing.
        </p>
      ) : null}
    </Stack>
  );
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

function AnnouncementForm({ value, set, refs, fields }: FormProps) {
  return (
    <Stack>
      <TextField
        id="blk-text"
        label="Text"
        hint="At most 90 characters, plain text."
        maxLength={90}
        value={str(value.text)}
        error={fields.text}
        onChange={(e) => set({ ...value, text: e.target.value })}
      />
      <TargetPicker
        idPrefix="blk-link"
        label="Link (optional)"
        optional
        value={value.link as Target | undefined}
        refs={refs}
        error={fields.link ?? fields["link.id"] ?? fields["link.path"]}
        onChange={(t) => set({ ...value, link: t })}
      />
      <div className={s.grid}>
        <DateTimeField
          id="blk-startsAt"
          label="Show from"
          value={value.startsAt as string | undefined}
          onChange={(v) => set({ ...value, startsAt: v })}
        />
        <DateTimeField
          id="blk-endsAt"
          label="Show until"
          value={value.endsAt as string | undefined}
          error={fields.endsAt}
          onChange={(v) => set({ ...value, endsAt: v })}
        />
      </div>
    </Stack>
  );
}

function HeroForm({ value, set, refs, fields }: FormProps) {
  const slides = (value.slides as Draft[]) ?? [];
  const put = (next: Draft[]) => set({ ...value, slides: next });
  const edit = (i: number, patch: Draft) =>
    put(slides.map((sl, j) => (j === i ? { ...sl, ...patch } : sl)));
  const move = (i: number, by: -1 | 1) => {
    const next = [...slides];
    const [x] = next.splice(i, 1);
    next.splice(i + by, 0, x!);
    put(next);
  };
  return (
    <Stack gap="5">
      <p className={ui.hint}>
        1 to 5 slides, shown in this order. Use real campaign photography: about
        2400 × 1350 px for desktop and 1080 × 1350 px for mobile (design-system
        §9).
      </p>
      {fields.slides ? <p className={ui.error}>{fields.slides}</p> : null}
      <ol className={s.list}>
        {slides.map((sl, i) => (
          <li key={i} className={s.item}>
            <fieldset className={ui.fieldset}>
              <legend>Slide {i + 1}</legend>
              <Stack>
                <div className={s.grid}>
                  <ImageSelect
                    id={`blk-slides.${i}.desktopImageId`}
                    label="Desktop image"
                    value={str(sl.desktopImageId)}
                    refs={refs}
                    error={fields[`slides.${i}.desktopImageId`]}
                    onChange={(id) => edit(i, { desktopImageId: id })}
                  />
                  <ImageSelect
                    id={`blk-slides.${i}.mobileImageId`}
                    label="Mobile image"
                    value={str(sl.mobileImageId)}
                    refs={refs}
                    error={fields[`slides.${i}.mobileImageId`]}
                    onChange={(id) => edit(i, { mobileImageId: id })}
                  />
                </div>
                <TextField
                  id={`blk-slides.${i}.alt`}
                  label="Alt text"
                  maxLength={200}
                  value={str(sl.alt)}
                  error={fields[`slides.${i}.alt`]}
                  onChange={(e) => edit(i, { alt: e.target.value })}
                />
                <TextField
                  id={`blk-slides.${i}.campaignLine`}
                  label="Campaign line"
                  optional
                  maxLength={90}
                  value={str(sl.campaignLine)}
                  error={fields[`slides.${i}.campaignLine`]}
                  onChange={(e) => edit(i, { campaignLine: e.target.value })}
                />
                <TextField
                  id={`blk-slides.${i}.ctaLabel`}
                  label="Button label"
                  maxLength={30}
                  value={str(sl.ctaLabel)}
                  error={fields[`slides.${i}.ctaLabel`]}
                  onChange={(e) => edit(i, { ctaLabel: e.target.value })}
                />
                <TargetPicker
                  idPrefix={`blk-slides.${i}.ctaTarget`}
                  label="Button links to"
                  allowPath={false}
                  value={sl.ctaTarget as Target | undefined}
                  refs={refs}
                  error={
                    fields[`slides.${i}.ctaTarget`] ??
                    fields[`slides.${i}.ctaTarget.id`]
                  }
                  onChange={(t) => edit(i, { ctaTarget: t })}
                />
                <div className={s.grid}>
                  <DateTimeField
                    id={`blk-slides.${i}.startsAt`}
                    label="Show from"
                    value={sl.startsAt as string | undefined}
                    onChange={(v) => edit(i, { startsAt: v })}
                  />
                  <DateTimeField
                    id={`blk-slides.${i}.endsAt`}
                    label="Show until"
                    value={sl.endsAt as string | undefined}
                    error={fields[`slides.${i}.endsAt`]}
                    onChange={(v) => edit(i, { endsAt: v })}
                  />
                </div>
                <Cluster gap="2">
                  <Button
                    variant="secondary"
                    size="small"
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                    aria-label={`Move slide ${i + 1} up`}
                  >
                    Move up
                  </Button>
                  <Button
                    variant="secondary"
                    size="small"
                    disabled={i === slides.length - 1}
                    onClick={() => move(i, 1)}
                    aria-label={`Move slide ${i + 1} down`}
                  >
                    Move down
                  </Button>
                  <Button
                    variant="danger"
                    size="small"
                    disabled={slides.length === 1}
                    onClick={() => put(slides.filter((_, j) => j !== i))}
                    aria-label={`Remove slide ${i + 1}`}
                  >
                    Remove
                  </Button>
                </Cluster>
              </Stack>
            </fieldset>
          </li>
        ))}
      </ol>
      <div>
        <Button
          variant="secondary"
          size="small"
          disabled={slides.length >= 5}
          onClick={() => put([...slides, emptySlide()])}
        >
          Add slide
        </Button>
      </div>
    </Stack>
  );
}

function RowForm({
  value,
  set,
  refs,
  fields,
  fixedNewest = false,
}: FormProps & { fixedNewest?: boolean }) {
  return (
    <Stack>
      <TextField
        id="blk-title"
        label="Row title"
        maxLength={60}
        value={str(value.title)}
        error={fields.title}
        onChange={(e) => set({ ...value, title: e.target.value })}
      />
      {fixedNewest ? (
        <p className={ui.hint}>
          New Ins always shows the newest published products.
        </p>
      ) : (
        <SourcePicker
          idPrefix="blk-source"
          value={value.source as Source}
          refs={refs}
          error={
            fields["source.id"] ?? fields["source.productIds"] ?? fields.source
          }
          onChange={(src) => set({ ...value, source: src })}
        />
      )}
      <MaxItems value={value} set={set} fields={fields} />
    </Stack>
  );
}

function MaxItems({
  value,
  set,
  fields,
}: {
  value: Draft;
  set: (v: Draft) => void;
  fields: Fields;
}) {
  return (
    <SelectField
      id="blk-maxItems"
      label="Products shown"
      value={String(value.maxItems ?? 8)}
      error={fields.maxItems}
      onChange={(e) => set({ ...value, maxItems: Number(e.target.value) })}
    >
      {[4, 6, 8, 10, 12, 16, 20, 24].map((n) => (
        <option key={n} value={n}>
          {n}
        </option>
      ))}
    </SelectField>
  );
}

function TabsForm({ value, set, refs, fields }: FormProps) {
  const tabs = (value.tabs as { label: string; source: Source }[]) ?? [];
  const edit = (i: number, patch: Partial<{ label: string; source: Source }>) =>
    set({
      ...value,
      tabs: tabs.map((t, j) => (j === i ? { ...t, ...patch } : t)),
    });
  return (
    <Stack gap="5">
      {fields.tabs ? <p className={ui.error}>{fields.tabs}</p> : null}
      <ol className={s.list}>
        {tabs.map((t, i) => (
          <li key={i} className={s.item}>
            <fieldset className={ui.fieldset}>
              <legend>Tab {i + 1}</legend>
              <Stack>
                <TextField
                  id={`blk-tabs.${i}.label`}
                  label="Tab label"
                  maxLength={30}
                  value={t.label}
                  error={fields[`tabs.${i}.label`]}
                  onChange={(e) => edit(i, { label: e.target.value })}
                />
                <SourcePicker
                  idPrefix={`blk-tabs.${i}.source`}
                  value={t.source}
                  refs={refs}
                  error={
                    fields[`tabs.${i}.source.id`] ??
                    fields[`tabs.${i}.source.productIds`]
                  }
                  onChange={(src) => edit(i, { source: src })}
                />
                <div>
                  <Button
                    variant="danger"
                    size="small"
                    disabled={tabs.length <= 2}
                    onClick={() =>
                      set({ ...value, tabs: tabs.filter((_, j) => j !== i) })
                    }
                    aria-label={`Remove tab ${i + 1}`}
                  >
                    Remove tab
                  </Button>
                </div>
              </Stack>
            </fieldset>
          </li>
        ))}
      </ol>
      <div>
        <Button
          variant="secondary"
          size="small"
          disabled={tabs.length >= 5}
          onClick={() =>
            set({
              ...value,
              tabs: [...tabs, { label: "", source: { kind: "NEWEST" } }],
            })
          }
        >
          Add tab
        </Button>
      </div>
      <MaxItems value={value} set={set} fields={fields} />
    </Stack>
  );
}

function EditorialForm({ value, set, refs, fields }: FormProps) {
  const images =
    (value.images as { mediaAssetId: string; alt: string }[]) ?? [];
  const edit = (
    i: number,
    patch: Partial<{ mediaAssetId: string; alt: string }>,
  ) =>
    set({
      ...value,
      images: images.map((im, j) => (j === i ? { ...im, ...patch } : im)),
    });
  return (
    <Stack>
      <TextField
        id="blk-heading"
        label="Heading"
        maxLength={60}
        value={str(value.heading)}
        error={fields.heading}
        onChange={(e) => set({ ...value, heading: e.target.value })}
      />
      <TextArea
        id="blk-text"
        label="Short text"
        optional
        maxLength={280}
        rows={3}
        value={str(value.text)}
        error={fields.text}
        onChange={(e) => set({ ...value, text: e.target.value })}
      />
      {images.map((im, i) => (
        <div key={i} className={s.grid}>
          <ImageSelect
            id={`blk-images.${i}.mediaAssetId`}
            label={`Image ${i + 1}`}
            value={im.mediaAssetId}
            refs={refs}
            error={fields[`images.${i}.mediaAssetId`]}
            onChange={(id) => edit(i, { mediaAssetId: id })}
          />
          <TextField
            id={`blk-images.${i}.alt`}
            label={`Image ${i + 1} alt text`}
            maxLength={200}
            value={im.alt}
            error={fields[`images.${i}.alt`]}
            onChange={(e) => edit(i, { alt: e.target.value })}
          />
        </div>
      ))}
      <Cluster gap="2">
        <Button
          variant="secondary"
          size="small"
          disabled={images.length >= 4}
          onClick={() =>
            set({
              ...value,
              images: [...images, { mediaAssetId: "", alt: "" }],
            })
          }
        >
          Add image
        </Button>
        <Button
          variant="danger"
          size="small"
          disabled={images.length <= 1}
          onClick={() => set({ ...value, images: images.slice(0, -1) })}
        >
          Remove last image
        </Button>
      </Cluster>
      <TargetPicker
        idPrefix="blk-link"
        label="Link (optional)"
        optional
        value={value.link as Target | undefined}
        refs={refs}
        error={fields.link}
        onChange={(t) => set({ ...value, link: t })}
      />
    </Stack>
  );
}

const NETWORKS = [
  "INSTAGRAM",
  "FACEBOOK",
  "YOUTUBE",
  "PINTEREST",
  "WHATSAPP",
  "X",
] as const;

function FooterForm({ value, set, fields }: FormProps) {
  const contact = (value.contact as Draft) ?? {};
  const lines = (contact.addressLines as string[]) ?? [];
  const social = (value.social as { network: string; url: string }[]) ?? [];
  const setContact = (patch: Draft) =>
    set({ ...value, contact: { ...contact, ...patch } });
  return (
    <Stack gap="5">
      <p className={ui.hint}>
        Footer link groups are edited as menus (Footer: Shop, Help and About).
        Enter only real, current details.
      </p>
      <TextArea
        id="blk-contact.addressLines"
        label="Address"
        optional
        hint="One line per row, at most 4 lines."
        rows={4}
        value={lines.join("\n")}
        error={
          fields["contact.addressLines"] ?? fields["contact.addressLines.0"]
        }
        onChange={(e) =>
          setContact({ addressLines: e.target.value.split("\n").slice(0, 4) })
        }
      />
      <div className={s.grid}>
        <TextField
          id="blk-contact.hours"
          label="Hours"
          optional
          maxLength={100}
          value={str(contact.hours)}
          error={fields["contact.hours"]}
          onChange={(e) => setContact({ hours: e.target.value })}
        />
        <TextField
          id="blk-contact.phone"
          label="Phone"
          optional
          maxLength={30}
          inputMode="tel"
          value={str(contact.phone)}
          error={fields["contact.phone"]}
          onChange={(e) => setContact({ phone: e.target.value })}
        />
        <TextField
          id="blk-contact.email"
          label="Email"
          optional
          type="email"
          maxLength={254}
          value={str(contact.email)}
          error={fields["contact.email"]}
          onChange={(e) => setContact({ email: e.target.value })}
        />
      </div>
      <fieldset className={ui.fieldset}>
        <legend>Social links</legend>
        <Stack>
          <p className={ui.hint}>https links on the listed networks only.</p>
          {social.map((l, i) => (
            <div key={i} className={s.grid}>
              <SelectField
                id={`blk-social.${i}.network`}
                label={`Link ${i + 1} network`}
                value={l.network}
                onChange={(e) =>
                  set({
                    ...value,
                    social: social.map((x, j) =>
                      j === i ? { ...x, network: e.target.value } : x,
                    ),
                  })
                }
              >
                {NETWORKS.map((n) => (
                  <option key={n} value={n}>
                    {n.charAt(0) + n.slice(1).toLowerCase()}
                  </option>
                ))}
              </SelectField>
              <TextField
                id={`blk-social.${i}.url`}
                label={`Link ${i + 1} address`}
                value={l.url}
                spellCheck={false}
                error={fields[`social.${i}.url`]}
                onChange={(e) =>
                  set({
                    ...value,
                    social: social.map((x, j) =>
                      j === i ? { ...x, url: e.target.value } : x,
                    ),
                  })
                }
              />
            </div>
          ))}
          <Cluster gap="2">
            <Button
              variant="secondary"
              size="small"
              disabled={social.length >= 6}
              onClick={() =>
                set({
                  ...value,
                  social: [
                    ...social,
                    { network: "INSTAGRAM", url: "https://" },
                  ],
                })
              }
            >
              Add social link
            </Button>
            <Button
              variant="danger"
              size="small"
              disabled={social.length === 0}
              onClick={() => set({ ...value, social: social.slice(0, -1) })}
            >
              Remove last link
            </Button>
          </Cluster>
        </Stack>
      </fieldset>
    </Stack>
  );
}
