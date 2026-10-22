// Catalogue screens: role rules in the UI (prices, variant creation, editing),
// validation messages linked to fields, the publish checklist, and helpers.
import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { Admin, ProductDetail } from "../api/types.ts";
import { ApiError } from "../api/client.ts";
import {
  ADMINS,
  apiError,
  renderAt,
  signedInAs,
  stubApi,
} from "../test/helpers.tsx";
import { uploadAdvice } from "./ImagesPanel.tsx";
import { ProductEditor, changesOf } from "./ProductEditor.tsx";
import { ProductNew } from "./ProductNew.tsx";
import { fromGrid, toGrid } from "./SizeCharts.tsx";

const CAT = {
  id: "c1",
  name: "Kurtas",
  slug: "kurtas",
  parentId: null,
  position: 0,
  status: "PUBLISHED",
  seoTitle: null,
  seoDescription: null,
};
const ROSE = {
  id: "col1",
  name: "Rose",
  slug: "rose",
  swatchHex: "#C98A8A",
  position: 0,
};
const SIZES = [
  { id: "s1", label: "S", position: 1 },
  { id: "s2", label: "M", position: 2 },
];
const PRODUCT: ProductDetail = {
  id: "p1",
  name: "Rose Silk Kurta",
  slug: "rose-silk-kurta",
  categoryId: "c1",
  shortDescription: "A test product.",
  description: { type: "doc", content: [] },
  fabric: null,
  care: null,
  fit: null,
  hsnCode: null,
  sizeChartId: null,
  status: "DRAFT",
  publishedAt: null,
  labels: [],
  seoTitle: null,
  seoDescription: null,
  updatedAt: "2026-10-22T05:00:00Z",
  variants: [
    {
      id: "v1",
      productId: "p1",
      colourId: "col1",
      sizeId: "s1",
      sku: "TEST-ROSE-S",
      pricePaise: 249_900,
      compareAtPricePaise: null,
      isActive: true,
      inventory: { onHand: 0, reserved: 0, lowStockThreshold: 2 },
    },
  ],
  images: [],
  collections: [],
};

function editorApi(admin: Admin, extra = {}) {
  return stubApi({
    ...signedInAs(admin),
    "GET /admin/products/p1": { body: PRODUCT },
    "GET /admin/categories": { body: { items: [CAT] } },
    "GET /admin/colours": { body: { items: [ROSE] } },
    "GET /admin/sizes": { body: { items: SIZES } },
    "GET /admin/size-charts": { body: { items: [] } },
    ...extra,
  });
}

function renderEditor() {
  return renderAt(
    "/products/p1",
    [{ path: "/products/:id", element: <ProductEditor /> }],
    { shell: true },
  );
}

