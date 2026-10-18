# Sanéa Pret — Open Decisions

Status: Awaiting answers · Date: 2026-10-18

Each item has a recommended safe default. A default is **not** a decision until you accept it; accepted answers are recorded in `DECISION-LOG.md`. "Needed by" is the phase that is blocked without an answer or an accepted default.

| ID | Question | Recommended safe default | Needed by |
|----|----------|--------------------------|-----------|
| OD-01 | The brief mentions a supplied screen recording of nishorama.com. It is not in the repository. Can you add it (e.g. to `docs/reference/`)? | Proceed from the live site; motion timing (slide duration, transitions, hover behaviour) stays provisional until the recording is reviewed. | Phase 12 |
| OD-02 | Does Sanéa Pret have a logo, brand colours or brand fonts? | Use a typeset Panchang wordmark and the blush and aubergine palette, both replaceable through tokens. | Phase 11 |
| OD-03 | What is the real category list and sub-categories (e.g. kurtas, kurta sets, co-ords, suits, dupattas, bottoms)? | Build categories as admin data; launch with whatever list you provide. Nothing is hard-coded. | Phase 12 |
| OD-04 | What is the size range and is there a size chart per category? | **Your proposed default (2026-10-18), not yet accepted:** initial range S, M, L, XL, XXL; product-specific size charts; inventory tracked by size and colour; final availability must match supplier products. *Replaces the earlier default (XS–XXL plus "Free size", one chart per category).* | Phase 6 |
| OD-05 | GST: are prices GST-inclusive? What HSN codes and rates apply? Who issues tax invoices and what is the GSTIN? | **Your proposed default (2026-10-18), not yet accepted:** customer-facing prices include applicable GST; product-level HSN and tax configuration; invoice tax breakdowns; no hard-coded universal rate. Tax rates, classifications and invoice compliance need accountant verification before live sales. See OD-25. | Phase 6 |
| OD-06 | Which payment gateway (Razorpay, Cashfree, PayU or other) and which methods (UPI, cards, net banking, wallets)? | Mock provider until approval; architecture supports any of them. | Phase 18 |
| OD-07 | COD rules: maximum order value, COD fee, excluded PIN codes, confirmation process? | Max ₹15,000, no fee, all valid PIN codes, staff confirmation by phone or WhatsApp within 24 hours, auto-cancel after 48 hours. | Phase 15 |
| OD-08 | Shipping: flat fee, free-shipping threshold, delivery estimates, courier partner? | Flat fee configurable in admin with an optional free-shipping threshold, both off until you set values. Manual tracking entry. | Phase 15 |
| OD-09 | Returns and exchanges policy (window, condition, exchange vs refund, who pays return shipping)? | No policy text is written by us. Placeholder page marked "to be confirmed"; order system supports return states. | Phase 15 |
| OD-10 | Customer sign-in: email and password only, or phone OTP as well? | **Your proposed default (2026-10-18), not yet accepted:** guest checkout without mandatory registration for the initial release; optional customer accounts designed for later. *Replaces the earlier default (email and password accounts in R1). Scope impact: OD-26.* | Phase 6 |
| OD-11 | Should MFA be mandatory for all admin roles? | **Your proposed default (2026-10-18), not yet accepted:** 2FA required for the Owner and for every role with access to customer or order data, or permission to modify products, prices, inventory or orders. Any read-only staff exception is documented for later approval. With the current roles (`security-design.md` §4), this covers Owner, Manager, Catalogue editor and Fulfilment, so all four. No read-only role exists yet. | Phase 6 |
| OD-12 | Who drafts and approves the privacy policy, terms and retention periods (DPDP Act)? | Lawyer-approved text before launch; retention defaults in `database-design.md` §5 used until then. | Phase 17 |
| OD-13 | Rehma Foundation: what verified information can be published, and who verifies it (registration, purpose, any link with sales)? | Placeholder page only; Owner-only verified publish; no donation or sales-linked claims. | Phase 19 |
| OD-14 | SEO rendering: SPA with link-preview meta endpoint, or full Vite SSR for the storefront? | SPA plus meta endpoint for bots in R1; SSR evaluated in Phase 17. | Phase 17 |
| OD-15 | Confirm Panchang renders "É" well at large sizes, and that you are happy with Fontshare's licence. | Verify in Phase 11; fall back to another wide grotesk with a good É if not. | Phase 11 |
| OD-16 | WhatsApp: which number, and is it a WhatsApp Business account? Business hours text? | Number stored in admin settings; click-to-chat only; no automation. | Phase 13 |
| OD-17 | Is there an automatic offer at launch (e.g. "10% off above a threshold")? | No offer. The discount rule exists but is disabled. | Phase 15 |
| OD-18 | Hosting: AWS confirmed? Region (ap-south-1 Mumbai is the likely choice)? Budget? | Design for AWS ap-south-1; nothing provisioned until a separate approval. | Phase 19 |
| OD-19 | Email sender: which domain and provider (Amazon SES, Postmark, Resend)? | Log-only email provider in development; choose with hosting. | Phase 16 |
| OD-20 | Analytics: which tool, and is a consent banner required for your use? | No third-party analytics in R1 beyond privacy-friendly server logs; decide with legal review. | Phase 17 |
| OD-21 | Should `.taste-skill/` (design working files) be committed or git-ignored? | Git-ignore screenshots and keep `direction.json` committed so the direction is reproducible. | Phase 1 |
| OD-22 | Launch mode: wait for the live gateway, or soft-launch with COD only? | Wait for the live gateway. BR-6 requires prepaid and COD at launch. | Phase 18 |
| OD-23 | May the landing page include sections beyond the mandated Nishorama composition (editorial band, Rehma Foundation teaser)? | Off by default. Decided at the landing-page gate. | Phase 12 |
| OD-24 | At the landing gate, must account and wishlist be fully functional, or only open their real routes? | Open real routes (sign-in page, wishlist page with sign-in prompt); full behaviour accepted in Phase 14. *Depends on OD-26.* | Phase 12 |
| OD-25 | GST rate model: can one rate per product (or HSN code) be stored, or does the rate depend on the sale value of each item? Indian GST on apparel has used value-based rate slabs. Also: seller GSTIN and state of registration, for the CGST/SGST versus IGST split on invoices. | Model tax as configurable rules (HSN code plus optional value thresholds, with effective dates), stored on each order line as a snapshot, so a value-based rate can be applied without a schema change. Accountant to confirm the current rates and invoice format. | Phase 6 |
| OD-26 | If OD-10 is accepted: are customer accounts and wishlist removed from the first release? They are in scope today (`project-requirements.md` §3.1, index Phase 14). | Defer accounts and wishlist; guests track orders with the order access link; the header account and wishlist controls are hidden in R1. Phase 14 becomes a later phase. | Phase 2 |

All phase numbers in this file refer to `MASTER-IMPLEMENTATION-INDEX.md`. "Needed by" was re-mapped from the old roadmap on 2026-10-18; OD-04, OD-05, OD-10 and OD-11 moved earlier because they shape the Phase 6 schema.

## Assumptions already made in the documents

- Guest checkout is allowed (common in Indian fashion ecommerce and reduces drop-off).
- One warehouse, so inventory has no location dimension in R1.
- One currency and one language (English). Hindi is not in R1.
- Order numbers use the format `SP-YYMM-NNNNNN`.
- Stock reservation lasts 15 minutes for prepaid checkout.
- Maximum 10 units per cart line.
- No product reviews are shown until a reviews feature with real reviews exists.
