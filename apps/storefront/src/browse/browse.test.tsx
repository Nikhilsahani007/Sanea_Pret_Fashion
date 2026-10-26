// Phase 13 storefront (phase-13-plan.md §7): filters and sort in the URL and
// in the API query; categories under /shop with the old /categories links
// redirected (D-179); the product page's deep links, sold-out sizes and add
// to bag; the enquiry form's checks and submission; WhatsApp only with a
// number set, with an anonymous click log.
import { EMPTY_CART } from "@sanea/shared";
import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { renderAt, stubApi } from "../test/helpers.tsx";
import { apiQuery, readFilters, writeFilters } from "./filters.ts";

const summary = (n: number) => ({
  id: `p${n}`,
  slug: `kurta-${n}`,
  name: `TEST Kurta ${n}`,
  fromPricePaise: 150_000,
  currency: "INR",
  labels: [],
  colours: [],
  soldOut: false,
  primaryImage: null,
});

const facets = {
  sizes: [
    { label: "S", count: 2 },
    { label: "M", count: 3 },
  ],
  colours: [{ slug: "rose", name: "Rose", swatchHex: "#D8C3B5", count: 2 }],
  categories: [{ slug: "kurtas", name: "Kurtas", count: 3 }],
  priceBands: [],
};

const detail = {
  id: "0199f0a0-0000-7000-8000-000000000001",
  slug: "rose-kurta",
  name: "TEST Rose Kurta",
  shortDescription: "TEST short",
  description: { type: "doc", content: [] },
  fabric: "TEST cotton",
  care: null,
  fit: null,
  category: { name: "Kurtas", slug: "kurtas" },
  sizeChart: {
    name: "TEST chart",
    unit: "CM",
    rows: [{ size: "M", measurements: { Bust: 96 } }],
  },
  images: [],
  colours: [
    { id: "c-rose", slug: "rose", name: "Rose", swatchHex: "#D8C3B5" },
    { id: "c-ivory", slug: "ivory", name: "Ivory", swatchHex: "#F8F4E9" },
  ],
  sizes: [
    { id: "s-m", label: "M" },
    { id: "s-l", label: "L" },
  ],
  variants: [
    {
      id: "0199f0a0-0000-7000-8000-0000000000b1",
      colourId: "c-rose",
      sizeId: "s-m",
      sku: "TEST-ROSE-M",
      pricePaise: 189_900,
      compareAtPricePaise: null,
      availability: "IN_STOCK",
    },
    {
      id: "0199f0a0-0000-7000-8000-0000000000b2",
      colourId: "c-rose",
      sizeId: "s-l",
      sku: "TEST-ROSE-L",
      pricePaise: 189_900,
      compareAtPricePaise: null,
      availability: "SOLD_OUT",
    },
  ],
};

describe("filters in the URL", () => {
  it("reads only documented values and writes defaults out", () => {
    const f = readFilters(
      new URLSearchParams(
        "size=M&size=L&colour=rose&price=100000&inStock=true&sort=price_asc&x=1",
      ),
    );
    expect(f).toEqual({
      sizes: ["M", "L"],
      colours: ["rose"],
      band: 100_000,
      inStock: true,
      sort: "price_asc",
    });
    expect(
      readFilters(new URLSearchParams("price=12345&sort=bad")),
    ).toMatchObject({ band: null, sort: "newest" });
    expect(writeFilters({ ...f, sort: "newest" }).toString()).toBe(
      "size=M&size=L&colour=rose&price=100000&inStock=true",
    );
  });

  it("turns a price band into an inclusive API range", () => {
    const q = new URLSearchParams(
      apiQuery(
        { category: "kurtas" },
        readFilters(new URLSearchParams("price=100000")),
        24,
      ),
    );
    expect(q.get("category")).toBe("kurtas");
    expect(q.get("priceMin")).toBe("100000");
    expect(q.get("priceMax")).toBe("199999");
    const top = new URLSearchParams(
      apiQuery({}, readFilters(new URLSearchParams("price=500000")), 24),
    );
    expect(top.get("priceMax")).toBeNull();
  });
});

