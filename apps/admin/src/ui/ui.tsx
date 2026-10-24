import {
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

import { ApiError } from "../api.ts";
import s from "./ui.module.css";

type Variant = "primary" | "secondary" | "quiet" | "danger";

export function Button({
  variant = "primary",
  busy = false,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  busy?: boolean;
}) {
  const cls = [
    s.button,
    variant !== "primary" ? s[variant] : "",
    className ?? "",
  ]
    .join(" ")
    .trim();
  return (
    <button
      type="button"
      {...rest}
      className={cls}
      disabled={rest.disabled || busy}
      aria-busy={busy || undefined}
    >
      {children}
    </button>
  );
}

type FieldProps = {
  label: string;
  hint?: string;
  error?: string | undefined;
  required?: boolean;
};

function useFieldIds(hint?: string, error?: string) {
  const id = useId();
  const describedBy =
    [hint ? `${id}-hint` : "", error ? `${id}-error` : ""]
      .filter(Boolean)
      .join(" ") || undefined;
  return { id, describedBy };
}

function FieldShell({
  id,
  label,
  hint,
  error,
  required,
  children,
}: FieldProps & { id: string; children: ReactNode }) {
  return (
    <div className={s.field}>
      <label className={s.label} htmlFor={id}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      {children}
      {hint ? (
        <span id={`${id}-hint`} className={s.hint}>
          {hint}
        </span>
      ) : null}
      {error ? (
        <span id={`${id}-error`} className={s.error}>
          {error}
        </span>
      ) : null}
    </div>
  );
}

export function TextField({
  label,
  hint,
  error,
  required,
  ...rest
}: FieldProps & InputHTMLAttributes<HTMLInputElement>) {
  const { id, describedBy } = useFieldIds(hint, error);
  return (
    <FieldShell
      id={id}
      label={label}
      hint={hint}
      error={error}
      required={required}
    >
      <input
        id={id}
        className={s.input}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...rest}
      />
    </FieldShell>
  );
}

export function TextArea({
  label,
  hint,
  error,
  required,
  ...rest
}: FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { id, describedBy } = useFieldIds(hint, error);
  return (
    <FieldShell
      id={id}
      label={label}
      hint={hint}
      error={error}
      required={required}
    >
      <textarea
        id={id}
        className={s.input}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...rest}
      />
    </FieldShell>
  );
}

export function Select({
  label,
  hint,
  error,
  required,
  children,
  ...rest
}: FieldProps & SelectHTMLAttributes<HTMLSelectElement>) {
  const { id, describedBy } = useFieldIds(hint, error);
  return (
    <FieldShell
      id={id}
      label={label}
      hint={hint}
      error={error}
      required={required}
    >
      <select
        id={id}
        className={s.input}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...rest}
      >
        {children}
      </select>
    </FieldShell>
  );
}

/** Focused on appearance so keyboard and screen-reader users land on it. */
export function ErrorSummary({
  error,
  title = "There is a problem",
}: {
  error: unknown;
  title?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) ref.current?.focus();
  }, [error]);
  if (!error) return null;
  const message =
    error instanceof ApiError
      ? describe(error)
      : "Something went wrong. Try again.";
  const fields =
    error instanceof ApiError ? Object.entries(error.fieldErrors()) : [];
  return (
    <div ref={ref} className={s.summary} role="alert" tabIndex={-1}>
      <h2>{title}</h2>
      <p>{message}</p>
      {fields.length > 0 ? (
        <ul>
          {fields.map(([path, msg]) => (
            <li key={path}>
              {path || "Request"}: {msg}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

const REASONS: Record<string, string> = {
  CATEGORY_NOT_PUBLISHED: "Publish the product's category first.",
  NO_ACTIVE_VARIANT: "Add at least one active variant (colour and size).",
  NO_PRIMARY_IMAGE: "Add a primary image with alt text.",
  IN_USE: "It is still in use, for example by products or child categories.",
  CATEGORY_CYCLE: "A category cannot sit inside its own child.",
  DUPLICATE: "Something with the same value already exists.",
};

function describe(e: ApiError): string {
  const d = e.details as
    { reasons?: string[]; reason?: string; fields?: string[] } | undefined;
  if (d?.reasons) return d.reasons.map((r) => REASONS[r] ?? r).join(" ");
  if (d?.reason) return REASONS[d.reason] ?? e.message;
  if (d?.fields) return `That ${d.fields.join(", ")} is already used.`;
  return e.message;
}

export function Notice({ children }: { children: ReactNode }) {
  return (
    <p className={s.notice} role="status">
      {children}
    </p>
  );
}

export function Status({ value }: { value: string }) {
  const label =
    value === "PUBLISHED"
      ? "Published"
      : value === "ARCHIVED"
        ? "Archived"
        : "Draft";
  return (
    <span className={s.status} data-status={value}>
      {label}
    </span>
  );
}

export { s as ui };
