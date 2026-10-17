# Vật tư — Số đơn đề xuất, mã ĐH và thông báo duyệt đơn — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đơn đề xuất có số chạy theo dự án ("Đơn 18"), đơn đặt hàng có mã "ĐH 18-1", có tóm tắt vật tư tự tạo. Mua hàng được báo khi kỹ sư gửi đơn, kỹ sư được báo khi đơn được duyệt hoặc trả. Mọi màn hình và thông báo tài chính mang mã ĐH.

**Architecture:**
- **Số đơn và mã đơn do trigger cấp.**
  - Hai cột mới `material_proposals.proposal_no` và `material_orders.order_seq`, được trigger `BEFORE INSERT` cấp dưới khóa dòng cha.
  - Nhờ vậy không phải sửa `create_proposal` hay `create_order`, vốn là các hàm đã bị vá nhiều lớp.
- **Các lệnh đọc dùng "đổi tên + bọc".** Áp cho `proposal_json`, `order_json`, `read_contract`, `finance_facts`, `finance_inbox_facts`:
  - hàm cũ được `alter function … rename to …_core`;
  - một hàm mới mang lại đúng tên và chữ ký cũ, trả về `core || khóa mới`.
  - Các hàm plpgsql và SQL gọi theo tên nên tự dùng bản bọc. Không phải chép lại thân hàm dài.
- **Thông báo đơn đề xuất phát bằng trigger** trên `material_proposal_revisions` (gửi) và `material_proposal_decisions` (duyệt hoặc trả).
- **Nhãn đơn trong mọi thông báo tài chính** do một trigger `BEFORE INSERT` trên `app_notifications` gắn vào payload, theo nguồn của thông báo.
- **Câu chữ hiển thị chỉ nằm trong TS.** SQL chỉ trả số và danh sách tên. Định dạng nằm ở một module dùng chung là `shared/utils/material-codes.ts`.

