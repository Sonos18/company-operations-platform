# Vật tư A4/A5 — Đơn dưới 5 triệu: không hợp đồng và chi tiền mặt

Ngày: 2026-10-16. Bổ sung cho `2026-10-15-materials-a4-a5-contract-payment-design.md` (gọi tắt là "spec A4/A5"). Tài liệu server: `docs/server/material-finance.md`.

## 1. Lý do

Theo quy định thanh toán không dùng tiền mặt, giao dịch mua hàng từ 5.000.000 đ trở lên phải chuyển khoản qua ngân hàng và có đủ chứng từ: hợp đồng, hóa đơn, ủy nhiệm chi. Giao dịch dưới mức đó được trả tiền mặt, và chỉ cần báo giá có ít nhất chữ ký bên bán.

Một phiếu đề xuất lớn thường được chia thành nhiều đơn. Ví dụ: phiếu trên 100 triệu chia thành ba đơn 48 + 48 + 4 triệu. Hai đơn 48 triệu đi theo luồng A4/A5 hiện có. Riêng đơn 4 triệu đang bị kẹt, vì A4/A5 bắt buộc mọi đơn phải có hợp đồng và mọi lần chi phải là chuyển khoản.

Mục tiêu: hoàn thiện luồng A4/A5 cho đơn nhỏ, nhưng không tách ra một luồng chi riêng.

## 2. Phạm vi

**Làm:**

1. Đơn có tổng tiền **dưới 5.000.000** được kế toán chọn "Có hợp đồng" hoặc "Không có hợp đồng".
2. Không có hợp đồng thì:
   - không có số hợp đồng, không có file hợp đồng;
   - VAT = 0, tổng = giá trị trước VAT;
   - đúng một đợt thanh toán 100%;
   - căn cứ duy nhất là báo giá có chữ ký bên bán (PDF hoặc ảnh JPG/PNG);
   - vẫn ghi ngày.
3. Đề nghị chi của đơn không hợp đồng không bắt buộc hóa đơn.
4. Đơn có cam kết **dưới 5.000.000** (có hoặc không có hợp đồng) được thủ quỹ chi bằng **chuyển khoản hoặc tiền mặt**.
   - Chi tiền mặt: không cần số tham chiếu ngân hàng. Chứng từ là một file (PDF hoặc ảnh), có thể là hóa đơn bán hàng của NCC hoặc phiếu chi hộ. Hệ thống không phân biệt hai loại này.
5. Đơn từ 5.000.000 trở lên: giữ nguyên như hiện nay, tức bắt buộc hợp đồng và chuyển khoản.

**Không làm:**

- AI đọc và kiểm chứng từ (phần B, có phiên và spec riêng).
- Chuyển đơn "không hợp đồng" sang "có hợp đồng" về sau.
- Phụ lục cho đơn không hợp đồng.
- Cấu hình mức 5 triệu theo công ty.
- Tiền tệ khác VND.
- Đưa số liệu vật tư vào báo cáo chi phí C1.

**Anti-goal:** đơn từ 5 triệu trở lên không được lách để thành không hợp đồng hoặc chi tiền mặt, kể cả khi gọi API trực tiếp. Mọi điều kiện về ngưỡng đều phải kiểm ở database, trong RPC.

## 3. Quy tắc nghiệp vụ

