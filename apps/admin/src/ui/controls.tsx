// Buttons and form fields. Every field has a visible label; its hint and error
// are linked with aria-describedby, and an invalid field sets aria-invalid.
import {
  useId,
  type ButtonHTMLAttributes,
  type ComponentProps,
  type ReactNode,
} from "react";

import s from "./ui.module.css";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "quiet";
  size?: "normal" | "small";
  /** While true the button is disabled and shows `busyLabel`. */
  busy?: boolean;
  busyLabel?: string;
};

export function Button({
  variant = "primary",
  size = "normal",
  busy = false,
  busyLabel,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {
  const classes = [
    s.button,
    variant !== "primary" ? s[variant] : "",
    size === "small" ? s.small : "",
    className ?? "",
  ].join(" ");
  return (
    <button
      {...rest}
      type={type}
      className={classes}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
    >
      {busy ? (busyLabel ?? "Working…") : children}
    </button>
  );
}

type FieldShell = {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | undefined;
  optional?: boolean;
};

function useFieldIds(id: string | undefined) {
  const auto = useId();
  const base = id ?? `f${auto.replace(/:/g, "")}`;
  return { id: base, hint: `${base}-hint`, error: `${base}-error` };
}

function describedBy(
  ids: { hint: string; error: string },
  hint: unknown,
  error: unknown,
  extra?: string,
) {
  const parts = [
    extra ?? "",
    hint ? ids.hint : "",
    error ? ids.error : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" ") : undefined;
}

function Shell({
  ids,
  label,
  hint,
  error,
  optional,
  children,
}: FieldShell & { ids: ReturnType<typeof useFieldIds>; children: ReactNode }) {
  return (
    <div className={s.field}>
      <label htmlFor={ids.id} className={s.label}>
        {label}
        {optional ? <span className={s.optional}> (optional)</span> : null}
      </label>
      {hint ? (
        <p id={ids.hint} className={s.hint}>
          {hint}
        </p>
      ) : null}
      {children}
      {error ? (
        <p id={ids.error} className={s.error}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function TextField({
  label,
  hint,
  error,
  optional,
  id,
  className,
  ...rest
}: FieldShell & ComponentProps<"input">) {
  const ids = useFieldIds(id);
  return (
    <Shell
      ids={ids}
      label={label}
      hint={hint}
      error={error}
      optional={optional}
    >
      <input
        {...rest}
        id={ids.id}
        className={`${s.control} ${error ? s.invalid : ""} ${className ?? ""}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(
          ids,
          hint,
          error,
          rest["aria-describedby"],
        )}
        required={rest.required ?? !optional}
      />
    </Shell>
  );
}

export function TextArea({
  label,
  hint,
  error,
  optional,
  id,
  ...rest
}: FieldShell & ComponentProps<"textarea">) {
  const ids = useFieldIds(id);
  return (
    <Shell
      ids={ids}
      label={label}
      hint={hint}
      error={error}
      optional={optional}
    >
      <textarea
        {...rest}
        id={ids.id}
        className={`${s.control} ${error ? s.invalid : ""}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(
          ids,
          hint,
          error,
          rest["aria-describedby"],
        )}
        required={rest.required ?? !optional}
      />
    </Shell>
  );
}

export function SelectField({
  label,
  hint,
  error,
  optional,
  id,
  children,
  ...rest
}: FieldShell & ComponentProps<"select">) {
  const ids = useFieldIds(id);
  return (
    <Shell
      ids={ids}
      label={label}
      hint={hint}
      error={error}
      optional={optional}
    >
      <select
        {...rest}
        id={ids.id}
        className={`${s.control} ${error ? s.invalid : ""}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(
          ids,
          hint,
          error,
          rest["aria-describedby"],
        )}
        required={rest.required ?? !optional}
      >
        {children}
      </select>
    </Shell>
  );
}

export function Checkbox({
  label,
  hint,
  id,
  ...rest
}: {
  label: ReactNode;
  hint?: ReactNode;
} & ComponentProps<"input">) {
  const ids = useFieldIds(id);
  return (
    <div className={s.field}>
      <div className={s.check}>
        <input
          {...rest}
          type="checkbox"
          id={ids.id}
          aria-describedby={hint ? ids.hint : undefined}
        />
        <label htmlFor={ids.id}>{label}</label>
      </div>
      {hint ? (
        <p id={ids.hint} className={s.hint}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
