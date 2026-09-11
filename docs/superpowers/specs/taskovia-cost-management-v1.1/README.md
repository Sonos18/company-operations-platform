# Taskovia — Bộ thiết kế Chi phí thầu C1–C3 v1.1

**Ngày đưa tài liệu lên repository:** 2026-09-11.
**Phạm vi:** tài liệu thiết kế và đặc tả đã bàn giao cho Sơn; không có implementation plan, code ứng dụng, migration hoặc dữ liệu kế toán thật.

## Thứ tự đọc cho CodeX

| Thứ tự | Tài liệu | Mục đích |
| --- | --- | --- |
| 1 | [Thiết kế tổng thể C1–C3](01-taskovia-c1-c3-design-v1.1.md) | Hiểu ranh giới module, luồng nghiệp vụ, đa tenant/company và chuyển tiếp giữa các giai đoạn. |
| 2 | [Spec chi tiết C1](02-taskovia-c1-detailed-spec-v1.1.md) | Đọc hợp đồng dữ liệu, API, quyền, xử lý nguồn, báo cáo và tiêu chí nghiệm thu C1. |
| 3 | [Changelog và lưu ý bàn giao](00-taskovia-v1.1-changelog.md) | Tra các thay đổi từ v1.0 và giới hạn phạm vi thực hiện. |

Hai tài liệu 01/02 v1.1 phải được dùng cùng nhau. C2–C3 chỉ ở mức thiết kế tổng thể; spec chi tiết hiện tại chỉ áp dụng cho C1. Không trộn schema/API của v1.0 với v1.1.

## Phân biệt nhánh tài liệu và nguồn triển khai

PR đưa bộ tài liệu này vào `main` là PR chỉ thêm tài liệu. Nó không tích hợp nhánh `test/vqh-stage-01-operational-acceptance-hardening`, không xác nhận Stage 01 đã hoàn tất và không chọn thay execution base cho C1.

Source anchor dùng để phân tích thiết kế là `3d021b35b1228ffdd46a8dbb9884a59c00ab6c89`. Khi chuẩn bị task tiếp theo, CodeX phải đọc [AGENTS.md](../../../../AGENTS.md) tại nhánh thực thi, kiểm tra source/migration hiện có và báo khác biệt ảnh hưởng hợp đồng. Không xem việc tài liệu nằm trên `main` là bằng chứng source hoặc Cloud DEV đã có toàn bộ thay đổi của nhánh checkpoint.

## Giữ nguyên bản đã bàn giao

Ba file v1.1 được giữ nguyên nội dung từ bộ tài liệu đã bàn giao trong hội thoại. Những câu mô tả “chưa có push/PR” hoặc “chưa xác minh HEAD lại” trong các file đó ghi nhận trạng thái tại thời điểm biên soạn, trước task đưa tài liệu lên remote này.

Bản v1.0 và báo cáo tác động workbook vẫn được giữ trong hồ sơ hội thoại, không được thêm vào PR này. Các tham chiếu dạng tên file nội bộ không phải yêu cầu CodeX tìm hoặc tạo các dữ liệu nguồn đó trong repository.

## Dữ liệu và quyền thực hiện

Không đưa workbook, ảnh bảng lương, báo cáo có số tiền thật, tài liệu hợp đồng hoặc danh sách nhân công vào repository. Các quan hệ nghiệp vụ đã được khái quát trong thiết kế; fixture cho implementation phải dùng dữ liệu tổng hợp.

Việc thêm tài liệu và mở PR không phải lệnh triển khai, nạp dữ liệu, chạy mutation Cloud DEV, deploy Production hoặc merge PR. Các thao tác đó cần yêu cầu hiện hành riêng của Sơn.
