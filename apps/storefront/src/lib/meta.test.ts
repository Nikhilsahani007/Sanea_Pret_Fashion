// Phase 17 page meta in the document head: written for a known page, cleared
// and marked noindex for an unknown one.
import { describe, expect, it } from "vitest";

import { applyMeta } from "./meta.ts";

const head = (selector: string) =>
  document.head.querySelector(selector)?.getAttribute("content") ?? null;

describe("page meta", () => {
  it("writes description, canonical and preview tags, then clears them", () => {
    applyMeta({
      title: "TEST Kurta · Sanéa Pret",
      description: "TEST description",
      canonical: "http://localhost:5173/products/test-kurta",
      image: { url: "http://img.test/a.webp", alt: "TEST alt" },
      type: "product",
      noindex: false,
    });
    expect(head('meta[name="description"]')).toBe("TEST description");
    expect(head('meta[property="og:type"]')).toBe("product");
    expect(head('meta[property="og:image"]')).toBe("http://img.test/a.webp");
    expect(head('meta[name="robots"]')).toBeNull();
    expect(
      document.head
        .querySelector('link[rel="canonical"]')
        ?.getAttribute("href"),
    ).toBe("http://localhost:5173/products/test-kurta");

    applyMeta(null);
    expect(head('meta[name="robots"]')).toBe("noindex");
    expect(head('meta[name="description"]')).toBeNull();
    expect(document.head.querySelector('link[rel="canonical"]')).toBeNull();
  });
});
