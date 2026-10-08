# Review đợt 0 — nền và shared contracts

Ngày 2026-10-08. Worker/reviewer: GPT-5.6 Sol, reasoning ultra.
Phạm vi: T0 đồng bộ dev + T1 DTO/permissions/fixtures. Chưa triển khai SQL/API/UI.
Baseline dev b00f0eb; merge9472434; T1 commit2ec546e; fix249f4aa. UI handoff docs7589c0f.

## Thay đổi
- Thêm schema phiếu kỹ sư, vật tư chuẩn, tên theo NCC/báo giá/hóa đơn, tách đơn, hồ sơ hợp đồng và căn cứ chi trực tiếp vật tư.
- Engineer input không có NCC/giá; mua hàng duyệt/trả, không sửa đề xuất.
- Khóa public API/repository contracts và bảy permissions mới.
- Reuse canonical payment fields; không tạo ledger chi vật tư riêng.
- Giao UI cho AGY qua prompts khi đến các task UI.

## Review finding và xử lý
P1: idempotency key ban đầu nhận chuỗi bất kỳ nhưng canonical receipt/RPC yêu cầu UUID.
Fix249f4aa dùng workflowUuidSchema; test nhận UUID hợp lệ, từ chối non-UUID/blank.
Review độc lập sau fix: READY. Không finding còn mở trong phạm vi T1.

## Verification
- Targeted schema10/10 pass.
- Typecheck exit0; lint exit0; build exit0 trên source tích hợp.
- Full unit:2552 pass/86fail13files. Baseline trước feature2542pass/86fail13files; failures theo identity không tăng.
- Existing failures: navigation, missing historical evidence/hash, upstream quotation picker/extraction.
- SQL/RLS/concurrency và live behavior chưa được kiểm chứng. Cloud DEV mutations0.

## Tiếp theo
Đợt1: hai worker Sol ultra, T2 SQL/RLS/RPC và T3 API/client với mock RPC.
Sau đợt1 review độc lập trước khi sang đợt tiếp. UI T5/T7/T8+T9 UI chỉ viết prompts cho AGY.
