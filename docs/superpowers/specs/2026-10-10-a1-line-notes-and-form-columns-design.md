# A1 — Ghi chú từng dòng và cột tên dự kiến trên hóa đơn

Ngày: 2026-10-10. Trạng thái: thiết kế hội thoại đã duyệt; bản spec chờ Sơn rà và duyệt trước khi lập kế hoạch.

## 1. Mục tiêu và phạm vi

Kỹ sư cần nhập tên dự kiến trên hóa đơn và ghi chú tại từng dòng vật tư, với hai cột riêng trong bảng lập phiếu. Khi xem lại phiếu, cả kỹ sư và mua hàng đều thấy cột ghi chú tương ứng từng dòng.

Sơn đã xác nhận ghi chú được để trống và duyệt thiết kế: tối đa 2.000 ký tự; kỹ sư nhập ở nháp/phiếu trả về; ghi chú được lưu vào snapshot khi gửi. Codex làm contract/lưu dữ liệu; AGY làm UI.

Ghi chú chung của phiếu vẫn là trường riêng. Ghi chú dòng không tự lấy ghi chú chung và không liên quan tới tên dự kiến trên hóa đơn.

## 2. Nền nguồn và hiện trạng đã đọc

- Nền A1 đã chốt: `c5c456a614a694a270ed43ce141b4641a11a2f38`.
- `shared/schemas/costs/material-procurement.ts` có ghi chú cấp phiếu; input dòng có `lineId`, `materialId`, `quantity`, `proposedInvoiceName`, chưa có ghi chú dòng.
- `material_proposal_lines` và `material_proposal_revision_lines` chưa có cột ghi chú dòng.
- `MaterialProposalForm.vue` đặt input tên dự kiến dưới ô vật tư chuẩn; trang chi tiết đã có cột tên dự kiến riêng và cơ chế Buyer ghi đè.
- Tại thời điểm khảo sát, `dev-preview` cấu hình nguồn A3 `4c5e6792eeb9a45ddc3346938bb914d1608707e4`, build gần nhất lỗi. Contract dòng tại SHA đó cũng chưa có ghi chú. Đây không phải xác nhận nguồn đang chạy trên preview.

Nhánh spec lấy nền A1 để ghi nhận yêu cầu. Trước triển khai phải chọn lại nền tích hợp mới nhất đã được chốt, giữ toàn bộ phần A2/A3 liên quan. Không dùng nền A1 cũ để thay thế nguồn alpha mới hơn.

## 3. Contract và lưu dữ liệu

Mở rộng contract hiện có, không tạo API hay kho ghi chú riêng:

| Vị trí | Trường | Quy tắc |
| --- | --- | --- |
| Input từng dòng | `notes?: string \| null` | Tùy chọn; trim hai đầu; rỗng/chỉ khoảng trắng thành `null`; tối đa 2.000 ký tự |
| View từng dòng | `notes: string \| null` | Giá trị canonical của dòng/snapshot được đọc |
| Dòng đang chỉnh sửa | `notes text null` | Lưu cùng dữ liệu dòng |
| Dòng revision | `notes text null` | Chụp giá trị tại lần gửi tương ứng |

Server và ràng buộc SQL kiểm tra giới hạn độ dài và giá trị chuẩn hóa. UI không phải lớp kiểm tra duy nhất.

Quy tắc tương thích khi thiếu trường trong input:

- Dòng mới: thiếu trường, `null` hoặc chuỗi trắng đều lưu `null`.
- Dòng đã tồn tại khi cập nhật: thiếu trường giữ ghi chú hiện có; gửi `null` hoặc chuỗi trắng xóa ghi chú. Cách này tránh caller cũ vô tình xóa dữ liệu.
- UI mới gửi giá trị đã chuẩn hóa rõ ràng cho từng dòng. Không gộp việc thiếu trường với lệnh xóa trong xử lý payload/idempotency.

Thêm migration mới theo hướng forward-only cho hai cột và các hàm hiện có cần cập nhật. Không sửa migration đã áp dụng. Dữ liệu cũ nhận `null`; không suy diễn nội dung để backfill.

Luồng create/update giữ endpoint và chữ ký RPC hiện hành, mở rộng JSON dòng. Giữ `expectedVersion`, receipt/idempotency, phạm vi company/project/proposal và các ràng buộc số lượng hiện có. Ghi chú phải tham gia payload lệnh và việc nhận diện thay đổi; lặp lại cùng lệnh không tạo cập nhật mới.

