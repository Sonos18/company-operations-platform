# Vật tư A4/A5 — Hợp đồng, cam kết, thông báo, hóa đơn và thực chi

Ngày: 2026-10-15 (Asia/Ho_Chi_Minh).
Trạng thái: spec đã được duyệt theo từng phần trong chat; chờ người dùng review bản viết trước khi lập plan.
Nền mã: nhánh A3 `agy/materials-a3-number-format-supplier-code` tại `0c226cdd` (chứa A1, A2, A3 đã tích hợp).
Thay thế: mục 6, 7, 8 của `2026-10-08-material-procurement-design.md` và Task 6, 8, 9 của plan cùng ngày. Các mục khác của spec 2026-10-08 (danh mục, phiếu, tách đơn) giữ nguyên hiệu lực.

## 1. Mục tiêu và phạm vi

Sau khi mua hàng tạo đơn mua (A3), kế toán ghi hợp đồng đã ký với NCC, lịch đợt thanh toán và hóa đơn; kế toán đề nghị chi, thủ quỹ duyệt và chuyển khoản; hệ thống ghi thực chi, nhắc hạn và cho xem cam kết/đã chi/còn nợ theo đơn, dự án và NCC.

| Phiên | Nội dung | Trong spec này |
|---|---|---|
| A4 | Hợp đồng, cam kết, thông báo | Hợp đồng 1-1 với đơn, phụ lục, lịch đợt, thông báo trong app, nhắc hạn |
| A5 | Hóa đơn, chuyển khoản, thực chi | Hóa đơn NCC, đề nghị chi, thủ quỹ duyệt, ghi chi, số liệu và công nợ |

Không làm trong A4/A5:

- Lập hoặc ký hợp đồng trong hệ thống; kiểm chứng chữ ký.
- Bước duyệt hợp đồng hoặc phụ lục (chỉ thông báo).
- Nghiệm thu, giao nhận, kho.
- GPT/OCR đọc hợp đồng hoặc hóa đơn.
- Kết nối ngân hàng, đối chiếu sao kê, chia một giao dịch ngân hàng cho nhiều đề nghị.
- Đối chiếu số tiền hóa đơn với từng lần chi.
- Gửi email (chỉ thiết kế để mở rộng sau).
- Duyệt chi cấp giám đốc theo hạn mức (chỉ để chỗ mở rộng).
- Gộp số liệu vật tư vào báo cáo tài chính C1.
- Hủy toàn bộ hợp đồng.

## 2. Luồng nghiệp vụ

1. Kỹ sư lập và gửi phiếu; mua hàng duyệt hoặc trả (A1/A2, đã có).
2. Mua hàng chốt NCC, tải báo giá chưa ký, tạo đơn (A3, đã có).
3. Tạo đơn xong là chuyển sang kế toán: thông báo cho kế toán; đơn xuất hiện trong hộp việc "Đơn chờ hợp đồng". Không có bước "gửi kế toán" riêng.
4. Kế toán làm việc với NCC ngoài hệ thống, sau đó ghi hợp đồng: PDF hợp đồng, PDF báo giá có chữ ký, số hợp đồng, ngày ký, giá trị trước VAT/VAT/tổng, lý do lệch (nếu có) và lịch đợt.
5. Lưu xong là có hiệu lực: cam kết được ghi, đơn bị khóa; giám đốc, người tạo đơn và kỹ sư lập phiếu nhận thông báo. Không có bước duyệt.
6. Khi hợp đồng thay đổi, kế toán thêm phụ lục, tạo phiên bản mới; thông báo như bước 5.
7. Kế toán nhập hóa đơn NCC khi nhận được.
8. Đến đợt chi, kế toán lập đề nghị chi; thủ quỹ duyệt hoặc trả lại kèm lý do; kế toán sửa và gửi lại hoặc hủy.
9. Thủ quỹ chuyển khoản trên ngân hàng rồi ghi lần chi kèm ủy nhiệm chi; hệ thống ghi thực chi.
10. Job hằng ngày nhắc kế toán các đợt sắp đến hạn và quá hạn.

