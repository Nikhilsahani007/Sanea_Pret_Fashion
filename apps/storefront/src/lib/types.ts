// Response shapes of the public API (apps/api/src/modules/catalogue, content, cart).
export type Img = {
  url: string;
  width: number;
  height: number;
  avifSrcset: string;
  webpSrcset: string;
  alt?: string;
};
export type ProductSummary = {
  id: string;
  slug: string;
  name: string;
  fromPricePaise: number;
  compareAtPricePaise: number | null;
  priceVaries: boolean;
  currency: "INR";
  labels: string[];
  availability: "IN_STOCK" | "SOLD_OUT";
  colours: { slug: string; name: string; swatchHex: string }[];
  sizes: string[];
  image: (Img & { alt: string }) | null;
  hoverImage: (Img & { alt: string }) | null;
};
export type Facets = {
  sizes: { label: string; count: number }[];
  colours: { slug: string; name: string; swatchHex: string; count: number }[];
  categories: { slug: string; name: string; count: number }[];
  priceBands: {
    key: string;
    minPaise: number;
    maxPaise: number | null;
    count: number;
  }[];
};
export type Listing = {
  items: ProductSummary[];
  nextCursor: string | null;
  total: number;
  facets: Facets;
};
export type Link = { label: string; href: string };
export type Home = {
  announcement: { text: string; href: string | null } | null;
  hero: {
    id: string;
    desktop: Img;
    mobile: Img | null;
    alt: string;
    campaignLine: string;
    ctaLabel: string;
    ctaHref: string | null;
    focalX: number;
    focalY: number;
  }[];
  pills: Link[];
  newIns: {
    title: string;
    items: ProductSummary[];
    viewAllHref: string | null;
  } | null;
  secondRow: {
    title: string;
    items: ProductSummary[];
    viewAllHref: string | null;
  } | null;
  tabbed: {
    title: string | null;
    tabs: { label: string; items: ProductSummary[] }[];
  } | null;
  footer: { groups: { title: string; links: Link[] }[]; social: Link[] } | null;
};
export type Settings = {
  whatsappNumber: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  businessAddress: string | null;
};
export type CartLine = {
  variantId: string;
  sku: string;
  productSlug: string;
  productName: string;
  colour: string;
  size: string;
  quantity: number;
  unitPricePaise: number;
  compareAtPricePaise: number | null;
  lineTotalPaise: number;
  availability: string;
  warning:
    | null
    | { code: "UNAVAILABLE" }
    | { code: "SOLD_OUT" }
    | { code: "ONLY_N_LEFT"; available: number };
  image: (Img & { alt: string }) | null;
};
export type Cart = {
  lines: CartLine[];
  itemCount: number;
  subtotalPaise: number;
  currency: "INR";
  readyForCheckout: boolean;
};

export type CodIneligible =
  "COD_DISABLED" | "OVER_LIMIT" | "PIN_CODE_EXCLUDED" | "REFUSAL_LIMIT";

export type Quote = {
  cart: Cart;
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
