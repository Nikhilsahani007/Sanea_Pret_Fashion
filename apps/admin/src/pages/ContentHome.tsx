import type { LinkTarget, ProductSource } from "@sanea/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import { get, send } from "../api.ts";
import { ImagePicker, SourcePicker, TargetPicker } from "../ui/pickers.tsx";
import { Button, ErrorSummary, Notice, TextField, ui } from "../ui/ui.tsx";

type BlockRow = {
  key: string;
  type: string;
  draft: unknown;
  published: unknown;
  publishedAt: string | null;
  hasUnpublishedChanges: boolean;
};

const toLocal = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
};
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : null);

/** Loads one block's draft into local state and offers save, publish, unpublish. */
function BlockEditor<T>({
  blockKey,
  title,
  help,
  empty,
  children,
}: {
  blockKey: string;
  title: string;
  help: string;
  empty: T;
  children: (value: T, set: (v: T) => void) => ReactNode;
}) {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ["blocks"],
    queryFn: () => get<{ blocks: BlockRow[] }>("/admin/content/blocks"),
  });
  const row = list.data?.blocks.find((b) => b.key === blockKey);
  const [value, setValue] = useState<T | null>(null);
  const current = value ?? (row?.draft as T | null) ?? empty;
  const [message, setMessage] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["blocks"] });
  const save = useMutation({
    mutationFn: () =>
      send("PUT", `/admin/content/blocks/${blockKey}`, { draft: current }),
    onSuccess: () => {
      setMessage("Draft saved. Shoppers still see the published version.");
      void refresh();
    },
  });
  const publish = useMutation({
    mutationFn: async () => {
      await send("PUT", `/admin/content/blocks/${blockKey}`, {
        draft: current,
      });
      await send("POST", `/admin/content/blocks/${blockKey}/publish`);
    },
    onSuccess: () => {
      setMessage("Published. The storefront shows it within a minute.");
      void refresh();
    },
  });
  const unpublish = useMutation({
    mutationFn: () =>
      send("POST", `/admin/content/blocks/${blockKey}/unpublish`),
    onSuccess: () => {
      setMessage("Taken off the storefront.");
      void refresh();
    },
  });
  if (!list.data) return null;
  return (
    <section
      className={`${ui.panel} ${ui.stack}`}
      aria-labelledby={`${blockKey}-h`}
    >
      <div className={ui.pageHead}>
        <h2 id={`${blockKey}-h`}>{title}</h2>
        <span
          className={ui.status}
          data-status={row?.publishedAt ? "PUBLISHED" : "DRAFT"}
        >
          {row?.publishedAt
            ? row.hasUnpublishedChanges
              ? "Published, with unpublished changes"
              : "Published"
            : "Not published"}
        </span>
      </div>
      <p className={ui.muted}>{help}</p>
      <ErrorSummary
        error={save.error ?? publish.error ?? unpublish.error}
        title="The block was not saved"
      />
      {message ? <Notice>{message}</Notice> : null}
      {children(current, (v) => {
        setMessage(null);
        setValue(v);
      })}
      <div className={ui.row}>
        <Button
          variant="secondary"
          onClick={() => save.mutate()}
          busy={save.isPending}
        >
          Save draft
        </Button>
        <Button onClick={() => publish.mutate()} busy={publish.isPending}>
          Publish
        </Button>
        {row?.publishedAt ? (
          <Button
            variant="quiet"
            onClick={() =>
              window.confirm(`Remove “${title}” from the storefront?`) &&
              unpublish.mutate()
            }
          >
            Unpublish
          </Button>
        ) : null}
      </div>
    </section>
  );
}