| # | Quy tắc |
|---|---|
| R1 | Ngưỡng `5000000` (VND). So sánh "nhỏ hơn hẳn" (`< 5000000`); đúng 5.000.000 vẫn bắt buộc hợp đồng và chuyển khoản. |
| R1b | Ngưỡng tính **riêng từng đơn**, vì quy định áp theo từng hóa đơn. Không cộng dồn các đơn cùng NCC, cùng phiếu hay cùng ngày, và không chặn việc tách một lần mua thành nhiều đơn nhỏ (quyết định của user). |
| R2 | Ngưỡng chỉ áp dụng khi tiền tệ của đơn là `VND`. Tiền tệ khác thì không cho "không hợp đồng" và không cho chi tiền mặt. |
| R3 | "Không có hợp đồng" chỉ hợp lệ khi **cả hai** đều `< 5000000`: (a) tổng đơn `order_subtotal_snapshot` (Σ số lượng × đơn giá, như hiện nay), và (b) `subtotal` kế toán nhập. Server tự đặt `total = subtotal` vì VAT = 0. Điều kiện (a) để không ai biến đơn 48 triệu thành "không hợp đồng" bằng cách nhập 4,9 triệu kèm lý do lệch. `subtotal` vẫn bắt buộc lý do lệch nếu khác tổng đơn, như hiện nay. |
| R4 | Ghi nhận không hợp đồng sinh đúng một đợt: `name='Thanh toán 100%'`, `amount=total`, `due_on=signed_on`, `is_advance=false`. Server tự sinh đợt này; client không gửi lịch đợt. Cách này giống mặc định "Thanh toán 100%" của spec A4/A5, nên nhắc hạn cũng như vậy: "sắp đến hạn" ngay trong ngày, "quá hạn" từ hôm sau nếu chưa chi (quyết định của người thiết kế, để đồng nhất với đơn có hợp đồng). |
| R5 | Bản ghi không hợp đồng không được làm phụ lục (lỗi `CONTRACT_AMENDMENT_UNAVAILABLE`). |
| R6 | Đề nghị chi thuộc bản ghi không hợp đồng không bắt buộc hóa đơn. Áp dụng ở cả ba chỗ đang kiểm `INVOICE_REQUIRED`: lập/gửi lại đề nghị, duyệt, ghi chi. Kế toán vẫn được nhập hóa đơn cho đơn này nếu có. |
| R7 | Chi tiền mặt chỉ hợp lệ khi cả `total` và `order_subtotal_snapshot` của phiên bản hiện hành đều `< 5000000` và tiền tệ là VND. Kiểm tại lúc ghi chi. Nếu phụ lục đã đẩy tổng lên từ 5 triệu trở lên, hoặc đơn gốc từ 5 triệu trở lên nhưng được ghi thành hợp đồng có `subtotal` thấp (kèm lý do chênh lệch), thì không được chi tiền mặt (lỗi `CASH_PAYMENT_NOT_ALLOWED`). |
| R8 | Chi chuyển khoản: bắt buộc `bankReference` như hiện nay. Chi tiền mặt: `bankReference` phải rỗng. |
| R9 | Chứng từ chi (role `payment_proof`, PDF/JPG/PNG) bắt buộc với cả hai hình thức. Quy tắc "một chứng từ chỉ dùng một lần" (`PROOF_ALREADY_USED`) giữ nguyên. |
| R10 | Báo giá có chữ ký (`signed_quotation`) nhận PDF/JPG/PNG khi tải lên. Hiện server chỉ chặn PDF ở bước tải lên; lệnh ghi hợp đồng không kiểm loại file. Vì vậy cần **kiểm mới** trong lệnh ghi: bản ghi **có** hợp đồng thì `cost_evidence_files.verified_mime_type` của báo giá phải là `application/pdf`, sai thì báo `EVIDENCE_INVALID`. Ảnh chỉ hợp lệ cho bản ghi không hợp đồng. |
| R11 | Sau khi ghi nhận (có hoặc không có hợp đồng), đơn bị khóa như hiện nay. |
| R12 | Thông báo, nhắc hạn, số liệu cam kết, đã chi và còn phải trả chạy như đơn có hợp đồng. |

## 4. Dữ liệu (migration mới, chỉ thêm, không sửa migration cũ)

Cách làm (quyết định của người thiết kế): **dùng lại `material_contracts`** cho bản ghi không hợp đồng. Đề nghị chi, đợt, hóa đơn, lần chi và scope chứng từ `material_contract` đều gắn vào `contract_id`. Dùng lại bảng này giữ được toàn bộ luồng chi và số liệu, chỉ cần nới các cột liên quan tới hợp đồng. Phương án tách một luồng chi theo đơn sẽ phải nhân đôi đề nghị chi, duyệt, ghi chi và số liệu, nên không chọn.

`material_contracts`:

