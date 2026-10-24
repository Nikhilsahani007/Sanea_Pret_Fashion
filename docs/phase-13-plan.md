# Phase 13 Plan — Browsing, Product Detail and Enquiries

Status: **Evidence ready, awaiting your approval (D-079).** Built on the demo seed (TEST data, placeholder images). Date: 2026-10-24.

## Migration `20261024150000_enquiries` (needs your approval before any kept database)
- **Generated:** enum `enquiry_status`; tables `enquiry` (source, product and variant, name, email citext, phone, message, consent, source path, status, assigned admin, IP hash, timestamps) and `whatsapp_click` (product, variant, page path, anonymous session ID, time); indexes; five foreign keys, all `RESTRICT`.
- **Handwritten CHECKs:** consent must be true; email or phone required; phone `+91` mobile format; name 1–100 and message 10–2000 characters; source `WEBSITE`.
- Disposable databases only; drift check "No difference detected".

## Implementation
| Area | Files |
|------|-------|
| API | `apps/api/src/modules/enquiries/public-router.ts`: `POST /enquiries` (consent required; email or mobile, phone normalised to `+91…`; honeypot and a 2-second timing check answer like a success but store nothing; 5 per hour per IP and 3 per hour per email or phone; product and variant linked only if published; IP stored as a keyed hash); `POST /events/whatsapp-click` (anonymous: product, variant, path, random session ID; 60 per minute) |
| Storefront | `pages/Listing.tsx` (`/new-in`, `/shop`, `/shop/:slug`, `/collections/:slug`; size, colour, price-band and in-stock filters with counts, sorting, filter state in the URL, "Show more", mobile filter toggle), `Collections` (`/collections`), `pages/Product.tsx` (`/products/:slug`: breadcrumb, gallery by colour, colour and size selection with per-variant stock, `?colour=&size=` deep links, size guide table, details, delivery and returns links, add to bag, Enquire sheet, Ask on WhatsApp with click log; the page's field shifts one tone toward the chosen colour), `pages/Contact.tsx` (`/contact`), `components/EnquiryForm.tsx`, `lib/whatsapp.ts` (with unit tests) |

## Verification
| Check | Result |
|-------|--------|
| `enquiries.db-test.ts` | 9 passed: stored with product, variant, normalised phone and hashed IP; consent, contact, message, phone, name and unknown-field validation; honeypot and timing drop; unpublished products not linked; 5 per hour per IP; 3 per hour per email across IPs; CHECKs; anonymous click stored with no personal fields; personal data and external paths rejected |
| `lib/whatsapp.test.ts` | Link encodes product name, SKU, colour, size and URL (testing-strategy.md §3) |
| End-to-end `browse-and-enquire.spec.ts` | 5 passed: E2E-1 browsing steps on desktop and mobile (pill → size filter → sort → product → colour → size → add to bag); deep link with a sold-out size; E2E-4 on mobile (validation errors, focus on the first invalid field, sent enquiry, WhatsApp link content, click logged); contact page, collections index, unknown category → Not found |
| Screenshots | `docs/reviews/browsing/2026-10-24/` (listing and product, desktop and mobile; enquiry errors at 390 px) |

Defect found and fixed: after a failed submit, focus moved before React had rendered the errors, so it did not reach the first invalid field; it now moves once the errors are on screen.

## Notes
- The admin enquiries inbox is Phase 16.
- No delivery or returns text is invented; the product page links to the policy pages, which hold placeholders until you supply the text (OD-09, OD-12).
