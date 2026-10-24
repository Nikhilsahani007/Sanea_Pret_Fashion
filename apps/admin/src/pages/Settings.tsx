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
        Leave blank anything you do not want shown.
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
      <ShippingSettings />
      <CodSettings />
    </div>
  );
}

type Shipping = {
  flatFeePaise: number;
  freeShippingThresholdPaise: number | null;
  deliveryEstimate: string | null;
};
type Cod = {
  enabled: boolean;
  maxOrderPaise: number;
  feePaise: number;
  excludedPinPrefixes: string[];
  refusalLimit: number | null;
  confirmWithinHours: number;
};

/** "1,499.50" or "" → paise or null. NaN stays NaN so the API rejects it. */
function rupeesToPaise(v: string): number | null {
  const clean = v.replace(/[,₹\s]/g, "");
  if (!clean) return null;
  return Math.round(Number(clean) * 100);
}
const paiseToRupees = (p: number | null) => (p === null ? "" : String(p / 100));

function useGroup<T>(group: string) {
  const data = useQuery({
    queryKey: ["settings", group],
    queryFn: () => get<{ settings: T }>(`/admin/settings/${group}`),
  });
  const save = useMutation({
    mutationFn: (body: T) => send("PUT", `/admin/settings/${group}`, body),
  });
  const errors = save.error
    ? ((save.error as ApiError).fieldErrors?.() ?? {})
    : {};
  return { value: data.data?.settings, save, errors };
}

function ShippingSettings() {
  const { value: s, save, errors } = useGroup<Shipping>("shipping");
  if (!s) return null;
  return (
    <form
      className={`${ui.panel} ${ui.stack}`}
      aria-labelledby="shipping-h"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const v = (k: string) => String(f.get(k) ?? "").trim();
        save.mutate({
          flatFeePaise: rupeesToPaise(v("flatFee")) ?? 0,
          freeShippingThresholdPaise: rupeesToPaise(v("threshold")),
          deliveryEstimate: v("estimate") || null,
        });
      }}
    >
      <h2 id="shipping-h">Shipping</h2>
      <p className={ui.muted}>
        No fee is charged until you enter one. Your decision (OD-08).
      </p>
      <ErrorSummary error={save.error} title="Shipping was not saved" />
      {save.isSuccess ? <Notice>Shipping saved.</Notice> : null}
      <TextField
        label="Flat delivery fee (₹)"
        name="flatFee"
        inputMode="decimal"
        defaultValue={paiseToRupees(s.flatFeePaise)}
        error={errors.flatFeePaise}
      />
      <TextField
        label="Free delivery from (₹)"
        name="threshold"
        inputMode="decimal"
        hint="Leave blank for no free-delivery threshold."
        defaultValue={paiseToRupees(s.freeShippingThresholdPaise)}
        error={errors.freeShippingThresholdPaise}
      />
      <TextField
        label="Delivery estimate shown at checkout"
        name="estimate"
        maxLength={80}
        hint="For example “3 to 7 working days”. Leave blank to show none."
        defaultValue={s.deliveryEstimate ?? ""}
        error={errors.deliveryEstimate}
      />
      <div>
        <Button type="submit" busy={save.isPending}>
          Save shipping
        </Button>
      </div>
    </form>
  );
}

function CodSettings() {
  const { value: s, save, errors } = useGroup<Cod>("cod");
  if (!s) return null;
  return (
    <form
      className={`${ui.panel} ${ui.stack}`}
      aria-labelledby="cod-h"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const v = (k: string) => String(f.get(k) ?? "").trim();
        save.mutate({
          enabled: f.get("enabled") === "on",
          maxOrderPaise: rupeesToPaise(v("max")) ?? 0,
          feePaise: rupeesToPaise(v("fee")) ?? 0,
          excludedPinPrefixes: v("pins")
            .split(/[\s,]+/)
            .filter(Boolean),
          refusalLimit: v("refusals") ? Number(v("refusals")) : null,
          confirmWithinHours: Number(v("hours")),
        });
      }}
    >
      <h2 id="cod-h">Cash on delivery</h2>
      <p className={ui.muted}>
        The values shown start as the proposed defaults (OD-07): up to ₹15,000,
        no fee, every PIN code, unconfirmed orders cancelled after 48 hours.
        Change them to your decision.
      </p>
      <ErrorSummary error={save.error} title="Cash on delivery was not saved" />
      {save.isSuccess ? <Notice>Cash on delivery saved.</Notice> : null}
      <label className={ui.check}>
        <input type="checkbox" name="enabled" defaultChecked={s.enabled} />
        Offer cash on delivery
      </label>
      <TextField
        label="Maximum order value (₹)"
        name="max"
        inputMode="decimal"
        defaultValue={paiseToRupees(s.maxOrderPaise)}
        error={errors.maxOrderPaise}
      />
      <TextField
        label="COD fee (₹)"
        name="fee"
        inputMode="decimal"
        defaultValue={paiseToRupees(s.feePaise)}
        error={errors.feePaise}
      />
      <TextArea
        label="PIN codes or prefixes without COD"
        name="pins"
        rows={2}
        hint="Separate with spaces or commas, for example 1100 or 560001."
        defaultValue={s.excludedPinPrefixes.join(" ")}
        error={errors.excludedPinPrefixes}
      />
      <TextField
        label="Refused COD orders before COD is withheld"
        name="refusals"
        inputMode="numeric"
        hint="Leave blank to never withhold COD."
        defaultValue={s.refusalLimit === null ? "" : String(s.refusalLimit)}
        error={errors.refusalLimit}
      />
      <TextField
        label="Cancel unconfirmed COD orders after (hours)"
        name="hours"
        inputMode="numeric"
        defaultValue={String(s.confirmWithinHours)}
        error={errors.confirmWithinHours}
      />
      <div>
        <Button type="submit" busy={save.isPending}>
          Save cash on delivery
        </Button>
      </div>
    </form>
  );
}
