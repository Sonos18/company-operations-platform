# Vật tư A4/A5 — Hợp đồng, cam kết, hóa đơn và thực chi — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kế toán ghi hợp đồng (kèm phụ lục, lịch đợt, hóa đơn) cho đơn mua vật tư; kế toán đề nghị chi, thủ quỹ duyệt và ghi chi; hệ thống thông báo trong app, nhắc hạn và báo cáo cam kết/đã chi/còn nợ theo đơn, dự án và NCC.

**Architecture:** Sổ riêng cho vật tư trong schema `public.material_*`. Ghi đi qua RPC `security definer` theo pattern A1–A3, có idempotency receipt, expectedVersion, RLS forced và bảng lịch sử bất biến. Dùng lại `cost_evidence_files`, `cost_command_receipts`, `audit_events` và helper quyền `private.c1_workflow_user_has_permission`. Thông báo đi qua bảng chung `app_notifications`, ghi cùng transaction với sự kiện. Số liệu do một hàm TS thuần tính từ "facts" mà RPC trả về.

**Tech Stack:** Nuxt 3, Vue 3, TypeScript, Zod, decimal.js, Supabase Postgres (plpgsql, RLS, pgTAP), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-15-materials-a4-a5-contract-payment-design.md`

## Global Constraints

- Nền: nhánh `agy/materials-a3-number-format-supplier-code` tại `0c226cdd`. Mỗi task làm trong worktree riêng tách từ nhánh tích hợp `feat/materials-a4-a5` (tạo ở T0 từ `0c226cdd`).
- Migration forward-only, đặt tên chính xác như bảng dưới, mở đầu bằng `set local lock_timeout = '5s'; set local statement_timeout = '90s'; select pg_catalog.pg_advisory_xact_lock(71842, N);` và kết thúc bằng `notify pgrst, 'reload schema';`.
- Không sửa migration đã có. Muốn sửa hàm đã có thì dùng `create or replace` với định nghĩa hiện hành (đọc migration mới nhất định nghĩa hàm đó) hoặc patch theo anchor `pg_get_functiondef` như `20261010032646_c1_material_line_notes.sql`.
- Mọi hàm `private.*` bị `revoke all ... from public,anon,authenticated,service_role`. Chỉ wrapper `public.*` được `grant execute ... to authenticated`, trừ hàm nhắc hạn chỉ grant cho `service_role`.
- Lỗi nghiệp vụ dùng `raise exception using errcode = 'P0001', message = '<CODE>'`.
- Tiền là `numeric(20,4)`, JSON là chuỗi khớp `workflowMoneySchema` (`/^(?:0|[1-9]\d{0,15})(?:\.\d{1,4})?$/`), TS dùng `decimal.js`, không dùng số thực JS.
- Mọi bảng có `tenant_id, company_id, project_id`, composite FK về `projects`/bảng cha, `unique(id, tenant_id, company_id, project_id)`. Riêng `app_notifications` là cấp công ty, `project_id` nullable.
- Không thêm dependency. Không đụng production, `dev-preview` hay Cloud DEV nếu chưa có cho phép riêng cho từng thao tác (push migration, `db:dev:types`, pgTAP trên Cloud, tạo branch environment/cron InstaCloud, deploy preview).
- Baseline unit suite có lỗi sẵn (khoảng 86). Chỉ báo pass theo các file test của task và so với baseline, không gọi cả suite là xanh.
- Ngày "hôm nay" luôn tính theo `Asia/Ho_Chi_Minh`. Ngưỡng nhắc sắp hạn là `MATERIAL_DUE_SOON_DAYS = 3`.
- Văn bản UI và message lỗi hiển thị bằng tiếng Việt, giống A1–A3.

| Task | Migration | N |
|---|---|---|
| T0 | `supabase/migrations/20261015090000_c1_material_finance_foundation.sql` | 50 |
| T1 | `supabase/migrations/20261015090100_c1_material_contract_commands.sql` | 51 |
| T2 | `supabase/migrations/20261015090200_c1_material_payment_commands.sql` | 52 |
| T3 | `supabase/migrations/20261015090300_c1_material_finance_reads.sql` | 53 |
| T4 | `supabase/migrations/20261015090400_c1_material_finance_evidence.sql` | 54 |

Thứ tự áp dụng theo timestamp: T0 → T1 → T2 → T3 → T4.
- T2 gọi helper `private.c1_material_require_contract_file` do T1 tạo. Timestamp của T1 nhỏ hơn nên hàm đã có khi T2 apply.
- T3 không phụ thuộc T1 và T2 ở SQL.
- T4 chỉ sửa các hàm tạo, finalize và đọc evidence. T1 và T2 đọc trực tiếp bảng `material_evidence_scopes` (schema có từ T0), nên không phụ thuộc T4 lúc apply.

## Thay đổi so với spec (đã chốt khi lập plan)

1. **Giữ `material_order_contracts` làm cờ "đơn đã ký".** Có 8 hàm (tính `signedQuantity`, chặn sửa phiếu, chặn đình chỉ, chặn hủy, guard trigger) đang kiểm tra bảng này. Thay vì vá từng hàm, T0 chuyển FK `contract_id` của bảng (đang trống) từ `cost_workflow_contracts` sang `material_contracts`. Lệnh ghi hợp đồng chèn vào cả hai bảng. Spec mục 3.5 ý 8 được cập nhật theo.
2. **Thông báo "đơn mới" dùng trigger `after insert` trên `material_orders`** thay vì patch `c1_material_create_order`.
3. **Tách evidence ra thành task riêng T4**, nên số task là T0–T8 (spec ghi T0–T7).

## Review Focus

1. Phụ lục bỏ một đợt đang có đề nghị bị trả lại (`returned` không tính là pending). Gửi lại đề nghị đó phải lỗi `INSTALLMENT_NOT_FOUND`, không được chi vào đợt đã bị bỏ. Test ở T2.
2. Nhập theo % làm tổng các đợt lệch tổng hợp đồng vài đồng do làm tròn. UI dồn phần chênh vào đợt cuối; server từ chối mọi lệch bằng `INSTALLMENT_TOTAL_MISMATCH`. Test ở T0 (schema) và T5 (UI).
3. "Hôm nay" bị lệch ngày khi server chạy theo UTC: `2026-10-15T18:30:00Z` phải là ngày `2026-10-16` tại VN. Test ở T3.
4. Kế toán A lập, kế toán B gửi lại sau khi bị trả: người bị chặn duyệt là người gửi lần gần nhất (B), không phải người lập (A). Test ở T2.
5. Mua hàng hủy đơn đúng lúc kế toán ghi hợp đồng: đơn đã `cancelled` thì ghi hợp đồng lỗi `ORDER_NOT_ACTIVE`; đơn đã có hợp đồng thì hủy đơn bị chặn. Test ở T1.

---

## Cấu trúc file

| File | Trách nhiệm | Task |
|---|---|---|
| `shared/schemas/costs/material-finance.ts` (mới) | Zod input/view, manifest endpoint, interface `MaterialFinanceRepository` | T0 |
| `shared/utils/material-finance-summary.ts` (mới) | `summarizeMaterialFinance`, `installmentDueStatus`, `vietnamToday`, `MATERIAL_DUE_SOON_DAYS` | T0 |
| `shared/schemas/costs/material-procurement.ts` | Đổi `contract`/`cash` trong `materialOrderViewSchema`; bỏ `commitMaterialContractInputSchema`, `recordContract`, `payments` | T0 |
| `shared/constants/permissions.ts` | 4 quyền mới | T0 |
| `app/repositories/http/http-material-finance-repository.ts` (mới) | HTTP client | T0 |
| `app/repositories/material-finance.contracts.ts` (mới) | Re-export type | T0 |
| `app/repositories/contracts.ts`, `app/plugins/repositories.client.ts` | Đăng ký `materialFinance` | T0 |
| `server/features/costs/material-finance/service.ts` (mới) | Kiểm quyền, parse, tính totals | T0 khung; T1/T2/T3 điền phương thức |
| `server/features/costs/material-finance/repository.ts` (mới) | Gọi RPC | T0 khung; T1/T2/T3 điền |
| `server/features/costs/material-finance/routes.ts` (mới) | Handler H3 | T0 khung; T1/T2/T3 điền |
| `server/api/.../material-procurement/orders/[orderId]/contract.{get,post}.ts` | Route | T1 |
| `server/api/.../material-procurement/contracts/[contractId]/amendments.post.ts` | Route | T1 |
| `server/api/.../material-procurement/contracts/[contractId]/invoices/index.{get,post}.ts`, `invoices/[invoiceId]/void.post.ts` | Route | T2 |
| `server/api/.../material-procurement/contracts/[contractId]/payment-requests/index.{get,post}.ts`, `payment-requests/[requestId].patch.ts`, `payment-requests/[requestId]/{cancel,decisions,payment}.post.ts` | Route | T2 |
| `server/api/.../material-procurement/material-finance/summary.get.ts` | Route | T3 |
| `server/api/companies/[companyId]/material-finance/{inbox,suppliers}.get.ts` | Route | T3 |
| `server/api/companies/[companyId]/notifications/index.get.ts`, `[notificationId]/read.post.ts` | Route | T3 |
| `server/api/internal/material-reminders.post.ts`, `server/features/costs/material-finance/reminders.ts` | Job nhắc hạn | T3 |
| Evidence: `material-procurement/{service,repository}.ts`, `shared/schemas/costs/material-procurement.ts` (`materialEvidence*`), `server/features/costs/evidence/evidence-file-integrity.ts`, `app/utils/costs/material-evidence-uploader.ts` | Loại file và đối tượng mới | T4 |
| `app/pages/materials/[projectId]/orders/[orderId].vue`, `app/components/materials/finance/MaterialContract*.vue` | UI hợp đồng | T5 |
| `app/pages/materials/finance/index.vue`, `app/components/materials/finance/MaterialPayment*.vue`, `MaterialInvoice*.vue` | UI hộp việc, hóa đơn, đề nghị chi | T6 |
| `app/pages/materials/[projectId]/finance.vue`, `app/pages/materials/finance/suppliers.vue`, `CostNotificationBell.vue`, `navigation-permissions.ts` | UI số liệu, chuông, menu | T7 |

Đường dẫn `server/api/.../material-procurement/` nghĩa là `server/api/companies/[companyId]/projects/[projectId]/material-procurement/`.

---

### Task 0: Nền (schema, helper, hợp đồng API, wiring)

Chạy tuần tự trước mọi task khác. Implementer: `implementer` → opus (định nghĩa giao diện cho 8 task sau, sai ở đây lan rộng).

**Files:**
- Create: `supabase/migrations/20261015090000_c1_material_finance_foundation.sql`
- Create: `shared/schemas/costs/material-finance.ts`, `shared/utils/material-finance-summary.ts`
- Create: `app/repositories/http/http-material-finance-repository.ts`, `app/repositories/material-finance.contracts.ts`
- Create: `server/features/costs/material-finance/{service,repository,routes}.ts`
- Modify: `shared/schemas/costs/material-procurement.ts`, `shared/constants/permissions.ts`, `app/repositories/contracts.ts`, `app/plugins/repositories.client.ts`, `app/repositories/http/http-material-procurement-repository.ts`
- Modify: `tests/unit/server/material-orders.spec.ts`, `tests/unit/repositories/http-material-procurement-repository.spec.ts`, `tests/unit/shared/material-procurement.spec.ts` (cập nhật fixture `contract`/`cash` và bỏ `recordContract`)
- Test: `tests/unit/shared/material-finance.spec.ts`, `tests/unit/shared/material-finance-summary.spec.ts`, `tests/unit/repositories/http-material-finance-repository.spec.ts`, `tests/unit/config/c1-material-finance-foundation-guard.spec.ts`, `supabase/tests/database/c1/c1_material_finance_foundation.test.sql`

**Interfaces:**
- Produces (SQL):
  - Các bảng ở Step 5.
  - `private.c1_material_can_read_finance(t uuid, c uuid) returns boolean`
  - `private.c1_material_can_see_contract_status(t uuid, c uuid, p uuid, order_id uuid) returns boolean`
  - `private.c1_material_installment_usage(contract_id uuid) returns table(installment_key uuid, paid numeric, pending numeric)`
  - `private.c1_material_notify_permission(t uuid, c uuid, p uuid, permission text, event_kind text, source_type text, source_id uuid, link_path text, payload jsonb, dedupe_key text) returns void`
  - `private.c1_material_notify_users(t uuid, c uuid, p uuid, user_ids uuid[], event_kind text, source_type text, source_id uuid, link_path text, payload jsonb, dedupe_key text) returns void`
  - Trigger `material_order_created_notify`.
- Produces (TS): mọi schema/type trong Step 3; `MaterialFinanceRepository`; `materialFinanceEndpointManifest`; `summarizeMaterialFinance`, `installmentDueStatus`, `vietnamToday`, `MATERIAL_DUE_SOON_DAYS`; `MaterialFinanceService`, `MaterialFinanceDataRepository`, `createMaterialFinanceRoutes`.

- [ ] **Step 1: Tạo nhánh tích hợp và worktree**

```bash
git branch feat/materials-a4-a5 0c226cdd
git worktree add -b feat/materials-a4-a5-t0 .worktrees/materials-a4-a5-t0 feat/materials-a4-a5
```

Nếu dùng InstaCloud branch environment cho task này, xin phép người dùng trước (skill `insta`).

- [ ] **Step 2: Viết test schema và hàm tính số liệu (đỏ)**

`tests/unit/shared/material-finance-summary.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { installmentDueStatus, summarizeMaterialFinance, vietnamToday } from '../../../shared/utils/material-finance-summary'

const contract = (total: string, invoiced: string, installments: Array<[string, string, string, string]>) => ({
  total,
  invoiced,
  installments: installments.map(([amount, dueOn, paid, pending], index) => ({
    installmentKey: `00000000-0000-4000-8000-00000000000${index}`,
    amount, dueOn, paid, pending,
  })),
})

describe('material finance summary', () => {
  it('computes committed, paid, pending, remaining for contract 100 paid 30 pending 20', () => {
    expect(summarizeMaterialFinance([contract('100.0000', '0.0000', [['100.0000', '2026-12-01', '30.0000', '20.0000']])], '2026-10-15')).toEqual({
      committed: '100.0000', paid: '30.0000', pending: '20.0000', remaining: '70.0000',
      overdue: '0.0000', invoiced: '0.0000', paidWithoutInvoice: '30.0000',
    })
  })

  it('counts only unpaid part of past-due installments as overdue; pending does not reduce overdue', () => {
    const result = summarizeMaterialFinance([contract('100.0000', '50.0000', [
      ['30.0000', '2026-10-01', '10.0000', '20.0000'],
      ['70.0000', '2026-10-15', '0.0000', '0.0000'],
    ])], '2026-10-15')
    expect(result.overdue).toBe('20.0000')
    expect(result.paidWithoutInvoice).toBe('0.0000')
  })

  it('sums several contracts without floating point drift', () => {
    const result = summarizeMaterialFinance([
      contract('0.1000', '0.0000', [['0.1000', '2027-01-01', '0.1000', '0.0000']]),
      contract('0.2000', '0.0000', [['0.2000', '2027-01-01', '0.2000', '0.0000']]),
    ], '2026-10-15')
    expect(result.paid).toBe('0.3000')
  })

  it('classifies installment due status with a 3 day window', () => {
    const base = { installmentKey: '00000000-0000-4000-8000-000000000001', amount: '10.0000', pending: '0.0000' }
    expect(installmentDueStatus({ ...base, dueOn: '2026-10-18', paid: '0.0000' }, '2026-10-15')).toBe('due_soon')
    expect(installmentDueStatus({ ...base, dueOn: '2026-10-19', paid: '0.0000' }, '2026-10-15')).toBe('not_due')
    expect(installmentDueStatus({ ...base, dueOn: '2026-10-15', paid: '0.0000' }, '2026-10-15')).toBe('due_soon')
    expect(installmentDueStatus({ ...base, dueOn: '2026-10-14', paid: '0.0000' }, '2026-10-15')).toBe('overdue')
    expect(installmentDueStatus({ ...base, dueOn: '2026-10-14', paid: '10.0000' }, '2026-10-15')).toBe('settled')
  })

  it('uses Asia/Ho_Chi_Minh for today', () => {
    expect(vietnamToday(new Date('2026-10-15T18:30:00Z'))).toBe('2026-10-16')
    expect(vietnamToday(new Date('2026-10-15T16:59:59Z'))).toBe('2026-10-15')
  })
})
```

`tests/unit/shared/material-finance.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  amendMaterialContractInputSchema,
  decidePaymentRequestInputSchema,
  recordMaterialContractInputSchema,
  recordMaterialInvoiceInputSchema,
} from '../../../shared/schemas/costs/material-finance'

const key1 = '00000000-0000-4000-8000-000000000001'
const key2 = '00000000-0000-4000-8000-000000000002'
const file = '00000000-0000-4000-8000-0000000000f1'
const valid = {
  expectedOrderVersion: 1,
  contractNo: 'HD-01/2026',
  signedOn: '2026-10-10',
  subtotal: '100.0000',
  vatAmount: '10.0000',
  total: '110.0000',
  varianceReason: null,
  contractFileId: file,
  signedQuotationFileId: '00000000-0000-4000-8000-0000000000f2',
  installments: [
    { installmentKey: key1, name: 'Tạm ứng', amount: '33.0000', dueOn: '2026-10-12', isAdvance: true },
    { installmentKey: key2, name: 'Sau giao hàng', amount: '77.0000', dueOn: '2026-11-10', isAdvance: false },
  ],
}

describe('material finance input schemas', () => {
  it('accepts a balanced contract', () => {
    expect(recordMaterialContractInputSchema.parse(valid)).toMatchObject({ total: '110.0000' })
  })
  it('rejects subtotal + vat != total', () => {
    expect(recordMaterialContractInputSchema.safeParse({ ...valid, total: '111.0000' }).success).toBe(false)
  })
  it('rejects installments that do not sum to total (INSTALLMENT_TOTAL_MISMATCH)', () => {
    const result = recordMaterialContractInputSchema.safeParse({
      ...valid,
      installments: [valid.installments[0], { ...valid.installments[1], amount: '76.9900' }],
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe('INSTALLMENT_TOTAL_MISMATCH')
  })
  it('rejects duplicate installment keys', () => {
    expect(recordMaterialContractInputSchema.safeParse({
      ...valid,
      installments: [valid.installments[0], { ...valid.installments[1], installmentKey: key1 }],
    }).success).toBe(false)
  })
  it('requires amendment reason and file', () => {
    expect(amendMaterialContractInputSchema.safeParse({
      expectedVersion: 1, subtotal: '100.0000', vatAmount: '10.0000', total: '110.0000',
      varianceReason: null, amendmentFileId: file, reason: '', installments: valid.installments,
    }).success).toBe(false)
  })
  it('requires a reason when returning a payment request', () => {
    expect(decidePaymentRequestInputSchema.safeParse({ expectedVersion: 1, decision: 'return' }).success).toBe(false)
    expect(decidePaymentRequestInputSchema.safeParse({ expectedVersion: 1, decision: 'approve' }).success).toBe(true)
  })
  it('rejects invoice with duplicate proposal lines', () => {
    expect(recordMaterialInvoiceInputSchema.safeParse({
      invoiceSymbol: '1C26TAA', invoiceNo: '0000123', issuedOn: '2026-10-11',
      subtotal: '100.0000', vatAmount: '10.0000', total: '110.0000', fileId: file,
      lines: [
        { proposalLineId: key1, invoiceMaterialName: 'Thép D10' },
        { proposalLineId: key1, invoiceMaterialName: 'Thép D10 khác' },
      ],
    }).success).toBe(false)
  })
})
```

- [ ] **Step 3: Chạy để xác nhận đỏ**

Run: `pnpm exec vitest run tests/unit/shared/material-finance.spec.ts tests/unit/shared/material-finance-summary.spec.ts`
Expected: FAIL, không resolve được module `material-finance` / `material-finance-summary`.

- [ ] **Step 4: Viết schema và hàm tính số liệu**

`shared/utils/material-finance-summary.ts`:

```ts
import Decimal from 'decimal.js'

export const MATERIAL_DUE_SOON_DAYS = 3

export interface MaterialInstallmentFacts {
  installmentKey: string
  amount: string
  dueOn: string
  paid: string
  pending: string
}

export interface MaterialContractFacts {
  total: string
  invoiced: string
  installments: MaterialInstallmentFacts[]
}

export interface MaterialFinanceTotals {
  committed: string
  paid: string
  pending: string
  remaining: string
  overdue: string
  invoiced: string
  paidWithoutInvoice: string
}

export type InstallmentDueStatus = 'settled' | 'overdue' | 'due_soon' | 'not_due'

const money = (value: Decimal) => value.toFixed(4)

export function vietnamToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now)
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86_400_000)
}

export function installmentDueStatus(installment: MaterialInstallmentFacts, today: string): InstallmentDueStatus {
  if (new Decimal(installment.paid).greaterThanOrEqualTo(installment.amount)) return 'settled'
  const days = daysBetween(today, installment.dueOn)
  if (days < 0) return 'overdue'
  return days <= MATERIAL_DUE_SOON_DAYS ? 'due_soon' : 'not_due'
}

export function summarizeMaterialFinance(contracts: readonly MaterialContractFacts[], today: string): MaterialFinanceTotals {
  let committed = new Decimal(0)
  let paid = new Decimal(0)
  let pending = new Decimal(0)
  let overdue = new Decimal(0)
  let invoiced = new Decimal(0)
  for (const contract of contracts) {
    committed = committed.plus(contract.total)
    invoiced = invoiced.plus(contract.invoiced)
    for (const installment of contract.installments) {
      paid = paid.plus(installment.paid)
      pending = pending.plus(installment.pending)
      if (installmentDueStatus(installment, today) === 'overdue') {
        overdue = overdue.plus(Decimal.max(0, new Decimal(installment.amount).minus(installment.paid)))
      }
    }
  }
  return {
    committed: money(committed),
    paid: money(paid),
    pending: money(pending),
    remaining: money(committed.minus(paid)),
    overdue: money(overdue),
    invoiced: money(invoiced),
    paidWithoutInvoice: money(Decimal.max(0, paid.minus(invoiced))),
  }
}
```

Lưu ý: `paidWithoutInvoice` tính trên từng contract hay tổng? Spec mục 10 định nghĩa trên số tổng (`max(0, đã chi − đã nhận hóa đơn)`). Giữ đúng như code trên, tính trên tổng của tập hợp được gom.

`shared/schemas/costs/material-finance.ts`:

```ts
import Decimal from 'decimal.js'
import { z } from 'zod'
import { workflowCurrencySchema, workflowMoneySchema, workflowUuidSchema } from './cost-workflow'
import type { MaterialFinanceTotals } from '../../utils/material-finance-summary'

const uuid = workflowUuidSchema
const version = z.number().int().nonnegative()
const date = z.string().date()
const positiveMoney = workflowMoneySchema.refine(value => new Decimal(value).greaterThan(0), 'Must be positive')
const reason = z.string().trim().min(1).max(1000)
const uniqueBy = <T>(values: T[], identity: (value: T) => string) => new Set(values.map(identity)).size === values.length

