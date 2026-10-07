# Document-backed cost cutover (prepared; operation gates closed)

Owned implementation branch contains forward-only SQL preparation. Nothing here authorizes applying migrations, synthetic Cloud DEV fixture writes, business reconciliation, grants/onboarding, activation, publication, or Production operations. Cloud DEV is the only development database; no Local DB fallback.

## Read-only inventory and review

After separately approved migration application, use the guarded db:dev:c1:cost-workflow:inventory command with --company UUID --project UUID and a current scoped user session via TASKOVIA_WORKFLOW_USER_TOKEN. The script checks the canonical Cloud DEV origin and CLI link; it uses the publishable key plus user JWT, never the service-role key. It invokes only the stable read RPC. Output contains counts, sums, deterministic row hashes, publication status, mapping status, potential duplicate original hashes and missing cap mapping. It contains no original document bytes, object URLs, credentials, or worker/payroll basis.

Inventory preserves parent/detail/draft/published/source/payment/evidence snapshots in per-family checksums. Sums are recorded historical values, not verified cash. Do not add parent and detail totals or use source/invoice/upload amount as a cash fact. Ordinary subcontract details remain excluded in favour of canonical subcontract payments. Published parents without a published detail, unclassified rows, missing party, unsupported currency, ambiguous duplicate proofs and absent historical approval/remaining-cap facts are review blockers; do not synthesize replacements.

Finance API v1 remains unchanged. New project cash API responds with schemaVersion2: workflowCash plus categories, separate recorded retention and coverage. Current project-manager assignment and fresh user/company permissions control reads; cost.read alone does not open crew/payroll documents. Empty/unknown historical coverage remains not_recorded or partial, distinct from a documented verified zero. New outgoing cash is joined once through workflow payment identity. Subcontract amounts come only from the canonical row; reconciliation does not copy canonical cash amounts. Refund is actual received money; correction changes valid outgoing; neither changes grant consumption.

## Reviewed reconciliation manifest, preview first

Create a UTF-8 JSON manifest with schemaVersion1, canonical projectRef, exact companyId/projectId, inventoryScopeHash, review confirmations accountantReviewed/historicalCashOnly/noHistoricalApprovalFabricated=true, capMappingReviewed boolean and items. Each item has a stable idempotencyKey and input:
legacyKind ordinary_detail|subcontract_payment, legacyId, actualOutgoing decimal text, actualPaymentDate (real civil date for positive cash; null for reviewed zero), evidenceFileIds, nonempty reason, expectedLegacyHash.

Preview: pnpm db:dev:c1:cost-workflow:reconcile -- --manifest PATH.
Preview is local-only and prints exact-byte manifest SHA256, scope, changes and unresolved cap-review flag. A supporting original is mandatory for zero reviews too. Positive cash requires finalized payment proof. A legacy quote cannot prove a transfer. Subcontract reconciliation must retain the original recorded amount and known payment date; disagreements need a separately reviewed correction, not an edited canonical payment.

Execution requires a new explicit current request identifying DEV target/manifest/operation. Only then set TASKOVIA_WORKFLOW_RECONCILIATION_APPROVAL to the reviewed manifest SHA256 and use --execute --confirm-manifest-sha256 HASH. The script checks current inventory before the first write and uses current accountant cost.record_cash plus cost.coverage.assert permissions. Every row independently rechecks its exact legacy hash under locks, proof, scope and receipt. No actor IDs are accepted from manifest.

Commands are atomic per row, not across a batch. If a row fails or a response is lost, stop, retrieve fresh inventory, inspect existing audit/receipts, prepare a separately reviewed updated inventory hash and preserve ALL original item idempotency keys/inputs. Replay returns existing immutable mapping/cash. Do not create a new payment to compensate for an uncertain response. A reviewed zero creates a mapping only; positive ordinary creates verified opening cash with no manager approval or installment; subcontract maps the same canonical payment.

## Historical cap gate

Verifying cash does not establish all historical approved/unpaid obligations. Existing source-subcontract contracts with pre-workflow cash stay blocked for new installments even after cash reconciliation; cash mapping alone cannot unlock remaining cap. Cap reductions cannot go below current full grants plus original recorded legacy gross cash; refunds/corrections do not lower that floor. Historical remaining-cap opening/mapping requires a separately approved design and reviewed evidence before activation for an affected contract. Ordinary historical identified-basis/cap mapping likewise must be resolved in cutover review; no all-party cap or fake contract is inferred.

## Completion and originals

Completed projects cannot add/increase obligations/caps. Settlement uses only completion-captured remaining grants. Refund/correction can refer to those or separately verified historical cash. Historical opening cash is reviewed migration, never a new expense exception. Originals, import provenance, source figures and immutable audit are retained; no destructive cleanup is part of cutover.

## Subsequent gates

1. Review and authorize exact DEV migrations and bounded SQL/race fixture manifest; run exact checks and retain evidence. Prepared source/unit tests are not DB runtime verification.
2. Resolve real accountant/manager/director account memberships and minimal grants through supported onboarding; director remains fixed vqh-director@taskovia.invalid, no substitute.
3. Review each historical reconciliation and cap-mapping blocker, then separately authorize the exact business-data manifest.
4. Validate private Storage/RLS/signed-URL scope, completion/refund/correction, idempotency and concurrent handover/offboarding/cap locks on Cloud DEV.
5. Confirm external OCR provider/privacy/input/cost gate separately. Offline fixtures may prefill; accountant always reviews; never auto-post.
6. Review activation manifest and user flows, then request explicit activation/publication/release authorization. Retire source/Excel-cell reconciliation UX only after verified replacement is active; retain history.
