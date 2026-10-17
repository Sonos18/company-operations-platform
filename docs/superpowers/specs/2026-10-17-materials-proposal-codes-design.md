# Vật tư — Số đơn đề xuất, mã đơn đặt hàng và thông báo duyệt đơn

Ngày: 2026-10-17. Nền: nhánh `feat/materials-a4a5-flow-adjust` (PR #45). Tài liệu server: `docs/server/material-finance.md`.

## 1. Lý do

Hiện mỗi đơn đề xuất và đơn đặt hàng chỉ có mã nội bộ (UUID), nên người dùng không có cách gọi tên đơn. Ở công trường, mọi người đang gọi đơn theo tên vật tư.

User muốn **chuẩn hóa một cách gọi chung**, dùng được trên phần mềm, trong cuộc họp và khi trao đổi bên ngoài, ví dụ "đơn 18 Eo Gió".

Số chạy theo **từng dự án**, không chạy theo công ty, vì số của công ty sẽ quá lớn và khó nhớ. Thông báo phải tóm tắt nội dung đơn, để người nhận biết đơn nói về gì mà không phải mở ra.

Hiện kỹ sư gửi đơn thì mua hàng **không nhận được thông báo nào**, và kỹ sư cũng không được báo khi đơn được duyệt hay bị trả lại.

## 2. Phạm vi

**Làm:**

| # | Thay đổi |
|---|---|
| N1 | Mỗi đơn đề xuất có **số đơn** chạy riêng theo dự án: 1, 2, 3… Hiển thị là **Đơn 18**. |
| N2 | Mỗi đơn đặt hàng có **mã** gồm số của đơn đề xuất và số thứ tự trong đơn đó. Hiển thị là **ĐH 18-1**, **ĐH 18-2**… |
| N3 | **Tóm tắt nội dung** do hệ thống tự tạo từ tên vật tư. Kỹ sư không phải nhập gì thêm. |
| N4 | Hiển thị số và mã ở mọi nơi đang nhắc tới đơn đề xuất hoặc đơn đặt hàng, kể cả các màn hình và thông báo tài chính. |
| N5 | Ba thông báo mới cho đơn đề xuất: chờ duyệt (gửi mua hàng), đã duyệt và bị trả lại (gửi kỹ sư). |
| N6 | Đánh số bù cho dữ liệu đang có. |

**Không làm:**
- Tìm kiếm hoặc lọc theo số đơn.
- Cho người dùng tự đặt hoặc sửa số đơn.
- Đổi tên dự án hoặc mã dự án.
- Thông báo khi kỹ sư mới lưu nháp.
- In hoặc xuất số đơn ra file.

**Chống mục tiêu** (nếu xảy ra thì coi như làm sai, dù chạy được):
- Hai đơn trong cùng một dự án có cùng số.
- Một số đã cấp mà đổi đi hoặc bị dùng lại.
- Thông báo lộ nội dung đơn cho người không có quyền xem vật tư.

## 3. Số đơn đề xuất (N1)

- Cấp **ngay khi tạo đơn**, kể cả khi đơn còn là nháp.
- Bắt đầu từ 1 trong mỗi dự án và tăng dần.
- Số **không đổi** suốt vòng đời của đơn: bị trả về, sửa rồi gửi lại vẫn giữ số cũ.
- Số **không dùng lại**. Đơn nháp bỏ dở vẫn giữ số của nó, nên dãy số có thể có khoảng trống. Chấp nhận điều này.
- Hai người tạo đơn cùng lúc trong cùng dự án phải nhận hai số khác nhau. Cơ sở dữ liệu phải bảo đảm số là duy nhất trong mỗi dự án.

**Hiển thị:**
- Trong các màn hình của một dự án: **Đơn 18**.
- Ở nơi gộp nhiều dự án (thông báo, danh sách chung): **Eo Gió · Đơn 18**. Phần "Eo Gió" là tên dự án (`projects.name`), không phải mã dự án.
- Khi đơn đã gửi lại từ lần thứ hai trở đi (`revision_no` > 1), chỗ cần phân biệt sẽ ghi thêm **(lần 2)**, **(lần 3)**… Số đơn vẫn giữ nguyên.

## 4. Mã đơn đặt hàng (N2)

Một đơn đề xuất có thể tách thành nhiều đơn đặt hàng, còn mỗi đơn đặt hàng chỉ thuộc một đơn đề xuất.

- Mã gồm số của đơn đề xuất, dấu gạch ngang, rồi số thứ tự của đơn đặt hàng trong đơn đề xuất đó: **18-1**, **18-2**…
- Số thứ tự bắt đầu từ 1 trong mỗi đơn đề xuất và được cấp khi tạo đơn đặt hàng.
- Đơn đặt hàng bị hủy **vẫn giữ mã của nó**, và số không được dùng lại. Ví dụ 18-2 bị hủy thì đơn đặt hàng tiếp theo là 18-3.
- Mã là duy nhất trong mỗi đơn đề xuất, không đổi, và an toàn khi hai người tạo đơn đặt hàng cùng lúc.

**Hiển thị:**
- Tiền tố **ĐH**, để không nhầm với "Đơn 18" của đơn đề xuất.
- Trong dự án: **ĐH 18-1 · Hòa Phát**. Phần sau là tên nhà cung cấp của đơn đặt hàng.
- Ngoài dự án: **Eo Gió · ĐH 18-1 · Hòa Phát**.

## 5. Tóm tắt nội dung (N3)

- Lấy **tên của 2 vật tư đầu tiên**, phần còn lại ghi số lượng: "Thép D10, Xi măng PCB40 và 3 vật tư khác".
  - Đơn có 1 vật tư: chỉ ghi tên vật tư đó.
  - Đơn có 2 vật tư: "Thép D10, Xi măng PCB40".
- **Thứ tự "2 vật tư đầu tiên":** theo thứ tự tạo dòng (`created_at`), trùng thời điểm thì xếp theo tên vật tư, rồi `id`. Các bảng dòng hiện không có cột vị trí. Không thêm cột vị trí.
- **Nguồn dòng của đơn đề xuất:** đúng những dòng mà trang chi tiết đơn đang hiển thị.
  - Đơn nháp hoặc bị trả lại: lấy dòng đang hiệu lực (`material_proposal_lines`), tên lấy từ danh mục (`material_items.name`).
  - Đơn đã gửi hoặc đã duyệt: lấy dòng của bản gửi hiện tại (`material_proposal_revision_lines`), tên lấy từ bản chụp `material_name` trong dòng đó.
- **Nguồn dòng của đơn đặt hàng:** các dòng phân bổ của chính đơn đó (`material_order_allocations`).
- Trong thông báo, tóm tắt được **chụp lại tại thời điểm gửi thông báo**. Đơn sửa về sau thì thông báo cũ không đổi.

## 6. Nơi hiển thị (N4)

| Nơi | Hiển thị |
|---|---|
| Danh sách đơn đề xuất của dự án | Số đơn và tóm tắt ở mỗi dòng |
| Trang chi tiết đơn đề xuất | Số đơn ở tiêu đề. Danh sách các đơn đặt hàng tạo từ đơn này, theo mã. |
| Trang chi tiết đơn đặt hàng | Mã ĐH và tên NCC ở tiêu đề, kèm liên kết về đơn đề xuất gốc |
| Màn hình tài chính của dự án (hợp đồng, đợt thanh toán, đề nghị chi) | Mã ĐH của đơn đặt hàng liên quan, đặt **cạnh** số hợp đồng và tên NCC. Không bỏ số hợp đồng, vì đó là số in trên giấy tờ pháp lý. Các lệnh đọc tương ứng phải trả thêm mã ĐH. |
| Màn hình tài chính chung nhiều dự án (`app/pages/materials/finance/index.vue`, `suppliers.vue`) | Dạng **Eo Gió · ĐH 18-1** ở các dòng nhắc tới đơn đặt hàng. Các lệnh đọc tương ứng phải trả thêm tên dự án và mã ĐH. |
| Chuông thông báo | Theo mục 7 |

## 7. Thông báo (N5, N4)

### 7.1. Thông báo mới cho đơn đề xuất

Bấm vào mọi thông báo đều mở trang chi tiết của đơn: `/materials/{projectId}/proposals/{proposalId}`.

| Khi nào | Gửi cho | Tiêu đề | Nội dung |
|---|---|---|---|
| Kỹ sư gửi đơn lần đầu | Mọi người có quyền duyệt đơn đề xuất (`material.proposal.decide`) trong công ty. Quyền xem vật tư hiện tính theo công ty, không theo dự án: người có quyền duyệt đã xem được mọi đơn của công ty. Vì vậy gửi cho cả công ty không lộ thêm dữ liệu. | Eo Gió · Đơn 18 – Chờ duyệt | Nguyễn Văn A vừa gửi Đơn 18 (Thép D10, Xi măng PCB40 và 3 vật tư khác), cần bạn xem xét duyệt. |
| Kỹ sư gửi lại sau khi bị trả | Như trên | Eo Gió · Đơn 18 – Chờ duyệt (lần 2) | Nguyễn Văn A vừa gửi lại Đơn 18 (…), cần bạn xem xét duyệt. |
| Mua hàng duyệt | Người đã gửi bản được duyệt | Eo Gió · Đơn 18 – Đã duyệt | Trần Thị B đã duyệt Đơn 18 (…). |
| Mua hàng trả đơn | Người đã gửi bản bị trả | Eo Gió · Đơn 18 – Bị trả lại | Trần Thị B đã trả lại Đơn 18 (…). Lý do: {lý do}. |

**Tên người:** lấy họ tên nhân viên (`employees.full_name`) trong công ty đó. Người không có hồ sơ nhân viên thì dùng email.

**Quy tắc chung**, giữ như các thông báo vật tư hiện có:
- Không gửi cho chính người vừa thao tác.
- Người nhận phải có quyền xem vật tư (`material.read`) **và** xem được đơn đó theo quy tắc đọc đơn hiện có (`private.c1_material_can_read_proposal`): người tạo đơn, hoặc có quyền duyệt, quản lý đơn hàng hay ghi hợp đồng. Người không đọc được đơn thì không nhận thông báo.
- Mỗi lần gửi, duyệt hoặc trả chỉ tạo đúng một thông báo cho mỗi người nhận, kể cả khi lệnh bị gửi lặp lại. Khóa chống trùng gồm đơn, số lần gửi (`revision_no`) và loại sự kiện. Mỗi bản gửi chỉ có một quyết định, vì `material_proposal_decisions` là duy nhất theo `(proposal_id, proposal_version)`.

**Loại thông báo mới:** nguồn `material_proposal`, với ba loại sự kiện `material.proposal.submitted`, `material.proposal.approved`, `material.proposal.returned`. Cần mở rộng ràng buộc CHECK của `app_notifications` (cả `event_kind` và `source_type`), schema Zod và `appNotificationText`.

### 7.2. Thông báo tài chính đang có

Các thông báo đơn đặt hàng, hợp đồng, đợt thanh toán và đề nghị chi **giữ nguyên tiêu đề**. Nội dung thêm nhãn **Eo Gió · ĐH 18-1** ở chỗ đang nhắc tới đơn:
- **Hợp đồng và đề nghị chi:** nhãn đứng **cạnh** số hợp đồng và tên NCC, không thay thế. Đơn không hợp đồng thì nhãn thay cho chữ "Đơn không hợp đồng". Ví dụ:

  > Hợp đồng HD-01 (Eo Gió · ĐH 18-1) với Hòa Phát, tổng giá trị …
  > Đề nghị chi cho hợp đồng HD-01 (Eo Gió · ĐH 18-1) với Hòa Phát đã bị trả lại. Lý do: …

- **Đợt thanh toán sắp đến hạn và quá hạn:** hiện các thông báo này không nói đợt thuộc đơn nào. Thêm nhãn, ví dụ: "Đợt "Đợt 2" của Eo Gió · ĐH 18-1 · Hòa Phát đến hạn ngày …".

- Thông báo về đơn đặt hàng mới (`material.order.created`) thêm tóm tắt vật tư của đơn đặt hàng.
- Các thông báo đã lưu từ trước không có dữ liệu mã đơn. Những thông báo này vẫn hiển thị theo cách cũ, không lỗi.
- Giữ quy tắc đang có: thông báo gửi cho một người cụ thể thì không hiện số tiền.

## 8. Dữ liệu đang có (N6)

- Đơn đề xuất cũ được đánh số theo thứ tự ngày tạo trong từng dự án. Hai đơn tạo cùng thời điểm thì xếp theo `id`.
- Đơn đặt hàng cũ, kể cả đơn đã hủy, được đánh số theo thứ tự ngày tạo trong từng đơn đề xuất.
- Đơn mới tạo sau khi đánh số bù sẽ nối tiếp số lớn nhất hiện có.
- Không tạo thông báo cho các sự kiện đã xảy ra trước đó.
- Đánh số bù **không được** làm tăng `version`, không đổi `updated_at`, và không tạo dòng lịch sử. Nếu trigger lịch sử hoặc trigger chặn sửa cản trở, migration được tạm tắt chúng đúng trong lúc đánh số bù rồi bật lại.

## 9. Ràng buộc

- Theo các quy ước đang dùng cho vật tư:
  - Migration chỉ tiến, có advisory lock theo số kế tiếp.
  - Hàm `private.*` dạng security definer, và wrapper `public.*`.
  - Schema Zod strict.
  - Có test pgTAP cho phần cơ sở dữ liệu.
- Schema Zod strict nên sẽ từ chối khóa mới. Server và client phải cập nhật cùng lúc với migration, giống PR #44 và #45.
- Áp migration lên Cloud DEV phải hỏi user trước. Không đụng `dev-preview` hay production.
- Định dạng hiển thị (Đơn 18, ĐH 18-1, tóm tắt, tiền tố tên dự án) đặt ở **một chỗ dùng chung**, để màn hình và thông báo không mỗi nơi tự ghép một kiểu.

## 10. Quyết định của tôi (user chưa xác nhận riêng)

- Số đơn cấp từ lúc tạo nháp. Chấp nhận dãy số có khoảng trống.
- Người nhận thông báo "chờ duyệt" là mọi người có quyền duyệt trong công ty, không giới hạn theo dự án, giống cách thông báo tài chính đang làm.
- Tóm tắt lấy 2 vật tư đầu tiên theo thứ tự tạo dòng (chi tiết ở mục 5).
- Thông báo và màn hình tài chính giữ số hợp đồng, chỉ thêm mã ĐH bên cạnh.
- Màn hình tài chính chung nhiều dự án cũng nằm trong phạm vi (N4 "mọi nơi").
- Tên người lấy từ hồ sơ nhân viên, nếu không có thì dùng email.

## 11. Để builder tự quyết

- Cách lưu và cấp số an toàn khi chạy đồng thời. Ví dụ: bộ đếm theo dự án có khóa dòng, hoặc khóa dòng dự án rồi lấy số lớn nhất + 1.
- Thông báo được phát trong lệnh RPC hay bằng trigger.
- Tên khóa trong payload thông báo, và tên cột hoặc tên trường trong API.
- Cách bố trí chính xác trên từng màn hình, miễn là thể hiện đủ các thông tin trong mục 6.
