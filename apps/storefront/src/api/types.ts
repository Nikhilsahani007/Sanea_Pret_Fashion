// Response shapes of the public API used by the storefront
// (api-specification.md §3, §6). The cart types come from @sanea/shared.
import type { PageRichText, VariantAvailability } from "@sanea/shared";

export type MenuLink = { label: string; href: string };

export type Navigation = {
  menus: Partial<
    Record<
      | "HEADER"
      | "CATEGORY_PILLS"
      | "FOOTER_SHOP"
      | "FOOTER_HELP"
      | "FOOTER_ABOUT",
      MenuLink[]
    >
  >;
  footer: {
    contact?: {
      addressLines?: string[];
      hours?: string;
      phone?: string;
      email?: string;
    };
    social?: { network: string; url: string }[];
  } | null;
};

export type ProductRow = { title: string; items: ProductSummary[] };

export type HeroSlide = {
  desktopImage: Image;
  mobileImage: Image;
  campaignLine: string | null;
  ctaLabel: string;
  href: string;
  focalPoint: { x: number; y: number } | null;
};

/** `GET /content/home`: published blocks only (Phase 10, D-093). */
export type Home = {
  announcement: { text: string; href: string | null } | null;
  hero?: { slides: HeroSlide[] };
  newIns?: ProductRow | null;
  row2?: ProductRow | null;
  tabbedGrid?: { tabs: { label: string; items: ProductSummary[] }[] } | null;
};

export type Image = {
  url: string | null;
  width: number;
  height: number;
  alt: string;
  sources: { format: string; width: number; height: number; url: string }[];
};

export type ProductSummary = {
  id: string;
  slug: string;
  name: string;
  fromPricePaise: number;
  currency: "INR";
  labels: string[];
  colours: { name: string; swatchHex: string }[];
  soldOut: boolean;
  primaryImage: Image | null;
};

export type Listing = {
  items: ProductSummary[];
  nextCursor: string | null;
};

export type Suggestions = {
  categories: { slug: string; name: string }[];
  products: { slug: string; name: string }[];
};

export type ProductDetail = {
  id: string;
  slug: string;
  name: string;
  colours: { id: string; name: string; swatchHex: string }[];
  sizes: { id: string; label: string }[];
  variants: ({
    id: string;
    colourId: string;
    sizeId: string;
    pricePaise: number;
  } & VariantAvailability)[];
};

export type PageBody = {
  type: "doc";
  content: (
    | Exclude<PageRichText["content"][number], { type: "image" }>
    | { type: "image"; image: Image; caption: string | null }
  )[];
};

export type PublicPage = {
  slug: string;
  title: string;
  seoTitle: string | null;
  seoDescription: string | null;
  body: PageBody;
};
