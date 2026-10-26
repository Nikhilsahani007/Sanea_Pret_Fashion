// /products/:slug (phase-13-plan.md §2; UF-3, UF-4). The gallery follows the
// chosen colour; sizes show their public stock state (D-082); the choice is
// kept in the address (?colour=<slug>&size=<label>) so it can be shared.
// Nothing is added to the bag until a size is chosen. "Enquire" opens the
// enquiry form; "Ask on WhatsApp" appears only once the Owner has set a
// number (OD-16) and logs an anonymous click. Delivery and returns text is
// not written here: it waits for the policies (OD-08, OD-09).
import { whatsAppLink, type PublicSettings } from "@sanea/shared";
import { useEffect, useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router";

import { api } from "../api/client.ts";
import type { ProductDetail, ProductImage } from "../api/types.ts";
import { useCart } from "../cart/CartProvider.tsx";
import { rupees } from "../lib/format.ts";
import { useResource } from "../lib/resource.ts";
import { RichContent } from "../pages/ContentPage.tsx";
import { NotFound } from "../shell/NotFound.tsx";
import { Picture } from "../ui/Picture.tsx";
import { Sheet } from "../ui/Sheet.tsx";
import ui from "../ui/ui.module.css";
import { EnquiryForm } from "./EnquiryForm.tsx";
import s from "./product.module.css";

/** An anonymous id for this browser session only (system-design.md §9). */
function sessionId(): string {
  const KEY = "sp_wa_session";
  try {
    const existing = sessionStorage.getItem(KEY);
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    sessionStorage.setItem(KEY, fresh);
    return fresh;
  } catch {
    return crypto.randomUUID();
  }
}

export function ProductPage() {
  const slug = useParams().slug ?? "";
  const product = useResource<ProductDetail>(
    (signal) => api.get(`/catalogue/products/${slug}`, signal),
    [slug],
  );
  if (product.status === "loading")
    return (
      <div className={s.loading} aria-busy="true">
        <span className="visually-hidden">Loading</span>
      </div>
    );
  if (product.status === "error")
    return product.error.status === 404 ? (
      <NotFound />
    ) : (
      <div role="alert" className={s.problem}>
        <p>{product.error.message}</p>
        <button type="button" className={ui.button} onClick={product.reload}>
          Try again
        </button>
      </div>
    );
  return <Product key={slug} p={product.data} />;
}

function Product({ p }: { p: ProductDetail }) {
  const [params, setParams] = useSearchParams();
  const here = useLocation();
  const { add, busy, error, openDrawer } = useCart();
  const settings = useResource<PublicSettings>(
    (signal) => api.get("/content/settings/public", signal),
    [],
  );
  const [sheet, setSheet] = useState<"enquiry" | "sizes" | null>(null);
  const [shown, setShown] = useState(0);

  const colourParam = params.get("colour");
  const colour =
    p.colours.find((c) => c.slug === colourParam) ??
    (p.colours.length === 1 ? p.colours[0] : undefined);
  const sizeParam = params.get("size");
  const size = colour ? p.sizes.find((z) => z.label === sizeParam) : undefined;
  const variantFor = (sizeId: string) =>
    p.variants.find((v) => v.colourId === colour?.id && v.sizeId === sizeId);
  const chosen = size ? variantFor(size.id) : undefined;
  const available = chosen && chosen.availability !== "SOLD_OUT";

  useEffect(() => {
    document.title = `${p.seoTitle ?? p.name} · Sanéa Pret`;
  }, [p]);

  // The address always reads ?colour=<slug>&size=<label>, in that order. A
  // product's only colour is chosen for the shopper and written too, so a
  // shared link opens on the same variant.
  const choose = (next: { colour?: string; size?: string | null }) => {
    const nextColour = next.colour ?? colour?.slug;
    const nextSize =
      next.colour !== undefined ? null : (next.size ?? size?.label ?? null);
    const q = new URLSearchParams();
    if (nextColour) q.set("colour", nextColour);
    if (nextSize) q.set("size", nextSize);
    if (next.colour !== undefined) setShown(0);
    setParams(q, { replace: true });
  };

  // The gallery: this colour's pictures and those for every colour.
  const images: ProductImage[] = (p.images ?? []).filter(
    (i) => i.colourId === null || !colour || i.colourId === colour.id,
  );
  const main = images[shown] ?? images[0];
  const price = chosen?.pricePaise ?? null;
  const from = Math.min(...p.variants.map((v) => v.pricePaise));
  const whatsApp = settings.status === "ready" ? settings.data.whatsApp : null;
  const pageUrl = `${location.origin}/products/${p.slug}${
    colour
      ? `?colour=${colour.slug ?? ""}${size ? `&size=${encodeURIComponent(size.label)}` : ""}`
      : ""
  }`;

  return (
    <article className={s.product} aria-labelledby="product-title">
      <nav aria-label="Breadcrumb" className={s.crumbs}>
        <ol>
          <li>
            <Link to="/shop">Shop all</Link>
          </li>
          {p.category ? (
            <li>
              <Link to={`/shop/${p.category.slug}`}>{p.category.name}</Link>
            </li>
          ) : null}
        </ol>
      </nav>
      <div className={s.layout}>
        <div className={s.gallery}>
          <div className={s.mainImage}>
            {main ? (
              <Picture
                key={main.url}
                image={main}
                sizes="(min-width: 64rem) 55vw, 100vw"
                eager
              />
            ) : null}
          </div>
          {images.length > 1 ? (
            <ul className={s.thumbs} aria-label="More pictures">
              {images.map((img, i) => (
                <li key={`${img.url}-${i}`}>
                  <button
                    type="button"
                    className={s.thumb}
                    aria-label={`Show picture ${i + 1} of ${images.length}`}
                    aria-current={i === shown ? "true" : undefined}
                    onClick={() => setShown(i)}
                  >
                    <Picture image={{ ...img, alt: "" }} sizes="6rem" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className={s.info}>
          <h1 id="product-title" className={s.name}>
            {p.name}
          </h1>
          <p className={`${s.price} tabular`}>
            {price !== null ? (
              <>
                {rupees(price)}
                {chosen?.compareAtPricePaise ? (
                  <>
                    {" "}
                    <s className={s.was}>
                      <span className="visually-hidden">Was </span>
                      {rupees(chosen.compareAtPricePaise)}
                    </s>
                  </>
                ) : null}
              </>
            ) : (
              <>
                <span className={s.from}>From </span>
                {rupees(from)}
              </>
            )}
          </p>
          {p.shortDescription ? (
            <p className={s.short}>{p.shortDescription}</p>
          ) : null}
          <form
            className={s.choose}
            onSubmit={async (e) => {
              e.preventDefault();
              if (chosen && available && (await add(chosen.id, 1)))
                openDrawer();
            }}
          >
            <fieldset className={s.fieldset}>
              <legend>
                Colour
                {colour ? (
                  <span className={s.chosen}>: {colour.name}</span>
                ) : null}
              </legend>
              <div className={s.options}>
                {p.colours.map((c) => (
                  <label key={c.id} className={s.swatch}>
                    <input
                      type="radio"
                      name="colour"
                      value={c.slug ?? c.id}
                      checked={colour?.id === c.id}
                      onChange={() => choose({ colour: c.slug ?? c.id })}
                    />
                    <span
                      className={s.chip}
                      style={{ backgroundColor: c.swatchHex }}
                      aria-hidden="true"
                    />
                    {c.name}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className={s.fieldset} disabled={!colour}>
              <legend>Size</legend>
              {!colour ? (
                <p className={s.hint}>Choose a colour first.</p>
              ) : null}
              <div className={s.options}>
                {p.sizes.map((z) => {
                  const v = colour ? variantFor(z.id) : undefined;
                  const soldOut = !v || v.availability === "SOLD_OUT";
                  return (
                    <button
                      key={z.id}
                      type="button"
                      className={s.size}
                      aria-pressed={size?.id === z.id}
                      aria-label={soldOut ? `${z.label}, sold out` : z.label}
                      disabled={soldOut}
                      onClick={() => choose({ size: z.label })}
                    >
                      {z.label}
                    </button>
                  );
                })}
              </div>
              {chosen?.availability === "LOW_STOCK" ? (
                <p className={s.hint}>Only {chosen.remaining} left</p>
              ) : null}
            </fieldset>
            <button
              type="button"
              className={s.textButton}
              onClick={() => setSheet("sizes")}
            >
              Size guide
            </button>
            {error ? <p role="alert">{error.message}</p> : null}
            <button
              type="submit"
              className={ui.button}
              disabled={!available || busy}
            >
              {available
                ? `Add to bag · ${rupees(chosen.pricePaise)}`
                : "Choose a size"}
            </button>
          </form>
          <div className={s.ask}>
            <button
              type="button"
              className={s.textButton}
              onClick={() => setSheet("enquiry")}
            >
              Enquire about this piece
            </button>
            {whatsApp ? (
              <a
                className={s.textButton}
                href={whatsAppLink(whatsApp.number, {
                  product: p.name,
                  sku: chosen?.sku ?? null,
                  colour: colour?.name,
                  size: size?.label,
                  url: pageUrl,
                })}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  // Fire and forget: the chat opens whatever happens here.
                  void api
                    .post("/events/whatsapp-click", {
                      productId: p.id,
                      ...(chosen ? { variantId: chosen.id } : {}),
                      pagePath: `${here.pathname}${here.search}`.slice(0, 300),
                      sessionId: sessionId(),
                    })
                    .catch(() => undefined);
                }}
              >
                Ask on WhatsApp
                <span className="visually-hidden"> (opens WhatsApp)</span>
              </a>
            ) : null}
            {whatsApp?.hours ? (
              <p className={s.hint}>WhatsApp replies: {whatsApp.hours}</p>
            ) : null}
          </div>
          <Details p={p} />
        </div>
      </div>
      <Sheet
        open={sheet === "enquiry"}
        onClose={() => setSheet(null)}
        title="Enquire"
      >
        <EnquiryForm
          productId={p.id}
          variantId={chosen?.id}
          productName={[
            p.name,
            colour?.name,
            size ? `size ${size.label}` : null,
          ]
            .filter(Boolean)
            .join(", ")}
          onDone={() => setSheet(null)}
        />
      </Sheet>
      <Sheet
        open={sheet === "sizes"}
        onClose={() => setSheet(null)}
        title="Size guide"
      >
        <SizeGuide p={p} />
      </Sheet>
    </article>
  );
}

function Details({ p }: { p: ProductDetail }) {
  const facts = [
    ["Fabric", p.fabric],
    ["Fit", p.fit],
    ["Care", p.care],
  ].filter((f): f is [string, string] => Boolean(f[1]));
  const description = p.description?.content ?? [];
  if (!facts.length && !description.length) return null;
  return (
    <section className={s.details} aria-labelledby="details-title">
      <h2 id="details-title" className={s.detailsTitle}>
        Details
      </h2>
      {description.length ? (
        <div className={s.description}>
          <RichContent blocks={description} />
        </div>
      ) : null}
      {facts.length ? (
        <dl className={s.facts}>
          {facts.map(([term, value]) => (
            <div key={term}>
              <dt>{term}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  );
}

function SizeGuide({ p }: { p: ProductDetail }) {
  const chart = p.sizeChart;
  if (!chart || chart.rows.length === 0)
    return (
      <p>
        This piece has no size chart yet. Ask us about measurements using
        “Enquire”, or see the <Link to="/pages/size-guide">size guide</Link>.
      </p>
    );
  const measures = [
    ...new Set(chart.rows.flatMap((r) => Object.keys(r.measurements))),
  ];
  const unit = chart.unit === "CM" ? "cm" : "inches";
  return (
    <div className={s.chart}>
      <table>
        <caption>
          {chart.name}, in {unit}
        </caption>
        <thead>
          <tr>
            <th scope="col">Size</th>
            {measures.map((m) => (
              <th key={m} scope="col">
                {m}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {chart.rows.map((r) => (
            <tr key={r.size}>
              <th scope="row">{r.size}</th>
              {measures.map((m) => (
                <td key={m} className="tabular">
                  {r.measurements[m] ?? "–"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
