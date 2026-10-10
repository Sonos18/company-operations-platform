# Thiết kế A3: GPT-5.4 mini đọc PDF và điền báo giá

Ngày 2026-10-10. Cơ sở: A3 LIVE b4172ce930d6a2044ea20423522953295e7678de. Sơn yêu cầu viết lại thiết kế rồi triển khai; xác nhận OpenAI trực tiếp. Phạm vi triển khai source đã được yêu cầu, không suy ra thêm quyền rollout hay Cloud/provider rehearsal.

## Mục tiêu và luồng

Input nghiệp vụ là PDF báo giá và các item/số lượng của đơn đề xuất đã duyệt. Backend lấy PDF gốc đã finalized và đọc đề xuất canonical; browser chỉ gửi evidenceFileId, approvedRevisionId, expectedProposalVersion. Gọi cố định gpt-5.4-mini qua https://api.openai.com/v1/responses, PDF base64 input_file và item/số lượng dạng input_text, strict JSON Schema, store=false, không tool/agent/OCR phụ và không thêm SDK/dependency.

UI: chọn/tải và finalize PDF -> tự gọi phân tích một lần cho file+scope hiện hành -> điền field báo giá còn trống -> hiển thị AI đối chiếu cùng vị trí trang/cảnh báo -> mua hàng kiểm tra cuối, xác nhận mapping -> tạo đơn bằng command hiện có. Có nút phân tích lại chủ động sau lỗi hoặc field sửa; không retry tự động. Nhập tay luôn hoạt động.

Báo giá/PDF là nguồn không đáng tin, chỉ đọc dữ liệu; mọi instruction trong file bị bỏ qua. Không phát sinh nhà cung cấp, đơn mua, quyết định duyệt hay phân bổ từ endpoint phân tích. Đối chiếu tên dùng materialName, specification, unit, engineer/buyer/effectiveInvoiceDisplayName và quantity của canonical proposal. Không bịa MST/điện thoại/NCC code. Dữ liệu thiếu/không rõ trả null.

## Cờ và số lượng

Cờ matched ở từng dòng là kết quả đối chiếu AI đã được backend kiểm tra: GPT xác nhận name/specification/unit tương ứng, có tên báo giá và số lượng dương đọc được; quantityMatchesProposal được backend tính Decimal chính xác quotedQuantity==proposal.quantity. matched chỉ true khi các điều kiện này và quantityMatchesProposal đều đúng. Top matched chỉ true khi mọi dòng đề xuất có một kết quả duy nhất và đều matched. Không coi cờ này là bằng chứng chắc chắn tuyệt đối hay authority kinh doanh; mappingConfirmed không tự bật bởi AI.

PDF báo10 cho đề xuất20: đọc/điền10, quantityMatchesProposal=false/matched=false và cảnh báo báo giá một phần. Vẫn có thể đặt đơn từng phần sau kiểm tra thủ công. suggestedAllocationQuantity=min(quotedQuantity, canonical remainingQuantity) chỉ là gợi ý, không tạo reservation; không vượt số lượng còn lại. Dòng tên/unit chưa khớp hoặc số lượng không rõ không gợi ý phân bổ. Mọi kiểm tra/create-order SQL hiện có giữ nguyên.

Đơn giá chỉ tự điền khi xác định giá chưa VAT và đồng tiền trùng canonical company currency. Nếu đã VAT hoặc không rõ, trả dữ liệu raw nhưng cảnh báo và để buyer nhập đơn giá hợp lệ. Không tự thay currency hệ thống. Số tiền/số lượng trả decimal string, không dùng JS Number để tính.

## Hợp đồng endpoint

POST /api/companies/:companyId/projects/:projectId/material-procurement/proposals/:proposalId/quotation-analysis
Body strict: {evidenceFileId: UUID, approvedRevisionId: UUID, expectedProposalVersion: nonnegative integer}.

Response strict tối thiểu:
- model='gpt-5.4-mini'; source={evidenceFileId,sha256,proposalId,approvedRevisionId,proposalVersion}; matched:boolean.
- supplier={name,taxCode,contactName,phone}, từng field string|null; currencyCode:string|null; warnings:string[].
- lines cho từng proposalLineId: quotationMaterialName:string|null, quotationUnit:string|null, quotationQuantity:decimal-string|null, unitPrice:decimal-string|null, taxBasis:'exclusive'|'inclusive'|'unknown', nameMatches:boolean, specificationMatches:boolean, unitMatches:boolean, quantityMatchesProposal:boolean, matched:boolean, suggestedAllocationQuantity:decimal-string|null, sourcePage:int|null, warnings:string[].
Provider chỉ trả raw extraction và boolean semantic mapping; source identity/quantityMatchesProposal/matched/allocation được server dựng lại. Unknown IDs/duplicate proposal IDs/missing rows/invalid decimals/refusal/incomplete output bị từ chối hoặc xử lý conservative, không gán nhầm. Mỗi dòng PDF chỉ ghép tối đa một item đề xuất; provider có source row identifier để server phát hiện reuse.

## Backend và an toàn

