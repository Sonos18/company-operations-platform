# Taskovia — Chi phí có chứng từ, duyệt từng đợt và xác nhận đã chi

**ĐẶC TẢ THIẾT KẾ ĐÃ HOÀN THIỆN ĐỂ DUYỆT VĂN BẢN CUỐI — các quy tắc nghiệp vụ đã được chấp thuận; chưa viết kế hoạch và chưa cho phép triển khai.**

Ngày: 04/10/2026. Cơ sở mã nguồn: DEV được chấp nhận tại `45dfeda42d53f932e9c8f081db0e69d33517cf10`. Khảo sát nguồn qua Insta CLI/`dev-worker-recovery`; đọc Git blobs của đúng phiên bản. Kiểm tra tài khoản/dự án bằng SELECT trên Cloud DEV; không thay đổi dữ liệu.

Đường dẫn dự kiến khi được đưa vào repository: `docs/superpowers/specs/2026-10-04-document-backed-installment-approval-design-draft.md`. Bản này được giao riêng để không ảnh hưởng PR27 hoặc các thay đổi đang làm. Người dùng đã chấp thuận các đề xuất của bản đã giao bằng câu “đồng ý điểm tiếp theo và đề xuất của bạn theo bản thiết kế”. Quy tắc bàn giao quản lý đã được chốt riêng: quản lý mới tiếp nhận cùng snapshot đang chờ, có audit; quản lý cũ mất quyền, không yêu cầu kế toán gửi lại. Người dùng tiếp tục chấp thuận chỉ số “Chi ròng” = tiền ra đã xác nhận − tiền hoàn thực nhận đã xác nhận, với “Đã chi” và “Đã thu hồi” hiển thị riêng và giữ payment gốc; đồng thời chỉ định `vqh-director@taskovia.invalid` làm giám đốc nhận chuông và phân công quản lý. Người dùng đã duyệt thêm ba quy tắc: kế toán lập yêu cầu hoàn tiền/sửa sai có chứng từ, quản lý dự án duyệt; chặn gửi đợt vượt giá trị hợp đồng đến khi phụ lục/điều chỉnh được duyệt; khi giám đốc tạm bị vô hiệu hóa vẫn cho quản lý duyệt và giữ thông báo chưa giao cho đúng tài khoản. Bản này ghi đầy đủ các quy tắc đã chốt. Cần người dùng duyệt văn bản cuối này trước khi viết kế hoạch, rồi duyệt kế hoạch/chọn cách thực hiện trước khi viết mã.

## 1. Mục tiêu và phạm vi đã xác nhận

- Bỏ màn hình/menu “Nguồn chi phí” và các cột đối chiếu vị trí ô Excel. Giữ toàn bộ dữ liệu nguồn, lịch sử và tệp gốc.
- Giai đoạn 1 bắt đầu khi kế toán tải lên chứng từ đã có: hợp đồng/báo giá/hóa đơn/ảnh/bảng tính/chứng từ phù hợp. Quy trình kỹ sư đề nghị vật tư và chọn nhà cung cấp làm sau.
- Mỗi yêu cầu có đối tác hoặc đội VQH xác định và ít nhất một chứng từ gốc. Máy quét điền trước; kế toán kiểm tra, sửa rồi gửi.
- Chỉ quản lý được phân công cho đúng dự án duyệt hoặc trả về. Giám đốc phân công/phân công lại quản lý; chưa có quản lý thì không gửi được yêu cầu.
- Quản lý duyệt **từng đợt thanh toán**, ví dụ 30% và 70% riêng. Duyệt hợp đồng không mặc nhiên cho phép chi toàn bộ hợp đồng.
- Duyệt tạo khoản được phép chi nhưng chưa chi. Chỉ kế toán xác nhận thanh toán thực tế, kèm chứng minh thanh toán, mới làm tăng “Đã chi”.
- Mọi danh mục dùng cùng headline “Chi ròng” = tiền ra đã xác nhận − tiền hoàn thực nhận đã xác nhận. Hiển thị riêng “Đã chi” (gross tiền ra), “Đã thu hồi”, khoản đã duyệt chưa chi và số còn được phép chi.
- Giám đốc được chỉ định là `vqh-director@taskovia.invalid`, nhận thông báo chuông trong ứng dụng sau khi quản lý duyệt và phân công/phân công lại quản lý; không có bước giám đốc duyệt lần hai.
- Không còn UX “chi phí nháp”. Yêu cầu đang xử lý, đã gửi và bị trả về vẫn được lưu bền vững và có phiên bản.
- Dự án hoàn thành không nhận khoản mới hoặc tăng khoản. Được thanh toán phần còn lại đã duyệt trước khi hoàn thành, kể cả giữ lại bảo hành, với chứng từ và lịch sử.
- Lịch sử cũ giữ nguyên; kế toán đối chiếu trước khi khoản thực chi có chứng từ xác nhận được đưa vào chỉ số mới. Phần chưa đối chiếu phải hiển thị rõ.
- Hoàn tiền/sửa sai: kế toán lập yêu cầu có chứng từ, quản lý hiện hành của dự án duyệt; giữ giao dịch gốc, không tự mở lại hạn mức.
- Chặn gửi đợt chi vượt giá trị hợp đồng có hiệu lực; phụ lục/điều chỉnh phải được quản lý dự án duyệt trước.
- Nếu giám đốc tạm không còn hợp lệ, quản lý vẫn duyệt; thông báo được lưu chưa giao cho đúng giám đốc đã chỉ định, không chuyển sang người khác.