| Thay đổi | Ghi chú |
|---|---|
| Thêm `documentation text not null default 'contract'` | `check (documentation in ('contract','quotation_only'))`. Dòng cũ nhận `'contract'`. |
| `contract_no` bỏ `not null` | Thêm `check ((documentation = 'contract') = (contract_no is not null))`. Check trim và độ dài cũ vẫn giữ khi có giá trị. |

`material_contract_versions`:

| Thay đổi | Ghi chú |
|---|---|
| `contract_file_id` bỏ `not null` | Giữ `unique` và FK. Thêm `check (contract_file_id is not null or (kind = 'original' and vat_amount = 0 and total < 5000000))` làm lưới an toàn. Ràng buộc chính xác (theo `documentation` và tiền tệ) nằm trong RPC, vì CHECK không đọc được bảng cha. |

`material_payments`:

| Thay đổi | Ghi chú |
|---|---|
| Thêm `method text not null default 'bank_transfer'` | `check (method in ('bank_transfer','cash'))`. Dòng cũ nhận `'bank_transfer'`. |
| `bank_reference` bỏ `not null` | Thêm `check ((method = 'bank_transfer') = (bank_reference is not null))`. Check trim và độ dài cũ vẫn giữ khi có giá trị. |

Hàm mới:

- `private.c1_material_small_order_threshold()` trả về `5000000::numeric`, `immutable`. Phía TS có hằng `MATERIAL_SMALL_ORDER_THRESHOLD = '5000000'` trong `shared/constants/`. Một guard test đọc migration để bảo đảm hai giá trị khớp nhau.
- `private.c1_material_is_small_amount(total numeric, currency text)`: `currency = 'VND' and total < threshold`.
- `private.c1_material_installment_requires_invoice(contract, installment)`: trả `not installment.is_advance and contract.documentation = 'contract'`. Thay thế điều kiện ở 3 chỗ kiểm `INVOICE_REQUIRED` hiện có (`c1_material_link_request_invoices`, `c1_material_decide_payment_request`, `c1_material_record_payment`). Lưu ý: `c1_material_link_request_invoices(request, invoiceIds, is_advance boolean)` (20261015090200:201-220) chỉ nhận cờ `is_advance`. Người làm chọn một trong hai cách:
  - đổi chữ ký hàm (drop, tạo lại, cấp lại grant ở 20261015090200:1098);
  - viết lại hai lệnh gọi nó: lập đề nghị (:524) và gửi lại (:611). Hai lệnh này chưa được viết lại từ đó tới nay. Truyền vào giá trị `requires_invoice` thay cho `is_advance`.

Bảng lịch sử vẫn bất biến. Không có bảng mới. Sau migration phải sinh lại `database.types.ts`.

## 5. Lệnh (RPC) và API

### 5.1 Ghi nhận cho đơn: `c1_material_record_contract`

Input thêm khóa `documentation` (`'contract'` | `'quotation_only'`).

- `'contract'`: các khóa và kiểm tra giữ nguyên như hiện nay. Riêng `signedQuotationFileId` phải là file PDF (R10).
- `'quotation_only'`: các khóa là `expectedOrderVersion, signedOn, subtotal, varianceReason, signedQuotationFileId`. Gửi `contractNo`, `contractFileId`, `vatAmount`, `total` hoặc `installments` thì báo `INPUT_INVALID`.
  - Server đặt `vat_amount = 0`, `total = subtotal` và tự sinh đợt theo R4.
  - Kiểm R2 và R3. Không đạt thì báo lỗi mới `CONTRACT_REQUIRED`.
  - File báo giá kiểm như hiện nay (scope `material_order`/`signed_quotation`, đã finalize, chưa dùng), nhưng nhận cả PDF/JPG/PNG.
  - Mọi bước còn lại giữ như cũ: khóa đơn (`material_order_contracts`), receipt, audit, thông báo.
- Thiếu khóa `documentation` thì coi như `'contract'`, để client cũ vẫn chạy.

### 5.2 Phụ lục: `c1_material_amend_contract`

Bản ghi `quotation_only` báo `CONTRACT_AMENDMENT_UNAVAILABLE` (R5).

### 5.3 Ghi lần chi: `c1_material_record_payment`

Input thêm `method` (`'bank_transfer'` | `'cash'`). Thiếu khóa thì coi như `'bank_transfer'`.

