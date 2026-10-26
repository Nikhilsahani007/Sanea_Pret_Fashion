// Website enquiry (UF-3; phase-13-plan.md §2): name, an email or a mobile
// number, a message and consent to be contacted; the chosen product and
// variant ride along. Checked here with the shared schema and again by the
// API. A hidden honeypot field and the time the form was open let the API
// drop bots quietly. Errors are listed above the form and tied to each field.
import { enquirySchema, toFieldErrors, type FieldError } from "@sanea/shared";
import { useId, useRef, useState, type FormEvent, type ReactNode } from "react";

import { useLocation } from "react-router";

import { api, toApiError } from "../api/client.ts";
import ui from "../ui/ui.module.css";
import s from "./product.module.css";

const LABELS: Record<string, string> = {
  name: "Name",
  email: "Email",
  phone: "Mobile number",
  contact: "Email or mobile number",
  message: "Message",
  consentToContact: "Consent",
};

const MESSAGES: Partial<Record<string, string>> = {
  contact: "Give an email address or a mobile number so we can reply.",
  consentToContact: "Tick the box so we may reply to you.",
  message: "Write at least 10 characters.",
};

export function EnquiryForm({
  productId,
  variantId,
  productName,
  onDone,
}: {
  productId?: string | undefined;
  variantId?: string | undefined;
  productName?: string | undefined;
  onDone?: () => void;
}) {
  const id = useId();
  const here = useLocation();
  const opened = useRef(Date.now());
  const summary = useRef<HTMLDivElement>(null);
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [failure, setFailure] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const value = (k: string) => String(form.get(k) ?? "");
    const body = {
      ...(productId ? { productId } : {}),
      ...(variantId ? { variantId } : {}),
      name: value("name"),
      email: value("email"),
      phone: value("phone"),
      message: value("message"),
      consentToContact: form.get("consent") === "on" ? true : undefined,
      sourcePath: `${here.pathname}${here.search}`.slice(0, 300),
      website: value("website") || undefined,
      elapsedMs: Math.min(Date.now() - opened.current, 86_400_000),
    };
    const parsed = enquirySchema.safeParse(body);
    if (!parsed.success) {
      setErrors(toFieldErrors(parsed.error));
      setFailure(null);
      requestAnimationFrame(() => summary.current?.focus());
      return;
    }
    setErrors([]);
    setFailure(null);
    setState("sending");
    try {
      await api.post("/enquiries", body);
      setState("sent");
    } catch (error) {
      const err = toApiError(error);
      setFailure(
        err.status === 429
          ? "Too many messages in a short time. Try again in an hour, or contact us another way."
          : err.message,
      );
      setState("idle");
      requestAnimationFrame(() => summary.current?.focus());
    }
  }

  if (state === "sent")
    return (
      <div className={s.sent} role="status">
        <p>Thank you. We have your message and will reply by email or phone.</p>
        {onDone ? (
          <button type="button" className={ui.button} onClick={onDone}>
            Close
          </button>
        ) : null}
      </div>
    );

  const errorFor = (field: string) =>
    errors.find((e) => e.path === field || e.path.startsWith(`${field}.`));
  const messageFor = (e: FieldError) => MESSAGES[e.path] ?? e.message;
  const described = (field: string) =>
    errorFor(field) ? `${id}-${field}-error` : undefined;

  return (
    <form className={s.form} onSubmit={(e) => void submit(e)} noValidate>
      {productName ? <p className={s.hint}>About: {productName}</p> : null}
      <div ref={summary} tabIndex={-1} className={s.summary}>
        {errors.length ? (
          <div role="alert">
            <p>Check the form:</p>
            <ul>
              {errors.map((e) => (
                <li key={e.path}>
                  {LABELS[e.path] ?? e.path}: {messageFor(e)}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {failure ? <p role="alert">{failure}</p> : null}
      </div>
      <Field
        id={`${id}-name`}
        label="Name"
        error={errorFor("name")}
        message={messageFor}
      >
        <input
          id={`${id}-name`}
          name="name"
          autoComplete="name"
          maxLength={100}
          aria-invalid={Boolean(errorFor("name")) || undefined}
          aria-describedby={described("name")}
        />
      </Field>
      <p className={s.hint} id={`${id}-contact-hint`}>
        Give at least one way to reply: an email or a mobile number.
      </p>
      {errorFor("contact") ? (
        <p className={s.fieldError} id={`${id}-contact-error`}>
          {MESSAGES.contact}
        </p>
      ) : null}
      <Field
        id={`${id}-email`}
        label="Email"
        error={errorFor("email")}
        message={messageFor}
      >
        <input
          id={`${id}-email`}
          name="email"
          type="email"
          autoComplete="email"
          maxLength={254}
          aria-invalid={
            Boolean(errorFor("email") || errorFor("contact")) || undefined
          }
          aria-describedby={[
            `${id}-contact-hint`,
            described("email"),
            described("contact"),
          ]
            .filter(Boolean)
            .join(" ")}
        />
      </Field>
      <Field
        id={`${id}-phone`}
        label="Mobile number"
        error={errorFor("phone")}
        message={messageFor}
      >
        <input
          id={`${id}-phone`}
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          maxLength={20}
          aria-invalid={
            Boolean(errorFor("phone") || errorFor("contact")) || undefined
          }
          aria-describedby={[
            `${id}-contact-hint`,
            described("phone"),
            described("contact"),
          ]
            .filter(Boolean)
            .join(" ")}
        />
      </Field>
      <Field
        id={`${id}-message`}
        label="Message"
        error={errorFor("message")}
        message={messageFor}
      >
        <textarea
          id={`${id}-message`}
          name="message"
          rows={5}
          maxLength={2000}
          aria-invalid={Boolean(errorFor("message")) || undefined}
          aria-describedby={described("message")}
        />
      </Field>
      {/* Honeypot: hidden from people and from assistive technology. */}
      <div className={s.trap} aria-hidden="true">
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <div className={s.consent}>
        <label>
          <input
            type="checkbox"
            name="consent"
            aria-invalid={Boolean(errorFor("consentToContact")) || undefined}
            aria-describedby={described("consentToContact")}
          />
          You may contact me about this enquiry by email, phone or WhatsApp.
        </label>
        {errorFor("consentToContact") ? (
          <p className={s.fieldError} id={`${id}-consentToContact-error`}>
            {MESSAGES.consentToContact}
          </p>
        ) : null}
      </div>
      <button
        type="submit"
        className={ui.button}
        disabled={state === "sending"}
      >
        {state === "sending" ? "Sending…" : "Send enquiry"}
      </button>
    </form>
  );
}

function Field({
  id,
  label,
  error,
  message,
  children,
}: {
  id: string;
  label: string;
  error: FieldError | undefined;
  message: (e: FieldError) => string;
  children: ReactNode;
}) {
  return (
    <div className={s.field}>
      <label htmlFor={id}>{label}</label>
      {children}
      {error ? (
        <p className={s.fieldError} id={`${id}-error`}>
          {message(error)}
        </p>
      ) : null}
    </div>
  );
}