## 2. Ba phương án kiến trúc

| Phương án | Ưu điểm | Hạn chế |
| --- | --- | --- |
| Đổi nhãn bản nháp hiện tại thành yêu cầu duyệt | Ít thay đổi lúc đầu | Trộn yêu cầu, nghĩa vụ và chi tiền; API phát hành hiện tại có thể bỏ qua duyệt; thiếu nhận diện đợt và chứng từ trước duyệt |
| **Tách yêu cầu/phiên bản, đợt được duyệt và thanh toán; tái dùng mô hình hiện có** | Rõ quyền, rõ thời điểm tính tiền; giữ lịch sử; xử lý đợt, trả về và chi một phần nhất quán | Cần hợp đồng dữ liệu và migration mới; báo cáo thực chi thay đổi |
| Xây mới toàn bộ mua hàng/công nợ/sổ cái | Bao quát dài hạn | Quá rộng cho giai đoạn 1, kéo theo chọn nhà cung cấp và các chính sách chưa được xác nhận |

**Phương án đã được chấp thuận:** phương án thứ hai. Giữ parent tổng hợp theo dự án/danh mục, danh bạ đối tác, chứng từ bất biến, biên nhận chống lặp và dữ liệu thanh toán thầu phụ; bổ sung các ranh giới còn thiếu. Không xây một sổ chi song song rồi cộng cả hai.

## 3. Ý nghĩa tiền và chống cộng trùng

**Hợp đồng/báo giá và hạn mức:** lưu giá trị, tiền tệ, phiên bản và điều khoản làm cơ sở; bản thân tài liệu không làm tăng “Đã chi” hoặc cấp quyền chi. Với cơ sở có giá trị hợp đồng/báo giá được xác nhận, giá trị đang có hiệu lực là hard cap của tổng các đợt được phép chi cùng cơ sở, gồm phần đã dùng và còn được phép chi, kể cả bảo hành. Không kiểm tra cap chỉ trên tiền chưa chi hoặc tiền ròng sau hoàn. Mỗi đợt/phần giữ lại chỉ tính một lần; chuyển thanh toán giữ lại không tạo thêm đợt cộng ngoài cap.

Gửi đợt mới phải kiểm tra tổng các đợt đã được duyệt cộng đợt đang gửi không vượt cap. Duyệt kiểm tra lại cùng invariant trong transaction, khóa cùng cơ sở hợp đồng; hai yêu cầu cạnh tranh không thể cùng duyệt vượt cap. Việc gửi không tự cấp hoặc giữ quyền chi. Nếu cap thay đổi hoặc một yêu cầu khác được duyệt trong lúc chờ, yêu cầu không còn hợp lệ phải được trả về có lý do, không tự tăng cap.

Phụ lục/điều chỉnh có chứng từ, lý do và snapshot riêng do kế toán gửi, quản lý hiện hành của dự án duyệt theo cùng quy tắc quyền/bàn giao. Chỉ phiên bản điều chỉnh đã được duyệt mới thay cap; duyệt phụ lục không tự duyệt bất kỳ đợt chi nào. Không hạ cap dưới tổng quyền chi đã cấp. Không điều chỉnh tăng sau completion. Cơ sở bảng công hoặc chứng từ không có hợp đồng không bị buộc tạo hợp đồng giả; mọi khoản vẫn phải được duyệt theo đúng cơ sở/số tiền được kế toán xác nhận. Dữ liệu lịch sử thiếu mapping không chứng minh còn capacity: phải đối chiếu các khoản liên quan trước khi dùng cap, không tạo approval lịch sử giả.

**Đợt được duyệt:** một số tiền cụ thể được quản lý cho phép chi, gắn với hợp đồng/cơ sở công việc và phiên bản yêu cầu. Chỉ số “Đã duyệt chưa chi” là quyền chi còn lại chưa sử dụng của các đợt có hiệu lực, không phải toàn bộ hợp đồng chưa chi. Phần còn được phép chi = số đã duyệt − các khoản đã tiêu thụ quyền chi. Xác nhận payment tiêu thụ quyền chi cùng transaction. Hoàn tiền hoặc sửa một cash fact không tự đảo phần tiêu thụ này; không lấy gross sau correction hoặc Chi ròng để tính lại capacity. Số liệu được suy từ các sự kiện được kiểm soát, không giữ các tổng có thể tự lệch nhau.

**Thanh toán thực tế:** sự kiện tiền thực chuyển/chi, kế toán xác nhận và đính kèm chứng minh. Gắn khoản này với đợt được duyệt. Các khoản tiền ra đã xác nhận đi vào “Đã chi” (gross). Tiền hoàn thực nhận có chứng minh đi vào “Đã thu hồi”; headline “Chi ròng” = “Đã chi” − “Đã thu hồi”. Giữ nguyên payment gốc và liên kết sự kiện hoàn tiền; không sửa tiền ra thành một giá trị net. Sửa/hủy bản ghi sai không phải bằng chứng tiền đã quay về, không được tự tạo “Đã thu hồi”. Kế toán lập yêu cầu hoàn tiền/sửa sai có lý do và chứng từ, quản lý hiện hành của đúng dự án duyệt trên snapshot bất biến. Kế toán chỉ xác nhận tiền hoàn thực nhận khi có chứng minh; duyệt yêu cầu không tự tạo inflow. Sửa một cash fact sai tạo sự kiện correction liên kết giao dịch gốc, không giả tiền hoàn. Báo cáo tính các cash facts hợp lệ sau correction, đồng thời giữ gross tiền ra thật và lịch sử trước/sau; không trừ cùng khoản ở cả correction và refund. Tổng tiền hoàn của một payment không vượt tiền ra thực tế còn chưa được hoàn, kiểm tra trong transaction; không ghi khoản dư thành hoàn tiền của payment đó.

