# Material finance (A4 contracts, A5 payments)

Server reference for supplier contracts, invoices, payment requests and payments on material
orders. Specs: `docs/superpowers/specs/2026-10-15-materials-a4-a5-contract-payment-design.md` and,
for small orders without a contract and cash payments,
`docs/superpowers/specs/2026-10-16-materials-a4a5-small-orders-design.md`.

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

`shared/types/database.types.ts` is generated (`pnpm db:dev:types`) and is not edited by hand.

## Tables

| Table | Purpose |
|---|---|
| `material_contracts` | One record per material order (`order_id` unique), supplier, `documentation`, contract number (null for `quotation_only`), signing date, `current_version_no`, row `version` |
| `material_contract_versions` | Version 1 is the original, later ones are amendments: subtotal, VAT, total, order subtotal snapshot, variance reason, files (`contract_file_id` is null for `quotation_only`), amendment reason |
| `material_contract_installments` | Payment schedule per contract version; `installment_key` is stable across versions; `is_advance` marks advances |
| `material_invoices` / `material_invoice_lines` | Supplier invoices of a contract (`recorded` or `voided`) and the invoice material name per proposal line |
| `material_payment_requests` | Request against one installment: amount, state (`submitted`, `returned`, `approved`, `paid`, `cancelled`), revision, latest submitter |
| `material_payment_request_revisions` | Every submission of a request |
| `material_payment_request_invoices` | Invoices attached to a request (required for non-advance installments) |
| `material_payment_decisions` | Approve/return decisions per revision; a reason only for returns |
| `material_payments` | The recorded payment: paid date, `method` (`bank_transfer` or `cash`), bank reference (null for cash), proof file and its SHA-256 (unique per company) |
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
| `c1_material_record_invoice`, `c1_material_void_invoice` | `material.contract.record` |
| `c1_material_create_payment_request`, `c1_material_resubmit_payment_request` | `material.payment.request` |
| `c1_material_cancel_payment_request` | `material.payment.request` for submitted/returned requests, `material.payment.approve` for approved ones |
| `c1_material_decide_payment_request` | `material.payment.approve` |
| `c1_material_record_payment` | `material.payment.execute` |
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
- The latest submitter of a request may neither decide nor pay it (`SELF_DECISION_FORBIDDEN`).
- A decision `reason` is required for `return` and rejected for `approve`.
- A payment proof (by SHA-256) backs only one payment per company (`PROOF_ALREADY_USED`).

### Small orders without a contract and cash payments (R1-R12)

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
| R3 | `quotation_only` needs both the order total (`order_subtotal_snapshot`) and the entered `subtotal` below the threshold, else `CONTRACT_REQUIRED`. The first check stops a 48 million order from being recorded as 4.9 million with a variance reason. The `subtotal` still needs a variance reason when it differs from the order total. |
| R4 | A `quotation_only` record generates exactly one installment: `name = 'Thanh toán 100%'`, `amount = total`, `due_on = signed_on`, `is_advance = false`. The server sets `vat_amount = 0` and `total = subtotal`; the client sends no schedule. |
| R5 | A `quotation_only` record cannot be amended (`CONTRACT_AMENDMENT_UNAVAILABLE`). |
| R6 | A payment request of a `quotation_only` record needs no invoice. This applies to create/resubmit, approve and record payment through `private.c1_material_installment_requires_invoice`. Invoices may still be recorded. |
| R7 | Cash needs the current version total below the threshold and VND, checked when the payment is recorded. If an amendment raised the total to the threshold or above after the request, recording cash fails with `CASH_PAYMENT_NOT_ALLOWED`. |
| R8 | A bank transfer needs `bankReference`. A cash payment needs `bankReference` to be `null` (the TS schema normalizes an empty or blank string to `null`; the RPC rejects anything else with `INPUT_INVALID`). A CHECK ties `bank_reference` to the method. |
| R9 | A payment proof (PDF, JPEG or PNG) is required for both methods; `PROOF_ALREADY_USED` is unchanged. |
| R10 | A `signed_quotation` accepts PDF, JPEG and PNG on upload. A record with a contract needs the signed quotation to be `application/pdf` (`EVIDENCE_INVALID` otherwise); an image is valid only for `quotation_only`. |
| R11 | After recording (with or without a contract) the order is locked as before. |
| R12 | Notifications, reminders and the committed, paid and remaining figures treat these orders like orders with a contract. The exception is "paid without invoice" in `shared/utils/material-finance-summary.ts`, which leaves out `quotation_only` records (payments and invoices both). |

Table checks that back the rules: `documentation in ('contract', 'quotation_only')`,
`(documentation = 'contract') = (contract_no is not null)`, a null `contract_file_id` only for an
original version with VAT 0 and a total below the threshold, `method in ('bank_transfer', 'cash')`
and `(method = 'bank_transfer') = (bank_reference is not null)`.

## RPC inputs and JSON views

New keys. The RPCs treat a missing key as the old behaviour, so old clients keep working.

