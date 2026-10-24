// Website enquiry (UF-3): visible labels, errors under fields, a consent box
// that must be ticked, a hidden honeypot and the time the form was open.
import { useEffect, useRef, useState, type FormEvent } from "react";

import { ApiError, send } from "../lib/api.ts";
import s from "./EnquiryForm.module.css";

type Props = {
  productId?: string;
  variantId?: string;
  productName?: string;
  onDone?: () => void;
};

export function EnquiryForm({
  productId,
  variantId,
  productName,
  onDone,
}: Props) {
  const opened = useRef(Date.now());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const form = useRef<HTMLFormElement>(null);
  const [attempt, setAttempt] = useState(0);

  // After a failed submit, focus the first field with an error (once rendered).
  useEffect(() => {
    if (attempt === 0) return;
    form.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus();
  }, [attempt, errors]);
  const [state, setState] = useState<
    "idle" | "sending" | "sent" | "failed" | "limited"
  >("idle");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const v = (k: string) => String(f.get(k) ?? "").trim();
    const errs: Record<string, string> = {};
    if (!v("name")) errs.name = "Enter your name.";
    if (!v("email") && !v("phone"))
      errs.email = "Give an email address or a mobile number so we can reply.";
    if (v("message").length < 10)
      errs.message = "Write a little more, at least 10 characters.";
    if (!f.get("consent")) errs.consent = "Tick this so we may reply to you.";
    setErrors(errs);
    setAttempt((n) => n + 1);
    if (Object.keys(errs).length) return;
    setState("sending");
    try {
      await send("POST", "/enquiries", {
        ...(productId ? { productId } : {}),
        ...(variantId ? { variantId } : {}),
        name: v("name"),
        ...(v("email") ? { email: v("email") } : {}),
        ...(v("phone") ? { phone: v("phone") } : {}),
        message: v("message"),
        consentToContact: true,
        sourcePath: window.location.pathname + window.location.search,
        website: v("website"),
        elapsedMs: Date.now() - opened.current,
      });
      setState("sent");
    } catch (err) {
      if (
        err instanceof ApiError &&
        err.status === 400 &&
        Array.isArray(err.details)
      ) {
        const map: Record<string, string> = {};
        for (const d of err.details as { path: string; message: string }[])
          map[d.path.replace(/^body\./, "")] ??= d.message;
        setErrors(map);
        setAttempt((n) => n + 1);
        setState("idle");
      } else
        setState(
          err instanceof ApiError && err.status === 429 ? "limited" : "failed",
        );
    }
  }

  if (state === "sent")
    return (
      <div className={s.sent} role="status">
        <p>Thank you. We have your message and will reply by email or phone.</p>
        {onDone ? (
          <button type="button" className={s.button} onClick={onDone}>
            Close
          </button>
        ) : null}
      </div>
    );

  const field = (
    name: string,
    label: string,
    input: React.ReactNode,
    hint?: string,
  ) => (
    <div className={s.field}>
      <label htmlFor={`enq-${name}`}>{label}</label>
      {input}
      {hint ? (
        <span id={`enq-${name}-hint`} className={s.hint}>
          {hint}
        </span>
      ) : null}
      {errors[name] ? (
        <span id={`enq-${name}-error`} className={s.error}>
          {errors[name]}
        </span>
      ) : null}
    </div>
  );
  const describe = (name: string, hint = false) =>
    [hint ? `enq-${name}-hint` : "", errors[name] ? `enq-${name}-error` : ""]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <form ref={form} className={s.form} onSubmit={onSubmit} noValidate>
      {productName ? <p>About: {productName}</p> : null}
      {field(
        "name",
        "Your name",
        <input
          id="enq-name"
          name="name"
          autoComplete="name"
          maxLength={100}
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={describe("name")}
        />,
      )}
      {field(
        "email",
        "Email",
        <input
          id="enq-email"
          name="email"
          type="email"
          autoComplete="email"
          maxLength={254}
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={describe("email", true)}
        />,
        "Email or mobile, whichever you prefer.",
      )}
      {field(
        "phone",
        "Mobile number",
        <input
          id="enq-phone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          maxLength={20}
          aria-invalid={errors.phone ? true : undefined}
          aria-describedby={describe("phone")}
        />,
      )}
      {field(
        "message",
        "Your question",
        <textarea
          id="enq-message"
          name="message"
          rows={5}
          maxLength={2000}
          aria-invalid={errors.message ? true : undefined}
          aria-describedby={describe("message")}
        />,
      )}
      <div className={s.field}>
        <label className={s.consent}>
          <input
            type="checkbox"
            name="consent"
            aria-invalid={errors.consent ? true : undefined}
            aria-describedby={describe("consent")}
          />
          Sanéa Pret may contact me about this question. We use your details
          only to reply.
        </label>
        {errors.consent ? (
          <span id="enq-consent-error" className={s.error}>
            {errors.consent}
          </span>
        ) : null}
      </div>
      {/* Honeypot: hidden from people and screen readers. */}
      <div aria-hidden="true" className={s.trap}>
        <label>
          Website <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <div aria-live="polite">
        {state === "failed" ? (
          <p className={s.error}>
            Your message was not sent. Try again in a moment.
          </p>
        ) : null}
        {state === "limited" ? (
          <p className={s.error}>
            We have had several messages from you. Try again later, or message
            us on WhatsApp.
          </p>
        ) : null}
      </div>
      <button type="submit" className={s.button} disabled={state === "sending"}>
        {state === "sending" ? "Sending…" : "Send"}
      </button>
    </form>
  );
}
