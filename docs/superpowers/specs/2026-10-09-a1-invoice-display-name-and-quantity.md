# A1 amendment: anticipated invoice display name and quantity presentation

Date: 2026-10-09 (Asia/Bangkok)
Status: Draft for Sơn review. Source base: 6fe710abd62bba9a971dd61cf12413716164cfc6. This document does not authorize a Cloud DEV migration or preview deployment.

## Intent and approved decisions

During alpha testing, Sơn asked for an anticipated invoice display name on each material request line for both the engineer and Buyer. The engineer may leave it blank; the effective name then uses the canonical material name. An engineer-entered name takes precedence over that fallback. Buyer may set a separate override, with effective priority Buyer override → engineer suggestion → canonical name. Buyer must not gain permission to edit the engineer's proposal or its submitted snapshot. Buyer can edit this override after submission and before that line enters an order; a new engineer submission revision requires a new Buyer override. Quantities should display without trailing fractional zeros, while the stored decimal remains positive and exact.

This is an anticipated label. It is distinct from the supplier's quotation name and from the actual name read from an invoice at payment time. The later accountant flow must verify the actual invoice and may use the anticipated label only as a suggestion. Neither document data nor these labels may rewrite the canonical material catalog.

## Existing boundaries

The live A1 proposal DTO accepts lineId, materialId and quantity only. PostgreSQL material_proposal_lines stores material identity and numeric(20,4) quantity; immutable material_proposal_revision_lines snapshots canonical name/specification/unit/quantity on submit. Buyer has read/decide/order authority but no update-proposal authority. The submitted/approved read path returns the snapshot, not the live catalog name. A1 T5 UI excludes supplier, price and invoice fields by its earlier packet. The T8 design currently captures an actual invoice name from invoice evidence.

The approved source SHA and preview remain the A1 baseline. All database migrations already applied there are forward-only.

## Approaches considered

1. **Selected: separate engineer suggestion and Buyer overlay by revision.** Store the engineer's optional suggestion on the mutable line and in the immutable submitted revision. Store Buyer changes in a separately versioned, audited override keyed to the submitted revision and line. Reads compute the priority without changing the engineer's record or an existing order.
2. One shared mutable field on the proposal line is shorter but allows Buyer to change the meaning of a submitted engineer snapshot. It is rejected.
3. Add the name only to an order or actual invoice is consistent with the previous design but does not provide the requested Buyer input on the proposal before an order. It is rejected for this amendment.

## Data and command contract

A forward-only migration adds nullable engineer_proposed_invoice_name to material_proposal_lines and material_proposal_revision_lines, with trimmed nonblank values capped at 200 characters when present. Existing rows need no backfill. Draft reads resolve an empty suggestion against the current canonical material name. A submitted revision resolves against its frozen material_name snapshot, so later catalog renames do not alter the historical fallback.

A new material_proposal_invoice_name_overrides table stores a current Buyer override per (revision_id, proposal_line_id), tenant/company/project/proposal scope, its own nonnegative version and actor/timestamps. A null override means fallback to the engineer or canonical value. An absent row has buyerOverrideVersion 0; first set creates version 1, and each later set or clear increments it. Repeating the same idempotency key and payload returns the same result, while a stale expected version or changed payload under the same key conflicts. The associated append-only audit event records set/clear and previous/new values. RLS and grants deny direct client writes; a security-definer command enforces scope, permission material.order.manage, current revision, expected override version and idempotency key. It permits set/clear only when the proposal is submitted or approved and the affected revision line has no non-cancelled order allocation. It never changes proposal.version, the engineer line, the submitted revision, an order, or the actual invoice record. A returned/resubmitted proposal has a new revision and therefore starts without a Buyer override.

Engineer create/update DTO adds optional proposedInvoiceName to each line. Missing, null or whitespace-only input means no engineer override; nonblank input is trimmed and capped at 200 characters. Server and SQL validate this, including replay hashing, before storing. The engineer may edit it only on the engineer-owned draft or returned proposal under existing permissions. Submit copies it into the immutable revision.

Canonical proposal GET returns per line: engineerProposedInvoiceName (nullable), buyerProposedInvoiceName (nullable), effectiveInvoiceDisplayName (nonblank), invoiceDisplayNameSource (buyer, engineer or canonical) and buyerOverrideVersion. Buyer writes through a dedicated line-name endpoint/command, not the general proposal PATCH. The command returns an acknowledgement; UI follows with canonical GET and a fresh DOM update. Other-company actors, peer engineers and a Buyer without material.order.manage are denied. Existing quote-name mapping and T8 invoiceNames remain separate.

## UI ownership and quantity presentation

AGY owns the T5/T7 Vue and E2E work. On engineer draft/returned line, show an optional field labeled “Tên dự kiến trên hóa đơn”, with a clear hint that blank uses the canonical material name. On Buyer submitted/approved detail, show the effective name and a separate override control only while the line is eligible; do not expose the engineer proposal edit form to Buyer. Show the source of the effective value. Existing orders and submitted snapshots remain read-only.

For every A1 proposal quantity surface, display 20.0000 as 20, 25.5000 as 25.5 and 0.0000 progress as 0. Do not use floating-point arithmetic for formatting or change numeric(20,4) storage. Editable input hydrated from canonical GET may be trimmed, but no-op comparison, 409 replay and save payload must treat 20 and 20.0000 as equal. Do not rewrite text while the user is typing. Empty, zero and negative quantities remain invalid; the existing signed-quantity floor remains.

## Verification and rollout

Codex owns schema/API/RPC/contract tests; AGY owns UI/E2E. Source tests must cover fallback, engineer override, frozen revision after catalog rename, Buyer precedence and clear, resubmission reset, per-line order lock, scope/RLS/permission denial, idempotency/version conflict and no general Buyer proposal PATCH. UI tests must cover both roles, canonical GET → fresh DOM/reload, provenance, trailing-zero formatting, positive validation, unchanged-draft no-PATCH and existing 409 retry. The actual invoice-name capture must remain independent.

No existing migration is edited. After source review, a separate exact Cloud DEV packet must authorize the corrective migration, guarded pgTAP, typegen and any fixture update. A separate preview packet must authorize redeployment. No Production action or merge is part of this amendment.
