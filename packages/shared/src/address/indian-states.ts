import { z } from "zod";

import { requiredOr } from "../validation/schema-helpers.ts";

/**
 * The 28 states and 8 union territories of India, keyed by our own stable
 * identifiers. ISO 3166-2 and GST state codes are deliberately not used here;
 * they are added in the tax phase after accountant review (D-040).
 */
export const INDIAN_STATE_NAMES = {
  "andhra-pradesh": "Andhra Pradesh",
  "arunachal-pradesh": "Arunachal Pradesh",
  assam: "Assam",
  bihar: "Bihar",
  chhattisgarh: "Chhattisgarh",
  goa: "Goa",
  gujarat: "Gujarat",
  haryana: "Haryana",
  "himachal-pradesh": "Himachal Pradesh",
  jharkhand: "Jharkhand",
  karnataka: "Karnataka",
  kerala: "Kerala",
  "madhya-pradesh": "Madhya Pradesh",
  maharashtra: "Maharashtra",
  manipur: "Manipur",
  meghalaya: "Meghalaya",
  mizoram: "Mizoram",
  nagaland: "Nagaland",
  odisha: "Odisha",
  punjab: "Punjab",
  rajasthan: "Rajasthan",
  sikkim: "Sikkim",
  "tamil-nadu": "Tamil Nadu",
  telangana: "Telangana",
  tripura: "Tripura",
  "uttar-pradesh": "Uttar Pradesh",
  uttarakhand: "Uttarakhand",
  "west-bengal": "West Bengal",
  "andaman-and-nicobar-islands": "Andaman and Nicobar Islands",
  chandigarh: "Chandigarh",
  "dadra-and-nagar-haveli-and-daman-and-diu":
    "Dadra and Nagar Haveli and Daman and Diu",
  delhi: "Delhi",
  "jammu-and-kashmir": "Jammu and Kashmir",
  ladakh: "Ladakh",
  lakshadweep: "Lakshadweep",
  puducherry: "Puducherry",
} as const;

export type IndianState = keyof typeof INDIAN_STATE_NAMES;

/** All state and union-territory keys, in the order above. */
export const INDIAN_STATE_KEYS = Object.keys(
  INDIAN_STATE_NAMES,
) as readonly IndianState[];

export const indianStateSchema = z.enum(
  INDIAN_STATE_KEYS as [IndianState, ...IndianState[]],
  { error: requiredOr("STATE_INVALID") },
);
