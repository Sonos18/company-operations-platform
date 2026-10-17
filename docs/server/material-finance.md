# Material finance (A4 contracts, A5 payments)

Server reference for supplier contracts, invoices, payment requests and payments on material
orders. Specs: `docs/superpowers/specs/2026-10-15-materials-a4-a5-contract-payment-design.md` and,
for small orders without a contract and cash payments,
`docs/superpowers/specs/2026-10-16-materials-a4a5-small-orders-design.md`. The flow adjustments of
`docs/superpowers/specs/2026-10-16-materials-a4a5-flow-adjustments-design.md` (C1-C5, see below) change
the small order rules R3, R4, R6 and the payment steps and supersede the earlier specs where they differ.

## Migrations

Applied in order; each takes `pg_advisory_xact_lock(71842, N)` and ends with `notify pgrst`.

| Migration | Lock | Content |
|---|---|---|
| `20261015090000_c1_material_finance_foundation` | 50 | Tables, RLS, finance read helpers, notification helpers, order-created trigger |
| `20261015090100_c1_material_contract_commands` | 51 | Record/amend/read contract, contract-level order JSON |
| `20261015090200_c1_material_payment_commands` | 52 | Invoices, payment requests, decisions, payments |
| `20261015090300_c1_material_finance_reads` | 53 | Finance facts, inbox facts, app notifications, installment reminders |
| `20261015090400_c1_material_finance_evidence` | 54 | Contract-level evidence roles, MIME rules, read gate |
| `20261015090500_c1_material_finance_hardening` | 55 | `material.read` on every write, money-free submitter notifications, amend replay version, read target MIME type, XML stored as octet-stream |
| `20261015090600_c1_material_finance_access` | 56 | Finance readers open orders, proposal contract status and creator link, reminder keys with contract id, cancel of approved requests by approvers, invoice re-check at approve/pay |
| `20261016090000_c1_material_small_order_contracts` | 57 | `documentation` on contracts (`contract` / `quotation_only`), nullable contract number and contract file, threshold helpers, image signed quotations, invoice requirement helper, `documentation` in the JSON views and notifications |
| `20261016090100_c1_material_small_order_payments` | 58 | `method` on payments (`bank_transfer` / `cash`), nullable `bank_reference`, cash rule in `c1_material_record_payment`, `method` in the payment request view |
| `20261016100000_c1_material_remove_proposal_invoice_names` | 59 | C1: drops the engineer and buyer invoice names (columns, override table, `c1_material_set_proposal_invoice_name`, helper) and their JSON keys; deletes the data |
| `20261016100100_c1_material_finance_flow_adjustments` | 60 | C2-C4: VAT on `quotation_only`, invoice `stage` and `c1_material_officialize_invoice`, image invoices, the accountant records payments, `material.payment.approved`, `draftInvoiced` |
| `20261017090000_c1_material_proposal_codes` | 61 | Proposal numbers and order codes: `proposal_no` / `order_seq` columns, assignment, immutability and backfill; the five read functions renamed to `*_core` and wrapped (see Proposal numbers and order codes) |
| `20261017090100_c1_material_proposal_notifications` | 62 | Proposal notifications (`material.proposal.submitted` / `approved` / `returned`, source type `material_proposal`), order label on order-side notifications, deferred `material.order.created` trigger |
| `20261017100000_c1_notifications_read_all` | 63 | Notification center: `c1_mark_notifications_read_all` marks the caller's own notifications read in both sources up to a per-source cutoff (see Mark all notifications read) |
| `20261017110000_c1_notifications_realtime` | 64 | Notification center realtime: `app_notifications` and `cost_workflow_notifications` join the `supabase_realtime` publication; `material.order.created` carries `actorName` (see Realtime notification refresh) |

`shared/types/database.types.ts` is generated (`pnpm db:dev:types`) and is not edited by hand.

## Proposal numbers and order codes

Plan: `docs/superpowers/plans/2026-10-17-materials-proposal-codes.md`. Spec: `docs/superpowers/specs/2026-10-17-materials-proposal-codes-design.md`. Every proposal has a per-project
number ("Đơn 18") and every order a per-proposal sequence ("ĐH 18-1"); the UI builds the labels with
`shared/utils/material-codes.ts`. The numbers are assigned by the database, never by the client.

### Numbers (migration 61)

- `material_proposals.proposal_no integer not null check (proposal_no > 0)`, `unique (project_id, proposal_no)`.
- `material_orders.order_seq integer not null check (order_seq > 0)`, `unique (proposal_id, order_seq)`.
- Trigger `material_proposal_no_assign` (before insert on `material_proposals`) takes the transaction advisory
  lock `(71843, hashtext(project_id))` and sets `proposal_no` to the project's largest number + 1. A
  `proposal_no` sent by the client is overwritten. Drafts are numbered too.
- Trigger `material_order_seq_assign` (before insert on `material_orders`) locks the proposal row and sets
  `order_seq` to the proposal's largest sequence + 1. A cancelled order keeps its sequence, so the next order
  never fills the gap. Numbers are max + 1 over every existing row, so they are only guaranteed never to be
  reused because no delete path exists for proposals or orders; adding one would need a different scheme.