Yêu cầu material.read + material.order.manage. Auth/tenant/company/project hiện có. Read proposal canonical đã duyệt có currentRevisionId==approvedRevisionId và version như body. Evidence phải finalized PDF unsigned_quotation, material_proposal, đúng proposal/revision/company/project/tenant. Dùng authenticated Supabase client + SELECT grants/RLS hiện có trên material_evidence_scopes/cost_evidence_files; không service-role, không migration/grant mới.

Đọc metadata có verified_sha256/verified_size_bytes, bucket/objectPath canonical; tải bản gốc qua storage authenticated client, kiểm tra magic PDF, size <=25MiB, hash và loại tệp bằng helper integrity có sẵn. Không nhận URL/path/nội dung proposal/metadata tin cậy từ client. Sau provider call re-resolve context/permissions và re-read proposal/evidence trước khi trả kết quả, deny context/version/source đổi.

Provider call một lần, timeout60s, max_output_tokens12000, response body có giới hạn hợp lý; từ chối redirects, không retry/chuyển model/provider. Secret chỉ server runtimeConfig.materialQuotationOpenaiApiKey, NUXT_MATERIAL_QUOTATION_OPENAI_API_KEY; không public config/log/key query. Key chưa có trả lỗi cấu hình rõ ràng; không gửi tài liệu nào ở lượt implementation.

Không thêm cache bền vững/quota DB trong alpha. Frontend giữ kết quả chỉ cho cùng scope+file, chặn duplicate in-flight, không gọi lại vì rerender. Không hứa cache/quota dùng chung nhiều replicas; đây là giới hạn alpha cần theo dõi usage. API lỗi/quota vẫn giữ PDF gốc và nhập tay.

## UI ownership và lifecycle

AGY tiếp tục sở hữu Vue theo thỏa thuận. Codex triển khai schema/service/provider/route/HTTP repository và chuẩn bị prompt UI frozen-base cho AGY; không tự sửa Vue. Kết quả async phải khớp company/project/proposal/actor/revision/version/file/hash và generation. Đổi file/NCC/proposal hoặc buyer sửa field trong lúc request chạy -> bỏ response stale hoặc không overwrite các field đã sửa. AI request dùng busy/lock/scope tracker đang có; không dựng lifecycle thứ hai.

NCC tên/MST/điện thoại đọc được điền khi input trống; chọn/resolve NCC vẫn manual. onSupplierInputChanged/handleResolveSupplier hiện reset PDF: AGY cần giữ file đã chọn để buyer finalize lại, không tái sử dụng finalizedEvidenceFileId cũ sau đổi NCC; tự phân tích lần nữa không tạo loop/duplicate. Không tự tick NCC chosen outside hay mappingConfirmed. Không ảnh hưởng A1/A2, canonical snapshots, ACK recovery hoặc idempotency command.

## Verification và giới hạn thực thi

Theo lựa chọn alpha đang áp dụng: source review, git diff --check, kiểm tra ancestry/scope/clean tree. Có một test source runnable cho exact/partial/duplicate/unknown/ambiguous-money response và scope denial, nhưng không tự chạy suites/compiler/test/build hay restore runtime. Không Cloud commands/DB/Auth/fixtures/Storage/provider calls/live build/deploy ở lượt source. Sau accepted backend+AGY UI sẽ freeze SHA rồi lập bounded rollout packet riêng.

Nguồn chính thức: https://developers.openai.com/api/docs/models/gpt-5.4-mini ; https://developers.openai.com/api/docs/guides/file-inputs ; https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses . Model hỗ trợ image input/Responses/Structured Outputs; không giả định free-tier cụ thể của account.

## Clarification from source design review

Proposal.version/revision alone do not freeze allocation reservations or buyer invoice overlays. Before provider call capture exact canonical line input projection (lineId/materialId/materialName/specification/unit/quantity/remainingQuantity/allocatedQuantity/engineerProposedInvoiceName/buyerProposedInvoiceName/effectiveInvoiceDisplayName/buyerOverrideVersion) and company currency. After provider re-resolve actor/context/permissions and re-read using fresh context/db, compare that projection and currency as well as proposal version/revision/file metadata. Any difference denies VERSION_CONFLICT, no stale fill. Browser compares its captured canonical line projection with latest props before writes; changes to remaining/name/override during request invalidate analysis even if proposal.version did not move. No new database authorization or migration is introduced.

Sơn explicitly reaffirmed in this turn: “Giữ AGY viết UI, Codex chuẩn bị prompt và tích hợp”. Backend source and frozen AGY prompt are this turn's deliverables; complete UI integration/deployment waits for the actual AGY source handoff.

## VND amount text

Số lượng có chuỗi như 1.000/1,000 vẫn coi là mơ hồ nếu không có khai báo locale chắc chắn. Riêng giá VND có nhóm nghìn rõ ràng (18.500, 18,500, 18.500 đ) dùng quy tắc money grouping hiện có ở quotation-layout-mapper: xác nhận currency VND, bỏ suffix VND hợp lệ, kiểm tra grouping đúng rồi so Decimal với normalized value GPT. Không áp dụng quy tắc money cho quantity; không tự đổi thuế/currency. Test source cần case grouped VND và ambiguous quantity.
