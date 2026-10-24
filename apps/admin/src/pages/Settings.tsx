import { useMutation, useQuery } from "@tanstack/react-query";
import { type FormEvent } from "react";

import { get, send, type ApiError } from "../api.ts";
import {
  Button,
  ErrorSummary,
  Notice,
  TextArea,
  TextField,
  ui,
} from "../ui/ui.tsx";

type Store = {
  whatsappNumber: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  businessAddress: string | null;
};

export function Settings() {
  const data = useQuery({
    queryKey: ["settings", "store"],
    queryFn: () => get<{ settings: Store }>("/admin/settings/store"),
  });
  const save = useMutation({
    mutationFn: (body: Store) => send("PUT", "/admin/settings/store", body),
  });
  const s = data.data?.settings;
  const errors = save.error
    ? ((save.error as ApiError).fieldErrors?.() ?? {})
    : {};

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const v = (k: string) => String(f.get(k) ?? "").trim() || null;
    const phone = (k: string) => {
      const raw = v(k)?.replace(/[\s-]/g, "") ?? null;
      if (!raw) return null;
      return raw.startsWith("+91") ? raw : `+91${raw.replace(/^0/, "")}`;
    };
    save.mutate({
      whatsappNumber: phone("whatsappNumber"),
      contactPhone: phone("contactPhone"),
      contactEmail: v("contactEmail"),
      businessAddress: v("businessAddress"),
    });
  }

  if (!s) return <p role="status">Loading settings…</p>;
  return (
    <div className={ui.stack}>
      <h1>Store settings</h1>
      <p className={ui.muted}>
        Shown to shoppers in the footer, on product pages and in WhatsApp links.
        Leave blank anything you do not want shown. Shipping and
        cash-on-delivery rules arrive with checkout.
      </p>
      <form
        className={`${ui.panel} ${ui.stack}`}
        onSubmit={onSubmit}
        noValidate
      >
        <ErrorSummary error={save.error} title="Settings were not saved" />
        {save.isSuccess ? <Notice>Settings saved.</Notice> : null}
        <TextField
          label="WhatsApp number"
          name="whatsappNumber"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          defaultValue={s.whatsappNumber ?? ""}
          hint="An Indian mobile number, for example 98765 43210."
          error={errors.whatsappNumber}
        />
        <TextField
          label="Customer care phone"
          name="contactPhone"
          type="tel"
          inputMode="tel"
          defaultValue={s.contactPhone ?? ""}
          error={errors.contactPhone}
        />
        <TextField
          label="Customer care email"
          name="contactEmail"
          type="email"
          defaultValue={s.contactEmail ?? ""}
          error={errors.contactEmail}
        />
        <TextArea
          label="Business address"
          name="businessAddress"
          defaultValue={s.businessAddress ?? ""}
          rows={3}
          maxLength={300}
          error={errors.businessAddress}
        />
        <div>
          <Button type="submit" busy={save.isPending}>
            Save settings
          </Button>
        </div>
      </form>
    </div>
  );
}