- Trigger `material_codes_immutable` (before update on both tables) refuses any change of `proposal_no` or
  `order_seq` with `P0001` / `MATERIAL_CODE_IMMUTABLE`. It is a database guard that no command should hit, so
  `server/features/costs/rpc-errors.ts` has no mapping for it: it would surface as an unexpected error.
- Existing rows are numbered by creation order (`created_at`, then `id`). The backfill writes only the two new
  columns: no version bump and no history rows.

### Read functions are now `*_core` (edit those)

Migration 61 renamed five read functions and put a wrapper with the same name and signature in front of each.
The wrapper only attaches the new keys (`proposalNo`, `revisionNo`, `orderSeq`, `summary`, `projectName`,
`contractStatus[].orderSeq`); every caller (list, read, public wrappers) keeps calling the old name.

| Wrapper (unchanged name) | Function that holds the logic |
|---|---|
| `private.c1_material_proposal_json` | `private.c1_material_proposal_json_core` |
| `private.c1_material_order_json` | `private.c1_material_order_json_core` |
| `private.c1_material_read_contract` | `private.c1_material_read_contract_core` |
| `private.c1_material_finance_facts` | `private.c1_material_finance_facts_core` |
| `private.c1_material_finance_inbox_facts` | `private.c1_material_finance_inbox_facts_core` |

From now on a change to what these views return goes into the `_core` function (a new migration that
`create or replace`s it). Do not `create or replace` the wrapper name: that would replace the wrapper with a
copy of the old logic and silently drop the new keys. The wrappers only add keys; do not put filtering or
permission logic in them.

### Notifications (migration 62)

- `material_proposal_submitted_notify` (after insert on `material_proposal_revisions`) sends
  `material.proposal.submitted` to the active company members who hold `material.proposal.decide` and can read
  the proposal (`material.read` plus creator, decide, `material.order.manage` or `material.contract.record`),
  except the submitter of the revision. `material_proposal_decided_notify` (after insert on
  `material_proposal_decisions`) sends `material.proposal.approved` / `material.proposal.returned` to the
  `submitted_by` of the decided revision (today the same person as the proposal creator, because only the
  creator may submit), unless that person made the decision or cannot read the proposal. New source type `material_proposal`; dedupe keys `proposal:{id}:sub:{revision_no}`,
  `proposal:{id}:appr:{revision_no}` and `proposal:{id}:ret:{revision_no}`; link `/materials/{projectId}/proposals/{proposalId}`.
- `app_notifications_order_label` (before insert on `app_notifications`) adds `projectName`, `proposalNo` and
  `orderSeq` to the payload of every notification whose source is `material_order`, `material_contract`,
  `material_installment` or `material_payment_request`. The merge is per key (`label || payload`): a key the payload already carries wins,
  the missing ones are added. A source that resolves to no order keeps its payload unchanged. Notifications stored before this migration have no such keys and keep their old text.
- `material_order_created_notify` is now a deferred constraint trigger, so it runs after the order's
  allocations exist and can add the summary (`summaryName1`, `summaryName2`, `summaryTotal`) to
  `material.order.created`.

## Mark all notifications read ("Đánh dấu đã đọc hết")

Migration 63 (`20261017100000_c1_notifications_read_all`, lock `71842, 63`) adds the notification center command. The bell
(`app/components/costs/CostNotificationBell.vue`) calls it from the "Đánh dấu đã đọc hết" button, then reloads the list.

- RPC `public.c1_mark_notifications_read_all(target_company_id, target_material_up_to, target_cost_up_to)` wraps
  `private.c1_mark_notifications_read_all` and returns `{"material": n, "cost": m}` (rows marked per source). Only
  `authenticated` may execute the wrapper; the private function is revoked from everyone.
- Route: `POST /api/companies/{companyId}/notifications/read-all`, body `{ materialUpTo: string | null, costUpTo: string | null }`
  (ISO datetime with offset, strict), result `{ material: number, cost: number }` (strict). The client sends the raw
  `createdAt` string of the newest loaded notification of each source (microsecond precision is kept), never a value re-serialised through `Date`.
- Each source has its own cutoff. Only rows with `created_at <= cutoff` are marked, so a notification created after the list
  was loaded stays unread. A `null` cutoff skips that source: the client sends it when the source failed to load or has nothing loaded.
- Permission gates per source: `material.read` for `app_notifications`, `cost.notification.read` for `cost_workflow_notifications`.
  A caller without the permission gets that source untouched (count 0), not an error.
- Cost notifications are marked only when `delivery_state = 'available'`; `undelivered` rows were never shown.
- Only the caller's own rows in the given company are updated. A caller who is not an active company member gets `P0001` / `PERMISSION_DENIED`.
- No idempotency key and no command receipt: the `read_at is null` filter makes a repeat a no-op that returns `0`.

UI strings the notification center added beyond the plan: "Không thể đánh dấu đã đọc hết. Vui lòng thử lại." (read-all failed),
"Không nạp được thêm thông báo." ("Xem thêm" failed), the screen-reader-only modal description "Danh sách thông báo mới nhất", and the
unread dot label "Chưa đọc".

## Realtime notification refresh

Migration 64 (`20261017110000_c1_notifications_realtime`, lock `71842, 64`) lets the bell refresh as soon as a
notification arrives instead of waiting for the user to open it.

