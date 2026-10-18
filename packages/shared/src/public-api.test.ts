import { describe, expect, it } from "vitest";

import * as shared from "@sanea/shared";

// The documented public runtime exports (README.md). Type-only exports are
// checked by the type checker, not here.
const PUBLIC_RUNTIME_EXPORTS = [
  "AdminRole",
  "INDIAN_STATE_KEYS",
  "INDIAN_STATE_NAMES",
  "MAX_AMOUNT_PAISE",
  "MoneyError",
  "OrderStatus",
  "PaymentMethod",
  "VALIDATION_CODES",
  "addPaise",
  "addressSchema",
  "adminRoleSchema",
  "amountPaiseSchema",
  "formatIndianMobileForDisplay",
  "formatInr",
  "indianMobileSchema",
  "indianStateSchema",
  "isPaise",
  "multiplyPaise",
  "normalizeIndianMobile",
  "normalizePinCode",
  "orderStatusSchema",
  "paise",
  "paiseSchema",
  "parseRupeesToPaise",
  "paymentMethodSchema",
  "percentageOfPaise",
  "pinCodeSchema",
  "pricePaiseSchema",
  "rupeesInputSchema",
  "subtractPaise",
  "sumPaise",
  "toFieldErrors",
  "validationMessage",
];

describe("@sanea/shared public API", () => {
  it("exports exactly the documented runtime names", () => {
    expect(Object.keys(shared).sort()).toEqual(
      [...PUBLIC_RUNTIME_EXPORTS].sort(),
    );
  });

  it("keeps internal helpers private", () => {
    for (const internal of [
      "assertPaise",
      "checkedResult",
      "requiredOr",
      "unknownFieldError",
      "ok",
      "fail",
    ]) {
      expect(Object.keys(shared)).not.toContain(internal);
    }
  });

  it("works end to end through the package entry", () => {
    const total = shared.addPaise(
      shared.paise(129_900),
      shared.percentageOfPaise(shared.paise(129_900), 1000),
    );
    expect(shared.formatInr(total)).toBe("₹1,428.90"); // 129,900 + 10% = 142,890 paise
    expect(shared.normalizeIndianMobile("98765 43210")).toEqual({
      ok: true,
      value: "+919876543210",
    });
  });

  it("rejects deep imports at runtime", async () => {
    const specifier = ["@sanea/shared", "src/money/paise.ts"].join("/");
    await expect(import(/* @vite-ignore */ specifier)).rejects.toThrow(
      /not exported|ERR_PACKAGE_PATH_NOT_EXPORTED/,
    );
  });
});

// Compile-time check: deep imports must not resolve for the type checker.
// @ts-expect-error -- '@sanea/shared/src/...' is not exported by the package.
import type {} from "@sanea/shared/src/money/paise.ts";