## 3. Dữ liệu

Quy ước chung (giống A1–A3):

- Mọi bảng mang `tenant_id`, `company_id`, `project_id` với composite FK về `projects` và `unique(id, tenant_id, company_id, project_id)` để bảng con tham chiếu cùng scope (trừ `app_notifications` là cấp công ty, xem mục 6).
- RLS forced; client chỉ có `select` qua helper đọc; mọi ghi đi qua RPC `security definer`, `search_path=''`, wrapper `public.c1_material_*` gọi `private.c1_material_*`.
- Bảng lịch sử gắn trigger `c1_material_retain_history` (chặn UPDATE/DELETE). Bảng có trạng thái dùng cột `version` cho optimistic concurrency.
- Tiền là `numeric(20,4)`, JSON là chuỗi decimal, tính bằng `decimal.js`; tiền tệ là tiền mặc định của công ty (guard hiện có của đơn). Mọi giá trị tiền trong A4/A5 cùng tiền tệ với đơn.
- Ngày dạng `date`, tính "hôm nay" theo Asia/Ho_Chi_Minh.

### 3.1 Hợp đồng

`material_contracts`

| Cột | Ghi chú |
|---|---|
| `id`, scope | |
| `order_id` | unique; FK `material_orders` cùng scope |
| `supplier_id` | snapshot từ đơn |
| `currency_code` | snapshot từ đơn |
| `contract_no` | text bắt buộc, đã trim, ≤ 100 ký tự |
| `signed_on` | date bắt buộc, ≤ hôm nay |
| `current_version_no` | int, bắt đầu 1 |
| `version` | optimistic concurrency cho lệnh phụ lục |
| `created_by`, `created_at` | |

`material_contract_versions` (bất biến)

| Cột | Ghi chú |
|---|---|
| `contract_id`, `version_no` | unique cặp |
| `kind` | `original` \| `amendment` |
| `subtotal`, `vat_amount`, `total` | `subtotal > 0`, `vat_amount >= 0`, `subtotal + vat_amount = total` |
| `order_subtotal_snapshot` | Σ số lượng × đơn giá của các dòng đơn tại lúc ghi |
| `variance_reason` | bắt buộc khi `subtotal <> order_subtotal_snapshot`, ≤ 1000 ký tự |
| `contract_file_id` | `original`: file `signed_contract`; `amendment`: file `contract_amendment` |
| `signed_quotation_file_id` | bắt buộc với `original`, null với `amendment` |
| `reason` | bắt buộc với `amendment` |
| `recorded_by`, `recorded_at` | |

`material_contract_installments` (bất biến; mỗi phiên bản lưu đầy đủ lịch đợt)

| Cột | Ghi chú |
|---|---|
| `contract_version_id`, `seq` | thứ tự hiển thị |
| `installment_key` | uuid ổn định qua các phiên bản; đợt mới thì sinh key mới |
| `name` | ≤ 200 ký tự |
| `amount` | > 0 |
| `due_on` | date |
| `is_advance` | đợt tạm ứng: đề nghị chi không bắt buộc hóa đơn |

Lịch đợt hiện hành là các dòng thuộc phiên bản `current_version_no`. Lần chi và đề nghị chi gắn với `(contract_id, installment_key)`, không gắn với dòng của một phiên bản cụ thể.

Nếu kế toán không nhập lịch đợt, UI gửi đúng một đợt `name='Thanh toán 100%'`, `amount=total`, `due_on=signed_on`, `is_advance=false`. Server không tự sinh đợt; server chỉ kiểm ràng buộc.

### 3.2 Hóa đơn

`material_invoices`