Ví dụ đề xuất để kiểm tra thiết kế: hợp đồng 100 triệu, đợt 30 triệu được duyệt rồi trả 10 triệu. “Đã chi” = 10; “Đã duyệt chưa chi” = 20. Phần 70 chưa được duyệt không nằm trong hai chỉ số. Sau khi trả hết 30 và đợt 70 được duyệt, số chưa chi của đợt mới là 70. Nếu đã chi 10 và thực nhận hoàn 2 có chứng minh, “Đã chi” = 10, “Đã thu hồi” = 2, “Chi ròng” = 8; payment gốc vẫn là 10. Số còn được phép chi không tự tăng từ 20 lên 22. Tổng hợp đồng, hóa đơn và ảnh chuyển tiền không được cộng thêm lần nữa.

Một đợt có thể được chi nhiều lần đến số còn được phép chi. Duyệt đợt mới không tái tạo toàn bộ giá trị hợp đồng thành nghĩa vụ mới. Hóa đơn/biên nhận bổ sung vào hồ sơ hiện có; chứng từ không tự tạo thêm thanh toán.

**Phạm vi MVP đã được chấp thuận:** mỗi xác nhận thanh toán thuộc một đợt, một dự án, một đối tác/đội và một tiền tệ. Một lệnh chuyển khoản phân bổ cho nhiều đợt cần hợp đồng phân bổ riêng, chưa mặc nhiên được hỗ trợ.

## 4. Luồng và trạng thái

Luồng chính:

```text
Tải và xác minh chứng từ → quét/điền trước → kế toán kiểm tra/sửa
→ gửi phiên bản bất biến → quản lý duyệt hoặc trả về
→ đợt được phép chi → kế toán xác nhận thực chi với chứng minh
→ đã chi một phần / đã chi hết
```

Tên trạng thái dưới đây là đề xuất kỹ thuật, chưa phải tên màn hình cuối:

- Hồ sơ làm việc/quét: đang tải, đang xử lý, cần kiểm tra, quét lỗi. Không có số liệu tài chính chính thức.
- Phiên bản yêu cầu: đã gửi, bị trả về, được duyệt. Phiên bản đã gửi không sửa trực tiếp.
- Trả về: bắt buộc lý do, người trả, thời gian, đúng phiên bản. Kế toán sửa hồ sơ và gửi phiên bản mới; giữ phiên bản cũ.
- Đợt được duyệt: số được phép chi và phần quyền chi còn lại tính từ các sự kiện tiêu thụ đã được kiểm soát. Payment làm giảm phần còn lại; refund/correction không tự khôi phục. Trạng thái payment/cash và trạng thái quyền chi được thể hiện riêng nếu correction khiến chúng khác nhau, không tự điều chỉnh một bên để khớp bên kia.
- Thanh toán: đã xác nhận; sửa sai qua sự kiện/lệnh được kiểm soát, không sửa hoặc xóa âm thầm.

Nút chính là “Gửi quản lý”, “Duyệt đợt”, “Trả về” và “Xác nhận đã chi”. Không có “Ghi nhận ngay” cho kế toán để bỏ qua quản lý. Bản làm việc chưa gửi không được gọi là chi phí chính thức.

## 5. Mô hình dữ liệu đề xuất và phần tái dùng

Tên bảng mới để làm rõ trách nhiệm, chưa phải DDL cuối:

- Hồ sơ hợp đồng/cơ sở: dự án, đối tác/đội, chứng từ và tham chiếu hợp đồng/báo giá/nghiệm thu/bảng lương.
- Yêu cầu đợt chi: danh tính ổn định, cơ sở, kế toán phụ trách, trạng thái/phiên bản hiện hành.
- Phiên bản gửi: snapshot số tiền, danh mục, nội dung, đối tác/đội, tính toán, chứng từ, người gửi/thời điểm.
- Quyết định: duyệt/trả, snapshot được quyết định, quản lý và phiên bản phân công, lý do, thời điểm.
- Đợt được phép chi: liên kết quyết định, giá trị được duyệt, tiền tệ và đích nghĩa vụ/cơ sở.
- Thanh toán và tiêu thụ quyền chi: tiền thực chi, ngày, tham chiếu, chứng minh, đợt nguồn và người xác nhận; MVP một payment–một đợt.
- Yêu cầu hoàn tiền/correction, snapshot/quyết định và sự kiện thực nhận/correction: liên kết payment gốc, loại sự kiện, lý do, chứng từ, người lập/duyệt/xác nhận; không sửa giao dịch gốc hay tự hoàn lại capacity.
- Phiên bản phụ lục/điều chỉnh hợp đồng và quyết định của quản lý; cap có hiệu lực tách khỏi quyền chi của từng đợt.
- Phân công quản lý dự án và lịch sử thay đổi.
- Thông báo trong ứng dụng theo người nhận.

Tái dùng `business_parties`, `project_engagements`, `cost_evidence_files`, chứng từ Storage, `cost_command_receipts`, audit/version/lock và invariant một parent cho một dự án/danh mục.

