# Cost/OCR release candidate — source checkpoint, operations closed

Prepared 2026-10-06 under user-approved release-preparation task2. Parent source c83a201e5cc51e2dd7dafa9bc49d848cb0317135. No publication, database, grants, secret/configuration, installation, provider or deployment action is authorized by this document.

## Reconciliation and source identity

Actual remote refs were read using git ls-remote: main6990146697b3b15fa57f3fa837333990c7a833dd; devebdce5982d34915e79db43621d7b66c7f5a6d2ac. Their trees are identical: d2cf1686f0aac1df1de0e85b6e81d42583ea151c. Main is an ancestor of c83; DEV has separate merge ancestry but no tree difference. No merge or cherry-pick is needed to include current published behavior.

c83 already contains reviewed cost contracts, evidence/RLS, manager requests, cash source fixes, notification/version and UI retry fixes, runtime/shared PDF scope wiring, image decoder pins, native CLI error retention, Azure124 snapshot optimization and canonical-root test classification. Dirty owner application/server/shared bytes match this reviewed checkpoint. Older owner rehearsal/migration/receipt bytes are preserved, not copied over accepted source. Owner /tmp/taskovia-document-cost-workflow remains untouched.

The isolated branch release/cost-ocr-candidate-20261006 adds only this release document. All existing tracked files stay byte-identical to c83. Receipt, ordered SHA256 migration manifest and baseline tree inventories are in /tmp/taskovia-release-candidate-evidence-20261006. UAT can read /tmp/taskovia-release-candidate-20261006 at the receipt's final immutable commit; it must use synthetic scenarios and label DB/OCR runtime gaps.

## Existing verification lineage

- c83 decoder validation:40/40 focused and2,431/2,431 full unit tests,242files, no skips; one invocation each. Process NODE_PATH=/tmp/taskovia-ocr-completion-deps/node_modules, TASKOVIA_DEV_CONFIG_SOURCE=files; both Azure gates false; maxWorkers1/cachefalse, full configLoader=runner. Retained integrity proves pngjs7.0.0/jpeg-js0.4.4 exact cached tarballs and installed bytes. Source/packages/symlinks unchanged. Scoped default config loader changed only existing empty .vite-temp timestamps; full measured seam unchanged. /tmp/taskovia-azure-decoder-validation-20261006.
- Azure SQL124/124 accepted at16ffc826c71e0f926ff45a1b64412bd73828ba95, manifest80479dbe6b26eeb5fd6d50da6b995d63f326ff5b479d390badfb7d653e234ed1; /tmp/taskovia-azure124-optimized-dev-once-20261006. This was bounded rollback verification, zero permanent migration/grant/sequence change. c83 changes only root-classification tests after16ffc; all nine SQL sources are identical.
- Cash remains121/143, cash22pending. Historical ledger109audit/16role remains binding; proposed165/20 is unapproved. Source/mock green never overrides strict physical postflight failure or authorizes a retry.
- Known P3 visual follow-up remains open: app/pages/costs/[projectId]/requests/index.vue uses cockpit-table but defines no table width/cell-padding/alignment rules in its scoped styles; earlier visual review reported touching headings/values. This source-only release preparation preserves that product byte parity and does not claim the presentation fix is integrated.
- Original UI browser receipts are earlier-tree evidence, not browser verification of this final commit. No final Nuxt typecheck/build/browser, deployed Storage, actual multi-session DB race or live provider success is claimed.
- Release preparation executes source parity, migration timestamp/hash ordering and git diff checks only. No redundant full unit rerun is required for the identical pre-existing tracked tree plus this documentation.

## Forward migration sequence, pending separate Cloud DEV approval

Canonical Cloud DEV gtgljlnhwvhqdnwrfdfj only. First perform a separately authorized fresh target/history/catalog preflight and guarded db:dev:dry-run; freeze exact source hashes and expected effects. Historical rollback evidence is not migration installation proof. Existing accepted HR migration20261004140132 is prerequisite, not re-applied. Never edit an applied migration; deployed hash/history mismatch requires a new reviewed forward correction.

Apply only the reviewed pending set, in timestamp order, using guarded package.json db:dev:push after exact-target/operation authorization:
1.20261004210000 foundation, inactive legacy default.
2.20261004210100 permission catalog/RLS (catalog definitions only, no actor assignments).
3.20261004210200 evidence/Storage scoped originals and workflow contexts.
4.20261004210300 manager/request/contract/version commands and actor locks.
5.20261004210400 cash/payment/refund/correction guards — BLOCKED pending cash22 decision.
6.20261004210500 historical inventory/reconciliation and cash snapshot.
7.20261004210600 extraction target/result persistence and document classification.
8.20261004210700 directory/history read boundary.
9.20261005045710 private Azure resource/month/job store and private dispatch RPC.

Do not partially activate an incomplete migration prefix. A push may apply every pending migration; confirm exact dry-run set, not merely this list. Current hashes are in ordered-migrations.json. PostgreSQL extension/ACL/runtime divergence and pgTAP setup need their own reviewed scope; rollback rehearsal does not leave pgTAP installed. After separately approved apply, review db:dev:types output and verify RLS/RPC/Storage/cash plus real concurrency before activation. No migration repair/seed/reset or implicit Local DB fallback.

## Actor grants and company activation — pending exact identity manifest

