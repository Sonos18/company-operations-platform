# Azure F0 cost extraction: private server contract

Prepared adapter only. The default factory returns OfflineCostExtractionAdapter before consulting environment values when durable job, inspection and authorization ports are absent. No route is wired to this provider by this patch.

## Private server configuration

Every name is server-only; never use NUXT_PUBLIC_, app config, browser inputs or committed environment files.

| Variable | Contract / proposed DEV value |
| --- | --- |
| TASKOVIA_COST_OCR_AZURE_ENABLED | Exact lowercase true required; leave false now. Default disabled. |
| TASKOVIA_COST_OCR_AZURE_TRANSMISSION_APPROVED | Exact lowercase true required; leave false now. Default unapproved. |
| TASKOVIA_COST_OCR_AZURE_ENDPOINT | https://taskovia-doc-intelligence-dev.cognitiveservices.azure.com/ only; HTTPS root, no credentials, non-default port, query or fragment. |
| TASKOVIA_COST_OCR_AZURE_API_KEY | Private Azure resource key. Required nonblank only for an explicitly configured provider; never serialized in configuration or logged. No real key has been read or configured. |
| TASKOVIA_COST_OCR_AZURE_SKU | F0 only; default F0. S0 and other tiers fail closed. This is an attestation, not a live SKU verification. |
| TASKOVIA_COST_OCR_AZURE_MONTHLY_PAGE_BUDGET | Canonical integer 1–500; default 500. Reject zero, leading zeros, spaces, decimals and values above 500. |

Resource supplied by user: taskovia-doc-intelligence-dev, RG taskovia-dev, Southeast Asia, Free F0. Endpoint metadata is not proof of quota availability, transmission consent, live SKU or regional behavior.

## Safe eventual key handoff

Target: Taskovia project 9d46bdae-43d4-4efb-bfd3-076893df682a, API https://api.instacloud.com, branch dev, service compute/dev-preview (ID 9ef17ebb-6ab4-4125-9e8b-4633495ec950). Read-only service metadata confirmed the service. The cloud runtime's private service secrets are the entry location, not dev-worker or dev-worker-recovery.

Keep both switches false. Do not paste the key into this task, a source file, shell argument/history, screenshots, test fixture, Nuxt public config or a branch-wide/project-wide secret. A later separately authorized human entry should use the private service-scoped secret UI or the official CLI with the value on stdin:

    insta --agent --api-url https://api.instacloud.com secrets set TASKOVIA_COST_OCR_AZURE_API_KEY --branch dev --service compute/dev-preview

This command is a FUTURE HANDOFF ONLY: it was not executed. Omit the positional value; supply it from a masked local input through stdin outside the chat transcript. Installed CLI 0.1.16 sends secrets set through /apply and can redeploy receiving services automatically. Consequently entry requires explicit configuration/rollout authorization even with OCR switches false. Do not issue an extra restart after a successful automatic apply. Do not read back a secret bundle to verify; use names-only service-scoped confirmation after authorization.

No worker key is proposed unless a separate synthetic live connectivity probe is authorized and scoped explicitly.

## Adapter behavior

- REST API 2024-11-30, prebuilt-invoice for invoices (including Vietnamese), prebuilt-layout for quotes/contracts. No optional add-ons, training, SDK or paid tier fallback.
- Complete trusted inspection must attest the exact SHA-256 and full page count. Scanned files exceeding two pages or 4,000,000 bytes return manual-review unavailability before POST. No silent first-two-page truncation; no multi-request splitting is implemented. Complete native results can cover longer documents without Azure.
- Send base64 bytes; never provider-fetch a document or signed URL. Explicit pages match the whole inspected document.
- HTTPS endpoint pinned to the user-approved host. Operation URLs must remain on that origin, match the selected model and UUID path and carry only the fixed api-version query. Redirects fail and HTTP calls time out after 15 seconds. JSON result stream capped at 4,000,000 bytes.
- Authorize before inspection/native hints, quota reservation, after the asynchronous CAS send claim, before POST/GET and after asynchronous evidence persistence before exposing completed hints. Cached results require fresh authorization too. Durable ports must bind actor, scope, immutable original and current request revision.
- Resource identity is the pinned hostname. Job keys include configuration version, company/project, immutable file ID, SHA-256 and model. A sending/uncertain job retains its reservation and never repeats POST; even a POST 429 is treated conservatively as uncertain, requiring later reconciliation.
- The persistent resource-wide slot must enforce ALL POST and GET calls at least 3,000ms apart and no more than 20 calls per rolling minute, across workers/jobs/companies. This conservative combined limit honors the user-reported portal limit and published F0 1 TPS POST/GET limits.
- Numeric and HTTP-date Retry-After are honored without shortening long delays. GET timeout pauses five seconds; running responses and transient 429/5xx persist their next polling time.
- Completed provider pages must exactly cover 1..pageCount. Provider response is privately retained before hints are returned. Invoice totals use exact validated text, never provider floating point values. All results require review; party/currency/basis values are never invented. Layout results retain raw evidence without guessing a cost total.
- No keys, documents or signed URLs are logged.

