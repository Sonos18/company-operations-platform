# Azure F0 integration ownership handoff

Status: adapter delivery e02fdaad is integrated into the controller's isolated source tree as beb8932ac6ba490782c96d865b5ab676f70f0e67. The four prior untracked files were SHA-256 checked against the owner's snapshot and preserved under .superpowers/sdd/2026-10-04-document-backed-installment-approval/azure-before-integration before the clean cherry-pick. No shared file was overwritten. The unchanged extraction-schema prerequisite hash is 4028ea6dceed158ee9440fbee869f6c25551733d4432f30c1182f52c1afb31df.

The parent requested independent durable-port implementation under the accepted code scope. This is the proposed concrete allocation for that handoff; the parent should relay it to the existing Azure owner, thread 01a10a3b-4325-7760-b582-e6abe3046038. The controller has no callable cross-thread sender in this tool environment.

## Azure owner: independent additions

Create these files in the owner's isolated worktree:

- server/features/costs/extraction/azure-f0-job-store.ts: persistent implementation of AzureF0JobStore, using its exact interface exported by azure-f0-cost-extraction.ts.
- server/features/costs/extraction/azure-f0-document-inspection.ts: trusted complete inspection returning DocumentInspection from immutable bytes, SHA-256 and verified MIME metadata.
- tests/unit/server/azure-f0-job-store.spec.ts and azure-f0-document-inspection.spec.ts: synthetic/mock tests, including concurrency/CAS failures, wrong scope, incomplete/truncated/encrypted/malformed input, and uncertainty.
- A new unapplied migration generated in the owned worktree with the official Supabase migration-new command, suffix c1_cost_ocr_azure_f0_storage. Do not edit any existing shared or applied migration.
- supabase/tests/database/c1/c1_cost_ocr_azure_f0_storage.test.sql: prepared rollback-only synthetic SQL; do not execute.
- docs/server/azure-f0-persistent-ports.md: the private repository/RPC contract, grants proposed by source only, inspection coverage and remaining blockers.

Durable storage must reserve at RESOURCE/UTC-month scope across companies, keep immutable file/config/model identity, CAS reserved to sending before POST, preserve uncertain reservations, store private operation/results and persist the combined resource rate slot (3 seconds and 20 calls per rolling minute). Never retry an uncertain POST, release quota on guessed failure, reset monthly usage on worker restart or silently assume the portal has 500 unused pages. Existing resource use by other applications needs separately authorized reconciliation before activation.

Use narrow private provider tables and server-only commands. Anonymous and browser-authenticated clients must not obtain operation URLs, raw provider results, cross-company usage or a way to inject provider job completion. A user JWT remains the fresh authorization source; any existing server privilege used for private writes must stay server-only and must be constructed only inside a separately approved gated runtime path. Do not widen access to accounting or workflow tables. Report a boundary blocker rather than work around authorization.

Inspection must prove the whole document, not count PDF /Page tokens or accept client page counts. No package installation is authorized. Discover available trusted parsers/tools read-only; if none can establish full coverage, return complete=false and document that format as manual review. Do not substitute filename, first-page inspection or an unsupported text guess. Native results must retain complete page/source coverage and require review. Never transmit real files or call the provider for verification.

## Controller: shared integration

The controller retains ownership of:

- shared/schemas/costs/cost-extraction.ts.
- server/features/costs/workflow/cost-workflow.routes.ts.
- server/features/costs/extraction/cost-extraction.service.ts and cost-extraction.repository.ts.
- supabase/migrations/20261004210600_c1_cost_workflow_extraction.sql and all eight existing workflow migrations.
- Workflow UI, existing pgTAP suites, rehearsal approval manifest and rollout packet.

Fresh authorize(input) will be a request-scoped closure bound to the authenticated actor, tenant/company/project, original file ID/SHA/version and optional working request ID/version captured by CostExtractionService. It must re-read the existing extraction-target command and compare those expected values on every adapter authorization callback; cached context.permissions alone is insufficient. Resolve documentKind from trusted original metadata, not a browser field. The current service does not yet pass documentKind or inject these ports, so adapter integration remains gated off.

Do not edit the controller's routes/schema/migration or introduce a duplicate shared contract. The owner may copy the unchanged shared schema as an immutable test prerequisite, excluding it from its patch, as previously agreed.

## Serial verification and rollout

All heavy verification uses /data/remote-jobs/validation.lock, one worker for full unit suites. The controller queued its unit/typecheck/lint/build/browser verification under that same lock; the owner should use the lock rather than wait for an informal gap or bypass it. No build, browser, deployment, DB access, grants, credentials, package installation or live provider call is delegated.

The user reports entering Key1 manually into dev/compute/dev-preview and confirms branch dev. This report is not a key readback or deployment verification. Keep TASKOVIA_COST_OCR_AZURE_ENABLED=false and TASKOVIA_COST_OCR_AZURE_TRANSMISSION_APPROVED=false. The user wants all pending configuration in ONE future deploy; do not call secrets set (/apply may redeploy), change configuration or deploy now. The endpoint, F0 SKU and page ceiling remain the six-variable contract in azure-f0-cost-extraction.md. Secret entry, transmission approval and rollout are separate from this source handoff.

The current rollback proposal contains only the eight existing workflow migrations. Any new Azure migration requires a new reviewed manifest and operation authorization; it is not silently included.
