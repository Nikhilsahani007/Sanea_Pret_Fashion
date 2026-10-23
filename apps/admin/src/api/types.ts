// Response shapes of the admin API used by this app (api-specification.md,
// apps/api/src/modules/catalogue/admin-router.ts). Dates arrive as ISO strings.
import type { AdminRole, RichText } from "@sanea/shared";

export type Admin = {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
};

export type Status = "DRAFT" | "PUBLISHED" | "ARCHIVED";

export type Category = {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  position: number;
  status: Status;
  seoTitle: string | null;
  seoDescription: string | null;
};

export type Collection = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: Status;
  startsAt: string | null;
  endsAt: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
};

export type CollectionDetail = Collection & {
  products: { productId: string; position: number }[];
};

export type Colour = {
  id: string;
  name: string;
  slug: string;
  swatchHex: string;
  position: number;
};

export type Size = { id: string; label: string; position: number };

export type SizeChart = {
  id: string;
  name: string;
  unit: "CM" | "IN";
  rows: { size: string; measurements: Record<string, number> }[];
};

export type ProductSummary = {
  id: string;
  name: string;
  slug: string;
  status: Status;
  publishedAt: string | null;
  categoryId: string;
  labels: string[];
  updatedAt: string;
  variantCount: number;
  imageCount: number;
};

export type Inventory = {
  onHand: number;
  reserved: number;
  lowStockThreshold: number;
};

export type Variant = {
  id: string;
  productId: string;
  colourId: string;
  sizeId: string;
  sku: string;
  pricePaise: number;
  compareAtPricePaise: number | null;
  isActive: boolean;
  inventory: Inventory | null;
};

export type ImageSource = {
  format: string;
  width: number;
  height: number;
  url: string;
};

export type ProductImage = {
  id: string;
  mediaAssetId: string;
  colourId: string | null;
  alt: string;
  role: "PRIMARY" | "HOVER" | "GALLERY";
  position: number;
  url: string | null;
  width: number;
  height: number;
  sources: ImageSource[];
};

export type Product = {
  id: string;
  name: string;
  slug: string;
  categoryId: string;
  shortDescription: string;
  description: RichText;
  fabric: string | null;
  care: string | null;
  fit: string | null;
  hsnCode: string | null;
  sizeChartId: string | null;
  status: Status;
  publishedAt: string | null;
  labels: string[];
  seoTitle: string | null;
  seoDescription: string | null;
  updatedAt: string;
};

export type ProductDetail = Product & {
  variants: Variant[];
  images: ProductImage[];
  collections: { collectionId: string; position: number }[];
};

export type MediaAsset = {
  id: string;
  mimeType: string;
  width: number;
  height: number;
  bytes: number;
  createdAt: string;
  derivatives: ImageSource[];
};

export type Page<T> = { items: T[]; nextCursor: string | null };
export type List<T> = { items: T[] };

// Inventory (Phase 9, phase-9-plan.md §3.4)
export type StockRow = {
  variantId: string;
  sku: string;
  productId: string;
  productName: string;
  productStatus: Status;
  colour: string;
  size: string;
  isActive: boolean;
  onHand: number;
  reserved: number;
  available: number;
  lowStockThreshold: number;
  lowStock: boolean;
};

export type MovementType =
  | "RECEIVED"
  | "ADJUSTMENT"
  | "RESERVED"
  | "RELEASED"
  | "SHIPPED"
  | "RETURNED"
  | "RESTOCKED"
  | "CORRECTION";

export type Movement = {
  id: string;
  variantId: string;
  sku: string;
  type: MovementType;
  onHandDelta: number;
  reservedDelta: number;
  reason: string | null;
  referenceType: string | null;
  actorName: string | null;
  createdAt: string;
};

// Content (Phase 10, phase-10-plan.md §3.8)
export type BlockView = {
  key: string;
  type: string;
  draft: Record<string, unknown> | null;
  published: Record<string, unknown> | null;
  publishedAt: string | null;
  updatedAt: string | null;
  unpublishedChanges: boolean;
};

export type PageView = {
  id: string;
  slug: string;
  title: string;
  draftBody?: unknown;
  publishedBody?: unknown;
  status: Status;
  requiresVerification: boolean;
  verifiedAt: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  draftVersion: string;
  unpublishedChanges: boolean;
};

export type Target =
  | { kind: "CATEGORY" | "COLLECTION" | "PRODUCT" | "PAGE"; id: string }
  | { kind: "PATH"; path: string };

export type NavTarget =
  | { kind: "CATEGORY" | "COLLECTION" | "PRODUCT" | "PAGE"; id: string }
  | { kind: "URL"; url: string };

export type MenuView = {
  menu: string;
  maxItems: number;
  items: {
    label: string;
    target: NavTarget;
    href: string | null;
    hidden: boolean;
  }[];
};
