# Azure F0 image inspection and request wiring

This change is code and synthetic verification only. It does not activate OCR, install application dependencies, change package/lock files, apply SQL, configure keys, contact Azure, upload originals or deploy.

## Explicit integration boundary

The existing createAzureF0DocumentInspector remains incomplete for every format. New createAzureF0ImageDocumentInspector uses the same pinned private original metadata, copied bytes, SHA-256 and fresh metadata reader, then a concrete guarded full decoder. No client-supplied complete/page/native report can make a document pass. Missing or differently versioned decoder packages fail closed. createCostExtractionAdapter still returns the offline adapter unless approved server ports are explicitly supplied; environment variables alone cannot wire these ports.

Current accepted image scope is static, noninterlaced 8-bit RGB/RGBA PNG; and baseline three-component, single-scan JPEG without restart markers or Exif/MPF/other unreviewed metadata. PNG permits only IHDR/IDAT/IEND and fixed-size pHYs/sRGB/gAMA/cHRM metadata. Bounds: original <=4,000,000 bytes; dimensions 50–4096; <=4,000,000 pixels; <=512 chunks/segments; exact bounded PNG inflation and 4-byte-per-pixel decoded output. Unsupported images return incomplete and require manual review; originals are preserved.

PNG checks every chunk CRC/order/terminator, all scanline filter bytes, complete zlib consumption and exact output dimensions/length before attesting one page. JPEG rejects extra frames/trailing bytes/unsupported scans and fully decodes with tolerantDecoding:false and a 64 MiB decoder allocation limit. A necessity probe rejects bytes skipped by jpeg-js at the end of the scan, allowing its encoder's single FF/00 alignment fill only when the preceding byte is necessary. This is a conservative supported subset, not a general JPEG validator.

Execution remains in process in this prepared boundary. Input/pixel/decoder bounds are not a hard process-memory or time sandbox. Before live activation, put this concrete inspection behind a bounded server execution context and exercise a broader synthetic corpus, including subsampling and resource-limit cases. Keep unsupported variants incomplete. No arbitrary-input security proof is claimed.

## Dependencies and approval

An isolated synthetic image installation was approved on 2026-10-06: pngjs@7.0.0 and jpeg-js@0.4.4 only, official npm, scripts/audit disabled, private 8 MiB tmpfs under /tmp/taskovia-ocr-completion-deps. Unmount removes those packages/cache after each serial validation run. No app dependency installation has been approved.

Registry-declared licenses: pngjs MIT, jpeg-js BSD-3-Clause. The jpeg-js decoder also carries an Apache-2.0 source notice; preserve all bundled notices when eventual app dependencies are approved. Registry unpacked sizes are 650,101 and 76,029 bytes respectively (726,130 bytes total); no transitive dependencies.

## Fresh actor/scope/request authorization

New createAzureF0RequestAuthorizer pins actorId, tenantId, companyId, projectId, fileId, fileVersion, requestId/requestVersion, SHA-256, MIME and size. Every authorize invocation must call a trusted reader that re-resolves the current authenticated actor and user-scoped access, rather than recycling cached WorkflowContext permissions. The fresh snapshot must retain all original identity/revision values and current cost.prepare, cost.request.submit, cost.request.file.read, cost.request.read permissions. Any read error, revocation, request update or original change denies access.

The existing adapter calls authorize before inspection/reservation, immediately before POST/GET, and before returning new or cached results. It now snapshots caller bytes, scope and documentKind before awaiting these ports. The durable resource-global quota/lease/job store already integrated at the owner baseline is reused unchanged.

Integrator-owned service/repository/route wiring proposal:

1. Re-resolve the authenticated session/current actor for the request. Read the private immutable original target and optional request revision with the existing user-scoped extraction-target RPC.
2. Build the pinned AzureF0RequestAccess entirely on the server. Obtain tenant/actor from that session, SHA/MIME/size/file revision from the immutable original, and request identity/revision from the server target. Do not accept these values or positive inspection flags from browser input.
3. Use a per-extraction adapter closure whose readAccess re-resolves that actor and re-reads current file/request access. Use the same fresh reader for image metadata inspection. The quota store's privileged service-role client must not serve this reader.
4. Supply those explicit ports and the already-approved durable store to createCostExtractionAdapter, only when all activation conditions are met. Select documentKind from trusted original/document classification: invoice -> prebuilt-invoice; quote/contract -> prebuilt-layout.
5. Retain the existing persist command's fresh role, original identity and request-revision checks. Authorization before an HTTP call cannot make the later DB command atomic with the call.
6. Deny missing or changed revision/scope; never return raw provider responses/operation URLs or use stale cached hints after access changes.