export const materialInstallmentInputSchema = z.object({
  installmentKey: uuid,
  name: z.string().trim().min(1).max(200),
  amount: positiveMoney,
  dueOn: date,
  isAdvance: z.boolean(),
}).strict()

const installments = z.array(materialInstallmentInputSchema).min(1).max(50)
  .refine(values => uniqueBy(values, value => value.installmentKey), 'Duplicate installment key')

interface BalancedInput {
  subtotal: string
  vatAmount: string
  total: string
  installments: Array<{ amount: string }>
}

function balanced(value: BalancedInput, context: z.RefinementCtx) {
  if (!new Decimal(value.subtotal).plus(value.vatAmount).equals(value.total)) {
    context.addIssue({ code: 'custom', path: ['total'], message: 'CONTRACT_TOTAL_MISMATCH' })
  }
  const sum = value.installments.reduce((acc, item) => acc.plus(item.amount), new Decimal(0))
  if (!sum.equals(value.total)) {
    context.addIssue({ code: 'custom', path: ['installments'], message: 'INSTALLMENT_TOTAL_MISMATCH' })
  }
}

const contractMoney = {
  subtotal: positiveMoney,
  vatAmount: workflowMoneySchema,
  total: positiveMoney,
  varianceReason: reason.nullable(),
  installments,
}

export const recordMaterialContractInputSchema = z.object({
  expectedOrderVersion: version,
  contractNo: z.string().trim().min(1).max(100),
  signedOn: date,
  contractFileId: uuid,
  signedQuotationFileId: uuid,
  ...contractMoney,
}).strict().superRefine(balanced)

export const amendMaterialContractInputSchema = z.object({
  expectedVersion: version,
  amendmentFileId: uuid,
  reason,
  ...contractMoney,
}).strict().superRefine(balanced)

export const recordMaterialInvoiceInputSchema = z.object({
  invoiceSymbol: z.string().trim().min(1).max(20),
  invoiceNo: z.string().trim().min(1).max(50),
  issuedOn: date,
  subtotal: positiveMoney,
  vatAmount: workflowMoneySchema,
  total: positiveMoney,
  fileId: uuid,
  lines: z.array(z.object({
    proposalLineId: uuid,
    invoiceMaterialName: z.string().trim().min(1).max(300),
  }).strict()).max(1000),
}).strict().superRefine((value, context) => {
  if (!new Decimal(value.subtotal).plus(value.vatAmount).equals(value.total)) {
    context.addIssue({ code: 'custom', path: ['total'], message: 'INVOICE_TOTAL_MISMATCH' })
  }
  if (!uniqueBy(value.lines, line => line.proposalLineId)) {
    context.addIssue({ code: 'custom', path: ['lines'], message: 'Duplicate invoice line' })
  }
})

export const voidMaterialInvoiceInputSchema = z.object({ expectedVersion: version, reason }).strict()

const requestBody = {
  amount: positiveMoney,
  invoiceIds: z.array(uuid).max(50).refine(values => new Set(values).size === values.length, 'Duplicate invoice'),
  note: z.string().trim().max(1000).transform(value => value || null).nullable(),
}

export const createPaymentRequestInputSchema = z.object({ installmentKey: uuid, ...requestBody }).strict()
export const resubmitPaymentRequestInputSchema = z.object({ expectedVersion: version, ...requestBody }).strict()
export const cancelPaymentRequestInputSchema = z.object({ expectedVersion: version, reason }).strict()
export const decidePaymentRequestInputSchema = z.object({
  expectedVersion: version,
  decision: z.enum(['approve', 'return']),
  reason: reason.optional(),
}).strict().superRefine((value, context) => {
  if (value.decision === 'return' && value.reason === undefined) {
    context.addIssue({ code: 'custom', path: ['reason'], message: 'A return requires a reason' })
  }
})
export const recordMaterialPaymentInputSchema = z.object({
  expectedVersion: version,
  paidOn: date,
  bankReference: z.string().trim().min(1).max(100),
  proofFileId: uuid,
}).strict()

export const materialFinanceTotalsSchema = z.object({
  committed: workflowMoneySchema,
  paid: workflowMoneySchema,
  pending: workflowMoneySchema,
  remaining: z.string().regex(/^-?(?:0|[1-9]\d{0,15})\.\d{4}$/),
  overdue: workflowMoneySchema,
  invoiced: workflowMoneySchema,
  paidWithoutInvoice: workflowMoneySchema,
}).strict() satisfies z.ZodType<MaterialFinanceTotals>

export const installmentDueStatusSchema = z.enum(['settled', 'overdue', 'due_soon', 'not_due'])

export const materialInstallmentViewSchema = materialInstallmentInputSchema.extend({
  seq: z.number().int().positive(),
  paid: workflowMoneySchema,
  pending: workflowMoneySchema,
  remaining: workflowMoneySchema,
  dueStatus: installmentDueStatusSchema,
}).strict()

export const materialContractVersionViewSchema = z.object({
  versionNo: z.number().int().positive(),
  kind: z.enum(['original', 'amendment']),
  subtotal: workflowMoneySchema,
  vatAmount: workflowMoneySchema,
  total: workflowMoneySchema,
  orderSubtotalSnapshot: workflowMoneySchema,
  varianceReason: z.string().nullable(),
  contractFileId: uuid,
  signedQuotationFileId: uuid.nullable(),
  reason: z.string().nullable(),
  recordedBy: uuid,
  recordedAt: z.string().datetime({ offset: true }),
}).strict()

export const materialContractViewSchema = z.object({
  id: uuid,
  orderId: uuid,
  projectId: uuid,
  supplierId: uuid,
  supplierName: z.string().min(1),
  currencyCode: workflowCurrencySchema,
  contractNo: z.string().min(1),
  signedOn: date,
  currentVersionNo: z.number().int().positive(),
  version,
  versions: z.array(materialContractVersionViewSchema).min(1),
  installments: z.array(materialInstallmentViewSchema).min(1),
  totals: materialFinanceTotalsSchema,
}).strict()

export const materialInvoiceViewSchema = z.object({
  id: uuid,
  contractId: uuid,
  invoiceSymbol: z.string().min(1),
  invoiceNo: z.string().min(1),
  issuedOn: date,
  subtotal: workflowMoneySchema,
  vatAmount: workflowMoneySchema,
  total: workflowMoneySchema,
  fileId: uuid,
  state: z.enum(['recorded', 'voided']),
  voidReason: z.string().nullable(),
  version,
  lines: z.array(z.object({ proposalLineId: uuid, invoiceMaterialName: z.string().min(1) }).strict()),
}).strict()

export const paymentRequestStateSchema = z.enum(['submitted', 'returned', 'approved', 'paid', 'cancelled'])

export const materialPaymentRequestViewSchema = z.object({
  id: uuid,
  contractId: uuid,
  installmentKey: uuid,
  amount: workflowMoneySchema,
  note: z.string().nullable(),
  state: paymentRequestStateSchema,
  revisionNo: z.number().int().positive(),
  submittedBy: uuid,
  submittedAt: z.string().datetime({ offset: true }),
  invoiceIds: z.array(uuid),
  cancelReason: z.string().nullable(),
  version,
  decisions: z.array(z.object({
    revisionNo: z.number().int().positive(),
    decision: z.enum(['approve', 'return']),
    reason: z.string().nullable(),
    decidedBy: uuid,
    decidedAt: z.string().datetime({ offset: true }),
  }).strict()),
  payment: z.object({
    id: uuid,
    paidOn: date,
    bankReference: z.string().min(1),
    proofFileId: uuid,
    paidBy: uuid,
    recordedAt: z.string().datetime({ offset: true }),
  }).strict().nullable(),
}).strict()

const contractRow = z.object({
  contractId: uuid,
  projectId: uuid,
  orderId: uuid,
  supplierId: uuid,
  supplierName: z.string().min(1),
  contractNo: z.string().min(1),
  totals: materialFinanceTotalsSchema,
}).strict()

export const projectMaterialFinanceSummarySchema = z.object({
  projectId: uuid,
  currencyCode: workflowCurrencySchema,
  totals: materialFinanceTotalsSchema,
  contracts: z.array(contractRow),
}).strict()

export const supplierMaterialFinanceSchema = z.array(z.object({
  supplierId: uuid,
  supplierName: z.string().min(1),
  currencyCode: workflowCurrencySchema,
  totals: materialFinanceTotalsSchema,
  contracts: z.array(contractRow),
}).strict())

const inboxBase = { projectId: uuid, projectName: z.string().min(1), orderId: uuid, supplierName: z.string().min(1) }
export const materialFinanceInboxSchema = z.object({
  awaitingContract: z.array(z.object({ ...inboxBase, orderSubtotal: workflowMoneySchema, createdAt: z.string().datetime({ offset: true }) }).strict()),
  dueInstallments: z.array(z.object({
    ...inboxBase, contractId: uuid, installmentKey: uuid, name: z.string().min(1),
    dueOn: date, remaining: workflowMoneySchema, dueStatus: z.enum(['overdue', 'due_soon']),
  }).strict()),
  returnedRequests: z.array(z.object({ ...inboxBase, contractId: uuid, requestId: uuid, amount: workflowMoneySchema, reason: z.string().min(1) }).strict()),
  pendingApproval: z.array(z.object({ ...inboxBase, contractId: uuid, requestId: uuid, amount: workflowMoneySchema, submittedBy: uuid, submittedAt: z.string().datetime({ offset: true }) }).strict()),
  approvedAwaitingPayment: z.array(z.object({ ...inboxBase, contractId: uuid, requestId: uuid, amount: workflowMoneySchema, approvedAt: z.string().datetime({ offset: true }) }).strict()),
}).strict()

export const appNotificationEventKindSchema = z.enum([
  'material.order.created',
  'material.contract.recorded',
  'material.contract.amended',
  'material.installment.due_soon',
  'material.installment.overdue',
  'material.payment.submitted',
  'material.payment.returned',
  'material.payment.paid',
])

export const appNotificationViewSchema = z.object({
  id: uuid,
  eventKind: appNotificationEventKindSchema,
  projectId: uuid.nullable(),
  linkPath: z.string().startsWith('/'),
  payload: z.record(z.string(), z.union([z.string(), z.number(), z.null()])),
  createdAt: z.string().datetime({ offset: true }),
  readAt: z.string().datetime({ offset: true }).nullable(),
}).strict()

export const appNotificationPageSchema = z.object({
  items: z.array(appNotificationViewSchema),
  nextCursor: z.string().datetime({ offset: true }).nullable(),
}).strict()

export const materialFinanceCommandResultSchema = z.object({
  resourceId: uuid,
  version,
  replayed: z.boolean(),
}).strict()

const project = '/api/companies/:companyId/projects/:projectId/material-procurement'
export const materialFinanceEndpointManifest = {
  readContract: { method: 'GET', path: project + '/orders/:orderId/contract' },
  recordContract: { method: 'POST', path: project + '/orders/:orderId/contract' },
  amendContract: { method: 'POST', path: project + '/contracts/:contractId/amendments' },
  listInvoices: { method: 'GET', path: project + '/contracts/:contractId/invoices' },
  recordInvoice: { method: 'POST', path: project + '/contracts/:contractId/invoices' },
  voidInvoice: { method: 'POST', path: project + '/invoices/:invoiceId/void' },
  listPaymentRequests: { method: 'GET', path: project + '/contracts/:contractId/payment-requests' },
  createPaymentRequest: { method: 'POST', path: project + '/contracts/:contractId/payment-requests' },
  resubmitPaymentRequest: { method: 'PATCH', path: project + '/payment-requests/:requestId' },
  cancelPaymentRequest: { method: 'POST', path: project + '/payment-requests/:requestId/cancel' },
  decidePaymentRequest: { method: 'POST', path: project + '/payment-requests/:requestId/decisions' },
  recordPayment: { method: 'POST', path: project + '/payment-requests/:requestId/payment' },
  projectSummary: { method: 'GET', path: project + '/material-finance/summary' },
  inbox: { method: 'GET', path: '/api/companies/:companyId/material-finance/inbox' },
  suppliers: { method: 'GET', path: '/api/companies/:companyId/material-finance/suppliers' },
  listNotifications: { method: 'GET', path: '/api/companies/:companyId/notifications' },
  readNotification: { method: 'POST', path: '/api/companies/:companyId/notifications/:notificationId/read' },
} as const

export type MaterialInstallmentInput = z.infer<typeof materialInstallmentInputSchema>
export type RecordMaterialContractInput = z.infer<typeof recordMaterialContractInputSchema>
export type AmendMaterialContractInput = z.infer<typeof amendMaterialContractInputSchema>
export type RecordMaterialInvoiceInput = z.infer<typeof recordMaterialInvoiceInputSchema>
export type VoidMaterialInvoiceInput = z.infer<typeof voidMaterialInvoiceInputSchema>
export type CreatePaymentRequestInput = z.infer<typeof createPaymentRequestInputSchema>
export type ResubmitPaymentRequestInput = z.infer<typeof resubmitPaymentRequestInputSchema>
export type CancelPaymentRequestInput = z.infer<typeof cancelPaymentRequestInputSchema>
export type DecidePaymentRequestInput = z.infer<typeof decidePaymentRequestInputSchema>
export type RecordMaterialPaymentInput = z.infer<typeof recordMaterialPaymentInputSchema>
export type MaterialInstallmentView = z.infer<typeof materialInstallmentViewSchema>
export type MaterialContractView = z.infer<typeof materialContractViewSchema>
export type MaterialInvoiceView = z.infer<typeof materialInvoiceViewSchema>
export type MaterialPaymentRequestView = z.infer<typeof materialPaymentRequestViewSchema>
export type ProjectMaterialFinanceSummary = z.infer<typeof projectMaterialFinanceSummarySchema>
export type SupplierMaterialFinance = z.infer<typeof supplierMaterialFinanceSchema>
export type MaterialFinanceInbox = z.infer<typeof materialFinanceInboxSchema>
export type AppNotificationView = z.infer<typeof appNotificationViewSchema>
export type AppNotificationPage = z.infer<typeof appNotificationPageSchema>
export type MaterialFinanceCommandResult = z.infer<typeof materialFinanceCommandResultSchema>
export interface MaterialFinanceCommand { idempotencyKey: string }

export interface MaterialFinanceRepository {
  readContract(projectId: string, orderId: string): Promise<MaterialContractView | null>
  recordContract(projectId: string, orderId: string, input: RecordMaterialContractInput, command: MaterialFinanceCommand): Promise<MaterialFinanceCommandResult>
  amendContract(projectId: string, contractId: string, input: AmendMaterialContractInput, command: MaterialFinanceCommand): Promise<MaterialFinanceCommandResult>
  listInvoices(projectId: string, contractId: string): Promise<MaterialInvoiceView[]>
  recordInvoice(projectId: string, contractId: string, input: RecordMaterialInvoiceInput, command: MaterialFinanceCommand): Promise<MaterialFinanceCommandResult>
  voidInvoice(projectId: string, invoiceId: string, input: VoidMaterialInvoiceInput, command: MaterialFinanceCommand): Promise<MaterialFinanceCommandResult>
  listPaymentRequests(projectId: string, contractId: string): Promise<MaterialPaymentRequestView[]>
  createPaymentRequest(projectId: string, contractId: string, input: CreatePaymentRequestInput, command: MaterialFinanceCommand): Promise<MaterialFinanceCommandResult>
  resubmitPaymentRequest(projectId: string, requestId: string, input: ResubmitPaymentRequestInput, command: MaterialFinanceCommand): Promise<MaterialFinanceCommandResult>
  cancelPaymentRequest(projectId: string, requestId: string, input: CancelPaymentRequestInput, command: MaterialFinanceCommand): Promise<MaterialFinanceCommandResult>
  decidePaymentRequest(projectId: string, requestId: string, input: DecidePaymentRequestInput, command: MaterialFinanceCommand): Promise<MaterialFinanceCommandResult>
  recordPayment(projectId: string, requestId: string, input: RecordMaterialPaymentInput, command: MaterialFinanceCommand): Promise<MaterialFinanceCommandResult>
  projectSummary(projectId: string): Promise<ProjectMaterialFinanceSummary>
  inbox(projectId?: string): Promise<MaterialFinanceInbox>
  suppliers(): Promise<SupplierMaterialFinance>
  listNotifications(cursor?: string): Promise<AppNotificationPage>
  readNotification(notificationId: string, command: MaterialFinanceCommand): Promise<MaterialFinanceCommandResult>
}
```

Trong `shared/schemas/costs/material-procurement.ts`:
- Xóa `commitMaterialContractInputSchema`, type `CommitMaterialContractInput`, `recordContract` khỏi manifest và interface `MaterialProcurementRepository`, xóa `payments` khỏi manifest.
- Xóa `contractId`, `authorizationId`, `installmentId` khỏi `materialCommandResultSchema`.
- Thay hai trường của `materialOrderViewSchema`:

```ts
  contract: z.object({
    id: workflowUuidSchema,
    contractNo: z.string().min(1).max(100),
    signedOn: z.string().date(),
    currentVersionNo: z.number().int().positive(),
    total: workflowMoneySchema.nullable(),
  }).strict().nullable(),
  cash: z.object({
    committed: workflowMoneySchema,
    paid: workflowMoneySchema,
    pending: workflowMoneySchema,
    remaining: workflowMoneySchema,
  }).strict().nullable(),
```

Chạy `rg -n "recordContract|commitMaterialContract|grossPaid|availableToPay|authorizationId" app server shared tests` và sửa mọi chỗ còn tham chiếu. `MaterialOrderCreatePanel.vue` đang đọc `order.contract` để hiện badge, nên giữ điều kiện `order.contract !== null`.

Trong `shared/constants/permissions.ts`, thêm sau `'material.contract.record',`:

```ts
  'material.payment.request',
  'material.payment.approve',
  'material.payment.execute',
  'material.finance.read',
```

- [ ] **Step 5: Viết migration nền**

`supabase/migrations/20261015090000_c1_material_finance_foundation.sql`. Viết đầy đủ theo khung sau. Các bảng con lặp lại đúng mẫu RLS và trigger lịch sử.

```sql
set local lock_timeout = '5s';
set local statement_timeout = '90s';
select pg_catalog.pg_advisory_xact_lock(71842, 50);

insert into public.permissions(code, module, name, description) values
  ('material.payment.request', 'cost', 'Request material payments', 'Create, resubmit and cancel material payment requests'),
  ('material.payment.approve', 'cost', 'Approve material payments', 'Approve or return material payment requests'),
  ('material.payment.execute', 'cost', 'Execute material payments', 'Record bank transfers for approved material payment requests'),
  ('material.finance.read', 'cost', 'Read material finance', 'Read material contracts, invoices, payments and supplier balances')
on conflict (code) do nothing;

create table public.material_contracts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  project_id uuid not null,
  order_id uuid not null unique,
  supplier_id uuid not null,
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  contract_no text not null check (btrim(contract_no) = contract_no and contract_no <> '' and char_length(contract_no) <= 100),
  signed_on date not null,
  current_version_no integer not null default 1 check (current_version_no > 0),
  version bigint not null default 1 check (version > 0),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id, company_id, project_id),
  foreign key (order_id, tenant_id, company_id, project_id)
    references public.material_orders(id, tenant_id, company_id, project_id) on delete restrict
);

create table public.material_contract_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  project_id uuid not null,
  contract_id uuid not null,
  version_no integer not null check (version_no > 0),
  kind text not null check (kind in ('original','amendment')),
  subtotal numeric(20,4) not null check (subtotal > 0),
  vat_amount numeric(20,4) not null check (vat_amount >= 0),
  total numeric(20,4) not null check (total > 0 and total = subtotal + vat_amount),
  order_subtotal_snapshot numeric(20,4) not null check (order_subtotal_snapshot > 0),
  variance_reason text check (variance_reason is null or (btrim(variance_reason) <> '' and char_length(variance_reason) <= 1000)),
  contract_file_id uuid not null unique,
  signed_quotation_file_id uuid unique,
  reason text check (reason is null or (btrim(reason) <> '' and char_length(reason) <= 1000)),
  recorded_by uuid not null references auth.users(id) on delete restrict,
  recorded_at timestamptz not null default now(),
  unique (contract_id, version_no),
  unique (id, tenant_id, company_id, project_id),
  check ((subtotal = order_subtotal_snapshot) = (variance_reason is null)),
  check ((kind = 'original') = (signed_quotation_file_id is not null)),
  check ((kind = 'amendment') = (reason is not null)),
  foreign key (contract_id, tenant_id, company_id, project_id)
    references public.material_contracts(id, tenant_id, company_id, project_id) on delete restrict,
  foreign key (contract_file_id, tenant_id, company_id, project_id)
    references public.cost_evidence_files(id, tenant_id, company_id, project_id) on delete restrict,
  foreign key (signed_quotation_file_id, tenant_id, company_id, project_id)
    references public.cost_evidence_files(id, tenant_id, company_id, project_id) on delete restrict
);

create table public.material_contract_installments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  project_id uuid not null,
  contract_id uuid not null,
  contract_version_id uuid not null,
  seq integer not null check (seq > 0),
  installment_key uuid not null,
  name text not null check (btrim(name) = name and name <> '' and char_length(name) <= 200),
  amount numeric(20,4) not null check (amount > 0),
  due_on date not null,
  is_advance boolean not null,
  unique (contract_version_id, seq),
  unique (contract_version_id, installment_key),
  foreign key (contract_version_id, tenant_id, company_id, project_id)
    references public.material_contract_versions(id, tenant_id, company_id, project_id) on delete restrict,
  foreign key (contract_id, tenant_id, company_id, project_id)
    references public.material_contracts(id, tenant_id, company_id, project_id) on delete restrict
);

create table public.material_invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  project_id uuid not null,
  contract_id uuid not null,
  supplier_id uuid not null,
  invoice_symbol text not null check (btrim(invoice_symbol) = invoice_symbol and invoice_symbol <> '' and char_length(invoice_symbol) <= 20),
  invoice_no text not null check (btrim(invoice_no) = invoice_no and invoice_no <> '' and char_length(invoice_no) <= 50),
  issued_on date not null,
  subtotal numeric(20,4) not null check (subtotal > 0),
  vat_amount numeric(20,4) not null check (vat_amount >= 0),
  total numeric(20,4) not null check (total = subtotal + vat_amount),
  file_id uuid not null unique,
  state text not null default 'recorded' check (state in ('recorded','voided')),
  void_reason text,
  voided_by uuid references auth.users(id) on delete restrict,
  voided_at timestamptz,
  version bigint not null default 1 check (version > 0),
  recorded_by uuid not null references auth.users(id) on delete restrict,
  recorded_at timestamptz not null default now(),
  unique (id, tenant_id, company_id, project_id),
  check ((state = 'voided') = (void_reason is not null and voided_by is not null and voided_at is not null)),
  foreign key (contract_id, tenant_id, company_id, project_id)
    references public.material_contracts(id, tenant_id, company_id, project_id) on delete restrict,
  foreign key (file_id, tenant_id, company_id, project_id)
    references public.cost_evidence_files(id, tenant_id, company_id, project_id) on delete restrict
);
create unique index material_invoices_recorded_identity_idx
on public.material_invoices(company_id, supplier_id, invoice_symbol, invoice_no) where state = 'recorded';