Resolve real active Auth user, tenant/company memberships and employee/onboarding prerequisites via supported flows; never invent substitute identities or widen to company_admin. Roles and per-project manager assignment are separate. SQL adds permission catalog entries but assigns no real actor.

Accountant request/evidence/extraction requires cost.prepare, cost.request.submit, cost.request.read, cost.request.file.read and cost.party.read, with existing project/read navigation rights as required. Actual payment confirmation additionally requires cost.record_cash AND cost.request.submit; cash adjustment creation requires cost.correct, confirmation has the reviewed cash permissions. Grant cost.coverage.assert only for separately authorized historical reconciliation, never routinely. cost.source.read/cost.file.read are legacy-specific and must be reviewed separately from workflow originals. Notification access requires cost.notification.read.

Assigned manager requires cost.request.decide and cost.request.read plus an actual current cost_workflow_manager_assignments row for each project. Original viewing requires cost.request.file.read separately; notification/party/project access only for approved flows. No accountant cash/preparation/coverage powers follow from manager status. Revoked/offboarded users and old managers must fail fresh checks.

Director identity remains vqh-director@taskovia.invalid, recorded AuthID8e4e406d-d798-4262-bb30-b5e5213ec006; these are historical identity facts, not fresh eligibility verification. Minimal assignment/read/notification flow requires project.cost_manager.assign, cost.request.read and cost.notification.read, and company notification_recipient_id bound to that exact actor. Original-file permission needs separate approval; current historical viewer role alone does not supply assignment. No replacement recipient, broad admin or second financial approval.

Resolve parties as third-party organization/external crew or direct VQH crew, identified cost basis/cap, manager assignment and at least one finalized original before submission. Real historical cash/cap mapping and duplication review are separate scoped manifests. Quotation/contract is obligation evidence, not payment proof. Completed-project cost increases stay blocked.

Company cost_workflow_companies.mode defaults legacy. Setting document_backed_v1 plus recipient/config/party classifications is a separate reviewed business activation operation after readiness. No public activation shortcut is proposed. Retire source/Excel reconciliation UX only after replacement verified active; preserve originals/provenance/audit/history.

## Deployment packaging and private OCR settings

package.json and pnpm-lock.yaml already pin runtime pngjs7.0.0 and jpeg-js0.4.4 with no transitive dependencies. Shared /data/taskovia/node_modules lacks both; the verified private NODE_PATH used in tests is not a deployable dependency installation. Node24.x/pnpm10.29.3 are repository requirements (worker24.17.0/10.29.3 observed).

azure-f0-image-inspection.ts uses createRequire(import.meta.url) for both package.json and runtime modules. nuxt.config.ts supplies no explicit decoder Nitro inclusion/tracing override. A future authorized frozen-lockfile build must demonstrate resolution from the actual generated server artifact without the temporary NODE_PATH: include runtime modules, package.json version checks and notices, inspect output dependency tracing, and exercise synthetic supported PNG/JPEG plus fail-closed missing/wrong-version cases. A successful source test does not prove dynamic require packaging. Do not add speculative bundling settings or install now. Preserve MIT PNG and BSD3-Clause JPEG notices, including JPEG decoder Apache2 source notice.

Before image transmission activation, reviewed docs require a bounded execution context/broader corpus; in-process pixel/input bounds are not a hard time/memory sandbox. Supported image subset stays conservative. PDF route is explicit prefix1 or1–2 admission with wholeDocumentComplete=false, not a complete PDF decoder. Persist/display actual requested/returned coverage and accountant review; no auto-post.

Azure migration revokes direct tables from PUBLIC/anon/authenticated/service_role and grants only EXECUTE public.c1_cost_ocr_azure_f0_job(text,jsonb,jsonb) to service_role. Fresh actor authorization stays on user-scoped readers; private server RPC is not a substitute. No browser grant, private table grant or role promotion.

Six server-only variables: TASKOVIA_COST_OCR_AZURE_ENABLED=false and TASKOVIA_COST_OCR_AZURE_TRANSMISSION_APPROVED=false until separately approved activation; endpoint https://taskovia-doc-intelligence-dev.cognitiveservices.azure.com/; private API_KEY; SKU F0 only; monthly page budget canonical1–500. No secret values read/recorded here. Target for eventual private service configuration is dev/compute/dev-preview, serviceID9ef17ebb-6ab4-4125-9e8b-4633495ec950, not recovery worker. Installed CLI secrets set uses /apply and can redeploy; require explicit rollout authorization, avoid extra restart and preserve one eventual deploy preference.

Before enabling, separately reconcile portal/resource exclusivity and current UTC-month usage, with exact external_pages/ceiling/reconciliation_reference/timestamp manifest. Unknown usage never becomes zero; migration seeds no resource/month rows. Resource exclusive_controller remains false until approved reconciliation; expired/uncertain dispatch leases never auto-regrant. Human reconciliation is a separate operation. No key/SKU/quota readback or provider probe performed.

## Blockers and remaining approvals

Cash22/strict physical accounting; real actor onboarding/grants/manager assignment; historical cap/cash mapping; permanent migration application; deploy artifact decoder packaging/build and bounded image execution; deployed Storage/RLS/concurrency verification; exclusive resource/month reconciliation; private service configuration, transmission consent, runtime activation and publication. Release source is reviewable, not deploy-ready. Business UAT documentation can proceed now using this pinned source while marking those gaps.