- Publication: the migration adds both `public.app_notifications` and `public.cost_workflow_notifications` to
  `supabase_realtime`. A table that is already published is skipped, so a rerun is safe; a project without the
  publication fails with `REALTIME_PUBLICATION_MISSING` instead of silently not publishing.
- RLS applies per subscriber: Realtime evaluates each table's select policy for every connected user, so a user only
  receives rows he can already read. The client also filters `recipient_id=eq.{currentUserId}` and listens to `INSERT`
  and `UPDATE`.
- Signal only: the composable `app/composables/useNotificationRealtime.ts` ignores the row payload. A signal
  triggers the same reload through the existing APIs (`GET /notifications`, `GET /cost-notifications`), which stay the
  only source of what the bell shows. The Realtime row payload does carry columns such as `tenant_id` and `source_id`,
  but they are columns the recipient can already read under the same RLS, so nothing new is exposed.
- Debounce: a trailing debounce of 1000 ms collects signals into one reload (ten signals within 200 ms load once), with a
  max-wait of 3000 ms so a steady stream of signals still reloads at least every 3 s.
- Background reloads: a reload caused by a signal never blanks the open list. The "Đang nạp thông báo..." placeholder is
  shown only while there is nothing to show, the cards and the scroll position stay, a source that fails to load keeps its
  cards, and a background reload does not clear the "mark all read" error (only a user-started load or retry does).
- Deferral: a signal that arrives while a load or "Đánh dấu đã đọc hết" is running is remembered and served by one
  background reload after the request finished, so the running request cannot overwrite newer data.
- Echo suppression: for 1500 ms after a load or mark-all that the bell started finishes, signals are treated as echoes of
  its own writes (`read_at` updates, cost notifications flipping from undelivered to available). They do not reload at once; if
  any arrived, one background reload runs at the end of the window, so a real new notification is delayed by at most
  1500 ms and never lost.
- Loading: the bell also loads on mount and whenever the company or the permissions change (the pending request is
  dropped on a change).
- Reconnect: when a channel returns to `SUBSCRIBED` after `CHANNEL_ERROR` or `TIMED_OUT`, the bell reloads once to catch
  up on what it missed. A channel closed by the server (`CLOSED`) is not re-subscribed until the key changes (company,
  permissions or user). If Realtime cannot connect at all (for example the fake Supabase URL of the e2e build),
  the bell still loads when the box is opened and nothing throws on the page.
- Channels: the material channel is gated by `material.read` (`app_notifications`) and the cost channel by
  `cost.notification.read` (`cost_workflow_notifications`); a user without one does not subscribe to its table. Changing company or
  signing out removes the old channels, and none is left after the component unmounts.

Other changes in the same migration and the app:

- `material.order.created` now carries `actorName` (the display name of the order creator: employee name, else sign-in
  email; the same rule as the proposal notifications). New text: title `{projectName} · ĐH {n}-{m} – Chờ hợp đồng`, body
  `{actorName} vừa tạo ĐH {n}-{m} · {supplierName} ({summary}), cần bạn bổ sung hợp đồng và chứng từ.` A payload stored
  before the migration has no `actorName`: the body uses "Mua hàng"; with no order code the old text is shown. Recipients,
  link and dedupe key (`order:{id}`) are unchanged.
- The badge "Cần xử lý" (tone `action`, violet) is shown for two events: `material.order.created` and
  `material.payment.approved`. Both are tasks waiting for the reader, unlike the "Cần duyệt" and "Đã duyệt" labels.

## Tables

| Table | Purpose |
|---|---|
| `material_contracts` | One record per material order (`order_id` unique), supplier, `documentation`, contract number (null for `quotation_only`), signing date, `current_version_no`, row `version` |
| `material_contract_versions` | Version 1 is the original, later ones are amendments: subtotal, VAT, total, order subtotal snapshot, variance reason, files (`contract_file_id` is null for `quotation_only`), amendment reason |
| `material_contract_installments` | Payment schedule per contract version; `installment_key` is stable across versions; `is_advance` marks advances |
| `material_invoices` / `material_invoice_lines` | Supplier invoices of a contract (`recorded` or `voided`) and the invoice material name per proposal line. `stage` is `draft` (a draft or signed copy) or `official` (default); `official_file_id`, `officialized_by` and `officialized_at` are filled when a draft is officialized (see Invoice stages) |
| `material_payment_requests` | Request against one installment: amount, state (`submitted`, `returned`, `approved`, `paid`, `cancelled`), revision, latest submitter |
| `material_payment_request_revisions` | Every submission of a request |
| `material_payment_request_invoices` | Invoices attached to a request (required for non-advance installments) |
| `material_payment_decisions` | Approve/return decisions per revision; a reason only for returns |
| `material_payments` | The recorded payment (by the accountant): paid date, `method` (`bank_transfer` or `cash`), bank reference (null for cash), proof file and its SHA-256 (unique per company) |
| `app_notifications` | In-app notifications per recipient, deduplicated by `(recipient_id, dedupe_key)` |

All tables have RLS. Money columns are readable only through `private.c1_material_can_read_finance`
(`material.read` plus one of `material.finance.read`, `material.contract.record`,
`material.payment.request`, `material.payment.approve`, `material.payment.execute`). Buyers and
engineers see whether an order has a contract (`c1_material_can_see_contract_status`) but no amounts.