| Cột | Ghi chú |
|---|---|
| `contract_id` | |
| `invoice_symbol`, `invoice_no` | text bắt buộc; unique theo (`company_id`, `supplier_id`, `invoice_symbol`, `invoice_no`) trong các hóa đơn `recorded` |
| `issued_on` | date ≤ hôm nay |
| `subtotal`, `vat_amount`, `total` | `subtotal + vat_amount = total`, `total > 0` |
| `file_id` | file `invoice` (PDF hoặc XML) |
| `state` | `recorded` \| `voided` |
| `void_reason`, `voided_by`, `voided_at` | bắt buộc khi `voided` |
| `version`, `recorded_by`, `recorded_at` | |

`material_invoice_lines` (bất biến)

| Cột | Ghi chú |
|---|---|
| `invoice_id`, `proposal_line_id` | dòng của đơn (allocation) thuộc cùng hợp đồng |
| `invoice_material_name` | tên vật tư thực tế trên hóa đơn, ≤ 300 ký tự |

Ghi hóa đơn đồng thời ghi (nếu chưa có) `material_supplier_names(material_id, supplier_id, 'invoice', name)`, bảng đã có từ A1/A3, để lần sau gợi ý tên. Dòng hóa đơn là tùy chọn từng dòng đơn; không bắt buộc nhập đủ mọi dòng.

### 3.3 Đề nghị chi, quyết định và lần chi

`material_payment_requests`

| Cột | Ghi chú |
|---|---|
| `contract_id`, `installment_key` | đợt thuộc lịch hiện hành tại lúc lập hoặc gửi lại |
| `amount` | > 0 |
| `note` | ≤ 1000 ký tự, tùy chọn |
| `state` | `submitted` \| `returned` \| `approved` \| `paid` \| `cancelled` |
| `submitted_by` | người gửi lần gần nhất |
| `cancel_reason` | bắt buộc khi `cancelled` |
| `version`, `created_by`, timestamps | |

`material_payment_request_invoices`: liên kết đề nghị với hóa đơn `recorded` cùng hợp đồng. Khi gửi lại, tập liên kết được thay toàn bộ, và lịch sử từng lần gửi lưu trong `material_payment_request_revisions` (bất biến: số lần gửi, số tiền, danh sách hóa đơn, người gửi, thời điểm).

`material_payment_decisions` (bất biến)

| Cột | Ghi chú |
|---|---|
| `payment_request_id`, `request_revision_no` | unique cặp: mỗi lần gửi chỉ có một quyết định |
| `decision` | `approve` \| `return` |
| `reason` | bắt buộc khi `return` |
| `decided_by`, `decided_at` | |

`material_payments` (bất biến)

| Cột | Ghi chú |
|---|---|
| `payment_request_id` | unique: một đề nghị đúng một lần chi |
| `contract_id`, `installment_key`, `amount` | snapshot từ đề nghị; `amount` bằng số tiền đề nghị |
| `paid_on` | date ≤ hôm nay |
| `bank_reference` | text bắt buộc, ≤ 100 ký tự |
| `proof_file_id` | file `payment_proof` |
| `proof_sha256` | unique theo `company_id` |
| `paid_by`, `recorded_at` | |

Một đợt được chi nhiều lần bằng nhiều đề nghị. Không có chi một phần của một đề nghị.

### 3.4 Trạng thái

Đề nghị chi:

```
submitted --approve--> approved --ghi chi--> paid
submitted --return---> returned --gửi lại--> submitted
submitted | returned | approved --hủy--> cancelled
```

Đơn mua: thêm trạng thái suy ra `contract_status = awaiting_contract | contracted` (có hay không dòng `material_contracts`). Ba trạng thái `active | suspended | cancelled` giữ nguyên. Chỉ đơn `active` mới ghi hợp đồng được.

### 3.5 Ràng buộc

Kiểm trong RPC sau khi khóa hàng theo thứ tự cố định: đơn → hợp đồng → đề nghị chi (theo id tăng dần).