- `bank_transfer`: giữ nguyên như hiện nay.
- `cash`: `bankReference` phải là `null` hoặc không gửi. Kiểm R7. Chứng từ kiểm như hiện nay.

### 5.4 Chứng từ

- `c1_material_evidence_mime_allowed`: `signed_quotation` nhận thêm `image/jpeg` và `image/png`.
- `c1_material_create_evidence_intent`: check PDF-only cũ (nhánh `FILE_TYPE_UNSUPPORTED`) bỏ `signed_quotation` ra.
- Phía TS đổi tương ứng: `materialEvidenceMimeTypes.signed_quotation = ['application/pdf','image/jpeg','image/png']`, trong `shared/schemas/costs/material-procurement.ts:303-310`.

### 5.5 Đọc

- Hợp đồng (`c1_material_read_contract`), đơn (`c1_material_order_json`), số liệu (`c1_material_finance_facts`) và `contractStatus` của phiếu: thêm `documentation`. `contractNo` có thể là `null`.
- Lần chi trong view đề nghị: thêm `method`. `bankReference` có thể là `null`.

### 5.6 TS (`shared/schemas/costs/material-finance.ts` và các schema liên quan)

- `recordMaterialContractInputSchema` thành union phân biệt theo `documentation`.
- `recordMaterialPaymentInputSchema` thêm `method`, kèm refine theo R8.
- Các view nới `contractNo` thành `string | null`, `contractFileId` thành `uuid | null`, `bankReference` thành `string | null`, và thêm `documentation`/`method`. Ít nhất gồm: contract view, version view, `contractRow`, `contractFactsSchema` trong `finance-read-repository.ts`, `materialOrderViewSchema.contract`, `materialProposalViewSchema.contractStatus`, payment view.
- Mã lỗi mới `CONTRACT_REQUIRED`, `CASH_PAYMENT_NOT_ALLOWED`, `CONTRACT_AMENDMENT_UNAVAILABLE`: thêm vào `shared/schemas/api-error.ts`, `server/features/costs/rpc-errors.ts` và thông điệp tiếng Việt phía client (`finance-ui.ts`, `contract-errors.ts`).

## 6. Giao diện

| Màn hình | Thay đổi |
|---|---|
| Ghi nhận hợp đồng (`MaterialContractRecordPanel.vue`) | Đơn có tổng `< 5.000.000` VND hiện lựa chọn "Có hợp đồng" (mặc định) / "Không có hợp đồng". Chọn "Không có hợp đồng" thì ẩn số hợp đồng, file hợp đồng, VAT và lịch đợt. Nhãn ngày đổi thành "Ngày ghi nhận". Ô báo giá nhận PDF/JPG/PNG, có gợi ý "Báo giá có ít nhất chữ ký bên bán". Hiện tóm tắt "VAT 0 · Thanh toán 100% · Tổng X". Đơn từ 5 triệu trở lên không hiện lựa chọn này. |
| Tóm tắt, lịch đợt, đơn, danh sách tài chính, NCC, phiếu (`contractStatus`) | Khi `documentation = 'quotation_only'` thì hiện "Không hợp đồng" thay cho "Hợp đồng {số}". Không hiện nút phụ lục. |
| Đề nghị chi (`MaterialPaymentRequestForm.vue`) | Bản ghi không hợp đồng: không bắt buộc chọn hóa đơn. Mô tả hiện "Không hợp đồng" thay cho số hợp đồng. |
| Ghi lần chi (`MaterialPaymentRecordDialog.vue`) | Cam kết `< 5.000.000` VND thì hiện lựa chọn "Chuyển khoản" (mặc định) / "Tiền mặt". Chọn "Tiền mặt" thì ẩn số tham chiếu ngân hàng và đổi nhãn chứng từ thành "Hóa đơn bán hàng hoặc phiếu chi hộ". |
| Lịch sử lần chi | Hiện hình thức chi. Chi tiền mặt thì không hiện số tham chiếu. |
| Thông báo (`app-notification-text.ts`) | Không có `contractNo` thì dùng nhãn "Đơn không hợp đồng" thay cho "Hợp đồng". Payload thêm `documentation`. |

