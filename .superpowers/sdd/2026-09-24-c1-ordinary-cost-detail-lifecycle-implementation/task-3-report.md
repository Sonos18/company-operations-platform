# Task 3 report — P11–P15

## Status

Implemented locally and committed after local verification. No Cloud DEV, local database, production target, reset, repair, seed, or migration application was run.

## Scope delivered

- P11: hardened `project_cost_item_detail_sources` with forced RLS, authenticated read-only access, and lifecycle-aware visibility; existing parent `project_cost_item_sources` rows are neither copied nor inferred.
- P12: added the nullable detail evidence target, composite scoped FK, exactly-one target constraint, detail indexes/uniqueness, guarded idempotent detail-link RPC, shared/server/HTTP contracts, and `POST`/`GET /api/companies/:companyId/project-cost-details/:detailId/evidence` handlers. The RPC accepts only finalized evidence from the same project, tenant, and company; linking has no financial mutation.
- P12 raw access: finalized evidence linked only to a published detail is readable only with both `cost.read` and `cost.file.read`; a draft detail link does not grant raw access. Existing parent/payment target alternatives remain valid.
- P13: finance detail queries project and require `publication_state = 'published'`; reducer and coherence logic also reject explicitly draft details. A legacy Project Cost detail response already had this filter and was retained.
- P14: a narrowly scoped compatibility trigger keeps legacy parent snapshot preparation rows draft, publishes those draft snapshot children when the parent publishes, and marks legacy correction replacements published when the legacy snapshot write flag is active. The parent route surface remains available with a deprecation note. No detail source/evidence attribution is invented.
- P15: detail RPC errors use the existing stable repository mappings; the new detail evidence RPC emits only stable `PERMISSION_DENIED`, `INPUT_INVALID`, `RESOURCE_NOT_FOUND`, and `IDEMPOTENCY_CONFLICT` errors rather than constraint text.

## Tests authored/updated

- Added a rollback-safe pgTAP contract at `supabase/tests/database/c1/c1_ordinary_cost_detail_provenance_evidence_reads.test.sql` before generating the migration. It asserts scope/target/RLS/privilege/raw-read/derived-parent structural invariants. Per task instruction, it was not executed against any database.
- Added local unit coverage for detail evidence schemas, route binding, service capabilities, HTTP endpoint routing, and exclusion of explicit draft details from finance totals/retention.
- Updated the existing concrete-finance fixture to represent the now-selected `publication_state` column as `published`.

## TDD evidence

The initial detail-evidence schema test was observed RED before implementation: the missing `costEvidenceDetailLinkInputSchema` produced `TypeError: Cannot read properties of undefined (reading 'safeParse')`. After the contract/API implementation, the focused suite passed.

## Verification

| Check | Result |
| --- | --- |
| Focused evidence/finance unit tests | pass — 56 tests in 6 files |
| `pnpm test:unit` | pass — 164 files, 1,440 tests |
| `pnpm typecheck` | pass |
| `git diff --check` | pass |

The commands warned that the active Node is `v22.23.2` while the project requests Node 24.x; no test/typecheck failure resulted.

## Review and remaining risks

- Migration SQL and pgTAP were reviewed statically only. It must be exercised through the authorized Cloud DEV migration/pgTAP stage before any production decision.
- Existing legacy parent evidence/source links stay parent-scoped by design; no historical child attribution was created.
- No generated database types were refreshed because that workflow would touch the Cloud DEV target and is outside this task's authorization.

## Fix round 1

Addressed the post-review findings without database execution:

- A single draft-detail evidence link now blocks raw access to the file even if another parent/payment link would otherwise be readable. Raw access becomes eligible only after every linked detail is published.
- Evidence-link metadata RLS now requires `cost.source.read`; `cost.file.read` alone cannot enumerate metadata.
- The detail evidence RPC validates the evidence UUID before casting and converts relation/constraint conflicts into `INPUT_INVALID`; idempotency replay/conflict behavior remains receipt-backed.
- Legacy parent compatibility now keeps a valid legacy shape while snapshot replacement rows are inserted and upgrades those rows to the actual correction audit actor/time/request metadata inside the same transaction. Parent publishing continues to promote its draft children with the parent command identity.
- Finance readers, reducer, and coherence check require the literal `published` state; missing or unknown detail lifecycle state is rejected.
- The pgTAP file now contains rollback-safe behavioral fixtures for replay, invalid UUIDs, exact-one targets, mixed raw visibility, metadata RLS, financial neutrality, parent-publish child promotion, and legacy correction command metadata. It remains unexecuted by instruction.

Additional verification:

| Check | Result |
| --- | --- |
| Focused finance/evidence unit tests | pass — 66 tests in 6 files |
| `pnpm test:unit` | pass — 164 files, 1,441 tests |

No Cloud DEV or local database action was performed in this fix round.