1. Phiên bản: Σ `amount` các đợt = `total`; `installment_key` không trùng trong một phiên bản; ít nhất một đợt.
2. Theo đợt hiện hành: `paid + pending ≤ amount`, với `paid` = Σ lần chi của `installment_key`, `pending` = Σ đề nghị `submitted` hoặc `approved` của key đó.
3. Phụ lục:
   - Mỗi đợt cũ đã có `paid + pending > 0` phải còn trong lịch mới với `amount ≥ paid + pending`.
   - Đợt cũ có `paid + pending = 0` được bỏ.
   - `total` mới ≥ Σ hóa đơn `recorded` của hợp đồng.
4. Đề nghị cho đợt không phải tạm ứng phải liên kết ít nhất một hóa đơn `recorded` của cùng hợp đồng. Một hóa đơn được liên kết với nhiều đề nghị.
5. Σ `total` các hóa đơn `recorded` ≤ `total` của phiên bản hiện hành.
6. Hủy hóa đơn bị chặn nếu hóa đơn đang liên kết với đề nghị không ở trạng thái `cancelled`.
7. Người quyết định (`decided_by`) và người ghi chi (`paid_by`) phải khác `submitted_by` của lần gửi đang xét.
8. Đơn có hợp đồng: không sửa dòng, không hủy, không bị đình chỉ khi phiếu bị trả. Vá các trigger `c1_material_guard_signed_order` và `c1_material_guard_signed_allocation` cùng lệnh hủy đơn để kiểm `material_contracts` thay cho `material_order_contracts`. Bảng `material_order_contracts` (đang trống) ngừng dùng; không xóa trong A4/A5.
9. File gắn vào lệnh phải `finalized`, cùng scope, đúng loại file và đúng đối tượng; một file chỉ gắn vào một lệnh.

## 4. File chứng từ

Dùng lại `cost_evidence_files`, bucket riêng hiện có, luồng upload intent → upload → finalize (kiểm mime, kích thước, sha256) → đọc qua link ký 60 giây.

Mở rộng `material_evidence_scopes`:

| Đối tượng | Loại file | Định dạng | Quyền tải lên |
|---|---|---|---|
| `material_order` | `signed_contract`, `signed_quotation` (đã có) | PDF | `material.contract.record` |
| `material_contract` (mới) | `contract_amendment` | PDF | `material.contract.record` |
| `material_contract` (mới) | `invoice` | PDF, XML | `material.contract.record` |
| `material_contract` (mới) | `payment_proof` | PDF, JPG, PNG | `material.payment.execute` |

Giới hạn kích thước giữ 25 MiB. Cập nhật đồng bộ constraint `material_evidence_scopes_role_target_check`, helper kiểm mime phía server và `app/utils/costs/material-evidence-uploader.ts`.

## 5. Quyền

| Quyền | Vai trò thường gán | Được làm |
|---|---|---|
| `material.contract.record` (đã có) | Kế toán | Ghi hợp đồng, phụ lục, nhập và hủy hóa đơn |
| `material.payment.request` (mới) | Kế toán | Lập, gửi lại, hủy đề nghị chi |
| `material.payment.approve` (mới) | Thủ quỹ | Duyệt hoặc trả lại đề nghị chi |
| `material.payment.execute` (mới) | Thủ quỹ | Ghi lần chi, tải ủy nhiệm chi |
| `material.finance.read` (mới) | Giám đốc, kế toán, thủ quỹ | Xem hợp đồng, hóa đơn, đề nghị, số liệu dự án và công nợ NCC |

- Mọi quyền mới đi kèm `material.read`. Migration chỉ thêm quyền vào catalog; không tự gán cho vai trò nào.
- Kiểm quyền bằng `private.c1_workflow_user_has_permission` / `private.c1_material_actor_has_permission` ở RPC, cộng kiểm ở service và route.
- Mua hàng (`material.order.manage`) và kỹ sư (người tạo phiếu) chỉ thấy trạng thái hợp đồng của đơn và phiếu liên quan (`contract_status`, số hợp đồng, ngày ký). Họ không thấy giá trị, hóa đơn hay thanh toán.
- Đọc chi tiết hợp đồng cần `material.finance.read`, `material.contract.record`, `material.payment.request`, `material.payment.approve` hoặc `material.payment.execute`.

