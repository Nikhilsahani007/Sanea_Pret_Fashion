/**
 * Click-to-chat link with the product name, SKU, chosen colour and size and
 * the page URL (project-requirements.md, testing-strategy.md §3 Enquiries).
 */
export function whatsappHref(
  number: string,
  p: {
    name: string;
    sku?: string | undefined;
    colour?: string | undefined;
    size?: string | undefined;
    url: string;
  },
): string {
  const lines = [
    `Hello Sanéa Pret, I have a question about ${p.name}.`,
    p.sku ? `SKU: ${p.sku}` : null,
    p.colour || p.size
      ? `Choice: ${[p.colour, p.size].filter(Boolean).join(", ")}`
      : null,
    p.url,
  ].filter(Boolean);
  return `https://wa.me/${number.replace(/\D/g, "")}?text=${encodeURIComponent(lines.join("\n"))}`;
}
