// Money is integer paise from the server; shown as Indian rupees (en-IN).
const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

export function rupees(paise: number): string {
  return INR.format(paise / 100);
}

/** "1 item", "3 items". */
export function items(count: number): string {
  return `${count} ${count === 1 ? "item" : "items"}`;
}