This patch deliberately does not edit the shared service/repository/routes or schemas; ownership and integration remain with the main integrator. Runtime wiring is therefore a proposal, not implemented activation.

## Provider result to existing form contract

Use the existing CostExtractionView.result and strict costExtractionResultSchema. One invoice identity maps VendorName.content to fields.partyHint and unambiguous InvoiceTotal.content to fields.amount as exact decimal text. Never substitute valueNumber/valueCurrency.amount floats. Currency, party IDs, accounting basis, detailed materials/labor/contract lines, approval and cash values are not guessed. Form consumers may prefill these hints for human review; they must retain reviewRequired:true and warnings. Provider field/page polygon/confidence remain optional source locations, not spreadsheet coordinates.

The same immutable result is retained privately in the durable job and handed to the existing extraction persistence command. Multiple invoice identities are not merged. Quote/contract layout text is not inferred into invoice money/party/basis. The mocked end-to-end workflow exercises inspection -> authorize -> reserve/POST -> poll -> existing service persistence/view -> cached replay, then stale revision/actor denial. All transport and repository boundaries in that test are synthetic; it makes no network or DB call.

Microsoft lists Vietnamese invoice language support and VND for the current prebuilt-invoice model:
https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/language-support/prebuilt?view=doc-intel-4.0.0
https://github.com/Azure-Samples/document-intelligence-code-samples/blob/main/schema/2024-11-30-ga/invoice.md

## Practical PDF strategy — approval pending

PDF remains complete:false/pageCount:0 in both existing and image-specific inspectors. No PDF package has been installed. Do not count /Type /Page tokens, trust /Count or claim completeness from a header, dimensions or extracted text alone.

Smallest proposed full-page trial: exact pdfjs-dist@6.4.299 (Apache-2.0), @napi-rs/canvas@1.0.10 and @napi-rs/canvas-linux-x64-gnu@1.0.10 (registry-declared MIT), with only the current Linux platform binary and no other optional platform dependencies. Registry unpacked total 69,834,189 bytes (~66.6 MiB). A request for a synthetic-only isolated 192 MiB /tmp tmpfs trial is pending. /data has only about 98 MiB free and must not hold these dependencies/cache.

Use exact input bytes, stopAtErrors:true, local bundled fonts/CMaps/WASM and no external fetching. Parse the complete page tree, then get every page's operator list/text and fully render every page inside fixed pixel/output/time/process budgets; compare known first/last page/pixel/text markers in synthetic PDFs. Reject encryption/passwords, missing/invalid pages, parser recovery that drops content, unsupported active/XFA/embedded content, resource excess and incomplete rendering. Test one/two/three-page native/scanned/mixed files, truncation/corruption, conflicting counts and failed final-page decoding. Do not silently render/send the first two pages of a longer original. Documents exceeding F0's two-page ceiling require manual review; no splitting, quota bypass or paid fallback.

PDF.js documentation notes that stopAtErrors rejects specified operations instead of attempting partial recovery; it does not by itself guarantee every PDF construct's complete coverage. Its maxImageSize option skips oversized images, so do not use that skip as positive completeness evidence.
https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib.html

## Activation requirements still held

Application dependency/lock changes; approved bounded production decoder execution and corpus validation; owner-reviewed fresh session/original/request wiring and trusted model selection; persistent quota resource/month setup and Azure SQL verification; explicit transmission approval and both server gates; then an explicitly authorized dev-preview deployment/provider probe. Keys remain private and unread. No DB grant/migration/fixture execution belongs to this task. The prior 43 Azure SQL assertions have not been executed by this task; SQL verification is coordinated separately by the integrator.
