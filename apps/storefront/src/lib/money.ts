import { formatInr, paise } from "@sanea/shared";

/** ₹ with en-IN grouping (₹1,29,999); whole rupees drop the paise. */
export const inr = (value: number) => formatInr(paise(value));