## RPCs

Every public RPC is a `security definer` wrapper with `search_path = ''` granted to
`authenticated` (the reminder emitter only to `service_role`); the private implementation is
revoked from every role. Write commands take `(company, project, id, input jsonb,
idempotency_key, request_id)`, write a `cost_command_receipts` row and an `audit_events` row,
and return `{ resourceId, version, replayed }`. A replay with the same key and payload returns
the stored receipt version; the same key with another payload raises `IDEMPOTENCY_CONFLICT`.

| RPC | Permission (plus `material.read`) |
|---|---|
| `c1_material_record_contract`, `c1_material_amend_contract` | `material.contract.record` |
| `c1_material_read_contract` | finance read |
| `c1_material_record_invoice`, `c1_material_void_invoice`, `c1_material_officialize_invoice` | `material.contract.record` |
| `c1_material_create_payment_request`, `c1_material_resubmit_payment_request` | `material.payment.request` |
| `c1_material_cancel_payment_request` | `material.payment.request` for submitted/returned requests, `material.payment.approve` for approved ones |
| `c1_material_decide_payment_request` | `material.payment.approve` (the treasurer confirms the payment order or returns the request) |
| `c1_material_record_payment` | `material.payment.execute` (the accountant records the payment with the transfer receipt) |
| `c1_material_list_invoices`, `c1_material_list_payment_requests` | finance read |
| `c1_material_read_order`, `c1_material_list_orders` (A3, widened in 090600) | order readers (`material.order.manage`, `material.contract.record`, assigned notification readers) or finance readers; money only for finance readers |
| `c1_material_finance_facts`, `c1_material_finance_inbox_facts` | `material.read` (money only for finance readers) |
| `c1_list_app_notifications`, `c1_read_app_notification` | own notifications |
| `c1_material_create_evidence_intent`, `c1_material_evidence_finalization_target`, `c1_material_evidence_read_target` | role-dependent, see Evidence |
| `c1_material_emit_installment_reminders(target_today)` | `service_role` only |

Rules enforced in SQL (and mirrored in Zod in `shared/schemas/costs/material-finance.ts`):

- Locks are always `material_orders -> material_contracts` (contract commands) and
  `material_contracts -> material_payment_requests / material_invoices` (payment commands).
- A contract subtotal different from the order subtotal needs a variance reason; installments
  must add up to the version total.
- An amendment may not lower an installment below what is paid or pending on it, and the total
  may not fall below the recorded invoices.
- A request may not exceed the installment's remaining capacity (paid + submitted + approved).
- Non-advance installments need at least one recorded invoice. Approving and paying re-check this
  against the current installment, because an amendment may turn an advance into a normal installment.
- The latest submitter of a request may not decide it (`SELF_DECISION_FORBIDDEN`). Recording the payment has no such block: the accountant who requested a payment records it (C4).
- A non-advance installment needs a recorded invoice, draft or official, for every record, with or without a contract document.
- A decision `reason` is required for `return` and rejected for `approve`.
- A payment proof (by SHA-256) backs only one payment per company (`PROOF_ALREADY_USED`).

### Small orders without a contract and cash payments (R1-R12)

The flow adjustments (C2) supersede R3 (the threshold now also applies to the total after VAT), R4 (VAT is
allowed, so the single installment equals the total after VAT), R6 (withdrawn) and the exclusion in R12 and in
spec section 7 (see the rows below).

An order whose total is below the threshold may be recorded with a signed quotation instead of a
contract (`documentation = 'quotation_only'`), and its payment may be paid in cash. The same
`material_contracts` row is reused, so requests, installments, invoices, payments and figures keep
working. Every threshold check is made in the RPCs, so a direct API call cannot bypass the UI.
The TS constant is `MATERIAL_SMALL_ORDER_THRESHOLD` in `shared/constants/material-finance.ts`; a
guard test keeps it equal to the value in `private.c1_material_small_order_threshold()`.

