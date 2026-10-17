# Trung tâm thông báo kiểu Cockpit

Ngày: 2026-10-17. Nền: nhánh `feat/materials-proposal-codes` (PR #46).

## 1. Lý do

Chuông thông báo hiện tại (`app/components/costs/CostNotificationBell.vue`) chỉ là biểu tượng 🔔 kèm số chưa đọc. Bấm vào thì mở một khung nhỏ thả xuống. Nhiều loại thông báo mới vừa được thêm (đơn chờ duyệt, đã duyệt, bị trả lại, đề nghị chi…), nên khung này chật và khó đọc.

User muốn giao diện **giống Cockpit Tools**, theo ảnh mẫu user gửi:
- một nút dạng viên thuốc có chuông và chữ;
- bấm vào thì mở hộp nổi giữa màn hình;
- trong hộp là các thẻ, mỗi thẻ có nhãn loại, thời gian tương đối, tiêu đề đậm và nội dung xám.

User cũng muốn có nút **đánh dấu đã đọc hết**, làm bằng một lệnh mới ở server (user chọn cách 2, không gọi lần lượt từng thông báo).

## 2. Phạm vi

**Làm:**

| # | Thay đổi |
|---|---|
| U1 | Nút mở gồm biểu tượng chuông và chữ "Thông báo", có số chưa đọc |
| U2 | Hộp thông báo nổi giữa màn hình, thay cho khung thả xuống |
| U3 | Thẻ thông báo có nhãn loại, thời gian tương đối, tiêu đề, nội dung, và trạng thái chưa đọc |
| U4 | Nút "Đánh dấu đã đọc hết" dùng lệnh mới ở server, kèm nút "Làm mới" |

**Không làm:**
- Thay đổi câu chữ của từng thông báo (đã làm ở PR #46).
- Đẩy thông báo thời gian thực (websocket, push).
- Trang thông báo riêng, lọc hoặc tìm kiếm thông báo.
- Thông báo kiểu "Info" chung cho toàn hệ thống như Cockpit. Chỉ hiện hai nguồn đang có: phê duyệt khoản chi và vật tư.

**Chống mục tiêu:**
- "Đánh dấu đã đọc hết" đánh dấu cả thông báo **đến sau** lúc người dùng mở hoặc làm mới hộp. Thông báo cũ hơn thì được đánh dấu hết, kể cả khi chưa cuộn tới, vì nút ghi rõ là "hết".
- Một người đánh dấu được thông báo của người khác.
- Hộp mới không dùng được bằng bàn phím, hoặc vỡ bố cục trên điện thoại.

## 3. Nút mở (U1)

- Dạng viên thuốc: nền trắng, viền mảnh, bo tròn, bóng rất nhẹ. Bên trong là biểu tượng chuông dạng nét (lucide `bell`, không dùng emoji) và chữ **"Thông báo"**.
- Còn thông báo chưa đọc thì có huy hiệu đỏ ghi số, quá 99 thì ghi "99+".
- Vẫn đặt ở chỗ hiện tại (`cost-notification-toolbar` trong `app/layouts/default.vue`). Hiện khi người dùng có `cost.notification.read` hoặc `material.read`, như bây giờ.

## 4. Hộp thông báo (U2, U4)

- **Hộp nổi giữa màn hình**, rộng tối đa khoảng 720px, bo góc lớn. Nền phía sau tối và mờ đi.
  - Trên điện thoại, hộp gần như chiếm toàn màn hình, cách mép 16px, không có thanh cuộn ngang.
- **Đầu hộp:** tiêu đề **"Thông báo"** bên trái, nút ✕ bên phải.
- **Dưới đầu hộp, căn phải:** nút **"Đánh dấu đã đọc hết"** và nút **"Làm mới"**.
  - "Đánh dấu đã đọc hết" bị mờ khi không còn thông báo chưa đọc, hoặc khi đang xử lý.
- **Thân hộp** cuộn được, chứa danh sách thẻ, mới nhất ở trên.
  - Đang nạp: hiện "Đang nạp thông báo...".
  - Không có thông báo: hiện "Không có thông báo nào."
- **Đóng hộp:** nút ✕, phím Esc, hoặc bấm ra ngoài.
  - Khi hộp mở thì tiêu điểm chuyển vào trong hộp và không thoát ra ngoài được (focus trap). Khi đóng thì tiêu điểm trả về nút mở.
  - Có `role="dialog"` và `aria-modal="true"`.
- Dữ liệu được nạp mỗi lần mở hộp và mỗi lần bấm "Làm mới", giống hiện nay.
- **Xem thêm:** thông báo vật tư được nạp theo trang, 20 thông báo một lần. Khi server còn `nextCursor` thì cuối danh sách có nút **"Xem thêm"** để nạp trang tiếp theo.
- **Số chưa đọc** trên nút đếm theo các thông báo đã nạp, giống hiện nay. Không thêm lệnh đếm riêng.

## 5. Thẻ thông báo (U3)

- Thẻ có nền trắng, viền mảnh, bo góc. Bên trong gồm:
  - dòng trên: **nhãn loại** ở góc trái, **thời gian tương đối** ở góc phải, chữ xám;
  - tiêu đề in đậm;
  - nội dung chữ xám, xuống dòng bình thường.
- **Chưa đọc:** nền xanh rất nhạt và một chấm nhỏ cạnh nhãn. **Đã đọc:** nền trắng.
- **Bấm vào thẻ:** đánh dấu đã đọc rồi mở trang liên quan, giữ cách làm hiện nay.
  - Thông báo vật tư mở `linkPath`.
  - Thông báo phê duyệt khoản chi mở trang hồ sơ đã duyệt, như link "Xem hồ sơ đã duyệt" hiện có.
- **Thông báo phê duyệt khoản chi:**
  - Tiêu đề vẫn là tiêu đề theo loại quyết định, như hiện nay ("Quyết định …").
  - Nội dung giữ câu "Phê duyệt độc lập với xác nhận thu/chi thực tế."
  - Nhãn là "Đã duyệt", vì loại thông báo này chỉ được tạo khi giám đốc ra quyết định trên hồ sơ, và giao diện hiện đang gọi là "hồ sơ đã duyệt".
  - Bấm vào thẻ vẫn gọi lệnh đánh dấu từng thông báo hiện có (kèm idempotency key).
- **Thông báo "chưa nhận"** (`deliveryState = 'undelivered'`): giữ tag "Chưa nhận thông báo" như hiện nay. Thực tế lệnh liệt kê thông báo đã tự chuyển các thông báo này sang `available`, nên tag hiếm khi xuất hiện. Đây là hành vi đang có, giữ nguyên.

**Nhãn loại:**

| Nhãn | Màu | Thông báo |
|---|---|---|
| Cần duyệt | Vàng | `material.proposal.submitted`, `material.payment.submitted` |
| Đã duyệt | Xanh lá | `material.proposal.approved`, `material.payment.approved`, `material.payment.paid`, thông báo phê duyệt khoản chi |
| Bị trả lại | Đỏ | `material.proposal.returned`, `material.payment.returned` |
| Nhắc hạn | Cam | `material.installment.due_soon`, `material.installment.overdue` |
| Thông tin | Xanh dương | `material.order.created`, `material.contract.recorded`, `material.contract.amended`, và loại chưa biết |

**Thời gian tương đối** (tiếng Việt), theo giờ máy người dùng:

| Khoảng thời gian | Hiển thị |
|---|---|
| Dưới 1 phút | "Vừa xong" |
| Dưới 1 giờ | "N phút trước" |
| Dưới 24 giờ | "N giờ trước" |
| Dưới 30 ngày | "N ngày trước" |
| Từ 30 ngày trở lên | ngày đầy đủ dd/MM/yyyy |

Rê chuột vào thời gian thì hiện ngày giờ đầy đủ.

## 6. Lệnh "đánh dấu đã đọc hết" (U4)

**Một lệnh RPC mới** đánh dấu cả hai nguồn trong một lần, cho người đang đăng nhập, trong công ty đang chọn.

**Đầu vào:**
- `company_id`;
- **hai mốc thời gian riêng cho từng nguồn:** `materialUpTo` và `costUpTo`. Mỗi mốc là thời điểm tạo của thông báo mới nhất **của nguồn đó** mà hộp đang hiển thị.
  - Mốc là null khi nguồn đó không nạp được, hoặc không có thông báo nào. Khi đó lệnh bỏ qua nguồn đó.
  - Nhờ vậy, khi một nguồn nạp lỗi thì không đánh dấu nhầm thông báo của nguồn ấy.

Chỉ thông báo có `created_at <= mốc` của nguồn tương ứng mới được đánh dấu. Thông báo đến sau lúc nạp danh sách vẫn còn là chưa đọc (chống mục tiêu thứ nhất). Nút còn bấm được khi ít nhất một nguồn có thông báo chưa đọc.

**Phạm vi:**
- **Thông báo vật tư** (`app_notifications`):
  - chỉ khi người dùng có `material.read`;
  - `recipient_id = auth.uid()`, đúng công ty, `read_at is null`;
  - set `read_at = now()`.
- **Thông báo phê duyệt khoản chi** (`cost_workflow_notifications`):
  - chỉ khi người dùng có `cost.notification.read`;
  - `recipient_id = auth.uid()`, đúng tenant và công ty, `delivery_state = 'available'`, `read_at is null`;
  - set `read_at = now()`.
  - Không động tới thông báo `undelivered`, vì người dùng chưa từng thấy chúng.

**Quyền và kết quả:**
- Kiểm tra quyền theo cách các lệnh đọc từng thông báo đang làm: người dùng phải là thành viên đang hoạt động của công ty.
- Không ai đánh dấu được thông báo của người khác.
- Trả về số thông báo đã đánh dấu ở mỗi nguồn.
- Gọi lặp lại không gây lỗi; lần sau trả về 0.
- Không cần idempotency key hay command receipt. Mốc thời gian đã làm cho lệnh cho cùng một kết quả khi gọi lặp lại. Viết như một hàm thường, không dùng bộ helper lệnh của phê duyệt khoản chi.

**Sau khi gọi xong:** giao diện nạp lại danh sách, và số chưa đọc cập nhật theo.

## 7. Ràng buộc

- Theo các quy ước đang dùng:
  - migration chỉ tiến, có advisory lock số kế tiếp (63, nếu PR #46 vẫn là migration mới nhất);
  - hàm `private.*` dạng security definer, có wrapper `public.*` grant cho `authenticated`;
  - schema Zod strict;
  - có test pgTAP và unit test.
- **Route server mới** đặt cạnh các route thông báo hiện có. Có repository phía server và phía client, theo mẫu `readNotification`.
- **Giao diện:**
  - Giữ một component (`CostNotificationBell.vue`, có thể đổi tên cho đúng vai trò). Nếu file quá dài thì tách thẻ thành component con.
  - Dùng UI kit đang có của dự án (Nuxt UI, các biến màu `--color-*`).
- **Cloud DEV:** áp migration lên Cloud DEV phải hỏi user trước.

## 8. Quyết định của tôi (user chưa xác nhận riêng)

- Bảng nhãn và màu ở mục 5.
- Cách hiển thị chưa đọc: nền xanh nhạt kèm chấm.
- Định dạng thời gian tương đối.
- Mốc thời gian riêng cho từng nguồn, để không đánh dấu thông báo đến sau lúc nạp. Thông báo cũ hơn thì vẫn đánh dấu hết.
- Thêm nút "Xem thêm" cho thông báo vật tư. Số chưa đọc đếm theo các thông báo đã nạp.
- Nửa vật tư của lệnh mới yêu cầu quyền `material.read`. Lệnh đọc từng thông báo hiện có chỉ kiểm tra tư cách thành viên, nên lệnh mới chặt hơn.
- Nhãn "Đã duyệt" cho thông báo phê duyệt khoản chi.
- Không đánh dấu thông báo phê duyệt khoản chi đang `undelivered`.
- Hộp rộng tối đa 720px; trên điện thoại gần như toàn màn hình.

## 9. Để builder tự quyết

- Tên lệnh RPC, route và khóa JSON.
- Gom một RPC hay hai RPC theo nguồn, miễn là giao diện chỉ gọi **một** route.
- Chi tiết màu chính xác trong palette của dự án, miễn là đúng sắc độ đã nêu ở mục 5.