describe("listings", () => {
  it("lists a category under /shop, filters by size through the URL and announces the count", async () => {
    const user = userEvent.setup();
    const { calls } = stubApi({
      "GET /catalogue/categories": {
        body: {
          items: [
            {
              name: "Kurtas",
              slug: "kurtas",
              seoTitle: null,
              seoDescription: null,
              children: [],
            },
          ],
        },
      },
      "GET /catalogue/products": (call) => ({
        body: {
          items: call.path.includes("size=M")
            ? [summary(1)]
            : [summary(1), summary(2)],
          facets,
          nextCursor: null,
        },
      }),
    });
    renderAt("/shop/kurtas");
    expect(
      await screen.findByRole("heading", { name: "Kurtas", level: 1 }),
    ).toBeTruthy();
    expect(await screen.findByText("2 products")).toBeTruthy();
    const filters = screen.getByRole("complementary", { name: "Filters" });
    await user.click(within(filters).getByRole("checkbox", { name: "M" }));
    expect(await screen.findByText("1 product")).toBeTruthy();
    const last = calls
      .filter((c) => c.path.startsWith("/catalogue/products"))
      .at(-1)!;
    expect(last.path).toContain("category=kurtas");
    expect(last.path).toContain("size=M");
  });

  it("redirects an old /categories link to /shop", async () => {
    stubApi({
      "GET /catalogue/categories": {
        body: {
          items: [
            {
              name: "Kurtas",
              slug: "kurtas",
              seoTitle: null,
              seoDescription: null,
              children: [],
            },
          ],
        },
      },
      "GET /catalogue/products": {
        body: { items: [], facets, nextCursor: null },
      },
    });
    renderAt("/categories/kurtas");
    expect(
      await screen.findByRole("heading", { name: "Kurtas", level: 1 }),
    ).toBeTruthy();
  });

  it("shows not found for an unknown category or collection", async () => {
    stubApi({
      "GET /catalogue/categories": { body: { items: [] } },
    });
    renderAt("/shop/nothing");
    expect(
      await screen.findByRole("heading", { name: "Page not found" }),
    ).toBeTruthy();
  });
});