| # | Rule |
|---|---|
| R1 | The threshold is `5000000` VND, compared with `<`. Exactly 5,000,000 still needs a contract and a bank transfer. |
| R1b | The threshold applies per order. Orders of the same supplier, receipt or day are never added up, and splitting one purchase into several small orders is not blocked (product decision). |
| R2 | The threshold applies only when the order currency is `VND`. Any other currency can neither skip the contract nor pay in cash. |
| R3 | `quotation_only` needs the order total (`order_subtotal_snapshot`), the entered `subtotal` and, since C2, the total after VAT all below the threshold, else `CONTRACT_REQUIRED`. The first check stops a 48 million order from being recorded as 4.9 million with a variance reason. The `subtotal` still needs a variance reason when it differs from the order total. |
| R4 | A `quotation_only` record generates exactly one installment: `name = 'Thanh toán 100%'`, `amount = total`, `due_on = signed_on`, `is_advance = false`. `amount` is the total after VAT (superseded by C2: VAT is optional, see Flow adjustments). The client sends no schedule. |
| R5 | A `quotation_only` record cannot be amended (`CONTRACT_AMENDMENT_UNAVAILABLE`). |
| R6 | **Superseded (withdrawn by C2).** A payment request of a `quotation_only` record used to need no invoice. Now `private.c1_material_installment_requires_invoice` is `not is_advance` again, so a `quotation_only` request needs a draft or official invoice like any other non-advance installment (create/resubmit, approve and record payment). |
| R7 | Cash needs both the current version total and that version's order subtotal snapshot (`order_subtotal_snapshot`) below the threshold, and VND, checked when the payment is recorded. If an amendment raised the total to the threshold or above after the request, or the order itself is at or above the threshold but was recorded as a contract with a low subtotal (and a variance reason), recording cash fails with `CASH_PAYMENT_NOT_ALLOWED`. The UI offers cash only when both values are small. |
| R8 | A bank transfer needs `bankReference`. A cash payment needs `bankReference` to be `null` (the TS schema normalizes an empty or blank string to `null`; the RPC rejects anything else with `INPUT_INVALID`). A CHECK ties `bank_reference` to the method. |
| R9 | A payment proof (PDF, JPEG or PNG) is required for both methods; `PROOF_ALREADY_USED` is unchanged. |
| R10 | A `signed_quotation` accepts PDF, JPEG and PNG on upload. A record with a contract needs the signed quotation to be `application/pdf` (`EVIDENCE_INVALID` otherwise); an image is valid only for `quotation_only`. |
| R11 | After recording (with or without a contract) the order is locked as before. |
| R12 | Notifications, reminders and the committed, paid and remaining figures treat these orders like orders with a contract. The former exception for "paid without invoice" in `shared/utils/material-finance-summary.ts` (spec section 7, which left out `quotation_only` records) is **superseded**: those records are counted again. |

Table checks that back the rules: `documentation in ('contract', 'quotation_only')`,
`(documentation = 'contract') = (contract_no is not null)`, a null `contract_file_id` only for an
original version with VAT 0 and a total below the threshold, `method in ('bank_transfer', 'cash')`
and `(method = 'bank_transfer') = (bank_reference is not null)`.

## RPC inputs and JSON views

New keys. The RPCs treat a missing key as the old behaviour, so old clients keep working.

| RPC | Input |
|---|---|
| `c1_material_record_contract` | `documentation`: `'contract'` (default when missing) with the existing keys, or `'quotation_only'` with `expectedOrderVersion`, `signedOn`, `subtotal`, `varianceReason`, `signedQuotationFileId` and the optional `vatAmount` (default `'0'`) and `total` (default `subtotal + vatAmount`). Sending `contractNo`, `contractFileId` or `installments` with `quotation_only` raises `INPUT_INVALID`. |
| `c1_material_record_invoice` | Optional `stage`: `'draft'` or `'official'` (default when missing) |
| `c1_material_officialize_invoice` | `{ expectedVersion, officialFileId }` on the invoice id; the caller needs `material.contract.record` and `material.read` |
| `c1_material_record_payment` | `method`: `'bank_transfer'` (default when missing) or `'cash'`; `bankReference` is `null` for cash |

| JSON | Change |
|---|---|
| `c1_material_read_contract` | `documentation`; `contractNo` may be `null`; a version's `contractFileId` may be `null`; top-level `draftInvoiced` (only the API view nests it as `totals.draftInvoiced`) |
| `c1_material_list_invoices` | `stage`, `officialFileId` and `officializedAt` (both `null` until officialized) |
| `c1_material_order_json`.`contract` | `documentation`; `contractNo` may be `null` |
| `c1_material_finance_facts` (each contract) | `documentation`; `contractNo` may be `null`; `draftInvoiced` (also in the totals) |
| Proposal `contractStatus[]` | `documentation`; `contractNo` may be `null` |
| Payment in the payment request view | `method`; `bankReference` may be `null` |
| Proposal lines | The invoice name keys are gone (C1): `engineerProposedInvoiceName`, `buyerProposedInvoiceName`, `effectiveInvoiceDisplayName`, `invoiceDisplayNameSource`, `buyerOverrideVersion`, `buyerInvoiceNameEditable`; the input no longer takes `proposedInvoiceName`. `currentRevisionId` stays |
| Notification payloads `material.contract.*`, `material.payment.*`, `material.installment.*` | `documentation`; `contractNo` may be `null` (the bell then shows "Đơn không hợp đồng") |

In the Zod view schemas `documentation` is `z.enum(['contract', 'quotation_only']).default('contract')`
and `method` is `z.enum(['bank_transfer', 'cash']).default('bank_transfer')`, so the new app still
reads a database that does not have the migrations yet.

## Flow adjustments (C1-C5)

Spec: `docs/superpowers/specs/2026-10-16-materials-a4a5-flow-adjustments-design.md`. No new error codes.

| # | Change |
|---|---|
| C1 | The invoice name proposed by the engineer and the name overridden by the buyer are removed with their data (migration 59). The invoice material name is only entered by the accountant on the invoice (`material_invoice_lines.invoice_material_name`); the form hints show the supplier name and the original material name. The route `.../proposals/:proposalId/lines/:lineId/invoice-name` is gone. |
| C2 | A `quotation_only` record may carry VAT. `vatAmount` and `total` are optional; a wrong sum raises `CONTRACT_TOTAL_MISMATCH`. The order total and the total after VAT must both be below `5000000` (else `CONTRACT_REQUIRED`; the form warns "Tổng sau VAT từ 5.000.000 đ trở lên phải có hợp đồng."). The generated installment "Thanh toán 100%" equals the total after VAT. R6 and the section 7 exclusion are superseded (see above). |
| C3 | Invoices have two stages (below). |
| C4 | The treasurer only confirms the payment order (UNC) or returns the request; the accountant records the payment with the transfer receipt (see Permissions). `SELF_DECISION_FORBIDDEN` stays on `decide_payment_request` only. |
| C5 | Labels only, no new state (below). |

