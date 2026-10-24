// Product detail (index Phase 13, api-specification.md §6): gallery by
// colour, colour and size selection with per-variant stock, deep links
// (?colour=&size=), size guide, details, add to bag, website enquiry and
// "Ask on WhatsApp" with an anonymous click log.
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Link, useParams, useSearchParams } from "react-router";

import { EnquiryForm } from "../components/EnquiryForm.tsx";
import { CloseIcon } from "../components/Icons.tsx";
import { openBag } from "../components/Layout.tsx";
import { RichText } from "../components/RichText.tsx";
import { ColourPicker, SizeButtons } from "../components/SizePicker.tsx";
import drawer from "../components/Drawer.module.css";
import { ApiError, get, send } from "../lib/api.ts";
import { useCartActions, useSettings } from "../lib/hooks.ts";
import { inr } from "../lib/money.ts";
import {
  defaultColour,
  variantFor,
  type ProductDetail,
} from "../lib/product.ts";
import { anonymousSessionId } from "../lib/session.ts";
import { useTitle } from "../lib/title.ts";
import { whatsappHref } from "../lib/whatsapp.ts";
import { NotFound } from "./NotFound.tsx";
import s from "./Product.module.css";

const LABELS: Record<string, string> = { NEW: "New", LIMITED: "Limited" };

/** A modal sheet reused for the size guide and the enquiry form. */
function Sheet({
  title,
  open,
  onClose,
  children,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={drawer.drawer}
      aria-label={title}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      <div className={drawer.head}>
        <h2>{title}</h2>
        <button
          type="button"
          className={drawer.close}
          onClick={onClose}
          aria-label={`Close ${title.toLowerCase()}`}
        >
          <CloseIcon />
        </button>
      </div>
      <div className={drawer.body}>{children}</div>
    </dialog>
  );
}