## 6. Thông báo

Bảng chung `app_notifications` (cấp công ty):

| Cột | Ghi chú |
|---|---|
| `tenant_id`, `company_id`, `project_id` (nullable) | |
| `recipient_id` | user nhận |
| `event_kind` | xem bảng sự kiện |
| `source_type`, `source_id` | đối tượng gây sự kiện |
| `link_path` | đường dẫn trong app để mở |
| `payload` | jsonb dữ liệu hiển thị (tên dự án, NCC, số hợp đồng, số tiền…) |
| `dedupe_key` | unique cùng `recipient_id` |
| `created_at`, `read_at` | |

- RLS: user chỉ đọc thông báo của chính mình. Đánh dấu đã đọc qua RPC.
- Thông báo được ghi cùng transaction với sự kiện; retry cùng idempotency key không tạo thêm thông báo nhờ `dedupe_key`.
- Người nhận được xác định tại thời điểm sự kiện, là các thành viên công ty có quyền tương ứng và đọc được dự án. Người tự gây sự kiện không nhận thông báo của chính mình.
- Mở rộng email sau này: thêm bảng hàng đợi gửi theo kênh và một worker đọc `app_notifications`; không đổi chỗ phát sự kiện. A4/A5 không tạo bảng này.
- Chuông hiện có (`CostNotificationBell.vue`) đọc thêm nguồn `app_notifications` và gộp danh sách theo thời gian, giữ nguyên hành vi của thông báo C1.

| `event_kind` | Khi nào | Người nhận | `dedupe_key` |
|---|---|---|---|
| `material.order.created` | Tạo đơn (patch `c1_material_create_order`) | Có `material.contract.record` | `order:<id>` |
| `material.contract.recorded` | Ghi hợp đồng gốc | Có `material.finance.read`, người tạo đơn, người tạo phiếu | `contract:<id>:v1` |
| `material.contract.amended` | Ghi phụ lục | Như trên | `contract:<id>:v<n>` |
| `material.installment.due_soon` | Job: còn ≤ 3 ngày tới hạn, chưa chi đủ | Có `material.contract.record` | `inst:<key>:due_soon:<due_on>` |
| `material.installment.overdue` | Job: đã qua hạn, chưa chi đủ | Có `material.contract.record` | `inst:<key>:overdue:<due_on>` |
| `material.payment.submitted` | Gửi hoặc gửi lại đề nghị | Có `material.payment.approve` | `pr:<id>:sub:<rev>` |
| `material.payment.returned` | Thủ quỹ trả lại | `submitted_by` | `pr:<id>:ret:<rev>` |
| `material.payment.paid` | Ghi lần chi | `submitted_by` | `pr:<id>:paid` |

## 7. Job nhắc hạn

- Endpoint `POST /api/internal/material-reminders`, xác thực bằng secret server (`runtimeConfig.materialReminderSecret`, so sánh constant-time); thiếu hoặc sai trả 401 và không làm gì.
- Endpoint gọi một RPC chạy bằng service role, quét các đợt hiện hành chưa chi đủ (`amount - paid > 0`) của mọi công ty:
  - `0 ≤ due_on − hôm nay ≤ 3` thì phát `due_soon`.
  - `due_on < hôm nay` thì phát `overdue`.
- Mỗi đợt chỉ được nhắc một lần cho mỗi loại và mỗi hạn, nhờ `dedupe_key`. Phụ lục đổi hạn thì đợt được nhắc lại theo hạn mới.
- Lịch chạy là cron InstaCloud mỗi ngày lúc 07:00 Asia/Ho_Chi_Minh. Tạo cron là thao tác hạ tầng, cần xin phép riêng.
- Hộp việc tự tính trạng thái sắp hạn hoặc quá hạn khi mở, nên không phụ thuộc vào việc job đã chạy.