### Invoice stages

- `stage = 'draft'` is a draft or signed copy waiting for the official invoice; `'official'` is the default and the
  value of every row that existed before. A CHECK allows exactly three combinations: draft with
  `official_file_id`, `officialized_by` and `officialized_at` all null; official with all three null (recorded as
  official directly); official with all three set (a draft that was officialized). `file_id` is the first file and is never overwritten.
- `c1_material_officialize_invoice` (`POST /api/companies/:companyId/projects/:projectId/material-procurement/invoices/:invoiceId/official`
  with an `Idempotency-Key` header; body `{ expectedVersion, officialFileId }`) needs `material.contract.record` and
  `material.read`. The invoice must be `recorded` and a draft, else `VERSION_CONFLICT`. The file must be an
  `invoice` role file of the same contract, finalized and unused, else `EVIDENCE_INVALID`;
  `c1_material_require_contract_file` now also checks `official_file_id`, so one file cannot back two invoices.
  The command bumps the row version, writes a receipt and an audit event, and sends no notification.
- A draft invoice counts as a valid invoice for `INVOICE_REQUIRED`. The links in `material_payment_request_invoices`
  do not change when the draft is officialized.
- The invoice evidence role accepts `application/pdf`, `application/xml`, `text/xml`, `image/jpeg` and `image/png` (drafts and official files alike).
- The invoice form offers "Bản nháp / bản đã ký (chờ bản chính thức)" (default) and "Hóa đơn chính thức"; the list shows the
  badge "Nháp" or "Chính thức" and a draft has the button "Cập nhật hóa đơn chính thức" (component `MaterialInvoiceOfficializeDialog`).

### Payment request labels (C5)

| State | Label |
|---|---|
| `submitted` | Chờ lập UNC |
| `approved` | Đã lập UNC – chờ giám đốc duyệt |
| `paid` | "Đã chi – chờ hóa đơn chính thức" while a linked invoice is a draft, else "Đã chi" |
| `returned` / `cancelled` | Bị trả lại / Đã hủy |

Buttons: the treasurer sees "Xác nhận đã lập UNC" ("Xác nhận đã lập UNC / đã chi tiền mặt" when the commitment allows cash) and "Trả lại";
the accountant sees "Cập nhật biên lai chuyển khoản" (`record_payment`).

### Figures

`totals.draftInvoiced` is the sum of `total` of `recorded` invoices with `stage = 'draft'`, per contract and per project;
the UI shows it as "Hóa đơn chờ bản chính thức". "Đã nhận hóa đơn" (`invoiced`) still counts every recorded invoice, draft or official, so officializing a
draft lowers `draftInvoiced` by that invoice's total and leaves `invoiced` unchanged.

## Error codes

Mapped to HTTP in `server/features/costs/rpc-errors.ts` and declared in `shared/schemas/api-error.ts`:

`CONTRACT_EXISTS`, `ORDER_NOT_ACTIVE`, `VARIANCE_REASON_REQUIRED`, `CONTRACT_TOTAL_MISMATCH`,
`INSTALLMENT_TOTAL_MISMATCH`, `AMENDMENT_BELOW_COMMITTED`, `INVOICE_TOTAL_EXCEEDED`,
`INVOICE_TOTAL_MISMATCH`, `INVOICE_DUPLICATE`, `INVOICE_IN_USE`, `INVOICE_NOT_RECORDED`,
`INVOICE_REQUIRED`, `INSTALLMENT_NOT_FOUND`, `INSTALLMENT_CAPACITY_EXCEEDED`,
`SELF_DECISION_FORBIDDEN`, `PROOF_ALREADY_USED`, `EVIDENCE_INVALID`, plus the small order codes
`CONTRACT_REQUIRED` (the order is not below the threshold, is not VND, or the entered subtotal is not
below it), `CASH_PAYMENT_NOT_ALLOWED` (the current total or the order subtotal snapshot is not below the
threshold, or the currency is not VND) and `CONTRACT_AMENDMENT_UNAVAILABLE` (amending a `quotation_only` record), plus the shared
`PERMISSION_DENIED`, `RESOURCE_NOT_FOUND`, `VERSION_CONFLICT`, `IDEMPOTENCY_CONFLICT`,
`INPUT_INVALID`, `PROJECT_COMPLETED`, `EVIDENCE_UPLOAD_MISMATCH`.

Database guard, not mapped in `rpc-errors.ts`: `MATERIAL_CODE_IMMUTABLE` (`P0001`, raised by trigger
`material_codes_immutable` when an update would change `proposal_no` or `order_seq`).

## Permissions

