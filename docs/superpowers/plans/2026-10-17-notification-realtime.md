# Thông báo realtime và nhãn "Cần xử lý" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chuông thông báo tự cập nhật khi có thông báo mới, dùng Supabase Realtime. Thông báo đơn mua mới ghi tên người tạo và mang nhãn "Cần xử lý".

**Architecture:**
- **Migration lock 64:**
  - thêm 2 bảng thông báo vào publication `supabase_realtime`;
  - thêm `actorName` vào hàm phát thông báo đơn mua.
- **Trình duyệt:**
  - composable `useNotificationRealtime` đăng ký `postgres_changes`, rồi gọi lại hàm nạp của chuông qua bộ gom 1 giây;
  - nhãn và câu chữ thông báo đổi trong các util có sẵn.

**Tech Stack:** Nuxt 3, Vue 3, `@supabase/supabase-js` 2.x Realtime, TypeScript, Supabase Postgres (pgTAP), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-17-notification-realtime-design.md`

## Global Constraints

- **Nhánh:** nhánh tích hợp `feat/notification-realtime` (tách từ `feat/notification-center`, PR #47), worktree `.worktrees/notification-realtime`. Mỗi task chạy song song trong một worktree riêng.
- **Migration:**
  - File `supabase/migrations/20261017110000_c1_notifications_realtime.sql`, lock `(71842, 64)`.
  - Mở đầu bằng `set local lock_timeout = '5s'; set local statement_timeout = '90s'; select pg_catalog.pg_advisory_xact_lock(71842, 64);`, kết thúc bằng `notify pgrst, 'reload schema';`.
- **pgTAP:** file `supabase/tests/database/c1/c1_notifications_realtime.test.sql`, tiền tố UUID `c138`.
- **Câu chữ cố định:**
  - Nhãn: "Cần xử lý", tone `action`, màu tím (`bg-violet-100 text-violet-800`).
  - Tiêu đề đơn mua: `{projectName} · ĐH {n}-{m} – Chờ hợp đồng`.
  - Nội dung đơn mua: `{actorName} vừa tạo ĐH {n}-{m} · {supplierName} ({tóm tắt}), cần bạn bổ sung hợp đồng và chứng từ.`
  - Tên thay thế khi thiếu `actorName`: "Mua hàng".
- **Realtime:**
  - Chỉ dùng làm tín hiệu để nạp lại. Gom tín hiệu trong 1000 ms.
  - Lọc `recipient_id=eq.{currentUserId}`. Nghe cả `INSERT` và `UPDATE`.
- **Cloud và môi trường:**
  - Cloud DEV (push, `db:dev:types`, pgTAP) chỉ chạy khi user cho phép.
  - Không chạy `supabase migration repair`.
- **Kiểm thử:** baseline lint là 22 lỗi. Unit có khoảng 21 file lỗi sẵn trên Windows. E2e có lỗi sẵn ở `material-proposal` #12.

**Phụ thuộc:** T1 ∥ T2 ∥ T3 → T4 (e2e, tài liệu) → T5 (Cloud DEV, phải hỏi user).

## Review Focus

1. **Đổi công ty hoặc đăng xuất.** Kênh cũ phải bị huỷ. Không còn kênh nào sau khi component unmount. *(T3 unit)*
2. **10 tín hiệu trong 200 ms.** Chỉ gây đúng 1 lần nạp. *(T3 unit, dùng fake timers)*
3. **Người không có `cost.notification.read`.** Không đăng ký bảng `cost_workflow_notifications`. *(T3 unit)*
4. **Payload đơn mua cũ không có `actorName` hoặc mã ĐH.** Hiện câu cũ hoặc tên thay thế "Mua hàng", không có "undefined". *(T2 unit)*
5. **Realtime báo lỗi hoặc `CHANNEL_ERROR`.** Chuông vẫn nạp được khi mở hộp. Khi kênh `SUBSCRIBED` lại sau lỗi thì nạp lại một lần. *(T3 unit)*

## Cấu trúc file

| File | Task |
|---|---|
| `supabase/migrations/20261017110000_c1_notifications_realtime.sql`, pgTAP `c138`, `tests/unit/config/c1-notifications-realtime-guard.spec.ts`, runner map và `tests/unit/material-cloud-runner.spec.ts` | T1 |
| `app/utils/notifications/notification-display.ts`, `app/components/notifications/NotificationCard.vue` (màu tone mới), `app/utils/notifications/app-notification-text.ts`, cùng 2 file unit test tương ứng | T2 |
| `app/composables/useNotificationRealtime.ts`, `app/components/costs/CostNotificationBell.vue`, `tests/unit/composables/use-notification-realtime.spec.ts` | T3 |
| `tests/e2e/*` (nếu fixture cần), `docs/server/material-finance.md` | T4 |

---

### Task 1: DB — publication realtime và `actorName` cho đơn mua

- [ ] **Step 1: Viết guard spec.** Kiểm tra:
  - header lock 64 và footer;
  - có khối `do $$` thêm `public.app_notifications` và `public.cost_workflow_notifications` vào `supabase_realtime`, bỏ qua bảng đã có, và raise khi không có publication;
  - có `create or replace function private.c1_material_notify_order_created()` chứa `'actorName', private.c1_material_user_display_name(new.tenant_id, new.company_id, new.created_by)`;
  - không đụng tới trigger `material_order_created_notify`, tức là không drop hay tạo lại nó.
- [ ] **Step 2: Chạy guard.** Kết quả mong đợi: FAIL.
- [ ] **Step 3: Viết migration.**
  - Chép nguyên định nghĩa mới nhất của `c1_material_notify_order_created` (migration `20261017090100`, dòng 277–293), chỉ thêm khóa `actorName` vào `jsonb_build_object`.
  - Giữ nguyên người nhận, đường dẫn, khóa chống trùng và tóm tắt.
  - `create or replace` giữ nguyên các revoke đã có.
- [ ] **Step 4: Viết pgTAP `c138`.** Fixture theo mẫu `c1_material_proposal_notifications.test.sql`. Kiểm tra:
  - **Publication:** `pg_publication_tables` có đủ 2 bảng trong `supabase_realtime`.
  - **Có hồ sơ nhân viên:** tạo đơn mua bằng người mua hàng có hồ sơ nhân viên, rồi `set constraints all immediate;`. Payload `material.order.created` có `actorName` bằng họ tên nhân viên, và vẫn có `supplierName`, `summaryTotal`, `orderSeq`.
  - **Không có hồ sơ nhân viên:** `actorName` bằng email.
  - **Người nhận không đổi:** người có `material.contract.record` nhận thông báo; chính người tạo đơn thì không.
- [ ] **Step 5: Đăng ký `c138`** vào runner và runner spec. Chạy guard và runner spec. Kết quả mong đợi: PASS, trừ test runner phụ thuộc môi trường Windows vốn đã lỗi.
- [ ] **Step 6: Commit** `feat(notifications): realtime publication and order creator name`

### Task 2: Nhãn "Cần xử lý" và câu chữ đơn mua mới

**Interfaces — Produces:** `NotificationTone` thêm `'action'`.
- `materialNotificationBadge('material.order.created')` và `materialNotificationBadge('material.payment.approved')` cùng trả `{ label: 'Cần xử lý', tone: 'action' }`.

- [ ] **Step 1: Viết test.**
  - **Nhãn** (`tests/unit/utils/notification-display.spec.ts`): 2 sự kiện trên ra "Cần xử lý" / `action`. Các sự kiện khác không đổi.
  - **Câu chữ** (`tests/unit/utils/app-notification-text.spec.ts`), với payload `{ projectName:'A1 Alpha Project', proposalNo:10, orderSeq:1, supplierName:'Ngũ Kim Trung Nam', actorName:'Trần Thị B', summaryName1:'Lục giác', summaryName2:null, summaryTotal:1 }`:
    - tiêu đề `'A1 Alpha Project · ĐH 10-1 – Chờ hợp đồng'`;
    - nội dung `'Trần Thị B vừa tạo ĐH 10-1 · Ngũ Kim Trung Nam (Lục giác), cần bạn bổ sung hợp đồng và chứng từ.'`.
  - **Thiếu `actorName`:** nội dung bắt đầu bằng `'Mua hàng vừa tạo ĐH 10-1'`.
  - **`summaryTotal: 0`:** không có phần "(…)".
  - **Payload cũ chỉ có `{ supplierName }`:** tiêu đề và nội dung giống hệt test cũ.
- [ ] **Step 2: Chạy test.** Kết quả mong đợi: FAIL.
- [ ] **Step 3: Cài đặt.** Trong `NotificationCard.vue`, thêm màu cho tone `action` vào `toneClasses`.
- [ ] **Step 4: Chạy lại test và `pnpm typecheck`.** Kết quả mong đợi: PASS.
- [ ] **Step 5: Commit** `feat(notifications): action label and order creator in order notifications`

### Task 3: Realtime trong chuông thông báo

**Interfaces — Produces:**
```ts
// app/composables/useNotificationRealtime.ts
export interface NotificationRealtimeOptions {
  client: Pick<SupabaseClient, 'channel' | 'removeChannel'>
  userId: () => string | null
  sources: () => { material: boolean, cost: boolean }
  key: () => string            // đổi key ⇒ huỷ kênh cũ, mở kênh mới (dùng getFingerprint())
  onChange: () => void          // được gọi sau khi gom 1000 ms
  debounceMs?: number           // mặc định 1000
}
export function useNotificationRealtime(options: NotificationRealtimeOptions): { stop: () => void }
```

- [ ] **Step 1: Viết test `tests/unit/composables/use-notification-realtime.spec.ts`** với client giả ghi lại `channel().on(...).subscribe(cb)` và `removeChannel`. Kiểm tra:
  - **Đủ nguồn:** đăng ký `postgres_changes` cho `INSERT` và `UPDATE` trên `public.app_notifications` và `public.cost_workflow_notifications`, với `filter: 'recipient_id=eq.u1'`.
  - **Thiếu quyền khoản chi:** `sources` là `{ material: true, cost: false }` thì không có binding cho `cost_workflow_notifications`.
  - **Thiếu điều kiện:** `userId` null, hoặc cả hai nguồn false, thì không tạo kênh nào.
  - **Gom tín hiệu:** 10 sự kiện trong 200 ms dẫn tới đúng 1 lần `onChange` sau 1000 ms (fake timers).
  - **Đổi key:** `removeChannel` cũ được gọi rồi mới tạo kênh mới.
  - **Dừng:** `stop()` hoặc unmount scope thì `removeChannel` được gọi và không còn `onChange` nào.
  - **Kết nối lại:** callback `subscribe` nhận `'SUBSCRIBED'` sau một lần `'CHANNEL_ERROR'` thì gọi `onChange` một lần. Lần `'SUBSCRIBED'` đầu tiên thì không gọi.
- [ ] **Step 2: Chạy test.** Kết quả mong đợi: FAIL.
- [ ] **Step 3: Cài đặt composable.** Dùng `watch` trên `[userId(), key(), sources()]` và `onScopeDispose`.
- [ ] **Step 4: Nối vào `CostNotificationBell.vue`.**
  - `client` lấy từ `useNuxtApp().$supabaseClient`, `userId` lấy từ `companyAccessStore.currentUserId`.
  - `sources` dựa trên `canReadMaterial` và `canReadCost`; `key` là `getFingerprint()`.
  - `onChange` gọi `loadNotifications()`. Nếu đang `loading` hoặc `markingAll` thì đánh dấu "cần nạp lại" và nạp ngay khi xong.
  - Chỉ chạy ở client (`import.meta.client`).
- [ ] **Step 5: Kiểm tra.** Chạy test composable và `pnpm typecheck`; eslint trên các file đổi.
- [ ] **Step 6: Commit** `feat(notifications): refresh the notification center in realtime`

### Task 4: E2e và tài liệu

- [ ] **Step 1: E2e.**
  - Bản build e2e dùng Supabase URL giả, nên Realtime không kết nối được. Xác nhận chuông vẫn chạy: chạy `notification-center`, `material-finance-reports`, `c1-notification-detail-regression` và `material-proposal-codes` trên bản build production.
  - Sửa fixture nếu câu chữ đơn mua đổi làm assertion cũ hỏng, giữ nguyên ý định của assertion.
- [ ] **Step 2: Tài liệu.** Trong `docs/server/material-finance.md`:
  - thêm dòng migration 64;
  - thêm mục "Realtime": publication, RLS, tín hiệu → nạp lại, gom 1 giây;
  - ghi rằng `material.order.created` có `actorName`, và nhãn "Cần xử lý" áp cho 2 sự kiện.
- [ ] **Step 3: Commit** `docs(notifications): realtime and action label`

### Task 5: Cloud DEV và PR (chỉ chạy khi user cho phép)

- [ ] **Step 1: Kiểm tra trước.** Query chỉ đọc: publication `supabase_realtime` tồn tại trên Cloud DEV.
- [ ] **Step 2: Áp migration.** Chạy `pnpm db:dev:dry-run`; kết quả phải chỉ có migration 64. Hỏi user, rồi chạy `pnpm db:dev:push`.
- [ ] **Step 3: Sinh lại types và chạy pgTAP.** `pnpm db:dev:types`, rồi `pnpm db:dev:a1:test`. Kết quả mong đợi: 17/17 file qua.
- [ ] **Step 4: Thử realtime thật.** Trên preview local, mở chuông bằng một tài khoản. Bằng tài khoản khác, tạo một đơn đề xuất rồi gửi. Chuông của tài khoản đầu phải tăng số chưa đọc mà không cần làm mới.
- [ ] **Step 5: Kiểm tra và mở PR.** Verifier, rồi reviewer toàn nhánh. Sau đó push và mở PR vào `dev`, ghi rõ PR phụ thuộc PR #47 nếu #47 chưa merge.