create table public.material_invoice_lines (
  invoice_id uuid not null,
  tenant_id uuid not null,
  company_id uuid not null,
  project_id uuid not null,
  proposal_line_id uuid not null,
  invoice_material_name text not null check (btrim(invoice_material_name) = invoice_material_name and invoice_material_name <> '' and char_length(invoice_material_name) <= 300),
  primary key (invoice_id, proposal_line_id),
  foreign key (invoice_id, tenant_id, company_id, project_id)
    references public.material_invoices(id, tenant_id, company_id, project_id) on delete restrict
);

create table public.material_payment_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  project_id uuid not null,
  contract_id uuid not null,
  installment_key uuid not null,
  amount numeric(20,4) not null check (amount > 0),
  note text check (note is null or char_length(note) <= 1000),
  state text not null default 'submitted' check (state in ('submitted','returned','approved','paid','cancelled')),
  revision_no integer not null default 1 check (revision_no > 0),
  submitted_by uuid not null references auth.users(id) on delete restrict,
  submitted_at timestamptz not null default now(),
  cancel_reason text check (cancel_reason is null or (btrim(cancel_reason) <> '' and char_length(cancel_reason) <= 1000)),
  version bigint not null default 1 check (version > 0),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id, company_id, project_id),
  check ((state = 'cancelled') = (cancel_reason is not null)),
  foreign key (contract_id, tenant_id, company_id, project_id)
    references public.material_contracts(id, tenant_id, company_id, project_id) on delete restrict
);
create index material_payment_requests_capacity_idx
on public.material_payment_requests(contract_id, installment_key, state);

create table public.material_payment_request_revisions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  project_id uuid not null,
  payment_request_id uuid not null,
  revision_no integer not null check (revision_no > 0),
  installment_key uuid not null,
  amount numeric(20,4) not null check (amount > 0),
  invoice_ids uuid[] not null,
  note text,
  submitted_by uuid not null references auth.users(id) on delete restrict,
  submitted_at timestamptz not null default now(),
  unique (payment_request_id, revision_no),
  foreign key (payment_request_id, tenant_id, company_id, project_id)
    references public.material_payment_requests(id, tenant_id, company_id, project_id) on delete restrict
);

create table public.material_payment_request_invoices (
  payment_request_id uuid not null,
  invoice_id uuid not null,
  tenant_id uuid not null,
  company_id uuid not null,
  project_id uuid not null,
  primary key (payment_request_id, invoice_id),
  foreign key (payment_request_id, tenant_id, company_id, project_id)
    references public.material_payment_requests(id, tenant_id, company_id, project_id) on delete cascade,
  foreign key (invoice_id, tenant_id, company_id, project_id)
    references public.material_invoices(id, tenant_id, company_id, project_id) on delete restrict
);

create table public.material_payment_decisions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  project_id uuid not null,
  payment_request_id uuid not null,
  request_revision_no integer not null,
  decision text not null check (decision in ('approve','return')),
  reason text check (reason is null or (btrim(reason) <> '' and char_length(reason) <= 1000)),
  decided_by uuid not null references auth.users(id) on delete restrict,
  decided_at timestamptz not null default now(),
  unique (payment_request_id, request_revision_no),
  check ((decision = 'return') = (reason is not null)),
  foreign key (payment_request_id, tenant_id, company_id, project_id)
    references public.material_payment_requests(id, tenant_id, company_id, project_id) on delete restrict
);

create table public.material_payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  project_id uuid not null,
  payment_request_id uuid not null unique,
  contract_id uuid not null,
  installment_key uuid not null,
  amount numeric(20,4) not null check (amount > 0),
  paid_on date not null,
  bank_reference text not null check (btrim(bank_reference) = bank_reference and bank_reference <> '' and char_length(bank_reference) <= 100),
  proof_file_id uuid not null unique,
  proof_sha256 text not null check (proof_sha256 ~ '^[a-f0-9]{64}$'),
  paid_by uuid not null references auth.users(id) on delete restrict,
  recorded_at timestamptz not null default now(),
  unique (company_id, proof_sha256),
  foreign key (payment_request_id, tenant_id, company_id, project_id)
    references public.material_payment_requests(id, tenant_id, company_id, project_id) on delete restrict,
  foreign key (contract_id, tenant_id, company_id, project_id)
    references public.material_contracts(id, tenant_id, company_id, project_id) on delete restrict,
  foreign key (proof_file_id, tenant_id, company_id, project_id)
    references public.cost_evidence_files(id, tenant_id, company_id, project_id) on delete restrict
);
create index material_payments_contract_idx on public.material_payments(contract_id, installment_key);

create table public.app_notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  project_id uuid,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  event_kind text not null check (event_kind in (
    'material.order.created','material.contract.recorded','material.contract.amended',
    'material.installment.due_soon','material.installment.overdue',
    'material.payment.submitted','material.payment.returned','material.payment.paid')),
  source_type text not null check (source_type in ('material_order','material_contract','material_installment','material_payment_request')),
  source_id uuid not null,
  link_path text not null check (link_path like '/%' and char_length(link_path) <= 500),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  dedupe_key text not null check (char_length(dedupe_key) <= 200),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique (recipient_id, dedupe_key)
);
create index app_notifications_recipient_idx on public.app_notifications(recipient_id, company_id, created_at desc, id);

-- Re-point the empty signed-order flag table from cost_workflow_contracts to material_contracts.
do $$
declare v_constraint text;
begin
  if exists (select 1 from public.material_order_contracts) then
    raise exception using errcode = 'P0001', message = 'C1_MATERIAL_ORDER_CONTRACTS_NOT_EMPTY';
  end if;
  select constraint_row.conname into v_constraint
  from pg_catalog.pg_constraint as constraint_row
  where constraint_row.conrelid = 'public.material_order_contracts'::regclass
    and constraint_row.confrelid = 'public.cost_workflow_contracts'::regclass
    and constraint_row.contype = 'f';
  if v_constraint is null then
    raise exception using errcode = 'P0001', message = 'C1_MATERIAL_ORDER_CONTRACTS_BASELINE_MISSING';
  end if;
  execute format('alter table public.material_order_contracts drop constraint %I', v_constraint);
end;
$$;
alter table public.material_order_contracts
  add constraint material_order_contracts_material_contract_fkey
  foreign key (contract_id, tenant_id, company_id, project_id)
  references public.material_contracts(id, tenant_id, company_id, project_id) on delete restrict;

-- Evidence scope: contract-level target.
alter table public.material_evidence_scopes add column contract_id uuid;
alter table public.material_evidence_scopes drop constraint material_evidence_scopes_target_kind_check;
alter table public.material_evidence_scopes add constraint material_evidence_scopes_target_kind_check
  check (target_kind in ('material_proposal','material_order','material_contract'));
alter table public.material_evidence_scopes drop constraint material_evidence_scopes_role_target_check;
alter table public.material_evidence_scopes add constraint material_evidence_scopes_role_target_check check (
  (target_kind = 'material_proposal' and evidence_role = 'unsigned_quotation')
  or (target_kind = 'material_order' and evidence_role in ('signed_quotation','signed_contract'))
  or (target_kind = 'material_contract' and evidence_role in ('contract_amendment','invoice','payment_proof') and contract_id is not null)
);
alter table public.material_evidence_scopes
  add constraint material_evidence_scopes_contract_fkey
  foreign key (contract_id, tenant_id, company_id, project_id)
  references public.material_contracts(id, tenant_id, company_id, project_id) on delete restrict;