describe("product page", () => {
  const routes = (extra = {}) => ({
    "GET /catalogue/products/rose-kurta": { body: detail },
    "GET /content/settings/public": { body: { whatsApp: null } },
    ...extra,
  });

  it("selects colour and size from the address, keeps sold-out sizes disabled and adds the variant", async () => {
    const user = userEvent.setup();
    const { calls } = stubApi(
      routes({ "POST /cart/items": { body: EMPTY_CART } }),
    );
    renderAt("/products/rose-kurta?colour=rose&size=M");
    expect(
      await screen.findByRole("heading", { name: "TEST Rose Kurta", level: 1 }),
    ).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Rose" })).toHaveProperty(
      "checked",
      true,
    );
    expect(screen.getByRole("button", { name: "L, sold out" })).toHaveProperty(
      "disabled",
      true,
    );
    await user.click(
      screen.getByRole("button", { name: /^Add to bag · ₹1,899$/ }),
    );
    await waitFor(() =>
      expect(calls.find((c) => c.method === "POST")?.body).toEqual({
        variantId: "0199f0a0-0000-7000-8000-0000000000b1",
        quantity: 1,
      }),
    );
  });

  it("asks for a size before adding, and shows the size chart", async () => {
    const user = userEvent.setup();
    stubApi(routes());
    renderAt("/products/rose-kurta");
    expect(
      await screen.findByRole("button", { name: "Choose a size" }),
    ).toHaveProperty("disabled", true);
    await user.click(screen.getByRole("button", { name: "Size guide" }));
    const sheet = await screen.findByRole("dialog", { name: "Size guide" });
    expect(
      within(sheet).getByRole("columnheader", { name: "Bust" }),
    ).toBeTruthy();
    expect(within(sheet).getByRole("cell", { name: "96" })).toBeTruthy();
  });

  it("shows no WhatsApp link until a number is set; with one, links and logs an anonymous click", async () => {
    stubApi(routes());
    const first = renderAt("/products/rose-kurta?colour=rose&size=M");
    await screen.findByRole("heading", { name: "TEST Rose Kurta", level: 1 });
    expect(screen.queryByRole("link", { name: /Ask on WhatsApp/ })).toBeNull();
    first.unmount();

    const user = userEvent.setup();
    const { calls } = stubApi(
      routes({
        "GET /content/settings/public": {
          body: { whatsApp: { number: "+919876543210", hours: null } },
        },
        "POST /events/whatsapp-click": { status: 204 },
      }),
    );
    renderAt("/products/rose-kurta?colour=rose&size=M");
    const link = await screen.findByRole("link", { name: /Ask on WhatsApp/ });
    const href = link.getAttribute("href")!;
    expect(href.startsWith("https://wa.me/919876543210?text=")).toBe(true);
    expect(decodeURIComponent(href)).toContain("TEST Rose Kurta, Rose, size M");
    expect(decodeURIComponent(href)).toContain("SKU: TEST-ROSE-M");
    link.addEventListener("click", (e) => e.preventDefault());
    await user.click(link);
    await waitFor(() => {
      const click = calls.find((c) => c.path === "/events/whatsapp-click");
      expect(click?.body).toMatchObject({
        productId: detail.id,
        variantId: "0199f0a0-0000-7000-8000-0000000000b1",
        pagePath: "/products/rose-kurta?colour=rose&size=M",
      });
      expect(Object.keys(click!.body as object).sort()).toEqual([
        "pagePath",
        "productId",
        "sessionId",
        "variantId",
      ]);
    });
  });
});

describe("enquiry form", () => {
  it("lists what is missing, then sends the enquiry with the product and variant", async () => {
    const user = userEvent.setup();
    const { calls } = stubApi({
      "GET /catalogue/products/rose-kurta": { body: detail },
      "GET /content/settings/public": { body: { whatsApp: null } },
      "POST /enquiries": { status: 201, body: { received: true } },
    });
    renderAt("/products/rose-kurta?colour=rose&size=M");
    await user.click(
      await screen.findByRole("button", { name: "Enquire about this piece" }),
    );
    const sheet = await screen.findByRole("dialog", { name: "Enquire" });
    await user.click(
      within(sheet).getByRole("button", { name: "Send enquiry" }),
    );
    const alert = await within(sheet).findByRole("alert");
    expect(alert.textContent).toContain("Name");
    expect(alert.textContent).toContain(
      "Give an email address or a mobile number so we can reply.",
    );
    expect(alert.textContent).toContain("Tick the box so we may reply to you.");
    expect(calls.some((c) => c.path === "/enquiries")).toBe(false);

    await user.type(within(sheet).getByLabelText("Name"), "TEST Asha");
    await user.type(
      within(sheet).getByLabelText("Mobile number"),
      "98765 43210",
    );
    await user.type(
      within(sheet).getByLabelText("Message"),
      "TEST Is this available in XL?",
    );
    await user.click(within(sheet).getByRole("checkbox"));
    await user.click(
      within(sheet).getByRole("button", { name: "Send enquiry" }),
    );
    expect(await within(sheet).findByText(/We have your message/)).toBeTruthy();
    const sent = calls.find((c) => c.path === "/enquiries")!.body as Record<
      string,
      unknown
    >;
    expect(sent).toMatchObject({
      productId: detail.id,
      variantId: "0199f0a0-0000-7000-8000-0000000000b1",
      name: "TEST Asha",
      phone: "98765 43210",
      consentToContact: true,
      sourcePath: "/products/rose-kurta?colour=rose&size=M",
    });
    expect(sent.website).toBeUndefined();
  });
});
