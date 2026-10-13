# Tạo đơn mua vật tư kèm tìm/tạo nhà cung cấp trong một lệnh

Ngày: 2026-10-13. Trạng thái: DRAFT chờ Sơn duyệt. Nhánh: `codex/materials-a3-inline-supplier` (từ `3432a76`).

## 1. Mục tiêu

Giảm thao tác cho người mua hàng: bỏ nút "Ghi nhận nhà cung cấp" và ô tick "Xác nhận NCC chọn bên ngoài". Khi bấm **Tạo đơn mua hàng**, UI gọi **một** API; trong **một giao dịch DB**, hệ thống tìm NCC theo mã hoặc tên, dùng lại nếu đã có (không ghi đè thông tin), tạo mới nếu chưa có, rồi tạo đơn với ID đó.

Thành công khi:
- Người mua chỉ nhập/kiểm tra thông tin NCC (thường do AI điền sẵn) rồi bấm Tạo đơn.
- Không phát sinh NCC thừa khi tạo đơn thất bại; không tạo hai NCC trùng khi hai người tạo đồng thời.
- NCC đã có trong DB không bị sửa MST, tên, liên hệ.

Ngoài phạm vi: nhãn tra cứu trước khi tạo đơn (Sơn đã chọn không hiển thị), sửa thông tin NCC đã có, gộp NCC trùng sẵn có, đổi luồng A1/A2.

## 2. Quy tắc tìm NCC (trong hàm SQL tạo đơn)

Phạm vi tìm: cùng `tenant_id` và `company_id` của đơn.

1. **Theo mã:** `business_parties.code = <mã đã trim>`. Nếu có:
   - `party_kind = 'organization'` và `is_active` → dùng.
   - Ngược lại → lỗi `SUPPLIER_UNAVAILABLE` (giữ hành vi hiện tại).
2. **Theo tên** (chỉ khi không khớp mã): so `lower(regexp_replace(btrim(display_name), '\s+', ' ', 'g'))` với cùng phép chuẩn hoá của tên nhập; chỉ xét `party_kind = 'organization'`.
   - Đúng 1 NCC active → dùng.
   - Đúng 1 NCC nhưng inactive → `SUPPLIER_UNAVAILABLE`.
   - Từ 2 NCC trở lên → lỗi mới `SUPPLIER_AMBIGUOUS` ("Có nhiều nhà cung cấp trùng tên, vui lòng nhập đúng mã").
3. **Không khớp:** tạo NCC mới với `code`, `display_name`, `party_kind='organization'`, MST/liên hệ nếu có, `created_by = auth.uid()`. Cần quyền `material.supplier.record`; thiếu quyền → `PERMISSION_DENIED`. Dùng lại NCC có sẵn **không** cần quyền này (chỉ cần `material.order.manage` như hiện tại).

Khi đã dùng lại NCC có sẵn: không cập nhật bất kỳ cột nào của NCC.

Chống tạo trùng đồng thời: trước bước 1, lấy `pg_advisory_xact_lock` theo khoá mã (`material.supplier:<tenant>:<company>:<code>` — cùng khoá hàm resolve hiện tại dùng) rồi khoá tên (`material.supplier-name:<tenant>:<company>:<tên chuẩn hoá>`), luôn theo thứ tự mã → tên. Ràng buộc `unique (company_id, code)` sẵn có là lớp bảo vệ cuối.

## 3. Thay đổi hợp đồng API

`createMaterialOrderInputSchema` (shared/schemas/costs/material-procurement.ts): thay `supplierId` bằng `supplier`:

```ts
supplier: z.object({
  code: shortText,              // bắt buộc; UI tự tạo từ MST hoặc tên
  displayName: shortText,       // bắt buộc
  taxIdentifier: text.optional(),
  contactDisplayName: text.optional(),
  contactPhone: text.optional(),
}).strict()
```

Các trường khác giữ nguyên. Không còn `supplierAlreadyChosen` trong lệnh tạo đơn; quy tắc nghiệp vụ "NCC được chọn ngoài hệ thống" vẫn đúng vì hệ thống không gợi ý hay chọn NCC.

Idempotency: hash lệnh tính trên toàn bộ input (đã gồm `supplier`) như hiện tại; gửi lại cùng key + cùng input trả kết quả cũ, không tạo thêm NCC.

Route `POST .../proposals/:proposalId/orders`, service, repository server và HTTP repository client chỉ đổi theo schema mới; không thêm route. Route `suppliers/resolve` và hàm `c1_material_resolve_supplier` giữ nguyên (không còn được màn hình này gọi; không xoá trong thay đổi này để tránh đụng DB thêm).

`shared/schemas/api-error.ts`: thêm `SUPPLIER_AMBIGUOUS` và `SUPPLIER_UNAVAILABLE`. Hiện `SUPPLIER_UNAVAILABLE` chưa có trong danh sách nên lỗi này đang bị trả về `INTERNAL_ERROR`/500; sau thay đổi cả hai trả HTTP 409 qua ánh xạ lỗi sẵn có của repository material-procurement (kiểm tra và bổ sung nếu ánh xạ không mặc định 409).

## 4. Migration

