import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent } from "react";

import { get, send } from "../api.ts";
import { useAuth } from "../auth.tsx";
import type { Colour } from "../types.ts";
import { Button, ErrorSummary, TextField, ui } from "../ui/ui.tsx";

export function Colours() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const list = useQuery({
    queryKey: ["colours"],
    queryFn: () => get<{ colours: Colour[] }>("/admin/colours"),
  });
  const create = useMutation({
    mutationFn: (body: object) => send("POST", "/admin/colours", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["colours"] }),
  });

  function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    create.mutate(
      {
        name: String(f.get("name")).trim(),
        swatchHex: String(f.get("swatchHex")),
      },
      { onSuccess: () => form.reset() },
    );
  }

  return (
    <div className={ui.stack}>
      <h1>Colours</h1>
      <p className={ui.muted}>
        Colour names are shown to shoppers next to the swatch, so name them as
        you would describe the garment.
      </p>
      <ul className={ui.row} style={{ listStyle: "none", padding: 0 }}>
        {list.data?.colours.map((c) => (
          <li
            key={c.id}
            className={ui.panel}
            style={{
              display: "flex",
              gap: "var(--sp-space-3)",
              alignItems: "center",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 28,
                height: 28,
                background: c.swatchHex,
                border: "1px solid var(--sp-border)",
              }}
            />
            <span>
              {c.name}
              <br />
              <span className={ui.muted}>{c.swatchHex}</span>
            </span>
          </li>
        ))}
      </ul>
      {list.data?.colours.length === 0 ? <p>No colours yet.</p> : null}
      {can("products.editContent") ? (
        <form
          className={`${ui.panel} ${ui.stack}`}
          onSubmit={onCreate}
          noValidate
          aria-labelledby="new-colour"
        >
          <h2 id="new-colour">New colour</h2>
          <ErrorSummary
            error={create.error}
            title="The colour was not created"
          />
          <div className={ui.row}>
            <TextField label="Name" name="name" required maxLength={60} />
            <TextField
              label="Swatch"
              name="swatchHex"
              type="color"
              // design-token-exception: DTX-001
              defaultValue="#ece4d4"
              required
            />
            <Button type="submit" busy={create.isPending}>
              Add colour
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