```

Trước khi viết hai câu `drop constraint ... target_kind_check`, kiểm tra tên constraint thực tế trong `20261008125023` và `20261008140741`. Nếu `target_kind` check là check inline không có tên thì dùng một khối `do $$` tra `pg_constraint` theo `pg_get_constraintdef(...) like '%target_kind%'`, cùng cách như đoạn re-point ở trên, và raise `C1_MATERIAL_EVIDENCE_SCOPE_BASELINE_MISSING` nếu không tìm thấy đúng một constraint.

Tiếp theo, với **mỗi** bảng mới (`material_contracts`, `material_contract_versions`, `material_contract_installments`, `material_invoices`, `material_invoice_lines`, `material_payment_requests`, `material_payment_request_revisions`, `material_payment_request_invoices`, `material_payment_decisions`, `material_payments`):

```sql
alter table public.<table> enable row level security;
alter table public.<table> force row level security;
revoke all on public.<table> from public,anon,authenticated,service_role;
grant select on public.<table> to authenticated;
create policy <table>_finance_read on public.<table>
for select to authenticated using (private.c1_material_can_read_finance(tenant_id, company_id));
```

Riêng `material_contracts` dùng thêm một policy cho người chỉ được thấy trạng thái:

```sql
create policy material_contracts_status_read on public.material_contracts
for select to authenticated using (private.c1_material_can_see_contract_status(tenant_id, company_id, project_id, order_id));
```

Trigger lịch sử bất biến (`private.c1_material_retain_history()`) gắn cho `material_contract_versions`, `material_contract_installments`, `material_invoice_lines`, `material_payment_request_revisions`, `material_payment_decisions`, `material_payments`.

Bảng `app_notifications`:

```sql
alter table public.app_notifications enable row level security;
alter table public.app_notifications force row level security;
revoke all on public.app_notifications from public,anon,authenticated,service_role;
grant select on public.app_notifications to authenticated;
create policy app_notifications_recipient_read on public.app_notifications
for select to authenticated using (recipient_id = auth.uid());
```

Helper:

```sql
create function private.c1_material_can_read_finance(t uuid, c uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.c1_material_actor_has_permission(t, c, 'material.read')
    and (
      private.c1_material_actor_has_permission(t, c, 'material.finance.read')
      or private.c1_material_actor_has_permission(t, c, 'material.contract.record')
      or private.c1_material_actor_has_permission(t, c, 'material.payment.request')
      or private.c1_material_actor_has_permission(t, c, 'material.payment.approve')
      or private.c1_material_actor_has_permission(t, c, 'material.payment.execute')
    );
$$;

create function private.c1_material_can_see_contract_status(t uuid, c uuid, p uuid, target_order_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.c1_material_can_read_finance(t, c)
    or private.c1_material_can_read_order(t, c, p)
    or exists (
      select 1
      from public.material_orders as material_order
      join public.material_proposals as proposal
        on proposal.id = material_order.proposal_id
       and proposal.tenant_id = material_order.tenant_id
       and proposal.company_id = material_order.company_id
       and proposal.project_id = material_order.project_id
      where material_order.id = target_order_id
        and material_order.tenant_id = t and material_order.company_id = c and material_order.project_id = p
        and proposal.created_by = auth.uid()
        and private.c1_material_actor_has_permission(t, c, 'material.read')
    );
$$;

create function private.c1_material_installment_usage(target_contract_id uuid)
returns table(installment_key uuid, paid numeric, pending numeric)
language sql stable security definer set search_path = '' as $$
  select keys.installment_key,
    coalesce((select sum(payment.amount) from public.material_payments as payment
      where payment.contract_id = target_contract_id and payment.installment_key = keys.installment_key), 0),
    coalesce((select sum(request.amount) from public.material_payment_requests as request
      where request.contract_id = target_contract_id and request.installment_key = keys.installment_key
        and request.state in ('submitted','approved')), 0)
  from (
    select distinct request.installment_key from public.material_payment_requests as request
    where request.contract_id = target_contract_id
  ) as keys;
$$;

create function private.c1_material_notify_users(
  t uuid, c uuid, p uuid, user_ids uuid[], event_kind text, source_type text, source_id uuid,
  link_path text, payload jsonb, dedupe_key text
) returns void language sql volatile security definer set search_path = '' as $$
  insert into public.app_notifications(
    tenant_id, company_id, project_id, recipient_id, event_kind, source_type, source_id, link_path, payload, dedupe_key
  )
  select t, c, p, recipient.user_id, event_kind, source_type, source_id, link_path, payload, dedupe_key
  from (select distinct unnest(user_ids) as user_id) as recipient
  where recipient.user_id is not null
    and recipient.user_id is distinct from auth.uid()
    and private.c1_workflow_user_has_permission(t, c, recipient.user_id, 'material.read')
  on conflict (recipient_id, dedupe_key) do nothing;
$$;

create function private.c1_material_notify_permission(
  t uuid, c uuid, p uuid, permission text, event_kind text, source_type text, source_id uuid,
  link_path text, payload jsonb, dedupe_key text
) returns void language sql volatile security definer set search_path = '' as $$
  select private.c1_material_notify_users(
    t, c, p,
    array(
      select membership.user_id from public.company_memberships as membership
      where membership.tenant_id = t and membership.company_id = c and membership.is_active
        and private.c1_workflow_user_has_permission(t, c, membership.user_id, permission)
    ),
    event_kind, source_type, source_id, link_path, payload, dedupe_key
  );
$$;

create function private.c1_material_notify_order_created()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_supplier_name text;
begin
  select party.display_name into v_supplier_name from public.business_parties as party
  where party.id = new.supplier_id and party.tenant_id = new.tenant_id and party.company_id = new.company_id;
  perform private.c1_material_notify_permission(
    new.tenant_id, new.company_id, new.project_id, 'material.contract.record',
    'material.order.created', 'material_order', new.id,
    '/materials/' || new.project_id::text || '/orders/' || new.id::text,
    jsonb_build_object('supplierName', v_supplier_name),
    'order:' || new.id::text
  );
  return new;
end;
$$;
create trigger material_order_created_notify after insert on public.material_orders
for each row execute function private.c1_material_notify_order_created();
```

Kết thúc migration:

```sql
revoke all on function
  private.c1_material_can_read_finance(uuid,uuid),
  private.c1_material_can_see_contract_status(uuid,uuid,uuid,uuid),
  private.c1_material_installment_usage(uuid),
  private.c1_material_notify_users(uuid,uuid,uuid,uuid[],text,text,uuid,text,jsonb,text),
  private.c1_material_notify_permission(uuid,uuid,uuid,text,text,text,uuid,text,jsonb,text),
  private.c1_material_notify_order_created()
from public,anon,authenticated,service_role;
-- RLS policies call these as authenticated (see 20261010072624).
grant execute on function
  private.c1_material_can_read_finance(uuid,uuid),
  private.c1_material_can_see_contract_status(uuid,uuid,uuid,uuid)
to authenticated;

notify pgrst, 'reload schema';
```

Không cần grant cho các hàm notify: chúng chỉ được gọi từ RPC hoặc trigger `security definer`.

- [ ] **Step 6: Viết pgTAP nền và guard spec**

`supabase/tests/database/c1/c1_material_finance_foundation.test.sql`, theo cấu trúc của `c1_material_procurement_security.test.sql` (dùng `begin; ... select plan(n); ... select * from finish(); rollback;`). Fixture dùng UUID tiền tố `c125` (chưa dùng). Các case:
- 11 bảng mới (10 bảng `material_*` + `app_notifications`) đều forces RLS, cấm DML trực tiếp với `authenticated`, cấm mọi quyền với `anon`.
- `material_order_contracts` có FK sang `material_contracts` và không còn FK sang `cost_workflow_contracts`.
- Ghi trực tiếp (với quyền `postgres` trong test) một `material_contract_versions` có `subtotal <> order_subtotal_snapshot` mà không có `variance_reason`: vi phạm check.
- `total <> subtotal + vat_amount`: vi phạm check.
- `material_evidence_scopes` chấp nhận `material_contract/invoice` có `contract_id`, từ chối `material_contract/signed_contract`.
- Tạo một `material_orders` mới: user có `material.contract.record` nhận đúng 1 thông báo `material.order.created`; người tạo đơn (mua hàng) không nhận. Chèn lần hai cùng `dedupe_key` qua `c1_material_notify_users`: vẫn 1 dòng.
- Authenticated user A chỉ select thấy thông báo của A.
- Engineer (người tạo phiếu, không có quyền tài chính) select `material_contracts` của đơn thuộc phiếu của mình: thấy dòng. Select `material_contract_versions`: 0 dòng.
- Mua hàng (`material.order.manage`) select `material_contract_versions`: 0 dòng.

`tests/unit/config/c1-material-finance-foundation-guard.spec.ts` đọc file migration và kiểm:

```ts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../../..')
const sql = readFileSync(resolve(root, 'supabase/migrations/20261015090000_c1_material_finance_foundation.sql'), 'utf8')
  .replace(/\s+/gu, ' ').toLowerCase()

describe('material finance foundation migration', () => {
  it('takes its reserved advisory lock and reloads PostgREST', () => {
    expect(sql).toContain('pg_advisory_xact_lock(71842, 50)')
    expect(sql.trim().endsWith("notify pgrst, 'reload schema';")).toBe(true)
  })
  it('forces RLS and revokes direct DML on every new table', () => {
    for (const table of [
      'material_contracts', 'material_contract_versions', 'material_contract_installments', 'material_invoices',
      'material_invoice_lines', 'material_payment_requests', 'material_payment_request_revisions',
      'material_payment_request_invoices', 'material_payment_decisions', 'material_payments', 'app_notifications',
    ]) {
      expect(sql).toContain(`alter table public.${table} force row level security`)
      expect(sql).toContain(`revoke all on public.${table} from public,anon,authenticated,service_role`)
    }
  })
  it('re-points material_order_contracts only when empty', () => {
    expect(sql).toContain('c1_material_order_contracts_not_empty')
    expect(sql).toContain('references public.material_contracts(id, tenant_id, company_id, project_id)')
  })
  it('scopes notifications to the recipient and dedupes', () => {
    expect(sql).toContain('using (recipient_id = auth.uid())')
    expect(sql).toContain('unique (recipient_id, dedupe_key)')
    expect(sql).toContain('on conflict (recipient_id, dedupe_key) do nothing')
  })
})
```

Cập nhật guard spec cũ có pin danh sách bảng của `c1_material_procurement_security.test.sql` (nếu có) chỉ khi chúng fail vì thay đổi trong task này.

- [ ] **Step 7: Viết khung server và HTTP repository**

`server/features/costs/material-finance/service.ts`:

```ts
import type { PermissionCode } from '../../../../shared/constants/permissions'
import { workflowUuidSchema } from '../../../../shared/schemas/costs/cost-workflow'
import { AppApiError } from '../../../utils/api-error'
import type { MaterialProcurementContext } from '../material-procurement/service'

export type MaterialFinanceContext = MaterialProcurementContext

export const financeReadPermissions: readonly PermissionCode[] = [
  'material.finance.read', 'material.contract.record', 'material.payment.request',
  'material.payment.approve', 'material.payment.execute',
]

export function requirePermission(context: MaterialFinanceContext, permission: PermissionCode): void {
  if (!context.permissions.includes('material.read') || !context.permissions.includes(permission)) {
    throw new AppApiError(403, 'PERMISSION_DENIED', 'Bạn không có quyền thực hiện thao tác này.')
  }
}

export function requireFinanceRead(context: MaterialFinanceContext): void {
  if (!context.permissions.includes('material.read')
    || !financeReadPermissions.some(permission => context.permissions.includes(permission))) {
    throw new AppApiError(403, 'PERMISSION_DENIED', 'Bạn không có quyền thực hiện thao tác này.')
  }
}

export function parse<T>(schema: { parse(value: unknown): T }, value: unknown): T {
  try {
    return schema.parse(value)
  }
  catch {
    throw new AppApiError(400, 'INPUT_INVALID', 'Dữ liệu yêu cầu không hợp lệ.')
  }
}

export const id = (value: string) => parse(workflowUuidSchema, value)

// T1, T2, T3 each add their own interface slice and service class in separate files
// (contract-service.ts, payment-service.ts, finance-read-service.ts) so parallel tasks never edit the same file.
```

Quyết định cho chạy song song: T1, T2 và T3 mỗi task tạo bộ file riêng, không cùng sửa một file:
- T1: `contract-{service,repository,routes}.ts`.
- T2: `payment-{service,repository,routes}.ts`.
- T3: `finance-read-{service,repository,routes}.ts`, `reminders.ts`.

T0 chỉ tạo `service.ts` với helper dùng chung ở trên. `repository.ts`/`routes.ts` của T0 cũng chỉ là helper dùng chung:

`server/features/costs/material-finance/repository.ts`:

```ts
import type { z } from 'zod'
import { materialFinanceCommandResultSchema } from '../../../../shared/schemas/costs/material-finance'
import type { UserSupabaseClient } from '../../../utils/supabase-client'
import { workflowResponse } from '../workflow/cost-workflow.repository'
import type { MaterialFinanceContext } from './service'

interface RpcResult { data: unknown, error: unknown }
export interface MaterialFinanceRpcClient { rpc(name: string, args: Record<string, unknown>): Promise<RpcResult> }

export function rpcClient(client: UserSupabaseClient): MaterialFinanceRpcClient {
  return client as unknown as MaterialFinanceRpcClient
}

export async function financeCommand(
  client: MaterialFinanceRpcClient,
  context: MaterialFinanceContext,
  name: string,
  input: unknown,
  key: string,
  targets: Record<string, unknown>,
) {
  return workflowResponse(await client.rpc(name, {
    target_company_id: context.companyId,
    ...targets,
    target_input: input,
    target_idempotency_key: key,
    target_request_id: context.requestId,
  }), materialFinanceCommandResultSchema)
}

export async function financeRead<T>(
  client: MaterialFinanceRpcClient,
  context: MaterialFinanceContext,
  name: string,
  schema: z.ZodType<T>,
  targets: Record<string, unknown> = {},
) {
  return workflowResponse(await client.rpc(name, { target_company_id: context.companyId, ...targets }), schema)
}
```

`server/features/costs/material-finance/routes.ts`:

```ts
import type { H3Event } from 'h3'
import { getHeader, getRouterParam, readBody } from 'h3'
import { z } from 'zod'
import { AppApiError } from '../../../utils/api-error'

const uuid = z.string().uuid()

export function invalid(): never {
  throw new AppApiError(400, 'INPUT_INVALID', 'Dữ liệu yêu cầu không hợp lệ.')
}
export function param(event: H3Event, name: string) {
  const parsed = uuid.safeParse(getRouterParam(event, name))
  return parsed.success ? parsed.data : invalid()
}
export function key(event: H3Event) {
  const parsed = uuid.safeParse(getHeader(event, 'idempotency-key'))
  return parsed.success ? parsed.data : invalid()
}
export async function body<T>(event: H3Event, schema: z.ZodType<T>) {
  const parsed = schema.safeParse(await readBody(event))
  return parsed.success ? parsed.data : invalid()
}
```

`app/repositories/http/http-material-finance-repository.ts`: implement đủ `MaterialFinanceRepository` theo đúng mẫu `http-material-procurement-repository.ts`:
- `base()` dùng `/api/companies/:id`, `project(projectId, path)` dùng `/projects/:projectId/material-procurement`.
- `read` cho các GET. `inbox(projectId)` gửi query `?projectId=` khi có. `listNotifications(cursor)` gửi `?cursor=` khi có.
- `command` cho các lệnh, PATCH cho `resubmitPaymentRequest`, POST cho các lệnh còn lại. `readNotification` gửi body `{}` với idempotency key.
- `readContract` dùng schema `materialContractViewSchema.nullable()`.

`app/repositories/material-finance.contracts.ts`:

```ts
export type { MaterialFinanceCommand, MaterialFinanceRepository } from '../../shared/schemas/costs/material-finance'
```

Đăng ký `materialFinance: MaterialFinanceRepository` trong `app/repositories/contracts.ts`. Thêm `'materialFinance'` vào danh sách `Omit` của `PrototypeRepositoryRegistry`. Trong `app/plugins/repositories.client.ts`: `materialFinance: createHttpMaterialFinanceRepository({ companyId: financeCompanyId, client })`.

Trong `http-material-procurement-repository.ts`, xóa dòng `recordContract` và hàm `unsupported` (thành dead code).

- [ ] **Step 8: Test HTTP repository**

`tests/unit/repositories/http-material-finance-repository.spec.ts`, theo mẫu `http-material-procurement-repository.spec.ts`. Ít nhất các case:
- `recordContract` POST tới `/api/companies/<c>/projects/<p>/material-procurement/orders/<o>/contract` với header idempotency key.
- `resubmitPaymentRequest` dùng PATCH.
- `inbox()` không có query, `inbox(projectId)` có `?projectId=`.
- `readContract` chấp nhận `null`.
- `companyId` thiếu thì ném `ACTIVE_COMPANY_REQUIRED`.

- [ ] **Step 9: Chạy test**

Run: `pnpm exec vitest run tests/unit/shared/material-finance.spec.ts tests/unit/shared/material-finance-summary.spec.ts tests/unit/repositories/http-material-finance-repository.spec.ts tests/unit/repositories/http-material-procurement-repository.spec.ts tests/unit/server/material-orders.spec.ts tests/unit/shared/material-procurement.spec.ts tests/unit/config/c1-material-finance-foundation-guard.spec.ts`
Expected: PASS.

Run: `pnpm typecheck` và `pnpm lint`
Expected: không có lỗi mới so với baseline của `0c226cdd`. Ghi baseline trước khi sửa bằng cách chạy hai lệnh này ở Step 1.

pgTAP chỉ chạy trên Cloud DEV khi có phép ở T8. Ở đây chỉ review cú pháp và guard spec.

- [ ] **Step 10: Commit và merge vào nhánh tích hợp**

```bash
git add supabase/migrations/20261015090000_c1_material_finance_foundation.sql supabase/tests/database/c1/c1_material_finance_foundation.test.sql shared app server tests
git commit -m "feat(materials): add A4/A5 finance foundation schema and contracts"
git checkout feat/materials-a4-a5 && git merge --no-ff feat/materials-a4-a5-t0
```

Sau T0, `reviewer` rà diff trước khi mở T1–T7.

---

### Task 1: Backend A4 — hợp đồng và phụ lục

Song song sau T0. Implementer: `implementer` (sonnet).

**Files:**
- Create: `supabase/migrations/20261015090100_c1_material_contract_commands.sql`
- Create: `server/features/costs/material-finance/contract-{service,repository,routes}.ts`
- Create: `server/api/companies/[companyId]/projects/[projectId]/material-procurement/orders/[orderId]/contract.get.ts`, `contract.post.ts`, `.../contracts/[contractId]/amendments.post.ts`
- Test: `tests/unit/server/material-contracts.spec.ts`, `tests/unit/config/c1-material-contract-commands-guard.spec.ts`, `supabase/tests/database/c1/c1_material_contracts.test.sql`

**Interfaces:**
- Consumes: bảng và helper của T0; `recordMaterialContractInputSchema`, `amendMaterialContractInputSchema`, `materialContractViewSchema`, `summarizeMaterialFinance`, `installmentDueStatus`, `vietnamToday`; `financeCommand`, `financeRead`, `requirePermission`, `requireFinanceRead`, `parse`, `id`, `param`, `key`, `body`.
- Produces:
  - SQL: `public.c1_material_read_contract(target_company_id uuid, target_project_id uuid, target_id uuid) returns jsonb` (target_id là order id; trả `null` khi chưa có hợp đồng). JSON facts gồm:
    - `{ id, orderId, projectId, supplierId, supplierName, currencyCode, contractNo, signedOn, currentVersionNo, version, invoiced, versions: [...camelCase của version view], installments: [{ installmentKey, seq, name, amount, dueOn, isAdvance, paid, pending }] }`
  - SQL: `public.c1_material_record_contract(target_company_id, target_project_id, target_id /*order*/, target_input, target_idempotency_key, target_request_id) returns jsonb`
  - SQL: `public.c1_material_amend_contract(target_company_id, target_project_id, target_id /*contract*/, target_input, target_idempotency_key, target_request_id) returns jsonb`
  - SQL: `create or replace private.c1_material_order_json(...)`, thay `contract`/`cash` theo schema mới.
  - TS: `MaterialContractService` với `readContract(context, projectId, orderId)`, `recordContract(context, projectId, orderId, value, key)`, `amendContract(context, projectId, contractId, value, key)`; `createMaterialContractRoutes(dependencies)`.

- [ ] **Step 1: Viết unit test service (đỏ)**

`tests/unit/server/material-contracts.spec.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import type { PermissionCode } from '../../../shared/constants/permissions'
import { MaterialContractService, type MaterialContractDataRepository } from '../../../server/features/costs/material-finance/contract-service'

const ids = {
  project: '20000000-0000-4000-8000-000000000001',
  order: '20000000-0000-4000-8000-000000000002',
  contract: '20000000-0000-4000-8000-000000000003',
  key: '20000000-0000-4000-8000-000000000004',
  file1: '20000000-0000-4000-8000-000000000005',
  file2: '20000000-0000-4000-8000-000000000006',
  inst1: '20000000-0000-4000-8000-000000000007',
  user: '20000000-0000-4000-8000-000000000008',
}
const ctx = (permissions: PermissionCode[]) => ({
  actorId: ids.user, tenantId: ids.user, companyId: ids.user, requestId: ids.key, permissions,
})
const input = {
  expectedOrderVersion: 1, contractNo: 'HD-01', signedOn: '2026-10-10',
  subtotal: '100.0000', vatAmount: '10.0000', total: '110.0000', varianceReason: null,
  contractFileId: ids.file1, signedQuotationFileId: ids.file2,
  installments: [{ installmentKey: ids.inst1, name: 'Thanh toán 100%', amount: '110.0000', dueOn: '2026-10-10', isAdvance: false }],
}
const facts = {
  id: ids.contract, orderId: ids.order, projectId: ids.project, supplierId: ids.user, supplierName: 'NCC A',
  currencyCode: 'VND', contractNo: 'HD-01', signedOn: '2026-10-10', currentVersionNo: 1, version: 1, invoiced: '0.0000',
  versions: [{
    versionNo: 1, kind: 'original', subtotal: '100.0000', vatAmount: '10.0000', total: '110.0000',
    orderSubtotalSnapshot: '100.0000', varianceReason: null, contractFileId: ids.file1, signedQuotationFileId: ids.file2,
    reason: null, recordedBy: ids.user, recordedAt: '2026-10-10T01:00:00+00:00',
  }],
  installments: [{ installmentKey: ids.inst1, seq: 1, name: 'Thanh toán 100%', amount: '110.0000', dueOn: '2026-10-10', isAdvance: false, paid: '10.0000', pending: '0.0000' }],
}

function repo(overrides: Partial<MaterialContractDataRepository> = {}): MaterialContractDataRepository {
  return {
    readContractFacts: vi.fn(async () => facts),
    recordContract: vi.fn(async () => ({ resourceId: ids.contract, version: 1, replayed: false })),
    amendContract: vi.fn(async () => ({ resourceId: ids.contract, version: 2, replayed: false })),
    ...overrides,
  }
}

describe('material contract service', () => {
  it('denies recording without material.contract.record before calling the repository', async () => {
    const repository = repo()
    await expect(new MaterialContractService(repository).recordContract(ctx(['material.read', 'material.order.manage']), ids.project, ids.order, input, ids.key))
      .rejects.toMatchObject({ statusCode: 403 })
    expect(repository.recordContract).not.toHaveBeenCalled()
  })

  it('rejects unbalanced installments with 400 before calling the repository', async () => {
    const repository = repo()
    await expect(new MaterialContractService(repository).recordContract(
      ctx(['material.read', 'material.contract.record']), ids.project, ids.order,
      { ...input, installments: [{ ...input.installments[0], amount: '100.0000' }] }, ids.key,
    )).rejects.toMatchObject({ statusCode: 400 })
    expect(repository.recordContract).not.toHaveBeenCalled()
  })

  it('computes totals and due status from facts using today in Vietnam', async () => {
    const service = new MaterialContractService(repo(), () => new Date('2026-10-14T18:00:00Z'))
    const view = await service.readContract(ctx(['material.read', 'material.finance.read']), ids.project, ids.order)
    expect(view?.totals).toMatchObject({ committed: '110.0000', paid: '10.0000', remaining: '100.0000', overdue: '100.0000' })
    expect(view?.installments[0]).toMatchObject({ remaining: '100.0000', dueStatus: 'overdue' })
  })

  it('returns null when the order has no contract', async () => {
    const service = new MaterialContractService(repo({ readContractFacts: vi.fn(async () => null) }))
    expect(await service.readContract(ctx(['material.read', 'material.finance.read']), ids.project, ids.order)).toBeNull()
  })

  it('denies contract detail to a buyer without finance permissions', async () => {
    await expect(new MaterialContractService(repo()).readContract(ctx(['material.read', 'material.order.manage']), ids.project, ids.order))
      .rejects.toMatchObject({ statusCode: 403 })
  })
})
```

Ghi chú: `2026-10-14T18:00:00Z` là ngày 15/10 tại VN, nên hạn 10/10 đã quá hạn.

- [ ] **Step 2: Chạy để xác nhận đỏ**

Run: `pnpm exec vitest run tests/unit/server/material-contracts.spec.ts`
Expected: FAIL, không tìm thấy module `contract-service`.

- [ ] **Step 3: Viết service, repository, routes**

`server/features/costs/material-finance/contract-service.ts`:

```ts
import Decimal from 'decimal.js'
import { z } from 'zod'
import {
  amendMaterialContractInputSchema,
  materialContractViewSchema,
  recordMaterialContractInputSchema,
  type AmendMaterialContractInput,
  type MaterialContractView,
  type MaterialFinanceCommandResult,
  type RecordMaterialContractInput,
} from '../../../../shared/schemas/costs/material-finance'
import { installmentDueStatus, summarizeMaterialFinance, vietnamToday } from '../../../../shared/utils/material-finance-summary'
import { id, parse, requireFinanceRead, requirePermission, type MaterialFinanceContext } from './service'

export const materialContractFactsSchema = materialContractViewSchema
  .omit({ installments: true, totals: true })
  .extend({
    invoiced: z.string(),
    installments: z.array(z.object({
      installmentKey: z.string().uuid(), seq: z.number().int().positive(), name: z.string().min(1),
      amount: z.string(), dueOn: z.string().date(), isAdvance: z.boolean(), paid: z.string(), pending: z.string(),
    }).strict()).min(1),
  }).strict()
export type MaterialContractFacts = z.infer<typeof materialContractFactsSchema>

export interface MaterialContractDataRepository {
  readContractFacts(context: MaterialFinanceContext, projectId: string, orderId: string): Promise<MaterialContractFacts | null>
  recordContract(context: MaterialFinanceContext, projectId: string, orderId: string, input: RecordMaterialContractInput, key: string): Promise<MaterialFinanceCommandResult>
  amendContract(context: MaterialFinanceContext, projectId: string, contractId: string, input: AmendMaterialContractInput, key: string): Promise<MaterialFinanceCommandResult>
}

export function contractViewFromFacts(facts: MaterialContractFacts, today: string): MaterialContractView {
  const { invoiced, ...rest } = facts
  return materialContractViewSchema.parse({
    ...rest,
    installments: facts.installments.map(installment => ({
      ...installment,
      remaining: Decimal.max(0, new Decimal(installment.amount).minus(installment.paid).minus(installment.pending)).toFixed(4),
      dueStatus: installmentDueStatus(installment, today),
    })),
    totals: summarizeMaterialFinance([{ total: facts.versions.find(v => v.versionNo === facts.currentVersionNo)!.total, invoiced, installments: facts.installments }], today),
  })
}

export class MaterialContractService {
  constructor(
    private readonly repository: MaterialContractDataRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async readContract(context: MaterialFinanceContext, projectId: string, orderId: string) {
    requireFinanceRead(context)
    const facts = await this.repository.readContractFacts(context, id(projectId), id(orderId))
    return facts ? contractViewFromFacts(facts, vietnamToday(this.now())) : null
  }

  async recordContract(context: MaterialFinanceContext, projectId: string, orderId: string, value: unknown, key: string) {
    requirePermission(context, 'material.contract.record')
    return this.repository.recordContract(context, id(projectId), id(orderId), parse(recordMaterialContractInputSchema, value), id(key))
  }

  async amendContract(context: MaterialFinanceContext, projectId: string, contractId: string, value: unknown, key: string) {
    requirePermission(context, 'material.contract.record')
    return this.repository.amendContract(context, id(projectId), id(contractId), parse(amendMaterialContractInputSchema, value), id(key))
  }
}
```

`remaining` của từng đợt = amount − paid − pending, nghĩa là phần còn đề nghị được. Đây là ngữ nghĩa UI cần khi lập đề nghị. Totals cấp hợp đồng dùng `committed − paid` theo spec mục 10.

`contract-repository.ts`: implement `MaterialContractDataRepository`, dùng `financeRead(client, context, 'c1_material_read_contract', materialContractFactsSchema.nullable(), { target_project_id, target_id: orderId })` và `financeCommand` với `c1_material_record_contract` (`target_id: orderId`) và `c1_material_amend_contract` (`target_id: contractId`).

`contract-routes.ts`: `createMaterialContractRoutes({ resolveContext, service? })` theo mẫu `createMaterialProcurementRoutes`, có ba handler `readContract`, `recordContract`, `amendContract`, cộng `createSupabaseMaterialContractRoutes(event)` dùng `c1RequestContext`.

Route files, ví dụ `contract.post.ts`:

```ts
import { createSupabaseMaterialContractRoutes } from '../../../../../../../../features/costs/material-finance/contract-routes'

export default defineEventHandler(event => runApiRoute(event, () => createSupabaseMaterialContractRoutes(event).recordContract(event)))
```

Đếm đúng số `../` theo độ sâu thư mục, so với `orders/[orderId]/cancellations.post.ts`.

- [ ] **Step 4: Chạy unit test**

Run: `pnpm exec vitest run tests/unit/server/material-contracts.spec.ts`
Expected: PASS.

- [ ] **Step 5: Viết pgTAP (đỏ trên lý thuyết, chạy ở T8)**

`supabase/tests/database/c1/c1_material_contracts.test.sql`, fixture tiền tố `c126`. Các case, mỗi case một assertion có nhãn:
1. Kế toán ghi hợp đồng cho đơn `active`: trả `{resourceId, version: 1, replayed: false}`.
   - Có 1 `material_contracts`, 1 version `original`, các installments đúng.
   - Có 1 dòng `material_order_contracts`.
   - `material_proposal` hiện `signedQuantity` bằng số lượng của đơn.
2. Gọi lại cùng key, cùng payload: `replayed = true`, không thêm dòng. Cùng key, payload khác: `IDEMPOTENCY_CONFLICT`.
3. Ghi lần hai cho cùng đơn với key khác: `CONTRACT_EXISTS`.
4. Đơn `cancelled`: `ORDER_NOT_ACTIVE` (Review Focus 5). Đơn đã có hợp đồng, mua hàng gọi `c1_material_cancel_order`: lỗi (hành vi có sẵn, `VERSION_CONFLICT`).
5. `subtotal` khác tổng đơn mà `varianceReason` null: `VARIANCE_REASON_REQUIRED`. Có lý do thì thành công.
6. File hợp đồng chưa finalized, sai scope, sai role hoặc đã gắn vào version khác: `EVIDENCE_INVALID`.
7. Mua hàng gọi `record_contract`: `PERMISSION_DENIED`.
8. Thông báo `material.contract.recorded`:
   - Gửi tới user có `material.finance.read`, người tạo đơn (mua hàng) và người tạo phiếu (kỹ sư), mỗi người 1 dòng.
   - Kế toán tự ghi thì không nhận.
9. Phụ lục:
   - Có đợt đã chi 30/50 mà lịch mới giảm đợt đó xuống 20: `AMENDMENT_BELOW_COMMITTED`.
   - Bỏ đợt có pending > 0: `AMENDMENT_BELOW_COMMITTED`.
   - Bỏ đợt có paid = pending = 0: thành công, `current_version_no = 2`.
   - Tổng mới < tổng hóa đơn `recorded`: `INVOICE_TOTAL_EXCEEDED`.
10. Phụ lục sai `expectedVersion`: `VERSION_CONFLICT`. Thành công thì phát `material.contract.amended` với `dedupe_key = 'contract:<id>:v2'`.
11. `c1_material_read_order`:
    - Với kế toán: `contract.total` khác null, `cash.committed` bằng tổng.
    - Với mua hàng: `contract.total` null, `cash` null.
    - Đơn chưa có hợp đồng: `contract` null.

- [ ] **Step 6: Viết migration lệnh hợp đồng**

`supabase/migrations/20261015090100_c1_material_contract_commands.sql`, N = 51. Viết `private.c1_material_record_contract` theo đúng cấu trúc `private.c1_material_cancel_order` (file `20261008140823`), theo thứ tự sau:

```sql
create function private.c1_material_record_contract(
  target_company_id uuid, target_project_id uuid, target_id uuid,
  target_input jsonb, target_idempotency_key uuid, target_request_id uuid
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_context jsonb;
  v_tenant_id uuid;
  v_actor_id uuid := auth.uid();
  v_hash text;
  v_receipt public.cost_command_receipts%rowtype;
  v_order public.material_orders%rowtype;
  v_contract public.material_contracts%rowtype;
  v_version_id uuid;
  v_subtotal numeric(20,4);
  v_vat numeric(20,4);
  v_total numeric(20,4);
  v_order_subtotal numeric(20,4);
  v_variance text;
  v_proposal_creator uuid;
  v_installment jsonb;
  v_seq integer := 0;
  v_sum numeric(20,4) := 0;
begin
  v_context := private.c1_material_context(target_company_id, 'material.contract.record');
  v_tenant_id := (v_context->>'tenantId')::uuid;
  if (private.c1_material_require_project(v_tenant_id, target_company_id, target_project_id)).operational_state = 'completed' then
    raise exception using errcode = 'P0001', message = 'PROJECT_COMPLETED';
  end if;
  perform private.c1_workflow_lock_actor(v_tenant_id, target_company_id, 'material.contract.record');
  perform private.c1_workflow_require_keys(
    target_input,
    array['expectedOrderVersion','contractNo','signedOn','subtotal','vatAmount','total','varianceReason','contractFileId','signedQuotationFileId','installments'],
    array['expectedOrderVersion','contractNo','signedOn','subtotal','vatAmount','total','varianceReason','contractFileId','signedQuotationFileId','installments']
  );

  -- Lock order then proposal lines in the same order as c1_material_cancel_order to avoid deadlocks.
  select material_order.* into v_order from public.material_orders as material_order
  where material_order.id = target_id and material_order.tenant_id = v_tenant_id
    and material_order.company_id = target_company_id and material_order.project_id = target_project_id;
  if not found then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;
  perform proposal.id from public.material_proposals as proposal
  where proposal.id = v_order.proposal_id and proposal.tenant_id = v_order.tenant_id
    and proposal.company_id = v_order.company_id and proposal.project_id = v_order.project_id
  for update;
  perform line.id from public.material_proposal_lines as line
  where line.proposal_id = v_order.proposal_id and line.tenant_id = v_order.tenant_id
    and line.company_id = v_order.company_id and line.project_id = v_order.project_id
  order by line.id for update;
  select material_order.* into v_order from public.material_orders as material_order
  where material_order.id = target_id for update of material_order;

  v_hash := private.c1_workflow_hash(target_project_id, target_id, target_input);
  v_receipt := private.c1_workflow_receipt(v_tenant_id, target_company_id, 'material.record_contract', target_idempotency_key, v_hash);
  if v_receipt.id is not null then
    select contract.* into v_contract from public.material_contracts as contract where contract.order_id = v_order.id;
    if not found or v_receipt.result_resource_id <> v_contract.id then
      raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_CONFLICT';
    end if;
    return private.c1_material_ack(v_contract.id, 1, true);
  end if;

  if v_order.version <> private.c1_material_version(target_input->'expectedOrderVersion') then
    raise exception using errcode = 'P0001', message = 'VERSION_CONFLICT';
  end if;
  if exists (select 1 from public.material_contracts as contract where contract.order_id = v_order.id) then
    raise exception using errcode = 'P0001', message = 'CONTRACT_EXISTS';
  end if;
  if v_order.state <> 'active' then
    raise exception using errcode = 'P0001', message = 'ORDER_NOT_ACTIVE';
  end if;

  v_subtotal := private.c1_workflow_money(target_input->'subtotal', 4);
  v_vat := private.c1_workflow_money(target_input->'vatAmount', 4);
  v_total := private.c1_workflow_money(target_input->'total', 4);
  if v_subtotal <= 0 or v_vat < 0 or v_total <> v_subtotal + v_vat then
    raise exception using errcode = 'P0001', message = 'CONTRACT_TOTAL_MISMATCH';
  end if;
  select sum(allocation.quantity * allocation.unit_price)::numeric(20,4) into v_order_subtotal
  from public.material_order_allocations as allocation where allocation.order_id = v_order.id;
  v_variance := nullif(btrim(coalesce(target_input->>'varianceReason','')), '');
  if v_subtotal <> v_order_subtotal and v_variance is null then
    raise exception using errcode = 'P0001', message = 'VARIANCE_REASON_REQUIRED';
  end if;
  if v_subtotal = v_order_subtotal then v_variance := null; end if;

  perform private.c1_material_require_contract_file(
    v_tenant_id, target_company_id, target_project_id, (target_input->>'contractFileId')::uuid,
    'material_order', 'signed_contract', v_order.id, null);
  perform private.c1_material_require_contract_file(
    v_tenant_id, target_company_id, target_project_id, (target_input->>'signedQuotationFileId')::uuid,
    'material_order', 'signed_quotation', v_order.id, null);

  insert into public.material_contracts(
    tenant_id, company_id, project_id, order_id, supplier_id, currency_code, contract_no, signed_on, created_by
  ) values (
    v_tenant_id, target_company_id, target_project_id, v_order.id, v_order.supplier_id, v_order.currency_code,
    private.c1_workflow_text(target_input->'contractNo'), (target_input->>'signedOn')::date, v_actor_id
  ) returning * into v_contract;
  if v_contract.signed_on > (now() at time zone 'Asia/Ho_Chi_Minh')::date then
    raise exception using errcode = 'P0001', message = 'INPUT_INVALID';
  end if;

  insert into public.material_contract_versions(
    tenant_id, company_id, project_id, contract_id, version_no, kind, subtotal, vat_amount, total,
    order_subtotal_snapshot, variance_reason, contract_file_id, signed_quotation_file_id, reason, recorded_by
  ) values (
    v_tenant_id, target_company_id, target_project_id, v_contract.id, 1, 'original', v_subtotal, v_vat, v_total,
    v_order_subtotal, v_variance, (target_input->>'contractFileId')::uuid, (target_input->>'signedQuotationFileId')::uuid, null, v_actor_id
  ) returning id into v_version_id;

  perform private.c1_material_insert_installments(v_contract, v_version_id, target_input->'installments', v_total);

  insert into public.material_order_contracts(order_id, tenant_id, company_id, project_id, contract_id, created_by)
  values (v_order.id, v_tenant_id, target_company_id, target_project_id, v_contract.id, v_actor_id);

  select proposal.created_by into v_proposal_creator from public.material_proposals as proposal where proposal.id = v_order.proposal_id;
  perform private.c1_material_notify_contract_saved(v_contract, v_order, v_proposal_creator, 1, v_total);

  insert into public.cost_command_receipts(
    tenant_id, company_id, actor_id, command_name, idempotency_key, request_hash, result_resource_id, result_version
  ) values (
    v_tenant_id, target_company_id, v_actor_id, 'material.record_contract', target_idempotency_key, v_hash, v_contract.id, 1
  );
  insert into public.audit_events(
    tenant_id, company_id, actor_id, action, resource_type, resource_id, request_id, after_summary
  ) values (
    v_tenant_id, target_company_id, v_actor_id, 'c1.material_contract.recorded', 'material_contract', v_contract.id::text,
    target_request_id, jsonb_build_object('projectId', target_project_id, 'orderId', v_order.id, 'total', v_total::text, 'versionNo', 1)
  );
  return private.c1_material_ack(v_contract.id, 1, false);
end;
$$;
```

Helper trong cùng migration:
- `private.c1_material_require_contract_file(t, c, p, file_id, target_kind, role, order_id uuid, contract_id uuid)`. Raise `EVIDENCE_INVALID` khi một trong các điều kiện sau sai:
  - Có `cost_evidence_files` với `id = file_id`, cùng scope và `status = 'finalized'`.
  - Có `material_evidence_scopes` với `evidence_file_id = file_id`, đúng `target_kind`, `evidence_role`, `order_id`/`contract_id`.
  - File chưa được dùng ở `material_contract_versions.contract_file_id`/`signed_quotation_file_id`, `material_invoices.file_id` hoặc `material_payments.proof_file_id`.
- `private.c1_material_insert_installments(contract material_contracts, version_id uuid, items jsonb, total numeric)`. Duyệt mảng theo thứ tự, `seq` tăng từ 1. Với mỗi phần tử:
  - Gọi `c1_workflow_require_keys(item, array['installmentKey','name','amount','dueOn','isAdvance'], same)`.
  - `amount` qua `c1_workflow_money(...,4)` và phải > 0.
  - `name` qua `c1_workflow_text` và ≤ 200 ký tự.
  - Cộng dồn vào tổng. Sau vòng lặp, tổng ≠ `total` thì raise `INSTALLMENT_TOTAL_MISMATCH`. Mảng rỗng hoặc quá 50 phần tử thì raise `INPUT_INVALID`.
  - Trùng `installmentKey` vi phạm unique index, trả về `INPUT_INVALID` bằng cách kiểm tra trước bằng `count(distinct)`.
- `private.c1_material_notify_contract_saved(contract, order, proposal_creator uuid, version_no int, total numeric)`:
  - `c1_material_notify_permission(..., 'material.finance.read', 'material.contract.recorded' hoặc 'material.contract.amended' khi version_no > 1, 'material_contract', contract.id, '/materials/'||project||'/orders/'||order.id, jsonb_build_object('supplierName', ..., 'contractNo', contract.contract_no, 'total', total::text, 'versionNo', version_no), 'contract:'||contract.id||':v'||version_no)`.
  - Sau đó `c1_material_notify_users(..., array[order.created_by, proposal_creator], cùng event, cùng dedupe_key)`.
  - Unique `(recipient_id, dedupe_key)` đảm bảo mỗi người chỉ nhận 1 dòng.

Kiểm tra `material_orders` có cột `created_by` (đọc `20261008125023`). Nếu không có thì lấy người tạo từ receipt `material.create_order` hoặc `audit_events` của `c1.material_order.created`. Ghi lại lựa chọn trong báo cáo task.

`private.c1_material_amend_contract`:
1. Mở đầu như trên với quyền `material.contract.record` và keys `['expectedVersion','subtotal','vatAmount','total','varianceReason','amendmentFileId','reason','installments']`.
2. Lock order rồi đến contract (`for update`). Kiểm tra receipt `material.amend_contract`, replay trả `ack(contract.id, contract.version, true)`.
3. `contract.version <> expectedVersion` thì raise `VERSION_CONFLICT`.
4. Tiền và lý do lệch giống `record`. Snapshot tổng đơn lấy lại từ allocations, vì đơn đã khóa nên không đổi.
5. File: `c1_material_require_contract_file(..., 'material_contract', 'contract_amendment', null, contract.id)`.
6. Kiểm tra phụ lục (Review Focus 1, spec 3.5 ý 3):
   - Với mỗi dòng của `private.c1_material_installment_usage(contract.id)` có `paid + pending > 0`, key phải có trong lịch mới với `amount >= paid + pending`. Nếu không thì raise `AMENDMENT_BELOW_COMMITTED`.
   - `total < sum(material_invoices.total where state = 'recorded')` thì raise `INVOICE_TOTAL_EXCEEDED`.
7. Ghi dữ liệu:
   - Insert version với `version_no = current_version_no + 1`, `kind = 'amendment'`, `reason`.
   - Gọi `c1_material_insert_installments`.
   - Update `material_contracts set current_version_no = +1, version = +1, updated_at = now()`.
8. Gọi `notify_contract_saved` với version mới, ghi receipt và audit `c1.material_contract.amended`. Trả `ack(contract.id, contract.version, false)`.

`private.c1_material_read_contract(target_company_id, target_project_id, target_id /*order*/)`:
- `c1_material_context(company, 'material.read')`, `c1_material_require_project`, `if not c1_material_can_read_finance(...) then PERMISSION_DENIED`.
- Trả `null` khi chưa có hợp đồng. Ngược lại trả JSON facts như phần Interfaces:
  - `versions` sắp theo `version_no`.
  - `installments` của phiên bản hiện hành, sắp theo `seq`, kèm `paid`/`pending` từ `c1_material_installment_usage` (left join, mặc định `'0.0000'`).
  - `invoiced` = tổng hóa đơn `recorded`.
  - Mọi số tiền dùng `to_char`/`::text` ra đúng 4 chữ số thập phân như `allocation.unit_price::text`.
- Cột `numeric(20,4)` cast `::text` đã cho đủ 4 chữ số. Riêng giá trị tính toán thì cast `::numeric(20,4)::text`.

`create or replace function private.c1_material_order_json(...)`: chép định nghĩa trong `20261008140823` (là định nghĩa hiện hành; kiểm tra lại bằng `rg -n "c1_material_order_json" supabase/migrations`) và thay đúng hai trường cuối:

```sql
    'contract', (
      select jsonb_build_object(
        'id', contract.id, 'contractNo', contract.contract_no, 'signedOn', contract.signed_on,
        'currentVersionNo', contract.current_version_no,
        'total', case when private.c1_material_can_read_finance(contract.tenant_id, contract.company_id)
          then current_version.total::text else null end)
      from public.material_contracts as contract
      join public.material_contract_versions as current_version
        on current_version.contract_id = contract.id and current_version.version_no = contract.current_version_no
      where contract.order_id = v_order.id),
    'cash', (
      select jsonb_build_object(
        'committed', current_version.total::text,
        'paid', coalesce(sum(usage.paid), 0)::numeric(20,4)::text,
        'pending', coalesce(sum(usage.pending), 0)::numeric(20,4)::text,
        'remaining', (current_version.total - coalesce(sum(usage.paid), 0))::numeric(20,4)::text)
      from public.material_contracts as contract
      join public.material_contract_versions as current_version
        on current_version.contract_id = contract.id and current_version.version_no = contract.current_version_no
      left join lateral private.c1_material_installment_usage(contract.id) as usage on true
      where contract.order_id = v_order.id
        and private.c1_material_can_read_finance(contract.tenant_id, contract.company_id)
      group by current_version.total)
```

Wrapper `public.c1_material_read_contract`, `public.c1_material_record_contract`, `public.c1_material_amend_contract` dùng đúng mẫu wrapper `public.c1_material_cancel_order`, cùng revoke/grant. Thêm `revoke all` cho mọi helper `private` mới.

- [ ] **Step 7: Guard spec**

`tests/unit/config/c1-material-contract-commands-guard.spec.ts` kiểm:
- Có `pg_advisory_xact_lock(71842, 51)`.
- Có `'material.record_contract'` và `'material.amend_contract'` ở cả `c1_workflow_receipt` và insert `cost_command_receipts`.
- Có `amendment_below_committed`, `variance_reason_required`, `order_not_active`, `contract_exists`.
- Có insert vào `material_order_contracts`.
- Grant execute chỉ cho ba wrapper `public.c1_material_*_contract`.
- Có nhãn các case pgTAP của Step 5, kiểm tra bằng `toContain` trên `c1_material_contracts.test.sql` như mẫu `c1-material-procurement-fix3-guard.spec.ts`.

- [ ] **Step 8: Chạy test và lint**

Run: `pnpm exec vitest run tests/unit/server/material-contracts.spec.ts tests/unit/config/c1-material-contract-commands-guard.spec.ts && pnpm typecheck && pnpm lint`
Expected: PASS, không có lỗi mới so với baseline.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/20261015090100_c1_material_contract_commands.sql supabase/tests/database/c1/c1_material_contracts.test.sql server/features/costs/material-finance/contract-*.ts "server/api/companies/[companyId]/projects/[projectId]/material-procurement" tests/unit/server/material-contracts.spec.ts tests/unit/config/c1-material-contract-commands-guard.spec.ts
git commit -m "feat(materials): record material contracts and amendments"
```

---

### Task 2: Backend A5 — hóa đơn, đề nghị chi, duyệt, ghi chi

Song song sau T0. Implementer: `implementer` → opus (nhiều ràng buộc tiền và đồng thời, sai là chi vượt).

**Files:**
- Create: `supabase/migrations/20261015090200_c1_material_payment_commands.sql`
- Create: `server/features/costs/material-finance/payment-{service,repository,routes}.ts`
- Create route: `.../material-procurement/contracts/[contractId]/invoices/index.get.ts`, `index.post.ts`; `.../invoices/[invoiceId]/void.post.ts`; `.../contracts/[contractId]/payment-requests/index.get.ts`, `index.post.ts`; `.../payment-requests/[requestId].patch.ts`; `.../payment-requests/[requestId]/cancel.post.ts`, `decisions.post.ts`, `payment.post.ts`
- Test: `tests/unit/server/material-payments.spec.ts`, `tests/unit/config/c1-material-payment-commands-guard.spec.ts`, `supabase/tests/database/c1/c1_material_payments.test.sql`

**Interfaces:**
- Consumes: T0 (bảng, `c1_material_installment_usage`, `c1_material_notify_*`, schema input/view).
- Produces:
  - SQL wrapper, mỗi cái có chữ ký `(target_company_id uuid, target_project_id uuid, target_id uuid, target_input jsonb, target_idempotency_key uuid, target_request_id uuid)`:
    - `c1_material_record_invoice` (target_id = contract)
    - `c1_material_void_invoice` (target_id = invoice)
    - `c1_material_create_payment_request` (target_id = contract)
    - `c1_material_resubmit_payment_request`, `c1_material_cancel_payment_request`, `c1_material_decide_payment_request`, `c1_material_record_payment` (target_id = request)
  - SQL đọc `(target_company_id, target_project_id, target_id /*contract*/)`: `c1_material_list_invoices`, `c1_material_list_payment_requests`.
  - TS: `MaterialPaymentService` với `listInvoices`, `recordInvoice`, `voidInvoice`, `listPaymentRequests`, `createPaymentRequest`, `resubmitPaymentRequest`, `cancelPaymentRequest`, `decidePaymentRequest`, `recordPayment`; `createMaterialPaymentRoutes`.

- [ ] **Step 1: Viết unit test service (đỏ)**

`tests/unit/server/material-payments.spec.ts`. Mẫu test giống T1, repository mock bằng `vi.fn`. Các case:

```ts
it.each([
  ['recordInvoice', 'material.contract.record'],
  ['voidInvoice', 'material.contract.record'],
  ['createPaymentRequest', 'material.payment.request'],
  ['resubmitPaymentRequest', 'material.payment.request'],
  ['cancelPaymentRequest', 'material.payment.request'],
  ['decidePaymentRequest', 'material.payment.approve'],
  ['recordPayment', 'material.payment.execute'],
] as const)('%s requires %s and material.read', async (method, permission) => {
  const repository = repo()
  const service = new MaterialPaymentService(repository)
  await expect(callWith(service, method, ctx(['material.read']))).rejects.toMatchObject({ statusCode: 403 })
  await expect(callWith(service, method, ctx([permission]))).rejects.toMatchObject({ statusCode: 403 })
  await expect(callWith(service, method, ctx(['material.read', permission]))).resolves.toMatchObject({ replayed: false })
})

it('rejects a return decision without reason as 400', async () => {
  const service = new MaterialPaymentService(repo())
  await expect(service.decidePaymentRequest(ctx(['material.read', 'material.payment.approve']), ids.project, ids.request,
    { expectedVersion: 1, decision: 'return' }, ids.key)).rejects.toMatchObject({ statusCode: 400 })
})

it('lists invoices and requests for finance readers only', async () => {
  const service = new MaterialPaymentService(repo())
  await expect(service.listPaymentRequests(ctx(['material.read', 'material.order.manage']), ids.project, ids.contract))
    .rejects.toMatchObject({ statusCode: 403 })
  await expect(service.listPaymentRequests(ctx(['material.read', 'material.payment.approve']), ids.project, ids.contract))
    .resolves.toEqual([])
})
```

`callWith` là helper trong file test, gọi phương thức tương ứng với input hợp lệ đã khai báo cho từng phương thức (đúng schema T0).

- [ ] **Step 2: Chạy để xác nhận đỏ**

Run: `pnpm exec vitest run tests/unit/server/material-payments.spec.ts`
Expected: FAIL, không tìm thấy module `payment-service`.

- [ ] **Step 3: Viết service, repository, routes**

`payment-service.ts`:
- Interface `MaterialPaymentDataRepository` có đúng 9 phương thức, chữ ký `(context, projectId, targetId[, input, key])`.
- Lớp `MaterialPaymentService`, mỗi phương thức: `requirePermission(context, <quyền ở bảng test>)`, hoặc `requireFinanceRead(context)` cho hai lệnh list; `parse(<schema T0>, value)`; `id(...)`; rồi gọi repository.
- `payment-repository.ts` dùng `financeCommand`/`financeRead` với tên RPC ở phần Interfaces. List trả `z.array(materialInvoiceViewSchema)` và `z.array(materialPaymentRequestViewSchema)`.
- `payment-routes.ts` và route files theo mẫu T1.

- [ ] **Step 4: Chạy unit test**

Run: `pnpm exec vitest run tests/unit/server/material-payments.spec.ts`
Expected: PASS.

- [ ] **Step 5: Viết pgTAP**

`supabase/tests/database/c1/c1_material_payments.test.sql`, fixture tiền tố `c127`. Hợp đồng tổng 110 gồm đợt A tạm ứng 33 (key A) và đợt B 77 (key B). Có các user: kế toán K1, kế toán K2, thủ quỹ Q (có cả `approve` và `execute`), user KQ có cả `request` và `approve`. Các case có nhãn:

1. Hóa đơn:
   - K1 ghi hóa đơn 110: thành công.
   - Ghi thêm hóa đơn 1: `INVOICE_TOTAL_EXCEEDED`.
   - Trùng (NCC, ký hiệu, số): `INVOICE_DUPLICATE`.
   - Dòng hóa đơn trỏ tới `proposal_line_id` không thuộc đơn: `INPUT_INVALID`.
   - Ghi hóa đơn tạo `material_supplier_names(material, supplier, 'invoice', name)` nếu chưa có. Ghi lại cùng tên không tạo thêm dòng.
2. Đề nghị cho đợt A (tạm ứng) không có hóa đơn: thành công, `state = 'submitted'`, phát `material.payment.submitted` cho Q và KQ.
3. Đề nghị cho đợt B không hóa đơn: `INVOICE_REQUIRED`. Có hóa đơn `recorded`: thành công.
4. Hai đề nghị đợt A: 20 rồi 14. Lần hai bị `INSTALLMENT_CAPACITY_EXCEEDED` vì 20 + 14 > 33.
5. Đồng thời: chạy hai `create_payment_request` cho cùng đợt bằng hai session `dblink` (nếu fixture Cloud có extension `dblink`). Nếu không có thì đánh dấu case này cho T8 chạy bằng script concurrency. Kết quả mong đợi: chỉ một đề nghị thành công.
6. KQ lập đề nghị, KQ tự duyệt: `SELF_DECISION_FORBIDDEN`. Q duyệt: `state = 'approved'`.
7. Q trả lại có lý do: `state = 'returned'`, phát `material.payment.returned` cho người gửi. Pending của đợt giảm tương ứng.
8. Review Focus 4: K1 lập, Q trả lại, K2 gửi lại (`submitted_by = K2`, `revision_no = 2`). K2 có thêm quyền approve thì K2 tự duyệt bị `SELF_DECISION_FORBIDDEN`, còn K1 (nếu có quyền approve) duyệt được.
9. Review Focus 1: đề nghị đợt C đang `returned`, phụ lục bỏ đợt C (`paid = pending = 0` nên được phép), gửi lại đề nghị: `INSTALLMENT_NOT_FOUND`.
10. Ghi chi:
    - Đề nghị chưa `approved`: `VERSION_CONFLICT`.
    - Người ghi chi trùng `submitted_by`: `SELF_DECISION_FORBIDDEN`.
    - File không phải `payment_proof` của hợp đồng: `EVIDENCE_INVALID`.
    - Thành công: `state = 'paid'`, có 1 dòng `material_payments` với `amount` bằng đề nghị, phát `material.payment.paid`.
11. Ủy nhiệm chi có sha256 đã dùng (file khác nhưng cùng hash trong công ty): `PROOF_ALREADY_USED`.
12. Hủy đề nghị `approved` có lý do: `cancelled`. Đề nghị `paid` không hủy được: `VERSION_CONFLICT`.
13. Hủy hóa đơn đang gắn với đề nghị chưa hủy: `INVOICE_IN_USE`. Hóa đơn chỉ gắn với đề nghị đã hủy: hủy được.
14. Idempotency: cùng key cùng payload thì `replayed`; cùng key payload khác thì `IDEMPOTENCY_CONFLICT`. Áp dụng cho create, decide và record_payment.
15. Mua hàng (`material.order.manage`) gọi bất kỳ lệnh nào: `PERMISSION_DENIED`. Select `material_payments`: 0 dòng.
16. Đợt đã chi đủ: tạo đề nghị mới cho đợt đó bị `INSTALLMENT_CAPACITY_EXCEEDED`.

- [ ] **Step 6: Viết migration lệnh chi**

`supabase/migrations/20261015090200_c1_material_payment_commands.sql`, N = 52. Mọi lệnh theo khung `c1_material_cancel_order`:
1. context và quyền
2. `require_project` (dự án `completed` thì `PROJECT_COMPLETED`)
3. `lock_actor`
4. `require_keys`
5. lock theo thứ tự **contract → payment_request**
6. receipt
7. version
8. ràng buộc
9. ghi dữ liệu
10. thông báo
11. receipt, audit, ack

Helper dùng chung trong migration:

```sql
create function private.c1_material_lock_contract(t uuid, c uuid, p uuid, target_contract_id uuid)
returns public.material_contracts language plpgsql volatile security definer set search_path = '' as $$
declare v_contract public.material_contracts%rowtype;
begin
  select contract.* into v_contract from public.material_contracts as contract
  where contract.id = target_contract_id and contract.tenant_id = t and contract.company_id = c and contract.project_id = p
  for update;
  if not found then raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND'; end if;
  return v_contract;
end;
$$;

create function private.c1_material_current_installment(target_contract public.material_contracts, target_key uuid)
returns public.material_contract_installments language plpgsql stable security definer set search_path = '' as $$
declare v_installment public.material_contract_installments%rowtype;
begin
  select installment.* into v_installment
  from public.material_contract_installments as installment
  join public.material_contract_versions as version_row on version_row.id = installment.contract_version_id
  where installment.contract_id = target_contract.id
    and version_row.version_no = target_contract.current_version_no
    and installment.installment_key = target_key;
  if not found then raise exception using errcode = 'P0001', message = 'INSTALLMENT_NOT_FOUND'; end if;
  return v_installment;
end;
$$;

-- Capacity check: excluding_request_id lets resubmit ignore its own previous amount (it is 'returned', so already excluded).
create function private.c1_material_require_capacity(
  target_contract public.material_contracts, target_key uuid, target_amount numeric, excluding_request_id uuid
) returns public.material_contract_installments language plpgsql stable security definer set search_path = '' as $$
declare
  v_installment public.material_contract_installments%rowtype;
  v_used numeric(20,4);
begin
  v_installment := private.c1_material_current_installment(target_contract, target_key);
  select coalesce(sum(payment.amount), 0) into v_used from public.material_payments as payment
  where payment.contract_id = target_contract.id and payment.installment_key = target_key;
  select v_used + coalesce(sum(request.amount), 0) into v_used from public.material_payment_requests as request
  where request.contract_id = target_contract.id and request.installment_key = target_key
    and request.state in ('submitted','approved')
    and request.id is distinct from excluding_request_id;
  if v_used + target_amount > v_installment.amount then
    raise exception using errcode = 'P0001', message = 'INSTALLMENT_CAPACITY_EXCEEDED';
  end if;
  return v_installment;
end;
$$;

create function private.c1_material_link_request_invoices(
  target_request public.material_payment_requests, target_invoice_ids jsonb, target_is_advance boolean
) returns uuid[] language plpgsql volatile security definer set search_path = '' as $$
declare v_ids uuid[];
begin
  if jsonb_typeof(target_invoice_ids) <> 'array' or jsonb_array_length(target_invoice_ids) > 50 then
    raise exception using errcode = 'P0001', message = 'INPUT_INVALID';
  end if;
  select coalesce(array_agg(distinct (value #>> '{}')::uuid order by (value #>> '{}')::uuid), '{}')
  into v_ids from jsonb_array_elements(target_invoice_ids) as value;
  if cardinality(v_ids) <> jsonb_array_length(target_invoice_ids) then
    raise exception using errcode = 'P0001', message = 'INPUT_INVALID';
  end if;
  if (select count(*) from public.material_invoices as invoice
      where invoice.id = any(v_ids) and invoice.contract_id = target_request.contract_id and invoice.state = 'recorded'
      ) <> cardinality(v_ids) then
    raise exception using errcode = 'P0001', message = 'INVOICE_NOT_RECORDED';
  end if;
  if not target_is_advance and cardinality(v_ids) = 0 then
    raise exception using errcode = 'P0001', message = 'INVOICE_REQUIRED';
  end if;
  delete from public.material_payment_request_invoices where payment_request_id = target_request.id;
  insert into public.material_payment_request_invoices(payment_request_id, invoice_id, tenant_id, company_id, project_id)
  select target_request.id, invoice_id, target_request.tenant_id, target_request.company_id, target_request.project_id
  from unnest(v_ids) as invoice_id;
  return v_ids;
end;
$$;
```

Quy tắc riêng của từng lệnh:

- **record_invoice** (quyền `material.contract.record`, keys `invoiceSymbol, invoiceNo, issuedOn, subtotal, vatAmount, total, fileId, lines`):
  1. Lock contract, kiểm tra receipt `material.record_invoice`.
  2. Kiểm tra tiền (tổng sai thì `INVOICE_TOTAL_MISMATCH`). `issued_on > hôm nay (VN)` thì `INPUT_INVALID`.
  3. `sum(recorded) + total > current_version.total` thì `INVOICE_TOTAL_EXCEEDED`.
  4. Kiểm tra trùng (NCC, ký hiệu, số) trước khi insert, nếu trùng thì `INVOICE_DUPLICATE`.
  5. File: `c1_material_require_contract_file(..., 'material_contract', 'invoice', null, contract.id)`, file này do T1 tạo. T2 chạy song song nên khai báo `create or replace` **không** được dùng. Thay vào đó T2 gọi theo tên; thứ tự timestamp T1 (090100) < T2 (090200) đảm bảo hàm đã có khi apply.
  6. Mỗi dòng có `proposal_line_id` phải thuộc `material_order_allocations` của đơn, nếu không thì `INPUT_INVALID`. Insert `material_invoice_lines`.
  7. Insert `material_supplier_names(tenant_id, company_id, material_id, supplier_id, document_kind, name, ...)` với `on conflict (material_id, supplier_id, document_kind, name) do nothing`. Đọc cột bắt buộc của bảng trong `20261008125023`, và `material_id` lấy từ revision snapshot của đơn.
  8. Receipt và audit `c1.material_invoice.recorded`.
- **void_invoice** (keys `expectedVersion, reason`):
  1. Lock contract (lấy `contract_id` từ hóa đơn trước), lock invoice.
  2. Version sai thì `VERSION_CONFLICT`. Hóa đơn đã `voided` thì `VERSION_CONFLICT`.
  3. Có `material_payment_request_invoices` nối tới request khác `cancelled` thì `INVOICE_IN_USE`.
  4. Update `state = 'voided'`, `void_*`, `version + 1`.
- **create_payment_request** (quyền `material.payment.request`, keys `installmentKey, amount, invoiceIds, note`):
  1. Lock contract, kiểm tra receipt.
  2. `v_installment := c1_material_require_capacity(contract, key, amount, null)`.
  3. Insert request (`submitted_by = created_by = auth.uid()`, `revision_no = 1`).
  4. `c1_material_link_request_invoices(request, invoiceIds, v_installment.is_advance)`.
  5. Insert revision 1.
  6. Notify permission `material.payment.approve`, event `material.payment.submitted`, source `material_payment_request`, link `/materials/<p>/orders/<order>`, payload `{supplierName, contractNo, amount}`, dedupe `pr:<id>:sub:1`.
- **resubmit_payment_request** (keys `expectedVersion, amount, invoiceIds, note`):
  1. Lock contract rồi request. `state <> 'returned'` hoặc version sai thì `VERSION_CONFLICT`.
  2. `c1_material_require_capacity(contract, request.installment_key, amount, request.id)`. Đợt đã bị phụ lục bỏ thì `INSTALLMENT_NOT_FOUND`.
  3. Update `amount`, `note`, `state = 'submitted'`, `revision_no + 1`, `submitted_by = auth.uid()`, `submitted_at = now()`, `version + 1`.
  4. Link lại hóa đơn, insert revision mới, notify `pr:<id>:sub:<rev>`.
- **cancel_payment_request** (keys `expectedVersion, reason`): chỉ cho các state `submitted | returned | approved`, ngược lại `VERSION_CONFLICT`. Update `cancelled`, `cancel_reason`.
- **decide_payment_request** (quyền `material.payment.approve`, keys `expectedVersion, decision, reason?`):
  1. `state <> 'submitted'` thì `VERSION_CONFLICT`. `auth.uid() = submitted_by` thì `SELF_DECISION_FORBIDDEN`.
  2. Insert decision theo `revision_no`.
  3. Approve thì `state = 'approved'`. Return thì `state = 'returned'` và notify users `[submitted_by]` với `material.payment.returned`, dedupe `pr:<id>:ret:<rev>`, payload có `reason`.
  4. `version + 1`.
- **record_payment** (quyền `material.payment.execute`, keys `expectedVersion, paidOn, bankReference, proofFileId`):
  1. `state <> 'approved'` thì `VERSION_CONFLICT`. `auth.uid() = submitted_by` thì `SELF_DECISION_FORBIDDEN`. `paid_on > hôm nay (VN)` thì `INPUT_INVALID`.
  2. File qua `c1_material_require_contract_file(..., 'material_contract', 'payment_proof', null, contract.id)`.
  3. Lấy `verified_sha256` của file. Đã có `material_payments` cùng `company_id` và cùng hash thì `PROOF_ALREADY_USED`.
  4. Kiểm tra lại capacity theo số đã chi, vì phụ lục có thể đã hạ đợt (`excluding_request_id = request.id`, cộng `request.amount`).
  5. Insert payment. Update request `paid`, `version + 1`.
  6. Notify `[submitted_by]` với `material.payment.paid`, dedupe `pr:<id>:paid`.

Hai lệnh đọc:
- `c1_material_list_invoices` trả mảng theo `materialInvoiceViewSchema`, sắp theo `issued_on desc, id`.
- `c1_material_list_payment_requests` trả mảng theo `materialPaymentRequestViewSchema`:
  - `invoiceIds` lấy từ bảng liên kết.
  - `decisions` sắp theo `revisionNo`.
  - `payment` lấy từ `material_payments` hoặc null. Timestamp dùng `to_jsonb(...)` để giữ offset.
  - Sắp theo `created_at desc, id`.
- Cả hai yêu cầu `c1_material_can_read_finance`.

Wrapper public, revoke và grant giống T1.

- [ ] **Step 7: Guard spec**

`tests/unit/config/c1-material-payment-commands-guard.spec.ts` kiểm:
- Lock 52.
- Các mã lỗi `installment_capacity_exceeded`, `invoice_required`, `self_decision_forbidden`, `proof_already_used`, `invoice_in_use`, `installment_not_found`, `invoice_total_exceeded`, `invoice_duplicate`.
- Hàm capacity có `for update` trên contract và chỉ tính `state in ('submitted','approved')`.
- Có các nhãn pgTAP của Step 5.

- [ ] **Step 8: Chạy test và lint**

Run: `pnpm exec vitest run tests/unit/server/material-payments.spec.ts tests/unit/config/c1-material-payment-commands-guard.spec.ts && pnpm typecheck && pnpm lint`
Expected: PASS, không có lỗi mới.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/20261015090200_c1_material_payment_commands.sql supabase/tests/database/c1/c1_material_payments.test.sql server/features/costs/material-finance/payment-*.ts "server/api/companies/[companyId]/projects/[projectId]/material-procurement" tests/unit/server/material-payments.spec.ts tests/unit/config/c1-material-payment-commands-guard.spec.ts
git commit -m "feat(materials): add material invoices, payment requests and treasurer payments"
```

---

### Task 3: Backend số liệu, hộp việc, thông báo, nhắc hạn

Song song sau T0. Implementer: `implementer` (sonnet).

**Files:**
- Create: `supabase/migrations/20261015090300_c1_material_finance_reads.sql`
- Create: `server/features/costs/material-finance/finance-read-{service,repository,routes}.ts`, `server/features/costs/material-finance/reminders.ts`
- Create route: `.../material-procurement/material-finance/summary.get.ts`, `server/api/companies/[companyId]/material-finance/inbox.get.ts`, `suppliers.get.ts`, `server/api/companies/[companyId]/notifications/index.get.ts`, `[notificationId]/read.post.ts`, `server/api/internal/material-reminders.post.ts`
- Modify: `nuxt.config.ts` (thêm `runtimeConfig.materialReminderSecret: ''`), `.env.example` (thêm `NUXT_MATERIAL_REMINDER_SECRET=`)
- Test: `tests/unit/server/material-finance-reads.spec.ts`, `tests/unit/server/material-reminders.spec.ts`, `tests/unit/config/c1-material-finance-reads-guard.spec.ts`, `supabase/tests/database/c1/c1_material_finance_reads.test.sql`

**Interfaces:**
- Consumes: T0.
- Produces:
  - SQL `public.c1_material_finance_facts(target_company_id uuid, target_project_id uuid) returns jsonb`. `target_project_id` null nghĩa là mọi dự án. Trả `{ currencyCode, contracts: [{ contractId, projectId, projectName, orderId, supplierId, supplierName, contractNo, total, invoiced, installments: [{installmentKey, name, amount, dueOn, paid, pending}] }] }`.
  - SQL `public.c1_material_finance_inbox_facts(target_company_id uuid, target_project_id uuid) returns jsonb`. Trả `{ awaitingContract, returnedRequests, pendingApproval, approvedAwaitingPayment }` theo schema T0. Mỗi danh sách chỉ có dữ liệu khi actor có quyền tương ứng, ngược lại là `[]`. `dueInstallments` do TS tính từ finance facts.
  - SQL `public.c1_list_app_notifications(target_company_id uuid, target_cursor timestamptz, target_limit integer) returns jsonb`; `public.c1_read_app_notification(target_company_id uuid, target_id uuid) returns jsonb`.
  - SQL `public.c1_material_emit_installment_reminders(target_today date) returns jsonb` (chỉ service_role), trả `{ dueSoon: int, overdue: int }`.
  - TS: `MaterialFinanceReadService` (`projectSummary`, `inbox`, `suppliers`, `listNotifications`, `readNotification`); `runMaterialReminders(event)`.

Mapping quyền của inbox:
- `awaitingContract`, `dueInstallments`: `material.contract.record`.
- `returnedRequests`: `material.payment.request`.
- `pendingApproval`: `material.payment.approve`.
- `approvedAwaitingPayment`: `material.payment.execute`.

- [ ] **Step 1: Viết unit test (đỏ)**

`tests/unit/server/material-finance-reads.spec.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { MaterialFinanceReadService, type MaterialFinanceReadDataRepository } from '../../../server/features/costs/material-finance/finance-read-service'

const p1 = '30000000-0000-4000-8000-000000000001'
const s1 = '30000000-0000-4000-8000-000000000002'
const s2 = '30000000-0000-4000-8000-000000000003'
const k = (n: number) => `30000000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`
const contractFacts = (n: number, supplierId: string, total: string, paid: string, dueOn: string) => ({
  contractId: k(n), projectId: p1, projectName: 'Dự án 1', orderId: k(n + 50), supplierId,
  supplierName: supplierId === s1 ? 'NCC A' : 'NCC B', contractNo: 'HD-' + n, total, invoiced: '0.0000',
  installments: [{ installmentKey: k(n + 20), name: 'Đợt 1', amount: total, dueOn, paid, pending: '0.0000' }],
})
const facts = {
  currencyCode: 'VND',
  contracts: [
    contractFacts(1, s1, '100.0000', '30.0000', '2026-10-01'),
    contractFacts(2, s1, '50.0000', '0.0000', '2026-10-17'),
    contractFacts(3, s2, '20.0000', '20.0000', '2026-09-01'),
  ],
}
const ctx = (permissions: string[]) => ({ actorId: k(99), tenantId: k(98), companyId: k(97), requestId: k(96), permissions }) as never
const repo = (): MaterialFinanceReadDataRepository => ({
  financeFacts: vi.fn(async () => facts),
  inboxFacts: vi.fn(async () => ({ awaitingContract: [], returnedRequests: [], pendingApproval: [], approvedAwaitingPayment: [] })),
  listNotifications: vi.fn(async () => ({ items: [], nextCursor: null })),
  readNotification: vi.fn(async () => ({ resourceId: k(1), version: 1, replayed: false })),
})
const now = () => new Date('2026-10-15T01:00:00Z')

describe('material finance read service', () => {
  it('summarizes a project', async () => {
    const summary = await new MaterialFinanceReadService(repo(), now).projectSummary(ctx(['material.read', 'material.finance.read']), p1)
    expect(summary.totals).toMatchObject({ committed: '170.0000', paid: '50.0000', remaining: '120.0000', overdue: '70.0000' })
    expect(summary.contracts).toHaveLength(3)
  })

  it('groups supplier balances', async () => {
    const suppliers = await new MaterialFinanceReadService(repo(), now).suppliers(ctx(['material.read', 'material.finance.read']))
    expect(suppliers.map(s => [s.supplierName, s.totals.remaining])).toEqual([['NCC A', '120.0000'], ['NCC B', '0.0000']])
  })

  it('builds due installments for accountants only', async () => {
    const service = new MaterialFinanceReadService(repo(), now)
    const accountant = await service.inbox(ctx(['material.read', 'material.contract.record']))
    expect(accountant.dueInstallments.map(i => [i.contractId, i.dueStatus])).toEqual([[k(1), 'overdue'], [k(2), 'due_soon']])
    const treasurer = await service.inbox(ctx(['material.read', 'material.payment.approve']))
    expect(treasurer.dueInstallments).toEqual([])
  })

  it('denies summary without finance permission', async () => {
    await expect(new MaterialFinanceReadService(repo(), now).projectSummary(ctx(['material.read', 'material.order.manage']), p1))
      .rejects.toMatchObject({ statusCode: 403 })
  })
})
```

`tests/unit/server/material-reminders.spec.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { handleMaterialReminders } from '../../../server/features/costs/material-finance/reminders'

describe('material reminders endpoint', () => {
  const emit = vi.fn(async () => ({ dueSoon: 2, overdue: 1 }))
  it('rejects a missing or wrong secret without calling the database', async () => {
    await expect(handleMaterialReminders({ secret: 's3cret', header: undefined, emit, now: () => new Date() })).rejects.toMatchObject({ statusCode: 401 })
    await expect(handleMaterialReminders({ secret: 's3cret', header: 'Bearer nope', emit, now: () => new Date() })).rejects.toMatchObject({ statusCode: 401 })
    await expect(handleMaterialReminders({ secret: '', header: 'Bearer ', emit, now: () => new Date() })).rejects.toMatchObject({ statusCode: 401 })
    expect(emit).not.toHaveBeenCalled()
  })
  it('emits with Vietnam today', async () => {
    await expect(handleMaterialReminders({ secret: 's3cret', header: 'Bearer s3cret', emit, now: () => new Date('2026-10-15T18:30:00Z') }))
      .resolves.toEqual({ dueSoon: 2, overdue: 1 })
    expect(emit).toHaveBeenCalledWith('2026-10-16')
  })
})
```

- [ ] **Step 2: Chạy để xác nhận đỏ**

Run: `pnpm exec vitest run tests/unit/server/material-finance-reads.spec.ts tests/unit/server/material-reminders.spec.ts`
Expected: FAIL, thiếu module.

- [ ] **Step 3: Viết service và reminders**

`finance-read-service.ts`:
- Interface `MaterialFinanceReadDataRepository` gồm:
  - `financeFacts(context, projectId: string | null)`
  - `inboxFacts(context, projectId: string | null)`
  - `listNotifications(context, cursor: string | null)`
  - `readNotification(context, id, key)`
- `projectSummary`:
  - `requirePermission(context, 'material.finance.read')`.
  - Totals bằng `summarizeMaterialFinance(facts.contracts, today)`.
  - `contracts` map sang `contractRow` với totals tính riêng cho từng contract.
- `suppliers`: `requirePermission(context, 'material.finance.read')`, gom theo `supplierId`, sắp theo `supplierName` (`localeCompare(…, 'vi')`).
- `inbox`:
  - `requireFinanceRead(context)`.
  - `dueInstallments` chỉ có khi có `material.contract.record`. Lấy mọi installment có `installmentDueStatus ∈ {overdue, due_soon}`, `remaining = amount − paid`, sắp theo `dueOn` rồi `contractId`.
  - Các danh sách còn lại lấy từ `inboxFacts` (SQL đã lọc theo quyền).
  - Kết quả parse qua `materialFinanceInboxSchema`.
- `listNotifications`/`readNotification`: chỉ cần đăng nhập. Context đã có `actorId`. RLS và RPC giới hạn theo người nhận.

`reminders.ts`:

```ts
import { timingSafeEqual } from 'node:crypto'
import { AppApiError } from '../../../utils/api-error'
import { vietnamToday } from '../../../../shared/utils/material-finance-summary'

export interface MaterialReminderInput {
  secret: string
  header: string | undefined
  emit(today: string): Promise<{ dueSoon: number, overdue: number }>
  now(): Date
}

function sameSecret(expected: string, header: string | undefined): boolean {
  if (!expected || !header?.startsWith('Bearer ')) return false
  const given = Buffer.from(header.slice('Bearer '.length))
  const wanted = Buffer.from(expected)
  return given.length === wanted.length && timingSafeEqual(given, wanted)
}

export async function handleMaterialReminders(input: MaterialReminderInput) {
  if (!sameSecret(input.secret, input.header)) {
    throw new AppApiError(401, 'UNAUTHORIZED', 'Yêu cầu không hợp lệ.')
  }
  return input.emit(vietnamToday(input.now()))
}
```

`server/api/internal/material-reminders.post.ts` gọi `handleMaterialReminders`:
- `secret` lấy từ `useRuntimeConfig(event).materialReminderSecret`.
- `header` lấy từ `getHeader(event, 'authorization')`.
- `emit` gọi RPC `c1_material_emit_installment_reminders` bằng service-role client. Tìm helper service-role có sẵn trong `server/utils/supabase-client.ts`, chính là helper mà `resolveMaterialEvidenceFinalizer` dùng. Không tạo client mới nếu đã có.
- `now: () => new Date()`.

- [ ] **Step 4: Chạy unit test**

Run: `pnpm exec vitest run tests/unit/server/material-finance-reads.spec.ts tests/unit/server/material-reminders.spec.ts`
Expected: PASS.

- [ ] **Step 5: Viết migration đọc và nhắc hạn**

`supabase/migrations/20261015090300_c1_material_finance_reads.sql`, N = 53.

- `private.c1_material_finance_facts(target_company_id, target_project_id)`:
  - `c1_material_context(company, 'material.read')`. Không có `c1_material_can_read_finance` thì `PERMISSION_DENIED`. Nếu `target_project_id` khác null thì gọi `c1_material_require_project`.
  - `currencyCode` lấy từ `company_cost_settings.default_currency_code`.
  - `contracts` gồm mọi `material_contracts` trong scope, join `projects` (lấy tên; cột tên dự án dùng giống `c1_material_list_projects`), `business_parties.display_name` và phiên bản hiện hành. `invoiced` là tổng hóa đơn `recorded`. `installments` là lịch hiện hành left join `c1_material_installment_usage`.
- `private.c1_material_finance_inbox_facts(target_company_id, target_project_id)`. Mỗi danh sách chỉ lấy khi `c1_material_actor_has_permission` đúng quyền, ngược lại trả `'[]'::jsonb`:
  - `awaitingContract`: `material_orders` với `state = 'active'` và chưa có `material_contracts`. `orderSubtotal = sum(quantity * unit_price)`.
  - `returnedRequests`: request `returned` kèm `reason` của decision mới nhất.
  - `pendingApproval`: request `submitted`.
  - `approvedAwaitingPayment`: request `approved`, `approvedAt` là `decided_at` của decision approve mới nhất.
- `private.c1_list_app_notifications(target_company_id, target_cursor, target_limit)`:
  - Không gọi `c1_material_context`: chỉ cần `auth.uid()` và là thành viên active của công ty (`company_memberships`), ngược lại `PERMISSION_DENIED`.
  - `target_limit` nằm ngoài khoảng 1..50 thì `INPUT_INVALID`.
  - Lấy `recipient_id = auth.uid()`, `company_id = target_company_id`, `created_at < coalesce(cursor, 'infinity')`, sắp theo `created_at desc, id desc`, giới hạn `limit + 1` để tính `nextCursor`.
- `private.c1_read_app_notification(target_company_id, target_id)`: update `read_at = coalesce(read_at, now())` với `recipient_id = auth.uid()`. Không tìm thấy thì `RESOURCE_NOT_FOUND`. Trả `ack(id, 1, read_at đã có trước)`. Lệnh này idempotent tự nhiên nên không cần receipt.
- `private.c1_material_emit_installment_reminders(target_today date)`. Không dùng `auth.uid()`. Wrapper chỉ `grant execute ... to service_role`, không grant `authenticated`. Với mọi installment của phiên bản hiện hành có `amount − paid > 0`:
  - `target_today <= due_on <= target_today + 3`: gọi `c1_material_notify_permission(..., 'material.contract.record', 'material.installment.due_soon', 'material_installment', installment_key, '/materials/<p>/orders/<order>', jsonb_build_object('supplierName', …, 'contractNo', …, 'installmentName', name, 'dueOn', due_on, 'remaining', …), 'inst:' || installment_key || ':due_soon:' || due_on)`.
  - `due_on < target_today`: như trên với `overdue`.
  - Đếm số thông báo thực sự được chèn (đếm số dòng `app_notifications` trước và sau, theo `event_kind`) và trả `{dueSoon, overdue}`.
  - Vì hàm notify loại `auth.uid()` (null ở đây) bằng `is distinct from`, mọi người nhận hợp lệ đều nhận.

Wrapper public, revoke và grant như T1. Riêng `emit` chỉ cấp cho `service_role`.

- [ ] **Step 6: Viết pgTAP**

`supabase/tests/database/c1/c1_material_finance_reads.test.sql`, fixture tiền tố `c128`. Các case:
- Facts chỉ trả hợp đồng của công ty mình (RLS chéo công ty).
- `paid`/`pending` đúng sau khi chèn trực tiếp request và payment.
- Inbox của mua hàng: `PERMISSION_DENIED`.
- Inbox của thủ quỹ: `awaitingContract = []`.
- Notifications: user A không thấy thông báo của B. Cursor phân trang đúng. `read` hai lần trả cùng `read_at`.
- `emit('2026-10-15')` với đợt hạn 17/10 và đợt hạn 10/10 (chưa chi đủ): mỗi đợt tạo 1 thông báo cho mỗi kế toán. Gọi lại cùng ngày: 0 thông báo mới. Phụ lục đổi hạn (insert version mới với `due_on` khác): tạo nhắc mới.
- `authenticated` gọi `c1_material_emit_installment_reminders`: lỗi quyền execute.

- [ ] **Step 7: Guard spec, chạy test và lint**

`tests/unit/config/c1-material-finance-reads-guard.spec.ts` kiểm:
- Lock 53.
- `grant execute on function public.c1_material_emit_installment_reminders(date) to service_role` và không có grant cho `authenticated`.
- `recipient_id = auth.uid()` trong list/read.
- Có nhãn các case pgTAP.

Run: `pnpm exec vitest run tests/unit/server/material-finance-reads.spec.ts tests/unit/server/material-reminders.spec.ts tests/unit/config/c1-material-finance-reads-guard.spec.ts && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20261015090300_c1_material_finance_reads.sql supabase/tests/database/c1/c1_material_finance_reads.test.sql server/features/costs/material-finance/finance-read-*.ts server/features/costs/material-finance/reminders.ts server/api nuxt.config.ts .env.example tests/unit/server/material-finance-reads.spec.ts tests/unit/server/material-reminders.spec.ts tests/unit/config/c1-material-finance-reads-guard.spec.ts
git commit -m "feat(materials): add material finance summaries, inbox, notifications and reminders"
```

---

### Task 4: Backend evidence cho hợp đồng, hóa đơn, ủy nhiệm chi

Song song sau T0. Implementer: `implementer` (sonnet).

**Files:**
- Create: `supabase/migrations/20261015090400_c1_material_finance_evidence.sql`
- Modify: `shared/schemas/costs/material-procurement.ts` (`materialEvidenceTargetSchema`, `materialEvidenceRoleSchema`, `materialEvidenceIntentInputSchema`), `server/features/costs/material-procurement/service.ts` (`createEvidenceIntent`, `finalizeEvidence`, `readEvidenceUrl` kiểm quyền theo role), `server/features/costs/material-procurement/repository.ts` (`finalizationTargetSchema.declaredMimeType`), `server/features/costs/evidence/evidence-file-integrity.ts` (kiểm XML), `app/utils/costs/material-evidence-uploader.ts`
- Test: `tests/unit/server/material-evidence.spec.ts`, `tests/unit/utils/material-evidence-uploader.spec.ts`, `tests/unit/shared/material-procurement.spec.ts`, `tests/unit/config/c1-material-finance-evidence-guard.spec.ts`, bổ sung case vào `supabase/tests/database/c1/c1_material_finance_foundation.test.sql` dưới nhãn `finance evidence:`

**Interfaces:**
- Consumes: cột `material_evidence_scopes.contract_id` và check role/target (T0).
- Produces:
  - Target `{ kind: 'material_contract', contractId }`.
  - Role `contract_amendment | invoice | payment_proof`.
  - MIME cho phép:
    - `contract_amendment`: `application/pdf`
    - `invoice`: `application/pdf`, `application/xml`, `text/xml`
    - `payment_proof`: `application/pdf`, `image/jpeg`, `image/png`
  - Quyền upload/finalize: `contract_amendment`, `invoice` cần `material.contract.record`; `payment_proof` cần `material.payment.execute`. Đọc URL cần `c1_material_can_read_finance` khi target là `material_contract`.

- [ ] **Step 1: Viết test (đỏ)**

Trong `tests/unit/shared/material-procurement.spec.ts` thêm:

```ts
it('accepts contract-level finance evidence roles with allowed MIME types', () => {
  const base = { originalFilename: 'hd.xml', sizeBytes: 100, sha256: 'a'.repeat(64) }
  const target = { kind: 'material_contract' as const, contractId: '00000000-0000-4000-8000-000000000001' }
  expect(materialEvidenceIntentInputSchema.safeParse({ ...base, mimeType: 'application/xml', evidenceRole: 'invoice', target }).success).toBe(true)
  expect(materialEvidenceIntentInputSchema.safeParse({ ...base, mimeType: 'image/png', evidenceRole: 'payment_proof', target }).success).toBe(true)
  expect(materialEvidenceIntentInputSchema.safeParse({ ...base, mimeType: 'image/png', evidenceRole: 'invoice', target }).success).toBe(false)
  expect(materialEvidenceIntentInputSchema.safeParse({ ...base, mimeType: 'application/pdf', evidenceRole: 'signed_contract', target }).success).toBe(false)
  expect(materialEvidenceIntentInputSchema.safeParse({ ...base, mimeType: 'application/pdf', evidenceRole: 'invoice', target: { kind: 'material_order', orderId: target.contractId } }).success).toBe(false)
})
```

Trong `tests/unit/server/material-evidence.spec.ts` thêm:
- `payment_proof` cần `material.payment.execute`: kế toán chỉ có `contract.record` bị 403.
- `invoice` cần `material.contract.record`.
- `finalizeEvidence` với XML hợp lệ thì gọi finalizer; XML không bắt đầu bằng `<` (sau BOM hoặc khoảng trắng) thì 409 `EVIDENCE_UPLOAD_MISMATCH`.

- [ ] **Step 2: Chạy để xác nhận đỏ**

Run: `pnpm exec vitest run tests/unit/shared/material-procurement.spec.ts tests/unit/server/material-evidence.spec.ts`
Expected: FAIL ở các case mới.

- [ ] **Step 3: Sửa schema, service, integrity, uploader**

`material-procurement.ts`:

```ts
export const materialEvidenceTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('material_proposal'), proposalId: workflowUuidSchema, revisionId: workflowUuidSchema }).strict(),
  z.object({ kind: z.literal('material_order'), orderId: workflowUuidSchema }).strict(),
  z.object({ kind: z.literal('material_contract'), contractId: workflowUuidSchema }).strict(),
])