## Activation blockers

These are explicit required ports, not implemented by this patch:
1. Transactional persistent resource/month quota and job store (atomic reservation, CAS send claim, immutable private operations/results, shared durable rate limiter and conservative handling of uncertain sends). Resource usage must include other applications and be reconciled with the portal.
2. Trusted complete inspection of immutable PDF/image bytes, native-text handling and exact page coverage.
3. Fresh actor/company/project/file/request-revision authorization, with original-file role/scope checks for stored provider evidence.
4. Approved server route integration, shared schema/migration integration, Cloud DEV authorization and separately approved live provider/transmission/configuration rollout.

Environment values alone do not activate OCR. No DB/grant/push/deploy/provider/resource/paid action was performed.

## Patch prerequisite and verification

The four Azure files are based on HEAD 48cbfb3d0b2368a0348f9753387d0b69762e3c05. The integrator owns an uncommitted additive extraction-schema prerequisite (warning codes, providerLocations, azure-f0-v1 and documentKind). Its unchanged snapshot SHA-256 is 4028ea6dceed158ee9440fbee869f6c25551733d4432f30c1182f52c1afb31df. This prerequisite is excluded from the Azure patch; integrating only this patch onto bare HEAD will not supply that schema.

All source changes and verification occur on dev-worker-recovery in /tmp/taskovia-azure-f0. Shared dependencies are reused without installation. Heavy verification uses /data/remote-jobs/validation.lock. The first full unit run had 40 failures across five configuration fixture test files because the worker inherited TASKOVIA_DEV_CONFIG_SOURCE=environment; process-only TASKOVIA_DEV_CONFIG_SOURCE=files resolves that synthetic-fixture mismatch without reading or editing credentials. Azure tests use synthetic bytes and mock transport; no live provider behavior is established.

## Official contract sources

- [F0 service limits](https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/service-limits?view=doc-intel-4.0.0)
- [Analyze Document REST](https://learn.microsoft.com/en-us/rest/api/aiservices/document-models/analyze-document?view=rest-aiservices-v4.0%20(2024-11-30))
- [Get Analyze Result REST](https://learn.microsoft.com/en-us/rest/api/aiservices/document-models/get-analyze-result?view=rest-aiservices-v4.0%20(2024-11-30))
- [Invoice language support](https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/language-support/prebuilt?view=doc-intel-4.0.0)

Verified final source:
- Azure suites: 33/33 tests passed.
- Full unit suite: 208 files, 1,733/1,733 tests passed with TASKOVIA_DEV_CONFIG_SOURCE=files in the test process only.
- ESLint passed for the four Azure source/test files.
- Strict standalone TypeScript passed for those four files and their imports (ES2022, ESNext, Bundler resolution, Node types, skipLibCheck).
- git diff --check passed.
- No full Nuxt typecheck, app build, browser or live Azure/Cloud DEV test was run for this patch.
- Initial inherited-config failures affected supabase-cloud-dev-runner.spec.ts, supabase-cloud-dev-target.spec.ts, stage01-cloud-dev-concurrency.spec.ts, stage01-cloud-dev-integrity-races.spec.ts and c1-ordinary-detail-concurrency.spec.ts; they all pass in the isolated final run.

Evidence and preserved baseline: /data/remote-jobs/taskovia-azure-f0/. Final release-*.log and release-results.txt record the checks. The integrator's original four Azure files were rehashed after editing the isolated copy; all four match the original manifest.
