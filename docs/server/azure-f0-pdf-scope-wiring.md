# Azure-first PDF scope integration
Prepared backend only; no provider, secret/configuration, DB or deployment actions.
Base: a81bc1bc7115fa310f9cba49aed03c2db072cd2f. Implementation worktree /tmp/taskovia-azure-pdf-scope.
Native and image inspection keeps its existing complete/pageCount semantics. A PDF admission plan proves only the authorized immutable bytes and a deliberate requested prefix; wholeDocumentComplete is always false.

## Exact new backend ports
- AzureF0PdfInput extends CostExtractionInput with optional pdfPageScope:'1'|'1-2'. Every PDF provider request must carry an explicit valid choice; missing choice cannot initiate Azure.
- AzureF0Options.admitPdf?(input):Promise<AzureF0PdfAdmission|null>. Exported createAzureF0PdfAdmission(expectedMetadata,readContext) implements it without parsing/rendering or new dependencies.
- readContext(expectedMetadata) must freshly read an authenticated original/request bound to the same actor/file/request revision used by the existing authorizer. Return {metadata,pdfPageScope,sourcePageCount}; metadata contains exactly tenantId,companyId,projectId,fileId,fileVersion,sha256,mimeType,sizeBytes. Do not spread an entire access/DB row into it. Page-count provenance is {kind:'unknown'} or {kind:'user-declared'|'trusted-metadata',count:positiveSafeInteger}. Declarations stay declarations.
- Store declaration pdfScopeContract:'azure-pdf-scope-v1' is REQUIRED for the PDF provider path. The current createAzureF0JobStore does not declare it. The adapter blocks before reservation/HTTP unless both this contract and admission port are supplied. Do not add the declaration until all shared and durable changes below are integrated.
- createCostExtractionAdapter accepts the optional admitPdf port without changing the existing six environment variables or exact-true gates. Environment values alone still do not wire ports or approve transmission.

## Requested pages and result contract
Scope '1' maps to requestedPages=[1], reservedPageUnits=1 and transport pages=1.
Scope '1-2' maps to [1,2], units=2 and pages=1-2.
Unknown/long sources may be admitted only for that deliberate prefix; no whole-source success claim, conversion, split, later-page selection or paid-tier fallback.

Every admitted PDF response carries azurePdfCoverage:
{kind:'azure-pdf-scope-v1',sourceSha256,sourceByteLength,requestedPages,returnedPages,requestedPagesMatched,sourcePageCount,wholeDocumentComplete:false,reviewRequired:true}.
Pending/error replies carry an unmatched empty returned set; terminal results record valid returned numbers. Malformed/oversized/out-of-range page lists are unverified; raw private evidence retains the actual provider data. Coverage records are never a decoded-text-integrity attestation.
The local exported azureF0PdfCoverageSchema and azureF0PdfExtractionResultSchema validate this envelope; native/image results use the unchanged shared base schema.
Only exact unique requested page numbers permit needs_review hints. Missing/duplicate/extra/invalid pages, wrong model/version, provider failure or warnings return unavailability with no financial fields. Warned raw data remains private. Results remain reviewRequired, and exact money-text checks stay unchanged.
A completed cached PDF result must pass the extended schema and match the admitted hash, size, requested pages and source-page-count provenance. Missing/changed/wholeDocumentComplete=true metadata is denied, with no new POST. Revoked fresh authorization denies cache and completed-result exposure.

