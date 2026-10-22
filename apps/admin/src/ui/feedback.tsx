// Notices, the error summary, page headers and the shared page states
// (loading, error, forbidden, not found, empty). phase-8-ui-plan.md §3.3.
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

import type { ApiError, FieldErrors } from "../api/client.ts";
import type { Status } from "../api/types.ts";
import { Button } from "./controls.tsx";
import s from "./ui.module.css";

type Gap = { gap?: string; className?: string; children: ReactNode };
const gapStyle = (gap?: string) =>
  gap ? ({ "--gap": `var(--sp-space-${gap})` } as CSSProperties) : undefined;

export function Stack({ gap, className, children }: Gap) {
  return (
    <div className={`${s.stack} ${className ?? ""}`} style={gapStyle(gap)}>
      {children}
    </div>
  );
}

export function Cluster({ gap, className, children }: Gap) {
  return (
    <div className={`${s.cluster} ${className ?? ""}`} style={gapStyle(gap)}>
      {children}
    </div>
  );
}

export function Grid({ children }: { children: ReactNode }) {
  return <div className={s.grid}>{children}</div>;
}

export function Panel({
  title,
  children,
  actions,
}: {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  const id = `panel-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <section className={s.panel} aria-labelledby={id}>
      <div className={`${s["page-header"]} ${s["panel-title"]}`}>
        <h2 id={id}>{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

/**
 * The page's h1. It takes focus when the page opens, so screen-reader and
 * keyboard users start at the new content after navigation (WCAG 2.4.3).
 */
export function PageHeader({
  title,
  children,
  description,
}: {
  title: string;
  children?: ReactNode;
  description?: ReactNode;
}) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    ref.current?.focus();
    document.title = `${title} · Sanéa Pret Admin`;
  }, [title]);
  return (
    <div className={s["page-header"]}>
      <Stack gap="1">
        <h1 ref={ref} tabIndex={-1} className={s["page-title"]}>
          {title}
        </h1>
        {description ? <p className={s.muted}>{description}</p> : null}
      </Stack>
      {children ? <Cluster>{children}</Cluster> : null}
    </div>
  );
}

export function Notice({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "error" | "success";
  title?: string;
  children?: ReactNode;
}) {
  // Errors interrupt (alert); confirmations are polite (status).
  return (
    <div
      className={`${s.notice} ${s[`notice-${tone}`]}`}
      role={tone === "error" ? "alert" : "status"}
    >
      {title ? <p className={s["notice-title"]}>{title}</p> : null}
      {children}
    </div>
  );
}

/**
 * After a failed submit: a focused summary linking each problem to its field
 * (ui-ux-pro-max `error-summary`, `focus-management`); fields keep their own
 * inline errors.
 */
export function ErrorSummary({
  error,
  fields = {},
  labels = {},
  idPrefix = "",
}: {
  error: ApiError | null;
  fields?: FieldErrors;
  labels?: Record<string, string>;
  idPrefix?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) ref.current?.focus();
  }, [error]);
  if (!error) return null;
  const entries = Object.entries(fields);
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="alert"
      className={`${s.notice} ${s["notice-error"]}`}
    >
      <p className={s["notice-title"]}>{error.message}</p>
      {entries.length ? (
        <ul>
          {entries.map(([key, message]) => (
            <li key={key}>
              <a href={`#${idPrefix}${key}`}>
                {labels[key] ? `${labels[key]}: ` : ""}
                {message}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

const STATUS_TEXT: Record<Status, string> = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
  ARCHIVED: "Archived",
};

export function StatusChip({ status }: { status: Status }) {
  return (
    <span className={`${s.chip} ${s[`chip-${status}`] ?? ""}`}>
      {STATUS_TEXT[status]}
    </span>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <p className={`${s.state} ${s.muted}`} role="status">
      {label}
    </p>
  );
}

export function ErrorState({
  error,
  onRetry,
}: {
  error: ApiError;
  onRetry?: () => void;
}) {
  if (error.status === 403)
    return (
      <Notice tone="error" title="You do not have access to this">
        <p>
          Your role cannot open this screen. Ask the Owner if you need access.
        </p>
      </Notice>
    );
  if (error.status === 404)
    return (
      <Notice tone="error" title="Not found">
        <p>This item does not exist or was removed.</p>
      </Notice>
    );
  return (
    <Notice tone="error" title="This could not be loaded">
      <Stack gap="3">
        <p>{error.message}</p>
        {error.requestId ? (
          <p className={s.hint}>Reference: {error.requestId}</p>
        ) : null}
        {onRetry ? (
          <div>
            <Button variant="secondary" size="small" onClick={onRetry}>
              Try again
            </Button>
          </div>
        ) : null}
      </Stack>
    </Notice>
  );
}

/**
 * A table that may scroll sideways on narrow screens: a named, focusable
 * region so keyboard users can scroll it too (WCAG 2.1.1).
 */
export function TableRegion({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div
      className={s["table-wrap"]}
      role="region"
      aria-label={label}
      tabIndex={0}
    >
      {children}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className={`${s.state} ${s.muted}`}>{children}</div>;
}

export { s as ui };