Ordinary details có thể lưu chi tiết cơ sở/đợt đã duyệt sau khi làm rõ phân loại; không còn dùng tổng detail để suy ra tiền đã chi. Cần bổ sung thanh toán ordinary. Giữ `project_subcontract_payments` là nguồn duy nhất của tiền thầu phụ đang có, bổ sung liên kết đợt được duyệt và chứng minh theo đường mới. Một API thanh toán thống nhất không đồng nghĩa nhân đôi bản ghi tài chính.

## 6. Chi tiết từng loại công việc

**Vật tư:** lưu từng dòng hàng, lượng/đơn vị/đơn giá, nhà cung cấp, địa điểm giao thẳng công trình, chứng từ nhận hàng và điều khoản ứng/thanh toán. Nhận hàng, hóa đơn và tiền đã chi là ba sự kiện khác nhau. Giai đoạn 1 không suy diễn nhập kho hay quản lý tồn kho.

**Thầu phụ:** lưu công việc được nghiệm thu, cơ sở tính tiền và khoản giữ lại bảo hành. Mỗi đợt ứng/thanh toán/giải ngân bảo hành cần được duyệt. Tiền giữ lại chưa trả không phải tiền đã chi. Giải ngân sau làm tăng thực chi trên cùng cơ sở, không tạo lại chi phí hợp đồng.

**Đội VQH:** lưu bảng công theo dự án/tuần, công nhân, số ngày, đơn giá ngày và phụ cấp, cùng tổng được kiểm tra. Bảng công là cơ sở; yêu cầu chi từng đợt được quản lý duyệt. Tổng bảng công không đồng thời được cộng vào headline với tiền thanh toán. Danh tính công nhân và công thức phụ cấp/làm tròn phải được kế toán xác nhận từ hồ sơ; không tự suy công thức. Quyền xem theo phạm vi đã chấp thuận ở mục 13.

Các danh mục máy móc/khác dùng cùng ranh giới yêu cầu–duyệt–thực chi, không có đường tắt bỏ chứng từ hoặc quản lý.

## 7. Chứng từ, quét và quyền đọc

Tái dùng bucket private `c1-accounting-evidence`, đường dẫn theo tenant/company/project/file, hash/size/MIME đã xác minh, tệp gốc không ghi đè và URL đọc ngắn hạn.

Bổ sung liên kết tới phiên bản yêu cầu và thanh toán ordinary. Bản gửi tham chiếu chính xác các file bất biến; thêm/sửa tài liệu sau gửi phải xuất hiện trong phiên bản mới. Không tự gán chứng từ parent lịch sử xuống từng khoản.

**Quét đề xuất:** đọc cấu trúc Excel và text PDF khi phù hợp; OCR/AI cho ảnh hoặc PDF scan. Không chạy macro, liên kết hay lệnh nhúng. Lưu kết quả quét riêng với phiên bản phương pháp, dấu vết chứng từ và trường không chắc chắn. Kế toán luôn kiểm tra trước khi gửi. Kết quả quét không được quyết định đối tác, khoản tiền chính thức, thuế hoặc sự kiện thanh toán.

**Cổng tích hợp riêng:** nhà cung cấp OCR/AI, điều kiện riêng tư/lưu dữ liệu, giới hạn chi phí và định dạng đầu vào chưa được chấp thuận. Đây là cổng trước tích hợp/gửi dữ liệu ngoài, không còn là yêu cầu nghiệp vụ đang mở của đặc tả lõi. Kế hoạch có thể thiết kế adapter và kiểm chứng bằng fixture tổng hợp trong phạm vi được phép; chưa gọi provider hoặc gửi chứng từ thật ra ngoài. Chốt gate trước nối dịch vụ; quét lỗi không được tự phát hành dữ liệu. Trước khi adapter thật được phép, giao diện phải báo đúng trạng thái chưa quét/không khả dụng và cho kế toán nhập kiểm tra thủ công cùng chứng từ; không giả kết quả OCR.

Kế toán và quản lý được phân công cần đọc chứng từ yêu cầu chưa được duyệt; quyền hiện tại chỉ đọc file finalized qua link tài chính chính thức chưa đáp ứng. Thêm chính sách riêng theo yêu cầu và phiên bản. Giám đốc xem theo phạm vi được duyệt ở mục 13. Không dùng service-role rộng để bỏ qua quyền người dùng.

## 8. Phân công, quyền và tài khoản Eo Gió

Đã xác nhận: giám đốc phân công/phân công lại; không có quản lý thì không gửi. Quyền công ty hoặc quản lý nhân sự không thay thế phân công dự án.

Mỗi thao tác kiểm tra actor đang hoạt động, tenant/company, đúng dự án và quyền thao tác. Duyệt/trả kiểm tra quản lý hiện hành trong transaction và ghi phiên bản phân công. Khi giám đốc phân công lại, quản lý mới tiếp nhận chính snapshot đang chờ; giữ nguyên nội dung, chứng từ và phiên bản gửi, không yêu cầu kế toán gửi lại và không tự duyệt. Ghi audit người phân công, quản lý cũ/mới, phiên bản phân công và các yêu cầu bàn giao. Quản lý cũ mất quyền duyệt/trả ngay khi phân công mới có hiệu lực. Lệnh duyệt/trả và phân công lại phải khóa/kiểm tra cùng phiên bản phân công để quyết định cạnh tranh được tuần tự hóa; không tồn tại quyết định hợp lệ từ quản lý đã mất quyền.