## 8. API

Prefix dự án: `/api/companies/:companyId/projects/:projectId/material-procurement/`. Lệnh ghi cần header `Idempotency-Key` (uuid) và `expectedVersion` trong body. Lệnh trả `{resourceId, version, replayed}` cộng id liên quan. Lỗi nghiệp vụ trả mã ổn định (`VERSION_CONFLICT`, `IDEMPOTENCY_CONFLICT`, `INSTALLMENT_CAPACITY_EXCEEDED`, `INVOICE_REQUIRED`, `SELF_DECISION_FORBIDDEN`, `PROOF_ALREADY_USED`, `AMENDMENT_BELOW_COMMITTED`, `INVOICE_TOTAL_EXCEEDED`, `INVOICE_IN_USE`, `ORDER_NOT_ACTIVE`, `CONTRACT_EXISTS`…).

| Method + path | Quyền | Việc |
|---|---|---|
| `GET orders/:orderId/contract` | đọc chi tiết hợp đồng | Hợp đồng, phiên bản, lịch đợt kèm đã đề nghị/đã chi/còn lại |
| `POST orders/:orderId/contract` | `contract.record` | Ghi hợp đồng gốc (`expectedOrderVersion`) |
| `POST contracts/:contractId/amendments` | `contract.record` | Ghi phụ lục (`expectedVersion` của hợp đồng) |
| `GET contracts/:contractId/invoices` | đọc chi tiết hợp đồng | Danh sách hóa đơn |
| `POST contracts/:contractId/invoices` | `contract.record` | Nhập hóa đơn và tên vật tư theo dòng |
| `POST invoices/:invoiceId/void` | `contract.record` | Hủy hóa đơn, ghi lý do |
| `GET contracts/:contractId/payment-requests` | đọc chi tiết hợp đồng | Danh sách đề nghị, quyết định, lần chi |
| `POST contracts/:contractId/payment-requests` | `payment.request` | Lập đề nghị |
| `PATCH payment-requests/:id` | `payment.request` | Sửa đề nghị bị trả lại và gửi lại |
| `POST payment-requests/:id/cancel` | `payment.request` | Hủy |
| `POST payment-requests/:id/decisions` | `payment.approve` | Duyệt / trả lại |
| `POST payment-requests/:id/payment` | `payment.execute` | Ghi lần chi |
| `GET material-finance/summary` | `finance.read` | Số liệu vật tư của dự án và danh sách hợp đồng |

Cấp công ty (`/api/companies/:companyId/`):

| Method + path | Quyền | Việc |
|---|---|---|
| `GET material-finance/inbox?projectId=` | theo quyền | Hộp việc theo vai trò |
| `GET material-finance/suppliers` | `finance.read` | Công nợ theo NCC qua các dự án |
| `GET notifications?cursor=` | đăng nhập | Thông báo của user |
| `POST notifications/:id/read` | đăng nhập | Đánh dấu đã đọc |

Evidence dùng lại các route `material-procurement/evidence/*` hiện có với loại file mới.

`materialOrderViewSchema` thay placeholder:

- `contract` thành `{id, contractNo, signedOn, currentVersionNo} | null` cho người chỉ thấy trạng thái. Người có quyền đọc chi tiết hợp đồng thấy thêm `total`.
- `cash` thành `{committed, paid, pending, remaining}`, chỉ trả cho người có quyền đọc chi tiết hợp đồng, người khác nhận null.

Cập nhật manifest, repository interface, HTTP repository (bỏ `unsupported('recordContract')`) và mock repository.

## 9. Giao diện

UI giao cho `ui-agy`, theo style Nuxt UI hiện có, không thêm package. Sau mỗi lệnh ghi, màn hình đọc lại dữ liệu canonical bằng GET.

