// Store settings (phase-16-plan.md): delivery charges, cash on delivery rules
// (D-186) and the WhatsApp number (OD-16). Owner and Manager
// (`settings.store`). Checkout reads the same values, and the API validates
// them with the same schemas.
import { useState, type FormEvent, type ReactNode } from "react";

import {
  api,
  localError,
  toApiError,
  type ApiError,
  type FieldErrors,
} from "../api/client.ts";
import { paiseToRupeesText, rupeesToPaise } from "../lib/format.ts";
import { useResource } from "../lib/resource.ts";
import { Button, Checkbox, TextField } from "../ui/controls.tsx";
import {
  ErrorState,
  ErrorSummary,
  Loading,
  Notice,
  PageHeader,
  Panel,
  Stack,
} from "../ui/feedback.tsx";
import s from "./orders.module.css";

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
type WhatsApp = { number: string; hours?: string } | null;

export function Settings() {
  return (
    <Stack gap="6">
      <PageHeader
        title="Store settings"
        description="Checkout uses these at once. Every change is recorded in the audit log."
      />
      <ShippingForm />
      <CodForm />
      <WhatsAppForm />
    </Stack>
  );
}

/** Loads a settings group and renders its form once it is ready. */
function Group<T>({
  path,
  title,
  children,
}: {
  path: string;
  title: string;
  children: (value: T, saved: (v: T) => void) => ReactNode;
}) {
  const group = useResource<{ settings: T }>(
    (signal) => api.get(`/admin/settings/${path}`, { signal }),
    [path],
  );
  return (
    <Panel title={title}>
      {group.status === "loading" ? <Loading /> : null}
      {group.status === "error" ? (
        <ErrorState error={group.error} onRetry={group.reload} />
      ) : null}
      {group.status === "ready"
        ? children(group.data.settings, (v) => group.set({ settings: v }))
        : null}
    </Panel>
  );
}

function useSave() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [saved, setSaved] = useState(false);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await fn();
      setSaved(true);
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, saved, setError, run };
}

const money = (text: string, field: string, problems: FieldErrors) => {
  const r = rupeesToPaise(text);
  if (!r.ok) problems[field] = r.message;
  return r.ok ? r.value : 0;
};

function ShippingForm() {
  return (
    <Group<Shipping> path="shipping" title="Delivery">
      {(value, saved) => <ShippingFields value={value} saved={saved} />}
    </Group>
  );
}

function ShippingFields({
  value,
  saved,
}: {
  value: Shipping;
  saved: (v: Shipping) => void;
}) {
  const [fee, setFee] = useState(paiseToRupeesText(value.flatFeePaise));
  const [threshold, setThreshold] = useState(
    value.freeShippingThresholdPaise === null
      ? ""
      : paiseToRupeesText(value.freeShippingThresholdPaise),
  );
  const [estimate, setEstimate] = useState(value.deliveryEstimate ?? "");
  const [fields, setFields] = useState<FieldErrors>({});
  const save = useSave();

  function submit(e: FormEvent) {
    e.preventDefault();
    const problems: FieldErrors = {};
    const body: Shipping = {
      flatFeePaise: money(fee, "flatFeePaise", problems),
      freeShippingThresholdPaise: threshold.trim()
        ? money(threshold, "freeShippingThresholdPaise", problems)
        : null,
      deliveryEstimate: estimate.trim() || null,
    };
    setFields(problems);
    if (Object.keys(problems).length) {
      save.setError(localError("Check the highlighted fields."));
      return;
    }
    void save.run(async () => {
      try {
        const r = await api.put<{ settings: Shipping }>(
          "/admin/settings/shipping",
          body,
        );
        saved(r.settings);
      } catch (err) {
        setFields(toApiError(err).fieldErrors);
        throw err;
      }
    });
  }

  return (
    <form onSubmit={submit} noValidate aria-label="Delivery settings">
      <Stack>
        {save.saved ? <Notice tone="success" title="Delivery saved." /> : null}
        <ErrorSummary
          error={save.error}
          fields={fields}
          idPrefix="ship-"
          labels={{
            flatFeePaise: "Delivery charge",
            freeShippingThresholdPaise: "Free delivery from",
            deliveryEstimate: "Delivery time",
          }}
        />
        <div className={s.formGrid}>
          <TextField
            id="ship-flatFeePaise"
            label="Delivery charge in rupees"
            hint="0 for free delivery on every order."
            inputMode="decimal"
            value={fee}
            onChange={(e) => setFee(e.target.value)}
            error={fields.flatFeePaise}
          />
          <TextField
            id="ship-freeShippingThresholdPaise"
            label="Free delivery from, in rupees"
            optional
            hint="Orders with at least this subtotal ship free. Leave empty for none."
            inputMode="decimal"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            error={fields.freeShippingThresholdPaise}
          />
          <TextField
            id="ship-deliveryEstimate"
            label="Delivery time shown at checkout"
            optional
            hint="For example: 3 to 7 working days. Leave empty to show nothing."
            maxLength={80}
            value={estimate}
            onChange={(e) => setEstimate(e.target.value)}
            error={fields.deliveryEstimate}
          />
        </div>
        <div>
          <Button type="submit" busy={save.busy} busyLabel="Saving…">
            Save delivery
          </Button>
        </div>
      </Stack>
    </form>
  );
}