export const materialEvidenceRoleSchema = z.enum([
  'unsigned_quotation', 'signed_quotation', 'signed_contract', 'contract_amendment', 'invoice', 'payment_proof',
])

export const materialEvidenceMimeTypes = {
  unsigned_quotation: ['application/pdf'],
  signed_quotation: ['application/pdf'],
  signed_contract: ['application/pdf'],
  contract_amendment: ['application/pdf'],
  invoice: ['application/pdf', 'application/xml', 'text/xml'],
  payment_proof: ['application/pdf', 'image/jpeg', 'image/png'],
} as const satisfies Record<z.infer<typeof materialEvidenceRoleSchema>, readonly string[]>

const roleTargets: Record<z.infer<typeof materialEvidenceRoleSchema>, 'material_proposal' | 'material_order' | 'material_contract'> = {
  unsigned_quotation: 'material_proposal',
  signed_quotation: 'material_order',
  signed_contract: 'material_order',
  contract_amendment: 'material_contract',
  invoice: 'material_contract',
  payment_proof: 'material_contract',
}

export const materialEvidenceIntentInputSchema = costEvidenceCreateIntentInputSchema.extend({
  mimeType: z.enum(['application/pdf', 'application/xml', 'text/xml', 'image/jpeg', 'image/png']),
  evidenceRole: materialEvidenceRoleSchema,
  target: materialEvidenceTargetSchema,
}).strict().superRefine((value, context) => {
  if (roleTargets[value.evidenceRole] !== value.target.kind) {
    context.addIssue({ code: 'custom', path: ['evidenceRole'], message: 'Evidence role does not match target' })
  }
  if (!(materialEvidenceMimeTypes[value.evidenceRole] as readonly string[]).includes(value.mimeType)) {
    context.addIssue({ code: 'custom', path: ['mimeType'], message: 'MIME type not allowed for role' })
  }
})