1. **Hộp việc** `/materials/finance`. Lọc theo dự án; tab hiện theo quyền:
   - Kế toán: Đơn chờ hợp đồng, Đợt sắp/quá hạn, Đề nghị bị trả lại.
   - Thủ quỹ: Chờ duyệt, Đã duyệt – chờ chi.
2. **Chi tiết đơn** `/materials/[projectId]/orders/[orderId]`:
   - Thông tin đơn và các dòng.
   - Panel ghi hợp đồng:
     - Tải 2 file.
     - Giá trị trước VAT, VAT và tổng; tổng tự tính từ hai ô trước nhưng vẫn sửa được.
     - Tổng đơn đặt cạnh để so, ô lý do hiện khi lệch.
     - Soạn lịch đợt: nhập % hoặc số tiền, hiện phần còn thiếu hoặc dư; đợt cuối nhận phần chênh do làm tròn.
   - Lịch sử phiên bản và phụ lục.
   - Bảng đợt: số tiền, hạn, đã đề nghị, đã chi, còn lại, badge sắp hạn/quá hạn, cờ tạm ứng.
   - Hóa đơn: nhập, hủy, xem file; ô tên vật tư theo dòng gợi ý từ tên hóa đơn của NCC đã lưu và tên dự kiến của A1.
   - Đề nghị chi: lập, gửi lại, hủy, duyệt/trả, ghi chi; nút hiện theo quyền và trạng thái.
3. **Số liệu dự án** `/materials/[projectId]/finance`: cam kết, đã chi, đang chờ chi, còn phải trả, quá hạn, đã nhận hóa đơn; danh sách hợp đồng.
4. **Công nợ NCC** `/materials/finance/suppliers`: mỗi NCC có cam kết, đã chi, còn nợ, quá hạn; mở ra xem từng hợp đồng.
5. **Thay đổi màn hình cũ**:
   - Trong `MaterialOrderCreatePanel.vue`, badge hợp đồng của đơn thành link sang chi tiết đơn. Làm sau khi phần sửa A3 đã merge.
   - Chuông gộp hai nguồn thông báo.
   - Menu thêm "Tài chính vật tư" cho người có một trong các quyền tài chính vật tư.

## 10. Số liệu

Một hàm thuần trên server `summarizeMaterialFinance(facts)` tính cho mọi màn hình; ba màn hình chỉ khác cách gom (đơn, dự án, NCC).

| Số liệu | Cách tính |
|---|---|
| Cam kết | Σ `total` phiên bản hiện hành |
| Đã chi | Σ `material_payments.amount` |
| Đang chờ chi | Σ đề nghị `submitted` + `approved` |
| Còn phải trả | Cam kết − đã chi |
| Quá hạn | Σ max(0, `amount` − đã chi của đợt) với đợt hiện hành có `due_on` < hôm nay |
| Đã nhận hóa đơn | Σ `total` hóa đơn `recorded` |
| Đã chi chưa có hóa đơn | max(0, đã chi − đã nhận hóa đơn) |

Số liệu vật tư hiển thị riêng với nhãn "Vật tư". Không cộng vào số liệu C1, không cộng với `commitment_total` nhập tham khảo.

## 11. Kiểm thử

- pgTAP (`supabase/tests/database/c1/c1_material_contract_payment*.test.sql`) cho:
  - Mọi ràng buộc mục 3.5.
  - RLS chặn chéo hai công ty, người nhận thông báo chỉ thấy của mình.
  - Mua hàng và kỹ sư không đọc được giá trị hợp đồng.
  - Không tự duyệt và không tự ghi chi.
  - Ủy nhiệm chi dùng lại bị chặn.
  - Idempotency (cùng key trả cùng kết quả, khác payload thì conflict).
  - Dedupe thông báo.
  - Hai đề nghị đồng thời không vượt số tiền đợt.