function CodForm() {
  return (
    <Group<Cod> path="cod" title="Cash on delivery">
      {(value, saved) => <CodFields value={value} saved={saved} />}
    </Group>
  );
}

function CodFields({ value, saved }: { value: Cod; saved: (v: Cod) => void }) {
  const [enabled, setEnabled] = useState(value.enabled);
  const [max, setMax] = useState(paiseToRupeesText(value.maxOrderPaise));
  const [fee, setFee] = useState(paiseToRupeesText(value.feePaise));
  const [hours, setHours] = useState(String(value.confirmWithinHours));
  const [pins, setPins] = useState(value.excludedPinPrefixes.join(", "));
  const [fields, setFields] = useState<FieldErrors>({});
  const save = useSave();

  function submit(e: FormEvent) {
    e.preventDefault();
    const problems: FieldErrors = {};
    const prefixes = pins
      .split(/[\s,]+/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (prefixes.some((p) => !/^[1-9][0-9]{0,5}$/.test(p)))
      problems.excludedPinPrefixes =
        "Enter PIN codes or their first digits, separated by commas.";
    if (!/^\d{1,3}$/.test(hours) || Number(hours) < 1 || Number(hours) > 168)
      problems.confirmWithinHours = "Enter a whole number of hours, 1 to 168.";
    const body: Cod = {
      enabled,
      maxOrderPaise: money(max, "maxOrderPaise", problems),
      feePaise: money(fee, "feePaise", problems),
      excludedPinPrefixes: prefixes,
      refusalLimit: value.refusalLimit,
      confirmWithinHours: Number(hours),
    };
    setFields(problems);
    if (Object.keys(problems).length) {
      save.setError(localError("Check the highlighted fields."));
      return;
    }
    void save.run(async () => {
      try {
        const r = await api.put<{ settings: Cod }>("/admin/settings/cod", body);
        saved(r.settings);
      } catch (err) {
        setFields(toApiError(err).fieldErrors);
        throw err;
      }
    });
  }

  return (
    <form onSubmit={submit} noValidate aria-label="Cash on delivery settings">
      <Stack>
        {save.saved ? (
          <Notice tone="success" title="Cash on delivery saved." />
        ) : null}
        <ErrorSummary
          error={save.error}
          fields={fields}
          idPrefix="cod-"
          labels={{
            maxOrderPaise: "Largest order",
            feePaise: "COD fee",
            confirmWithinHours: "Confirm within",
            excludedPinPrefixes: "PIN codes without COD",
          }}
        />
        <Checkbox
          label="Offer cash on delivery"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        <div className={s.formGrid}>
          <TextField
            id="cod-maxOrderPaise"
            label="Largest COD order in rupees"
            inputMode="decimal"
            value={max}
            onChange={(e) => setMax(e.target.value)}
            error={fields.maxOrderPaise}
          />
          <TextField
            id="cod-feePaise"
            label="COD fee in rupees"
            hint="0 for no fee."
            inputMode="decimal"
            value={fee}
            onChange={(e) => setFee(e.target.value)}
            error={fields.feePaise}
          />
          <TextField
            id="cod-confirmWithinHours"
            label="Cancel unconfirmed COD orders after (hours)"
            inputMode="numeric"
            value={hours}
            onChange={(e) => setHours(e.target.value.replace(/\D/g, ""))}
            error={fields.confirmWithinHours}
          />
          <TextField
            id="cod-excludedPinPrefixes"
            label="PIN codes without COD"
            optional
            hint="Whole PIN codes or their first digits, separated by commas."
            value={pins}
            onChange={(e) => setPins(e.target.value)}
            error={fields.excludedPinPrefixes}
          />
        </div>
        <div>
          <Button type="submit" busy={save.busy} busyLabel="Saving…">
            Save cash on delivery
          </Button>
        </div>
      </Stack>
    </form>
  );
}

function WhatsAppForm() {
  return (
    <Group<WhatsApp> path="whatsapp" title="WhatsApp">
      {(value, saved) => <WhatsAppFields value={value} saved={saved} />}
    </Group>
  );
}

function WhatsAppFields({
  value,
  saved,
}: {
  value: WhatsApp;
  saved: (v: WhatsApp) => void;
}) {
  const [number, setNumber] = useState(value?.number ?? "");
  const [hours, setHours] = useState(value?.hours ?? "");
  const [fields, setFields] = useState<FieldErrors>({});
  const save = useSave();

  function submit(e: FormEvent) {
    e.preventDefault();
    setFields({});
    void save.run(async () => {
      try {
        const r = await api.put<{ settings: WhatsApp }>(
          "/admin/settings/whatsapp",
          { number, ...(hours.trim() ? { hours: hours.trim() } : {}) },
        );
        saved(r.settings);
        setNumber(r.settings?.number ?? "");
      } catch (err) {
        setFields(toApiError(err).fieldErrors);
        throw err;
      }
    });
  }

  function remove() {
    void save.run(async () => {
      await api.delete("/admin/settings/whatsapp");
      saved(null);
      setNumber("");
      setHours("");
    });
  }

  return (
    <form onSubmit={submit} noValidate aria-label="WhatsApp settings">
      <Stack>
        <p>
          {value
            ? "The storefront shows a WhatsApp button with this number."
            : "No number is set, so the storefront shows no WhatsApp button."}
        </p>
        {save.saved ? <Notice tone="success" title="WhatsApp saved." /> : null}
        <ErrorSummary
          error={save.error}
          fields={fields}
          idPrefix="wa-"
          labels={{ number: "WhatsApp number", hours: "Hours" }}
        />
        <div className={s.formGrid}>
          <TextField
            id="wa-number"
            label="WhatsApp number"
            hint="An Indian mobile number, for example 98765 43210."
            inputMode="tel"
            autoComplete="off"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            error={fields.number}
          />
          <TextField
            id="wa-hours"
            label="When you reply"
            optional
            hint="Shown next to the button, for example: 10 am to 7 pm, Monday to Saturday."
            maxLength={120}
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            error={fields.hours}
          />
        </div>
        <div className={s.slipHead}>
          <Button type="submit" busy={save.busy} busyLabel="Saving…">
            Save WhatsApp
          </Button>
          {value ? (
            <Button variant="danger" disabled={save.busy} onClick={remove}>
              Remove the number
            </Button>
          ) : null}
        </div>
      </Stack>
    </form>
  );
}