## Integrator-owned shared changes (required before declaring store readiness)
Current shared/schemas/costs/cost-extraction.ts is strict and rejects the coverage extension. Existing service and store parse it; this delivery DOES NOT claim those shared paths are already compatible.
1. Add the exact coverage contract to the shared result schema and ensure it survives result/view serialization and persistence. Require it for results from the PDF admission path; do not strip it or set wholeDocumentComplete=true. The server helper currently owns a pure Zod coverage shape; copy/move that pure shape into a shared module when coordinating imports, without importing node:crypto or private server helpers into browser/shared code.
2. Add explicit pdfPageScope to the shared command/input and forward it through authenticated target/service wiring. The current service constructs base input only. Persist the scope as a revision-bound choice or bind it in a server reader; bump/recheck revision when the choice/declaration changes. Browser MIME/count/complete flags are never trusted metadata.
3. Update createAzureF0JobStore reservation validation to accept and bind pdfPageScope when present, require matching pages=1/2, parse/store/replay the extended result, and validate scope coverage on completion. Preserve all original binding/metadata/fresh-authorize checks and result size/immutability rules.
4. Mirror the exact canonical key in TypeScript AND SQL. Images keep the existing compact JSON array:
[resourceId,configurationVersion,companyId,projectId,fileId,sha256,model]
PDF appends:
['azure-pdf-scope-v1',pdfPageScope]
SHA-256 hashes JSON.stringify(array) UTF-8; SQL must derive the identical compact JSON bytes. The reserve payload carries both pages and pdfPageScope; only matching prefix/count pairs are valid.
5. Version-aware reservation must deny active legacy/new sending or uncertain jobs for the same original/hash across scope/key variants, never create a fresh send to work around ambiguity. Keep the original UTC-month reservations and resource lease tombstones. This is part of the store contract, not implemented by merely changing the TypeScript key. Explicit operator reconciliation remains a separate authorization.
6. Keep SQL complete validators and private results synchronized with the extended shared shape. If the existing migration has been applied, use a new forward migration rather than editing it. No SQL execution/grants/resource/month seeding occurs in this delivery.
7. Persist and display actual requested/returned pages and coverage qualification before accounting acceptance. For unknown/long source: “Azure đã phân tích trang 1–2. Kết quả chưa xác nhận bao phủ toàn bộ tài liệu; hãy đối chiếu bản gốc trước khi chấp nhận.” Adjust wording for scope 1 and actual failure.

Shared routes/schema/service/repository/UI and SQL/key parity remain integrator 01a1071c-4c6d-746b-b914-6b601bf92013-owned. The backend does not edit them in this patch. The capability flag is a trusted server integration declaration, never a browser or environment switch.

## Preserved guards
Fresh actor/tenant/company/project/original/request authorization before reads/dispatch/cache/evidence exposure; exact immutable source metadata and independently computed hash; <=4,000,000 bytes checked before copying; persistent quota/reservation/CAS; durable exclusive rate leases and month/expiry checks; unknown-send retention; endpoint and operation allowlists, redirect refusal, response/body/time limits and retry deadlines.
AzureDocumentIntelligenceTransport itself is unchanged. The adapter retains its existing post(model,bytes,pages,lease)/poll(url,lease) calls and releases.

## Verification and limits
New tests use synthetic unrendered PDF-like bytes and mock private ports/transport. This exercises admission and orchestration, not Azure acceptance of the fixtures or full PDF validity. Global fetch remains unused in workflow mocks.
Targeted strict TypeScript and ESLint are required, plus serial full unit execution under validation.lock. No full Nuxt build, DB test or live provider test is implied.
Existing image decoder tests can skip if separately approved pngjs/jpeg-js packages are absent from the shared dependency tree; report actual skips and do not silently install packages here.
Official contracts: [Analyze API 2024-11-30](https://learn.microsoft.com/en-us/rest/api/aiservices/document-models/analyze-document?view=rest-aiservices-v4.0%20(2024-11-30)), [result API](https://learn.microsoft.com/en-us/rest/api/aiservices/document-models/get-analyze-result?view=rest-aiservices-v4.0%20(2024-11-30)), [F0 limits](https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/service-limits?view=doc-intel-4.0.0).

## Integrated current-source status (2026-10-06)
The integrator has connected the shared coverage/command schemas, request-bound fresh authorization, private store namespace/SQL validators, service persistence checks and PDF review UI. The earlier delivery requirements above describe the original handoff; they are no longer missing source wiring. SQL and runtime activation remain separate and unverified.

The extraction target now projects immutable finalized-file workflow_evidence_kind as documentKind. Repository download, service refresh and the request-bound runtime compare that value with the pinned target. Client commands cannot supply a document kind or model. invoice selects prebuilt-invoice; contract, quotation, acceptance_record, accounting_support, payment_proof, source_workbook and other explicitly select prebuilt-layout. Missing/unrecognized kinds deny provider quota/HTTP with OCR_DOCUMENT_KIND_REQUIRED; native/offline spreadsheet extraction remains available.

Historical rehearsal receipts and production provenance pins remain unchanged. Test-only historical roots restore three byte-verified old sources while a separate current-source manifest verifies the reviewed changed bytes first. Current production profiles reject those changed sources before target lookup, query, lock or retry reservation. Synthetic harness success does not authorize a DB retry or become historical TAP evidence.

No migration, quota seed, private key/configuration, provider call or deployment is performed by this source integration. Current cash ledger remains 109 audit /16 role; proposed 165/20 is unapproved and strict physical postflight remains false.
