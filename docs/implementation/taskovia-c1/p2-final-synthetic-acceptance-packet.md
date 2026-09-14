# Taskovia C1 P2 final synthetic command-path acceptance packet

Status: `NOT_EXECUTED — REQUIRES EXPLICIT CLOUD DEV AUTHORIZATION`

## Bound destination and prerequisites

Execution source must be implementation SHA `773998d3b497278cec8519537ed146cb22a1d993` or an explicitly approved successor. The independently reviewed execution packet must bind an exact HTTPS application origin, the canonical Cloud DEV Supabase project ref from `scripts/assert-cloud-dev-target.mjs`, and a deployment-association review reference. The origin is not the Supabase project URL and must contain no credentials, port, path, query, fragment, redirect, or normalization variation. The CLI validates all three destination fields before reading workbook bytes or sending the bearer token.

Before any request, separately establish and approve: deployed endpoint SHA; synthetic actor authentication, company membership, C1 enablement, `cost.source.read`, `cost.prepare`, adapter registration, fixed authorization reference/runId/idempotencyKey, exact input and manifest digests, one new private attempt directory per invocation, and durable capture. This packet does not create or repair those prerequisites.

## Authorized scenario ledger after approval

Expected negative responses are scenario success when their status/code/identity match this ledger. Any extra request, redirect, malformed response, identity mismatch, or result outside the ledger is an unexpected stop.

| Scenario | HTTP requests | Intended result | Mutation expectation |
| --- | ---: | --- | --- |
| Initial import | 1 POST | 200 canonical result, requested runId, `replayed=false` | One committed controlled-import transaction |
| Same-key replay | 1 POST | 200, same canonical IDs, `replayed=true` | No duplicate source data |
| Different-payload conflict | 1 POST | 409 `IDEMPOTENCY_CONFLICT` with requestId | Transaction rejects; no partial import |
| Authentication negative | 1 POST | 401 `AUTH_REQUIRED` or `AUTH_INVALID`, as preselected in the approved actor setup | No RPC write |
| Capability negative | 1 POST | 403 `PERMISSION_DENIED` | No RPC write |
| Cross-company negative | 1 POST | 403 `COMPANY_FORBIDDEN` | No target-company write or disclosure |
| Canonical read-back | 1 GET | 200 result for the exact company/runId | Read only |

The deterministic ledger therefore permits exactly **6 POST requests and 1 GET request**. If and only if one POST has an unknown outcome, no POST retry is authorized; one separately invoked `db:dev:c1:import:get-result` GET may replace the ordinary read-back, keeping the total at one GET. Any additional mutation retry requires an amendment.

## Transaction and synthetic-data lifecycle

Each HTTP POST invokes one database RPC and one independent database transaction. It does not share the SQL fixture runner's outer transaction and cannot be covered by that fixture's `ROLLBACK`. A 200 import is committed before the canonical HTTP result is returned; a lost or unusable response is therefore UNKNOWN, not rolled back.

Use a dedicated, explicitly approved synthetic company/actor and retain only the bounded synthetic C1 source/import rows created by this ledger. Setup operations for the synthetic company, membership, permissions, module enablement, or adapter registration are committed prerequisites and require their own authorization. This packet authorizes neither setup nor teardown. Immutability remains enabled; no source/history row is deleted or rewritten to manufacture zero residue. Postflight compares the retained scope to the ledger and requires zero financial documents, payments, allocations, KPI facts, or unrelated master-data effects. A teardown is allowed only under a later reviewed mechanism that names the exact safe operations.

## Unknown outcomes and durable evidence

Every invocation owns a new private attempt directory. `attempt.json` records attempt identity, stable run/idempotency identity, payload digest, authorization reference, and destination before dispatch; `serverExecutionProven=false` makes clear that launch intent is not server execution. `outcome.json` records `SUCCEEDED`, definite `REJECTED`, `REFUSED`, or `UNKNOWN` with sanitized status/code/requestId. Existing attempt directories are never overwritten. Failure to establish evidence makes zero requests; evidence failure after dispatch is UNKNOWN and never triggers automatic resubmission.

## Concurrency evidence

The normative anchor is `docs/superpowers/specs/taskovia-cost-management-v1.1/02-taskovia-c1-detailed-spec-v1.1.md` **§6.1, lines 362–368**, especially the common company-scoped lock order and prohibition on removing serialization without equivalent tests. P2 applies this to simultaneous same-company controlled imports that contend on import identity/source creation: same key/same payload, same key/different payload, and different keys targeting the same source code. A separately approved concurrency packet must issue two simultaneous POSTs per chosen case and verify one new result plus replay, one success plus conflict, or serialized non-duplicating source/version results respectively. `concurrency_execution = NOT_RUN`; this packet does not authorize those requests.

No real data, load testing, registration/grants/enablement, setup, retention decision, teardown, P3, Production, or Local DB operation is authorized here.
