// Storefront components (phase-11-plan.md §8): the shell draws only published
// content; the search combobox (keyboard, debounce, 429); the size sheet (no
// default size, sold-out sizes disabled); the cart drawer (focus, Escape,
// server prices, announcements).
import { CartWarning, type CartView } from "@sanea/shared";
import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { apiError, renderAt, stubApi } from "./test/helpers.tsx";

const VARIANT = "0199f0a0-0000-7000-8000-0000000000a1";

/** A one-line cart as the API returns it. */
export function cartWith(overrides: Partial<CartView> = {}): CartView {
  return {
    lines: [
      {
        variantId: VARIANT,
        productSlug: "sample-kurta",
        productName: "Sample Kurta",
        colour: { name: "Ivory", swatchHex: "#F8F4E9" },
        size: "M",
        quantity: 2,
        available: true,
        unitPricePaise: 129_900,
        lineTotalPaise: 259_800,
        stock: { availability: "IN_STOCK" },
        image: null,
      },
    ],
    subtotalPaise: 259_800,
    currency: "INR",
    itemCount: 2,
    warnings: [],
    ...overrides,
  };
}

const nav = {
  menus: {
    HEADER: [{ label: "New in", href: "/collections/new-in" }],
    CATEGORY_PILLS: [
      { label: "Kurtas", href: "/categories/kurtas" },
      { label: "Suits", href: "/categories/suits" },
    ],
    FOOTER_HELP: [{ label: "Shipping", href: "/pages/shipping" }],
  },
  footer: {
    contact: { email: "hello@example.test" },
    social: [{ network: "INSTAGRAM", url: "https://instagram.com/x" }],
  },
};

