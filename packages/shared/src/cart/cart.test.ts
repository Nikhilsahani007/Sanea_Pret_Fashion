// The cart request schemas (T11-1, T11-4): strict, and bounded by the
// configured line limit, never above the database ceiling of 10.
import { describe, expect, it } from "vitest";

import {
  CART_LINE_CEILING,
  cartItemAddSchema,
  cartItemUpdateSchema,
} from "./cart.ts";

const id = "0199f0a0-0000-7000-8000-000000000001";

describe("cartItemAddSchema", () => {
  it("accepts a variant and a quantity from 1 to the limit", () => {
    expect(
      cartItemAddSchema().safeParse({ variantId: id, quantity: 1 }).success,
    ).toBe(true);
    expect(
      cartItemAddSchema().safeParse({
        variantId: id,
        quantity: CART_LINE_CEILING,
      }).success,
    ).toBe(true);
  });

  it("refuses 0, 11, fractions, strings and a non-uuid variant", () => {
    for (const quantity of [0, 11, 1.5, "2", -1])
      expect(
        cartItemAddSchema().safeParse({ variantId: id, quantity }).success,
        String(quantity),
      ).toBe(false);
    expect(
      cartItemAddSchema().safeParse({ variantId: "x", quantity: 1 }).success,
    ).toBe(false);
  });

  it("refuses a price, a total or any other field (prices come from the server)", () => {
    for (const extra of [
      { pricePaise: 1 },
      { unitPricePaise: 1 },
      { subtotalPaise: 1 },
      { cartId: id },
    ])
      expect(
        cartItemAddSchema().safeParse({ variantId: id, quantity: 1, ...extra })
          .success,
      ).toBe(false);
  });

  it("applies a lower configured limit", () => {
    expect(
      cartItemAddSchema(3).safeParse({ variantId: id, quantity: 3 }).success,
    ).toBe(true);
    expect(
      cartItemAddSchema(3).safeParse({ variantId: id, quantity: 4 }).success,
    ).toBe(false);
  });
});

describe("cartItemUpdateSchema", () => {
  it("accepts 0 (remove) to the limit, strictly", () => {
    expect(cartItemUpdateSchema().safeParse({ quantity: 0 }).success).toBe(
      true,
    );
    expect(cartItemUpdateSchema().safeParse({ quantity: 10 }).success).toBe(
      true,
    );
    expect(cartItemUpdateSchema().safeParse({ quantity: 11 }).success).toBe(
      false,
    );
    expect(
      cartItemUpdateSchema().safeParse({ quantity: 2, pricePaise: 1 }).success,
    ).toBe(false);
  });
});
