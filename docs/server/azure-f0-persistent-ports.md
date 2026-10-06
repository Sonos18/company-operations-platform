# Azure F0 persistent ports — source handoff, not activation

Base: c165265f0e4036715e0ec75c4afc53dc21814743. Remote isolated checkout: /tmp/taskovia-azure-f0-ports. Shared routes, schema, extraction service/repository and existing migration 20261004210600 are unchanged. The integrated adapter beb8932 is a prerequisite. The parent then explicitly approved the code-level lease followup in the original adapter and its dedicated tests; those two existing owned files are included with the seven independent additions. Shared routes/schema/service integration remains with the controller.

## Prepared private server contract

createAzureF0JobStore({binding,rpc,authorize}) implements the existing AzureF0JobStore. It constructs no Supabase client, reads no environment or secret, and stores no local quota/job/rate cache. Inject only an already-approved private server RPC client from a separately authorized gated runtime.

Binding is a frozen snapshot: actorId, tenantId, companyId, projectId, fileId, fileVersion, sha256, nullable requestId and matching nullable requestVersion. authorize() must freshly re-read the user-JWT extraction target and compare ALL of these values before and after EACH private RPC. The controller owns that closure and shared integration; cached permissions or a service-role identity are insufficient. Private persistence can finish while authorization is revoked in flight; the wrapper then refuses to return the response and no provider permission follows.

RPC: public.c1_cost_ocr_azure_f0_job(p_command text,p_binding jsonb,p_payload jsonb) -> jsonb.
Commands: reserve, send, acquire, release, operation, uncertain, complete.
Reserve returns {job} or {blocked:"quota"}; the interface also accepts "busy". acquire returns {lease:null} or the strict frozen lease {token:UUID,resourceId,kind,issuedAt,expiresAt}; timestamps are DB epoch milliseconds with exact 20-second TTL. send/release/operation/uncertain/complete return {ok:boolean}; false send is a denied claim, while false mutation acknowledgement throws a sanitized conflict. Transport/database errors never carry underlying messages, document contents, keys or URLs through this wrapper.

reserve includes the adapter's exact resource/configuration/model/file/SHA identity and validates its SHA256 job key. SQL independently derives the same compact JSON-array key using UTF-8. An existing job must have identical tenant/company/project/original version/hash/model/configuration/pages. Already-sent replay retains its initial UTC-month reservation without recharge. A still-reserved job cannot first-send in a later month: send returns false and keeps the original pages reserved. No automatic quota transfer or new POST key is synthesized. Replay never returns raw_result.

SQL re-reads finalized original metadata under a shared row lock, including exact tenant/company/project/version/SHA, verified MIME and <=4,000,000 verified bytes. An optional request must still be a scoped working/returned installment at its pinned version. This supplements, rather than replaces, fresh user-JWT permission checks.

## Resource-global quota and rate

The migration seeds NO resource or monthly ledger. Missing resource, nonexclusive control, missing current UTC-month reconciliation, or exhausted budget blocks reservation. No worker restart, env variable or server RPC can enroll the resource, reconcile guessed external usage, reset usage or release pages.

A separately reviewed reconciliation must establish exclusive coordination for ALL callers of the exact Azure resource, observed external_pages, ceiling <=500, reconciled_at and reconciliation_reference for the current UTC month. Usage by uncontrolled other applications makes the quota/rate promise impossible; do not mark exclusive_controller=true without evidence. Each later month needs new authorized reconciliation, not an assumed empty ledger.

A resource-row FOR UPDATE lock serializes all quota, job and dispatch transitions across companies/workers. Database clock_timestamp is captured AFTER original/request locks. The same transaction checks quota, increments reserved_pages and inserts the job.

Exact adapter/store contract change sent to parent and controller before implementation:
- acquireDispatch(resourceId:string,kind:'post'|'get'):Promise<AzureF0DispatchLease|null>.
- releaseDispatch(lease,outcome:'settled'|'unused'|'uncertain'):Promise<void>.
- AzureF0DispatchLease={token:string,resourceId:string,kind:'post'|'get',issuedAt:number,expiresAt:number}.
- AzureF0Transport.post(model,bytes,pages,lease) and poll(url,lease) REQUIRE this lease. The old claimSlot method was removed.

Only ONE durable resource lease may exist. It is held through the HTTP request and bounded response-body consumption. Expired or uncertain leases are NEVER automatically regranted: a paused prior worker or ambiguous network operation must not coexist with a new holder. Release requires the exact token AND frozen actor/scope/file/request binding. A known settled response or known unused callback releases with DB-time three-second cooldown; an uncertain outcome is a tombstone and cannot later be guessed settled/unused. Missing/revoked authorization can prevent release, leaving the resource safely blocked. Operator reconciliation to clear abandoned/uncertain leases is a separate approved DB operation; no reset command was added.