File mới `supabase/migrations/<timestamp>_c1_material_order_inline_supplier.sql`, forward-only:
- `create or replace function private.c1_material_create_order(uuid,uuid,uuid,jsonb,uuid,uuid)` giữ nguyên chữ ký nên grant/revoke và hàm public wrapper không đổi; DB types sinh ra không đổi.
- Thay `require_keys` từ `supplierId` sang `supplier`; kiểm tra khoá con (`code`,`displayName` bắt buộc; các khoá khác tuỳ chọn, không cho khoá lạ) bằng helper sẵn có; độ dài theo `c1_material_short_text`/`c1_workflow_text`.
- Chèn khối tìm/tạo NCC (mục 2) **sau** kiểm tra receipt idempotency và kiểm tra phiếu/evidence, **trước** vòng lặp allocation; thay đoạn `if not exists (... supplier.id = v_supplier_id ...)` hiện tại.
- `set local lock_timeout = '5s'; set local statement_timeout = '30s';` như các migration A3.

Áp dụng: chỉ Supabase Cloud DEV `gtgljlnhwvhqdnwrfdfj`, theo gói riêng được Sơn duyệt, sau khi kiểm tra lịch sử migration (migration tiền tệ `20261009140717` phải đã có). Không Local DB/Production.

## 5. UI (`MaterialOrderCreatePanel.vue`)

- Bỏ: ô tick xác nhận NCC, nút "Ghi nhận nhà cung cấp/Ghi nhận lại", badge/ID NCC đã ghi nhận, state `resolvedSupplierId`, `lastResolvedInputJson`, `supplierResolutionKey`, `isResolvingSupplier`, `supplierResolveError`, `handleResolveSupplier` và logic huỷ evidence/xác nhận dòng khi đổi NCC (evidence gắn với phiếu, không gắn NCC).
- Giữ: các ô Mã (tự tạo, sửa được), Tên, MST, Người liên hệ, SĐT; AI tự điền như hiện tại (bỏ điều kiện "chỉ khi chưa ghi nhận NCC").
- Mô tả mục 1 đổi thành: "Nhập thông tin nhà cung cấp đã chọn bên ngoài. Khi tạo đơn, hệ thống dùng NCC có sẵn (trùng mã hoặc tên) hoặc tự tạo mới."
- Điều kiện bật nút Tạo đơn: thay "đã ghi nhận NCC" bằng "có Mã và Tên NCC"; các điều kiện khác giữ nguyên. Lý do chặn hiển thị: "Cần nhập mã và tên nhà cung cấp."
- `startCreateOrder` gửi `supplier: { code, displayName, taxIdentifier?, contactDisplayName?, contactPhone? }` (trim, bỏ trường rỗng).
- Thông báo lỗi: `SUPPLIER_AMBIGUOUS` → "Có nhiều nhà cung cấp trùng tên trong hệ thống. Vui lòng nhập đúng mã nhà cung cấp."; `SUPPLIER_UNAVAILABLE` → "Nhà cung cấp này đã ngừng sử dụng hoặc không phải tổ chức."; `PERMISSION_DENIED` khi tạo đơn → "Bạn chưa có quyền tạo nhà cung cấp mới. Hãy nhập mã của nhà cung cấp đã có hoặc nhờ người có quyền."
- Ô NCC không còn bị khoá khi thiếu quyền `material.supplier.record` (người mua vẫn dùng được NCC có sẵn).

## 6. Kiểm thử và nghiệm thu

Theo lựa chọn chi phí của Sơn: không chạy suite đầy đủ; chạy các kiểm tra cục bộ rẻ trên đúng cây mã.
- Unit (vitest): schema `createMaterialOrderInputSchema` mới (bắt buộc code/displayName, strict); HTTP repository gửi đúng body; mapping lỗi UI.
- Cục bộ: `nuxt typecheck`, ESLint các file đổi, `nuxt build`.
- SQL: thêm pgTAP `supabase/tests/database/c1/c1_material_order_inline_supplier.test.sql` cho: khớp mã; khớp tên (khác hoa thường/khoảng trắng); không ghi đè NCC có sẵn; tạo mới khi không khớp; `SUPPLIER_AMBIGUOUS`; NCC inactive; thiếu quyền tạo NCC nhưng dùng NCC có sẵn được; idempotent replay không tạo thêm NCC. Chạy trên Cloud DEV chỉ khi Sơn duyệt trong gói migration.
- Nghiệm thu thủ công trên preview: (a) NCC mới → đơn tạo được, NCC được tạo; (b) tạo đơn thứ hai cùng tên khác hoa thường → dùng lại NCC cũ, không tạo thêm; (c) nhập MST khác cho NCC đã có cùng mã → đơn dùng NCC cũ, MST cũ không đổi.

## 7. Thứ tự triển khai

1. Backend: migration + schema + server + pgTAP (implementer).
2. UI: panel (AGY), sau khi hợp đồng schema chốt.
3. Review + kiểm tra cục bộ; commit.
4. Gói Cloud DEV: kiểm tra lịch sử migration, apply migration mới (1 lần), chạy pgTAP nếu được duyệt.
5. Gói preview: push + connect-repo như các lần trước. Thứ tự bắt buộc: migration trước, preview sau (UI mới gửi `supplier`, DB cũ chỉ nhận `supplierId`).

## 8. Rủi ro

- Đây là thay đổi trên hàm tạo đơn A3 đã được duyệt; rollback DB là forward-only (cần migration mới để quay lại). Preview cũ (`8a356b1`) sẽ không tạo đơn được sau khi migration áp dụng, vì vẫn gửi `supplierId` — nên migration và preview mới đi liền nhau.
- Khớp theo tên có thể gán nhầm nếu hai công ty khác nhau trùng tên hoàn toàn; giảm thiểu bằng ưu tiên mã (thường là `NCC-<MST>`) và báo lỗi khi trùng tên nhiều NCC.
- Cloud DEV dùng chung giữa các nhánh: nhánh khác còn gửi `supplierId` sẽ lỗi sau migration.
