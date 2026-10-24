# Evaluation — Retention and Erasure of Personal Data in Append-Only Records

Status: **Evaluation and proposal, not a decision.** Retention periods and erasure duties are legal questions for your lawyer (OD-12, B-09); nothing here is legal advice. No code or migration has been changed for this. Date: 2026-10-25.

## 1. What is stored, and where it is hard to change
| Table | Personal data | Can rows be changed or deleted? | Default retention today (`database-design.md` §5) |
|-------|---------------|----------------------------------|---------------------------------------------------|
| `order` | email, phone, shipping and billing address (name, address, phone), customer note | Yes (no trigger); foreign keys prevent deleting an order that has items, events or payments | 8 years (accounting and GST records) |
| `order_item` | none (product snapshot only) | Yes | with the order |
| `order_status_event` | free-text `note` written by staff or the system; `actor_id` is an admin ID | **No: append-only trigger (D-057)** | not stated |
| `order_note` | free-text staff notes, which may mention the customer | **No: append-only trigger** | not stated |
| `notification` | `recipient` (the customer's email address) | Yes (no trigger), but `recipient` is NOT NULL | not stated |
| `payment_event` | `raw_payload`: none from the mock; a live gateway's payload may include email or phone | Yes (no trigger) | not stated (payments: 8 years) |
| `refund` | free-text `reason` | Yes | with payments |
| `enquiry` | name, email, phone, message | Yes | 2 years, then anonymised |
| `audit_log` | no personal data by design; IP as keyed hash | **No: append-only trigger** | 3 years |
| `whatsapp_click` | none (random session ID) | Yes | 12 months |

## 2. Findings
1. **Gaps in the retention table:** `order_status_event`, `order_note`, `notification` and `payment_event` have no stated period.
2. **Append-only versus erasure:** the triggers on `order_status_event` and `order_note` block every UPDATE and DELETE, including by the API's own database user. If a lawful erasure or minimisation request covers text in those rows, there is today no way to carry it out short of disabling the trigger by hand, which defeats its purpose and leaves no audit trail.
3. **Free text is the main risk:** order notes, status-event notes and refund reasons are free text, so personal data can enter them without any field being designed for it.
4. **Recipient addresses are duplicated** in `notification` for as long as the row lives.
5. **A live gateway's raw payload** (Phase 18) may bring new personal data into `payment_event`.

## 3. Proposal (for you and your lawyer)
1. **Fill the retention table** with a period for each table above, decided with your lawyer and accountant. Suggested starting points to discuss, not decisions: status events and order notes with the order (they are part of the order record); notification rows 12 months, then the recipient replaced by a masked form; payment events with payments, with personal fields removed from the stored payload once processed.
2. **A single, audited redaction path for append-only tables.** A database function, owned by a separate role and the only code allowed to bypass the triggers, that replaces the text of named rows with `[redacted]`, never deletes rows, and writes an audit entry with the request reference. The triggers would permit an UPDATE only inside that function (a transaction-local setting it sets), and only to the text columns. This keeps "nobody can rewrite history" while allowing lawful minimisation.
3. **Reduce what enters free text:** guidance in the admin under the note fields ("Do not record payment details or anything not needed for the order"); system notes already contain no personal data.
4. **Minimise copies:** store the masked address in `notification.recipient` from the start (the order already holds the full address), or allow it to be cleared after the retention period.
5. **Live gateway (Phase 18):** store only the fields the pipeline needs from the payload, not the whole body, unless the accountant or gateway terms require it.
6. **Scheduled retention job** (Phase 19, with hosting): anonymise enquiries after their period, delete WhatsApp clicks after 12 months, apply the agreed notification rule; every run audited.

## 4. What needs whom
| Question | Who decides |
|----------|-------------|
| Retention periods per table, and whether order records must be kept whole for 8 years | Lawyer and accountant (OD-12, B-14) |
| Whether erasure requests can apply to order history before that period ends | Lawyer |
| Whether to build the redaction path (proposal 2) and mask recipients (proposal 4) | You, after the above; both change unapproved migrations, so they are cheapest before approval |
