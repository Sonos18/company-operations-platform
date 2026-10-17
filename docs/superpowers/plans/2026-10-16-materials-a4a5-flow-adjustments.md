# Vật tư A4/A5 — Điều chỉnh luồng trước phần B — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho luồng A4/A5 khớp với cách công ty đang làm, gồm 5 thay đổi:
- tên vật tư trên hóa đơn chỉ do kế toán nhập;
- đơn không hợp đồng có VAT tùy chọn và đi chung luồng với đơn có hợp đồng;
- hóa đơn có hai giai đoạn, nháp rồi chính thức;
- thủ quỹ xác nhận UNC, kế toán ghi lần chi;
- đổi nhãn trạng thái.

**Architecture:**
- Hai migration forward-only, độc lập với nhau:
  - một migration gỡ các tính năng tên hóa đơn ở phiếu;
  - một migration điều chỉnh tài chính.
- Hai task TS/server độc lập (procurement, finance), sau đó hai task UI.
- Trạng thái đề nghị chi giữ nguyên; nhãn "chờ hóa đơn chính thức" được UI suy ra từ `stage` của hóa đơn đã liên kết.

**Tech Stack:** Nuxt 3, Vue 3, TypeScript, Zod, decimal.js, Supabase Postgres (plpgsql, pgTAP), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-16-materials-a4a5-flow-adjustments-design.md` (mã C1–C5). Spec trước đó: `2026-10-16-materials-a4a5-small-orders-design.md` và `2026-10-15-materials-a4-a5-contract-payment-design.md`.

## Global Constraints

- **Nhánh:**
  - Nền là `feat/materials-a4a5-flow-adjust` (tách từ PR #44 tại `6057104`), worktree `.worktrees/materials-a4a5-flow-adjust`, đã có commit spec `27aa4e2`.
  - Task chạy song song mỗi task một worktree, tách từ nhánh tích hợp; xong thì merge về.
- **Migration:**
  - Forward-only, tên chính xác như bảng dưới.
  - Mở đầu bằng `set local lock_timeout = '5s'; set local statement_timeout = '90s'; select pg_catalog.pg_advisory_xact_lock(71842, N);`, kết thúc bằng `notify pgrst, 'reload schema';`.
  - Không sửa migration cũ.
  - Hàm đổi thì `create or replace` lấy gốc từ định nghĩa **mới nhất** (grep mọi `supabase/migrations/2026*.sql`, file mới nhất thắng; với hàm tạo bằng patch anchor thì đọc bằng cách ghép các patch).
  - Hàm `private.*`: `revoke all ... from public,anon,authenticated,service_role`. Grant lại như cũ khi drop rồi tạo lại.
- **Lỗi nghiệp vụ:** `raise exception using errcode = 'P0001', message = '<CODE>'`. Không có mã lỗi mới.
- **Ngưỡng:** `5000000`, VND, so sánh `<`, tính riêng từng đơn. Đơn không hợp đồng: tổng đơn gốc **và** tổng sau VAT đều phải `< 5000000`.
- **Giá trị cố định:**
  - `material_invoices.stage` thuộc `('draft','official')`, mặc định `'official'`.
  - MIME của hóa đơn: `application/pdf`, `application/xml`, `text/xml`, `image/jpeg`, `image/png`.
  - Event thông báo mới: `material.payment.approved`.
- **Nhãn tiếng Việt cố định:**
  - "Chờ lập UNC", "Đã lập UNC – chờ giám đốc duyệt", "Đã chi", "Đã chi – chờ hóa đơn chính thức", "Bị trả lại", "Đã hủy";
  - nút "Xác nhận đã lập UNC", "Xác nhận đã lập UNC / đã chi tiền mặt", "Cập nhật biên lai chuyển khoản", "Cập nhật hóa đơn chính thức";
  - lựa chọn hóa đơn "Bản nháp / bản đã ký (chờ bản chính thức)" và "Hóa đơn chính thức";
  - badge "Nháp", "Chính thức";
  - số liệu "Hóa đơn chờ bản chính thức";
  - cảnh báo "Tổng sau VAT từ 5.000.000 đ trở lên phải có hợp đồng."
- **Cloud và môi trường:**
  - Không đụng production hay `dev-preview`.
  - Cloud DEV (push migration, `db:dev:types`, pgTAP, chạy lại script role) chỉ chạy khi user cho phép từng thao tác.
  - Không `supabase migration repair`.
- **Kiểm thử:** baseline lint là 28 lỗi; unit có lỗi sẵn ở các file không liên quan. Chỉ báo kết quả theo file test của task.
- **Quy trình:** UI giao cho `ui-agy` (verifier chạy test, controller commit); phần còn lại giao cho `implementer`.

| Task | Migration | N |
|---|---|---|
| T1 | `supabase/migrations/20261016100000_c1_material_remove_proposal_invoice_names.sql` | 59 |
| T2 | `supabase/migrations/20261016100100_c1_material_finance_flow_adjustments.sql` | 60 |

**Phụ thuộc:**
- T1, T2, T3, T4 chạy song song (không chung file, trừ danh sách runner pgTAP; xung đột nhỏ thì gộp khi merge).
- T5 chạy sau T3; T6 chạy sau T4. T5 và T6 song song với nhau.
- T7 chạy khi PR #43 đã merge vào `dev`.
- T8 chạy cuối.

## Hợp đồng dữ liệu (chốt cho mọi task)

**Bản ghi không hợp đồng** (`c1_material_record_contract`, `documentation:'quotation_only'`):
- Khóa bắt buộc: `documentation, expectedOrderVersion, signedOn, subtotal, varianceReason, signedQuotationFileId`.
- Khóa tùy chọn: `vatAmount` (mặc định `'0'`), `total` (mặc định `subtotal + vatAmount`).
- Bị từ chối: `contractNo, contractFileId, installments`.

**Hóa đơn** (`c1_material_record_invoice`):
- Thêm khóa tùy chọn `stage` (`'draft'` | `'official'`, mặc định `'official'`).
- JSON của `c1_material_list_invoices` thêm `stage`, `officialFileId` (nullable), `officializedAt` (nullable).

**Lệnh mới:**
- RPC `public.c1_material_officialize_invoice(target_company_id uuid, target_project_id uuid, target_id uuid, target_input jsonb, target_idempotency_key uuid, target_request_id uuid) returns jsonb`, với `target_input = { expectedVersion, officialFileId }`.
- Kết quả trả về theo dạng ack hiện có `{resourceId, version, replayed}`.
- API: `POST /api/companies/:companyId/projects/:projectId/material-procurement/invoices/:invoiceId/official` kèm header `Idempotency-Key`.

**Thông báo:**
- `material.payment.approved`: payload `{ projectId, contractId, supplierName, contractNo, documentation }`, không kèm tiền; gửi cho `submitted_by` của đề nghị.
- `material.payment.paid`: gửi cho người đã duyệt gần nhất (`decided_by` của quyết định `approve` mới nhất), payload như cũ.

**Số liệu:** `MaterialFinanceTotals` thêm `draftInvoiced: string` (Σ `total` hóa đơn `recorded` có `stage = 'draft'`). Facts từng hợp đồng thêm `draftInvoiced`.

**View dòng phiếu:** bỏ các trường `engineerProposedInvoiceName`, `buyerProposedInvoiceName`, `effectiveInvoiceDisplayName`, `invoiceDisplayNameSource`, `buyerOverrideVersion`, `buyerInvoiceNameEditable`. Input dòng phiếu bỏ `proposedInvoiceName`. Giữ `currentRevisionId`.

## Review Focus

1. **Hóa đơn nháp đang gắn với đề nghị đã chi rồi mới lên chính thức:** liên kết `material_payment_request_invoices` và số "Đã nhận hóa đơn" không đổi; "Hóa đơn chờ bản chính thức" giảm đúng bằng `total` của hóa đơn đó. Test ở T2 (pgTAP) và T4 (summary).
2. **Cùng một file vừa làm `file_id` của hóa đơn A vừa làm `officialFileId` của hóa đơn B:** phải báo `EVIDENCE_INVALID`. Test ở T2.
3. **Kế toán tự lập đề nghị rồi tự ghi chi:** được phép. Thủ quỹ tự duyệt đề nghị do chính mình lập vẫn bị `SELF_DECISION_FORBIDDEN`. Thông báo `paid` phải tới đúng thủ quỹ, `approved` tới đúng kế toán; không ai nhận thông báo cho thao tác của chính mình. Test ở T2.
4. **Phiếu cũ trên Cloud DEV có dữ liệu tên kỹ sư/mua hàng:** migration xóa sạch mà không lỗi FK hay RLS; đọc, sửa, gửi phiếu cũ vẫn chạy. Test ở T1 (tạo dữ liệu tên trước khi chạy phần DDL trong test thì không làm được, vì migration đã áp; chỉ kiểm cột/bảng đã biến mất và phiếu hiện có vẫn đọc được).
5. **Đơn không hợp đồng có tổng trước VAT 4,8 triệu và VAT 0,5 triệu (tổng 5,3 triệu):** form báo ngay; server báo `CONTRACT_REQUIRED`. Test ở T2 và T6.

---

## Cấu trúc file

| File | Trách nhiệm | Task |
|---|---|---|
| `supabase/migrations/20261016100000_c1_material_remove_proposal_invoice_names.sql` | gỡ cột, bảng, hàm và khóa JSON tên hóa đơn ở phiếu | T1 |
| `supabase/tests/database/c1/c1_material_invoice_name_removal.test.sql` (mới, prefix `c133`) | pgTAP cho C1 | T1 |
| `supabase/migrations/20261016100100_c1_material_finance_flow_adjustments.sql` | C2, C3, C4 (DB) | T2 |
| `supabase/tests/database/c1/c1_material_flow_adjustments.test.sql` (mới, prefix `c134`) | pgTAP cho C2–C4 | T2 |
| `scripts/run-c1-cloud-dev-tests.mjs`, `tests/unit/material-cloud-runner.spec.ts` | gỡ `c1_material_engineer_invoice_name`, thêm 2 file mới | T1, T2 |
| `tests/unit/config/c1-material-flow-adjustment-guard.spec.ts` (mới) | guard lock N 59/60, forward-only | T1, T2 |
| `shared/schemas/costs/material-procurement.ts`, `server/features/costs/material-procurement/*`, `app/repositories/http/http-material-procurement-repository.ts`, `app/repositories/material-procurement.contracts.ts`, route `invoice-name.patch.ts` (xóa) | gỡ tên hóa đơn ở phiếu (TS/server) | T3 |
| `shared/schemas/costs/material-finance.ts`, `shared/utils/material-finance-summary.ts`, `server/features/costs/material-finance/*`, route `invoices/[invoiceId]/official.post.ts` (mới), `app/repositories/http/http-material-finance-repository.ts`, `app/utils/materials/payment-request-actions.ts`, `app/utils/materials/payment-method.ts`, `app/utils/materials/payment-request-labels.ts` (mới), `app/utils/notifications/app-notification-text.ts` | C2–C5 (TS/server) | T4 |
| `MaterialProposalForm.vue`, `proposals/[proposalId].vue`, `MaterialQuotationComparisonPanel.vue`, `MaterialOrderCreatePanel.vue` | gỡ tên hóa đơn ở phiếu (UI) | T5 |
| `MaterialContractRecordPanel.vue`, `MaterialInvoiceForm.vue`, `MaterialInvoicePanel.vue`, `MaterialPaymentRequestPanel.vue`, `MaterialPaymentRecordDialog.vue`, `MaterialPaymentRequestForm.vue`, `app/pages/materials/finance/index.vue`, các trang số liệu | C2–C5 (UI) | T6 |
| `supabase/fixtures/material-a4a5-finance-actors.sql`, `tests/unit/material-a4a5-finance-actors.spec.ts` | đổi quyền kế toán/thủ quỹ | T7 |
| `docs/server/material-finance.md`, `tests/e2e/material-flow-adjustments.spec.ts` (mới), e2e cũ | tích hợp | T8 |

---

### Task 1: DB — gỡ tên hóa đơn ở phiếu (C1)

**Files:** Create migration (N=59), pgTAP `c1_material_invoice_name_removal.test.sql`, guard `c1-material-flow-adjustment-guard.spec.ts`. Delete `supabase/tests/database/c1/c1_material_engineer_invoice_name.test.sql`, `tests/unit/config/c1-material-engineer-invoice-name-guard.spec.ts`. Modify runner script/spec; sửa các pgTAP vật tư khác còn tham chiếu `proposedInvoiceName` hoặc các khóa tên (grep `supabase/tests/database/c1/`).

**Interfaces:**
- Produces: JSON phiếu không còn 6 khóa tên; `c1_material_create_proposal` / `update_proposal` từ chối dòng có `proposedInvoiceName` bằng `INPUT_INVALID` (qua `require_keys`).
- Bảng và RPC `c1_material_set_proposal_invoice_name` không còn.

- [ ] **Step 1: Viết guard thất bại.** Test `invoice name removal migration is pinned`:
  - file tồn tại, có `pg_advisory_xact_lock(71842, 59)`, kết thúc bằng `notify pgrst`;
  - chứa `drop table public.material_proposal_invoice_name_overrides`;
  - chứa `drop function public.c1_material_set_proposal_invoice_name`;
  - không có `truncate`.
  Chạy `pnpm exec vitest run tests/unit/config/c1-material-flow-adjustment-guard.spec.ts`. Kỳ vọng: FAIL.
- [ ] **Step 2: Viết pgTAP** `c1_material_invoice_name_removal.test.sql`, theo fixture của `c1_material_procurement_a1.test.sql`:
  - `hasnt_column` cho hai cột `engineer_proposed_invoice_name`;
  - `hasnt_table('public','material_proposal_invoice_name_overrides')`;
  - `hasnt_function` cho `c1_material_set_proposal_invoice_name` và `c1_material_engineer_invoice_name`;
  - tạo phiếu với dòng có `proposedInvoiceName` thì `throws_ok … 'INPUT_INVALID'`;
  - tạo, sửa, gửi phiếu không có khóa này thì thành công;
  - JSON phiếu (`c1_material_proposal_json`) không có khóa nào trong 6 khóa tên (`not (line ? 'engineerProposedInvoiceName')` …), nhưng vẫn có `currentRevisionId` và `contractStatus`.
- [ ] **Step 3: Viết migration:**
  - Drop RPC (public, private), bảng override, helper tên kỹ sư, CHECK khoảng trắng và hai cột.
  - Viết lại `c1_material_proposal_json`, `c1_material_create_proposal`, `c1_material_update_proposal`, `c1_material_submit_proposal` từ định nghĩa hiện hành (gốc ghép từ 20261009092319, 20261009103933, 20261010032646, 20261015090600, 20261016090000), bỏ mọi phần tên hóa đơn.
  - `c1_material_proposal_json` dùng patch anchor; nếu viết lại bằng `create or replace` thì phải giữ nguyên `contractStatus` (có `documentation`) và `orderProgress`.
  - Revoke private như quy ước.
- [ ] **Step 4: Gỡ** file pgTAP và guard tên kỹ sư; cập nhật danh sách trong runner script và runner spec; thêm file pgTAP mới. Sửa các pgTAP vật tư khác đang tham chiếu các khóa tên đã bỏ.
- [ ] **Step 5: Chạy** `pnpm exec vitest run tests/unit/config/c1-material-flow-adjustment-guard.spec.ts tests/unit/material-cloud-runner.spec.ts` và các guard `tests/unit/config/c1-material-*-guard.spec.ts`. Kỳ vọng: PASS (runner spec có 1 lỗi đường dẫn Windows có sẵn). pgTAP chạy ở T8.
- [ ] **Step 6: Commit.** `feat(materials): remove engineer and buyer invoice names from proposals`

### Task 2: DB — VAT đơn không hợp đồng, hóa đơn nháp, người ghi chi (C2–C4)

**Files:** Create migration (N=60), pgTAP `c1_material_flow_adjustments.test.sql`. Modify guard spec (thêm test cho N=60), runner script/spec. Sửa kỳ vọng trong các pgTAP cũ bị ảnh hưởng (`c1_material_payments`, `c1_material_finance_access`, `c1_material_small_order_contracts`, `c1_material_small_order_payments`): self-decision ở bước ghi chi, miễn hóa đơn của `quotation_only`, VAT của `quotation_only`, khóa `stage` trong JSON hóa đơn.

**Interfaces:** Produces đúng mục "Hợp đồng dữ liệu" (record_contract, record_invoice, list_invoices, officialize_invoice, thông báo, `draftInvoiced` trong finance facts).

- [ ] **Step 1: Viết pgTAP thất bại:**
  - **C2:**
    - `quotation_only` không gửi VAT thì `vat_amount = 0`;
    - gửi `vatAmount '300000'` với `subtotal '4000000'` thì `total = 4300000`, đợt 100% có `amount = 4300000`;
    - `subtotal '4800000'` + `vatAmount '500000'` thì `CONTRACT_REQUIRED`;
    - `total` lệch thì `CONTRACT_TOTAL_MISMATCH`;
    - CHECK mới cho phép `contract_file_id null` khi VAT > 0.
  - **Hóa đơn bắt buộc cho `quotation_only`:** lập đề nghị không kèm hóa đơn thì `INVOICE_REQUIRED`.
  - **C3:**
    - ghi hóa đơn `stage 'draft'` với file `image/jpeg` thì thành công;
    - lập đề nghị kèm hóa đơn nháp được;
    - duyệt, ghi chi, rồi `officialize_invoice` thì `stage = 'official'`, `official_file_id` được đặt, `file_id` giữ nguyên, `version` tăng;
    - officialize lần hai thì `VERSION_CONFLICT`;
    - officialize hóa đơn đã `official` thì `VERSION_CONFLICT`;
    - `officialFileId` là `file_id` của hóa đơn khác thì `EVIDENCE_INVALID`;
    - file role khác `invoice` thì `EVIDENCE_INVALID`;
    - dòng cũ `stage = 'official'`;
    - `list_invoices` có `stage` và `officialFileId`;
    - finance facts có `draftInvoiced` đúng trước và sau officialize.
  - **C4:**
    - kế toán (quyền request + execute) lập đề nghị rồi chính mình ghi chi thì thành công;
    - người lập tự duyệt thì `SELF_DECISION_FORBIDDEN`;
    - duyệt tạo `material.payment.approved` gửi cho người lập;
    - ghi chi tạo `material.payment.paid` gửi cho người duyệt, không gửi cho người ghi chi.
- [ ] **Step 2: Bổ sung guard** `finance flow adjustment migration is pinned`: lock `(71842, 60)`, có `create or replace function private.c1_material_record_payment`, có `'material.payment.approved'`. Chạy, kỳ vọng FAIL.
- [ ] **Step 3: Viết migration**, lấy gốc từ định nghĩa mới nhất của từng hàm:
  - **`record_contract`:** nhánh `quotation_only` nhận `vatAmount` và `total` tùy chọn; ngưỡng kiểm `order_subtotal` và `total`. CHECK `material_contract_versions_contract_file_check` = `contract_file_id is not null or (kind = 'original' and total < 5000000)`.
  - **`c1_material_installment_requires_invoice`:** trả `not is_advance`, nhưng giữ nguyên chữ ký hàm để các chỗ gọi không phải đổi.
  - **`material_invoices`:** thêm `stage`, `official_file_id` (unique, FK), `officialized_by`, `officialized_at`, kèm CHECK ba tổ hợp theo spec §5.
  - **Các hàm hóa đơn:**
    - `record_invoice` nhận `stage`;
    - `list_invoices` thêm khóa JSON;
    - `c1_material_evidence_mime_allowed` cho role `invoice` nhận thêm ảnh;
    - `c1_material_require_contract_file` kiểm thêm `official_file_id`.
  - **Lệnh mới `officialize_invoice`:** cả private và public wrapper; grant public cho `authenticated`; có receipt (`command_name 'material.officialize_invoice'`) và audit.
  - **`record_payment`:** bỏ `SELF_DECISION_FORBIDDEN`; gửi thông báo `paid` tới `decided_by` của quyết định `approve` mới nhất.
  - **`decide_payment_request`:** khi `approve` thì gửi `material.payment.approved` tới `submitted_by`.
  - **CHECK `event_kind`** của `app_notifications`: thêm `'material.payment.approved'` (drop rồi tạo lại constraint).
  - **`c1_material_finance_facts`:** thêm `draftInvoiced`.
- [ ] **Step 4: Sửa kỳ vọng** các pgTAP cũ bị ảnh hưởng; đăng ký file mới trong runner. Chạy guard và runner spec, kỳ vọng PASS.
- [ ] **Step 5: Commit.** `feat(materials): draft invoices, accountant payments and VAT for orders without a contract`

### Task 3: TS/server — gỡ tên hóa đơn ở phiếu (C1)

**Files:**
- Modify `shared/schemas/costs/material-procurement.ts` (:26, :95, :117-119, :137-145, :365, :388, :420).
- Modify `server/features/costs/material-procurement/routes.ts:15,81`, `service.ts:21,41,72,205-212`, `repository.ts:43,179-180`, `quotation-provider.ts:54-56` (gửi `materialName` thay cho ba trường tên).
- Modify `app/repositories/http/http-material-procurement-repository.ts:28,95`, `app/repositories/material-procurement.contracts.ts:4`.
- Delete `server/api/.../proposals/[proposalId]/lines/[lineId]/invoice-name.patch.ts`.
- Tests: `tests/unit/shared/material-procurement.spec.ts`, `tests/unit/repositories/http-material-procurement-repository.spec.ts`, `tests/unit/server/material-quotation-analysis.spec.ts`.

**Interfaces:** Produces view dòng phiếu và input không còn các trường tên (xem mục "Hợp đồng dữ liệu"); không còn `setBuyerInvoiceName` trong repository hay manifest.

- [ ] **Step 1: Sửa test cho thất bại:**
  - `materialProposalLineInputSchema.safeParse({ ...validLine, proposedInvoiceName: 'x' }).success === false`;
  - view dòng phiếu không có `effectiveInvoiceDisplayName` vẫn parse được, còn view có khóa đó thì bị từ chối (`.strict()`);
  - `materialProcurementEndpointManifest` không có `setBuyerInvoiceName`;
  - provider báo giá gửi `materialName` và không gửi `effectiveInvoiceDisplayName`.
- [ ] **Step 2: Cài đặt** theo Files. Chạy các test trên, `pnpm typecheck` (các lỗi chỉ còn ở file UI của T5 thì ghi danh sách vào báo cáo, không sửa UI ngoài tối thiểu để typecheck qua), eslint các file đổi.
- [ ] **Step 3: Commit.** `refactor(materials): drop proposal invoice-name contracts`

### Task 4: TS/server — tài chính (C2–C5)

**Files:**
- Modify `shared/schemas/costs/material-finance.ts`:
  - nhánh `recordQuotationOnlyInputSchema` thêm `vatAmount`, `total` tùy chọn và refine cân bằng;
  - `recordMaterialInvoiceInputSchema` thêm `stage` mặc định `'official'`;
  - `officializeMaterialInvoiceInputSchema = { expectedVersion, officialFileId }`;
  - `materialInvoiceViewSchema` thêm `stage` (mặc định `'official'`), `officialFileId`, `officializedAt`;
  - enum thông báo thêm `material.payment.approved`;
  - endpoint manifest thêm `officializeInvoice`;
  - totals thêm `draftInvoiced`.
- Modify `shared/utils/material-finance-summary.ts`: bỏ phần loại trừ `quotation_only`, thêm `draftInvoiced`.
- Modify server `material-finance/*` (repository, service, routes) và create `server/api/.../material-procurement/invoices/[invoiceId]/official.post.ts`.
- Modify `app/repositories/http/http-material-finance-repository.ts`.
- Modify `app/utils/materials/payment-request-actions.ts`: `record_payment` cần `material.payment.execute`, bỏ điều kiện khác người lập.
- Modify `app/utils/materials/payment-method.ts`: `requestRequiresInvoice` bỏ tham số `documentation`, chỉ còn `!isAdvance`; cập nhật nơi gọi.
- Create `app/utils/materials/payment-request-labels.ts`:
  - `paymentRequestStateLabel(state: MaterialPaymentRequestState, linkedInvoiceStages: readonly MaterialInvoiceStage[]): string`, theo bảng ở spec §7;
  - `approveActionLabel(allowCash: boolean): string`, trả "Xác nhận đã lập UNC" hoặc "Xác nhận đã lập UNC / đã chi tiền mặt".
- Modify `app/utils/notifications/app-notification-text.ts`: thêm `material.payment.approved`, đổi nhãn theo C5.
- Tests: `tests/unit/shared/material-finance.spec.ts`, `material-finance-summary.spec.ts`, `tests/unit/server/material-payments.spec.ts`, `material-contracts.spec.ts`, `material-finance-reads.spec.ts`, `tests/unit/repositories/http-material-finance-repository.spec.ts`, `tests/unit/utils/material-payment-request-actions.spec.ts`, `material-payment-method.spec.ts`, `app-notification-text.spec.ts`, `tests/unit/utils/material-payment-request-labels.spec.ts` (mới).

**Interfaces:**
- Produces `MaterialInvoiceStage = 'draft' | 'official'`, `paymentRequestStateLabel`, `approveActionLabel`, `officializeInvoice(context, projectId, invoiceId, input, key)` trên repository/service và HTTP repository.
- Ngoài ra là các schema ở mục Files.

- [ ] **Step 1: Viết test thất bại:**
  - `paymentRequestStateLabel('paid', ['draft']) === 'Đã chi – chờ hóa đơn chính thức'`;
  - `('paid', ['official']) === 'Đã chi'`;
  - `('submitted', []) === 'Chờ lập UNC'`;
  - `('approved', []) === 'Đã lập UNC – chờ giám đốc duyệt'`;
  - `approveActionLabel(true)` là chuỗi có "/ đã chi tiền mặt";
  - actions: người lập có `material.payment.execute` thì được `record_payment`;
  - `requestRequiresInvoice(false) === true`;
  - summary: hợp đồng `quotation_only` paid 4 / invoiced 0 thì `paidWithoutInvoice` gồm 4; `draftInvoiced` cộng đúng;
  - schema: `quotation_only` không có `vatAmount` vẫn parse được; có `vatAmount: '300000'` và `total` lệch thì bị từ chối; invoice view thiếu `stage` thì parse ra `'official'`;
  - server: `officializeInvoice` gọi RPC `c1_material_officialize_invoice` với đúng tham số;
  - notification: `material.payment.approved` có text tiếng Việt.
- [ ] **Step 2: Chạy và xác nhận thất bại.** Lệnh vitest liệt kê các file ở Files.
- [ ] **Step 3: Cài đặt.** Chạy lại (kỳ vọng PASS), `pnpm typecheck`, eslint. Lỗi typecheck ở UI do T6 sửa thì chỉ sửa tối thiểu và ghi danh sách vào báo cáo.
- [ ] **Step 4: Commit.** `feat(materials): finance contracts for draft invoices and accountant payments`

### Task 5: UI — gỡ tên hóa đơn ở phiếu (C1)

**Files:**
- `app/components/materials/MaterialProposalForm.vue` (:223-245, 412, 561, 649-650, 669-720, 977);
- `app/pages/materials/[projectId]/proposals/[proposalId].vue` (:57, 184-245, 224-227, 394-405, 700-895, 983);
- `app/components/materials/MaterialQuotationComparisonPanel.vue` (:31 dùng `materialName`; bỏ `sourceLabel` :306-314);
- `app/components/materials/MaterialOrderCreatePanel.vue:1279-1296` (bỏ các trường tên khỏi `getCanonicalLineProjection`);
- `tests/e2e/material-proposal.spec.ts` (:9, 105-133, 325-337, 422-441, 475-532).

**Interfaces:** Consumes schema dòng phiếu mới của T3.

- [ ] **Step 1:** ui-agy bỏ ô nhập tên của kỹ sư, phần sửa tên của mua hàng (kèm `recoverBuyerOverride`) và badge nguồn tên; panel so sánh hiện `materialName`; bỏ các trường tên trong `getCanonicalLineProjection`. Sửa e2e `material-proposal.spec.ts` bỏ các kịch bản tên.
- [ ] **Step 2:** Verifier chạy `pnpm typecheck` (0 lỗi), eslint các file đổi, e2e `material-proposal.spec.ts` trên bản build (lỗi #12 có sẵn từ trước thì ghi nhận, không tính) và grep `app/` không còn `effectiveInvoiceDisplayName|proposedInvoiceName|buyerOverride`.
- [ ] **Step 3: Commit.** `refactor(materials): remove invoice-name editing from proposals`

### Task 6: UI — tài chính (C2–C5)

**Files:**
- `MaterialContractRecordPanel.vue`:
  - hiện VAT và tổng ở chế độ không hợp đồng (:108-120);
  - tóm tắt "Thanh toán 100% · Tổng {tổng}" (:156-158);
  - payload gửi `vatAmount`/`total` (:369-396);
  - cảnh báo ngưỡng sau VAT.
- `MaterialInvoiceForm.vue`:
  - lựa chọn giai đoạn, gửi `stage`;
  - `accept` thêm `.jpg,.jpeg,.png`;
  - chip "Đề xuất" lấy `proposal.lines[].materialName` (:250-262, :484).
- `MaterialInvoicePanel.vue`: badge giai đoạn; nút "Cập nhật hóa đơn chính thức" (kế toán, `material.contract.record`) mở hộp chọn file và gọi `officializeInvoice`; xem được cả hai file.
- `MaterialPaymentRequestPanel.vue`:
  - nhãn trạng thái qua `paymentRequestStateLabel`, với stage lấy từ danh sách hóa đơn của hợp đồng theo `invoiceIds`;
  - nút duyệt dùng `approveActionLabel(allowCash)`;
  - nút ghi chi "Cập nhật biên lai chuyển khoản".
- `MaterialPaymentRecordDialog.vue`: tiêu đề và nhãn chứng từ chuyển khoản là "Biên lai chuyển khoản".
- `MaterialPaymentRequestForm.vue`: dùng `requestRequiresInvoice(isAdvance)`.
- `app/pages/materials/finance/index.vue`: nhãn tab theo C5.
- Trang số liệu `app/pages/materials/[projectId]/finance.vue`, `app/pages/materials/finance/suppliers.vue`: thêm ô "Hóa đơn chờ bản chính thức".
- Test unit cho logic tách ra nếu có, ví dụ `invoiceStagesForRequest(request, invoices)` trong `app/utils/materials/payment-request-labels.ts`; cần đồng bộ với T4, nên nếu thêm hàm thì ghi trong báo cáo.

**Interfaces:** Consumes `paymentRequestStateLabel`, `approveActionLabel`, `requestRequiresInvoice`, `officializeInvoice`, các schema mới (T4).

- [ ] **Step 1:** ui-agy làm theo Files với đúng nhãn ở Global Constraints. Không đụng file của T5.
- [ ] **Step 2:** Verifier chạy:
  - vitest các util liên quan, `pnpm typecheck`, eslint;
  - kiểm tĩnh: payload `quotation_only` có `vatAmount`/`total`; form hóa đơn gửi `stage`; nút officialize chỉ hiện với hóa đơn `draft` và cho người có `material.contract.record`; nút ghi chi hiện cho người lập nếu có `material.payment.execute`.
- [ ] **Step 3: Commit.** `feat(materials): draft invoices and accountant payment flow in the UI`

### Task 7: Script cấp role kế toán/thủ quỹ (C4)

**Điều kiện:** PR #43 đã merge vào `dev`. Merge `dev` vào nhánh tích hợp trước, nếu xung đột thì giải quyết.

**Files:** `supabase/fixtures/material-a4a5-finance-actors.sql`, `tests/unit/material-a4a5-finance-actors.spec.ts`.

- [ ] **Step 1: Sửa test thất bại:**
  - SQL chứa `'material.payment.execute'` gắn với role `…033`;
  - SQL chứa câu xóa quyền thừa chỉ cho `role_id in ('a1000000-0000-4000-8000-000000000033','a1000000-0000-4000-8000-000000000034')`;
  - số quyền mỗi role được kiểm (`<> 5` cho kế toán, `<> 3` cho thủ quỹ).
  - Bỏ assertion "không có delete" cũ, thay bằng "delete chỉ trên `public.role_permissions` với hai role id này".
- [ ] **Step 2: Cài đặt:**
  - Kế toán: `material.read`, `material.finance.read`, `material.contract.record`, `material.payment.request`, `material.payment.execute`.
  - Thủ quỹ: `material.read`, `material.finance.read`, `material.payment.approve`.
  - Dùng `delete from public.role_permissions where role_id in (…033, …034) and permission_code not in (<danh sách của role đó>)`, rồi `insert … on conflict do nothing`.
- [ ] **Step 3:** Chạy `pnpm exec vitest run tests/unit/material-a4a5-finance-actors.spec.ts tests/unit/material-a1-fixture.spec.ts`. Kỳ vọng: PASS.
- [ ] **Step 4: Commit.** `chore(materials): move payment recording permission to the accountant`

### Task 8: Tích hợp, tài liệu, e2e, Cloud DEV

- [ ] **Step 1:** Merge T1–T7. Chạy `pnpm typecheck`, `pnpm lint` (so với 28), unit của các file đã đổi, `pnpm build`.
- [ ] **Step 2: Cập nhật `docs/server/material-finance.md`** theo C1–C5: quyền, luồng, `stage`, lệnh officialize, thông báo, số liệu. Đánh dấu R6 và mục 7 của spec đơn nhỏ là đã bãi bỏ.
- [ ] **Step 3: Viết e2e** `tests/e2e/material-flow-adjustments.spec.ts`, mock route như `material-finance-flow.spec.ts`:
  - kế toán nhập hóa đơn nháp (PNG) rồi lập đề nghị;
  - thủ quỹ "Xác nhận đã lập UNC";
  - kế toán "Cập nhật biên lai chuyển khoản", nhãn "Đã chi – chờ hóa đơn chính thức";
  - kế toán "Cập nhật hóa đơn chính thức", nhãn "Đã chi";
  - đơn không hợp đồng có VAT 300.000: tổng hiện 4.300.000.
  Cập nhật các e2e cũ bị đổi nhãn hoặc đổi vai (`material-payments`, `material-finance-flow`, `material-small-orders`). Chạy local trên bản build (cổng 4317, `PLAYWRIGHT_REUSE_EXISTING_SERVER=true`).
- [ ] **Step 4:** `reviewer` review toàn nhánh, có kiểm bảo mật; một lượt sửa.
- [ ] **Step 5: Cloud DEV, hỏi user từng thao tác:**
  - dry-run (đúng 2 migration), push;
  - `db:dev:types`;
  - pgTAP vật tư: 12 − 1 + 2 = 13 file;
  - chạy lại `db:dev:a4a5:finance-actors`;
  - pull code trên checkout preview.
- [ ] **Step 6:** Push nhánh, mở PR vào `dev` (sau PR #44). Cập nhật spec B theo C3/C4 trong phiên B.
