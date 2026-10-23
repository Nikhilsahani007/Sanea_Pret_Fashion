// A product image from its derivatives only (AVIF, then WebP), never the
// original (Phase 8 safeguard 1). Width and height reserve the space.
type Source = { format: string; width: number; height: number; url: string };

export function Picture({
  image,
  sizes,
  eager = false,
}: {
  image: {
    url: string | null;
    width: number;
    height: number;
    alt: string;
    sources: readonly Source[];
  };
  sizes: string;
  eager?: boolean;
}) {
  if (!image.url) return null;
  const set = (format: string) =>
    image.sources
      .filter((x) => x.format === format)
      .map((x) => `${x.url} ${x.width}w`)
      .join(", ");
  const avif = set("avif");
  const webp = set("webp");
  return (
    <picture>
      {avif ? <source type="image/avif" srcSet={avif} sizes={sizes} /> : null}
      {webp ? <source type="image/webp" srcSet={webp} sizes={sizes} /> : null}
      <img
        src={image.url}
        alt={image.alt}
        width={image.width}
        height={image.height}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
      />
    </picture>
  );
}