**Tech Stack:** Nuxt 3, Vue 3, TypeScript, Zod, Supabase Postgres (plpgsql, pgTAP), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-17-materials-proposal-codes-design.md` (mã N1–N6).

## Global Constraints

- **Nhánh:**
  - Nhánh tích hợp là `feat/materials-proposal-codes` (tách từ `feat/materials-a4a5-flow-adjust` tại `a4897ec`), worktree `.worktrees/materials-proposal-codes`.
  - Mỗi task song song chạy trong một worktree riêng, tách từ nhánh tích hợp, xong thì merge về.
- **Migration:**
  - Forward-only. Mở đầu bằng `set local lock_timeout = '5s'; set local statement_timeout = '90s'; select pg_catalog.pg_advisory_xact_lock(71842, N);`, kết thúc bằng `notify pgrst, 'reload schema';`.
  - Không sửa migration cũ.
  - Hàm `private.*`: `security definer set search_path = ''`, rồi `revoke all … from public, anon, authenticated, service_role`.
- **Giá trị cố định:**
  - Cột `proposal_no integer not null check (proposal_no > 0)`, `unique (project_id, proposal_no)`.
  - Cột `order_seq integer not null check (order_seq > 0)`, `unique (proposal_id, order_seq)`.
  - Nguồn thông báo mới: `material_proposal`.
  - Sự kiện mới: `material.proposal.submitted`, `material.proposal.approved`, `material.proposal.returned`.
  - Khóa chống trùng: `proposal:{id}:sub:{revision_no}`, `proposal:{id}:appr:{revision_no}`, `proposal:{id}:ret:{revision_no}`.
  - Đường dẫn: `/materials/{projectId}/proposals/{proposalId}`.
- **Câu chữ cố định:**
  - Ký tự phân cách: chấm giữa `·` (U+00B7) có khoảng trắng hai bên. Gạch nối trong tiêu đề là `–` (U+2013).
  - Nhãn đơn: "Đơn 18", "ĐH 18-1", "Eo Gió · Đơn 18", "ĐH 18-1 · Hòa Phát", "(lần 2)".
  - Tóm tắt: "A", "A, B", "A, B và 3 vật tư khác".
  - Thông báo: đúng câu trong spec mục 7.
- **Cloud và môi trường:**
  - Không đụng production hay `dev-preview`.
  - Cloud DEV (push migration, `db:dev:types`, pgTAP) chỉ chạy khi user cho phép.
  - Không chạy `supabase migration repair`.
- **Kiểm thử:**
  - pgTAP chỉ chạy được sau khi migration đã lên Cloud DEV. Task DB viết test và guard spec, task 7 chạy test.
  - Baseline lint là 28 lỗi. Unit có lỗi sẵn ở các file không liên quan, nên chỉ báo kết quả theo file test của task.
- **Quy trình:** UI giao cho `ui-agy`; agy lỗi thì giao `implementer`. Phần còn lại giao cho `implementer`.

| Task | Migration | N | Tiền tố UUID pgTAP |
|---|---|---|---|
| T1 | `supabase/migrations/20261017090000_c1_material_proposal_codes.sql` | 61 | `c135` |
| T2 | `supabase/migrations/20261017090100_c1_material_proposal_notifications.sql` | 62 | `c136` |

**Phụ thuộc:**
- Đợt 1: T1 (DB số đơn) ∥ T3 (TS dùng chung + server).
- Đợt 2: T2 (DB thông báo, cần T1) ∥ T4 (chữ thông báo, cần T3) ∥ T5 (UI, cần T3).
- Đợt 3: T6 (e2e + tài liệu), rồi T7 (Cloud DEV, phải hỏi user).

## Hợp đồng dữ liệu (chốt cho mọi task)

**Khóa mới trong JSON đọc.** Mọi khóa đều bắt buộc trong Zod strict.

| Nơi | Khóa mới |
|---|---|
| proposal view (`proposal_json`) | `proposalNo: number`; `revisionNo: number \| null` (`revision_no` của `current_revision_id`, null nếu chưa gửi lần nào); `summary: { names: string[] (0–2), total: number }`; mỗi phần tử `contractStatus[]` thêm `orderSeq: number` |
| order view (`order_json`) | `proposalNo: number`, `orderSeq: number`, `summary: { names, total }` |
| contract view (`read_contract`) | `projectName: string`, `proposalNo: number`, `orderSeq: number` |
| `finance_facts.contracts[]` | `proposalNo`, `orderSeq`. Đã có sẵn `projectName`. |
| `finance_inbox_facts` (cả 4 mảng) | `proposalNo`, `orderSeq` |
| `contractRow` trong summary dự án/NCC; `dueInstallments[]` | `projectName`, `proposalNo`, `orderSeq` (server chép từ facts) |

**Tóm tắt:**
- Đơn đề xuất đang `submitted`/`approved`: lấy `material_proposal_revision_lines` của `current_revision_id`, tên lấy từ `material_name`.
- Đơn ở trạng thái khác: lấy `material_proposal_lines` có `is_active`, tên lấy từ `material_items.name`.
- Đơn đặt hàng: lấy `material_order_allocations`, tên lấy từ snapshot của revision line, giống như `order_json` đang làm.
- Thứ tự: `material_proposal_lines.created_at`, rồi tên, rồi `proposal_line_id`.
- `total` là tổng số dòng. `names` là tối đa 2 tên đầu.

**Payload thông báo.** Giá trị chỉ là string, number hoặc null.

| Sự kiện | Khóa |
|---|---|
| `material.proposal.submitted` | `projectName`, `proposalNo`, `revisionNo`, `actorName`, `summaryName1`, `summaryName2`, `summaryTotal` |
| `material.proposal.approved` | Như trên. `actorName` là người duyệt. |
| `material.proposal.returned` | Như trên, thêm `reason` |
| Mọi thông báo có nguồn `material_order`, `material_contract`, `material_installment`, `material_payment_request` | Trigger gắn thêm `projectName`, `proposalNo`, `orderSeq`, chỉ khi payload chưa có |
| `material.order.created` | Thêm `summaryName1`, `summaryName2`, `summaryTotal` |

**Module dùng chung `shared/utils/material-codes.ts`:**
```ts
export function proposalCodeLabel(proposalNo: number): string            // "Đơn 18"
export function orderCodeLabel(proposalNo: number, orderSeq: number): string // "ĐH 18-1"
export function withProjectName(projectName: string | null | undefined, label: string): string // "Eo Gió · Đơn 18" | label
export function withSupplierName(label: string, supplierName: string | null | undefined): string // "ĐH 18-1 · Hòa Phát" | label
export function revisionSuffix(revisionNo: number | null | undefined): string // "" khi null/≤1, " (lần 2)"
export function materialSummaryText(names: readonly string[], total: number): string // "", "A", "A, B", "A, B và 3 vật tư khác"
export const materialSummarySchema // z.object({ names: z.array(z.string()).max(2), total: z.number().int().min(0) }).strict()
```

## Review Focus

1. **Hai người tạo đơn cùng lúc trong một dự án.** Phải ra hai số khác nhau. Trigger khóa dòng `projects` bằng `for no key update`, có unique constraint đỡ phía sau. Client gửi kèm `proposal_no` thì bị bỏ qua. *(T1 pgTAP)*
2. **Đơn ĐH bị hủy.** Vẫn giữ `order_seq`. Đơn tạo sau đó nhận số lớn nhất + 1, không lấp chỗ trống. *(T1 pgTAP)*
3. **Thông báo cũ không có khóa mới.** Vẫn hiển thị câu cũ, không lỗi và không ra "undefined". *(T4 unit)*
4. **Người nhận không đọc được đơn, hoặc chính là người thao tác.** Không nhận thông báo. Người gửi đơn bị mất quyền thì không nhận thông báo "đã duyệt". *(T2 pgTAP)*
5. **Đơn không có dòng nào, hoặc tên vật tư dài.** Tóm tắt rỗng thì thông báo bỏ luôn phần "(…)". Nhãn đơn vẫn hiện đầy đủ. *(T3 unit, T4 unit)*

## Cấu trúc file

| File | Task | Vai trò |
|---|---|---|
| `supabase/migrations/20261017090000_c1_material_proposal_codes.sql` | T1 | Cột, đánh số bù, trigger cấp số, hàm tóm tắt, bọc lệnh đọc |
| `supabase/tests/database/c1/c1_material_proposal_codes.test.sql` | T1 | pgTAP `c135` |
| `tests/unit/config/c1-material-proposal-codes-guard.spec.ts` | T1 | Guard văn bản migration |
| `supabase/migrations/20261017090100_c1_material_proposal_notifications.sql` | T2 | CHECK, helper, trigger thông báo, trigger gắn nhãn, đổi trigger order.created sang deferred |
| `supabase/tests/database/c1/c1_material_proposal_notifications.test.sql` | T2 | pgTAP `c136` |
| `tests/unit/config/c1-material-proposal-notifications-guard.spec.ts` | T2 | Guard |
| `scripts/run-c1-cloud-dev-tests.mjs`, `tests/unit/material-cloud-runner.spec.ts` | T1, T2 | Đăng ký file pgTAP |
| `shared/utils/material-codes.ts`, `tests/unit/shared/material-codes.spec.ts` | T3 | Định dạng dùng chung |
| `shared/schemas/costs/material-procurement.ts`, `material-finance.ts`; `server/features/costs/material-finance/*` | T3 | Zod và chép field ở server |
| `app/utils/notifications/app-notification-text.ts` | T4 | Chữ thông báo |
| Trang và component trong spec mục 6 | T5 | UI |
| `tests/e2e/material-proposal-codes.spec.ts`, fixture e2e, `docs/server/material-finance.md` | T6 | e2e, tài liệu |

---

### Task 1: DB — số đơn, mã ĐH, tóm tắt, lệnh đọc (N1–N4, N6)

**Files:**
- Create: `supabase/migrations/20261017090000_c1_material_proposal_codes.sql`
- Create: `supabase/tests/database/c1/c1_material_proposal_codes.test.sql`
- Create: `tests/unit/config/c1-material-proposal-codes-guard.spec.ts`
- Modify: `scripts/run-c1-cloud-dev-tests.mjs`, thêm `c1_material_proposal_codes.test.sql` → `c135` vào `materialSyntheticPrefixes`
- Modify: `tests/unit/material-cloud-runner.spec.ts`, thêm vào `materialPaths`

**Interfaces:**
- Produces:
  - `private.c1_material_proposal_summary(target_proposal_id uuid) returns jsonb`, trả `{"names": [...], "total": n}`
  - `private.c1_material_order_summary(target_order_id uuid) returns jsonb`, cùng dạng
  - `private.c1_material_order_label(target_order_id uuid) returns jsonb`, trả `{"projectName", "proposalNo", "orderSeq"}`, hoặc null nếu không thấy
  - `private.c1_material_with_order_codes(items jsonb) returns jsonb`: nhận một mảng; phần tử nào có `orderId` thì thêm `proposalNo`, `orderSeq`
  - Các khóa đọc trong bảng "Hợp đồng dữ liệu"

- [ ] **Step 1: Viết guard spec.** Theo mẫu `tests/unit/config/c1-material-flow-adjustment-guard.spec.ts`. Kiểm tra:
  - header và lock 61, footer `notify pgrst`;
  - có `alter function private.c1_material_proposal_json(uuid, uuid, uuid, uuid) rename to c1_material_proposal_json_core`, và tương tự cho `c1_material_order_json`, `c1_material_read_contract`, `c1_material_finance_facts`, `c1_material_finance_inbox_facts` (lấy chữ ký đúng từ migration mới nhất);
  - có `unique (project_id, proposal_no)` và `unique (proposal_id, order_seq)`;
  - có trigger `material_proposal_no_assign`, `material_order_seq_assign`, `material_codes_immutable`;
  - không có `update public.material_proposal_revisions` và không có `update public.material_proposal_revision_lines`.
- [ ] **Step 2: Chạy** `pnpm vitest run tests/unit/config/c1-material-proposal-codes-guard.spec.ts`. Kết quả mong đợi: FAIL vì chưa có file.
- [ ] **Step 3: Viết migration, theo thứ tự:**
  1. Thêm cột nullable. Đánh số bù bằng `row_number() over (partition by project_id order by created_at, id)` cho đơn đề xuất, và `over (partition by proposal_id order by created_at, id)` cho đơn ĐH, **kể cả đơn đã hủy**.
     - Câu `update` chỉ set cột số, không động tới `version` hay `updated_at`.
     - `material_signed_order_guard` chỉ so 6 cột nên không chặn.
  2. `set not null`, rồi thêm CHECK và unique.
  3. Trigger `material_proposal_no_assign`, `before insert on material_proposals`:
     - `select 1 from public.projects where id = new.project_id and tenant_id = new.tenant_id and company_id = new.company_id for no key update;`
     - `new.proposal_no := coalesce(max(proposal_no), 0) + 1` trong dự án. Luôn ghi đè giá trị client gửi.
  4. Trigger `material_order_seq_assign`, `before insert on material_orders`: khóa dòng `material_proposals` của `new.proposal_id` bằng `for no key update`, rồi lấy max + 1 trong đơn đề xuất (tính cả đơn đã hủy).
  5. Trigger `material_codes_immutable`, `before update` trên cả hai bảng: raise `P0001` / `MATERIAL_CODE_IMMUTABLE` khi số đổi. Tạo **sau** bước đánh số bù.
  6. Tạo các hàm tóm tắt và `c1_material_order_label` theo quy tắc trong "Hợp đồng dữ liệu".
  7. Đổi tên 5 hàm đọc sang `_core`, rồi tạo hàm bọc cùng tên, cùng chữ ký, `security definer set search_path = ''`, có revoke như hàm gốc:
     - `proposal_json`: `core || {proposalNo, revisionNo, summary}`; `contractStatus` thêm `orderSeq` theo `orderId`; core trả null thì trả null.
     - `order_json`: `core || {proposalNo, orderSeq, summary}`.
     - `read_contract`: `core || order_label(core->>'orderId')`.
     - `finance_facts`: `contracts := with_order_codes(contracts)`.
     - `finance_inbox_facts`: áp `with_order_codes` cho cả 4 mảng.
- [ ] **Step 4: Viết pgTAP `c135`.** Fixture theo mẫu `c1_material_flow_adjustments.test.sql`. Test nằm giữa `begin;` và `rollback;`, mọi UUID bắt đầu bằng `c135`. Kiểm tra:
  - **Đánh số đơn đề xuất:** tạo 2 đơn trong dự án X và 1 đơn trong dự án Y bằng RPC công khai. Kết quả là 1, 2 ở X và 1 ở Y. Chèn trực tiếp với `proposal_no = 99` thì vẫn ra 3.
  - **Bất biến:** `update material_proposals set proposal_no = 5` gây lỗi `MATERIAL_CODE_IMMUTABLE`.
  - **Đánh số đơn ĐH:** tạo 2 ĐH từ cùng một đơn đề xuất được 1 và 2. Hủy ĐH 2 rồi tạo ĐH mới thì được 3. Đơn đã hủy vẫn giữ số 2.
  - **Lệnh đọc:**
    - `read_proposal` có `proposalNo` và `summary`. Ví dụ 3 dòng thì `names` có 2 phần tử theo thứ tự tạo dòng, `total = 3`. `revisionNo` là null trước khi gửi và 1 sau khi gửi.
    - `read_order` có `orderSeq`.
    - `read_contract` có `projectName`, `proposalNo`, `orderSeq`.
    - `finance_facts.contracts[0]` có `orderSeq`; `finance_inbox_facts.awaitingContract[0]` có `proposalNo`.
  - **Tóm tắt rỗng:** đơn nháp không có dòng nào trả `{"names": [], "total": 0}`.
- [ ] **Step 5: Đăng ký file pgTAP** vào runner và vào `material-cloud-runner.spec.ts`. Chạy `pnpm vitest run tests/unit/config/c1-material-proposal-codes-guard.spec.ts tests/unit/material-cloud-runner.spec.ts`. Kết quả mong đợi: PASS.
- [ ] **Step 6: Commit** `feat(materials): number proposals per project and orders per proposal`

### Task 2: DB — thông báo đơn đề xuất và nhãn ĐH trong thông báo (N5, N4)

**Files:**
- Create: `supabase/migrations/20261017090100_c1_material_proposal_notifications.sql`
- Create: `supabase/tests/database/c1/c1_material_proposal_notifications.test.sql`
- Create: `tests/unit/config/c1-material-proposal-notifications-guard.spec.ts`
- Modify: runner map (`c136`) và `material-cloud-runner.spec.ts`
- Modify: `supabase/tests/database/c1/c1_material_finance_foundation.test.sql`, `c1_material_finance_reads.test.sql`, `c1_material_order_inline_supplier.test.sql`. Thêm `set constraints all immediate;` trước các assertion về `material.order.created`, vì trigger này chuyển sang deferred.

**Interfaces:**
- Consumes: T1 `c1_material_proposal_summary`, `c1_material_order_summary`, `c1_material_order_label`, cột `proposal_no` và `order_seq`.
- Produces:
  - `private.c1_material_user_display_name(target_tenant_id uuid, target_company_id uuid, target_user_id uuid) returns text`: trả `employees.full_name` của công ty; không có thì `auth.users.email`.
  - `private.c1_material_user_can_read_proposal(target_tenant_id uuid, target_company_id uuid, target_user_id uuid, target_proposal_id uuid) returns boolean`: giống `c1_material_can_read_proposal`, nhưng kiểm tra người nhận bằng `private.c1_workflow_user_has_permission` thay vì `auth.uid()`.
  - Các payload trong bảng "Hợp đồng dữ liệu".

- [ ] **Step 1: Viết guard spec.** Kiểm tra:
  - lock 62;
  - `drop constraint app_notifications_event_kind_check` và tạo lại với 12 sự kiện (9 cũ + 3 mới);
  - `drop constraint app_notifications_source_type_check` và tạo lại với 5 nguồn;
  - có trigger `material_proposal_submitted_notify` (after insert on `material_proposal_revisions`), `material_proposal_decided_notify` (after insert on `material_proposal_decisions`), `app_notifications_order_label` (before insert on `app_notifications`);
  - có `create constraint trigger material_order_created_notify … deferrable initially deferred`.
- [ ] **Step 2: Chạy guard.** Kết quả mong đợi: FAIL.
- [ ] **Step 3: Viết migration:**
  - **Trigger thông báo gửi đơn.** Người nhận là các thành viên công ty đang hoạt động, có `material.proposal.decide`, và qua được `user_can_read_proposal`. Gọi `c1_material_notify_users`, hàm này đã bỏ qua người thao tác và kiểm tra `material.read`. Tóm tắt lấy từ `c1_material_proposal_summary`. `actorName` lấy từ `submitted_by`.
    - Lưu ý thời điểm: lúc trigger chạy, `submit_proposal` chưa chèn revision lines và chưa đổi `review_state`. Hàm tóm tắt vì thế đọc các dòng đang hiệu lực, và các dòng này có cùng nội dung với bản sắp chụp. Đây là hành vi đúng, không phải lỗi.
    - Tương tự, với trigger quyết định, đơn vẫn còn ở trạng thái `submitted` hoặc `approved`, nên tóm tắt đọc từ revision lines.
  - **Trigger quyết định.** Người nhận là `submitted_by` của revision được quyết định, nếu `user_can_read_proposal`. Sự kiện tùy theo `decision` (`approve` hoặc `return`). `actorName` là `decided_by`. `reason` chỉ có khi trả.
  - **Trigger gắn nhãn đơn** (`before insert on app_notifications`):
    - Tìm `order_id` theo `source_type`:
      - `material_order` → `source_id`;
      - `material_contract` → `material_contracts.order_id`;
      - `material_payment_request` → hợp đồng của đề nghị → `order_id`;
      - `material_installment` → lấy `contract_id` từ `dedupe_key` dạng `inst:{contract_id}:…`, vì `installment_key` không duy nhất giữa các hợp đồng.
    - Rồi `new.payload := c1_material_order_label(order_id) || new.payload`, để khóa đã có trong payload thắng.
    - Nguồn `material_proposal` thì để nguyên.
  - **Trigger order.created:**
    - `drop trigger material_order_created_notify`;
    - `create or replace` `c1_material_notify_order_created()`, thêm tóm tắt `c1_material_order_summary(new.id)` (làm phẳng thành `summaryName1`, `summaryName2`, `summaryTotal`);
    - tạo lại bằng `create constraint trigger … after insert … deferrable initially deferred for each row`.
- [ ] **Step 4: Viết pgTAP `c136`.** Kiểm tra:
  - **Gửi đơn:** kỹ sư gửi đơn thì mỗi người mua hàng có đúng 1 thông báo `material.proposal.submitted`. Payload có `proposalNo`, `revisionNo = 1`, `summaryTotal`, `actorName`, và `linkPath` đúng. Kỹ sư không nhận.
  - **Gửi lại:** sau khi bị trả, kỹ sư gửi lại thì có thêm thông báo với `revisionNo = 2`.
  - **Quyết định:** trả đơn thì kỹ sư nhận `returned` có `reason`. Duyệt thì kỹ sư nhận `approved`. Người mua hàng tự thao tác thì không nhận thông báo của chính mình.
  - **Mất quyền:** gỡ `material.read` của kỹ sư rồi duyệt thì không có thông báo `approved`.
  - **Đơn ĐH mới:** tạo ĐH, chạy `set constraints all immediate;`, thì thông báo `material.order.created` có `orderSeq`, `proposalNo`, `projectName`, `summaryTotal`.
  - **Hợp đồng:** ghi hợp đồng thì thông báo `material.contract.recorded` có `orderSeq`.
  - **Tên người:** `user_display_name` trả email khi người đó không có hồ sơ nhân viên.
- [ ] **Step 5: Sửa 3 file pgTAP cũ** như mô tả trong Files. Đăng ký `c136`. Chạy guard spec và `material-cloud-runner.spec.ts`. Kết quả mong đợi: PASS.
- [ ] **Step 6: Commit** `feat(materials): notify proposal decisions and label finance notifications with order codes`

### Task 3: TS dùng chung, Zod, server (N1–N4)

**Files:**
- Create: `shared/utils/material-codes.ts`, `tests/unit/shared/material-codes.spec.ts`
- Modify:
  - `shared/schemas/costs/material-procurement.ts` (proposal view, `contractStatus` item, order view);
  - `shared/schemas/costs/material-finance.ts` (contract view, `contractRow`, `inboxBase`, các mục `dueInstallments`, `appNotificationEventKindSchema` thêm 3 sự kiện);
  - `server/features/costs/material-finance/finance-read-repository.ts` (`contractFactsSchema`, inbox facts);
  - `finance-read-service.ts` (`contractRow()`, `dueInstallments`, `suppliers`);
  - `contract-service.ts` (`materialContractFactsSchema`, `contractViewFromFacts`).
- Modify (fixture): `tests/unit/material-procurement/fixtures.ts` và mọi fixture unit đang hỏng vì khóa bắt buộc mới.

**Interfaces:**
- Consumes: các khóa trong "Hợp đồng dữ liệu". Không cần DB, vì test dùng fixture.
- Produces: module `material-codes.ts` như đã chốt, và các type Zod có khóa mới.

- [ ] **Step 1: Viết test `material-codes.spec.ts`:**
  - `proposalCodeLabel(18)` → `'Đơn 18'`; `orderCodeLabel(18, 1)` → `'ĐH 18-1'`
  - `withProjectName('Eo Gió', 'Đơn 18')` → `'Eo Gió · Đơn 18'`; `withProjectName(null, 'Đơn 18')` → `'Đơn 18'`; `withProjectName('  ', 'Đơn 18')` → `'Đơn 18'`
  - `withSupplierName('ĐH 18-1', 'Hòa Phát')` → `'ĐH 18-1 · Hòa Phát'`; `withSupplierName('ĐH 18-1', undefined)` → `'ĐH 18-1'`
  - `revisionSuffix(null)` → `''`; `revisionSuffix(1)` → `''`; `revisionSuffix(2)` → `' (lần 2)'`
  - `materialSummaryText([], 0)` → `''`; `(['Thép D10'], 1)` → `'Thép D10'`; `(['Thép D10', 'Xi măng PCB40'], 2)` → `'Thép D10, Xi măng PCB40'`; `(['Thép D10', 'Xi măng PCB40'], 5)` → `'Thép D10, Xi măng PCB40 và 3 vật tư khác'`; `(['Thép D10'], 3)` → `'Thép D10 và 2 vật tư khác'`
- [ ] **Step 2: Chạy** `pnpm vitest run tests/unit/shared/material-codes.spec.ts`. Kết quả mong đợi: FAIL.
- [ ] **Step 3: Viết `material-codes.ts`.** Thêm khóa vào các schema (dùng `materialSummarySchema`; số đơn và số thứ tự là `z.number().int().positive()`; `revisionNo` là `.nullable()`). Ở server, chép thêm field trong `contractRow()`, `dueInstallments`, `contractViewFromFacts`.
- [ ] **Step 4: Thêm test schema** vào `tests/unit/shared/material-procurement.spec.ts` và `material-finance.spec.ts`:
  - proposal view thiếu `proposalNo` thì bị từ chối;
  - `summary.names` có 3 phần tử thì bị từ chối;
  - `appNotificationEventKindSchema` nhận `'material.proposal.returned'`.
- [ ] **Step 5: Sửa fixture.** Chạy các file test trong mục "Unit tests touching" của fact sheet (`tests/unit/shared/material-*.spec.ts`, `tests/unit/server/material-*.spec.ts`, `tests/unit/repositories/http-material-procurement-repository.spec.ts`) và `pnpm typecheck`. Kết quả mong đợi: PASS, không có lỗi type mới.
- [ ] **Step 6: Commit** `feat(materials): shared proposal and order code labels`

### Task 4: Chữ thông báo (N5, N4)

**Files:**
- Modify: `app/utils/notifications/app-notification-text.ts`, `tests/unit/utils/app-notification-text.spec.ts`

**Interfaces:**
- Consumes: T3 `material-codes.ts`, cùng 3 sự kiện mới trong `appNotificationEventKindSchema`.

- [ ] **Step 1: Viết test** dùng payload theo bảng "Hợp đồng dữ liệu":
  - **submitted:**
    - Tiêu đề `'Eo Gió · Đơn 18 – Chờ duyệt'`; nội dung `'Nguyễn Văn A vừa gửi Đơn 18 (Thép D10, Xi măng PCB40 và 3 vật tư khác), cần bạn xem xét duyệt.'`
    - Khi `revisionNo: 2`: tiêu đề `'Eo Gió · Đơn 18 – Chờ duyệt (lần 2)'`; nội dung bắt đầu bằng `'Nguyễn Văn A vừa gửi lại Đơn 18'`
  - **approved:** `'Eo Gió · Đơn 18 – Đã duyệt'` / `'Trần Thị B đã duyệt Đơn 18 (…).'`
  - **returned:** `'Eo Gió · Đơn 18 – Bị trả lại'` / `'Trần Thị B đã trả lại Đơn 18 (…). Lý do: Sai số lượng.'`
  - **Tóm tắt rỗng** (`summaryTotal: 0`): `'Nguyễn Văn A vừa gửi Đơn 18, cần bạn xem xét duyệt.'`
  - **contract.recorded** có nhãn: `'Hợp đồng HD-01 (Eo Gió · ĐH 18-1) với Hòa Phát, tổng giá trị …'`. Khi là đơn không hợp đồng thì nội dung bắt đầu bằng `'Eo Gió · ĐH 18-1 với Hòa Phát'`.
  - **payment.returned** có nhãn: `'Đề nghị chi cho hợp đồng HD-01 (Eo Gió · ĐH 18-1) với Hòa Phát đã bị trả lại. Lý do: …'`
  - **installment.due_soon** có nhãn: `'Đợt "Đợt 2" của Eo Gió · ĐH 18-1 · Hòa Phát đến hạn ngày …'`
  - **order.created** có nhãn: `'Eo Gió · ĐH 18-1 · Hòa Phát (Thép D10 và 2 vật tư khác) cần ghi nhận hợp đồng.'`
  - **Mọi sự kiện cũ khi payload không có `proposalNo` hoặc `orderSeq`:** ra đúng câu như trước. Giữ nguyên các test cũ.
- [ ] **Step 2: Chạy** `pnpm vitest run tests/unit/utils/app-notification-text.spec.ts`. Kết quả mong đợi: FAIL ở các test mới.
- [ ] **Step 3: Cài đặt.** Thêm helper `orderLabel(payload): string | null`. Trả null khi thiếu `proposalNo` hoặc `orderSeq`, khi đó dùng câu cũ. Thêm 3 case mới. Không thay đổi tiêu đề của các sự kiện cũ.
- [ ] **Step 4: Chạy lại test.** Kết quả mong đợi: PASS.
- [ ] **Step 5: Commit** `feat(materials): proposal notifications and order labels in notification text`

### Task 5: UI — hiển thị số đơn và mã ĐH (N4)

**Files (trong `app/`):**
- `pages/materials/[projectId]/proposals/index.vue`
- `pages/materials/[projectId]/proposals/[proposalId].vue`
- `components/materials/MaterialOrderCreatePanel.vue`
- `pages/materials/[projectId]/orders/[orderId].vue`
- `pages/materials/[projectId]/finance.vue`
- `components/materials/finance/MaterialContractSummary.vue`, `MaterialInvoiceForm.vue`, `MaterialPaymentRequestForm.vue`, `MaterialInvoicePanel.vue`
- `pages/materials/finance/index.vue`, `pages/materials/finance/suppliers.vue`

**Interfaces:**
- Consumes: T3 `material-codes.ts` và các khóa view mới.

- [ ] **Step 1: Sửa từng chỗ:**
  - **Danh sách đơn đề xuất:** ô đầu mỗi dòng hiện `proposalCodeLabel` kèm tóm tắt (`materialSummaryText`), giữ ngày cần.
  - **Chi tiết đơn đề xuất:**
    - h2 là `{proposalCodeLabel}{revisionSuffix} · Phiếu yêu cầu vật tư`.
    - Dòng "Mã định danh phiếu: {uuid}" đổi thành tóm tắt.
    - Danh sách trạng thái hợp đồng có thêm `orderCodeLabel` trước nhãn hợp đồng.
  - **Bảng ĐH trong `MaterialOrderCreatePanel`:** ô "Mã đơn" hiện `orderCodeLabel` thay cho `order.id.slice(0, 8)`.
  - **Chi tiết ĐH:**
    - h2 là `withSupplierName(orderCodeLabel, supplierName)`.
    - Link quay lại ghi "Về {proposalCodeLabel}".
    - "Mã đơn: …" đổi thành tóm tắt.
  - **Màn hình tài chính của dự án và các component hợp đồng/hóa đơn/đề nghị chi:** `orderCodeLabel` đứng **cạnh** số hợp đồng. Không bỏ số hợp đồng.
  - **Màn hình tài chính chung** (`finance/index.vue`, cả 5 tab): `withProjectName(projectName, orderCodeLabel(…))` thay cho `orderId.slice(0, 8)`.
  - **`suppliers.vue`:** dùng `contract.projectName` từ server thay cho tra cứu ở client, kèm `orderCodeLabel`.
- [ ] **Step 2: Verifier kiểm tra.** Chạy `pnpm typecheck` và `pnpm lint` (lint không tăng quá baseline 28). Mở dev server và chụp màn hình các trang đã sửa bằng dữ liệu stub e2e.
- [ ] **Step 3: Commit** `feat(materials): show proposal numbers and order codes across material screens`

### Task 6: e2e, fixture và tài liệu

**Files:**
- Create: `tests/e2e/material-proposal-codes.spec.ts`
- Modify: fixture JSON trong `tests/e2e/material-*.spec.ts` đang hỏng vì khóa bắt buộc mới
- Modify: `docs/server/material-finance.md`, thêm 2 dòng migration (61, 62). Thêm một mục ghi rõ:
  - 5 hàm đọc đã bị đổi tên thành `_core`, và từ nay **sửa hàm `_core`**;
  - hàm bọc chỉ gắn khóa;
  - danh sách trigger mới.

- [ ] **Step 1: Viết e2e.** Stub API theo kiểu các spec vật tư hiện có. Kiểm tra:
  - danh sách đơn đề xuất hiện "Đơn 18" và "Thép D10, Xi măng PCB40 và 3 vật tư khác";
  - trang chi tiết đơn có "Đơn 18 (lần 2)";
  - bảng ĐH hiện "ĐH 18-1";
  - trang ĐH có h2 "ĐH 18-1 · Hòa Phát";
  - tab "Chờ hợp đồng" ở màn hình tài chính chung hiện "Eo Gió · ĐH 18-1";
  - chuông thông báo hiện tiêu đề "Eo Gió · Đơn 18 – Chờ duyệt".
- [ ] **Step 2: Sửa fixture e2e cũ.** Chạy e2e trên bản build production (port 4317, `PLAYWRIGHT_REUSE_EXISTING_SERVER=true`) cho `material-proposal-codes`, `material-proposal`, `material-small-orders`, `material-flow-adjustments`, `material-finance-flow`. Kết quả mong đợi: PASS, trừ lỗi cũ `material-proposal` #12.
- [ ] **Step 3: Commit** `test(materials): e2e for proposal numbers and order codes`

### Task 7: Cloud DEV và PR (chỉ chạy khi user cho phép)

- [ ] **Step 1: Kiểm tra trước.** Chạy `pnpm db:dev:dry-run`. Kết quả mong đợi: chỉ có 2 migration mới.
- [ ] **Step 2: Áp migration.** Hỏi user trước, rồi chạy `pnpm db:dev:push`. Query chỉ đọc để kiểm tra: mọi đơn đề xuất và ĐH có số; không có hai dòng trùng số; `version` và `updated_at` của các đơn cũ không đổi so với ảnh chụp trước khi push.
- [ ] **Step 3: Sinh lại types.** Chạy `pnpm db:dev:types`, rồi commit `shared/types/database.types.ts`.
- [ ] **Step 4: Chạy pgTAP.** `pnpm db:dev:a1:test`. Kết quả mong đợi: 15/15 file qua (13 cũ + `c135` + `c136`).
- [ ] **Step 5: Kiểm tra toàn bộ.** Verifier chạy typecheck, lint, build, unit. Reviewer đọc toàn nhánh. Sau đó push và mở PR vào `dev`. PR phụ thuộc PR #45: nếu #45 chưa merge thì ghi rõ trong mô tả PR.
