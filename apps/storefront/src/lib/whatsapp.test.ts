import { describe, expect, it } from "vitest";

import { whatsappHref } from "./whatsapp.ts";

describe("whatsappHref", () => {
  it("encodes the product, SKU, variant and URL", () => {
    const href = whatsappHref("+919876543210", {
      name: "Kurta & Dupatta",
      sku: "TEST-SK-IV-M",
      colour: "Ivory",
      size: "M",
      url: "https://example.test/products/a?colour=ivory&size=M",
    });
    const url = new URL(href);
    expect(url.origin + url.pathname).toBe("https://wa.me/919876543210");
    expect(url.searchParams.get("text")).toBe(
      "Hello Sanéa Pret, I have a question about Kurta & Dupatta.\nSKU: TEST-SK-IV-M\nChoice: Ivory, M\nhttps://example.test/products/a?colour=ivory&size=M",
    );
    expect(href).not.toContain(" ");
    expect(href).toContain("%26");
  });
  it("leaves out what is not chosen yet", () => {
    const text = new URL(
      whatsappHref("+919876543210", { name: "A", url: "https://x.test/" }),
    ).searchParams.get("text");
    expect(text).toBe(
      "Hello Sanéa Pret, I have a question about A.\nhttps://x.test/",
    );
  });
});