describe("product editor by role", () => {
  it("a catalogue editor sees prices read-only and no variant form; can switch a variant off", async () => {
    const user = userEvent.setup();
    const { calls } = editorApi(ADMINS.CATALOGUE_EDITOR, {
      "PATCH /admin/products/p1/variants/v1": {
        body: { ...PRODUCT.variants[0], isActive: false },
      },
    });
    renderEditor();
    const variants = await screen.findByRole("region", { name: "Variants" });
    expect(
      within(variants).getByText(/Prices are set by an Owner or Manager/),
    ).toBeTruthy();
    expect(
      within(variants).queryByRole("form", { name: "Add a variant" }),
    ).toBeNull();
    expect(
      within(variants).queryByRole("button", { name: /Change price/ }),
    ).toBeNull();
    expect(within(variants).getByText("₹2,499")).toBeTruthy();
    await user.click(
      within(variants).getByRole("button", { name: "Deactivate TEST-ROSE-S" }),
    );
    await waitFor(() =>
      expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({
        isActive: false,
      }),
    );
  });

  it("a manager can add a variant with a rupee price sent in paise", async () => {
    const user = userEvent.setup();
    const { calls } = editorApi(ADMINS.MANAGER, {
      "POST /admin/products/p1/variants": { status: 201, body: {} },
    });
    renderEditor();
    const form = await screen.findByRole("form", { name: "Add a variant" });
    await user.selectOptions(within(form).getByLabelText("Colour"), "col1");
    await user.selectOptions(within(form).getByLabelText("Size"), "s2");
    await user.type(within(form).getByLabelText("SKU"), "test-rose-m");
    await user.type(within(form).getByLabelText("Price (₹)"), "2499.50");
    await user.click(within(form).getByRole("button", { name: "Add variant" }));
    await waitFor(() =>
      expect(
        calls.find((c) => c.method === "POST" && c.path.endsWith("/variants"))
          ?.body,
      ).toEqual({
        colourId: "col1",
        sizeId: "s2",
        sku: "TEST-ROSE-M",
        pricePaise: 249_950,
      }),
    );
  });

  it("checks variant fields before sending and links each error to its field", async () => {
    const user = userEvent.setup();
    const { calls } = editorApi(ADMINS.OWNER);
    renderEditor();
    const form = await screen.findByRole("form", { name: "Add a variant" });
    await user.type(within(form).getByLabelText("Price (₹)"), "1,299");
    await user.click(within(form).getByRole("button", { name: "Add variant" }));
    const price = within(form).getByLabelText("Price (₹)");
    expect(price.getAttribute("aria-invalid")).toBe("true");
    const ids = (price.getAttribute("aria-describedby") ?? "").split(" ");
    expect(
      ids.map((id) => document.getElementById(id)?.textContent).join(" "),
    ).toMatch(/without commas/);
    expect(
      within(form).getByLabelText("Size").getAttribute("aria-invalid"),
    ).toBe("true");
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("fulfilment staff see the product without editing controls", async () => {
    editorApi(ADMINS.FULFILMENT);
    renderEditor();
    expect(
      await screen.findByText(
        "Your role can view this product but not change it.",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Publish" })).toBeNull();
    expect(screen.queryByRole("form", { name: "Add an image" })).toBeNull();
    expect(screen.getByLabelText("Name").matches(":disabled")).toBe(true);
  });

  it("shows the publish problems from the API as a checklist", async () => {
    const user = userEvent.setup();
    editorApi(ADMINS.CATALOGUE_EDITOR, {
      "POST /admin/products/p1/publish": apiError(
        409,
        "CONFLICT",
        "This change conflicts with the current state.",
        [
          {
            path: "",
            code: "NO_PRIMARY_IMAGE",
            message: "Add a primary image.",
          },
        ],
      ),
    });
    renderEditor();
    await user.click(await screen.findByRole("button", { name: "Publish" }));
    const list = await screen.findByRole("list", {
      name: "Publishing checklist",
    });
    expect(list.textContent).toBe("Add a primary image.");
  });
});

describe("new product", () => {
  it("shows API validation errors under the fields and in a focused summary", async () => {
    const user = userEvent.setup();
    stubApi({
      ...signedInAs(ADMINS.OWNER),
      "GET /admin/categories": { body: { items: [CAT] } },
      "POST /admin/products": apiError(
        400,
        "VALIDATION_FAILED",
        "The request is not valid.",
        [
          {
            path: "body.slug",
            code: "SLUG_INVALID",
            message: "Use lowercase letters, digits and single hyphens.",
          },
        ],
      ),
    });
    renderAt("/products/new", [
      { path: "/products/new", element: <ProductNew /> },
    ]);
    await user.type(await screen.findByLabelText("Name"), "Rosé Kurta!");
    expect(
      (screen.getByLabelText("Web address") as HTMLInputElement).value,
    ).toBe("rose-kurta");
    await user.selectOptions(screen.getByLabelText("Category"), "c1");
    await user.type(screen.getByLabelText(/Short description/), "Short.");
    await user.click(screen.getByRole("button", { name: "Create product" }));
    const summary = await screen.findByRole("alert");
    await waitFor(() => expect(document.activeElement).toBe(summary));
    expect(within(summary).getByRole("link").getAttribute("href")).toBe(
      "#slug",
    );
    expect(
      screen.getByLabelText("Web address").getAttribute("aria-invalid"),
    ).toBe("true");
  });
});

describe("helpers", () => {
  it("sends only changed product fields, empty optional text as null", () => {
    const base = {
      name: "A",
      slug: "a",
      categoryId: "c",
      shortDescription: "s",
      fabric: "Silk",
      care: "",
      fit: "",
      hsnCode: "",
      sizeChartId: "",
      isNew: false,
      seoTitle: "",
      seoDescription: "",
    };
    expect(changesOf(base, { ...base })).toEqual({});
    expect(
      changesOf(base, { ...base, name: "B", fabric: " ", isNew: true }),
    ).toEqual({
      name: "B",
      fabric: null,
      labels: ["NEW"],
    });
  });

  it("converts the size-chart grid and reports bad cells", () => {
    const grid = toGrid({
      id: "x",
      name: "K",
      unit: "IN",
      rows: [{ size: "S", measurements: { Bust: 34, Length: 44 } }],
    });
    expect(fromGrid(grid)).toEqual({
      rows: [{ size: "S", measurements: { Bust: 34, Length: 44 } }],
      problem: null,
    });
    expect(
      fromGrid({ columns: ["Bust"], rows: [{ size: "M", values: ["abc"] }] })
        .problem,
    ).toMatch(/number/);
    expect(
      fromGrid({ columns: ["Bust"], rows: [{ size: "", values: ["36"] }] })
        .problem,
    ).toMatch(/needs a size/);
  });

  it("adds retry advice only for the upload queue's temporary refusals", () => {
    expect(uploadAdvice(new ApiError(429, "UPLOAD_QUEUE_FULL", "x"))).toMatch(
      /Wait a moment/,
    );
    expect(
      uploadAdvice(new ApiError(503, "UPLOAD_PROCESSING_TIMEOUT", "x")),
    ).toMatch(/smaller image/);
    expect(
      uploadAdvice(new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "x")),
    ).toBeNull();
  });
});