Acquisition keeps a persistent max20 rolling-60-second GRANT history, denies <3 seconds since the prior grant or release and blocks future persisted clocks. Unused grants count conservatively. No local quota/rate cache, caller clock grant, expiry reclamation or automatic usage reset. Final guards in BOTH adapter and real transport refuse stale/future/incorrect resource/kind/token grants before HTTP. The transport prepares credentials/body synchronously and performs its final check immediately before fetch; it races a max15-second request/body deadline, aborts the request and cancels a hanging response reader. POST first-send checks also require the lease issuedAt UTC month to match current dispatch time; SQL denies POST acquisition in the final20seconds of its UTC month, and send CAS denies old-month reservations. Clocks must be synchronized in a separately approved runtime.

This closes the prior delayed-slot overlap in source for cooperating approved callers. It is NOT a hard guarantee about network arrival or Azure's metering timestamp. Provider throttling/429 remains possible and is handled conservatively. No live requests or real database concurrency were tested. The controller must wire the new interface explicitly; normal-format decoding still blocks activation.

reserved -> sending is a one-winner state transition before POST. sending and uncertain can never be claimed again. Pages remain reserved after timeout, HTTP429, crash or ambiguity. operation accepts only the exact HTTPS resource/model/UUID/2024-11-30 path, keeps the first operation URL immutable, and never shortens a persisted retry deadline. complete requires submitted, reviewRequired=true and Azure method with needs_review/unavailable status; raw/result are private and immutable except identical idempotent replay. The TypeScript wrapper fully validates the existing shared result schema; SQL adds state/shape/size checks. SQL JSONB storage limits raw to4,000,000 bytes and result to300,000 bytes; normalization overhead can cause conservative rejection.

## Inspection and remaining coverage blocker

createAzureF0DocumentInspector(expected,readMetadata) returns the exact existing inspection port. Expected metadata includes tenant/company/project/file/version/SHA/verified MIME/size. It copies and independently hashes the exact Uint8Array view before awaiting a fresh private metadata read, and rejects identity/hash/size/version/MIME changes. The reader must re-read authenticated original metadata, never a browser report.

Every PDF/PNG/JPEG currently returns complete=false,pageCount=0, with no native hints. Synthetic tests verify conservative denial, not successful decoding or encrypted-document recognition. This is an explicit production activation blocker for required normal formats, not finished OCR capability.

Read-only discovery found only MIME magic checks and image-meta header metadata. Playwright1.61.1 exists but no browser binary was found in known cache locations; page.pdf generates PDFs. No browser was launched.

Before any dependency change, the parent/integrator received:
- PDF.js6.4.299 + canvas1.0.10 + pngjs7.0.0 + jpeg-js0.4.4 (~70.56MB Linux unpacked). PDF.js's official image evaluator catches decode failures and emits null images, so no-canvas operator enumeration or render success alone is not coverage proof.
- Smaller trial candidate: official Artifex mupdf1.28.1 WASM (14.324MB, no runtime/native deps), plus strict static-image candidates pngjs7.0.0/JPEG-JS0.4.4 (~15.05MB total). AGPL/commercial licensing needs review. MuPDF PNG handling does not validate CRC/APNG, so it is not a turnkey all-format validator.
- Community PDFium wrapper2.1.13 (~11.25MB) lacks proven strict failure reporting; rendering a bitmap is not validation.

No dependency was installed. A coordinated /tmp corpus trial requires license/dependency/resource approval first; do not consume the constrained shared /data dependency volume. Veto repairs/warnings/passwords/unsupported uncertainty; test later-page corruption, malformed xrefs/streams/images, encryption, APNG/MPO, trailing ambiguity, decompression limits and bounded CPU/memory/time before any positive coverage. Approve a required format only after an actual full decoder establishes complete coverage.

Official research:
https://github.com/ArtifexSoftware/mupdf.js
https://mupdf.readthedocs.io/en/latest/license.html
https://github.com/mozilla/pdf.js/blob/v6.4.299/src/core/evaluator.js#L845
https://github.com/pngjs/pngjs
https://github.com/jpeg-js/jpeg-js
https://playwright.dev/docs/api/class-page#page-pdf

## New migration and proposed privilege impact

20261005045710_c1_cost_ocr_azure_f0_storage.sql was generated by official Supabase2.114.0 migration new. The CLI created the empty file then hung; only its verified owned worker process was terminated. The file was subsequently populated as source; no DB command was invoked.

Adds only three PRIVATE tables (resources, months, jobs), their three primary-key indexes, one original-file lookup index, constraints/FKs, RLS with no policies, one public SECURITY DEFINER RPC with empty search_path, and a function comment. Existing pgcrypto digest and workflow key-validation helper are prerequisites. No new extension, sequence, identity column, trigger, bucket or operational row is created.

Proposed source-only ACL: revoke ALL on the three new tables and RPC from PUBLIC, anon, authenticated and service_role; grant only EXECUTE on this exact RPC signature to service_role. No direct service-role table privilege, no private schema usage change and no accounting/workflow table grant/policy change. Existing file FK prevents deleting a referenced original; actor/request UUIDs are preserved metadata rather than new delete-cascade relationships.

