# Trung tâm thông báo kiểu Cockpit — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thay khung thông báo thả xuống bằng nút "Thông báo" và hộp nổi kiểu Cockpit (thẻ có nhãn loại và thời gian tương đối), kèm lệnh "Đánh dấu đã đọc hết" ở server.

**Architecture:**
- **Database:** một RPC mới đánh dấu cả hai nguồn (`app_notifications`, `cost_workflow_notifications`) cho người đang đăng nhập. Mỗi nguồn có mốc thời gian riêng.
- **Server:** một route mới `POST /api/companies/{companyId}/notifications/read-all` đặt trong material-finance read routes, dùng `c1RequestContext` (chỉ cần là thành viên công ty). Quyền theo từng nguồn do SQL kiểm tra.
- **Hàm thuần dùng chung** cho nhãn loại và thời gian tương đối, có unit test.
- **UI:** `CostNotificationBell.vue` viết lại thành nút kèm `UModal`; thẻ tách thành component con.

**Tech Stack:** Nuxt 3, Vue 3, Nuxt UI (`UModal`, `UIcon` lucide), TypeScript, Zod, Supabase Postgres (plpgsql, pgTAP), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-17-notification-center-design.md`

## Global Constraints

- **Nhánh:** nhánh tích hợp `feat/notification-center` (tách từ `feat/materials-proposal-codes`, PR #46), worktree `.worktrees/notification-center`. Mỗi task song song chạy trong một worktree riêng tách từ nhánh tích hợp.
- **Migration:**
  - File `supabase/migrations/20261017100000_c1_notifications_read_all.sql`, lock `71842, 63`.
  - Mở đầu bằng `set local lock_timeout = '5s'; set local statement_timeout = '90s'; select pg_catalog.pg_advisory_xact_lock(71842, 63);`, kết thúc bằng `notify pgrst, 'reload schema';`.
- **RPC:**
  - `private.c1_mark_notifications_read_all(target_company_id uuid, target_material_up_to timestamptz, target_cost_up_to timestamptz) returns jsonb`, trả `{"material": n, "cost": m}`.
  - Wrapper `public.c1_mark_notifications_read_all(...)` cùng chữ ký, grant cho `authenticated`. Hàm private bị revoke khỏi `public, anon, authenticated, service_role`.
- **Lỗi:** không phải thành viên đang hoạt động thì raise `P0001` / `PERMISSION_DENIED`.
- **Route và schema:**
  - Route `POST /api/companies/{companyId}/notifications/read-all`.
  - Body `{ materialUpTo: string | null, costUpTo: string | null }`, là datetime ISO có offset, strict.
  - Kết quả `{ material: number, cost: number }`, strict.
  - Không cần idempotency key.
- **Câu chữ cố định:**
  - Nút và hộp: "Thông báo", "Đánh dấu đã đọc hết", "Làm mới", "Xem thêm", "Đang nạp thông báo...", "Không có thông báo nào.", "Chưa nhận thông báo".
  - Nhãn: "Cần duyệt", "Đã duyệt", "Bị trả lại", "Nhắc hạn", "Thông tin".
  - Thời gian: "Vừa xong", "N phút trước", "N giờ trước", "N ngày trước"; từ 30 ngày trở lên là `dd/MM/yyyy`.
- **Cloud và môi trường:**
  - Cloud DEV (push, `db:dev:types`, pgTAP) chỉ chạy khi user cho phép.
  - Không chạy `supabase migration repair`. Không đụng production hay `dev-preview`.
- **Kiểm thử:** baseline lint là 22 lỗi. Unit có khoảng 21 file lỗi sẵn trên Windows. E2e có lỗi sẵn ở `material-proposal` #12.

**Phụ thuộc:** T1 ∥ T2 ∥ T3 → T4 (UI) → T5 (e2e, tài liệu) → T6 (Cloud DEV, phải hỏi user).

## Review Focus

1. **Một nguồn nạp lỗi.** Mốc của nguồn đó là null, nên lệnh không đánh dấu thông báo nào của nguồn đó. *(T1 pgTAP, T4)*
2. **Thông báo tạo sau mốc.** Vẫn là chưa đọc sau khi bấm "Đánh dấu đã đọc hết". *(T1 pgTAP)*
3. **Quyền theo từng nguồn.**
   - Người không có `material.read` thì thông báo vật tư không bị đánh dấu.
   - Người không có `cost.notification.read` thì thông báo khoản chi không bị đánh dấu.
   - Không ai đánh dấu được thông báo của người khác, hay của công ty khác. *(T1 pgTAP)*
4. **Thời điểm ở biên.** Ví dụ đúng 60 phút ra "1 giờ trước"; ngày ở tương lai do lệch giờ máy ra "Vừa xong". *(T3 unit)*
5. **Bàn phím và điện thoại.** Esc đóng hộp; tiêu điểm trả về nút mở. Ở bề rộng 375px không có thanh cuộn ngang. *(T5 e2e)*

## Cấu trúc file

| File | Task |
|---|---|
| `supabase/migrations/20261017100000_c1_notifications_read_all.sql` | T1 |
| `supabase/tests/database/c1/c1_notifications_read_all.test.sql` (tiền tố UUID `c137`) | T1 |
| `scripts/run-c1-cloud-dev-tests.mjs`, `tests/unit/material-cloud-runner.spec.ts` (đăng ký file), `tests/unit/config/c1-notifications-read-all-guard.spec.ts` | T1 |
| `shared/schemas/costs/material-finance.ts` (2 schema mới) | T2 |
| `server/features/costs/material-finance/finance-read-{repository,service,routes}.ts`, `server/api/companies/[companyId]/notifications/read-all.post.ts` | T2 |
| `app/repositories/material-finance.contracts.ts`, `app/repositories/http/http-material-finance-repository.ts` | T2 |
| `app/utils/notifications/notification-display.ts`, `tests/unit/utils/notification-display.spec.ts` | T3 |
| `app/components/costs/CostNotificationBell.vue`, `app/components/notifications/NotificationCard.vue` | T4 |
| `tests/e2e/material-finance-reports.spec.ts`, `tests/e2e/material-payments.spec.ts`, `tests/e2e/material-proposal-codes.spec.ts`, `tests/e2e/notification-center.spec.ts`, `docs/server/material-finance.md` | T5 |

---

### Task 1: DB — lệnh đánh dấu đã đọc hết

**Interfaces — Produces:** RPC theo Global Constraints.

- [ ] **Step 1: Viết guard spec** theo mẫu `tests/unit/config/c1-material-proposal-codes-guard.spec.ts`. Kiểm tra:
  - header và lock 63, footer;
  - có `create function private.c1_mark_notifications_read_all(target_company_id uuid, target_material_up_to timestamptz, target_cost_up_to timestamptz)` và wrapper public;
  - có revoke hàm private, có `grant execute on function public.c1_mark_notifications_read_all(uuid, timestamptz, timestamptz) to authenticated`;
  - có `delivery_state = 'available'`;
  - không có `create or replace` nào trên hàm có sẵn.
- [ ] **Step 2: Chạy guard.** Kết quả mong đợi: FAIL.
- [ ] **Step 3: Viết migration.** Hàm private làm các việc sau:
  - Lấy `tenant_id` từ `companies`. Yêu cầu `auth.uid()` có membership đang hoạt động, nếu không thì `PERMISSION_DENIED`.
  - **Nhánh vật tư** (chỉ khi `target_material_up_to is not null` và `private.c1_workflow_user_has_permission(t, c, auth.uid(), 'material.read')`): `update public.app_notifications set read_at = now() where recipient_id = auth.uid() and company_id = c and read_at is null and created_at <= target_material_up_to`.
  - **Nhánh khoản chi** (chỉ khi `target_cost_up_to is not null` và có `cost.notification.read`): update `cost_workflow_notifications` theo cùng điều kiện, cộng thêm `tenant_id = t` và `delivery_state = 'available'`.
  - Trả số dòng mỗi nhánh (`get diagnostics … row_count`).
  - Wrapper public: `language sql`.
- [ ] **Step 4: Viết pgTAP `c137`.** Dựng fixture công ty, người dùng và quyền theo mẫu `c1_material_proposal_notifications.test.sql` (bảng `cost_workflow_notifications` cần một decision; theo mẫu fixture khoản chi trong `supabase/tests/database/c1/` nếu có, nếu không thì chèn trực tiếp các dòng cần thiết). Kiểm tra:
  - **Đánh dấu theo mốc:** 3 thông báo vật tư chưa đọc lúc t1, t2, t3 (t3 > mốc) → material = 2, và t3 vẫn chưa đọc.
  - **Đọc rồi không đếm lại:** thông báo đã đọc từ trước giữ nguyên `read_at`, không bị đếm.
  - **Không đụng người khác:** thông báo của người nhận khác, hoặc của công ty khác, không đổi.
  - **Mốc null:** `target_material_up_to` null thì material = 0.
  - **Thiếu quyền vật tư:** người không có `material.read` → material = 0, thông báo vẫn chưa đọc.
  - **Khoản chi:** chỉ đánh dấu dòng `available`; dòng `undelivered` không đổi; người không có `cost.notification.read` → cost = 0.
  - **Không phải thành viên:** người ngoài công ty → `throws_ok … 'PERMISSION_DENIED'`.
  - **Gọi lặp lại:** lần gọi thứ hai trả `{"material":0,"cost":0}`.
- [ ] **Step 5: Đăng ký `c137`** vào runner và `material-cloud-runner.spec.ts`. Chạy guard và runner spec. Kết quả mong đợi: PASS, trừ test runner phụ thuộc môi trường Windows vốn đã lỗi.
- [ ] **Step 6: Commit** `feat(notifications): mark all notifications read in one command`

### Task 2: Server, schema và repository phía client

**Interfaces — Produces:**
- Hai schema mới trong `shared/schemas/costs/material-finance.ts`:
  - `notificationReadAllInputSchema` (strict, `materialUpTo` và `costUpTo` là `z.string().datetime({ offset: true }).nullable()`);
  - `notificationReadAllResultSchema` (strict, `{ material: z.number().int().min(0), cost: z.number().int().min(0) }`).
- Type `NotificationReadAllInput`, `NotificationReadAllResult`.
- `MaterialFinanceRepository.readAllNotifications(input: NotificationReadAllInput): Promise<NotificationReadAllResult>`.

- [ ] **Step 1: Viết test.**
  - **Server** (cùng chỗ với test route `readNotification` hiện có trong `tests/unit/server/material-finance-reads.spec.ts`):
    - body hợp lệ thì gọi RPC `c1_mark_notifications_read_all` với `target_material_up_to` và `target_cost_up_to` đúng;
    - body có khóa lạ, hoặc datetime sai, thì trả lỗi validation;
    - kết quả RPC được parse bằng schema.
  - **Client** (`tests/unit/repositories/` theo mẫu repository vật tư): `readAllNotifications` gửi `POST …/notifications/read-all` với đúng body.
- [ ] **Step 2: Chạy test.** Kết quả mong đợi: FAIL.
- [ ] **Step 3: Cài đặt.**
  - Thêm repository, service và route methods `readAllNotifications`.
  - Body đọc bằng helper `body()` trong `server/features/costs/material-finance/routes.ts`.
  - Tạo file route `read-all.post.ts`.
  - Thêm method vào contract và http repository phía client.
- [ ] **Step 4: Chạy lại test và `pnpm typecheck`.** Kết quả mong đợi: PASS.
- [ ] **Step 5: Commit** `feat(notifications): read-all route and client repository`

### Task 3: Hàm hiển thị nhãn và thời gian

**File:** `app/utils/notifications/notification-display.ts`

**Interfaces — Produces:**
```ts
export type NotificationTone = 'warning' | 'success' | 'error' | 'reminder' | 'info'
export interface NotificationBadge { label: string, tone: NotificationTone }
export function materialNotificationBadge(eventKind: AppNotificationView['eventKind'] | string): NotificationBadge
export const costNotificationBadge: NotificationBadge // { label: 'Đã duyệt', tone: 'success' }
export function relativeTimeText(iso: string, now: Date): string
export function fullDateTimeText(iso: string): string // "dd/MM/yyyy HH:mm", dùng cho tooltip
```

- [ ] **Step 1: Viết test `tests/unit/utils/notification-display.spec.ts`.**
  - **Nhãn:** mỗi sự kiện trong bảng ở spec mục 5 cho ra đúng nhãn và tone (`'Cần duyệt'`/`warning`, `'Đã duyệt'`/`success`, `'Bị trả lại'`/`error`, `'Nhắc hạn'`/`reminder`, `'Thông tin'`/`info`). Loại chưa biết `'material.unknown'` ra `'Thông tin'`.
  - **Thời gian**, với `now = 2026-10-17T10:00:00Z`:
    - 30 giây trước → `'Vừa xong'`; thời điểm ở tương lai → `'Vừa xong'`;
    - 59 phút → `'59 phút trước'`; 60 phút → `'1 giờ trước'`;
    - 23 giờ 59 phút → `'23 giờ trước'`; 24 giờ → `'1 ngày trước'`;
    - 29 ngày → `'29 ngày trước'`; 30 ngày → ngày dạng `'17/09/2026'` theo giờ máy (test dùng `TZ` cố định hoặc ngày giữa trưa để không phụ thuộc múi giờ).
- [ ] **Step 2: Chạy test.** Kết quả mong đợi: FAIL.
- [ ] **Step 3: Cài đặt.**
- [ ] **Step 4: Chạy test.** Kết quả mong đợi: PASS.
- [ ] **Step 5: Commit** `feat(notifications): badge and relative time helpers`

### Task 4: UI — nút và hộp thông báo

**Files:** `app/components/costs/CostNotificationBell.vue` (viết lại); `app/components/notifications/NotificationCard.vue` (tạo mới).

**Interfaces:**
- Consumes: T2 `readAllNotifications`, T3 các hàm hiển thị, `appNotificationText` có sẵn.

- [ ] **Step 1: Viết lại theo spec mục 3–5.**
  - **Nút viên thuốc:** `UIcon name="i-lucide-bell"`, chữ "Thông báo", huy hiệu đỏ ghi số chưa đọc (`99+`).
  - **Hộp:** `UModal` có tiêu đề "Thông báo" và nút ✕; dưới đó, căn phải, là "Đánh dấu đã đọc hết" và "Làm mới". Danh sách cuộn được.
  - **Xem thêm:** khi `nextCursor` khác null thì có nút "Xem thêm"; bấm thì nạp trang tiếp và nối vào cuối danh sách.
  - **Thẻ:** nhãn có màu theo tone, thời gian tương đối (tooltip là `fullDateTimeText`), tiêu đề đậm, nội dung xám. Thẻ chưa đọc có nền xanh nhạt và một chấm.
  - **Bấm thẻ:** thẻ vật tư giữ hành vi `openMaterial`; thẻ khoản chi gọi `markRead`, rồi điều hướng tới hồ sơ (gộp cách làm hiện có).
  - **Đánh dấu đã đọc hết:**
    - `materialUpTo` = `createdAt` lớn nhất trong danh sách vật tư đã nạp; null nếu nguồn đó nạp lỗi hoặc rỗng.
    - `costUpTo` tính tương tự cho nguồn khoản chi.
    - Gọi lệnh, rồi nạp lại danh sách. Nút bị tắt khi đang xử lý, hoặc khi không còn thông báo chưa đọc.
  - **Giữ nguyên:** các guard quyền, async tracker và cách gộp hai nguồn đang có. Hàm thời gian lấy `now` mỗi lần mở hoặc làm mới hộp.
  - **Tag "Chưa nhận thông báo":** giữ trên thẻ khoản chi có `deliveryState = 'undelivered'`.
  - **Số chưa đọc trên nút:** đếm các thẻ chưa đọc trong danh sách đã nạp, như hiện nay.
- [ ] **Step 2: Verifier kiểm tra.**
  - Chạy `pnpm typecheck` và `pnpm lint` (không tăng quá 22 lỗi).
  - Chụp màn hình hộp ở desktop và ở 375px bằng dữ liệu stub e2e.
- [ ] **Step 3: Commit** `feat(notifications): Cockpit-style notification center`

### Task 5: E2e và tài liệu

- [ ] **Step 1: Sửa các e2e đang dùng chuông.** `material-finance-reports`, `material-payments` và `material-proposal-codes` cần đổi selector mở hộp và nút "Làm mới". Giữ nguyên ý định của từng assertion cũ.
- [ ] **Step 2: Viết `tests/e2e/notification-center.spec.ts`.** Stub 2 nguồn. Kiểm tra:
  - **Nút và nhãn:** nút "Thông báo" hiện số chưa đọc; mở hộp thấy nhãn "Cần duyệt" và "Đã duyệt".
  - **Xem thêm:** có `nextCursor` thì có "Xem thêm"; bấm thì có thêm thẻ.
  - **Đánh dấu đã đọc hết:** gửi đúng body (assert `materialUpTo` bằng `createdAt` mới nhất), rồi nạp lại.
  - **Một nguồn lỗi:** nguồn khoản chi trả 500 thì body có `costUpTo: null`.
  - **Bàn phím:** Esc đóng hộp, tiêu điểm về nút mở.
  - **Điện thoại:** ở 375px không có cuộn ngang (`scrollWidth <= clientWidth`).
- [ ] **Step 3: Thêm vào tài liệu.** Trong `docs/server/material-finance.md`, thêm dòng migration 63 và mô tả route read-all.
- [ ] **Step 4: Chạy e2e trên bản build production** (port 4317, env giả lập như `playwright.config.ts`) cho 4 file trên và `material-proposal-codes`. Kết quả mong đợi: PASS.
- [ ] **Step 5: Commit** `test(notifications): e2e for the notification center`

### Task 6: Cloud DEV và PR (chỉ chạy khi user cho phép)

- [ ] **Step 1: Áp migration.** Chạy `pnpm db:dev:dry-run`; kết quả phải chỉ có migration 63. Hỏi user, rồi chạy `pnpm db:dev:push`.
- [ ] **Step 2: Sinh lại types và chạy pgTAP.** `pnpm db:dev:types`, rồi commit. Chạy `pnpm db:dev:a1:test`; kết quả mong đợi: 16/16 file qua.
- [ ] **Step 3: Kiểm tra và mở PR.** Verifier chạy typecheck, lint, build, unit. Reviewer đọc toàn nhánh. Sau đó push và mở PR vào `dev`, ghi rõ PR phụ thuộc PR #46 nếu #46 chưa merge.