| Permission | Typical role |
|---|---|
| `material.read` | Everyone using the materials module; required by every A4/A5 command |
| `material.finance.read` | Director, accountant, treasurer: finance pages and amounts |
| `material.contract.record` | Accountant: contracts, amendments, invoices, officializing invoices |
| `material.payment.request` | Accountant: payment requests |
| `material.payment.approve` | Treasurer: confirm the payment order (UNC) or return the request |
| `material.payment.execute` | Accountant: record the payment with the transfer receipt (for cash, the sales invoice or the paid-on-behalf slip) |

The permission codes did not change in the flow adjustments; only the roles holding them did (`material.payment.execute`
moved from the treasurer to the accountant). The fixture script `supabase/fixtures/material-a4a5-finance-actors.sql`
(`pnpm db:dev:a4a5:finance-actors`) grants the permissions and, for the two fixture roles, removes the extra ones.

## Notification events

| Event | Recipients | Payload |
|---|---|---|
| `material.order.created` | `material.contract.record` holders | `supplierName`, `summaryName1`, `summaryName2`, `summaryTotal`, `projectName`, `proposalNo`, `orderSeq`, `actorName` |
| `material.proposal.submitted` / `approved` / `returned` | readers who can decide the proposal (submitted); the `submitted_by` of the decided revision (approved, returned; today the proposal creator); recipients need `material.read`, the actor is never notified | `projectName`, `proposalNo`, `revisionNo`, `actorName`, `summaryName1`, `summaryName2`, `summaryTotal`; `reason` on returned |
| `material.contract.recorded` / `material.contract.amended` | finance readers; buyer and proposal creator (by user id) | finance readers: `supplierName`, `contractNo`, `total`, `versionNo`; by user id: without `total`. The proposal creator's link opens the proposal, which lists `contractStatus` (order, contract number, signing date) |
| `material.payment.submitted` | `material.payment.approve` holders | `supplierName`, `contractNo`, `amount` |
| `material.payment.approved` | the submitter of the request, i.e. the accountant (by user id) | `projectId`, `contractId`, `supplierName`, `contractNo`, `documentation` (no amount). Sent when the treasurer confirms the payment order; it tells the accountant to upload the receipt |
| `material.payment.returned` | the submitter (by user id) | `supplierName`, `contractNo`, `reason` (no amount) |
| `material.payment.paid` | the treasurer who last approved the request (`decided_by` of the latest `approve` decision, by user id) | `supplierName`, `contractNo` (no amount) |
| `material.installment.due_soon` / `material.installment.overdue` | `material.contract.record` + `material.read` holders | `supplierName`, `contractNo`, `installmentName`, `dueOn`, `remaining` |

Notifications with source `material_order`, `material_contract`, `material_installment` or `material_payment_request`
also carry `projectName`, `proposalNo` and `orderSeq` (added by `app_notifications_order_label`).

Recipients always need `material.read`; the acting user is never notified. Notifications sent by
user id (not by a finance permission) never carry money. The bell renders them with
`app/utils/notifications/app-notification-text.ts`; all A4/A5 money is displayed with
`formatVnNumber` ("1.100.000", "12.500,5").

## Installment reminders

`POST /api/internal/material-reminders` with `Authorization: Bearer <NUXT_MATERIAL_REMINDER_SECRET>`
(compared in constant time; any mismatch or an empty secret returns 401). It calls
`c1_material_emit_installment_reminders(today)` with the service-role client, where `today` is the
Asia/Ho_Chi_Minh date. Installments with a remaining amount due within 3 days become `due_soon`,
past due become `overdue`; the dedupe key is `inst:<contractId>:<installmentKey>:<kind>:<dueOn>`, so
reruns on the same day are no-ops and an amendment that moves the date reminds again. Response: `{ dueSoon, overdue }`.

Configuration:

- Set `NUXT_MATERIAL_REMINDER_SECRET` (server only, see `.env.example`) per environment.
- Schedule one call per day at 07:00 Asia/Ho_Chi_Minh, which is `0 0 * * *` in UTC
  (InstaCloud cron job against the app service).

## Evidence

Contract-level evidence uses `material_evidence_scopes` with `target_kind = 'material_contract'`.

| Role | Allowed MIME types | Upload/finalize permission | Readers |
|---|---|---|---|
| `unsigned_quotation` | PDF | `material.order.manage` | order readers |
| `signed_quotation` | PDF, JPEG, PNG | `material.contract.record` | finance readers |
| `signed_contract`, `contract_amendment` | PDF | `material.contract.record` | finance readers |
| `invoice` | PDF, `application/xml`, `text/xml`, JPEG, PNG | `material.contract.record` | finance readers |
| `payment_proof` | PDF, JPEG, PNG | `material.payment.execute` (accountant) | finance readers |

Finalize downloads the object server-side and checks size, SHA-256, magic bytes and the stored
Content-Type before the service-role finalizer marks it finalized.

XML invoices:

- The XSS control is that XML is never served inline. The browser uploads XML as
  `application/octet-stream` (`shared/utils/evidence-storage-content-type.ts`); the bucket accepts
  octet-stream and no XML content type; finalize requires octet-stream for declared XML; and
  `readEvidenceUrl` signs every type other than PDF/PNG/JPEG as a download, whatever disposition
  the caller asked for. The declared MIME type on `cost_evidence_files` stays `application/xml` or
  `text/xml`.