| RPC | Input |
|---|---|
| `c1_material_record_contract` | `documentation`: `'contract'` (default when missing) with the existing keys, or `'quotation_only'` with only `expectedOrderVersion`, `signedOn`, `subtotal`, `varianceReason`, `signedQuotationFileId`. Sending `contractNo`, `contractFileId`, `vatAmount`, `total` or `installments` with `quotation_only` raises `INPUT_INVALID`. |
| `c1_material_record_payment` | `method`: `'bank_transfer'` (default when missing) or `'cash'`; `bankReference` is `null` for cash |

| JSON | Change |
|---|---|
| `c1_material_read_contract` | `documentation`; `contractNo` may be `null`; a version's `contractFileId` may be `null` |
| `c1_material_order_json`.`contract` | `documentation`; `contractNo` may be `null` |
| `c1_material_finance_facts` (each contract) | `documentation`; `contractNo` may be `null` |
| Proposal `contractStatus[]` | `documentation`; `contractNo` may be `null` |
| Payment in the payment request view | `method`; `bankReference` may be `null` |
| Notification payloads `material.contract.*`, `material.payment.*`, `material.installment.*` | `documentation`; `contractNo` may be `null` (the bell then shows "Đơn không hợp đồng") |

In the Zod view schemas `documentation` is `z.enum(['contract', 'quotation_only']).default('contract')`
and `method` is `z.enum(['bank_transfer', 'cash']).default('bank_transfer')`, so the new app still
reads a database that does not have the migrations yet.

## Error codes

Mapped to HTTP in `server/features/costs/rpc-errors.ts` and declared in `shared/schemas/api-error.ts`:

`CONTRACT_EXISTS`, `ORDER_NOT_ACTIVE`, `VARIANCE_REASON_REQUIRED`, `CONTRACT_TOTAL_MISMATCH`,
`INSTALLMENT_TOTAL_MISMATCH`, `AMENDMENT_BELOW_COMMITTED`, `INVOICE_TOTAL_EXCEEDED`,
`INVOICE_TOTAL_MISMATCH`, `INVOICE_DUPLICATE`, `INVOICE_IN_USE`, `INVOICE_NOT_RECORDED`,
`INVOICE_REQUIRED`, `INSTALLMENT_NOT_FOUND`, `INSTALLMENT_CAPACITY_EXCEEDED`,
`SELF_DECISION_FORBIDDEN`, `PROOF_ALREADY_USED`, `EVIDENCE_INVALID`, plus the small order codes
`CONTRACT_REQUIRED` (the order is not below the threshold, is not VND, or the entered subtotal is not
below it), `CASH_PAYMENT_NOT_ALLOWED` (the committed total is not below the threshold or the
currency is not VND) and `CONTRACT_AMENDMENT_UNAVAILABLE` (amending a `quotation_only` record), plus the shared
`PERMISSION_DENIED`, `RESOURCE_NOT_FOUND`, `VERSION_CONFLICT`, `IDEMPOTENCY_CONFLICT`,
`INPUT_INVALID`, `PROJECT_COMPLETED`, `EVIDENCE_UPLOAD_MISMATCH`.

## Permissions

| Permission | Typical role |
|---|---|
| `material.read` | Everyone using the materials module; required by every A4/A5 command |
| `material.finance.read` | Director, accountant, treasurer: finance pages and amounts |
| `material.contract.record` | Accountant: contracts, amendments, invoices |
| `material.payment.request` | Accountant: payment requests |
| `material.payment.approve` | Treasurer: approve or return |
| `material.payment.execute` | Treasurer: record the transfer and upload the proof |

## Notification events

| Event | Recipients | Payload |
|---|---|---|
| `material.order.created` | `material.contract.record` holders | `supplierName` |
| `material.contract.recorded` / `material.contract.amended` | finance readers; buyer and proposal creator (by user id) | finance readers: `supplierName`, `contractNo`, `total`, `versionNo`; by user id: without `total`. The proposal creator's link opens the proposal, which lists `contractStatus` (order, contract number, signing date) |
| `material.payment.submitted` | `material.payment.approve` holders | `supplierName`, `contractNo`, `amount` |
| `material.payment.returned` | the submitter (by user id) | `supplierName`, `contractNo`, `reason` (no amount) |
| `material.payment.paid` | the submitter (by user id) | `supplierName`, `contractNo` (no amount) |
| `material.installment.due_soon` / `material.installment.overdue` | `material.contract.record` + `material.read` holders | `supplierName`, `contractNo`, `installmentName`, `dueOn`, `remaining` |

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
| `invoice` | PDF, `application/xml`, `text/xml` | `material.contract.record` | finance readers |
| `payment_proof` | PDF, JPEG, PNG | `material.payment.execute` | finance readers |

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

Apply both migrations and pull the app code immediately afterwards. The strict Zod schemas of an old
client reject the new keys (`documentation`, `method`, a null `contractNo`, `contractFileId` or
`bankReference`), so an old app on the new database fails to read orders, contracts, finance facts,
proposals and payment requests. Code cannot fix that direction. The new app reads the old database
(missing keys default to `contract` and `bank_transfer`), so the app may go out slightly before the
migrations. Apply `20261016090000` before `20261016090100`, which uses its helpers. Regenerate
`shared/types/database.types.ts` with `pnpm db:dev:types` after applying them.

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
