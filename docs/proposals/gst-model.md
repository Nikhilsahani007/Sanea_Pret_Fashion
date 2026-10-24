# Revised GST Data Model (D-167)

Status: **Implemented on the branch as a revision of the unapproved migration `20261024180000_orders_payments`; awaiting your approval.** It is a data model only: it holds no rate, HSN code, GSTIN or seller state, and it is not tax advice. Date: 2026-10-25.

## 1. Why
D-033 requires "a configurable, effective-dated, rules-based GST model that can represent value thresholds and tax components (for example CGST, SGST, IGST); no hard-coded rates". The Phase 15 table stored a single rate per rule, with no components and no place of supply, and nothing stopped two rules for the same HSN prefix from overlapping in time.

## 2. Why revise the migration in place
The migration has never been approved and has only run on disposable test databases (D-079, `phase-15-plan.md`). Revising it keeps one clear Phase 15 migration for your review, instead of a create-then-alter pair. If any copy of the branch's database exists outside the test runs, it must be rebuilt (Prisma would report a changed checksum).

## 3. The model
| Object | Columns and rules |
|--------|-------------------|
| `gst_rule` | `hsn_prefix` (0–8 digits; empty = any HSN), `effective_from`, `effective_to` (exclusive, or open), `note`, `created_by_admin_id`. **Exclusion constraint `gst_rule_no_overlap_excl`:** two rules with the same prefix cannot be in effect at the same moment (needs the `btree_gist` extension, a trusted extension available on managed PostgreSQL) |
| `gst_rule_slab` (new) | `rule_id`, `up_to_unit_price_paise` (inclusive upper unit price; null = no limit), `cgst_bps`, `sgst_bps`, `igst_bps` (each 0–10000 basis points). One row per price band; unique per rule and limit; **at most one open band per rule** (partial unique index) |
| enum `gst_supply_type` | `INTRA_STATE`, `INTER_STATE` |
| `order` | adds `seller_state`, `place_of_supply_state`, `supply_type` (snapshots at placement). CHECKs: the supply type must match the two states (intra exactly when they are equal); `tax_paise` must be 0 unless the supply type is known |
| `order_item` | replaces `gst_rate_bps` with `cgst_bps`, `sgst_bps`, `igst_bps` (rates applied, null when none) and `cgst_paise`, `sgst_paise`, `igst_paise` (GST contained in the line). CHECKs: CGST and SGST together or not at all; never both regimes; no amount without its rate; the contained GST cannot exceed the line |
| Tax settings | `store_setting` key `tax`: `{ sellerState }`, a state key from `@sanea/shared`, null by default. Read by checkout; **no admin route edits it yet** (who may edit tax settings is an open choice; Owner only is proposed, like payment settings) |

## 4. How checkout uses it
1. The seller's state (tax settings) and the delivery state (place of supply) give the supply type; either missing → no GST is recorded (`tax_paise = 0`), as today.
2. For each line: the rule in effect with the longest matching HSN prefix, then the band covering the unit price.
3. Intra-state: CGST and SGST from the band; inter-state: IGST.
4. Prices stay GST-inclusive (D-030): the GST is computed as contained in the line amount, so it never changes the total.

## 5. What still needs the accountant (B-14)
| Question | Where it lives now |
|----------|--------------------|
| The rates for each HSN code and price band, and the HSN codes of each product | No data. Rules and bands are entered by the Owner after verification (no admin screen yet) |
| The seller's registered state and GSTIN | No data; GSTIN not modelled yet (needed for invoices) |
| Is the place of supply the delivery state for these sales? | Code treats it so, marked provisional (`checkout/gst.ts`) |
| Union territories: is the state component SGST or UTGST in each case? | `sgst_*` columns hold "SGST or UTGST"; the label is an invoice question |
| Rounding: contained GST per line, split between CGST and SGST, remainder on SGST | Implemented as provisional in `lineGst` (D-040 requires accountant review) |
| Whether IGST must equal CGST + SGST in every band | Not enforced; the accountant may want a CHECK |
| How shipping and COD fees are taxed | They carry no GST in the calculation |
| Invoice format, numbering, GST state codes on invoices | Not built (D-040 defers state codes to this review) |

## 6. Tests
- `checkout/gst.test.ts` (9, unit): supply type, rule and band selection, intra and inter-state amounts, no-GST cases, rounding.
- `checkout/gst.db-test.ts` (7, database): overlap refused (back-to-back periods and other prefixes allowed), one open band, band and rate CHECKs, line and order snapshot CHECKs, placement with TEST rates for no seller state, intra-state and inter-state.
- Schema and catalogue tests updated for the new table, columns, extension, exclusion constraint and partial index. All rates in tests are marked TEST values, not real rates.