- The content check (`server/features/costs/evidence/xml-evidence-validation.ts`) is an allowlist:
  UTF-8 only, optional XML declaration (encoding UTF-8), exactly one root element named in
  `XML_EVIDENCE_ROOT_ELEMENTS` (`HDon`, `TDiep`, `Invoice`), balanced tags, no DOCTYPE or ENTITY,
  no processing instruction besides the declaration, and only namespaces in
  `XML_EVIDENCE_NAMESPACES`. Extend those constants when a supplier's e-invoice format needs it.

## Deploy order

Apply `20261015090000` through `20261015090600` and deploy the app in the same window. The two
halves depend on each other, so either one alone breaks material order reads and evidence:

- Old app with the new database: the evidence read target now returns `declaredMimeType`, which the
  old strict schema rejects; finance readers depend on the widened order reads only the new app uses.
- New app with the old database: XML uploads are sent as `application/octet-stream`, which the old
  bucket allow-list refuses; finance readers (treasurer, director) get 403 from the order RPCs.
- The new app tolerates a missing `declaredMimeType` (it then always signs a download), so evidence
  reads keep working if the app goes out a little before the migration.
- `20261015090600` changes the reminder dedupe key to `inst:<contractId>:<installmentKey>:<kind>:<dueOn>`.
  If the 07:00 reminder job already ran on deploy day, due installments get one extra reminder that day.

### Small orders (`20261016090000`, `20261016090100`)

Apply both migrations and pull the app code immediately afterwards. Apply `20261016090000` before
`20261016090100`, which uses its helpers. Regenerate `shared/types/database.types.ts` with
`pnpm db:dev:types` after applying them.

- Old app with the new database: the strict Zod schemas of an old client reject the new keys
  (`documentation`, `method`, a null `contractNo`, `contractFileId` or `bankReference`), so an old app
  fails to read orders, contracts, finance facts, proposals and payment requests. Code cannot fix
  that direction.
- New app with the old database: ordinary orders keep working for reads and writes, so the app may
  go out slightly before the migrations. The view schemas default a missing `documentation` /
  `method` to `contract` / `bank_transfer`. The server repositories leave `documentation` out of the
  RPC input when it is `contract` and `method` out when it is `bank_transfer` (the RPCs treat a
  missing key as those values, and an idempotency receipt written before the migration hashes the
  same input). The API body schemas also accept a body without these keys and default them. Only
  recording a `quotation_only` record or a `cash` payment needs the migrations.

### Flow adjustments (`20261016100000`, `20261016100100`)

Apply both migrations in this order and ship the app in the same window; then regenerate `shared/types/database.types.ts`
with `pnpm db:dev:types` and rerun `pnpm db:dev:a4a5:finance-actors`. The two halves must go out together,
because the strict Zod schemas reject keys that were removed or added:

- Old app with the new database: proposal line views no longer have the six invoice name keys, invoice views have
  `stage`, `officialFileId` and `officializedAt`, and finance totals have `draftInvoiced`. The old strict schemas
  reject all of these, and the old app still sends `proposedInvoiceName`, which the new RPCs refuse.
- New app with the old database: the finance totals schema requires `draftInvoiced` and the strict proposal line schema rejects the
  name keys the old database still sends, so proposal and finance reads fail until `20261016100000` and
  `20261016100100` are applied (invoice views default a missing `stage` to `official`).
- Migration 59 deletes the engineer and buyer invoice names on Cloud DEV (agreed; the data is not kept). Existing
  proposals still read, edit and submit.
- `material.payment.approved` is added to the `event_kind` CHECK by migration 60. `material.payment.paid` now goes to
  the treasurer who approved the request.

### Proposal codes (`20261017090000`, `20261017090100`)

Apply both migrations in this order and ship the app in the same window; then regenerate
`shared/types/database.types.ts` with `pnpm db:dev:types`. The strict Zod schemas make the two halves depend on each other:

- Old app with the new database: proposal, order, contract, finance and inbox JSON carry the new keys, which the old
  strict schemas reject, and the three `material.proposal.*` event kinds are unknown to the old notification schema.
- New app with the old database: the new schemas require `proposalNo`, `orderSeq`, `summary` and the other keys, so
  proposal, order, contract and finance reads fail until migration 61 is applied.
- Later changes to the five read views belong in the `*_core` functions (see Proposal numbers and order codes).

## Known follow-ups

- Older A1–A3 procurement writes (proposals, orders, supplier names) still check only their own
  permission, not `material.read`; `c1_material_context` is module-wide and was left unchanged.
- Concurrency (two sessions creating requests for the same installment, T2 case 5) needs a
  two-session script; pgTAP has no `dblink` in this environment.
- The small order pgTAP files (`c1_material_small_order_contracts`, `c1_material_small_order_payments`)
  are registered in the same runner but have not been executed on Cloud DEV yet.
- The A3 and A4/A5 material pgTAP files are registered in `scripts/run-c1-cloud-dev-tests.mjs`
  (`materialSyntheticPrefixes`, run with `--materials`) but have not been executed on Cloud DEV yet.
- The CI runner lacks memory for `nuxt dev`; run e2e against a production build there, or locally
  with a warmed dev server (`PLAYWRIGHT_REUSE_EXISTING_SERVER=true`).
- XML evidence finalized before `20261015090500` (if any) is stored as `application/xml`; it is
  still always signed as a download.
