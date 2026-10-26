// Website enquiries and WhatsApp click-to-chat (Phase 13; api-specification.md
// §3 "Enquiries and events"; system-design.md §9; UF-3, UF-4). Shared by the
// API and the storefront.
import { z } from "zod";

import { indianMobileSchema } from "../phone/indian-mobile.ts";
import { unknownFieldError } from "../validation/schema-helpers.ts";

export const ENQUIRY_LIMITS = {
  name: 100,
  email: 254,
  messageMin: 10,
  messageMax: 2000,
  path: 300,
} as const;

// One line: no control characters at all. Messages: line breaks allowed.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
// eslint-disable-next-line no-control-regex
const CONTROL_EXCEPT_NEWLINE = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/;
const HTML_LIKE = /<\s*[a-zA-Z!/?]/;

/** A same-site path such as `/products/rose-kurta?colour=rose`. */
export const sitePathSchema = z
  .string()
  .max(ENQUIRY_LIMITS.path, { error: "TOO_LONG" })
  .regex(/^\/(?!\/)[^\s]*$/, { error: "INVALID" });

const optionalText = (schema: z.ZodType<string>) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    schema.optional(),
  );

/**
 * `POST /enquiries`. Strict. Consent must be `true`; an email or a mobile
 * number is required. `website` is a honeypot and `elapsedMs` the time the
 * form was open: the API accepts both and silently drops likely bots.
 */
export const enquirySchema = z
  .strictObject(
    {
      productId: z.uuid().optional(),
      variantId: z.uuid().optional(),
      name: z
        .string({ error: "REQUIRED" })
        .trim()
        .min(1, { error: "REQUIRED" })
        .max(ENQUIRY_LIMITS.name, { error: "TOO_LONG" })
        .refine((t) => !CONTROL.test(t), { error: "TEXT_INVALID_CHARACTERS" })
        .refine((t) => !HTML_LIKE.test(t), { error: "INVALID" }),
      email: optionalText(
        z
          .string()
          .trim()
          .toLowerCase()
          .max(ENQUIRY_LIMITS.email, { error: "TOO_LONG" })
          .pipe(z.email({ error: "INVALID" })),
      ),
      phone: optionalText(indianMobileSchema),
      message: z
        .string({ error: "REQUIRED" })
        .trim()
        .min(ENQUIRY_LIMITS.messageMin, { error: "TOO_SHORT" })
        .max(ENQUIRY_LIMITS.messageMax, { error: "TOO_LONG" })
        .refine((t) => !CONTROL_EXCEPT_NEWLINE.test(t), {
          error: "TEXT_INVALID_CHARACTERS",
        })
        .refine((t) => !HTML_LIKE.test(t), { error: "INVALID" }),
      consentToContact: z.literal(true, { error: "REQUIRED" }),
      sourcePath: sitePathSchema,
      website: z.string().max(200).optional(),
      elapsedMs: z.int().min(0).max(86_400_000).optional(),
    },
    { error: unknownFieldError },
  )
  .refine((b) => b.email !== undefined || b.phone !== undefined, {
    error: "REQUIRED",
    path: ["contact"],
    // Checked even when other fields fail, so the form lists it at once.
    when: (payload) =>
      typeof payload.value === "object" && payload.value !== null,
  });
export type EnquiryInput = z.input<typeof enquirySchema>;

/** `POST /events/whatsapp-click`: anonymous, no personal data. */
export const whatsAppClickSchema = z.strictObject(
  {
    productId: z.uuid().optional(),
    variantId: z.uuid().optional(),
    pagePath: sitePathSchema,
    sessionId: z.uuid(),
  },
  { error: unknownFieldError },
);

/** `GET /content/settings/public` (api-specification.md §3 Content). */
export type PublicSettings = {
  whatsApp: { number: string; hours: string | null } | null;
};

/**
 * The click-to-chat link (UF-4): the product name, SKU, chosen colour and
 * size, and the page URL. `number` is digits only, with the country code.
 */
export function whatsAppLink(
  number: string,
  details: {
    product?: string | undefined;
    sku?: string | null | undefined;
    colour?: string | undefined;
    size?: string | undefined;
    url: string;
  },
): string {
  const lines = ["Hello Sanéa Pret, I have a question"];
  if (details.product) {
    const parts = [details.product];
    if (details.colour) parts.push(details.colour);
    if (details.size) parts.push(`size ${details.size}`);
    lines[0] += ` about ${parts.join(", ")}`;
    if (details.sku) lines.push(`SKU: ${details.sku}`);
  }
  lines[0] += ".";
  lines.push(details.url);
  const digits = number.replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(lines.join("\n"))}`;
}