describe("shell", () => {
  it("draws only the published menus, the announcement and the footer it is given", async () => {
    stubApi({
      "GET /content/navigation": { body: nav },
      "GET /content/home": {
        body: { announcement: { text: "TEST notice", href: null } },
      },
    });
    renderAt("/");
    expect(await screen.findByText("TEST notice")).toBeTruthy();
    const pills = await screen.findByRole("navigation", { name: "Categories" });
    expect(
      within(pills)
        .getAllByRole("link")
        .map((a) => a.textContent),
    ).toEqual(["Kurtas", "Suits"]);
    expect(screen.getByRole("navigation", { name: "Help links" })).toBeTruthy();
    // Menus with no public links are not drawn.
    expect(screen.queryByRole("navigation", { name: "Shop links" })).toBeNull();
    expect(screen.getByRole("link", { name: /Instagram/ })).toBeTruthy();
    expect(screen.getByRole("img", { name: "Sanéa Pret" })).toBeTruthy();
  });

  it("draws no announcement, pills or footer links when nothing is published", async () => {
    stubApi({});
    renderAt("/");
    await screen.findByRole("heading", { name: "Sanéa Pret", level: 1 });
    expect(screen.queryByRole("navigation", { name: "Categories" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Menu" })).toBeNull();
    expect(screen.queryByRole("navigation", { name: /links$/ })).toBeNull();
  });

  it("shows not found for a product that is not public and for an unknown address", async () => {
    stubApi({});
    renderAt("/products/sample");
    expect(
      await screen.findByRole("heading", { name: "Page not found" }),
    ).toBeTruthy();
  });
});

describe("search", () => {
  it("suggests after two characters and 200 ms, moves with the arrow keys, and opens the choice", async () => {
    const user = userEvent.setup();
    const { calls } = stubApi({
      "GET /search/suggest": {
        body: {
          categories: [{ slug: "kurtas", name: "Kurtas" }],
          products: [{ slug: "sample-kurta", name: "Sample Kurta" }],
        },
      },
      "GET /catalogue/products/sample-kurta": {
        body: {
          id: "p1",
          slug: "sample-kurta",
          name: "Sample Kurta",
          colours: [],
          sizes: [],
          variants: [
            {
              id: "v1",
              colourId: "c1",
              sizeId: "s1",
              pricePaise: 100_000,
              availability: "IN_STOCK",
            },
          ],
        },
      },
    });
    renderAt("/");
    const box = await screen.findByRole("combobox", {
      name: "Search the shop",
    });
    const header = box;
    await user.type(header, "k");
    expect(calls.some((c) => c.path.startsWith("/search/suggest"))).toBe(false);
    await user.type(header, "u");
    await waitFor(() =>
      expect(
        calls.filter((c) => c.path.startsWith("/search/suggest")),
      ).toHaveLength(1),
    );
    expect(calls.find((c) => c.path.startsWith("/search/suggest"))?.path).toBe(
      "/search/suggest?q=ku",
    );
    expect(header.getAttribute("aria-expanded")).toBe("true");
    await user.keyboard("{ArrowDown}{ArrowDown}");
    const options = screen.getAllByRole("option");
    expect(options[1]?.getAttribute("aria-selected")).toBe("true");
    expect(header.getAttribute("aria-activedescendant")).toBe(options[1]?.id);
    await user.keyboard("{Enter}");
    expect(
      await screen.findByRole("heading", { name: "Sample Kurta", level: 1 }),
    ).toBeTruthy();
  });

  it("shows a busy message on 429 and does not retry", async () => {
    const user = userEvent.setup();
    const { calls } = stubApi({
      "GET /search/suggest": apiError(
        429,
        "RATE_LIMITED",
        "Too many requests.",
      ),
    });
    renderAt("/");
    const boxes = await screen.findAllByRole("combobox", {
      name: "Search the shop",
    });
    await user.type(boxes[0]!, "ab");
    expect(
      await screen.findByText("Search is busy. Try again in a moment.", {
        selector: "p:not(.visually-hidden)",
      }),
    ).toBeTruthy();
    await new Promise((r) => setTimeout(r, 400));
    expect(
      calls.filter((c) => c.path.startsWith("/search/suggest")),
    ).toHaveLength(1);
  });

  it("shows results for the query in the URL, and loads more by cursor", async () => {
    const user = userEvent.setup();
    const item = (n: number) => ({
      id: `p${n}`,
      slug: `sample-${n}`,
      name: `Sample ${n}`,
      fromPricePaise: 99_900,
      currency: "INR",
      labels: [],
      colours: [],
      soldOut: false,
      primaryImage: null,
    });
    const { calls } = stubApi({
      "GET /search": (c) =>
        c.path.includes("cursor=")
          ? { body: { items: [item(2)], nextCursor: null } }
          : { body: { items: [item(1)], nextCursor: "next" } },
    });
    renderAt("/search?q=sample");
    expect(
      await screen.findByRole("heading", { name: "Results for “sample”" }),
    ).toBeTruthy();
    expect(await screen.findByText("Sample 1")).toBeTruthy();
    expect(screen.getByText("₹999", { exact: false })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("Sample 2")).toBeTruthy();
    expect(
      calls.filter((c) => c.path.startsWith("/search?")).map((c) => c.path),
    ).toEqual([
      "/search?q=sample&sort=relevance&limit=24",
      "/search?q=sample&sort=relevance&limit=24&cursor=next",
    ]);
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });
});

describe("size sheet", () => {
  const product = {
    id: "p1",
    slug: "sample-kurta",
    name: "Sample Kurta",
    colours: [{ id: "c1", name: "Ivory", swatchHex: "#F8F4E9" }],
    sizes: [
      { id: "s", label: "S" },
      { id: "m", label: "M" },
    ],
    variants: [
      {
        id: "v-s",
        colourId: "c1",
        sizeId: "s",
        pricePaise: 129_900,
        availability: "SOLD_OUT",
      },
      {
        id: VARIANT,
        colourId: "c1",
        sizeId: "m",
        pricePaise: 129_900,
        availability: "LOW_STOCK",
        remaining: 2,
      },
    ],
  };

  it("adds nothing until a size is chosen, disables sold-out sizes, then opens the bag", async () => {
    const user = userEvent.setup();
    const { calls } = stubApi({
      "GET /search": {
        body: {
          items: [
            {
              id: "p1",
              slug: "sample-kurta",
              name: "Sample Kurta",
              fromPricePaise: 129_900,
              currency: "INR",
              labels: [],
              colours: [],
              soldOut: false,
              primaryImage: null,
            },
          ],
          nextCursor: null,
        },
      },
      "GET /catalogue/products/sample-kurta": { body: product },
      "POST /cart/items": { body: cartWith() },
    });
    renderAt("/search?q=sample");
    const add = await screen.findByRole("button", {
      name: "Add Sample Kurta to bag",
    });
    await user.click(add);
    const sheet = await screen.findByRole("dialog", {
      name: "Add Sample Kurta",
    });
    const submit = await within(sheet).findByRole("button", {
      name: "Choose a size",
    });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    const small = within(sheet).getByRole("button", { name: "S, sold out" });
    expect((small as HTMLButtonElement).disabled).toBe(true);
    await user.click(within(sheet).getByRole("button", { name: "M" }));
    expect(within(sheet).getByText("Only 2 left")).toBeTruthy();
    await user.click(
      within(sheet).getByRole("button", { name: /Add to bag · ₹1,299/ }),
    );
    await waitFor(() =>
      expect(calls.find((c) => c.method === "POST")?.body).toEqual({
        variantId: VARIANT,
        quantity: 1,
      }),
    );
    const bag = await screen.findByRole("dialog", { name: "Your bag" });
    expect(within(bag).getAllByText("₹2,598")).toHaveLength(2);
    expect(
      screen
        .getAllByRole("status", { hidden: true })
        .some((el) => el.textContent === "Added to your bag. Bag, 2 items."),
    ).toBe(true);
  });
});

describe("cart drawer", () => {
  it("opens from the bag, shows server prices and notices, updates by the server, and returns focus on Escape", async () => {
    const user = userEvent.setup();
    const { calls } = stubApi({
      "GET /cart": {
        body: cartWith({
          warnings: [
            { variantId: VARIANT, code: CartWarning.EXCEEDS_AVAILABLE },
          ],
        }),
      },
      [`PATCH /cart/items/${VARIANT}`]: {
        body: cartWith({
          lines: [
            { ...cartWith().lines[0]!, quantity: 3, lineTotalPaise: 389_700 },
          ],
          subtotalPaise: 389_700,
          itemCount: 3,
        }),
      },
      [`DELETE /cart/items/${VARIANT}`]: {
        body: {
          lines: [],
          subtotalPaise: 0,
          currency: "INR",
          itemCount: 0,
          warnings: [],
        },
      },
    });
    renderAt("/");
    const bagButton = await screen.findByRole("button", {
      name: "Bag, 2 items",
    });
    await user.click(bagButton);
    const bag = await screen.findByRole("dialog", { name: "Your bag" });
    expect(within(bag).getAllByText("₹2,598").length).toBeGreaterThan(0);
    expect(
      within(bag).getByText(
        "Not enough in stock for this quantity. Lower it to check out.",
      ),
    ).toBeTruthy();
    expect(
      (
        within(bag).getByRole("button", {
          name: "Checkout",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    await user.click(
      within(bag).getByRole("button", {
        name: "One more Sample Kurta, Ivory, size M",
      }),
    );
    await waitFor(() =>
      expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({
        quantity: 3,
      }),
    );
    expect(await within(bag).findAllByText("₹3,897")).toBeTruthy();
    await user.click(within(bag).getByRole("button", { name: /Remove/ }));
    expect(await within(bag).findByText("Your bag is empty.")).toBeTruthy();
    expect(calls.some((c) => c.method === "DELETE")).toBe(true);
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Your bag" })).toBeNull(),
    );
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Bag, 0 items" }),
    );
  });

  it("shows an unavailable line without a price", async () => {
    stubApi({
      "GET /cart": {
        body: cartWith({
          lines: [
            {
              ...cartWith().lines[0]!,
              available: false,
              unitPricePaise: null,
              lineTotalPaise: null,
              stock: null,
            },
          ],
          subtotalPaise: 0,
          warnings: [{ variantId: VARIANT, code: CartWarning.UNAVAILABLE }],
        }),
      },
    });
    renderAt("/cart");
    expect(
      await screen.findByText("No longer available. Remove it to check out."),
    ).toBeTruthy();
    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.getByText("₹0")).toBeTruthy();
  });
});