function ListControls({
  index,
  length,
  onMove,
  onRemove,
  name,
}: {
  index: number;
  length: number;
  onMove: (by: number) => void;
  onRemove: () => void;
  name: string;
}) {
  return (
    <div className={ui.row}>
      <Button
        variant="secondary"
        disabled={index === 0}
        onClick={() => onMove(-1)}
        aria-label={`Move ${name} up`}
      >
        ↑
      </Button>
      <Button
        variant="secondary"
        disabled={index === length - 1}
        onClick={() => onMove(1)}
        aria-label={`Move ${name} down`}
      >
        ↓
      </Button>
      <Button variant="quiet" onClick={onRemove}>
        Remove {name}
      </Button>
    </div>
  );
}
function moved<T>(list: T[], i: number, by: number): T[] {
  const next = [...list];
  const [item] = next.splice(i, 1);
  next.splice(i + by, 0, item!);
  return next;
}

type Announcement = {
  text: string;
  link?: LinkTarget | null;
  startsAt?: string | null;
  endsAt?: string | null;
};
type Slide = {
  desktopImageId: string;
  mobileImageId?: string | null;
  alt: string;
  campaignLine: string;
  ctaLabel: string;
  ctaTarget: LinkTarget;
  focalX: number;
  focalY: number;
  startsAt?: string | null;
  endsAt?: string | null;
};
type Pill = { label: string; target: LinkTarget };
type Row = {
  title: string;
  source: ProductSource;
  maxItems: number;
  viewAll?: LinkTarget | null;
};
type Tabbed = {
  title?: string | null;
  tabs: { label: string; source: ProductSource }[];
  maxItems: number;
};
type Footer = {
  groups: { title: string; links: { label: string; target: LinkTarget }[] }[];
  social: { label: string; href: string }[];
};

const NEW_SLIDE: Slide = {
  desktopImageId: "",
  mobileImageId: null,
  alt: "",
  campaignLine: "",
  ctaLabel: "",
  ctaTarget: { type: "URL", href: "/" },
  focalX: 50,
  focalY: 50,
};

function RowEditor({ value, set }: { value: Row; set: (v: Row) => void }) {
  return (
    <>
      <TextField
        label="Title"
        value={value.title}
        onChange={(e) => set({ ...value, title: e.target.value })}
        maxLength={60}
        required
      />
      <SourcePicker
        value={value.source}
        onChange={(source) => set({ ...value, source })}
      />
      <TextField
        label="Most products shown"
        type="number"
        min={2}
        max={24}
        value={value.maxItems}
        onChange={(e) => set({ ...value, maxItems: Number(e.target.value) })}
      />
      <TargetPicker
        label="“View all” link"
        value={value.viewAll ?? null}
        onChange={(viewAll) => set({ ...value, viewAll })}
        optional
      />
    </>
  );
}