Tài khoản quản lý được yêu cầu: `vqh-manage@taskovia.invalid`, Auth ID `8274a3ea-7a2e-4584-b5a6-6bbad44c6f12`; phạm vi chỉ `EO GIÓ`/`EO-GIO`, project ID `7e7e3904-d53b-4337-9360-22256887474a`. Kiểm tra Cloud DEV ngày 04/10 thấy email confirmed, không banned; không có tenant/company membership, employee record hoặc role assignment.

**Giám đốc đã được người dùng chỉ định:** `vqh-director@taskovia.invalid`, Auth ID `8e4e406d-d798-4262-bb30-b5e5213ec006`. SELECT Cloud DEV ngày 04/10 xác nhận email confirmed, không banned; có tenant membership và company membership VQH đang hoạt động. Chưa có employee record. Có role assignment `vqh_director_viewer` đang hiệu lực với đúng hai permission `cost.read`, `project.read`; assignment `c1_vqh_cost_viewer` cũ đã revoked. Role hiện tại không cấp quyền phân công quản lý, đọc file gốc, duyệt chi phí hay quản trị công ty. Danh tính giám đốc được xác định từ chỉ định trực tiếp của người dùng, không suy từ role.

**Prerequisite chưa hoàn thành:** onboarding tài khoản quản lý VQH theo đường được hỗ trợ và phân công Eo Gió bằng mô hình mới. Thiết kế thêm quyền tối thiểu cho giám đốc phân công quản lý và nhận chuông, cộng quyền xem hồ sơ phù hợp; không gán company_admin hoặc các quyền tài chính rộng. Chưa có mutation/grant hay tạo employee record cho giám đốc. Hiện không có role hay API thể hiện quản lý Eo Gió riêng; chưa cấp quyền. Không dùng company_admin, director hay accountant như thay thế tạm.

Các quyền hiện tại `cost.publish_import`, `cost.record_cash`, `cost.correct` và RPC trực tiếp phải được rà soát/gate để không bỏ qua duyệt. Chỉ ẩn nút không đủ. Permission mới và quyền đọc chi tiết phải được thiết kế tối thiểu; không tự cấp toàn bộ quyền kế toán cho quản lý.

## 9. Dự án hoàn thành và ngoại lệ thanh toán

Giữ khóa và kiểm tra trạng thái dự án khi gửi, duyệt, xác nhận thanh toán và thay đổi phân công. Dự án hoàn thành không tạo đợt mới, tăng cap hoặc tăng số đã duyệt. Các ngoại lệ dưới đây có loại lệnh/đích và scope cụ thể, không biến mọi thao tác thành writable.

Ngoại lệ chỉ thanh toán số còn lại của đợt có quyết định duyệt trước khi dự án hoàn thành, bao gồm đợt bảo hành đã duyệt. Hồ sơ giữ lại chưa được duyệt thành đợt trước completion không đủ để dùng ngoại lệ.

Lệnh settlement phải kiểm tra approval/time/scope, phần còn lại, người xác nhận, chứng minh và idempotency trong một transaction. Không mở lại dự án, không tăng hạn mức, không sửa cơ sở để hợp thức hóa khoản mới.

Sau completion, yêu cầu hoàn tiền/correction chỉ được tham chiếu payment hiện hữu thuộc đợt đã được duyệt trước completion (hoặc cash fact lịch sử đã được đối chiếu theo đường được duyệt riêng). Kế toán lập, quản lý hiện hành duyệt; tiền hoàn vẫn cần chứng minh thực nhận. Correction chỉ sửa việc phản ánh sự kiện đã tồn tại, không tạo cash outflow mới, nghĩa vụ mới hoặc tăng/khôi phục quyền chi. Giao dịch settlement hợp lệ phát sinh sau completion vẫn có thể được hoàn/sửa theo cùng liên kết về đợt đã duyệt trước completion. Không tạo phụ lục tăng cap hoặc dùng correction để chuyển khoản sang nghĩa vụ mới.

Guard hiện tại chặn cả upload Storage, evidence files/links và payments. Ngoại lệ hẹp phải cho **chứng minh settlement/hoàn tiền/correction đúng giao dịch, đúng đợt** và đúng lệnh được phép; không gỡ toàn bộ guard. Upload không cấp quyền chi, không sửa snapshot/cơ sở đã duyệt. Thay đổi người quản lý, nếu cần để quyết định các lệnh ngoại lệ, chỉ thay actor/phân công có audit theo cùng quy tắc bàn giao; không mở dự án hoặc đổi số tiền.

## 10. Thông báo chuông trong ứng dụng

Khi duyệt thành công, cùng transaction tạo quyết định, đợt được phép chi, audit/receipt và thông báo cho giám đốc. Unique theo sự kiện duyệt/người nhận để retry không tạo chuông lặp.

Phase 1 không gửi email/Slack/SMS và không cần dựng dispatcher ngoài chỉ để làm chuông. Khi trả về không tạo thông báo “đã duyệt”; sau payment không mặc nhiên thêm một loại thông báo chưa yêu cầu.

