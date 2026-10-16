# Vật tư A4/A5 — Đơn dưới 5 triệu: không hợp đồng và chi tiền mặt — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đơn dưới 5 triệu được ghi nhận không có hợp đồng (VAT 0, một đợt 100%, căn cứ là báo giá có chữ ký, PDF hoặc ảnh). Đơn có cam kết dưới 5 triệu được thủ quỹ chi bằng tiền mặt. Toàn bộ luồng chi và số liệu A4/A5 giữ nguyên.

**Architecture:** Dùng lại `material_contracts`, thêm cờ `documentation` (`contract` | `quotation_only`), và thêm `method` (`bank_transfer` | `cash`) cho `material_payments`. Hai migration forward-only viết lại các RPC liên quan bằng `create or replace`, lấy định nghĩa hiện hành làm gốc. Mọi điều kiện ngưỡng được kiểm trong RPC; TS và UI chỉ phản chiếu lại.

**Tech Stack:** Nuxt 3, Vue 3, TypeScript, Zod, decimal.js, Supabase Postgres (plpgsql, pgTAP), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-16-materials-a4a5-small-orders-design.md`. Các quy tắc được gọi theo mã R1–R12 của spec. Spec gốc: `docs/superpowers/specs/2026-10-15-materials-a4-a5-contract-payment-design.md`.

## Global Constraints

- **Nhánh:**
  - Nền là `origin/dev` tại `074d023`. Nhánh tích hợp là `feat/materials-a4a5-small-orders`, worktree `.worktrees/materials-a4a5-small-orders`, đã có commit spec.
  - Mỗi task chạy song song làm trong worktree riêng tách từ nhánh tích hợp, sau đó merge về nhánh tích hợp.
- **Migration:**
  - Forward-only, tên chính xác như bảng dưới.
  - Mở đầu bằng `set local lock_timeout = '5s'; set local statement_timeout = '90s'; select pg_catalog.pg_advisory_xact_lock(71842, N);`. Kết thúc bằng `notify pgrst, 'reload schema';`.
  - Không sửa migration cũ. Hàm cần đổi thì `create or replace`, lấy gốc từ migration **mới nhất** đang định nghĩa hàm đó. Hàm sinh JSON của phiếu thì patch theo anchor, như `20261015090600` dòng 118–160 (có bỏ `chr(13)`).
  - Hàm `private.*`: `revoke all ... from public,anon,authenticated,service_role`. Khi đổi chữ ký hàm public thì grant lại đúng như cũ.
- **Lỗi nghiệp vụ:** `raise exception using errcode = 'P0001', message = '<CODE>'`. Ba mã mới: `CONTRACT_REQUIRED`, `CASH_PAYMENT_NOT_ALLOWED`, `CONTRACT_AMENDMENT_UNAVAILABLE`.
- **Ngưỡng và tiền:**
  - Ngưỡng là `5000000`, so sánh `<`, chỉ khi tiền tệ là `'VND'`. Mỗi đơn tính riêng, không cộng dồn (R1, R1b, R2).
  - Tiền là `numeric(20,4)`, JSON là chuỗi decimal, TS dùng `decimal.js`.
- **Giá trị cố định:**
  - Đợt sinh tự động: `name = 'Thanh toán 100%'`, `amount = total`, `due_on = signed_on`, `is_advance = false`.
  - MIME của báo giá có chữ ký: `application/pdf`, `image/jpeg`, `image/png`. Với bản ghi `contract` thì chỉ chấp nhận `application/pdf`.
- **Cloud và môi trường:**
  - Không đụng production, `dev-preview` hay Cloud DEV nếu user chưa cho phép từng thao tác: push migration, `db:dev:types`, pgTAP trên Cloud.
  - Không chạy `supabase migration repair`.
- **Kiểm thử:** baseline unit có lỗi sẵn; chỉ báo pass theo các file test của task. Lint baseline là 28 lỗi.
- **Văn bản:** UI và lỗi hiển thị bằng tiếng Việt. Nhãn cố định:
  - "Có hợp đồng", "Không có hợp đồng", "Không hợp đồng", "Ngày ghi nhận", "Báo giá có ít nhất chữ ký bên bán"
  - "Chuyển khoản", "Tiền mặt", "Hóa đơn bán hàng hoặc phiếu chi hộ"
  - "Đơn không hợp đồng" (trong thông báo)
- **Quy trình:** việc giao diện (T4, T5) giao cho `ui-agy` theo CLAUDE.md global; logic TS không phải giao diện giao cho `implementer`.

| Task | Migration | N |
|---|---|---|
| T1 | `supabase/migrations/20261016090000_c1_material_small_order_contracts.sql` | 57 |
| T2 | `supabase/migrations/20261016090100_c1_material_small_order_payments.sql` | 58 |

**Thứ tự và phụ thuộc:**
- T1 → T2 (T2 cần các helper của T1).
- T3 song song với T1/T2 vì không chung file. Shape JSON đã chốt ở mục "Hợp đồng dữ liệu".
- T4 và T5 song song với nhau, sau T3.
- T6 chạy cuối.

## Hợp đồng dữ liệu (chốt cho mọi task)

**Ghi nhận cho đơn** (`POST .../orders/:orderId/contract`, RPC `c1_material_record_contract`, `target_input`):
- `{ documentation: 'contract', expectedOrderVersion, contractNo, signedOn, subtotal, vatAmount, total, varianceReason, contractFileId, signedQuotationFileId, installments }`
- `{ documentation: 'quotation_only', expectedOrderVersion, signedOn, subtotal, varianceReason, signedQuotationFileId }`
- RPC coi thiếu `documentation` là `'contract'`. Client mới luôn gửi khóa này.

**Ghi lần chi** (RPC `c1_material_record_payment`, `target_input`): `{ expectedVersion, paidOn, method: 'bank_transfer' | 'cash', bankReference: string | null, proofFileId }`. RPC coi thiếu `method` là `'bank_transfer'`.

**Các view** (khóa mới trong JSON trả về):

| JSON | Thay đổi |
|---|---|
| `c1_material_read_contract` | thêm `documentation`; `contractNo` có thể là `null`; mỗi version có `contractFileId` có thể là `null` |
| `c1_material_order_json`.`contract` | thêm `documentation`; `contractNo` có thể là `null` |
| `c1_material_finance_facts` (từng hợp đồng) | thêm `documentation`; `contractNo` có thể là `null` |
| proposal JSON `contractStatus[]` | thêm `documentation`; `contractNo` có thể là `null` |
| payment trong view đề nghị chi | thêm `method`; `bankReference` có thể là `null` |
| payload thông báo `material.contract.recorded/amended`, `material.payment.*`, `material.installment.*` | thêm `documentation`; `contractNo` có thể là `null` |

Phía TS: trong mọi view schema, `documentation` là `z.enum(['contract','quotation_only']).default('contract')`, và `method` là `z.enum(['bank_transfer','cash']).default('bank_transfer')`. Nhờ vậy client mới vẫn đọc được DB chưa có migration.

## Review Focus

1. **Ranh giới ngưỡng:** tổng đơn 4.999.999,9999 phải được "không hợp đồng"; đúng 5.000.000 thì không. UI không hiện lựa chọn ở đúng 5.000.000. Test ở T1 (pgTAP) và T3 (`isMaterialSmallAmount`).
2. **Phụ lục đẩy tổng lên từ 5 triệu sau khi đã chọn tiền mặt được:** ghi chi tiền mặt lúc đó phải lỗi `CASH_PAYMENT_NOT_ALLOWED`, và dialog không còn hiện "Tiền mặt". Test ở T2 (pgTAP) và T5.
3. **Báo giá dạng ảnh dùng cho bản ghi có hợp đồng** (gọi API trực tiếp): phải lỗi `EVIDENCE_INVALID`. Test ở T1.
4. **Chi tiền mặt mà `bankReference` là chuỗi rỗng hoặc chỉ có khoảng trắng:** TS schema chuẩn hóa thành `null`; RPC từ chối mọi giá trị khác `null` bằng `INPUT_INVALID`. Test ở T2 và T3.
5. **Client mới đọc DB chưa có migration** (thiếu `documentation`/`method`): parse vẫn được và mặc định là `contract`/`bank_transfer`. Test ở T3. Chiều ngược lại (client cũ đọc DB mới) không sửa được bằng code; T6 phải pull code ngay sau khi áp migration lên Cloud DEV.

---

## Cấu trúc file

| File | Trách nhiệm | Task |
|---|---|---|
| `supabase/migrations/20261016090000_c1_material_small_order_contracts.sql` (mới) | DDL hợp đồng, helper ngưỡng, ghi nhận, phụ lục, chứng từ, yêu cầu hóa đơn khi lập/gửi lại/duyệt, các view đọc | T1 |
| `supabase/tests/database/c1/c1_material_small_order_contracts.test.sql` (mới) | pgTAP phía hợp đồng | T1 |
| `supabase/migrations/20261016090100_c1_material_small_order_payments.sql` (mới) | DDL lần chi, `record_payment` (tiền mặt và yêu cầu hóa đơn), view lần chi | T2 |
| `supabase/tests/database/c1/c1_material_small_order_payments.test.sql` (mới) | pgTAP phía chi | T2 |
| `scripts/run-c1-cloud-dev-tests.mjs`, `tests/unit/material-cloud-runner.spec.ts` | đăng ký 2 file pgTAP mới | T1, T2 |
| `tests/unit/config/c1-material-small-order-guard.spec.ts` (mới) | guard đọc SQL: tên, lock N, ngưỡng khớp hằng TS | T1 (T2 bổ sung) |
| `shared/constants/material-finance.ts` (mới) | `MATERIAL_SMALL_ORDER_THRESHOLD`, `MATERIAL_SMALL_ORDER_CURRENCY` | T3 |
| `shared/utils/material-small-order.ts` (mới) | `isMaterialSmallAmount` | T3 |
| `shared/schemas/costs/material-finance.ts`, `material-procurement.ts`, `api-error.ts` | input union, view nullable, MIME, mã lỗi | T3 |
| `shared/utils/material-finance-summary.ts` | loại `quotation_only` khỏi `paidWithoutInvoice` | T3 |
| `server/features/costs/rpc-errors.ts`, `server/features/costs/material-finance/*` | map lỗi, facts có `documentation` | T3 |
| `app/utils/materials/finance-ui.ts`, `contract-errors.ts`, `app/utils/notifications/app-notification-text.ts` | thông điệp lỗi và nhãn thông báo | T3 |
| `app/utils/materials/contract-label.ts` (mới) | `materialContractLabel` dùng chung cho mọi màn hình | T3 |
| `app/components/materials/finance/MaterialContractRecordPanel.vue`, `MaterialContractSummary.vue`, `app/pages/materials/[projectId]/orders/[orderId].vue`, `app/pages/materials/[projectId]/finance.vue`, `app/pages/materials/finance/suppliers.vue`, `app/pages/materials/[projectId]/proposals/[proposalId].vue`, `MaterialInvoicePanel.vue`, `MaterialInvoiceForm.vue` | lựa chọn ghi nhận và hiển thị "Không hợp đồng" | T4 |
| `MaterialPaymentRequestForm.vue`, `MaterialPaymentRecordDialog.vue`, `MaterialPaymentRequestPanel.vue` | hóa đơn tùy chọn, hình thức chi | T5 |
| `docs/server/material-finance.md`, `tests/e2e/material-small-orders.spec.ts` (mới) | tài liệu, e2e | T6 |

---

### Task 1: DB — ghi nhận không hợp đồng

**Files:**
- Create: `supabase/migrations/20261016090000_c1_material_small_order_contracts.sql`
- Create: `supabase/tests/database/c1/c1_material_small_order_contracts.test.sql`
- Create: `tests/unit/config/c1-material-small-order-guard.spec.ts`
- Modify: `scripts/run-c1-cloud-dev-tests.mjs:29-38`, `tests/unit/material-cloud-runner.spec.ts`

**Interfaces:**
- Produces (SQL):
  - `private.c1_material_small_order_threshold() returns numeric`: `immutable`, trả `5000000`.
  - `private.c1_material_is_small_amount(target_total numeric, target_currency text) returns boolean`: `target_currency = 'VND' and target_total < threshold`.
  - `private.c1_material_installment_requires_invoice(target_contract public.material_contracts, target_installment public.material_contract_installments) returns boolean`: `not is_advance and documentation = 'contract'`.
  - Cột `material_contracts.documentation` và các view theo mục "Hợp đồng dữ liệu".
- T2 dùng ba hàm trên.

- [ ] **Step 1: Viết pgTAP thất bại** `c1_material_small_order_contracts.test.sql`. Theo fixture và cách bọc `begin … rollback` của `c1_material_contracts.test.sql`. Các assertion:
  - `documentation` của dòng cũ là `'contract'` (`is`);
  - ghi `quotation_only` cho đơn tổng 4.999.999 với báo giá PNG thì thành công, và kiểm các giá trị sau:
    - `contract_no is null`
    - version: `vat_amount = 0`, `total = subtotal`, `contract_file_id is null`
    - đúng 1 đợt với `'Thanh toán 100%'`, `amount = total`, `due_on = signed_on`, `is_advance = false`
    - có dòng `material_order_contracts`
  - lỗi `CONTRACT_REQUIRED` (`throws_ok … 'P0001', 'CONTRACT_REQUIRED'`) trong các ca:
    - đơn đúng 5.000.000;
    - đơn 48.000.000 nhập `subtotal = 4900000` kèm `varianceReason`;
    - công ty có tiền tệ khác VND (đổi `default_currency_code` trong fixture);
  - `INPUT_INVALID` khi `quotation_only` có thêm `contractNo` hoặc `installments`;
  - `EVIDENCE_INVALID` khi bản ghi `contract` dùng báo giá `image/png`;
  - `CONTRACT_AMENDMENT_UNAVAILABLE` khi phụ lục cho bản ghi `quotation_only`;
  - lập đề nghị chi không kèm hóa đơn cho bản ghi `quotation_only` thì thành công, và duyệt cũng thành công;
  - lập đề nghị không kèm hóa đơn cho đợt không tạm ứng của bản ghi `contract` vẫn lỗi `INVOICE_REQUIRED`;
  - insert thẳng vi phạm CHECK (`documentation='contract'` mà `contract_no` null) thì lỗi `23514`;
  - `c1_material_read_contract`, `c1_material_order_json` và `c1_material_finance_facts` trả `documentation = 'quotation_only'` và `contractNo` là null;
  - `contractStatus` của phiếu có `documentation`;
  - intent tải lên `signed_quotation` dạng `image/jpeg` được chấp nhận.
- [ ] **Step 2: Chạy và xác nhận thất bại.** pgTAP của dự án chạy trên Cloud DEV, nên ở bước này chỉ kiểm cú pháp bằng guard spec (Step 3). pgTAP chạy thật ở T6. Ghi rõ điều này trong báo cáo task.
- [ ] **Step 3: Viết guard spec thất bại** `c1-material-small-order-guard.spec.ts`, theo kiểu `c1-material-finance-hardening-guard.spec.ts`. Test `small order contracts migration is forward-only and pinned`:
  - file tồn tại, có `pg_advisory_xact_lock(71842, 57)` và kết thúc bằng `notify pgrst, 'reload schema';`;
  - chứa `5000000` và giá trị này bằng `MATERIAL_SMALL_ORDER_THRESHOLD` (import từ `shared/constants/material-finance.ts`; nếu T3 chưa merge thì so với literal `'5000000'` và để TODO cho T6 nối lại);
  - không có `drop table`, `truncate`, `delete from`;
  - có `create or replace function private.c1_material_record_contract`.
  Chạy `pnpm exec vitest run tests/unit/config/c1-material-small-order-guard.spec.ts`. Kỳ vọng: FAIL vì chưa có file.
- [ ] **Step 4: Viết migration**, lần lượt từng phần:
  - **DDL:**
    - `material_contracts`: thêm `documentation`, `contract_no drop not null`, CHECK `(documentation = 'contract') = (contract_no is not null)`.
    - `material_contract_versions`: `contract_file_id drop not null`, CHECK `contract_file_id is not null or (kind = 'original' and vat_amount = 0 and total < 5000000)`.
  - **Ba helper** ở mục Interfaces.
  - **`c1_material_record_contract`:** gốc ở `20261015090500:50-168`.
    - Đọc `documentation` (mặc định `'contract'`) và gọi `c1_workflow_require_keys` theo từng nhánh.
    - Nhánh `quotation_only`:
      - tính `order_subtotal` như `c1_material_contract_money`;
      - `CONTRACT_REQUIRED` nếu `not is_small_amount(order_subtotal, currency) or not is_small_amount(subtotal, currency)`;
      - đặt `vat = 0` và `total = subtotal`;
      - kiểm báo giá bằng `c1_material_require_contract_file(..., 'material_order', 'signed_quotation', order_id, null)`;
      - sinh đợt cố định;
      - không gọi kiểm file hợp đồng.
    - Nhánh `contract`: thêm kiểm `verified_mime_type = 'application/pdf'` cho báo giá, sai thì `EVIDENCE_INVALID`.
    - Truyền `documentation` vào payload thông báo.
  - **`c1_material_amend_contract`** (gốc `20261015090500:172-293`): sau khi khóa hợp đồng, nếu `documentation = 'quotation_only'` thì `CONTRACT_AMENDMENT_UNAVAILABLE`.
  - **Chứng từ:**
    - `c1_material_evidence_mime_allowed` (gốc `20261015090400:29-43`): `signed_quotation` nhận thêm `image/jpeg` và `image/png`.
    - `c1_material_create_evidence_intent` (gốc `20261015090400:145-348`): ở dòng 198 bỏ `signed_quotation` khỏi nhánh PDF-only.
  - **Yêu cầu hóa đơn:**
    - Đổi `c1_material_link_request_invoices` để nhận `target_requires_invoice boolean` thay cho `is_advance`: drop hàm cũ, tạo lại, revoke/grant như `20261015090200:1098`.
    - Viết lại hai lệnh gọi nó (gốc `20261015090200`, quanh :524 và :611) để truyền `private.c1_material_installment_requires_invoice(contract, installment)`.
    - `c1_material_decide_payment_request` (gốc `20261015090600:342-420`): thay điều kiện `is_advance` ở :366-378 bằng helper.
  - **View đọc:** thêm `documentation` vào:
    - `c1_material_read_contract` (gốc `20261015090100:421-500`; kiểm lại có bản mới hơn trong 0905/0906 không);
    - `c1_material_order_json` (`20261015090100:504-596`);
    - `c1_material_finance_facts` (`20261015090300`);
    - payload `c1_material_notify_contract_saved` (`20261015090600:72-116`);
    - `c1_material_emit_installment_reminders` (`20261015090600:167-235`);
    - `c1_material_payment_payload` (`20261015090200:238-249`).
  - **`contractStatus` của phiếu:** anchor patch mới. Anchor là khối `'contractStatus', coalesce((` … `), '[]'::jsonb),` mà `20261015090600` đã chèn; thay bằng khối có thêm `'documentation', contract.documentation`.
- [ ] **Step 5: Chạy guard.** `pnpm exec vitest run tests/unit/config/c1-material-small-order-guard.spec.ts tests/unit/config/c1-material-*-guard.spec.ts`. Kỳ vọng: PASS. Nếu guard cũ nào đọc "hàm X chỉ được định nghĩa ở file Y" thì cập nhật guard đó, và ghi lý do trong commit.
- [ ] **Step 6: Đăng ký pgTAP.** Thêm `c1_material_small_order_contracts` vào danh sách vật tư của `scripts/run-c1-cloud-dev-tests.mjs` và vào kỳ vọng của `tests/unit/material-cloud-runner.spec.ts`. Chạy `pnpm exec vitest run tests/unit/material-cloud-runner.spec.ts`. Kỳ vọng: PASS.
- [ ] **Step 7: Commit.** `feat(materials): record small orders without a contract`.

### Task 2: DB — chi tiền mặt

**Files:**
- Create: `supabase/migrations/20261016090100_c1_material_small_order_payments.sql`
- Create: `supabase/tests/database/c1/c1_material_small_order_payments.test.sql`
- Modify: `tests/unit/config/c1-material-small-order-guard.spec.ts`, `scripts/run-c1-cloud-dev-tests.mjs`, `tests/unit/material-cloud-runner.spec.ts`

**Interfaces:**
- Consumes: `private.c1_material_is_small_amount`, `private.c1_material_installment_requires_invoice` (T1).
- Produces: cột `material_payments.method`, `bank_reference` nullable, `target_input` mới của `record_payment`, và `method` trong JSON lần chi.

- [ ] **Step 1: Viết pgTAP thất bại** `c1_material_small_order_payments.test.sql`:
  - dòng cũ có `method = 'bank_transfer'`;
  - ghi chi `cash` với `bankReference` null thì thành công, trong cả hai ca:
    - bản ghi `quotation_only` 4.000.000 (không có hóa đơn);
    - bản ghi `contract` tổng 4.500.000 có VAT (có hóa đơn);
    - kiểm `method = 'cash'`, `bank_reference is null`;
  - `CASH_PAYMENT_NOT_ALLOWED` trong các ca:
    - hợp đồng 48.000.000;
    - hợp đồng 4.000.000 sau khi phụ lục lên 6.000.000;
  - `INPUT_INVALID` khi `cash` kèm `bankReference = 'UNC-1'`;
  - `bank_transfer` thiếu `bankReference` thì lỗi như hiện nay;
  - thiếu khóa `method` thì coi như chuyển khoản;
  - ghi chi cho `quotation_only` không cần hóa đơn;
  - `contract` không tạm ứng vẫn `INVOICE_REQUIRED`;
  - `PROOF_ALREADY_USED` vẫn chặn khi dùng lại chứng từ cho chi tiền mặt;
  - insert thẳng `method = 'cash'` kèm `bank_reference` thì lỗi `23514`;
  - view đề nghị chi trả `method` và `bankReference` null.
- [ ] **Step 2: Bổ sung guard** (test `small order payments migration is pinned`): lock `(71842, 58)`, có `create or replace function private.c1_material_record_payment`. Chạy guard; kỳ vọng FAIL.
- [ ] **Step 3: Viết migration:**
  - DDL `method`, `bank_reference drop not null`, CHECK `(method = 'bank_transfer') = (bank_reference is not null)`.
  - **`c1_material_record_payment`** (gốc `20261015090600:426-555`):
    - đọc `method`, mặc định `'bank_transfer'`;
    - `cash`: `bankReference` phải là null hoặc vắng, khác đi thì `INPUT_INVALID`; `CASH_PAYMENT_NOT_ALLOWED` nếu `not is_small_amount(current_version.total, contract.currency_code)`;
    - `bank_transfer`: giữ kiểm cũ;
    - thay điều kiện hóa đơn ở :501-511 bằng `c1_material_installment_requires_invoice`;
    - ghi `method`.
  - **JSON lần chi** trong hàm đọc đề nghị chi (hàm sinh `materialPaymentRequestViewSchema.payment`; tìm bằng `grep -n "bankReference" supabase/migrations/2026101509*.sql`): thêm `method`.
- [ ] **Step 4: Chạy guard và runner spec**, sau khi đăng ký file pgTAP mới như T1 Step 6. Kỳ vọng: PASS.
- [ ] **Step 5: Commit.** `feat(materials): allow cash payments for small orders`.

### Task 3: TS dùng chung và server

**Files:**
- Create: `shared/constants/material-finance.ts`, `shared/utils/material-small-order.ts`, `app/utils/materials/contract-label.ts`
- Modify: `shared/schemas/costs/material-finance.ts:49-56,110-115,138-167,207-225`, `shared/schemas/costs/material-procurement.ts:166-176,228-240,303-310`, `shared/schemas/api-error.ts`, `shared/utils/material-finance-summary.ts:14-18,55-80`, `server/features/costs/rpc-errors.ts:17-45`, `server/features/costs/material-finance/finance-read-repository.ts:33`, `server/features/costs/material-finance/finance-read-service.ts`, `app/utils/materials/finance-ui.ts`, `app/utils/materials/contract-errors.ts`, `app/utils/notifications/app-notification-text.ts:40-92`
- Test: `tests/unit/shared/material-small-order.spec.ts` (mới), `tests/unit/shared/material-finance.spec.ts`, `tests/unit/shared/material-finance-summary.spec.ts`, `tests/unit/shared/material-procurement.spec.ts`, `tests/unit/utils/app-notification-text.spec.ts`, `tests/unit/utils/material-contract-errors.spec.ts`, `tests/unit/server/material-contracts.spec.ts`, `tests/unit/server/material-payments.spec.ts`

**Interfaces:**
- Produces:
  - `export const MATERIAL_SMALL_ORDER_THRESHOLD = '5000000'` và `export const MATERIAL_SMALL_ORDER_CURRENCY = 'VND'`.
  - `export function isMaterialSmallAmount(total: string, currencyCode: string): boolean`.
  - `export type MaterialContractDocumentation = 'contract' | 'quotation_only'` và `export type MaterialPaymentMethod = 'bank_transfer' | 'cash'`, cùng nằm trong `material-finance.ts`.
  - `recordMaterialContractInputSchema`: `z.discriminatedUnion('documentation', [...])` theo "Hợp đồng dữ liệu". Nhánh `quotation_only` là `.strict()` và không có `vatAmount`/`total`/`installments`/`contractNo`/`contractFileId`.
  - `recordMaterialPaymentInputSchema`: thêm `method`, `bankReference: string | null`. Với `cash`, chuỗi trim rỗng thành `null`, còn giá trị khác thì lỗi. Với `bank_transfer` thì bắt buộc 1–100 ký tự.
  - Các view: `documentation` và `method` có default như mục "Hợp đồng dữ liệu"; `contractNo: string | null`; `contractFileId: uuid | null`; `bankReference: string | null`.
  - `MaterialContractFacts` thêm `documentation: MaterialContractDocumentation`.
  - `export function materialContractLabel(contract: { documentation: MaterialContractDocumentation, contractNo: string | null }): string` trả `'Hợp đồng ' + contractNo` hoặc `'Không hợp đồng'`.
- T4 và T5 dùng `isMaterialSmallAmount`, `materialContractLabel`, các type và thông điệp lỗi.

- [ ] **Step 1: Viết test thất bại:**
  - `material-small-order.spec.ts`:
    - `isMaterialSmallAmount('4999999.9999','VND')` là `true`;
    - `('5000000','VND')` là `false`;
    - `('5000000.0000','VND')` là `false`;
    - `('1000','USD')` là `false`.
  - `material-finance.spec.ts`:
    - union chấp nhận cả hai nhánh;
    - `quotation_only` kèm `contractNo` bị từ chối;
    - `cash` với `bankReference: '  '` parse ra `null`;
    - `cash` với `'UNC-1'` bị từ chối;
    - `bank_transfer` với `null` bị từ chối;
    - view thiếu `documentation`/`method` parse ra `'contract'`/`'bank_transfer'`;
    - view có `contractNo: null` parse được.
  - `material-procurement.spec.ts`: `materialEvidenceMimeTypes.signed_quotation` bằng `['application/pdf','image/jpeg','image/png']`; `contractStatus` có `contractNo: null, documentation: 'quotation_only'` parse được.
  - `material-finance-summary.spec.ts`: một hợp đồng `contract` paid 10 / invoiced 0 và một `quotation_only` paid 4 / invoiced 4. Kỳ vọng `paidWithoutInvoice === '10.0000'`, `invoiced === '4.0000'`, `paid === '14.0000'`.
  - `app-notification-text.spec.ts`: payload `documentation: 'quotation_only'`, `contractNo: null` thì hiện "Đơn không hợp đồng".
  - `material-contract-errors.spec.ts`: ba mã mới có thông điệp tiếng Việt khác rỗng.
  - Server spec: repository chuyển nguyên `documentation`/`method` vào RPC; `CONTRACT_REQUIRED` và `CASH_PAYMENT_NOT_ALLOWED` map sang 409.
- [ ] **Step 2: Chạy và xác nhận thất bại.** `pnpm exec vitest run tests/unit/shared/material-small-order.spec.ts tests/unit/shared/material-finance.spec.ts tests/unit/shared/material-finance-summary.spec.ts tests/unit/shared/material-procurement.spec.ts tests/unit/utils/app-notification-text.spec.ts tests/unit/utils/material-contract-errors.spec.ts tests/unit/server/material-contracts.spec.ts tests/unit/server/material-payments.spec.ts`
- [ ] **Step 3: Cài đặt** theo Interfaces.
  - `isMaterialSmallAmount` dùng `MoneyDecimal`.
  - `summarizeMaterialFinance` cộng riêng `paidForInvoiceCheck` và `invoicedForInvoiceCheck`, chỉ trên các hợp đồng `contract`.
  - Thông điệp lỗi:
    - `CONTRACT_REQUIRED`: "Đơn từ 5.000.000 đ trở lên bắt buộc có hợp đồng."
    - `CASH_PAYMENT_NOT_ALLOWED`: "Chỉ chi tiền mặt cho đơn có cam kết dưới 5.000.000 đ."
    - `CONTRACT_AMENDMENT_UNAVAILABLE`: "Đơn không hợp đồng không thể thêm phụ lục."
- [ ] **Step 4: Chạy lại lệnh ở Step 2** (kỳ vọng: PASS), rồi chạy `pnpm typecheck`. Typecheck sẽ chỉ ra mọi chỗ UI còn coi `contractNo` là `string`. Sửa tối thiểu bằng `materialContractLabel` hoặc `?? ''` chỉ khi cần cho typecheck; phần hiển thị đầy đủ để T4/T5 làm. Ghi danh sách file đã chạm trong báo cáo, để T4/T5 biết.
- [ ] **Step 5: Commit.** `feat(materials): shared schemas for small orders and cash payments`.

### Task 4: UI — ghi nhận không hợp đồng và nhãn hiển thị

**Files:**
- Modify: `app/components/materials/finance/MaterialContractRecordPanel.vue:25,37,199-259`, `MaterialContractSummary.vue:5`, `MaterialInvoicePanel.vue:11`, `MaterialInvoiceForm.vue:5`, `app/pages/materials/[projectId]/orders/[orderId].vue:85-127`, `app/pages/materials/[projectId]/finance.vue:59`, `app/pages/materials/finance/suppliers.vue:98`, `app/pages/materials/[projectId]/proposals/[proposalId].vue:138`
- Test: unit cho logic tách ra nếu có (ví dụ `app/utils/materials/contract-record-mode.ts` với `canRecordWithoutContract(orderSubtotal: string, currencyCode: string): boolean`); kiểm trực quan qua verifier.

**Interfaces:**
- Consumes: `isMaterialSmallAmount`, `materialContractLabel`, `recordMaterialContractInputSchema` (T3).

- [ ] **Step 1: Viết test thất bại** cho `canRecordWithoutContract`: `('4999999','VND')` là `true`, `('5000000','VND')` là `false`. Chạy vitest; kỳ vọng FAIL.
- [ ] **Step 2: Cài đặt `MaterialContractRecordPanel.vue`:**
  - `canRecordWithoutContract` là `true` thì hiện lựa chọn "Có hợp đồng" / "Không có hợp đồng", mặc định có hợp đồng.
  - Khi không hợp đồng:
    - ẩn số hợp đồng, slot file hợp đồng, VAT và `MaterialInstallmentEditor`;
    - nhãn ngày là "Ngày ghi nhận";
    - slot báo giá `accept=".pdf,.jpg,.jpeg,.png"` kèm gợi ý "Báo giá có ít nhất chữ ký bên bán";
    - hiện dòng tóm tắt "VAT 0 · Thanh toán 100% · Tổng {formatVnNumber(subtotal)}";
    - payload gửi nhánh `quotation_only`.
  - Khi có hợp đồng: giữ nguyên, thêm `documentation: 'contract'` vào payload. Slot báo giá vẫn `.pdf`.
- [ ] **Step 3: Thay mọi chỗ in `contractNo`** trong các file ở Files bằng `materialContractLabel(...)`. Ẩn nút phụ lục khi `documentation === 'quotation_only'`.
- [ ] **Step 4: Chạy kiểm tra.** Vitest file test của task, `pnpm typecheck`, eslint các file đã đổi. Kỳ vọng: PASS. Verifier mở dev server và chụp form ở hai đơn 4 triệu và 48 triệu.
- [ ] **Step 5: Commit.** `feat(materials): record small orders without a contract in the UI`.

### Task 5: UI — đề nghị chi không hóa đơn và chi tiền mặt

**Files:**
- Modify: `app/components/materials/finance/MaterialPaymentRequestForm.vue:5,59-61,125-153,328,364`, `MaterialPaymentRecordDialog.vue:53-69,95,259,301,313-314,333`, `MaterialPaymentRequestPanel.vue` (lịch sử lần chi)
- Test: `tests/unit/utils/material-payment-request-actions.spec.ts` hoặc file util mới `app/utils/materials/payment-method.ts`

**Interfaces:**
- Consumes: `isMaterialSmallAmount`, `materialContractLabel`, `MaterialPaymentMethod`, `recordMaterialPaymentInputSchema` (T3).
- Produces: `export function canPayInCash(contractTotal: string, currencyCode: string): boolean` và `export function requestRequiresInvoice(documentation: MaterialContractDocumentation, isAdvance: boolean): boolean`.

- [ ] **Step 1: Viết test thất bại:**
  - `canPayInCash('4999999','VND')` là `true`; `('6000000','VND')` là `false`.
  - `requestRequiresInvoice('quotation_only', false)` là `false`; `('contract', false)` là `true`; `('contract', true)` là `false`.
- [ ] **Step 2: Cài đặt `MaterialPaymentRequestForm.vue`:** điều kiện bắt buộc hóa đơn (dòng 328) dùng `requestRequiresInvoice`; mô tả dùng `materialContractLabel`.
- [ ] **Step 3: Cài đặt `MaterialPaymentRecordDialog.vue`:**
  - `canPayInCash(total hiện hành, currency)` là `true` thì hiện "Chuyển khoản" / "Tiền mặt", mặc định chuyển khoản.
  - Chọn "Tiền mặt":
    - ẩn số tham chiếu;
    - nhãn chứng từ là "Hóa đơn bán hàng hoặc phiếu chi hộ";
    - `canSubmit` không cần tham chiếu;
    - payload `method: 'cash', bankReference: null`.
  - Map lỗi `CASH_PAYMENT_NOT_ALLOWED` ra thông điệp của T3.
- [ ] **Step 4: Lịch sử lần chi** trong `MaterialPaymentRequestPanel.vue`: hiện hình thức chi; chi tiền mặt thì không có dòng tham chiếu.
- [ ] **Step 5: Chạy kiểm tra.** Vitest, typecheck, eslint các file đổi. Verifier chụp dialog ở cam kết 4 triệu và 48 triệu.
- [ ] **Step 6: Commit.** `feat(materials): cash payments and invoice-free requests in the UI`.

### Task 6: Tích hợp, tài liệu, e2e, Cloud DEV

**Files:**
- Create: `tests/e2e/material-small-orders.spec.ts`
- Modify: `docs/server/material-finance.md`, `shared/types/database.types.ts` (sinh lại), `tests/unit/config/c1-material-small-order-guard.spec.ts` (nối hằng TS nếu T1 để TODO)

- [ ] **Step 1: Merge T1–T5** vào `feat/materials-a4a5-small-orders`. Chạy `pnpm typecheck`, `pnpm lint` (so với baseline 28), các unit file của T1–T5 và `pnpm build`. Kỳ vọng: không có lỗi mới.
- [ ] **Step 2: Cập nhật `docs/server/material-finance.md`:** quy tắc R1–R12, ba mã lỗi mới, `documentation`/`method` trong JSON, và lưu ý về thứ tự triển khai (Review Focus 5).
- [ ] **Step 3: Viết e2e** `material-small-orders.spec.ts`, theo fixture và mock route của `material-finance-flow.spec.ts`:
  - đơn 4 triệu: chọn "Không có hợp đồng", tải báo giá PNG, ghi;
  - đề nghị chi không chọn hóa đơn; thủ quỹ duyệt; chi "Tiền mặt" kèm file ảnh;
  - số liệu "Đã chi" bằng 4.000.000;
  - đơn 48 triệu không hiện "Không có hợp đồng" và "Tiền mặt".
  Chạy e2e trên bản build production qua runner InstaCloud (`e2eprod:tests/e2e/material-small-orders.spec.ts`). Kỳ vọng: PASS.
- [ ] **Step 4: `reviewer` review toàn nhánh**, có kiểm bảo mật: authz của RPC, kiểm input, việc lách ngưỡng. Sửa các phát hiện.
- [ ] **Step 5: Cloud DEV (mỗi thao tác hỏi user trước):**
  - push 2 migration;
  - `pnpm db:dev:types`;
  - chạy pgTAP 12 file vật tư, gồm 10 cũ và 2 mới; kỳ vọng tất cả qua;
  - pull code trên checkout mà user dùng để preview.
- [ ] **Step 6: Commit và mở PR** vào `dev`, kèm tóm tắt và test plan.