export function materialEvidenceUploadPermission(role: z.infer<typeof materialEvidenceRoleSchema>) {
  if (role === 'unsigned_quotation') return 'material.order.manage' as const
  if (role === 'payment_proof') return 'material.payment.execute' as const
  return 'material.contract.record' as const
}
```

Kiểm tra `costEvidenceCreateIntentInputSchema` có tự giới hạn `mimeType` không. Nếu có thì `.extend` ở trên ghi đè đúng ý.

Trong `material-procurement/service.ts`:
- `createEvidenceIntent` dùng `requirePermission(context, materialEvidenceUploadPermission(input.evidenceRole))`.
- `requireEvidenceWrite` chấp nhận thêm `material.payment.execute`. Kiểm tra theo role thật vẫn do RPC finalize làm.
- `readEvidenceUrl` cho phép thêm các quyền tài chính (`financeReadPermissions` của T0). RPC đọc vẫn kiểm theo target.

Trong `material-procurement/repository.ts`, đổi `declaredMimeType: z.literal('application/pdf')` thành `z.enum(['application/pdf','application/xml','text/xml','image/jpeg','image/png'])`.

Trong `evidence-file-integrity.ts`, thêm nhánh cho XML trong `verifyEvidenceBlob`: với `application/xml` hoặc `text/xml`, decode UTF-8, bỏ BOM và khoảng trắng đầu; nếu ký tự đầu không phải `<` thì ném `AppApiError(409, 'EVIDENCE_UPLOAD_MISMATCH', 'Tệp tải lên không khớp với khai báo.')`. Kiểm tra nhánh PNG/JPEG đã có chưa: các type này đã được generic cost evidence chấp nhận. Nếu chưa có kiểm magic bytes thì thêm `89 50 4E 47` cho PNG và `FF D8 FF` cho JPEG.

Trong `material-evidence-uploader.ts`, nhận `mimeType` từ file (`file.type`) và kiểm theo `materialEvidenceMimeTypes[role]` trước khi tạo intent. Sai thì ném lỗi tiếng Việt "Định dạng tệp không được hỗ trợ cho loại chứng từ này."

- [ ] **Step 4: Viết migration evidence**

`supabase/migrations/20261015090400_c1_material_finance_evidence.sql`, N = 54. Các hàm cần sửa là định nghĩa hiện hành trong `20261008140741` sau khi các migration sau đã vá. Kiểm tra trước bằng `rg -n "c1_material_create_evidence_intent|c1_material_can_upload_evidence|c1_material_evidence_finalization_target|c1_finalize_material_evidence|c1_material_evidence_read_target" supabase/migrations`. Dùng `create or replace` với bản chép đầy đủ định nghĩa hiện hành, chỉ đổi các điểm sau:

1. `c1_material_create_evidence_intent`:
   - Nhận `target.kind = 'material_contract'` với `contractId`. Kiểm hợp đồng tồn tại cùng scope và insert `material_evidence_scopes(contract_id = ...)`.
   - Thay hai chỗ `target_input->>'mimeType' is distinct from 'application/pdf'` bằng kiểm theo role:

```sql
not (
  (v_role in ('unsigned_quotation','signed_quotation','signed_contract','contract_amendment') and target_input->>'mimeType' = 'application/pdf')
  or (v_role = 'invoice' and target_input->>'mimeType' in ('application/pdf','application/xml','text/xml'))
  or (v_role = 'payment_proof' and target_input->>'mimeType' in ('application/pdf','image/jpeg','image/png'))
)
```

   - Insert `cost_evidence_files` dùng `target_input->>'mimeType'` thay cho hằng `'application/pdf'`.
2. `c1_material_can_upload_evidence` (khối `case scope.evidence_role`): thêm `when 'contract_amendment' then ... 'material.contract.record'`, `when 'invoice' then ... 'material.contract.record'`, `when 'payment_proof' then ... 'material.payment.execute'`.
3. `c1_material_evidence_finalization_target` và `c1_finalize_material_evidence`:
   - Biến `v_permission` map theo `materialEvidenceUploadPermission` (cùng bảng như trên).
   - Bỏ ép `'application/pdf'`, thay bằng `target_input->>'mimeType' = file.declared_mime_type`.
4. `c1_material_evidence_read_target`: target `material_contract` thì yêu cầu `private.c1_material_can_read_finance(t, c)`.
5. Bucket:

```sql
update storage.buckets
set allowed_mime_types = (
  select array_agg(distinct mime order by mime)
  from unnest(coalesce(allowed_mime_types, '{}') || array['application/xml','text/xml','image/jpeg','image/png','application/pdf']) as mime
)
where id = 'c1-accounting-evidence';
```

Mỗi `create or replace` giữ nguyên chữ ký, `security definer`, `search_path` và các revoke/grant như bản gốc.

- [ ] **Step 5: pgTAP và guard**

Thêm vào `c1_material_finance_foundation.test.sql`, mỗi case có nhãn tiền tố `finance evidence:`:
- Kế toán tạo intent `invoice/application/xml` cho hợp đồng: được.
- Kế toán tạo intent `payment_proof`: `PERMISSION_DENIED`. Thủ quỹ tạo được.
- `invoice/image/png`: `INPUT_INVALID`.
- Mua hàng đọc URL file `invoice`: `PERMISSION_DENIED`.
- `signed_contract` cho target `material_contract`: vi phạm check.

`tests/unit/config/c1-material-finance-evidence-guard.spec.ts` kiểm:
- Lock 54.
- Không còn chuỗi `is distinct from 'application/pdf'` trong các hàm được thay.
- Có `'payment_proof' then` gắn với `material.payment.execute`.
- Có update bucket.

- [ ] **Step 6: Chạy test và lint**

Run: `pnpm exec vitest run tests/unit/shared/material-procurement.spec.ts tests/unit/server/material-evidence.spec.ts tests/unit/utils/material-evidence-uploader.spec.ts tests/unit/config/c1-material-finance-evidence-guard.spec.ts && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20261015090400_c1_material_finance_evidence.sql supabase/tests/database/c1/c1_material_finance_foundation.test.sql shared/schemas/costs/material-procurement.ts server/features/costs/material-procurement server/features/costs/evidence/evidence-file-integrity.ts app/utils/costs/material-evidence-uploader.ts tests/unit
git commit -m "feat(materials): accept contract amendment, invoice and payment proof evidence"
```

---

### Task 5: UI chi tiết đơn và hợp đồng

Song song sau T0. Agent: `ui-agy`. Sau khi xong, Opus review bằng skill `frontend-design`. `verifier` chạy Playwright.

**Files:**
- Create: `app/pages/materials/[projectId]/orders/[orderId].vue`
- Create: `app/components/materials/finance/MaterialContractRecordPanel.vue`, `MaterialContractAmendPanel.vue`, `MaterialInstallmentEditor.vue`, `MaterialContractSummary.vue`, `MaterialInstallmentTable.vue`
- Create: `app/utils/materials/installment-split.ts`
- Test: `tests/unit/utils/material-installment-split.spec.ts`, `tests/e2e/material-contract.spec.ts`

**Interfaces:**
- Consumes: `useRepositories().materialFinance` (`readContract`, `recordContract`, `amendContract`), `useRepositories().materialProcurement` (`readOrder`, `createEvidenceIntent`, `finalizeEvidence`, `readEvidenceUrl`), uploader `app/utils/costs/material-evidence-uploader.ts`, `materialEvidenceMimeTypes` (T4; nếu T4 chưa merge thì dùng `application/pdf` cho hai file của hợp đồng gốc vì đã được hỗ trợ sẵn).
- Produces: `splitInstallments(total: string, parts: Array<{ percent?: string, amount?: string }>): string[]`. Đợt cuối nhận phần chênh; kết quả cộng đúng `total`.

- [ ] **Step 1: Viết test tiện ích chia đợt (đỏ)**

`tests/unit/utils/material-installment-split.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { splitInstallments } from '../../../app/utils/materials/installment-split'

