// One navigation menu (phase-10-plan.md §3.3): an ordered list of links,
// moved with buttons. A link whose target is not public is kept but hidden on
// the shop, and marked here. The whole menu is saved at once.
import { useState } from "react";
import { Link, useParams } from "react-router";

import { api, toApiError, type ApiError } from "../api/client.ts";
import type { MenuView, NavTarget, Target } from "../api/types.ts";
import { useResource } from "../lib/resource.ts";
import { Button, TextField } from "../ui/controls.tsx";
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
import { MENU_NAMES } from "./ContentHome.tsx";
import { TargetPicker, useRefs, type Refs } from "./pickers.tsx";
import s from "./content.module.css";

type Item = { label: string; target: NavTarget | undefined; hidden?: boolean };

/** Menus use `URL` for paths; the shared picker calls them `PATH`. */
const toPicker = (t: NavTarget | undefined): Target | undefined =>
  t?.kind === "URL" ? { kind: "PATH", path: t.url } : t;
const fromPicker = (t: Target | undefined): NavTarget | undefined =>
  t?.kind === "PATH" ? { kind: "URL", url: t.path } : t;

export function NavigationEditor() {
  const { menu = "" } = useParams();
  const data = useResource<MenuView>(
    (signal) => api.get(`/admin/content/navigation/${menu}`, { signal }),
    [menu],
  );
  const refs = useRefs();
  if (data.status === "loading" || refs.status === "loading")
    return <Loading label="Loading menu…" />;
  if (data.status === "error")
    return <ErrorState error={data.error} onRetry={data.reload} />;
  if (refs.status === "error")
    return <ErrorState error={refs.error} onRetry={refs.reload} />;
  return (
    <Editor
      key={menu}
      view={data.data}
      refs={refs.data}
      onSaved={data.reload}
    />
  );
}

function Editor({
  view,
  refs,
  onSaved,
}: {
  view: MenuView;
  refs: Refs;
  onSaved: () => void;
}) {
  const [items, setItems] = useState<Item[]>(
    view.items.map((i) => ({
      label: i.label,
      target: i.target,
      hidden: i.hidden,
    })),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const edit = (i: number, patch: Partial<Item>) =>
    setItems(
      items.map((x, j) =>
        j === i ? { ...x, ...patch, hidden: undefined } : x,
      ),
    );
  const move = (i: number, by: -1 | 1) => {
    const next = [...items];
    const [x] = next.splice(i, 1);
    next.splice(i + by, 0, x!);
    setItems(next);
  };

  async function save() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await api.put(`/admin/content/navigation/${view.menu}`, {
        items: items.map((i) => ({ label: i.label, target: i.target })),
      });
      setMessage(
        "Menu saved. The shop shows it within a minute; links to unpublished targets stay hidden.",
      );
      onSaved();
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  const fields = error?.fieldErrors ?? {};
  return (
    <Stack gap="6">
      <p>
        <Link to="/content">All content</Link>
      </p>
      <PageHeader
        title={`Menu: ${MENU_NAMES[view.menu] ?? view.menu}`}
        description={`Up to ${view.maxItems} links. Changes go live when saved.`}
      />
      {message ? <Notice tone="success" title={message} /> : null}
      <ErrorSummary error={error} fields={fields} idPrefix="nav-" />
      <Panel title="Links">
        <Stack gap="4">
          {items.length === 0 ? (
            <p className={ui.muted}>No links yet.</p>
          ) : null}
          <ol className={s.list} aria-label="Links in menu order">
            {items.map((item, i) => (
              <li key={i} className={s.item}>
                <Stack gap="3">
                  {item.hidden ? (
                    <p className={ui.hint}>
                      Hidden on the shop: the target is not published.
                    </p>
                  ) : null}
                  <TextField
                    id={`nav-items.${i}.label`}
                    label={`Link ${i + 1} label`}
                    maxLength={40}
                    value={item.label}
                    error={fields[`items.${i}.label`]}
                    onChange={(e) => edit(i, { label: e.target.value })}
                  />
                  <TargetPicker
                    idPrefix={`nav-items.${i}.target`}
                    label={`Link ${i + 1} target`}
                    value={toPicker(item.target)}
                    refs={refs}
                    error={
                      fields[`items.${i}.target.id`] ??
                      fields[`items.${i}.target.url`] ??
                      fields[`items.${i}.target`]
                    }
                    onChange={(t) => edit(i, { target: fromPicker(t) })}
                  />
                  <Cluster gap="2">
                    <Button
                      variant="secondary"
                      size="small"
                      disabled={i === 0}
                      onClick={() => move(i, -1)}
                      aria-label={`Move link ${i + 1} up`}
                    >
                      Move up
                    </Button>
                    <Button
                      variant="secondary"
                      size="small"
                      disabled={i === items.length - 1}
                      onClick={() => move(i, 1)}
                      aria-label={`Move link ${i + 1} down`}
                    >
                      Move down
                    </Button>
                    <Button
                      variant="danger"
                      size="small"
                      onClick={() => setItems(items.filter((_, j) => j !== i))}
                      aria-label={`Remove link ${i + 1}`}
                    >
                      Remove
                    </Button>
                  </Cluster>
                </Stack>
              </li>
            ))}
          </ol>
          <div>
            <Button
              variant="secondary"
              size="small"
              disabled={items.length >= view.maxItems}
              onClick={() =>
                setItems([...items, { label: "", target: undefined }])
              }
            >
              Add link
            </Button>
          </div>
        </Stack>
      </Panel>
      <div>
        <Button onClick={save} busy={busy} busyLabel="Saving…">
          Save menu
        </Button>
      </div>
    </Stack>
  );
}
