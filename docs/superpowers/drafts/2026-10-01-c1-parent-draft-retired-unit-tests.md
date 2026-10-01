# Parent draft retirement unit test audit

Compared with the isolated implementation branch base (tree identical to merged main). Each title below names a removed test declaration; the case count expands static parameter tables. The removed cases cover retired parent draft/generic create-update behavior; one concurrency scenario-list assertion was replaced to enumerate the surviving races.

| File | Removed cases |
|---|---:|
| tests/unit/server/project-cost.routes.spec.ts | 30 |
| tests/unit/server/project-cost.service.spec.ts | 39 |
| tests/unit/costs/project-costs.spec.ts | 27 |
| tests/unit/costs/c1-accounting-write-ui.spec.ts | 7 |
| tests/unit/config/c1-ordinary-detail-concurrency.spec.ts | 2 |
| Total | 105 |

Survivor coverage remains in the retained project cost tests, ordinary detail repository tests, C1 SQL fixtures, and browser suites. New local tests cover absent HTTP paths/RPC calls, migration safeguards, ordinary detail route and permission separation, and published-parent correction.

The prior 1,557-case baseline becomes 1,462 cases: 105 former cases removed or replaced and 10 retirement/survivor cases added.

## tests/unit/server/project-cost.routes.spec.ts

- routes financial preparation without an idempotency header (1 case)
- routes draft detail and project draft list reads (1 case)
- routes operational draft reads separately from financial draft reads (1 case)
- requires expectedVersion and a UUID idempotency key for publish (1 case)
- creates only when path project, strict body, and UUID idempotency key are valid (1 case)
- rejects source provenance from cost.manage create (1 case)
- rejects invalid source figure provenance arrays without creating (2 cases)
- rejects invalid idempotency key %s without creating (2 cases)
- rejects a create body whose project differs from the route (1 case)
- rejects caller-owned create field %s (7 cases)
- routes an ordinary draft patch and reads its body once (1 case)
- rejects correction semantics from ordinary PATCH (2 cases)
- rejects caller-controlled or malformed patch bodies (3 cases)
- rejects caller-owned patch field %s (5 cases)
- rejects a malformed item id before reading or invoking the patch service (1 case)

## tests/unit/server/project-cost.service.spec.ts

- maps the database %s conflict to the API boundary (3 cases)
- does not let %s substitute for cost.publish_import (4 cases)
- publishes only with cost.publish_import (1 case)
- does not let %s substitute for cost.manage (4 cases)
- does not let %s substitute for cost.prepare (4 cases)
- owns draft identity with cost.manage and financial preparation with cost.prepare (1 case)
- lets cost.manage read only the operational draft projection (1 case)
- does not let %s substitute for cost.manage on operational draft reads (5 cases)
- maps the financial and operational draft reads to distinct RPCs (1 case)
- returns the RPC acknowledgement instead of the Supabase response envelope (1 case)
- maps VERSION_CONFLICT from RPC to a 409 AppApiError (1 case)
- preserves MODULE_DISABLED as the reason for direct RPC errors (1 case)
- maps RPC %s to the public API error (6 cases)
- returns update and correction acknowledgements without a post-write table read (1 case)
- allows cost.manage create without cost.read and preserves idempotency input (1 case)
- passes valid source figure provenance IDs unchanged to the guarded create repository (1 case)
- rejects duplicate source figure provenance IDs before repository invocation (1 case)
- requires cost.manage for ordinary updates and cost.correct for corrections (1 case)
- maps invalid Zod input to INPUT_INVALID before calling the repository (1 case)

## tests/unit/costs/project-costs.spec.ts

- keeps draft creation operational and rejects financial or publication fields (1 case)
- requires a complete nonempty financial detail snapshot and accepts explicit zero (1 case)
- represents an unprepared draft with a null amount and deterministic readiness (1 case)
- keeps the cost.manage draft projection operational-only (1 case)
- accepts known nonnegative decimal amounts including zero (1 case)
- rejects negative amounts and precision beyond four decimal places (1 case)
- requires project and approved business fields (1 case)
- keeps business reference and hierarchy context optional (1 case)
- accepts optional unique source figure provenance IDs without exposing them on items (1 case)
- rejects invalid source figure provenance IDs: $sourceFigureIds (3 cases)
- requires a non-overlap confirmation reference when creating an item (1 case)
- rejects empty or whitespace-only non-overlap confirmation references (1 case)
- accepts a non-empty non-overlap confirmation reference (1 case)
- requires expected version for updates (1 case)
- rejects an ordinary update with no mutable field (1 case)
- accepts each allowed ordinary update field with an expected version (1 case)
- accepts an explicit nullable hierarchy clear as an ordinary update (1 case)
- rejects amount from the ordinary management update contract (1 case)
- rejects currency from the ordinary management update contract (1 case)
- requires expected version for corrections (1 case)
- requires a non-empty correction reason (1 case)
- rejects a correction with no material field (1 case)
- accepts a material amount correction (1 case)
- accepts a material work-status correction (1 case)
- rejects unsupported accounting fields from corrections (1 case)

## tests/unit/costs/c1-accounting-write-ui.spec.ts

- enforces operational projection schema (cost.manage) omitting financial amount and details (1 case)
- enforces full financial draft schema (cost.prepare) with derived amount and publishReadiness (1 case)
- validates draft creation payload rejecting financial and publication fields (1 case)
- requires expectedVersion for optimistic locking on operational draft updates (1 case)
- accepts full snapshot replacement with decimal-string amounts and source figures (1 case)
- rejects floating-point numbers instead of decimal strings in financial details (1 case)
- requires expectedVersion for explicit publication (1 case)

## tests/unit/config/c1-ordinary-detail-concurrency.spec.ts

- covers the approved resolver and legacy parent identity race outcomes (1 case)
- accepts one successful parent and the stable category-conflict loser for a legacy race (1 case)