Thông báo phân biệt “đã duyệt, chưa chi”, liên kết đúng hồ sơ và phiên bản, không mang signed URL. Mở hồ sơ kiểm tra lại quyền. Người nhận là giám đốc được chỉ định rõ, đang hoạt động và thuộc VQH; không suy từ company_admin hoặc role `vqh_director_viewer`. Role này chỉ là quyền xem hiện hữu, không chứng minh ai được chỉ định nhận chuông. Tài khoản nhận đã được người dùng chỉ định là `vqh-director@taskovia.invalid`. Nếu bị vô hiệu hóa/offboard hoặc tạm không đủ điều kiện đọc thông báo, quản lý vẫn duyệt; cùng transaction lưu thông báo trạng thái chưa giao cho đúng identity này. Không bỏ sự kiện, không chuyển sang tài khoản khác. Khi chính tài khoản đó hợp lệ trở lại, cho nhận đúng thông báo đã lưu, với kiểm tra quyền hiện hành và chống lặp; không cần hệ thống gửi ngoài. Trạng thái chưa giao được theo dõi để xử lý sau, không cấp quyền tạm và không làm mất hiệu lực quyết định đã duyệt. Không tự cấp quyền đọc chứng từ hoặc lương qua thông báo.

## 11. Transaction, lỗi, retry và audit

- Các lệnh gửi/duyệt/trả/xác nhận chi dùng receipt chống lặp theo actor/company/command/key và hash payload; cùng key khác nội dung trả conflict.
- Duyệt/trả cùng phiên bản cạnh tranh: một lệnh thắng, lệnh còn lại nhận trạng thái/phiên bản conflict; không vừa duyệt vừa trả.
- Gửi/duyệt đợt và duyệt phụ lục khóa cơ sở hợp đồng/phiên bản cap, kiểm tra tổng quyền chi đã cấp; không vượt hard cap khi cạnh tranh. Cap mới chỉ có hiệu lực sau quyết định được phép, không biến pending request thành approved.
- Xác nhận chi khóa đợt, kiểm tra quyền chi còn lại và ghi payment/consumption/links/audit/receipt cùng transaction. Hai khoản cạnh tranh không được vượt phần còn lại.
- Hoàn tiền khóa payment gốc, kiểm tra tổng thực nhận đã ghi và phần còn có thể hoàn; correction/refund có loại sự kiện riêng, không tự hoàn capacity. Một correction không thể đồng thời sửa tiền ra sai và ghi inflow giả. Refund/correction và settlement phối hợp cùng lock/state, giữ scope dự án và giao dịch nguồn. Correction cũng kiểm tra lại tổng hoàn đã xác nhận không vượt tiền ra hợp lệ sau correction; nếu bằng chứng mâu thuẫn, trả conflict để đối chiếu, không tự xóa refund hoặc tạo tiền mới. Correction không được làm tiền ra được công nhận vượt phần quyền chi đã tiêu thụ cho giao dịch nguồn hoặc đổi nghĩa vụ/đối tác/dự án để né duyệt; khoản vượt phải đi qua luồng đợt chi được phép, bị chặn khi dự án đã hoàn thành.
- Khóa dự án và phân công phối hợp với completion/reassignment/offboarding; kiểm tra quyền hiện hành trước replay. Retry trả receipt không sinh thêm tiền hoặc thông báo.
- Lỗi rõ và không thay đổi từng phần: thiếu quản lý, sai người quản lý, version conflict, evidence chưa finalized/sai scope, số vượt còn lại, project completed không đủ điều kiện settlement, idempotency conflict, quét lỗi.
- Upload/finalize có retry riêng và không tạo tiền. Mất phản hồi lệnh chi phải kiểm tra/retry đúng identity thay vì gửi khoản mới.
- Audit bất biến lưu ai/lúc nào/phân công nào/phiên bản nào, quyết định và đích posting. Không đưa credentials, signed URLs hay dữ liệu lương nhạy cảm vào log rộng.

## 12. Lịch sử và chuyển chỉ số

Giữ dữ liệu nguồn, import manifests, source figures, audit, chứng từ và số liệu tài chính cũ. Bỏ UX đối chiếu ô Excel không xóa backend provenance hoặc quyền đọc evidence dùng chung.

Không coi mọi ordinary detail đã published là tiền đã chi. Chuẩn bị inventory chỉ đọc theo dự án/danh mục: khoản cũ, nguồn, chứng từ, thanh toán, giữ lại, trùng và độ chắc chắn.

Kế toán đối chiếu và xác nhận tiền thực chi có chứng minh bằng một đường migration/reconciliation được duyệt riêng. Không dựng approval người quản lý trong quá khứ hoặc tạo chứng từ giả. Giữ liên kết khoản lịch sử đã đối chiếu với payment/opening cash event mới; một khoản chỉ được đưa vào metric một lần.

Hiển thị phần chưa đối chiếu riêng; không dùng zero để nói không phát sinh và không gộp vào “Đã chi”. Nếu coverage chưa đủ, thể hiện tổng thực chi đã xác minh và cảnh báo thiếu coverage, tránh trình bày như tổng đầy đủ.

Các payment thầu phụ hiện hữu đã là cash facts, nhưng việc tham gia metric chứng từ-xác-nhận mới cần kiểm tra bằng chứng/coverage theo cùng gate. Không sao chép rồi cộng cả bản cũ và bản mới. Giữ loại trừ legacy subcontract details hiện hành.

Migration chỉ forward; dữ liệu/repair/bulk onboarding/mutation Cloud DEV và Production cần quyền riêng. Bản thảo này không cho phép chạy migration hay sửa số liệu.

