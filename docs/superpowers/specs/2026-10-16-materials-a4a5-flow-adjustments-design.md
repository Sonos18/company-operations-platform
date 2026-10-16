# Vật tư A4/A5 — Điều chỉnh luồng trước phần B

Ngày: 2026-10-16. Tài liệu này điều chỉnh các thiết kế sau:
- `2026-10-15-materials-a4-a5-contract-payment-design.md` (gọi là "spec A4/A5");
- `2026-10-16-materials-a4a5-small-orders-design.md` (gọi là "spec đơn nhỏ").

Nền: nhánh `feat/materials-a4a5-small-orders` (PR #44). Tài liệu server: `docs/server/material-finance.md`.

## 1. Lý do

Nhân viên dùng thử luồng A4/A5 và thấy ba chỗ lệch với cách công ty đang làm:

1. **Tên vật tư trên hóa đơn có quá nhiều nơi sửa.** Hiện có ba nguồn: kỹ sư đề xuất, mua hàng ghi đè, kế toán nhập. Thực tế chỉ kế toán nhập, và nhập lúc nhập hóa đơn NCC.
2. **Đơn dưới 5 triệu không hợp đồng vẫn có thể có VAT.** Hiện server ép VAT = 0.
3. **Luồng chi khác thực tế:**
   - Thủ quỹ lập ủy nhiệm chi (UNC) trên app ngân hàng.
   - Giám đốc duyệt trên app ngân hàng.
   - Kế toán tải biên lai chuyển khoản lên hệ thống.
   - Hóa đơn chính thức của NCC thường về sau khi đã chi. Trước đó kế toán đã có hóa đơn nháp hoặc bản đã ký, cùng nội dung với bản chính.

**Nguyên tắc** (theo user): làm đúng luồng chính trước, không thêm trạng thái mới. Các luồng phát sinh (giám đốc từ chối, hóa đơn chính lệch…) làm sau, khi nhân viên đã dùng thử luồng chính.

## 2. Phạm vi

**Làm:**

| # | Thay đổi |
|---|---|
| C1 | Bỏ hẳn tên do kỹ sư đề xuất và tên do mua hàng ghi đè, không giữ dữ liệu cũ. Tên vật tư trên hóa đơn chỉ do kế toán nhập trong form nhập hóa đơn NCC (đã có). |
| C2 | Bản ghi không hợp đồng (`quotation_only`) được nhập VAT; tổng = trước VAT + VAT. |
| C3 | Hóa đơn có hai giai đoạn trên **cùng một bản ghi**: "Nháp" (bản nháp hoặc bản đã ký NCC đưa) và "Chính thức". Cập nhật lên chính thức chỉ là đính thêm file chính thức; nội dung giữ nguyên, file nháp vẫn được lưu. |
| C4 | Đổi người làm trong luồng chi: thủ quỹ chỉ **xác nhận đã lập UNC**; **kế toán** ghi lần chi kèm biên lai chuyển khoản. |
| C5 | Đổi nhãn trạng thái đề nghị chi theo luồng mới, không thêm trạng thái. |

**Không làm:**
- Trạng thái "Hoàn tất" cho đơn.
- Luồng giám đốc từ chối trên ngân hàng; hóa đơn chính thức khác bản nháp.
- Nghiệp vụ trả lại và hủy đề nghị: giữ nguyên như hiện có, không đổi.
- AI kiểm chứng từ (phần B). Spec B cần cập nhật theo C3/C4 sau khi tài liệu này được duyệt.

## 3. C1 — Bỏ tên hóa đơn do kỹ sư và mua hàng nhập

**Bỏ, kể cả dữ liệu** (bằng migration mới, không sửa migration cũ):
- Cột `material_proposal_lines.engineer_proposed_invoice_name` và `material_proposal_revision_lines.engineer_proposed_invoice_name`, cùng các CHECK khoảng trắng đi kèm.
- Bảng `material_proposal_invoice_name_overrides`.
- RPC `private.`/`public.c1_material_set_proposal_invoice_name`.
- Helper `private.c1_material_engineer_invoice_name`.
- Khóa `proposedInvoiceName` ở dòng phiếu trong `c1_material_create_proposal`, `c1_material_update_proposal`; phần snapshot cột ở `c1_material_submit_proposal`.
- Các khóa JSON của phiếu: `engineerProposedInvoiceName`, `buyerProposedInvoiceName`, `effectiveInvoiceDisplayName`, `invoiceDisplayNameSource`, `buyerOverrideVersion`, `buyerInvoiceNameEditable`.

**Giữ:**
- `currentRevisionId` trong JSON phiếu (quyết định của người thiết kế, vì vô hại và có thể còn dùng).
- Tên vật tư kế toán nhập ở `material_invoice_lines.invoice_material_name`.
- Gợi ý "NCC: <tên>" lấy từ `material_supplier_names`.
- Gợi ý "Đề xuất: <tên>" trong form hóa đơn, nhưng lấy từ **tên vật tư gốc** của dòng phiếu (`materialName`).

**Phía TS/UI bỏ theo:**
- Schema `setBuyerInvoiceNameInputSchema`, `proposedInvoiceName` và các trường tên ở view dòng phiếu.
- Route `.../lines/[lineId]/invoice-name.patch.ts`.
- Phần service, repository, HTTP repository liên quan.
- Ô nhập của kỹ sư trong `MaterialProposalForm.vue`.
- Ô sửa của mua hàng và badge nguồn tên trong `proposals/[proposalId].vue`.
- Nhãn nguồn trong `MaterialQuotationComparisonPanel.vue` (hiện tên vật tư gốc).
- Các trường tên trong `getCanonicalLineProjection()` của `MaterialOrderCreatePanel.vue` (:1279-1296). Hàm này tạo khóa nhận diện đầu vào phân tích báo giá, nên bỏ các trường làm khóa đổi: kết quả phân tích chạy trước đó sẽ không còn được nhận lại và phải phân tích lại. Chấp nhận được.
- Ba trường tên mà `quotation-provider.ts` gửi cho AI báo giá (thay bằng tên gốc).

**Test bỏ hoặc sửa:**
- Bỏ `c1_material_engineer_invoice_name.test.sql` và guard `c1-material-engineer-invoice-name-guard.spec.ts`, đồng thời gỡ hai file này khỏi `run-c1-cloud-dev-tests.mjs` và `material-cloud-runner.spec.ts`.
- Sửa các phần liên quan trong `material-proposal.spec.ts`, `http-material-procurement-repository.spec.ts`, `material-procurement.spec.ts` và `material-quotation-analysis.spec.ts`.
- Không đụng `shared/schemas/costs/direct-contract-authority.ts`, vì nó thuộc luồng khác.

## 4. C2 — VAT cho bản ghi không hợp đồng

- Lệnh `c1_material_record_contract`, nhánh `quotation_only`:
  - Nhận thêm `vatAmount` và `total`, **cả hai đều tùy chọn**. Thiếu `vatAmount` thì coi là `0`; thiếu `total` thì `total = subtotal + vatAmount`. Có gửi thì kiểm như nhánh hợp đồng (`total = subtotal + vatAmount`, VAT ≥ 0, sai thì báo `CONTRACT_TOTAL_MISMATCH`).
- **Đơn không hợp đồng đi chung luồng với đơn có hợp đồng** (theo user). Chỉ khác là không có hợp đồng và VAT tùy chọn. Vì vậy hai quy tắc của spec đơn nhỏ được **bãi bỏ**:
  - R6: nay đề nghị chi của đơn không hợp đồng **bắt buộc có hóa đơn** (nháp hoặc chính thức) như đơn có hợp đồng. `c1_material_installment_requires_invoice` trở về `not is_advance`, và đổi lại mọi chỗ gọi helper này.
  - Mục 7 (số liệu): "Đã chi chưa có hóa đơn" **tính lại** cả đơn không hợp đồng; bỏ phần loại trừ trong `material-finance-summary.ts`.
  - Vẫn không nhận `contractNo`, `contractFileId`, `installments`.
- **Ngưỡng:** vẫn phải có **tổng đơn gốc** (`order_subtotal_snapshot`) `< 5000000`. Ngoài ra **tổng sau VAT** nhập vào cũng phải `< 5000000`, vì quy định áp theo giá trị hóa đơn. Sai thì báo `CONTRACT_REQUIRED`.
- Đợt tự sinh vẫn là "Thanh toán 100%", `amount = total` (đã gồm VAT).
- CHECK `material_contract_versions_contract_file_check` đổi thành `contract_file_id is not null or (kind = 'original' and total < 5000000)`.
- Chi tiền mặt (quy tắc R7 đã sửa) không đổi, vì đã so trên tổng hiện hành.
- **TS/UI:**
  - Nhánh `quotation_only` của schema thêm `vatAmount`, `total` và refine cân bằng.
  - `MaterialContractRecordPanel.vue` hiện lại ô VAT/tổng ở chế độ "Không có hợp đồng". Tóm tắt đổi thành "Thanh toán 100% · Tổng {tổng}".
  - Điều kiện hiện lựa chọn vẫn dựa trên tổng đơn gốc.
  - Nếu tổng sau VAT ≥ 5.000.000 thì báo ngay trên form: "Tổng sau VAT từ 5.000.000 đ trở lên phải có hợp đồng."

## 5. C3 — Hóa đơn nháp và chính thức

**Dữ liệu** (`material_invoices`, migration mới):

| Cột | Ghi chú |
|---|---|
| `stage text not null default 'official'` | `check (stage in ('draft','official'))`. Dòng cũ nhận `'official'`. |
| `official_file_id uuid null unique` | FK `cost_evidence_files`. File chính thức; với hóa đơn nhập thẳng là chính thức thì là `null`, vì `file_id` đã là file chính thức. |
| `officialized_by uuid null`, `officialized_at timestamptz null` | Người và thời điểm cập nhật lên chính thức. |

- CHECK: chỉ cho phép đúng ba tổ hợp:
  - `stage = 'draft'` với `official_file_id`, `officialized_by`, `officialized_at` đều `null`: còn nháp;
  - `stage = 'official'` với cả ba cột đều `null`: tạo thẳng là chính thức;
  - `stage = 'official'` với cả ba cột đều khác `null`: nháp đã lên chính thức.
- `file_id` giữ nguyên ý nghĩa là file đầu tiên (nháp, hoặc chính thức nếu tạo thẳng). Không bao giờ bị ghi đè.
- Bảng có trigger bất biến cho dòng hóa đơn; bảng `material_invoices` đổi trạng thái qua RPC, như `void_invoice` hiện có.

**Lệnh:**
- `c1_material_record_invoice`: nhận thêm khóa `stage` (`'draft'` | `'official'`); thiếu thì coi là `'official'`. Các kiểm khác giữ nguyên.
- Lệnh mới `c1_material_officialize_invoice(company, project, invoice_id, {expectedVersion, officialFileId})`:
  - Quyền `material.contract.record` + `material.read`.
  - Hóa đơn phải `recorded` và `stage = 'draft'`, khác đi thì báo `VERSION_CONFLICT`.
  - File phải là role `invoice`, scope `material_contract` của đúng hợp đồng, đã finalize, chưa dùng ở đâu.
  - Helper dùng chung `c1_material_require_contract_file` (20261015090100:33-45) hiện chỉ kiểm `material_invoices.file_id`, nên phải kiểm thêm `official_file_id`. Nếu không, một file có thể làm chứng từ cho hai hóa đơn.
- Hóa đơn nháp có đủ ký hiệu, số, ngày và tiền như bản chính thức, vì user xác nhận nội dung giống nhau. Các ràng buộc hiện có (not null, chống trùng số) giữ nguyên.
  - Ghi `official_file_id`, `officialized_*`, `stage = 'official'`, tăng `version`.
  - Có idempotency receipt và audit. Không gửi thông báo, vì người thao tác chính là kế toán.
- `c1_material_void_invoice`: giữ nguyên.
- **MIME:** role `invoice` nhận thêm `image/jpeg` và `image/png` (ảnh chụp từ công trình). Áp dụng cho cả file nháp lẫn chính thức.
- **Bắt buộc hóa đơn khi lập đề nghị chi** (`INVOICE_REQUIRED`): giữ như hiện nay. Hóa đơn **nháp** được tính là hợp lệ.

**Số liệu:** "Đã nhận hóa đơn" cộng mọi hóa đơn `recorded`, cả nháp lẫn chính thức, vì nội dung giống nhau (quyết định của người thiết kế). Thêm số "Hóa đơn chờ bản chính thức" = Σ `total` các hóa đơn `stage = 'draft'`.

**UI:**
- Form nhập hóa đơn có lựa chọn "Bản nháp / bản đã ký (chờ bản chính thức)" hoặc "Hóa đơn chính thức", mặc định là bản nháp.
- Ô file nhận PDF, XML, JPG, PNG.
- Danh sách hóa đơn hiện nhãn "Nháp" hoặc "Chính thức".
- Hóa đơn nháp có nút "Cập nhật hóa đơn chính thức" (kế toán) để chọn file và gửi; xem được cả hai file.

## 6. C4 — Người thao tác trong luồng chi

| Bước | Ai | Lệnh | Thay đổi |
|---|---|---|---|
| Lập đề nghị chi kèm hóa đơn (nháp hoặc chính thức) | Kế toán | `create_payment_request` | Không đổi |
| Xác nhận đã lập UNC trên app ngân hàng | Thủ quỹ | `decide_payment_request` với `approve` | Chỉ đổi nhãn. Vẫn giữ chặn người lập tự duyệt (`SELF_DECISION_FORBIDDEN`). |
| Trả lại đề nghị | Thủ quỹ | `decide_payment_request` với `return` | Không đổi |
| Ghi lần chi kèm biên lai chuyển khoản (hoặc hóa đơn/phiếu chi hộ khi chi tiền mặt) | **Kế toán** | `record_payment` | **Bỏ** chặn `SELF_DECISION_FORBIDDEN` ở lệnh này, vì kế toán vừa lập đề nghị vừa ghi chi. Quyền vẫn là `material.payment.execute`. |

- **Quyền:** `material.payment.execute` chuyển sang vai trò kế toán. Không đổi mã quyền, chỉ đổi role nào được cấp.
  - Script `supabase/fixtures/material-a4a5-finance-actors.sql` hiện chỉ có ở nhánh `chore/materials-a4a5-finance-actors` (PR #43, chưa merge). Thứ tự (quyết định của người thiết kế): merge PR #43 vào `dev` trước, sau đó nhánh này merge `dev` vào rồi sửa script.
  - Sửa script: `a1_accountant` thêm `material.payment.execute`; `a1_treasurer` chỉ còn `material.read`, `material.finance.read`, `material.payment.approve`.
  - Script hiện chỉ dùng `on conflict do nothing` nên không gỡ được quyền. Thêm bước xóa đúng các quyền thừa của hai role fixture này (id cố định `…033` và `…034`), rồi kiểm lại số quyền đúng bằng danh sách.
- **Thông báo** (quyết định của người thiết kế), vì hệ thống không gửi thông báo cho chính người thao tác:
  - Thêm event `material.payment.approved` khi thủ quỹ xác nhận UNC, gửi cho người lập đề nghị (kế toán), không kèm tiền. Đây là tín hiệu để kế toán cập nhật biên lai.
  - `material.payment.paid` đổi người nhận sang thủ quỹ đã xác nhận UNC (`decided_by` của quyết định duyệt gần nhất).
  - Thêm event mới vào CHECK `event_kind` của `app_notifications` (foundation.sql:271-274) và enum TS (material-finance.ts:310).
- Bảng mô tả quyền trong `docs/server/material-finance.md` đổi theo: "Kế toán: ghi lần chi kèm biên lai", "Thủ quỹ: xác nhận đã lập UNC hoặc trả lại".
- **UI** (`app/utils/materials/payment-request-actions.ts`): `record_payment` cần `material.payment.execute`, bỏ điều kiện "khác người lập". `approve` và `return` giữ nguyên.
- **Chi tiền mặt** (đơn có cam kết dưới 5 triệu; quyết định của người thiết kế, user chưa chốt riêng):
  - Đi đúng các bước như chuyển khoản. Thủ quỹ xác nhận trên hệ thống đã lập UNC hoặc đã chi tiền mặt.
  - Kế toán ghi lần chi, chọn "Tiền mặt", và upload hóa đơn bán hàng hoặc phiếu chi hộ.
  - Hình thức chi vẫn chọn ở bước ghi lần chi như hiện nay.
  - Nút của thủ quỹ khi đơn được chi tiền mặt ghi "Xác nhận đã lập UNC / đã chi tiền mặt".

## 7. C5 — Nhãn trạng thái đề nghị chi

| Trạng thái | Nhãn cũ | Nhãn mới |
|---|---|---|
| `submitted` | Chờ duyệt | Chờ lập UNC |
| `approved` | Đã duyệt | Đã lập UNC – chờ giám đốc duyệt |
| `paid` | Đã chi | "Đã chi – chờ hóa đơn chính thức" nếu có hóa đơn liên kết đang `draft`; ngược lại "Đã chi" |
| `returned` | Bị trả lại | Bị trả lại (giữ) |
| `cancelled` | Đã hủy | Đã hủy (giữ) |

Nút bấm:
- Thủ quỹ: "Xác nhận đã lập UNC" (thay "Duyệt"), "Trả lại" (giữ).
- Kế toán: "Cập nhật biên lai chuyển khoản" (thay "Ghi chi"). Với chi tiền mặt, nhãn chứng từ vẫn là "Hóa đơn bán hàng hoặc phiếu chi hộ".

Đổi theo các chỗ hiển thị:
- tab hộp việc `app/pages/materials/finance/index.vue`;
- lịch sử quyết định trong `MaterialPaymentRequestPanel.vue`;
- nội dung thông báo `material.payment.submitted` / `paid` trong `app-notification-text.ts` (đổi nhãn, không đổi event).

## 8. Kiểm thử

- **pgTAP** (file mới `c1_material_flow_adjustments`):
  - Cột và bảng của C1 đã bị bỏ; tạo/sửa/gửi phiếu không nhận `proposedInvoiceName`; JSON phiếu không còn các khóa tên.
  - `quotation_only` có VAT: ghi được khi tổng đơn và tổng sau VAT đều < 5M; tổng sau VAT ≥ 5M thì `CONTRACT_REQUIRED`; lệch tổng thì `CONTRACT_TOTAL_MISMATCH`.
  - Hóa đơn nháp: ghi được, gắn được vào đề nghị chi; ghi chi xong rồi lên chính thức; lên chính thức hai lần thì `VERSION_CONFLICT`; file chính thức sai role hoặc scope thì `EVIDENCE_INVALID`; ảnh JPG được chấp nhận.
  - Kế toán lập đề nghị rồi chính kế toán ghi chi được; thủ quỹ duyệt đề nghị do chính mình lập vẫn bị chặn.
  - Dòng cũ: `stage = 'official'`.
- **Hồi quy:** 12 file pgTAP vật tư hiện có vẫn qua sau khi cập nhật các kỳ vọng bị ảnh hưởng (self-decision ở bước ghi chi, khóa JSON của phiếu, `stage` trong JSON hóa đơn), trừ file `engineer_invoice_name` đã bỏ.
- **Unit:** schema mới, nhãn trạng thái, quyền thao tác, số "Hóa đơn chờ bản chính thức".
- **E2E:** kịch bản luồng chính:
  - kế toán nhập hóa đơn nháp (ảnh) và lập đề nghị;
  - thủ quỹ xác nhận UNC;
  - kế toán cập nhật biên lai, nhãn hiện "Đã chi – chờ hóa đơn chính thức";
  - kế toán cập nhật hóa đơn chính thức, nhãn hiện "Đã chi".
  - Thêm một kịch bản đơn không hợp đồng có VAT.

## 9. Triển khai

- Migration mới, forward-only. Có **xóa dữ liệu** của C1 trên Cloud DEV; user đã đồng ý không giữ, nhưng vẫn hỏi lại lúc áp. Sau đó sinh lại `database.types.ts`.
- Script cấp role (C4) chạy lại trên Cloud DEV sau khi user đồng ý.
- Thứ tự app và DB: client cũ dùng schema strict sẽ lỗi khi DB thêm `stage` và bỏ các khóa tên. Phải cập nhật app ngay sau khi áp migration, như ở spec đơn nhỏ.
- `docs/server/material-finance.md` cập nhật C1–C5.

## 10. Phần để người làm quyết

- Viết lại các hàm phiếu (`c1_material_proposal_json`, `create/update/submit_proposal`) bằng `create or replace` từ định nghĩa hiện hành, hay patch theo anchor. Định nghĩa hiện hành đã qua nhiều lớp patch.
- Cách tách component cho nút "Cập nhật hóa đơn chính thức".
