import type { LinkTarget } from "@sanea/shared";
import { NAVIGATION_MENUS } from "@sanea/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { get, send } from "../api.ts";
import { TargetPicker } from "../ui/pickers.tsx";
import { Button, ErrorSummary, Notice, TextField, ui } from "../ui/ui.tsx";

type Item = { label: string; target: LinkTarget | null };
const LABELS: Record<(typeof NAVIGATION_MENUS)[number], string> = {
  HEADER: "Header links",
  FOOTER_SHOP: "Footer: shop",
  FOOTER_HELP: "Footer: help",
};

export function Navigation() {
  return (
    <div className={ui.stack}>
      <h1>Navigation</h1>
      <p className={ui.muted}>
        Changes here are live as soon as you save. Links to anything unpublished
        are hidden on the storefront.
      </p>
      {NAVIGATION_MENUS.map((menu) => (
        <Menu key={menu} menu={menu} />
      ))}
    </div>
  );
}

function Menu({ menu }: { menu: (typeof NAVIGATION_MENUS)[number] }) {
  const qc = useQueryClient();
  const data = useQuery({
    queryKey: ["menu", menu],
    queryFn: () => get<{ items: Item[] }>(`/admin/content/navigation/${menu}`),
  });
  const [items, setItems] = useState<Item[] | null>(null);
  const current = items ?? data.data?.items ?? [];
  const save = useMutation({
    mutationFn: () =>
      send<{ items: Item[] }>("PUT", `/admin/content/navigation/${menu}`, {
        items: current.filter((i) => i.target),
      }),
    onSuccess: (res) => {
      setItems(res.items);
      void qc.invalidateQueries({ queryKey: ["menu", menu] });
    },
  });
  return (
    <section
      className={`${ui.panel} ${ui.stack}`}
      aria-labelledby={`menu-${menu}`}
    >
      <h2 id={`menu-${menu}`}>{LABELS[menu]}</h2>
      <ErrorSummary error={save.error} title="The menu was not saved" />
      {save.isSuccess ? <Notice>Menu saved.</Notice> : null}
      {current.map((item, i) => (
        <div key={i} className={ui.row}>
          <TextField
            label={`Link ${i + 1} text`}
            value={item.label}
            onChange={(e) =>
              setItems(
                current.map((x, j) =>
                  j === i ? { ...x, label: e.target.value } : x,
                ),
              )
            }
            maxLength={40}
          />
          <TargetPicker
            label={`Link ${i + 1} goes to`}
            value={item.target}
            onChange={(t) =>
              setItems(
                current.map((x, j) => (j === i ? { ...x, target: t } : x)),
              )
            }
          />
          <Button
            variant="quiet"
            onClick={() => setItems(current.filter((_, j) => j !== i))}
          >
            Remove link {i + 1}
          </Button>
        </div>
      ))}
      <div className={ui.row}>
        <Button
          variant="secondary"
          onClick={() =>
            setItems([
              ...current,
              { label: "", target: { type: "URL", href: "/" } },
            ])
          }
        >
          Add link
        </Button>
        <Button onClick={() => save.mutate()} busy={save.isPending}>
          Save menu
        </Button>
      </div>
    </section>
  );
}