## 13. Quy tắc đã chốt và cổng tích hợp riêng

Các quy tắc nghiệp vụ dưới đây đã được người dùng chấp thuận; không còn lựa chọn hard cap/cảnh báo, gross/net hoặc xử lý giám đốc không hợp lệ đang chờ:

- Hoàn tiền/sửa sai: kế toán lập yêu cầu có lý do và chứng từ; quản lý hiện hành của dự án duyệt snapshot. Kế toán xác nhận tiền hoàn thực nhận có chứng minh. Giữ payment gốc, correction khác refund, không tự khôi phục quyền chi.
- “Đã chi” là gross tiền ra thực tế hợp lệ; “Đã thu hồi” là tiền hoàn thực nhận đã xác nhận; headline “Chi ròng” là hiệu hai chỉ số. Không trừ một khoản hai lần.
- Hard cap hợp đồng áp dụng trên tổng các đợt đã cấp quyền, gồm phần đã dùng và còn lại. Chặn gửi vượt cap; phụ lục/điều chỉnh có chứng từ do quản lý dự án duyệt trước. Refund/correction không giải phóng capacity để gửi/chi thêm; dự án hoàn thành không được tăng cap hoặc nghĩa vụ.
- Khi phân công lại, quản lý mới nhận cùng snapshot đang chờ với audit; quản lý cũ mất quyền quyết định. Không yêu cầu kế toán gửi lại, không tự duyệt.
- Kế toán và quản lý đúng dự án đọc yêu cầu/chứng từ theo quyền. Giám đốc xem tổng và hồ sơ theo quyền riêng; không mở chi tiết lương cho mọi người có `cost.read`.
- Giám đốc nhận chuông/phân công là `vqh-director@taskovia.invalid`. Nếu tạm không hợp lệ vẫn cho quản lý duyệt, giữ thông báo chưa giao cho đúng tài khoản; không chuyển sang người khác hoặc cấp quyền tạm.
- Mỗi đợt một tiền tệ, số thập phân chính xác. Kế toán xác nhận basis thuế, phụ cấp và làm tròn; không tự suy công thức chưa có.
- MVP một payment–một đợt; một transfer phân bổ nhiều đợt ngoài MVP.
- Hash và dấu hiệu mã/ngày/đối tác/tiền hỗ trợ đối chiếu trùng; không tự cộng/xóa chỉ dựa hash hoặc OCR.
- OCR/AI có gate riêng trước tích hợp: provider, riêng tư/lưu dữ liệu, chi phí và đầu vào. Đặc tả lõi có thể được duyệt khi gate chưa mở; adapter fixture không sử dụng chứng từ thật hoặc gọi ngoài. Không coi duyệt văn bản là quyền gửi dữ liệu ngoài.

Thông tin vận hành như công thức bảng công/thuế từ hồ sơ, inventory lịch sử, onboarding quản lý Eo Gió và các quyền mới phải được chuẩn bị qua đường được hỗ trợ. Đây là dữ liệu/prerequisite triển khai, không phải các quyết định nghiệp vụ còn mở. Duyệt văn bản thiết kế không cho phép chạy mutation/migration hoặc cấp quyền hiện tại.

## 14. Tiêu chí chấp nhận và kiểm chứng dự kiến

1. Accountant kiểm tra scan, gửi; chỉ quản lý hiện hành của đúng dự án duyệt/trả. Không manager thì không submit; director duyệt lần hai không tồn tại.
2. Mỗi installment duyệt riêng. Duyệt chưa làm tăng “Đã chi” hoặc “Chi ròng”; payment proof-backed mới tăng tiền ra. Partial settlement giảm còn lại; 30/70 không cộng trùng giá trị hợp đồng. Hoàn thực nhận có chứng minh làm tăng “Đã thu hồi” và giảm “Chi ròng”, không sửa payment gốc và không tự tăng hạn mức chi; hủy/sửa bản ghi sai không tạo inflow.
3. Contract/quote, receipt, invoice, approval, upload lại và transfer proof của cùng sự kiện không tạo thêm cash.
4. Bảng công/công việc nghiệm thu/giữ lại là cơ sở, không cash. Release trả thực tế chỉ được tính một lần trên phần đã duyệt.
5. Chặn accountant/UI/RPC bypass, foreign company/project, actor bị offboard, quản lý cũ, sửa snapshot đã gửi và URL evidence không có quyền. Sau bàn giao, quản lý mới quyết định trên cùng snapshot mà không cần kế toán gửi lại; audit thể hiện bàn giao và race với quyết định cũ được tuần tự hóa.
6. Completion thắng race thì chặn khoản mới/cap tăng; settlement chỉ đợt duyệt trước completion và quyền chi còn lại. Refund/correction sau completion chỉ giao dịch cũ hoặc settlement hợp lệ liên kết đợt trước completion; không tạo nghĩa vụ/outflow mới, không hoàn capacity, upload chỉ chứng minh đúng lệnh ngoại lệ.
7. Retry quyết định/payment không tạo thêm cash, audit hoặc thông báo logic; cạnh tranh payment không vượt còn lại.
8. Chuông director ghi cùng approval thành công, chỉ thông báo “đã duyệt” và kiểm tra quyền khi mở. Director bị vô hiệu hóa vẫn không chặn manager approval; giữ đúng thông báo chưa giao, không chuyển recipient. Khi cùng identity hợp lệ lại, nhận thông báo một lần theo quyền hiện hành.
9. Lịch sử/tệp không bị xóa; migration không tự relabel ordinary lịch sử thành cash; hiển thị unreconciled rõ; không nhân đôi payment thầu phụ.
10. Không xuất chứng từ ra OCR/AI ngoài khi chưa qua cổng tích hợp; adapter được kiểm chứng bằng fixture tổng hợp, không giả OCR khi chưa nối; macro/hyperlink/lệnh nhúng không được thực thi.
11. Hợp đồng 100: đợt 30 đã dùng 10 còn 20 vẫn tiêu thụ 30 capacity; thêm 70 vừa cap, thêm 71 bị chặn. Hoàn 2 không tạo thêm 2 capacity. Phụ lục được quản lý duyệt có hiệu lực trước đợt vượt; không cộng lại retention và không đổi cap sau completion.
12. Hai pending requests riêng lẻ vừa cap nhưng tổng khi duyệt vượt: lock/recheck chỉ cho quyết định hợp lệ; request còn lại trả về có lý do. Correction khoản bị ghi sai không tạo refund thật hoặc cho tự chi lại; cash report giữ lịch sử và không double subtract.