Giao diện chỉ là lớp tiện lợi. Mọi điều kiện đều do server quyết định (anti-goal ở mục 2).

## 7. Số liệu

- Cam kết, đã chi, đang chờ chi, còn phải trả, quá hạn: không đổi công thức.
- "Đã chi chưa có hóa đơn" (`shared/utils/material-finance-summary.ts`, hiện là `max(0, paid − invoiced)` cộng trên mọi hợp đồng) bỏ hẳn các bản ghi `quotation_only` ra khỏi phép tính, cả **lần chi lẫn hóa đơn**. Nếu chỉ bỏ lần chi, hóa đơn của đơn nhỏ sẽ che mất các lần chi thiếu hóa đơn của hợp đồng khác. "Đã nhận hóa đơn" vẫn cộng mọi hóa đơn. `MaterialContractFacts` cần thêm trường `documentation`. Đây là quyết định của người thiết kế, vì đơn nhỏ không bắt buộc hóa đơn theo R6.

## 8. Kiểm thử

- **pgTAP:** file mới `c1_material_small_orders`, đăng ký trong `scripts/run-c1-cloud-dev-tests.mjs` và `tests/unit/material-cloud-runner.spec.ts`. Các ca:
  - ghi không hợp đồng với 4.999.999 thì thành công;
  - đúng 5.000.000 thì `CONTRACT_REQUIRED`;
  - đơn 48 triệu mà nhập subtotal 4,9 triệu kèm lý do lệch thì `CONTRACT_REQUIRED` (R3a);
  - tiền tệ khác VND thì `CONTRACT_REQUIRED`;
  - gửi `contractNo` khi không hợp đồng thì `INPUT_INVALID`;
  - đợt sinh tự động đúng R4;
  - báo giá dạng ảnh: hợp lệ khi không hợp đồng, `EVIDENCE_INVALID` khi có hợp đồng;
  - phụ lục cho bản ghi không hợp đồng thì `CONTRACT_AMENDMENT_UNAVAILABLE`;
  - đề nghị chi không hóa đơn đi được qua duyệt và ghi chi;
  - chi tiền mặt cho cam kết dưới 5 triệu (cả có và không có hợp đồng) thành công, `bank_reference` là null;
  - chi tiền mặt cho cam kết từ 5 triệu trở lên, hoặc sau khi phụ lục đẩy tổng lên từ 5 triệu, thì `CASH_PAYMENT_NOT_ALLOWED`;
  - chi tiền mặt kèm `bankReference` thì `INPUT_INVALID`;
  - các CHECK mới chặn ghi thẳng vào bảng;
  - dòng cũ nhận `documentation='contract'` và `method='bank_transfer'`.
- **Hồi quy:** các file pgTAP vật tư hiện có (10 file) vẫn qua. Các guard test migration trong `tests/unit/config/` được cập nhật hoặc bổ sung cho migration mới.
- **Unit:** schema union, refine R8, hằng ngưỡng khớp với SQL, summary loại trừ `quotation_only`, nhãn thông báo, logic hiển thị lựa chọn trên form.
- **E2E:** một kịch bản đơn 4 triệu: không hợp đồng (báo giá dạng ảnh) → đề nghị chi không hóa đơn → thủ quỹ duyệt → chi tiền mặt. Kiểm số liệu. Thêm một kiểm tra đơn 48 triệu không thấy lựa chọn "Không có hợp đồng" và "Tiền mặt".

## 9. Cloud và triển khai

- Migration chạy trên Cloud DEV chỉ khi user đồng ý từng lần, rồi sinh lại types. Không chạy `migration repair`, không đụng dev-preview hay production.
- Tài liệu `docs/server/material-finance.md` cập nhật các quy tắc R1–R12, mã lỗi mới và bảng quyền (không có quyền mới).

## 10. Phần để người làm quyết

- Tên migration và cách viết lại hàm. Theo tiền lệ A4/A5: `create or replace` cho hàm thuộc A4/A5, và anchor-replacement cho hàm sinh JSON của phiếu.
- Cách tách component cho lựa chọn hình thức trên form.
- Thứ tự task và mức song song khi lập kế hoạch.
