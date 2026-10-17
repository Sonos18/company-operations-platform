# Thông báo realtime và nhãn "Cần xử lý"

Ngày: 2026-10-17. Nền: nhánh `feat/notification-center` (PR #47).

## 1. Lý do

User dùng thử trung tâm thông báo và thấy hai vấn đề:

1. **Thông báo không realtime.** Danh sách chỉ nạp khi tải trang, khi mở hộp, hoặc khi bấm "Làm mới". User muốn thông báo hiện ra ngay khi có, và đã chọn **Supabase Realtime** (cách A).
2. **Thông báo "Đơn mua mới chờ hợp đồng" gửi kế toán bị sai ý:**
   - Không ghi ai tạo đơn ("không thấy phụ trách").
   - Mang nhãn "Thông tin", trong khi kế toán phải bổ sung hợp đồng và chứng từ.

   User đồng ý dùng nhãn mới **"Cần xử lý"** cho thông báo này, và cho cả thông báo "Đề nghị chi đã lập UNC" gửi kế toán (kế toán còn phải tải biên lai lên).

## 2. Phạm vi

**Làm:**

| # | Thay đổi |
|---|---|
| R1 | Đưa `app_notifications` và `cost_workflow_notifications` vào kênh Supabase Realtime |
| R2 | Chuông lắng nghe thông báo mới và thay đổi trạng thái đọc của chính người dùng, rồi tự nạp lại danh sách và số chưa đọc |
| L1 | Nhãn mới "Cần xử lý" (màu tím) cho `material.order.created` và `material.payment.approved` |
| L2 | Thông báo đơn mua mới ghi tên người tạo đơn, tiêu đề và nội dung mới |

**Không làm:**
- Thông báo đẩy khi đã đóng trình duyệt (web push), âm thanh, hay thông báo của hệ điều hành.
- Đổi câu chữ các thông báo khác.
- Realtime cho các màn hình khác ngoài chuông thông báo.

**Chống mục tiêu:**
- Một người nhận được tín hiệu hoặc nội dung thông báo của người khác.
- Kênh realtime còn treo lại khi đổi công ty, đăng xuất, hoặc rời trang. Như vậy là rò kết nối, hoặc nhận tín hiệu của phiên cũ.
- Một loạt thông báo đến cùng lúc làm chuông gọi API dồn dập.

## 3. Realtime (R1, R2)

**Database (migration mới):**
- Thêm hai bảng vào publication `supabase_realtime`.
  - Bảng nào đã có trong publication thì bỏ qua, để migration không lỗi.
  - Nếu publication chưa tồn tại thì báo lỗi rõ ràng.
- Quyền đọc đã có sẵn và giữ nguyên:
  - **`app_notifications`:** quyền `select` cho `authenticated`, kèm policy chỉ cho người nhận đọc dòng của mình.
  - **`cost_workflow_notifications`:** policy chỉ cho người nhận có quyền `cost.notification.read`.

  Supabase Realtime áp dụng RLS cho từng người đăng ký, nên mỗi người chỉ nhận dòng của chính mình.

**Trình duyệt:**
- Dùng Supabase client có sẵn (`app/plugins/supabase.client.ts`, có phiên đăng nhập của người dùng).
- Đăng ký `postgres_changes` cho `INSERT` và `UPDATE` trên hai bảng, lọc `recipient_id=eq.{user id}`.
  - Chỉ đăng ký bảng của nguồn mà người dùng có quyền: `material.read` cho vật tư, `cost.notification.read` cho khoản chi.
- **Tín hiệu realtime chỉ dùng để báo "có thay đổi".** Khi nhận tín hiệu, chuông nạp lại danh sách qua các API đang có, nên dữ liệu vẫn đi qua Zod strict, lọc theo công ty, và theo đúng quy tắc hiện tại. Không dựng thẻ thông báo từ dữ liệu realtime.
- **Gom tín hiệu:** nhiều tín hiệu trong khoảng 1 giây chỉ gây một lần nạp lại.
- **Vòng đời kênh:**
  - Mở khi có người dùng, có công ty và có quyền.
  - Đóng rồi mở lại khi đổi công ty hoặc đổi quyền.
  - Đóng khi đăng xuất hoặc khi component bị huỷ.
  - Khi kết nối lại sau mất mạng, nạp lại một lần để bù những gì đã lỡ.
- **Khi hộp đang mở:** nạp lại trang đầu. Các trang đã nạp thêm bằng "Xem thêm" bị thay bằng trang đầu, giống khi bấm "Làm mới".
- **Khi hộp đang đóng:** chỉ cập nhật số chưa đọc trên nút.
- **Realtime lỗi hoặc không kết nối được:** chuông vẫn hoạt động như hiện nay. Không báo lỗi lên giao diện; chỉ ghi log ở console khi chạy dev.

## 4. Nhãn "Cần xử lý" và thông báo đơn mua mới (L1, L2)

**Nhãn và màu:**

| Nhãn | Màu | Thông báo |
|---|---|---|
| Cần xử lý | Tím | `material.order.created`, `material.payment.approved` |

Các nhãn khác giữ nguyên. Riêng `material.payment.approved` chuyển từ "Đã duyệt" sang "Cần xử lý".

**Thông báo `material.order.created`:**
- Payload thêm `actorName`, là tên người tạo đơn mua: lấy họ tên nhân viên, không có thì dùng email. Cách lấy giống thông báo duyệt đơn (`c1_material_user_display_name`).
- **Tiêu đề:** `{dự án} · ĐH 10-1 – Chờ hợp đồng`.
- **Nội dung:** `{actorName} vừa tạo ĐH 10-1 · {nhà cung cấp} ({tóm tắt}), cần bạn bổ sung hợp đồng và chứng từ.`
  - Tóm tắt rỗng thì bỏ phần "(…)".
  - Payload thiếu `actorName` thì dùng "Mua hàng" thay cho tên.
- **Thông báo cũ** không có mã ĐH: giữ đúng tiêu đề và nội dung cũ.

## 5. Ràng buộc

- Theo quy ước đang dùng:
  - migration chỉ tiến, lock số kế tiếp (64);
  - hàm `private.*` security definer;
  - có pgTAP và unit test.
- **Thay đổi hàm phát thông báo đơn mua** (`private.c1_material_notify_order_created`, định nghĩa mới nhất ở migration `20261017090100`) phải giữ nguyên:
  - trigger deferred;
  - người nhận;
  - khóa chống trùng;
  - các khóa payload đang có.
- **Tính đúng khi realtime không chạy:** pgTAP không kiểm được realtime. Phần trình duyệt cần unit test với Supabase client giả: đăng ký, lọc, gom tín hiệu, huỷ kênh.
- **Cloud DEV:** áp migration lên Cloud DEV phải hỏi user trước. Realtime phải đang bật trên project Cloud DEV.

## 6. Quyết định của tôi (user chưa xác nhận riêng)

- Realtime chỉ là tín hiệu để nạp lại, không dựng thẻ từ dữ liệu realtime.
- Gom tín hiệu trong 1 giây.
- Màu tím cho "Cần xử lý".
- Tiêu đề "– Chờ hợp đồng" và câu "cần bạn bổ sung hợp đồng và chứng từ".
- Chữ "Mua hàng" khi thiếu tên người tạo.
- Tín hiệu từ công ty khác (policy của `app_notifications` không lọc theo công ty) cũng gây một lần nạp lại. Chấp nhận, vì API vẫn lọc theo công ty.
- Thông báo khoản chi được tạo ở trạng thái `undelivered` rồi mới chuyển `available`, nên phải nghe cả `UPDATE`. Cả hai loại tín hiệu đi chung một bộ gom.
- Bỏ qua tín hiệu khi đang nạp hoặc đang "đánh dấu đã đọc hết", vì các thao tác đó tự nạp lại xong mới thôi. Tín hiệu đến lúc ấy được dồn thành một lần nạp sau cùng.
- Kênh gắn với user id cộng dấu vân tay công ty và quyền (`getFingerprint()`). Đóng ở cùng chỗ chuông đang gọi `clear()`, và khi component bị huỷ.

## 7. Để builder tự quyết

- Tách phần realtime thành composable riêng hay để trong component.
- Tên kênh realtime.
- Cách viết tone mới trong `notification-display.ts`.