- Vitest:
  - Schema Zod.
  - Service và route: kiểm quyền và chuyển lỗi.
  - `summarizeMaterialFinance` với các ví dụ:
    - Hợp đồng 100, đã chi 30, đang chờ 20 → còn phải trả 70.
    - Quá hạn tính đúng khi chi một phần.
  - Endpoint nhắc hạn: sai secret thì 401.
  - HTTP repository.
  - Static guard spec cho các migration mới.
- Playwright (mock):
  - Kế toán ghi hợp đồng 2 đợt (tạm ứng 30%, còn lại 70%) → đề nghị tạm ứng không hóa đơn → thủ quỹ trả lại → gửi lại → duyệt → ghi chi → số liệu cập nhật.
  - Đợt 70% bị chặn khi chưa có hóa đơn, có hóa đơn thì đi qua.
- Không coi toàn bộ test suite là xanh vì baseline có lỗi sẵn; báo kết quả theo các file test liên quan và so với baseline.

## 12. Chia task và song song

Nền: worktree tách từ `0c226cdd`. Repo có `.insta/`, nên mỗi task song song dùng worktree riêng và branch environment InstaCloud riêng.

| Task | Thứ tự | Nội dung |
|---|---|---|
| T0 Nền | Chạy trước, tuần tự | Zod schema và kiểu API, manifest, repository interface và mock. Migration nền: bảng, constraint, RLS, helper đọc, quyền, mở rộng evidence scope, `app_notifications`, vá trigger khóa đơn |
| T1 Backend A4 | Song song sau T0 | RPC và route hợp đồng/phụ lục; thông báo `order.created`, `contract.*` |
| T2 Backend A5 | Song song sau T0 | Hóa đơn, đề nghị chi, quyết định, ghi chi; thông báo `payment.*` |
| T3 Backend số liệu | Song song sau T0 | `summarizeMaterialFinance`, summary, inbox, công nợ NCC, API thông báo, endpoint nhắc hạn |
| T4 UI chi tiết đơn + hợp đồng | Song song sau T0 | `ui-agy`, chạy trên mock |
| T5 UI hộp việc + đề nghị chi | Song song sau T0 | `ui-agy`, chạy trên mock |
| T6 UI số liệu, chuông, menu | Song song sau T0 | `ui-agy`, chạy trên mock |
| T7 Tích hợp | Chạy cuối | Merge, link từ badge A3, `verifier` chạy typecheck/lint/build/test, `reviewer` rà bảo mật và kiến trúc |

Migration của T0–T3 được định trước tên và số khóa `pg_advisory_xact_lock(71842, N)` với N = 50, 51, 52, 53, timestamp tăng dần sau `20261010072624`. Plan ghi tên chính xác. Các task chỉ sửa file trong phạm vi của mình. File dùng chung (manifest, repository, permissions, navigation, layout, generated types) chỉ T0 và T7 được sửa.

Phần sửa A3 đang làm (UI báo giá, định dạng số, mã NCC) chạy song song và merge trước T7.

## 13. Điều kiện Cloud và môi trường

Các thao tác sau mỗi lần cần người dùng cho phép riêng; việc duyệt spec hoặc plan không bao gồm chúng:

- Đẩy migration lên Cloud DEV.
- Sinh `shared/types/database.types.ts`.
- Chạy pgTAP trên Cloud.
- Tạo branch environment và cron InstaCloud.
- Deploy preview.

Không đụng production và `dev-preview`. Migration forward-only, không sửa migration đã áp dụng. Không thêm dependency.

## 14. Follow-up

- F1: Gửi email thông báo (bảng hàng đợi gửi + worker).
- F2: Duyệt chi cấp giám đốc theo hạn mức.
- F3: Gộp số liệu vật tư vào báo cáo tài chính C1.
- F4: GPT đọc hóa đơn và hợp đồng để điền sẵn.
- F5: Nghiệm thu, giao nhận, kho.
- F6: Đối chiếu số tiền hóa đơn với lần chi; đối chiếu sao kê ngân hàng.
- F7: Cấu hình số ngày nhắc trước theo công ty.
