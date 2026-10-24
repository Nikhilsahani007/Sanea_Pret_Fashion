// Response shapes of the admin catalogue API (apps/api/src/modules/catalogue).
export type Status = "DRAFT" | "PUBLISHED" | "ARCHIVED";
export type MediaVariant = {
  format: "avif" | "webp";
  width: number;
  height: number;
  url: string;
};
export type Asset = {
  id: string;
  originalFilename: string;
  mimeType: string;
  width: number;
  height: number;
  bytes: number;
  createdAt: string;
  variants: MediaVariant[];
};
export type Category = {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  position: number;
  status: Status;
  productCount: number;
  childCount: number;
};
export type Collection = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: Status;
  startsAt: string | null;
  endsAt: string | null;
  productCount: number;
};
export type Colour = {
  id: string;
  name: string;
  slug: string;
  swatchHex: string;
  position: number;
};
export type Size = { id: string; label: string; position: number };
export type Variant = {
  id: string;
  sku: string;
  colour: { id: string; name: string; swatchHex: string };
  size: { id: string; label: string };
  pricePaise: number;
  compareAtPricePaise: number | null;
  isActive: boolean;
  stock: { onHand: number; reserved: number; lowStockThreshold: number } | null;
};
export type ProductImage = {
  id: string;
  colourId: string | null;
  alt: string;
  role: "PRIMARY" | "HOVER" | "GALLERY";
  position: number;
  asset: Asset;
};
export type RichText = {
  blocks: (
    { type: "paragraph"; text: string } | { type: string; [k: string]: unknown }
  )[];
};
export type Product = {
  id: string;
  name: string;
  slug: string;
  status: Status;
  category: { id: string; name: string; slug: string; status: Status };
  shortDescription: string;
  description: RichText;
  fabric: string | null;
  care: string | null;
  fit: string | null;
  hsnCode: string | null;
  labels: string[];
  seoTitle: string | null;
  seoDescription: string | null;
  variants: Variant[];
  images: ProductImage[];
  collections: { id: string; name: string; slug: string }[];
};
export type ProductRow = {
  id: string;
  name: string;
  slug: string;
  status: Status;
  category: { id: string; name: string };
  variantCount: number;
  updatedAt: string;
  primaryImage: { alt: string; asset: Asset } | null;
};

/** Smallest WebP derivative, for thumbnails. */
export function thumb(asset: Asset): string | undefined {
  return asset.variants
    .filter((v) => v.format === "webp")
    .sort((a, b) => a.width - b.width)[0]?.url;
}
