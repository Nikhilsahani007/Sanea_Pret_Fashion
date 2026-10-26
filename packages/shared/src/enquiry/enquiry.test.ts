import { describe, expect, it } from "vitest";

import { toFieldErrors } from "../validation/errors.ts";
import { enquirySchema, whatsAppClickSchema, whatsAppLink } from "./enquiry.ts";

const valid = {
  name: "Asha",
  email: "Asha@Example.test",
  message: "Is this available in a longer length?",
  consentToContact: true,
  sourcePath: "/products/rose-kurta?colour=rose",
};

const errorsOf = (input: unknown) => {
  const r = enquirySchema.safeParse(input);
  return r.success
    ? []
    : toFieldErrors(r.error).map((e) => `${e.path}:${e.code}`);
};

describe("enquirySchema", () => {
  it("accepts an email enquiry and lower-cases the email", () => {
    const r = enquirySchema.parse(valid);
    expect(r.email).toBe("asha@example.test");
    expect(r.phone).toBeUndefined();
  });

  it("accepts a mobile number alone and normalises it", () => {
    const rest = { ...valid, email: undefined };
    expect(enquirySchema.parse({ ...rest, phone: "98765 43210" }).phone).toBe(
      "+919876543210",
    );
  });

  it("treats blank optional contact fields as absent", () => {
    expect(errorsOf({ ...valid, email: "  ", phone: "" })).toEqual([
      "contact:REQUIRED",
    ]);
  });

  it("requires consent to be exactly true", () => {
    expect(errorsOf({ ...valid, consentToContact: false })).toEqual([
      "consentToContact:REQUIRED",
    ]);
    expect(errorsOf({ ...valid, consentToContact: undefined })).toEqual([
      "consentToContact:REQUIRED",
    ]);
  });

  it("keeps line breaks in the message but refuses other control characters and markup", () => {
    expect(errorsOf({ ...valid, message: "Line one\nline two here" })).toEqual(
      [],
    );
    expect(
      errorsOf({ ...valid, message: "Bell \u0007 character here" }),
    ).toEqual(["message:TEXT_INVALID_CHARACTERS"]);
    expect(
      errorsOf({ ...valid, message: "<script>alert(1)</script>" }),
    ).toEqual(["message:INVALID"]);
    expect(errorsOf({ ...valid, name: "A\nB" })).toEqual([
      "name:TEXT_INVALID_CHARACTERS",
    ]);
  });

  it("checks lengths, the email, the mobile and the path", () => {
    expect(errorsOf({ ...valid, message: "short" })).toEqual([
      "message:TOO_SHORT",
    ]);
    expect(errorsOf({ ...valid, name: "x".repeat(101) })).toEqual([
      "name:TOO_LONG",
    ]);
    expect(errorsOf({ ...valid, email: "not-an-email" })).toEqual([
      "email:INVALID",
    ]);
    expect(errorsOf({ ...valid, phone: "02212345678" })).toEqual([
      "phone:PHONE_NOT_MOBILE",
    ]);
    expect(errorsOf({ ...valid, sourcePath: "https://evil.test/" })).toEqual([
      "sourcePath:INVALID",
    ]);
    expect(errorsOf({ ...valid, sourcePath: "//evil.test/" })).toEqual([
      "sourcePath:INVALID",
    ]);
  });

  it("is strict: no prices, statuses or other fields", () => {
    expect(errorsOf({ ...valid, status: "CLOSED" })).toEqual([
      "status:UNKNOWN_FIELD",
    ]);
  });
});

describe("whatsAppClickSchema", () => {
  it("takes no personal data", () => {
    const ok = {
      pagePath: "/products/rose-kurta",
      sessionId: "0196b2a0-0000-7000-8000-000000000001",
    };
    expect(whatsAppClickSchema.safeParse(ok).success).toBe(true);
    expect(
      whatsAppClickSchema.safeParse({ ...ok, phone: "9876543210" }).success,
    ).toBe(false);
  });
});

describe("whatsAppLink", () => {
  it("names the product, colour, size and SKU, and links the page", () => {
    const link = whatsAppLink("+91 98765 43210", {
      product: "Rose Kurta",
      sku: "RK-ROSE-M",
      colour: "Rose",
      size: "M",
      url: "https://shop.example/products/rose-kurta?colour=rose&size=M",
    });
    expect(link.startsWith("https://wa.me/919876543210?text=")).toBe(true);
    const text = decodeURIComponent(link.split("?text=")[1]!);
    expect(text).toBe(
      "Hello Sanéa Pret, I have a question about Rose Kurta, Rose, size M.\nSKU: RK-ROSE-M\nhttps://shop.example/products/rose-kurta?colour=rose&size=M",
    );
  });

  it("works without a product", () => {
    const text = decodeURIComponent(
      whatsAppLink("919876543210", { url: "https://shop.example/" }).split(
        "?text=",
      )[1]!,
    );
    expect(text).toBe(
      "Hello Sanéa Pret, I have a question.\nhttps://shop.example/",
    );
  });
});