export function ContentHome() {
  return (
    <div className={ui.stack}>
      <h1>Homepage</h1>
      <p className={ui.muted}>
        Sections appear in this order: announcement bar, header, category pills,
        hero, New Ins, second row, tabbed products, footer. Save a draft to keep
        working; Publish puts it live.
      </p>

      <BlockEditor<Announcement>
        blockKey="home.announcement"
        title="Announcement bar"
        help="One short line above the header, up to 90 characters. Hidden when unpublished or outside its dates."
        empty={{ text: "" }}
      >
        {(v, set) => (
          <>
            <TextField
              label="Text"
              value={v.text}
              onChange={(e) => set({ ...v, text: e.target.value })}
              maxLength={90}
              required
            />
            <TargetPicker
              label="Link"
              value={v.link ?? null}
              onChange={(link) => set({ ...v, link })}
              optional
            />
            <div className={ui.row}>
              <TextField
                label="Show from (India time)"
                type="datetime-local"
                value={toLocal(v.startsAt)}
                onChange={(e) =>
                  set({ ...v, startsAt: fromLocal(e.target.value) })
                }
              />
              <TextField
                label="Show until (India time)"
                type="datetime-local"
                value={toLocal(v.endsAt)}
                onChange={(e) =>
                  set({ ...v, endsAt: fromLocal(e.target.value) })
                }
              />
            </div>
          </>
        )}
      </BlockEditor>

      <BlockEditor<{ slides: Slide[] }>
        blockKey="home.hero"
        title="Hero slides"
        help="Full-width campaign photographs under the SANÉA PRET wordmark. Desktop at least 2400 × 1350 with a calm lower third; a separate portrait crop for mobile. Use Sanéa Pret's own campaign photography only."
        empty={{ slides: [NEW_SLIDE] }}
      >
        {(v, set) => (
          <>
            {v.slides.map((s, i) => {
              const put = (patch: Partial<Slide>) =>
                set({
                  slides: v.slides.map((x, j) =>
                    j === i ? { ...x, ...patch } : x,
                  ),
                });
              return (
                <fieldset
                  key={i}
                  className={ui.stack}
                  style={{
                    border: "1px solid var(--sp-divider)",
                    padding: "var(--sp-space-4)",
                  }}
                >
                  <legend>Slide {i + 1}</legend>
                  <ImagePicker
                    label="Desktop image"
                    value={s.desktopImageId || null}
                    onChange={(id) => put({ desktopImageId: id ?? "" })}
                  />
                  <ImagePicker
                    label="Mobile image (portrait)"
                    value={s.mobileImageId ?? null}
                    onChange={(id) => put({ mobileImageId: id })}
                    optional
                  />
                  <TextField
                    label="Alt text"
                    value={s.alt}
                    onChange={(e) => put({ alt: e.target.value })}
                    required
                    hint="Describe the photograph for people who cannot see it."
                  />
                  <TextField
                    label="Campaign line"
                    value={s.campaignLine}
                    onChange={(e) => put({ campaignLine: e.target.value })}
                    maxLength={120}
                    required
                  />
                  <TextField
                    label="Button text"
                    value={s.ctaLabel}
                    onChange={(e) => put({ ctaLabel: e.target.value })}
                    maxLength={30}
                    required
                  />
                  <TargetPicker
                    label="Button link"
                    value={s.ctaTarget}
                    onChange={(t) => t && put({ ctaTarget: t })}
                  />
                  <div className={ui.row}>
                    <TextField
                      label="Focus across (%)"
                      type="number"
                      min={0}
                      max={100}
                      value={s.focalX}
                      onChange={(e) => put({ focalX: Number(e.target.value) })}
                      hint="Keeps the subject in view when cropped."
                    />
                    <TextField
                      label="Focus down (%)"
                      type="number"
                      min={0}
                      max={100}
                      value={s.focalY}
                      onChange={(e) => put({ focalY: Number(e.target.value) })}
                    />
                  </div>
                  <ListControls
                    name={`slide ${i + 1}`}
                    index={i}
                    length={v.slides.length}
                    onMove={(by) => set({ slides: moved(v.slides, i, by) })}
                    onRemove={() =>
                      set({ slides: v.slides.filter((_, j) => j !== i) })
                    }
                  />
                </fieldset>
              );
            })}
            {v.slides.length < 6 ? (
              <Button
                variant="secondary"
                onClick={() => set({ slides: [...v.slides, NEW_SLIDE] })}
              >
                Add slide
              </Button>
            ) : null}
          </>
        )}
      </BlockEditor>

      <BlockEditor<{ pills: Pill[] }>
        blockKey="home.pills"
        title="Category pills"
        help="The short links under the header, in order."
        empty={{ pills: [] }}
      >
        {(v, set) => (
          <>
            {v.pills.map((p, i) => (
              <div key={i} className={ui.row}>
                <TextField
                  label={`Pill ${i + 1} label`}
                  value={p.label}
                  onChange={(e) =>
                    set({
                      pills: v.pills.map((x, j) =>
                        j === i ? { ...x, label: e.target.value } : x,
                      ),
                    })
                  }
                  maxLength={30}
                />
                <TargetPicker
                  label={`Pill ${i + 1} link`}
                  value={p.target}
                  onChange={(t) =>
                    t &&
                    set({
                      pills: v.pills.map((x, j) =>
                        j === i ? { ...x, target: t } : x,
                      ),
                    })
                  }
                />
                <ListControls
                  name={`pill ${i + 1}`}
                  index={i}
                  length={v.pills.length}
                  onMove={(by) => set({ pills: moved(v.pills, i, by) })}
                  onRemove={() =>
                    set({ pills: v.pills.filter((_, j) => j !== i) })
                  }
                />
              </div>
            ))}
            <Button
              variant="secondary"
              onClick={() =>
                set({
                  pills: [
                    ...v.pills,
                    { label: "", target: { type: "URL", href: "/" } },
                  ],
                })
              }
            >
              Add pill
            </Button>
          </>
        )}
      </BlockEditor>

      <BlockEditor<Row>
        blockKey="home.new-ins"
        title="New Ins (directly below the hero)"
        help="A row of product cards."
        empty={{ title: "New Ins", source: { type: "NEWEST" }, maxItems: 12 }}
      >
        {(v, set) => <RowEditor value={v} set={set} />}
      </BlockEditor>

      <BlockEditor<Row>
        blockKey="home.row-2"
        title="Second product row"
        help="Another row, for example a named collection."
        empty={{ title: "", source: { type: "NEWEST" }, maxItems: 12 }}
      >
        {(v, set) => <RowEditor value={v} set={set} />}
      </BlockEditor>

      <BlockEditor<Tabbed>
        blockKey="home.tabbed"
        title="Tabbed products"
        help="Two to five tabs, each showing a grid of products."
        empty={{
          title: null,
          tabs: [
            { label: "", source: { type: "NEWEST" } },
            { label: "", source: { type: "NEWEST" } },
          ],
          maxItems: 8,
        }}
      >
        {(v, set) => (
          <>
            <TextField
              label="Heading (optional)"
              value={v.title ?? ""}
              onChange={(e) => set({ ...v, title: e.target.value || null })}
              maxLength={60}
            />
            {v.tabs.map((t, i) => (
              <fieldset
                key={i}
                className={ui.stack}
                style={{
                  border: "1px solid var(--sp-divider)",
                  padding: "var(--sp-space-4)",
                }}
              >
                <legend>Tab {i + 1}</legend>
                <TextField
                  label="Tab label"
                  value={t.label}
                  onChange={(e) =>
                    set({
                      ...v,
                      tabs: v.tabs.map((x, j) =>
                        j === i ? { ...x, label: e.target.value } : x,
                      ),
                    })
                  }
                  maxLength={30}
                />
                <SourcePicker
                  value={t.source}
                  onChange={(source) =>
                    set({
                      ...v,
                      tabs: v.tabs.map((x, j) =>
                        j === i ? { ...x, source } : x,
                      ),
                    })
                  }
                />
                <ListControls
                  name={`tab ${i + 1}`}
                  index={i}
                  length={v.tabs.length}
                  onMove={(by) => set({ ...v, tabs: moved(v.tabs, i, by) })}
                  onRemove={() =>
                    set({ ...v, tabs: v.tabs.filter((_, j) => j !== i) })
                  }
                />
              </fieldset>
            ))}
            {v.tabs.length < 5 ? (
              <Button
                variant="secondary"
                onClick={() =>
                  set({
                    ...v,
                    tabs: [
                      ...v.tabs,
                      { label: "", source: { type: "NEWEST" } },
                    ],
                  })
                }
              >
                Add tab
              </Button>
            ) : null}
            <TextField
              label="Products per tab"
              type="number"
              min={4}
              max={24}
              value={v.maxItems}
              onChange={(e) => set({ ...v, maxItems: Number(e.target.value) })}
            />
          </>
        )}
      </BlockEditor>

      <BlockEditor<Footer>
        blockKey="site.footer"
        title="Footer"
        help="Link groups and social links. Contact details come from Settings. Payment methods appear once a payment method is live."
        empty={{ groups: [], social: [] }}
      >
        {(v, set) => (
          <>
            {v.groups.map((g, i) => (
              <fieldset
                key={i}
                className={ui.stack}
                style={{
                  border: "1px solid var(--sp-divider)",
                  padding: "var(--sp-space-4)",
                }}
              >
                <legend>Group {i + 1}</legend>
                <TextField
                  label="Group title"
                  value={g.title}
                  onChange={(e) =>
                    set({
                      ...v,
                      groups: v.groups.map((x, j) =>
                        j === i ? { ...x, title: e.target.value } : x,
                      ),
                    })
                  }
                  maxLength={40}
                />
                {g.links.map((l, k) => {
                  const putLink = (
                    patch: Partial<{ label: string; target: LinkTarget }>,
                  ) =>
                    set({
                      ...v,
                      groups: v.groups.map((x, j) =>
                        j === i
                          ? {
                              ...x,
                              links: x.links.map((y, m) =>
                                m === k ? { ...y, ...patch } : y,
                              ),
                            }
                          : x,
                      ),
                    });
                  return (
                    <div key={k} className={ui.row}>
                      <TextField
                        label={`Link ${k + 1} text`}
                        value={l.label}
                        onChange={(e) => putLink({ label: e.target.value })}
                        maxLength={40}
                      />
                      <TargetPicker
                        label={`Link ${k + 1} goes to`}
                        value={l.target}
                        onChange={(t) => t && putLink({ target: t })}
                      />
                      <Button
                        variant="quiet"
                        onClick={() =>
                          set({
                            ...v,
                            groups: v.groups.map((x, j) =>
                              j === i
                                ? {
                                    ...x,
                                    links: x.links.filter((_, m) => m !== k),
                                  }
                                : x,
                            ),
                          })
                        }
                      >
                        Remove link {k + 1}
                      </Button>
                    </div>
                  );
                })}
                <div className={ui.row}>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      set({
                        ...v,
                        groups: v.groups.map((x, j) =>
                          j === i
                            ? {
                                ...x,
                                links: [
                                  ...x.links,
                                  {
                                    label: "",
                                    target: { type: "URL", href: "/" },
                                  },
                                ],
                              }
                            : x,
                        ),
                      })
                    }
                  >
                    Add link
                  </Button>
                  <Button
                    variant="quiet"
                    onClick={() =>
                      set({ ...v, groups: v.groups.filter((_, j) => j !== i) })
                    }
                  >
                    Remove group {i + 1}
                  </Button>
                </div>
              </fieldset>
            ))}
            {v.groups.length < 4 ? (
              <Button
                variant="secondary"
                onClick={() =>
                  set({ ...v, groups: [...v.groups, { title: "", links: [] }] })
                }
              >
                Add group
              </Button>
            ) : null}
            {v.social.map((s, i) => (
              <div key={i} className={ui.row}>
                <TextField
                  label={`Social ${i + 1} name`}
                  value={s.label}
                  onChange={(e) =>
                    set({
                      ...v,
                      social: v.social.map((x, j) =>
                        j === i ? { ...x, label: e.target.value } : x,
                      ),
                    })
                  }
                  maxLength={30}
                />
                <TextField
                  label={`Social ${i + 1} address`}
                  value={s.href}
                  onChange={(e) =>
                    set({
                      ...v,
                      social: v.social.map((x, j) =>
                        j === i ? { ...x, href: e.target.value } : x,
                      ),
                    })
                  }
                  hint="https:// address"
                />
                <Button
                  variant="quiet"
                  onClick={() =>
                    set({ ...v, social: v.social.filter((_, j) => j !== i) })
                  }
                >
                  Remove social {i + 1}
                </Button>
              </div>
            ))}
            <Button
              variant="secondary"
              onClick={() =>
                set({
                  ...v,
                  social: [...v.social, { label: "", href: "https://" }],
                })
              }
            >
              Add social link
            </Button>
          </>
        )}
      </BlockEditor>
    </div>
  );
}