Kiểm chứng khi có implementation được duyệt: unit/schema/service/RBAC tests, PostgreSQL/RLS/concurrency tests Cloud DEV theo runner guarded đã được phép, browser E2E toàn luồng và settlement, so sánh trước/sau historical migration và file integrity. Chưa chạy các kiểm chứng này cho đặc tả; đây là tiêu chí cho kế hoạch và implementation sau khi được duyệt.

## 15. Ranh giới triển khai sau khi duyệt

1. Người dùng duyệt văn bản cuối này trước khi viết kế hoạch. Sau đó viết kế hoạch và trình người dùng duyệt/chọn cách thực hiện. Provider gate và quyền mutation/migration là các cổng riêng; gate OCR chưa mở không ngăn duyệt đặc tả lõi hoặc lập kế hoạch adapter/fixture, nhưng ngăn tích hợp thật/gửi tài liệu ngoài.
2. Xây phân công quản lý tối thiểu, onboarding Eo Gió, request snapshots và evidence access.
3. Xây từng đợt duyệt, payment/proof/allocation, guards completion settlement và chuông.
4. Xây scan đã được phép, UX accountant/manager/director và bỏ draft/source UX.
5. Rehearse reconciliation/cutover lịch sử trên target được phép; chuyển reporting tất cả danh mục sang gross tiền ra, tiền hoàn thực nhận và headline “Chi ròng” với coverage rõ.
6. Kiểm chứng toàn luồng trước release. Không phát hành UI mới trong khi backend vẫn có đường bỏ duyệt hoặc headline còn trộn tiền và nghĩa vụ.

## 16. Các nguồn mã chính đã khảo sát

Tất cả nguồn dưới đây đọc tại accepted DEV SHA, không lấy working HEAD để suy hành vi:

- `AGENTS.md`, `package.json`.
- `app/components/app/navigation-permissions.ts`; `app/pages/costs/sources.vue`; `app/pages/costs/projects/[projectId].vue`.
- `app/pages/costs/[projectId]/entries/new.vue`; `app/components/costs/ProjectCostDetailEvidencePanel.vue`.
- `shared/schemas/costs/master-data.ts`, `project-costs.ts`, `project-finance-writes.ts`, `cost-evidence.ts`, `sources.ts`; `shared/schemas/rbac.ts`.
- `server/features/costs/project-cost.*`; `server/features/costs/finance/project-finance.summary.ts`; `server/features/costs/evidence/*`; `server/features/costs/imports/vqh-workbook-family-adapter.ts`.
- `server/features/project-register/project-register.repository.ts`; `server/features/rbac/rbac.*`; `shared/schemas/workflow.ts`.
- `20260919174116_c1_project_finance_expansion.sql`; `20260922073144_c1_accounting_write_evidence_storage.sql`; `20260923043432_c1_accounting_write_finalize_server_boundary.sql`.
- `20260924093428_c1_ordinary_cost_detail_lifecycle_foundation.sql`; `20260924120131_c1_ordinary_cost_detail_provenance_evidence_reads.sql`; `20260929035414_c1_root_cause_hardening.sql`; `20260930033149_c1_detail_source_audit_snapshots.sql`.
- `20261003065632_completed_projects_readonly.sql`; `20260818033418_employee_management_rbac.sql`.
- `docs/superpowers/specs/2026-09-24-c1-ordinary-cost-detail-lifecycle-design.md`; `docs/superpowers/specs/taskovia-cost-management-v1.2/02-taskovia-c1-detailed-spec-v1.2.md`; `docs/runbooks/c1-published-cost-history-preflight.md`.

**Trạng thái giao:** văn bản thiết kế cuối đã ghi đầy đủ các quy tắc nghiệp vụ được chấp thuận, đã tự rà soát giới hạn cộng dồn, refund/correction, completion, bàn giao và notification. Đang chờ người dùng duyệt chính văn bản cuối này trước khi viết kế hoạch; chưa có kế hoạch hoặc quyền triển khai. OCR/AI giữ cổng tích hợp riêng. Đã ghi nhận tài khoản giám đốc được chỉ định và kiểm tra danh tính/membership/role bằng SELECT Cloud DEV. Chưa cấp quyền manager, viết product code, cài parser/OCR, gửi chứng từ ngoài, chạy tests, migrate database, push hoặc tác động PR27.