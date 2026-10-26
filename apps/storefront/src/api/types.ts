// Response shapes of the public API used by the storefront
// (api-specification.md §3, §6). The cart types come from @sanea/shared.
import type {
  PageRichText,
  RichText,
  VariantAvailability,
} from "@sanea/shared";

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

export type Facets = {
  sizes: { label: string; count: number }[];
  colours: { slug: string; name: string; swatchHex: string; count: number }[];
  categories: { slug: string; name: string; count: number }[];
  priceBands: { minPaise: number; maxPaise: number | null; count: number }[];
};

export type Listing = {
  items: ProductSummary[];
  facets?: Facets;
  nextCursor: string | null;
};

export type CategoryNode = {
  name: string;
  slug: string;
  seoTitle: string | null;
  seoDescription: string | null;
  children: CategoryNode[];
};

export type Collection = {
  name: string;
  slug: string;
  description: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  heroImage: Image | null;
};

export type Suggestions = {
  categories: { slug: string; name: string }[];
  products: { slug: string; name: string }[];
};

export type ProductImage = Image & {
  colourId: string | null;
  role: string;
  position: number;
};

export type SizeChart = {
  name: string;
  unit: "CM" | "IN";
  rows: { size: string; measurements: Record<string, number> }[];
};

export type ProductDetail = {
  id: string;
  slug: string;
  name: string;
  shortDescription?: string;
  description?: RichText;
  fabric?: string | null;
  care?: string | null;
  fit?: string | null;
  category?: { name: string; slug: string };
  sizeChart?: SizeChart | null;
  labels?: string[];
  seoTitle?: string | null;
  seoDescription?: string | null;
  images?: ProductImage[];
  colours: { id: string; slug?: string; name: string; swatchHex: string }[];
  sizes: { id: string; label: string }[];
  variants: ({
    id: string;
    colourId: string;
    sizeId: string;
    sku?: string;
    pricePaise: number;
    compareAtPricePaise?: number | null;
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

// ─── Checkout and orders (Phase 15) ─────────────────────────────────────────

export type CodIneligible =
  "COD_DISABLED" | "OVER_LIMIT" | "PIN_CODE_EXCLUDED" | "REFUSAL_LIMIT";

/** `POST /checkout/quote`: the server's prices for the bag; no side effects. */
export type Quote = {
  subtotalPaise: number;
  discountPaise: number;
  shippingPaise: number;
  codFeePaise: number;
  taxPaise: number;
  totalPaise: number;
  currency: "INR";
  cod: { available: true } | { available: false; reason: CodIneligible };
  deliveryEstimate: string | null;
  paymentMethods: { PREPAID: boolean; COD: boolean };
};

export type OrderStatus =
  | "PENDING_PAYMENT"
  | "PENDING_CONFIRMATION"
  | "CONFIRMED"
  | "PACKED"
  | "SHIPPED"
  | "DELIVERED"
  | "CANCELLED"
  | "RETURN_TO_ORIGIN"
  | "RETURN_REQUESTED"
  | "RETURNED";

/** The placement answer and `GET /checkout/orders/:orderNumber/status`. */
export type OrderView = {
  order: {
    orderNumber: string;
    status: OrderStatus;
    paymentMethod: "PREPAID" | "COD";
    placedAt: string;
    email: string;
    shipTo: { fullName: string; city: string; pinCode: string };
    items: {
      productName: string;
      variantLabel: string;
      quantity: number;
      unitPricePaise: number;
      lineTotalPaise: number;
    }[];
    subtotalPaise: number;
    discountPaise: number;
    shippingPaise: number;
    codFeePaise: number;
    taxPaise: number;
    totalPaise: number;
    currency: "INR";
    payBy: string | null;
  };
  payment: {
    method: "PREPAID" | "COD";
    status: string;
    clientPayload: { provider: string; payPath: string } | null;
  } | null;
};