describe('splitInstallments', () => {
  it('splits by percent with the last installment absorbing rounding', () => {
    expect(splitInstallments('100.0000', [{ percent: '33.3333' }, { percent: '33.3333' }, { percent: '33.3334' }]))
      .toEqual(['33.3333', '33.3333', '33.3334'])
    expect(splitInstallments('10.0000', [{ percent: '33' }, { percent: '33' }, { percent: '34' }]))
      .toEqual(['3.3000', '3.3000', '3.4000'])
    expect(splitInstallments('1000.0000', [{ percent: '33.33333' }, { percent: '66.66667' }]))
      .toEqual(['333.3333', '666.6667'])
  })
  it('mixes fixed amounts and percent; result always sums to total', () => {
    const parts = splitInstallments('110.0000', [{ amount: '33.0000' }, { percent: '50' }, { percent: '20' }])
    expect(parts.reduce((a, b) => a + Number(b), 0)).toBeCloseTo(110, 4)
    expect(parts[2]).toBe('22.0000')
  })
})
```

Chú ý: kiểm tra cộng ở test thứ hai dùng `Number` chỉ trong test cho gọn. Code thật dùng `decimal.js`.

- [ ] **Step 2: Chạy, xác nhận đỏ, rồi viết `installment-split.ts`**

Run: `pnpm exec vitest run tests/unit/utils/material-installment-split.spec.ts`. Expected: FAIL, thiếu module.

```ts
import Decimal from 'decimal.js'

export function splitInstallments(total: string, parts: Array<{ percent?: string, amount?: string }>): string[] {
  const totalValue = new Decimal(total)
  const values = parts.map(part => part.amount !== undefined
    ? new Decimal(part.amount)
    : totalValue.times(part.percent ?? '0').dividedBy(100).toDecimalPlaces(4, Decimal.ROUND_HALF_UP))
  if (values.length > 0) {
    const others = values.slice(0, -1).reduce((acc, value) => acc.plus(value), new Decimal(0))
    values[values.length - 1] = totalValue.minus(others)
  }
  return values.map(value => value.toFixed(4))
}
```

Run lại test. Expected: PASS.

- [ ] **Step 3: Giao UI cho `ui-agy`**

Brief cho agy, giao nguyên văn kèm đường dẫn spec mục 9.2 và schema T0:
- Trang `app/pages/materials/[projectId]/orders/[orderId].vue`:
  - `definePageMeta` yêu cầu `material.read`.
  - Tải `readOrder` và `readContract`. `readContract` trả 403 thì ẩn phần tài chính, chỉ hiện trạng thái hợp đồng từ `order.contract`.
  - Hiển thị thông tin đơn: NCC, các dòng (tên vật tư, quy cách, đơn vị, số lượng dạng không đuôi 0 qua `app/utils/materials/quantity-display.ts`, đơn giá, thành tiền) và tổng đơn.
- `MaterialContractRecordPanel.vue`, hiện khi `order.contract === null`, `orderState === 'active'` và user có `material.contract.record`:
  - Hai ô tải file PDF qua uploader: `signed_contract` và `signed_quotation`, target `{ kind: 'material_order', orderId }`.
  - Số hợp đồng, ngày ký.
  - Trước VAT, VAT và tổng. Tổng tự điền bằng trước VAT + VAT nhưng sửa được, sai thì báo lỗi.
  - Ô "Tổng đơn" chỉ đọc, đặt cạnh "Trước VAT". Khi lệch thì hiện ô "Lý do chênh lệch" bắt buộc.
  - `MaterialInstallmentEditor`:
    - Mặc định một đợt "Thanh toán 100%", hạn bằng ngày ký.
    - Mỗi dòng có tên, chọn nhập % hoặc số tiền, hạn, ô tích "Tạm ứng".
    - Thêm hoặc xóa dòng. Hiện "Còn thiếu"/"Dư" so với tổng; phần chênh dồn vào đợt cuối bằng `splitInstallments`.
    - `installmentKey` sinh bằng `crypto.randomUUID()` khi thêm dòng và giữ nguyên khi sửa.
  - Nút "Lưu hợp đồng" gửi `recordContract` với idempotency key giữ nguyên qua các lần retry của cùng payload; payload đổi thì tạo key mới, theo cách `MaterialOrderCreatePanel.vue` đang làm. Xong thì đọc lại `readOrder` và `readContract`.
- `MaterialContractSummary.vue`:
  - Số hợp đồng, ngày ký, phiên bản hiện hành, totals (cam kết, đã chi, đang chờ, còn phải trả, quá hạn, đã nhận hóa đơn, đã chi chưa có hóa đơn).
  - Danh sách phiên bản với link xem file qua `readEvidenceUrl`.
- `MaterialInstallmentTable.vue`: cột tên, số tiền, hạn, đã đề nghị (`pending`), đã chi, còn lại, badge trạng thái (`overdue` đỏ "Quá hạn", `due_soon` vàng "Sắp đến hạn", `settled` xanh "Đã chi đủ"), nhãn "Tạm ứng".
- `MaterialContractAmendPanel.vue`:
  - Nút "Thêm phụ lục" mở form gồm file `contract_amendment` (target `material_contract`), lý do, giá trị mới.
  - Editor đợt nạp lịch hiện hành, giữ nguyên `installmentKey`.
  - Đợt có `paid + pending > 0` không xóa được và không được hạ dưới mức đó; hiện giải thích bên cạnh.
  - Gửi `amendContract` với `expectedVersion = contract.version`.
- Mã lỗi server hiển thị bằng câu tiếng Việt:
  - `VARIANCE_REASON_REQUIRED`, `INSTALLMENT_TOTAL_MISMATCH`, `CONTRACT_EXISTS`, `ORDER_NOT_ACTIVE`, `AMENDMENT_BELOW_COMMITTED`, `INVOICE_TOTAL_EXCEEDED`, `EVIDENCE_INVALID`.
  - `VERSION_CONFLICT`: "Dữ liệu đã thay đổi, vui lòng tải lại".
- Chừa vị trí `<slot name="invoices">` và `<slot name="payment-requests">` dưới bảng đợt. T6 gắn component vào hai vị trí này.
- Không sửa `MaterialOrderCreatePanel.vue`.

- [ ] **Step 4: Playwright (mock)**

`tests/e2e/material-contract.spec.ts` theo mẫu `tests/e2e/material-proposal.spec.ts`: `installAuthRoutes` và `page.route` cho các endpoint trong `materialFinanceEndpointManifest`/`materialProcurementEndpointManifest`; parse body bằng schema T0. Kịch bản:
1. Kế toán mở đơn chưa có hợp đồng, nhập trước VAT 100, VAT 10.
   - Thêm đợt "Tạm ứng" 30% có tích tạm ứng; đợt 2 tự nhận 77.
   - Tải 2 file (route upload intent, PUT storage và finalize đều mock), lưu.
   - Body gửi đi parse được bằng `recordMaterialContractInputSchema`, có header `idempotency-key`.
   - Sau đó trang hiện "Đã chi 0", "Cam kết 110".
2. Nhập trước VAT 90 trong khi tổng đơn 100: ô lý do hiện. Bỏ trống lý do thì không gửi request.
3. Mock `POST contract` trả 409 `CONTRACT_EXISTS`: hiện câu tiếng Việt, form giữ dữ liệu.
4. Mua hàng mở trang: không thấy panel ghi hợp đồng; `readContract` 403 thì vẫn thấy "Đã có hợp đồng HD-01 ngày 10/10/2026".
5. Phụ lục: đợt có `paid = 30` thì ô số tiền không cho nhập < 30; gửi `amendContract` với `expectedVersion` đúng.

Run: `PLAYWRIGHT_PORT=4331 pnpm exec playwright test tests/e2e/material-contract.spec.ts --project=chromium`
Expected: PASS.

- [ ] **Step 5: Review và commit**

Opus review diff bằng `frontend-design`. Sau đó:

```bash
git add app/pages/materials app/components/materials/finance app/utils/materials/installment-split.ts tests/unit/utils/material-installment-split.spec.ts tests/e2e/material-contract.spec.ts
git commit -m "feat(materials): add order detail page with contract recording and amendments"
```

---

### Task 6: UI hóa đơn, đề nghị chi và hộp việc

Song song sau T0. Agent: `ui-agy`.

**Files:**
- Create: `app/components/materials/finance/MaterialInvoicePanel.vue`, `MaterialInvoiceForm.vue`, `MaterialPaymentRequestPanel.vue`, `MaterialPaymentRequestForm.vue`, `MaterialPaymentDecisionDialog.vue`, `MaterialPaymentRecordDialog.vue`
- Create: `app/pages/materials/finance/index.vue`
- Create: `app/utils/materials/payment-request-actions.ts`
- Test: `tests/unit/utils/material-payment-request-actions.spec.ts`, `tests/e2e/material-payments.spec.ts`

**Interfaces:**
- Consumes: `materialFinance.listInvoices/recordInvoice/voidInvoice/listPaymentRequests/createPaymentRequest/resubmitPaymentRequest/cancelPaymentRequest/decidePaymentRequest/recordPayment/inbox`, `materialProcurement.listSupplierNames` (gợi ý tên hóa đơn), `readProposal` (tên dự kiến A1, `effectiveInvoiceDisplayName`).
- Produces:
  - `paymentRequestActions(request: MaterialPaymentRequestView, actorId: string, permissions: readonly string[]): Array<'resubmit' | 'cancel' | 'approve' | 'return' | 'record_payment'>`.
  - Hai component `MaterialInvoicePanel` và `MaterialPaymentRequestPanel` nhận prop `{ projectId: string, contract: MaterialContractView }` và emit `changed` để trang cha đọc lại `readContract`. T8 gắn chúng vào slot của T5.

- [ ] **Step 1: Test tiện ích hành động (đỏ)**

```ts
import { describe, expect, it } from 'vitest'
import { paymentRequestActions } from '../../../app/utils/materials/payment-request-actions'

