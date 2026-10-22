// Colours (Q8-3): name, web address and swatch, with a preview. The swatch is
// catalogue data (the product's colour), not a design value.
import { useState, type FormEvent } from "react";

import { api, toApiError, withMessage, type ApiError } from "../api/client.ts";
import type { Colour, List } from "../api/types.ts";
import { slugify } from "../lib/format.ts";
import { useResource } from "../lib/resource.ts";
import { Button, TextField } from "../ui/controls.tsx";
import {
  Cluster,
  Empty,
  ErrorState,
  ErrorSummary,
  Loading,
  Notice,
  PageHeader,
  Panel,
  Stack,
  TableRegion,
  ui,
} from "../ui/feedback.tsx";
import s from "./catalogue.module.css";

const HEX = /^#[0-9A-Fa-f]{6}$/;

export function Swatch({ hex, name }: { hex: string; name: string }) {
  return HEX.test(hex) ? (
    <span
      className={s.swatch}
      style={{ background: hex }}
      role="img"
      aria-label={`Swatch for ${name}`}
    />
  ) : null;
}

export function Colours() {
  const list = useResource<Colour[]>(
    async (signal) =>
      (await api.get<List<Colour>>("/admin/colours", { signal })).items,
    [],
  );
  const [editing, setEditing] = useState<Colour | null>(null);
  // A new key after each save gives an empty form for the next item.
  const [formVersion, setFormVersion] = useState(0);
  const [message, setMessage] = useState<string | null>(null);

  if (list.status === "loading") return <Loading label="Loading colours…" />;
  if (list.status === "error")
    return <ErrorState error={list.error} onRetry={list.reload} />;

  return (
    <Stack gap="6">
      <PageHeader
        title="Colours"
        description="The colours variants can be made in. Shoppers filter by them."
      />
      {message ? <Notice tone="success" title={message} /> : null}
      <Panel title="All colours">
        {list.data.length === 0 ? (
          <Empty>
            <p>No colours yet.</p>
          </Empty>
        ) : (
          <TableRegion label="Colours table">
            <table className={ui.table}>
              <caption className="visually-hidden">Colours</caption>
              <thead>
                <tr>
                  <th scope="col">Swatch</th>
                  <th scope="col">Name</th>
                  <th scope="col">Web address</th>
                  <th scope="col">Hex</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {list.data.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Swatch hex={c.swatchHex} name={c.name} />
                    </td>
                    <td>{c.name}</td>
                    <td>{c.slug}</td>
                    <td className={ui.code}>{c.swatchHex.toUpperCase()}</td>
                    <td>
                      <Button
                        variant="secondary"
                        size="small"
                        onClick={() => setEditing(c)}
                        aria-label={`Edit ${c.name}`}
                      >
                        Edit
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableRegion>
        )}
      </Panel>
      <ColourForm
        key={editing?.id ?? `new-${formVersion}`}
        editing={editing}
        onCancel={() => setEditing(null)}
        onSaved={(name, created) => {
          setMessage(created ? `“${name}” created.` : `“${name}” saved.`);
          setEditing(null);
          setFormVersion((v) => v + 1);
          list.reload();
        }}
      />
    </Stack>
  );
}

function ColourForm({
  editing,
  onSaved,
  onCancel,
}: {
  editing: Colour | null;
  onSaved: (name: string, created: boolean) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(editing?.name ?? "");
  const [slug, setSlug] = useState(editing?.slug ?? "");
  const [slugEdited, setSlugEdited] = useState(Boolean(editing));
  const [hex, setHex] = useState(editing?.swatchHex ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = {
      name,
      slug,
      swatchHex: hex.startsWith("#") ? hex : `#${hex}`,
    };
    try {
      if (editing) await api.patch(`/admin/colours/${editing.id}`, body);
      else await api.post("/admin/colours", body);
      onSaved(name, !editing);
    } catch (err) {
      const apiError = toApiError(err);
      setError(
        apiError.status === 409
          ? withMessage(
              apiError,
              "Another colour already uses this web address.",
            )
          : apiError,
      );
    } finally {
      setBusy(false);
    }
  }

  const fields = error?.fieldErrors ?? {};
  const normalised = hex.startsWith("#") ? hex : `#${hex}`;
  return (
    <Panel title={editing ? `Edit “${editing.name}”` : "New colour"}>
      <form onSubmit={submit} noValidate>
        <Stack>
          <ErrorSummary
            error={error}
            fields={fields}
            idPrefix="colour-"
            labels={{ name: "Name", slug: "Web address", swatchHex: "Swatch" }}
          />
          <div className={s.twoColumns}>
            <TextField
              id="colour-name"
              label="Name"
              maxLength={60}
              value={name}
              error={fields.name}
              onChange={(e) => {
                setName(e.target.value);
                if (!slugEdited) setSlug(slugify(e.target.value));
              }}
            />
            <TextField
              id="colour-slug"
              label="Web address"
              spellCheck={false}
              maxLength={100}
              value={slug}
              error={fields.slug}
              onChange={(e) => {
                setSlug(e.target.value);
                setSlugEdited(true);
              }}
            />
            <TextField
              id="colour-swatchHex"
              label="Swatch colour"
              hint="Six hexadecimal digits, for example 7A1F3D. Match the fabric photographed in daylight."
              spellCheck={false}
              maxLength={7}
              value={hex}
              error={fields.swatchHex}
              onChange={(e) => setHex(e.target.value.trim())}
            />
            <div>
              <p className={ui.label}>Preview</p>
              {HEX.test(normalised) ? (
                <Swatch hex={normalised} name={name || "this colour"} />
              ) : (
                <p className={ui.hint}>Enter six digits to see the swatch.</p>
              )}
            </div>
          </div>
          <Cluster>
            <Button type="submit" busy={busy} busyLabel="Saving…">
              {editing ? "Save colour" : "Create colour"}
            </Button>
            {editing ? (
              <Button variant="quiet" onClick={onCancel}>
                Cancel
              </Button>
            ) : null}
          </Cluster>
        </Stack>
      </form>
    </Panel>
  );
}
