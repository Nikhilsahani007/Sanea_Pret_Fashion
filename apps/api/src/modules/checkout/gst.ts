// GST contained in GST-inclusive prices (D-030, D-033). Pure functions; the
// rules, rates and the seller's state come from the database and settings,
// which are empty until the Owner enters accountant-verified values (B-14).
// Nothing here is tax advice: where a rule is a choice (place of supply,
// rounding, the split between CGST and SGST), it is marked for the
// accountant to confirm.

export type GstSupplyType = "INTRA_STATE" | "INTER_STATE";

export type GstSlabRow = {
  /** Inclusive upper unit price; null = no upper limit. */
  readonly upToUnitPricePaise: number | null;
  readonly cgstBps: number;
  readonly sgstBps: number;
  readonly igstBps: number;
};

export type GstRuleRow = {
  readonly hsnPrefix: string;
  readonly effectiveFrom: Date;
  readonly effectiveTo: Date | null;
  readonly slabs: readonly GstSlabRow[];
};

export type LineGst = {
  cgstBps: number | null;
  sgstBps: number | null;
  igstBps: number | null;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
};

export const NO_GST: LineGst = {
  cgstBps: null,
  sgstBps: null,
  igstBps: null,
  cgstPaise: 0,
  sgstPaise: 0,
  igstPaise: 0,
};

/**
 * Intra-state when the seller's state equals the place of supply, otherwise
 * inter-state; null while either is unknown. The place of supply passed in is
 * the delivery state (for goods sent to unregistered buyers); accountant to
 * confirm (B-14).
 */
export function supplyTypeOf(
  sellerState: string | null,
  placeOfSupplyState: string | null,
): GstSupplyType | null {
  if (!sellerState || !placeOfSupplyState) return null;
  return sellerState === placeOfSupplyState ? "INTRA_STATE" : "INTER_STATE";
}

/**
 * The rule in effect for an HSN code: the longest matching prefix. Rules for
 * one prefix cannot overlap in time (database exclusion constraint), so the
 * choice is unique.
 */
export function ruleFor(
  hsnCode: string | null,
  rules: readonly GstRuleRow[],
  now: Date,
): GstRuleRow | null {
  const hsn = hsnCode ?? "";
  return (
    rules
      .filter(
        (r) =>
          r.effectiveFrom <= now &&
          (r.effectiveTo === null || r.effectiveTo > now) &&
          hsn.startsWith(r.hsnPrefix),
      )
      .sort((a, b) => b.hsnPrefix.length - a.hsnPrefix.length)[0] ?? null
  );
}

/** The band for a unit price: the lowest upper limit that covers it. */
export function slabFor(
  rule: GstRuleRow,
  unitPricePaise: number,
): GstSlabRow | null {
  return (
    [...rule.slabs]
      .sort(
        (a, b) =>
          (a.upToUnitPricePaise ?? Infinity) -
          (b.upToUnitPricePaise ?? Infinity),
      )
      .find(
        (s) =>
          s.upToUnitPricePaise === null ||
          unitPricePaise <= s.upToUnitPricePaise,
      ) ?? null
  );
}

/** GST contained in a GST-inclusive amount, rounded half up to the paisa. */
export function includedGst(amountPaise: number, rateBps: number): number {
  return Math.floor(
    (amountPaise * rateBps * 2 + (10_000 + rateBps)) / (2 * (10_000 + rateBps)),
  );
}

/**
 * GST in one line. The total contained GST is computed from the combined rate
 * and, for intra-state supplies, split between CGST and SGST in proportion,
 * with any paisa of rounding on SGST. This rounding is provisional and must
 * be confirmed by the accountant (D-040, B-14).
 */
export function lineGst(
  line: { unitPricePaise: number; quantity: number; hsnCode: string | null },
  rules: readonly GstRuleRow[],
  now: Date,
  supplyType: GstSupplyType | null,
): LineGst {
  if (!supplyType) return NO_GST;
  const rule = ruleFor(line.hsnCode, rules, now);
  const slab = rule ? slabFor(rule, line.unitPricePaise) : null;
  if (!slab) return NO_GST;
  const amount = line.unitPricePaise * line.quantity;
  if (supplyType === "INTER_STATE")
    return {
      ...NO_GST,
      igstBps: slab.igstBps,
      igstPaise: includedGst(amount, slab.igstBps),
    };
  const rate = slab.cgstBps + slab.sgstBps;
  const total = includedGst(amount, rate);
  const cgst =
    rate === 0 ? 0 : Math.floor((total * slab.cgstBps * 2 + rate) / (2 * rate));
  return {
    ...NO_GST,
    cgstBps: slab.cgstBps,
    sgstBps: slab.sgstBps,
    cgstPaise: cgst,
    sgstPaise: total - cgst,
  };
}

export const lineGstTotal = (g: LineGst) =>
  g.cgstPaise + g.sgstPaise + g.igstPaise;
