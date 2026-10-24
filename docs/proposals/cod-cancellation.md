# Proposal — Cancelling Orders, Including Unconfirmed COD (D-160)

Status: **Proposal. Not approved, not implemented.** The code still behaves as built in Phase 16, pinned by `admin-orders.db-test.ts` "cancellation by role (current behaviour, pending D-160)". Date: 2026-10-25.

## 1. The conflict, exactly
| Source | Statement | Unconfirmed COD: may Fulfilment cancel? |
|--------|-----------|------------------------------------------|
| `system-design.md` §5, line 137 | "PENDING_CONFIRMATION … Manager/Owner/Fulfilment (confirm, cancel)" | Yes |
| `system-design.md` §5, line 142 | "CANCELLED … System, Manager, Owner" | No |
| `security-design.md` §4, line 70 | "Cancel orders, issue refunds: Owner ✔, Manager ✔, Catalogue editor –, Fulfilment –" | No |
| `security-design.md` §4, line 69 | "Fulfilment transitions: Owner, Manager, Fulfilment" | Unclear |
| `project-requirements.md` line 39 | Fulfilment: "Orders (view, fulfilment updates)" | Suggests no |
| `project-requirements.md` line 204 (UF-7) | "Admin cancels before dispatch" | Not specific |
| D-160 (proposed) | Fulfilment may cancel unconfirmed COD; cites line 137 only | Yes |
| Code `packages/shared/src/orders/transitions.ts` line 21 | PENDING_CONFIRMATION → CANCELLED: Owner, Manager, Fulfilment | Yes |

`system-design.md` contradicts itself, so the conflict cannot be settled by reading the documents. It needs your choice.

## 2. The choice you need to make
**Choice A (recommended): Fulfilment may decline an unconfirmed COD order, with a reason.** The person making the confirmation call learns that the customer does not want the order; declining at once returns the stock. No money has moved on an unconfirmed COD order, so no refund is involved.

**Choice B: Only Owner and Manager may cancel.** Fulfilment records the outcome of the call (a note, and the order is flagged); an Owner or Manager cancels, or the 48-hour job does. Tighter control, slower release of stock.

Either way, these stay as they are: only Owner and Manager may cancel a confirmed or packed order; nobody cancels after dispatch (use return to origin or a return); the system cancels unpaid online orders when their hold lapses and unconfirmed COD orders after the window.

A second, smaller choice: **must every cancellation carry a reason code?** Recommended yes. The proposed codes are in §4; you may change the list.

## 3. Proposed matrix (if you choose A)
| Action | From status | Owner | Manager | Fulfilment | Catalogue editor | System |
|--------|-------------|:-----:|:-------:|:----------:|:----------------:|:------:|
| Decline unconfirmed COD | PENDING_CONFIRMATION | ✔ | ✔ | ✔ (reason required) | – | ✔ (after the window) |
| Cancel unpaid online order | PENDING_PAYMENT | – | – | – | – | ✔ (hold lapsed) |
| Cancel confirmed order | CONFIRMED, PACKED | ✔ | ✔ | – | – | ✔ (paid with no stock, SR-10) |
| Cancel after dispatch | SHIPPED and later | not allowed: return to origin or a return |
| Return to origin, restock on receipt | SHIPPED → RETURN_TO_ORIGIN | ✔ | ✔ | ✔ | – | – |
| Customer return, restock after inspection | DELIVERED → RETURN_REQUESTED → RETURNED | ✔ | ✔ | – | – | – |
| Record and complete refunds | paid orders | ✔ | ✔ | – | – | ✔ (system record only) |

With choice B, the first row's Fulfilment cell becomes "–".

## 4. Reason codes (proposed)
`CUSTOMER_REQUESTED`, `CUSTOMER_UNREACHABLE` (after the confirmation attempts), `SUSPECTED_FRAUD`, `OUT_OF_STOCK`, `ADDRESS_UNSERVICEABLE`, `OTHER` (free-text note required). System cancellations keep their own codes: `PAYMENT_NOT_COMPLETED`, `NOT_CONFIRMED_IN_WINDOW`, `PAID_NO_STOCK`.

## 5. Implementation once you decide
1. **Permission:** add `orders.declineCod` to `PERMISSIONS` (A: O M F; B: O M) next to `orders.cancelRefund` (O M), and a matching row in `security-design.md` §4 ("Decline unconfirmed COD orders"). The document test that compares §4 with the code then covers it, and the role-matrix test exercises it for all four roles.
2. **Transitions table:** the PENDING_CONFIRMATION → CANCELLED move requires `orders.declineCod`; CONFIRMED and PACKED → CANCELLED require `orders.cancelRefund`. The API checks both the permission and the table; the admin app hides buttons with the same functions.
3. **Reason:** `toStatus: CANCELLED` requires `reason` (one of §4) and, for `OTHER`, a note; `400 VALIDATION_FAILED` otherwise. Stored on the order status event (a new nullable `reason` column, in an amended migration before approval) and in the audit entry `order.status_changed` as `{ status, reason }` without personal data.
4. **Documents:** `system-design.md` §5 line 142 and `security-design.md` §4 line 70 reworded to match, D-160 marked decided.
5. **Tests:** the pinned table in `admin-orders.db-test.ts` updated to the decided matrix; role-matrix rows for both permissions; reason required, unknown reason refused, audit content checked; the end-to-end E2E-2 flow unchanged.
