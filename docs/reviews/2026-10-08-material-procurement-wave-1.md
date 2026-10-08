# Review đợt 1 — vật tư: SQL và API phiếu

Trạng thái: SOURCE READY — T2/T3 đã review và tích hợp. SQL/pgTAP/concurrency chưa chạy trên Cloud DEV.
Source SHA đã kiểm tra: `0837198afb31fbfbfcf833373b07237dbcc9a3dd`. Nhánh Git `codex/site-engineer-material-request`; InstaCloud `site-engineer-material-request`.

| Phần | Commit worker | Review | Kết quả |
|---|---|---|---|
| T2 schema/RLS/RPC | `9e041546` + fix `5a18b078` | SQL reviewer GPT-5.6 Sol ultra: READY sau 3 P1 | 3 migrations mới; 16 RPC; static guard 7/7. pgTAP 31/86 assertions chỉ mới viết |
| T3 API/client | `c8b11cf7` + tests `4db63a77` + fix `0a153117` | API reviewer GPT-5.6 Sol ultra: READY sau scoped review | 13 endpoint danh mục/phiếu; focused API 31/31 |
| Contract bổ sung | `032ab06` + `5f5bd30` | Review độc lập READY | returnReason bắt buộc khi returned; null trạng thái khác; 11/11 |
| App registration | `7960ba4` | Scoped review + typecheck | materialProcurement dùng active company, không prototype fallback |
| T5 UI | Prompt AGY | Chưa có diff UI để review | Codex chỉ viết prompt; AGY thực hiện, rồi bàn giao |

## Findings đã đóng ở source

| Mức | Lỗi | Sửa và chứng cứ |
|---|---|---|
| P1 | Returned không có lý do cho kỹ sư | Thêm required returnReason, cross-field validation và SQL current-revision reason. Server/client list/read regressions |
| P1 | CREATE OR REPLACE đổi tên input của hàm đang tồn tại | Giữ t/c/p/file_id và OID của helper evidence; giữ prior authorization branches |
| P1 | Engineer material.read đọc được supplier aliases | RLS + RPC + service yêu cầu supplier.record hoặc contract.record; engineer bị từ chối trước repo; buyer/accountant được đọc |
| P1 | Phiếu trả về giảm dưới unsigned reservations | Update và submit giữ presence/quantity với mọi allocation chưa cancelled; giữ signed identity/unit guards |
| P2 | HTTP malformed test bỏ qua client thật | Dùng fetch-backed createAuthenticatedHttpClient, missing/null/stale matrix, kiểm tra ClientError MALFORMED_RESPONSE |

## Verification thật trên source SHA

- Focused: 4 files, **49/49 PASS** (7 SQL static + 11 shared contract + 31 API/client).
- Full `pnpm test:unit --reporter=json --outputFile=...`: exit 1, **2591 passed / 86 failed**, 13 failed files.
- So với wave0: cùng 90 failure identities (86 case failures và 4 failed import suites), **added 0 / removed 0**. Full suite vẫn chưa green; không disable/sửa ngoài phạm vi.
- `pnpm typecheck`: exit 0.
- `pnpm lint`: exit 0.
- `pnpm build`: exit 0.
- Source/tests/build đều chạy remote; không DB connection/mutation, typegen, seed, reset, deploy hoặc Production action.

Static guard và source review không chứng minh SQL compile/runtime RLS, idempotency persistence hay race hai session. Các gate này giữ tại T10 sau authorization cụ thể.

## Bàn giao và đợt tiếp theo

[Prompt T5 AGY](../handoffs/2026-10-08-agy-materials-t5-ui.md) có scope file, permission/owner rules, project address override, line UUID ổn định, return reason, version/idempotency và mocked E2E. Không dùng supplier/price/order/contract endpoints trong T5. UI không được gọi Supabase trực tiếp.

T4 backend tiếp theo: đơn mua/phân bổ/PDF/đối chiếu, thêm hủy đơn chưa ký có reason/audit để release reservation. Có thể chạy song song với AGY T5 vì khác file; shared schema changes chỉ qua checkpoint review. T6/T9 backend tiếp tục theo dependencies; T7/T8/UI báo cáo có prompt AGY riêng khi API đã review.

Chưa hoàn thành toàn bộ tính năng, chưa kiểm thử Cloud hoặc live UI. Parent dev-preview của AGY được giữ nguyên.