const base = { state: 'submitted', submittedBy: 'u1' } as never
const r = (state: string, submittedBy = 'u1') => ({ ...(base as object), state, submittedBy }) as never

describe('paymentRequestActions', () => {
  it('lets a different approver approve or return a submitted request', () => {
    expect(paymentRequestActions(r('submitted'), 'u2', ['material.payment.approve'])).toEqual(['approve', 'return'])
  })
  it('hides approve for the submitter even with approve permission', () => {
    expect(paymentRequestActions(r('submitted'), 'u1', ['material.payment.approve', 'material.payment.request'])).toEqual(['cancel'])
  })
  it('offers resubmit and cancel on returned requests to requesters', () => {
    expect(paymentRequestActions(r('returned'), 'u3', ['material.payment.request'])).toEqual(['resubmit', 'cancel'])
  })
  it('offers record_payment on approved requests to an executor who did not submit', () => {
    expect(paymentRequestActions(r('approved'), 'u2', ['material.payment.execute'])).toEqual(['record_payment'])
    expect(paymentRequestActions(r('approved'), 'u1', ['material.payment.execute'])).toEqual([])
  })
  it('offers nothing on paid or cancelled', () => {
    expect(paymentRequestActions(r('paid'), 'u2', ['material.payment.execute', 'material.payment.request'])).toEqual([])
    expect(paymentRequestActions(r('cancelled'), 'u2', ['material.payment.request'])).toEqual([])
  })
})
```

- [ ] **Step 2: Chạy, xác nhận đỏ, viết tiện ích**

```ts
import type { MaterialPaymentRequestView } from '../../../shared/schemas/costs/material-finance'

type Action = 'resubmit' | 'cancel' | 'approve' | 'return' | 'record_payment'

export function paymentRequestActions(request: Pick<MaterialPaymentRequestView, 'state' | 'submittedBy'>, actorId: string, permissions: readonly string[]): Action[] {
  const can = (permission: string) => permissions.includes(permission)
  const notSubmitter = request.submittedBy !== actorId
  const actions: Action[] = []
  if (request.state === 'returned' && can('material.payment.request')) actions.push('resubmit')
  if (request.state === 'submitted' && can('material.payment.approve') && notSubmitter) actions.push('approve', 'return')
  if (request.state === 'approved' && can('material.payment.execute') && notSubmitter) actions.push('record_payment')
  if (['submitted', 'returned', 'approved'].includes(request.state) && can('material.payment.request')) actions.push('cancel')
  return actions
}
```

Run: `pnpm exec vitest run tests/unit/utils/material-payment-request-actions.spec.ts`. Expected: PASS.

- [ ] **Step 3: Giao UI cho `ui-agy`**

Brief (spec mục 9.1 và 9.2):
- `MaterialInvoicePanel`:
  - Bảng hóa đơn: ký hiệu, số, ngày, trước VAT, VAT, tổng, trạng thái, xem file.
  - Nút "Nhập hóa đơn" (`material.contract.record`) mở `MaterialInvoiceForm` gồm:
    - File: PDF hoặc XML, role `invoice`, target `material_contract`.
    - Ký hiệu, số, ngày, trước VAT, VAT và tổng có kiểm khớp.
    - Bảng tên vật tư theo từng dòng đơn. Gợi ý theo thứ tự: tên hóa đơn NCC đã lưu (`listSupplierNames` lọc `documentKind = 'invoice'`), rồi `effectiveInvoiceDisplayName` của dòng phiếu. Ô bỏ trống thì không gửi dòng đó.
  - Nút "Hủy hóa đơn" có ô lý do.
- `MaterialPaymentRequestPanel`:
  - Bảng đề nghị: đợt, số tiền, trạng thái (Chờ duyệt, Bị trả lại, Đã duyệt, Đã chi, Đã hủy), người gửi, lần gửi, lịch sử quyết định, thông tin chi.
  - Nút hành động theo `paymentRequestActions`.
  - Nút "Lập đề nghị chi" (`material.payment.request`) mở `MaterialPaymentRequestForm`:
    - Chọn đợt (chỉ đợt có `remaining > 0`); số tiền mặc định là `remaining`, không vượt.
    - Chọn hóa đơn `recorded`; bắt buộc khi đợt không phải tạm ứng, có dòng giải thích.
    - Ghi chú.
  - `MaterialPaymentDecisionDialog`: duyệt, hoặc trả lại với lý do bắt buộc.
  - `MaterialPaymentRecordDialog`: ngày chuyển (mặc định hôm nay, không cho ngày tương lai), số tham chiếu, file ủy nhiệm chi (PDF/JPG/PNG, role `payment_proof`).
- `app/pages/materials/finance/index.vue`:
  - `definePageMeta` yêu cầu `material.read`.
  - Bộ lọc dự án dùng `materialProcurement.listProjects()`.
  - Tab hiện theo quyền: "Đơn chờ hợp đồng", "Đợt sắp/quá hạn", "Đề nghị bị trả lại" (kế toán); "Chờ duyệt", "Đã duyệt – chờ chi" (thủ quỹ).
  - Mỗi dòng link tới `/materials/<projectId>/orders/<orderId>`. Có trạng thái rỗng và nút tải lại.
- Thông báo lỗi tiếng Việt cho các mã `INSTALLMENT_CAPACITY_EXCEEDED`, `INVOICE_REQUIRED`, `SELF_DECISION_FORBIDDEN`, `PROOF_ALREADY_USED`, `INVOICE_IN_USE`, `INSTALLMENT_NOT_FOUND`, `INVOICE_TOTAL_EXCEEDED`, `INVOICE_DUPLICATE`, `VERSION_CONFLICT`.
- Không sửa file của T5. Hai panel được thiết kế để gắn vào slot.

- [ ] **Step 4: Playwright (mock)**

`tests/e2e/material-payments.spec.ts`. Mount hai panel qua trang chi tiết đơn của T5. Nếu T5 chưa merge, dùng một trang test tạm trong `tests/e2e` không được; khi đó chạy kịch bản qua trang hộp việc và một route mock của trang đơn ở T8. Kịch bản:
1. Kế toán lập đề nghị tạm ứng 33 không hóa đơn: body parse được bằng `createPaymentRequestInputSchema`.
2. Lập đề nghị cho đợt thường khi chưa có hóa đơn: nút gửi bị khóa, có dòng "Cần chọn ít nhất một hóa đơn".
3. Thủ quỹ (user khác) bấm "Trả lại" không có lý do: không gửi. Có lý do: gửi `decision: 'return'`.
4. Kế toán gửi lại: PATCH với `expectedVersion` mới.
5. Thủ quỹ duyệt rồi ghi chi với file PNG: body parse được bằng `recordMaterialPaymentInputSchema`. Bảng hiện "Đã chi".
6. Server trả `PROOF_ALREADY_USED`: hiện câu tiếng Việt.
7. Hộp việc của thủ quỹ chỉ có hai tab của thủ quỹ; bấm dòng thì đi tới trang đơn.

Run: `PLAYWRIGHT_PORT=4332 pnpm exec playwright test tests/e2e/material-payments.spec.ts --project=chromium`
Expected: PASS.

- [ ] **Step 5: Review và commit**

```bash
git add app/components/materials/finance app/pages/materials/finance app/utils/materials/payment-request-actions.ts tests/unit/utils/material-payment-request-actions.spec.ts tests/e2e/material-payments.spec.ts
git commit -m "feat(materials): add invoice, payment request and finance inbox UI"
```

---

### Task 7: UI số liệu dự án, công nợ NCC, chuông, menu

Song song sau T0. Agent: `ui-agy`.

**Files:**
- Create: `app/pages/materials/[projectId]/finance.vue`, `app/pages/materials/finance/suppliers.vue`, `app/components/materials/finance/MaterialFinanceTotals.vue`
- Create: `app/utils/notifications/app-notification-text.ts`
- Modify: `app/components/costs/CostNotificationBell.vue`, `app/components/app/navigation-permissions.ts`
- Test: `tests/unit/utils/app-notification-text.spec.ts`, `tests/e2e/material-finance-reports.spec.ts`

**Interfaces:**
- Consumes: `materialFinance.projectSummary/suppliers/listNotifications/readNotification`.
- Produces: `appNotificationText(notification: AppNotificationView): { title: string, body: string }`.

- [ ] **Step 1: Test nội dung thông báo (đỏ)**

```ts
import { describe, expect, it } from 'vitest'
import { appNotificationText } from '../../../app/utils/notifications/app-notification-text'

const n = (eventKind: string, payload: Record<string, string | number | null>) => ({
  id: '00000000-0000-4000-8000-000000000001', eventKind, projectId: null, linkPath: '/materials',
  payload, createdAt: '2026-10-15T01:00:00+00:00', readAt: null,
}) as never

describe('appNotificationText', () => {
  it('renders every event kind in Vietnamese', () => {
    expect(appNotificationText(n('material.order.created', { supplierName: 'NCC A' })).title).toBe('Đơn mua mới chờ hợp đồng')
    expect(appNotificationText(n('material.contract.recorded', { supplierName: 'NCC A', contractNo: 'HD-01', total: '110.0000' })).body).toContain('HD-01')
    expect(appNotificationText(n('material.contract.amended', { contractNo: 'HD-01', versionNo: 2 })).title).toBe('Hợp đồng có phụ lục mới')
    expect(appNotificationText(n('material.installment.due_soon', { installmentName: 'Tạm ứng', dueOn: '2026-10-17' })).title).toBe('Đợt thanh toán sắp đến hạn')
    expect(appNotificationText(n('material.installment.overdue', { installmentName: 'Tạm ứng', dueOn: '2026-10-10' })).title).toBe('Đợt thanh toán quá hạn')
    expect(appNotificationText(n('material.payment.submitted', { amount: '33.0000' })).title).toBe('Đề nghị chi chờ duyệt')
    expect(appNotificationText(n('material.payment.returned', { reason: 'Sai số tiền' })).body).toContain('Sai số tiền')
    expect(appNotificationText(n('material.payment.paid', { amount: '33.0000' })).title).toBe('Đề nghị chi đã được chi')
  })
  it('formats money without trailing zeros and dates as dd/MM/yyyy', () => {
    expect(appNotificationText(n('material.contract.recorded', { supplierName: 'NCC A', contractNo: 'HD-01', total: '1100000.0000' })).body).toContain('1.100.000')
    expect(appNotificationText(n('material.installment.overdue', { installmentName: 'Đợt 1', dueOn: '2026-10-10' })).body).toContain('10/10/2026')
  })
})
```

- [ ] **Step 2: Chạy, xác nhận đỏ, viết tiện ích**

Viết `app-notification-text.ts` bằng `switch (notification.eventKind)` đủ 8 nhánh, cùng tiêu đề như test. Body ghép từ payload:
- Tiền định dạng bằng `new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 4 }).format(Number(value))`. Chỉ dùng để hiển thị, không tính toán.
- Ngày định dạng `dd/MM/yyyy` từ chuỗi `YYYY-MM-DD` bằng cách tách chuỗi, không qua `Date`.

Run: `pnpm exec vitest run tests/unit/utils/app-notification-text.spec.ts`. Expected: PASS.

- [ ] **Step 3: Giao UI cho `ui-agy`**

Brief:
- `MaterialFinanceTotals.vue` nhận `totals` và hiện 7 chỉ số với nhãn spec mục 10. "Quá hạn" > 0 thì tô đỏ. Tiêu đề khối ghi rõ "Vật tư".
- `app/pages/materials/[projectId]/finance.vue`: totals cộng bảng hợp đồng (NCC, số hợp đồng, cam kết, đã chi, còn phải trả, quá hạn, link tới đơn).
- `app/pages/materials/finance/suppliers.vue`: danh sách NCC có totals, mở rộng ra xem các hợp đồng (dự án, số hợp đồng, link).
- `CostNotificationBell.vue`:
  - Giữ nguyên logic thông báo C1.
  - Thêm nguồn `materialFinance.listNotifications()`. Điều kiện đọc: có `material.read`, vì người nhận đều có quyền này.
  - Gộp hai danh sách, sắp theo thời gian mới nhất. Số chưa đọc cộng cả hai nguồn.
  - Bấm một thông báo vật tư thì gọi `readNotification`, `navigateTo(linkPath)` và dùng `appNotificationText` để hiển thị.
  - Một nguồn lỗi thì vẫn hiện nguồn còn lại.
- `navigation-permissions.ts`: thêm `{ to: '/materials/finance', label: 'Tài chính vật tư', icon: 'i-lucide-wallet', requiredPermission: … }`. Nếu kiểu `requiredPermission` chỉ nhận một quyền thì mở rộng sang `requiredAnyPermission: PermissionCode[]` với các quyền tài chính của T0, và cập nhật hàm lọc menu cùng test của nó.
- Trang `/materials/finance` (của T6) cần link tới `/materials/finance/suppliers` cho người có `material.finance.read`. Ghi lại để T8 nối nếu T6 chưa có.

- [ ] **Step 4: Playwright (mock)**

`tests/e2e/material-finance-reports.spec.ts`:
1. Giám đốc (`material.finance.read`) mở số liệu dự án: thấy "Cam kết 170", "Quá hạn 70" đúng theo mock summary.
2. Mở công nợ NCC: 2 NCC, mở rộng thấy hợp đồng.
3. Chuông có 1 thông báo C1 và 2 thông báo vật tư: badge hiện 3. Bấm thông báo vật tư thì gọi `POST /notifications/<id>/read` và chuyển tới `linkPath`.
4. Menu "Tài chính vật tư" ẩn với user chỉ có `material.read` + `material.order.manage`, hiện với thủ quỹ.

Run: `PLAYWRIGHT_PORT=4333 pnpm exec playwright test tests/e2e/material-finance-reports.spec.ts --project=chromium`
Expected: PASS.

- [ ] **Step 5: Review và commit**

```bash
git add app/pages/materials app/components/materials/finance/MaterialFinanceTotals.vue app/utils/notifications app/components/costs/CostNotificationBell.vue app/components/app/navigation-permissions.ts tests/unit/utils/app-notification-text.spec.ts tests/e2e/material-finance-reports.spec.ts
git commit -m "feat(materials): add finance reports, supplier balances and merged notifications"
```

---

### Task 8: Tích hợp, review, Cloud DEV

Tuần tự, sau khi T1–T7 xong và phần sửa A3 đã merge. Người làm: Opus điều phối, `verifier`, `reviewer`.

**Files:**
- Modify: `app/pages/materials/[projectId]/orders/[orderId].vue` (gắn `MaterialInvoicePanel`, `MaterialPaymentRequestPanel` vào slot), `app/components/materials/MaterialOrderCreatePanel.vue` (badge hợp đồng thành link tới trang chi tiết đơn), `app/pages/materials/finance/index.vue` (link công nợ NCC nếu còn thiếu)
- Create: `tests/e2e/material-finance-flow.spec.ts`, `docs/server/material-finance.md`
- Generated (chỉ khi được phép): `shared/types/database.types.ts`

- [ ] **Step 1: Merge lần lượt vào `feat/materials-a4-a5`**

Thứ tự merge: T4, T1, T2, T3, T5, T6, T7, nhánh sửa A3. Giải xung đột:
- Route files không trùng.
- `shared/schemas/costs/material-procurement.ts` chỉ T0 và T4 sửa.
- `tests/unit/server/material-orders.spec.ts` có thể cần gộp tay.

Sau mỗi merge chạy `pnpm typecheck`.

- [ ] **Step 2: Gắn kết UI**

- Gắn hai panel T6 vào slot của T5.
- Badge trong `MaterialOrderCreatePanel.vue` đổi thành `<NuxtLink :to="'/materials/' + projectId + '/orders/' + order.id">`.
- Không đổi logic khác của panel.

- [ ] **Step 3: E2E toàn luồng (mock)**

`tests/e2e/material-finance-flow.spec.ts` với state mock dùng chung giữa các route:
1. Kế toán ghi hợp đồng 2 đợt (tạm ứng 30%, còn lại 70%).
2. Lập đề nghị tạm ứng không hóa đơn.
3. Thủ quỹ trả lại, kế toán gửi lại, thủ quỹ duyệt và ghi chi.
4. Số liệu dự án: "Đã chi" bằng tiền tạm ứng.
5. Đợt 70% bị chặn khi chưa có hóa đơn. Nhập hóa đơn rồi lập đề nghị thì thành công.

Run: `PLAYWRIGHT_PORT=4334 pnpm exec playwright test tests/e2e/material-finance-flow.spec.ts tests/e2e/material-contract.spec.ts tests/e2e/material-payments.spec.ts tests/e2e/material-finance-reports.spec.ts tests/e2e/material-proposal.spec.ts --project=chromium`
Expected: PASS.

- [ ] **Step 4: `verifier` chạy kiểm tra**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Run: `pnpm exec vitest run tests/unit/shared/material-finance.spec.ts tests/unit/shared/material-finance-summary.spec.ts tests/unit/shared/material-procurement.spec.ts tests/unit/server/material-contracts.spec.ts tests/unit/server/material-payments.spec.ts tests/unit/server/material-finance-reads.spec.ts tests/unit/server/material-reminders.spec.ts tests/unit/server/material-orders.spec.ts tests/unit/server/material-evidence.spec.ts tests/unit/repositories tests/unit/utils tests/unit/config`
Run: `pnpm test:unit`, rồi so số test lỗi với baseline của `0c226cdd` (ghi ở T0 Step 1). Không được có lỗi mới.

- [ ] **Step 5: `reviewer` rà toàn nhánh**

Phạm vi: `git diff 0c226cdd..feat/materials-a4-a5`. Trọng tâm:
- authn/authz: mỗi RPC kiểm quyền đúng như spec mục 5, wrapper grant đúng.
- RLS các bảng mới, nhất là mua hàng và kỹ sư không thấy tiền.
- Validate input ở cả Zod và SQL.
- Khóa và thứ tự khóa (contract → request), idempotency, chặn tự duyệt và tự ghi chi.
- Secret của endpoint nhắc hạn.
- 5 mục Review Focus.

Sửa mọi finding mức cao trước khi đi tiếp.

- [ ] **Step 6: Cloud DEV (chỉ khi người dùng cho phép từng bước)**

Soạn packet xin phép gồm:
- project ref Cloud DEV
- SHA chính xác
- danh sách migration theo thứ tự (`20261015090000` → `20261015090400`)
- lệnh
- số lần chạy và retry cho phép
- dừng ngay ở lỗi đầu tiên

Các bước chờ phép riêng:
1. `pnpm db:dev:target`, dry-run rồi push migration.
2. `pnpm db:dev:types`, sau đó review diff `shared/types/database.types.ts`.
3. Chạy 5 file pgTAP mới cùng các file pgTAP vật tư cũ.
4. Chạy kịch bản đồng thời (T2 case 5) bằng script nếu pgTAP không có `dblink`.
5. Đặt `NUXT_MATERIAL_REMINDER_SECRET` cho môi trường và tạo cron InstaCloud 07:00 Asia/Ho_Chi_Minh gọi `POST /api/internal/material-reminders` (skill `insta`).
6. Deploy preview nhánh và smoke test bằng tay theo luồng của Step 3.

Báo cáo tách riêng ba nhóm: source/unit, SQL invariant, live. Bước nào chưa chạy thì ghi là chưa chạy.

- [ ] **Step 7: Tài liệu, graph và commit**

`docs/server/material-finance.md` mô tả bảng, RPC, mã lỗi, quyền, sự kiện thông báo, endpoint nhắc hạn và cách cấu hình secret và cron.

```bash
graphify update .
git add -A
git commit -m "feat(materials): integrate A4/A5 contract and payment flow"
```

Không merge vào `dev` hay `main` khi chưa được người dùng yêu cầu.

---

## Song song hóa

```
T0 ──┬── T1 (backend hợp đồng) ─────┐
     ├── T2 (backend chi) ──────────┤
     ├── T3 (backend số liệu) ──────┤
     ├── T4 (evidence) ─────────────┼── T8 tích hợp
     ├── T5 (UI hợp đồng, agy) ─────┤
     ├── T6 (UI chi, agy) ──────────┤
     └── T7 (UI số liệu, agy) ──────┘
Phần sửa A3 (đang làm) ─────────────┘
```

- Mỗi task một worktree tách từ `feat/materials-a4-a5` sau khi T0 đã merge.
- Repo có `.insta/`, nên mỗi task có thể có branch environment InstaCloud riêng. Tạo environment cần xin phép riêng.
- Các task backend song song chỉ chạy unit test và guard spec. pgTAP chỉ chạy ở T8 trên Cloud DEV khi được phép.
- File dùng chung chỉ T0 hoặc T8 sửa: `shared/constants/permissions.ts`, `app/repositories/contracts.ts`, `app/plugins/repositories.client.ts`, `shared/types/database.types.ts`. `navigation-permissions.ts` và `CostNotificationBell.vue` chỉ T7 sửa. `shared/schemas/costs/material-procurement.ts` chỉ T0 và T4 sửa, ở các vùng khác nhau.