This migration is OUTSIDE the prior eight-migration rollback packet. Applying it or any grants requires a new hash-reviewed manifest and explicit DB operation authorization.

## Prepared SQL fixture: exact impact and limits

supabase/tests/database/c1/c1_cost_ocr_azure_f0_storage.test.sql is source only, NEVER executed. It wraps all statements in BEGIN/ROLLBACK. It requires empty new resource storage; it aborts instead of reusing or deleting an existing resource. Existing pgTAP in extensions is required; the fixture installs no extension. UUID/code/email collisions abort without ON CONFLICT cleanup.

Proposed inserts: auth.users1; public.tenants1; public.companies2; public.projects2; public.cost_evidence_files2; private resources1, months2 (current and synthetic prior UTC month), jobs2 via RPC. Resource leases are generated by the RPC with UUID randomness (no sequence). No memberships, roles, permissions, grants, accounting parties, workflow requests, extraction records, cash, receipt, storage.objects or audit_events are inserted. Temporary objects: azure_fixture3rows; azure_deadline1row; azure_lease1row updated once for a second synthetic acquisition; pg_temp.azure_call(text,integer,jsonb), with EXECUTE revoked from client/server roles. Resource/month rows and job state/raw/result/slots/lease ownership/timestamps/release status are changed only within the rollback transaction. Direct resource updates simulate expired TTL, cooldown and rolling/future grant history; all affect only the guarded synthetic resource. No real clock override is added. A still-reserved synthetic job is directly relocated to the prior ledger and restored by two UPDATEs solely to test the deferred-first-send denial; no operational row is reused. Direct fixture slot timestamps simulate boundaries; they do not prove real parallel execution.

Source-known triggers for these public inserts: project completion/capture triggers are UPDATE/DELETE-only; evidence completed-project and legacy-file guards run on INSERT and read project/workflow mode. Original target/history guards are UPDATE/DELETE-only. None of these reviewed insert paths writes audit rows or advances sequences. auth/tenant/company sources declare no user insert triggers. The fixture aborts on unexpected enabled user triggers for all touched permanent tables before data insertion. Actual installed catalog state has NOT been read; future authorization must include verifying defaults/internal triggers/extension versions and any deployed divergence.

All fixture IDs are explicit UUIDs; the new provider tables have no sequences. Expected audit_events rows added and audit_events identity advances are ZERO on reviewed paths, but this is a source expectation, not measured rollback cleanup. PostgreSQL sequence advances are nontransactional: do not claim rollback erases them, reset sequences, disable triggers or delete immutable audit records. Any unexpected path must stop for a new reviewed impact manifest.

The 43 prepared pgTAP assertions cover global quota/replay, uncertain retention, scoped original version, cross-company leaked key, immutable URL/deadline/raw/result, resource lease ownership, expiry/uncertainty retention, cooldown/rolling grants, private grants and browser RPC denial. It is serial SQL; actual multi-session CAS/lock behavior and PostgreSQL syntax/runtime remain unverified until an explicitly authorized CloudDEV rehearsal. Mock CAS tests prove wrapper delegation only.

## Verification and deployment boundary

Verified before lease followup: 91/91 scoped Azure tests; full214files/1,810unit tests. Final lease verification: 134/134 scoped Azure tests; full214files/1,853unit tests; targeted ESLint and strict standalone TypeScript passed.

Migration SHA256: 0c3cc5c529750a78a1361c8f73beca6e41453c86ad5d3aed3ef581ede533b3e8.
Prepared SQL fixture SHA256: 0c608cdcd747a20e6c227837196b91e4f2ced40088a17c5d50b8de3e63a37ebe.

Remote tests/lint/strict standalone TypeScript run under /data/remote-jobs/validation.lock with read-only shared dependencies. Full unit suites use maxWorkers=1 and process-only TASKOVIA_DEV_CONFIG_SOURCE=files. Logs stay in /data/remote-jobs/taskovia-azure-f0-ports.

Independent read-only review found and fixed the SQL variable/column ambiguity (v_result) and expired first-send month bug. No PostgreSQL execution verified these fixes. The coordinated lease contract closes the identified dispatch overlap in source; approved runtime wiring, trusted decoding, clock assumptions and actual PostgreSQL verification remain outstanding activation blockers.

No full app typecheck/build/browser, DB access/apply/SQL fixture, provider call, key read, credential construction, resource/paid change, push, config write or deployment is part of this delivery.

Server gates remain TASKOVIA_COST_OCR_AZURE_ENABLED=false and TASKOVIA_COST_OCR_AZURE_TRANSMISSION_APPROVED=false. Key1 was reportedly entered by the user into private dev/compute/dev-preview; this is not readback/deployment verification. Keep the existing six-variable contract, collect remaining approved configuration and use ONE eventual separately authorized deploy. secrets set uses /apply and must not be used here.
