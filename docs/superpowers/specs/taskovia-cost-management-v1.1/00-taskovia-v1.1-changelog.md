# Taskovia C1–C3 — Bàn giao tài liệu v1.1

**Ngày:** 2026-09-11.  
**Trạng thái:** cập nhật tài liệu theo định hướng và phạm vi v1.1 Sơn đã chấp nhận; không phải lệnh thực thi.  
**Phạm vi:** thiết kế tổng thể C1–C3 + spec chi tiết C1. Không tạo implementation plan, code ứng dụng hoặc migration trong lần cập nhật này.

## 1. Hai tài liệu dùng cùng nhau

| File | Vai trò |
| --- | --- |
| [01-taskovia-c1-c3-design-v1.1.md](01-taskovia-c1-c3-design-v1.1.md) | Thiết kế tổng thể, ranh giới module, vai trò, dữ liệu và chuyển tiếp C1–C3. |
| [02-taskovia-c1-detailed-spec-v1.1.md](02-taskovia-c1-detailed-spec-v1.1.md) | Schema/constraints, API, quyền, UI, nguồn/file, xử lý lỗi và tiêu chí nghiệm thu C1. |

Bản v1.1 là nội dung đã hợp nhất, không chỉ là phụ lục. Nó thay thế v1.0 khi lập kế hoạch C1. Các file v1.0 và báo cáo phân tích nguồn vẫn được giữ nguyên ngoài gói này để truy vết; không trộn schema/API của hai phiên bản.

## 2. Các thay đổi chính

| Mã | Tích hợp v1.1 | Vị trí tra trong spec |
| --- | --- | --- |
| C01 | Upload nguồn tổng hợp trước khi biết đủ project/thầu/giao khoán; nguồn có version và vùng chọn. Financial facts vẫn có scope bắt buộc. | 4.0; 5.14–5.16; 8.2; 10 |
| C02 | Số Excel để đối chiếu tách khỏi financial lines. Dùng source_reported_figures cho total/subtotal/balance; khác scope/basis/kỳ không tính chênh lệch giả. | 5.17; 7.4 |
| C03 | Một khoản nhiều nguồn chứng minh, occurrence claims chống dùng trùng, file version mới không tự repost. Bổ sung evidence không kích hoạt tiền lần nữa. | 5.18–5.19; 6.4 |
| C04 | Gán phạm vi và ý nghĩa tiền theo phần nguồn; phần chưa rõ nằm trong review, không ép thầu hoặc ngày giả. | 4.0; 5.16/5.19; 6.5 |
| C05 | Tổng lịch sử theo từng giao khoán; completed không đồng nghĩa paid/hết giữ lại. Một workbook nhiều thầu không tạo “thầu tổng”. | 4.1; 5.7; 7.1 |
| C06 | Kỳ lịch sử không bị bó 7 ngày/năm filename; giữ raw date, lỗi nguồn và chênh làm tròn. Tuần C2–C3 vẫn là mặc định có ngoại lệ kiểm soát. | Thiết kế D06; spec 5.16/5.17, 7.4, 8.1 |
| C07 | Ghi nhãn nguồn chi/bên trả độc lập company owner. Phân bổ tiền chi hộ cần căn cứ chấp nhận; không mở công nợ liên company. | 5.8–5.9; 7.1 |
| C08 | Quyền đọc source toàn company, visibility file hỗn hợp, sheet ẩn/error và coverage khi có issue được quy định rõ. | 8–10; 12; 14 |

Luồng chuẩn:

```text
Nguồn/file/version
  → Phần nguồn + số đối chiếu + việc cần làm rõ
  → Project/đối tác/giao khoán và ý nghĩa đã xác định
  → Hồ sơ tài chính chuẩn
  → Đối chiếu và công bố từng phần hợp lệ
```

Chia sẻ file hoặc số nguồn không phải công bố chi phí/xác nhận paid. Financial source confirmation cũng không cho phép bỏ qua bản chất tiền, phạm vi hoặc issue chưa giải quyết.

## 3. Những phần được giữ nguyên

Kiến trúc đa tenant/company; Project → Party → Engagement → Component; công trình độc lập Stage01; tách cam kết/giá trị xác nhận/cash/giữ lại; tài liệu/file bất biến; quyền nghiệp vụ không gán từ tên trên giấy; C1 dùng độc lập; C2 không tự tăng chi phí khi chấm công; C3 ghi nhận khi quản lý duyệt, đóng kỳ không ghi nhận thêm lần nữa.

C1 không thêm auto-parser toàn Excel, sổ cái, doanh thu/vật tư/tồn kho, payroll nội bộ, portal thầu hoặc chuyển tiền. Sáu bảng bổ sung phục vụ tiếp nhận và truy vết nguồn có kiểm soát, không lưu mọi ô Excel thành dữ liệu nghiệp vụ.

## 4. Lưu ý cho CodeX

Đọc cặp v1.1, sau đó xác minh AGENTS.md, execution SHA, working tree, quyền/migrations/API đang có trước khi lập kế hoạch hoặc triển khai. Repo SHA trong tài liệu là source anchor kế thừa, không là HEAD/Cloud state vừa xác minh ở lần cập nhật này.

Bản C1 đích không còn reported_balance trong financial line enum hoặc endpoint upload chỉ hoạt động khi đã có cost_document. Nguồn đối chiếu và upload dùng các contract mới. Nếu có implementation/migration v1 thực sự trong môi trường, phải thiết kế chuyển tiếp forward-only có kiểm thử, không coi đây là quyền drop/update lịch sử.

Spec có **62 tình huống nghiệm thu A01–A62** và **24 invariant I01–I24**. Đây là tiêu chí implementation cần kiểm chứng, không phải các test đã được chạy thành công. C2/C3 mới ở mức thiết kế tổng thể, không được implement toàn bộ từ spec C1 này.

## 5. Dữ liệu thật và quyền thực thi

Hai workbook/ảnh và báo cáo tác động có số thật là nguồn nội bộ để review. Không kèm chúng trong gói ZIP, không đưa vào test fixture/Git. Ví dụ số học trong spec dùng dữ liệu tổng hợp; giữ dạng quan hệ để tạo fixture an toàn.

Các mục thầu/phạm vi/ngày/thuế/phân bổ còn chưa rõ phải đối chiếu trước công bố số thật. User chấp nhận v1.1 không tự xác nhận những khoản đó. Không chặn xây phần mềm bằng fixture tổng hợp, nhưng không được thay câu hỏi dữ liệu bằng giả định kế toán trong code.

Chưa có thay đổi repository, push/PR, migration, Cloud DEV, Production hoặc nạp nguồn thật. Những thao tác đó cần yêu cầu/authorization hiện hành riêng. Không có khẳng định pilot-ready từ việc cập nhật tài liệu.