export function Product() {
  const { slug } = useParams();
  const [params, setParams] = useSearchParams();
  const settings = useSettings();
  const { add } = useCartActions();
  const [sheet, setSheet] = useState<null | "size" | "enquiry">(null);
  const product = useQuery({
    queryKey: ["product", slug],
    queryFn: () =>
      get<{ product: ProductDetail }>(`/catalogue/products/${slug}`).then(
        (r) => r.product,
      ),
    retry: false,
  });
  const p = product.data;
  useTitle(p ? (p.seoTitle ?? p.name) : null);

  if (product.error instanceof ApiError && product.error.status === 404)
    return <NotFound />;
  if (product.isError)
    return (
      <p className={s.page} role="alert">
        This piece could not be loaded. Try again in a moment.
      </p>
    );
  if (!p)
    return (
      <p className={s.page} role="status">
        Loading…
      </p>
    );

  // Deep links: ?colour=<slug>&size=<label>.
  const colour =
    p.colours.find((c) => c.slug === params.get("colour")) ??
    p.colours.find((c) => c.id === defaultColour(p)) ??
    null;
  const size = p.sizes.find((z) => z.label === params.get("size")) ?? null;
  const variant =
    colour && size ? variantFor(p, colour.id, size.id) : undefined;
  const choose = (next: { colour?: string; size?: string | null }) =>
    setParams(
      (prev) => {
        const q = new URLSearchParams(prev);
        if (next.colour !== undefined) q.set("colour", next.colour);
        if (next.size === null) q.delete("size");
        else if (next.size !== undefined) q.set("size", next.size);
        return q;
      },
      { replace: true },
    );

  // Gallery: this colour's images, then the all-colour ones.
  const images = [
    ...p.images.filter((i) => i.colourId === colour?.id),
    ...p.images.filter((i) => i.colourId === null),
  ];
  const price = variant?.pricePaise ?? p.fromPricePaise;
  const compareAt = variant
    ? variant.compareAtPricePaise
    : p.compareAtPricePaise;
  const canAdd = variant && variant.availability !== "SOLD_OUT";
  const number = settings.data?.whatsappNumber;
  const pageUrl = `${window.location.origin}/products/${p.slug}${colour ? `?colour=${colour.slug}${size ? `&size=${encodeURIComponent(size.label)}` : ""}` : ""}`;

  function logWhatsApp() {
    // Fire and forget; the conversation itself happens in WhatsApp.
    void send("POST", "/events/whatsapp-click", {
      productId: p!.id,
      ...(variant ? { variantId: variant.id } : {}),
      pagePath: `/products/${p!.slug}${window.location.search}`,
      sessionId: anonymousSessionId(),
    }).catch(() => undefined);
  }

  return (
    <div
      className={s.page}
      style={{ "--swatch": colour?.swatchHex } as CSSProperties}
    >
      <nav aria-label="Breadcrumb">
        <ol className={s.crumbs}>
          <li>
            <Link to="/">Home</Link>
          </li>
          <li>
            <Link to={`/shop/${p.category.slug}`}>{p.category.name}</Link>
          </li>
          <li aria-current="page">{p.name}</li>
        </ol>
      </nav>
      <div className={s.layout}>
        {/* Focusable: on phones the gallery scrolls sideways, and keyboard
            users must be able to scroll it too (WCAG 2.1.1, axe). */}
        <ul
          className={s.gallery}
          tabIndex={0}
          aria-label={`Photographs of ${p.name}${colour ? ` in ${colour.name}` : ""}`}
        >
          {images.length === 0 ? (
            <li>
              <div className={s.blank}>Photograph to come</div>
            </li>
          ) : null}
          {images.map((img, i) => (
            <li key={`${img.url}-${i}`}>
              <picture>
                <source
                  type="image/avif"
                  srcSet={img.avifSrcset}
                  sizes={
                    i === 0
                      ? "(max-width: 56rem) 85vw, 55vw"
                      : "(max-width: 56rem) 85vw, 28vw"
                  }
                />
                <img
                  src={img.url}
                  srcSet={img.webpSrcset}
                  sizes={
                    i === 0
                      ? "(max-width: 56rem) 85vw, 55vw"
                      : "(max-width: 56rem) 85vw, 28vw"
                  }
                  alt={img.alt}
                  width={img.width}
                  height={img.height}
                  loading={i === 0 ? "eager" : "lazy"}
                  fetchPriority={i === 0 ? "high" : "auto"}
                />
              </picture>
            </li>
          ))}
        </ul>
        <div className={s.buy}>
          <div>
            {p.labels.map((l) => LABELS[l]).filter(Boolean).length ? (
              <p>
                {p.labels
                  .map((l) => LABELS[l])
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            ) : null}
            <h1 className={s.name}>{p.name}</h1>
          </div>
          <p className={s.price}>
            {inr(price)}
            {compareAt ? (
              <span className={s.was}>
                <span className="visually-hidden">was </span>
                {inr(compareAt)}
              </span>
            ) : null}
            <span className="visually-hidden">, including GST</span>
          </p>
          <p>{p.shortDescription}</p>
          <ColourPicker
            product={p}
            colourId={colour?.id ?? null}
            onChange={(id) =>
              choose({
                colour: p.colours.find((c) => c.id === id)!.slug,
                size: null,
              })
            }
          />
          <SizeButtons
            product={p}
            colourId={colour?.id ?? null}
            sizeId={size?.id ?? null}
            onChange={(id) =>
              choose({ size: p.sizes.find((z) => z.id === id)!.label })
            }
          />
          {p.sizeChart ? (
            <button
              type="button"
              className={s.textButton}
              onClick={() => setSheet("size")}
              aria-haspopup="dialog"
            >
              Size guide
            </button>
          ) : null}
          <div className={s.actions}>
            <button
              type="button"
              className={s.primary}
              disabled={!canAdd || add.isPending}
              onClick={() =>
                variant &&
                add.mutate(
                  { variantId: variant.id, quantity: 1 },
                  { onSuccess: openBag },
                )
              }
            >
              {!size
                ? "Choose a size"
                : canAdd
                  ? add.isPending
                    ? "Adding…"
                    : "Add to bag"
                  : "Sold out"}
            </button>
            {add.error ? (
              <p className={s.error} role="alert">
                {add.error instanceof ApiError &&
                add.error.code === "OUT_OF_STOCK"
                  ? "That size has just sold out."
                  : add.error instanceof ApiError &&
                      add.error.code === "CONFLICT"
                    ? "You already have the most we allow per order in your bag."
                    : "It could not be added. Try again."}
              </p>
            ) : null}
            <button
              type="button"
              className={s.secondary}
              onClick={() => setSheet("enquiry")}
              aria-haspopup="dialog"
            >
              Enquire
            </button>
            {number ? (
              <a
                className={s.secondary}
                href={whatsappHref(number, {
                  name: p.name,
                  sku: variant?.sku,
                  colour: colour?.name,
                  size: size?.label,
                  url: pageUrl,
                })}
                target="_blank"
                rel="noopener noreferrer"
                onClick={logWhatsApp}
              >
                Ask on WhatsApp
              </a>
            ) : null}
          </div>
          <section className={s.details} aria-labelledby="details-h">
            <h2 id="details-h" style={{ fontSize: "var(--sp-step-body)" }}>
              Details
            </h2>
            <RichText
              blocks={
                p.description.blocks as Parameters<typeof RichText>[0]["blocks"]
              }
            />
            {p.fabric || p.care || p.fit ? (
              <dl>
                {p.fabric ? (
                  <>
                    <dt>Fabric</dt>
                    <dd>{p.fabric}</dd>
                  </>
                ) : null}
                {p.fit ? (
                  <>
                    <dt>Fit</dt>
                    <dd>{p.fit}</dd>
                  </>
                ) : null}
                {p.care ? (
                  <>
                    <dt>Care</dt>
                    <dd>{p.care}</dd>
                  </>
                ) : null}
              </dl>
            ) : null}
            <p>
              Delivery and returns: see our{" "}
              <Link to="/policies/shipping">shipping</Link> and{" "}
              <Link to="/policies/returns">returns</Link> policies.
            </p>
          </section>
        </div>
      </div>
      {p.sizeChart ? (
        <Sheet
          title="Size guide"
          open={sheet === "size"}
          onClose={() => setSheet(null)}
        >
          <table className={s.chart}>
            <caption className="visually-hidden">
              {p.sizeChart.name}, in{" "}
              {p.sizeChart.unit === "CM" ? "centimetres" : "inches"}
            </caption>
            <thead>
              <tr>
                <th scope="col">Size</th>
                {Object.keys(p.sizeChart.rows[0]?.measurements ?? {}).map(
                  (m) => (
                    <th key={m} scope="col">
                      {m} ({p.sizeChart!.unit.toLowerCase()})
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {p.sizeChart.rows.map((r) => (
                <tr key={r.size}>
                  <th scope="row">{r.size}</th>
                  {Object.values(r.measurements).map((v, i) => (
                    <td key={i}>{v}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Sheet>
      ) : null}
      <Sheet
        title="Enquire"
        open={sheet === "enquiry"}
        onClose={() => setSheet(null)}
      >
        {sheet === "enquiry" ? (
          <EnquiryForm
            productId={p.id}
            {...(variant ? { variantId: variant.id } : {})}
            productName={`${p.name}${variant ? ` (${colour?.name}, ${size?.label})` : ""}`}
            onDone={() => setSheet(null)}
          />
        ) : null}
      </Sheet>
    </div>
  );
}