Khi gửi, copy ghi chú từ dòng mutable sang dòng revision. Nháp/phiếu trả về đọc ghi chú mutable; phiếu đã gửi/duyệt đọc snapshot tương ứng. Gửi lại tạo snapshot mới; revision cũ giữ nguyên. Lỗi lưu phải trả theo cơ chế hiện hành, không báo thành công khi ghi chú chưa được lưu.

## 4. Quyền và giao diện

Kỹ sư chỉ sửa ghi chú của phiếu mình được phép sửa trong trạng thái nháp/trả về theo quyền hiện có. Mua hàng xem ghi chú; phạm vi này không cấp quyền Buyer sửa hay ghi đè ghi chú. Không đổi quyền, RLS hoặc quy tắc chứng từ đã khóa.

AGY chỉnh form kỹ sư thành các cột: STT, Vật tư chuẩn, Tên dự kiến trên HĐ, Quy cách chuẩn, Đơn vị, Số lượng, Ghi chú; giữ các cột lịch sử/xóa đang có khi áp dụng. Input tên dự kiến chuyển ra khỏi ô vật tư chuẩn. Ghi chú dùng textarea gọn trong từng ô, có nhãn truy cập theo dòng, giới hạn 2.000 ký tự và khóa theo trạng thái lưu/gửi hiện hành.

Form hydrate ghi chú khi mở lại; cả chữ ký dữ liệu form và chữ ký canonical chứa ghi chú chuẩn hóa. Mở rồi lưu nguyên dữ liệu không phát PATCH; thay đổi ghi chú được nhận diện và lưu.

Trang xem lại của kỹ sư và mua hàng có cột Ghi chú. Hiển thị text được escape, giữ xuống dòng và cho xuống dòng dài; giá trị `null` hiện “—”. Bảng có cuộn ngang khi thiếu chỗ, không che cột hay kéo giãn mất kiểm soát.

Giữ cách ưu tiên tên HĐ Buyer → kỹ sư → tên chuẩn, icon sửa ngay trong ô của Buyer, các guard quyền/trạng thái, token ngữ cảnh, retry key và canonical reload hiện có. Số lượng vẫn dương và trình bày không có đuôi số 0 dư.

## 5. Tiêu chí nghiệm thu

1. Mỗi dòng có ô ghi chú tùy chọn; để trống vẫn lưu/gửi được. Vượt 2.000 ký tự bị từ chối mà không mất nội dung đã nhập.
2. Ghi chú được lưu, mở lại và hiển thị đúng từng dòng cho cả hai vai; dữ liệu cũ hiện “—”.
3. Xóa nội dung xóa ghi chú; caller bỏ trường khi cập nhật giữ ghi chú cũ.
4. Snapshot giữ ghi chú tại lần gửi; sửa phiếu trả về/gửi lại không đổi revision trước.
5. Lưu không đổi không phát PATCH; đổi ghi chú được tính là thay đổi; retry không tạo kết quả trùng.
6. Form có cột tên dự kiến riêng; màn xem có cột ghi chú. Quyền và cách ghi đè tên của Buyer không thay đổi.

## 6. Phân công và giới hạn thực hiện

Codex sửa contract/schema, migration/hàm lưu/đọc, API/repository liên quan và rà nguồn; bàn giao SHA contract đã chốt. AGY làm Vue/UI trên nền đó, giữ các phần UI đã hoàn thành. Không yêu cầu AGY làm lại A1/A2/A3.

Theo chỉ đạo alpha của Sơn, không chạy bộ test tự động, lint hoặc typecheck cho lượt này. Rà source/diff và ghi rõ các kiểm tra thực sự đã chạy; alpha nghiệm thu sau rollout được duyệt riêng. Không kết luận runtime đã đạt chỉ từ source review.

Contract view strict cần phối hợp nguồn API/UI trong rollout; không giả định client cũ chấp nhận trường mới. Kế hoạch sẽ chốt nền tích hợp và thứ tự thay đổi DB/API/UI trước packet thực thi.

Lượt hiện tại chỉ viết spec. Cloud DEV, tạo types từ Cloud, fixture, build/deploy preview, merge và Production chưa được cấp phép cho thay đổi này. Các thao tác Cloud DEV/preview cần packet riêng theo SHA và target cụ thể.
