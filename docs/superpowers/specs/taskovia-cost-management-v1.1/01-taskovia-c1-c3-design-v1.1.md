# Taskovia — Thiết kế tổng thể Chi phí thầu, Ghi nhận thực hiện và Chốt kỳ C1–C3

**Phiên bản:** 1.1 — 2026-09-11  
**Trạng thái:** DESIGN_BASELINE_V1_1 — hợp nhất theo định hướng và phạm vi cập nhật Sơn đã chấp nhận trong hội thoại. Đây là baseline thiết kế để bàn giao/lập kế hoạch C1, không phải lệnh thực thi.  
**Thay thế:** nội dung thiết kế v1.0; giữ file v1.0 nguyên trạng để truy vết.  
**Spec C1 đi cùng:** [02-taskovia-c1-detailed-spec-v1.1.md](02-taskovia-c1-detailed-spec-v1.1.md).  
**Khách hàng áp dụng đầu tiên:** VQH; công trình Eo Gió.  
**Phạm vi:** kiến trúc và nghiệp vụ xuyên C1–C3; database vật lý C1 nằm ở tài liệu 02. Không phải đặc tả triển khai đầy đủ C2/C3.  
**Nguồn phân tích repo:** `Sonos18/company-operations-platform`, commit `3d021b35b1228ffdd46a8dbb9884a59c00ab6c89`, nhánh `test/vqh-stage-01-operational-acceptance-hardening`. Nhánh `main` quan sát được: `8e1abc746a81f5b9f3f2fc6431648b5a10e09d58`. Đây là source anchor kế thừa từ lần phân tích v1, không phải HEAD vừa xác minh lại. Không suy ra trạng thái Cloud hoặc local từ hai SHA này.  
**Ranh giới cập nhật:** thêm tiếp nhận nguồn tổng hợp, đối chiếu và truy vết theo hai workbook; không sửa source, chạy test ứng dụng, migration hoặc nạp dữ liệu thật trong lượt biên tập này.

## 1. Những gì Sơn đã xác nhận

| ID | Yêu cầu đã xác nhận |
| --- | --- |
| U01 | Tạm dừng hoàn thiện Stage 01; không xóa phần đã làm. Thiết kế module chung cho Taskovia, không chỉ VQH. |
| U02 | C1: Sơn lấy Excel từ kế toán, nạp vào hệ thống để lưu và hiển thị. Giám đốc cần giá trị giao khoán, phát sinh, chi phí đã xác nhận, ứng/thanh toán và còn phải trả. |
| U03 | VQH làm việc với tổ đội và công ty thầu phụ; cách tính kết hợp theo thầu và hạng mục. |
| U04 | Gói hoàn thành nhập số tổng; đội đang thi công nhập theo chứng từ/lần nghiệm thu–thanh toán. Ưu tiên Eo Gió; ước lượng 2–3 đội đang hoạt động, chưa có danh mục đầy đủ. |
| U05 | Nguồn có cả trước và sau thuế; giữ lại bảo hành/khấu trừ tùy gói. |
| U06 | C2 lấy chấm công của kỹ sư VQH, theo từng thành viên/ngày và giữ lịch sử. Chấm công phía thầu diễn ra bên ngoài. Một số hạng mục tính theo khối lượng. |
| U07 | Kế toán chuẩn bị hợp đồng/danh sách nhân công; kỹ sư ghi nhận; kế toán lập đối soát; quản lý duyệt chi; kế toán đóng sổ và bổ sung hồ sơ. |
| U08 | Kỳ tháng từ ngày 01 đến cuối tháng, hoặc kỳ tuần theo ngày bắt đầu cho phần tính công. |
| U09 | Chỉ vai trò nội bộ VQH dùng hệ thống. Không có tài khoản/portal thầu, ký xác nhận thầu trực tuyến hay chuyển tiền tự động trong phạm vi này. |
| U10 | Giữ lịch sử khi sửa số chốt; không ghi nhận trùng khi chuyển nguồn C1 sang C3; phân quyền kỹ sư/kế toán/quản lý/giám đốc như đã thống nhất. |

Các quyết định D là thiết kế phần mềm theo các lựa chọn Sơn đã chấp nhận; không phải tuyên bố rằng VQH đã có sẵn những quy định này hoặc mọi số trong Excel đã được xác nhận. Việc Sơn chấp nhận cập nhật v1.1 không xác nhận thay các khoản tiền, đối tác, kỳ hoặc thanh toán còn chưa rõ trong nguồn.

| ID bổ sung | Quyết định cho bản 1.1 |
| --- | --- |
| U11 | Tiếp nhận workbook Eo Gió đang làm và workbook cải tạo mặt bằng kho đã hoàn thành làm nguồn kiểm chứng thiết kế; ưu tiên triển khai vẫn là Eo Gió. Công trình kho là project khác, không là giao khoán dưới Eo Gió. |
| U12 | Giữ lõi C1–C3; tích hợp C01–C08 của báo cáo tác động nguồn: nguồn tổng hợp độc lập, số nguồn không cộng sổ, nhiều bằng chứng/một khoản, gán phạm vi từng phần, tổng lịch sử, kỳ/làm tròn, nguồn chi, kiểm thử đa sheet. |
| U13 | C1 vẫn là file nguyên bản + nhập số chuẩn có kiểm soát. Không thêm auto-parser mọi Excel hoặc nghiệp vụ vật tư/doanh thu/liên công ty. |

## 1.1. Tóm tắt thay đổi v1.1

Luồng chuẩn đổi từ **chọn giao khoán rồi upload** sang **tiếp nhận nguồn trước → chọn phần nguồn → xác định bản chất/phạm vi → tạo hồ sơ tài chính → đối chiếu/công bố**. Đường bắt đầu từ giao khoán vẫn là tiện ích UI, dùng cùng cơ chế bên dưới.

Ba lớp dữ liệu độc lập: (a) file/phiên bản và phần nguồn; (b) số kế toán trình bày để đối chiếu, không có tác động tài chính; (c) sự kiện tài chính chuẩn có project/giao khoán và hiệu lực rõ ràng. Không cộng chéo ba lớp.

## 2. Nguồn thực tế: quan sát và giới hạn

Nguồn nghiệp vụ gồm câu trả lời của Sơn, ảnh bảng lương công nhật đội Chú 8 và hai workbook kế toán được cung cấp trong hội thoại. Báo cáo nội bộ `03-taskovia-accounting-workbooks-impact-review.md` giữ địa chỉ ô và số thực; không cần đưa workbook/báo cáo chứa số thật vào repository để implement spec này.

### 2.1. Bảng công chi tiết

Ảnh bảng công thể hiện từng nhân công, công lẻ, đơn giá theo người, thưởng, khoản bồi dưỡng chung và kỳ qua tháng. Thưởng không phải ngày công; họ tên không phải khóa định danh; chức vụ trên bảng không phải role đăng nhập. Ảnh không tự chứng minh paid, thuế hoặc phê duyệt.

Workbook tổng hợp mới có dòng cùng kỳ/tổng để đối chiếu với ảnh, nhưng chưa thay thế workbook bảng công ngày, roster hoặc công thức chi tiết của ảnh. Không tự gán tất cả kỳ lương trong sheet cho cùng một đội chỉ vì một kỳ trùng ảnh.

### 2.2. Hai workbook tổng hợp

Theo báo cáo đối chiếu nguồn, các mẫu có các đặc điểm cần hỗ trợ:

| Quan sát | Hệ quả thiết kế |
| --- | --- |
| Workbook có nhiều thầu, tổng công trình, doanh thu, vật tư và sheet ẩn | Lưu nguồn độc lập; chỉ chọn phần thuộc C1. Không đồng nhất một file với một giao khoán. |
| Một cột có cả hợp đồng, ứng và giá trị công việc; header “tạm ứng” không luôn khớp mô tả thanh toán | Phân loại từng khoản; xác nhận nguồn khác xác định đúng bản chất tiền. |
| Cùng khoản xuất hiện trong sheet khoán và vật tư; bảng công chi tiết và dòng tổng kỳ cùng phản ánh một khoản | Nhiều bằng chứng gắn một sự kiện tài chính; không tự cộng theo số vị trí xuất hiện. |
| Có dòng mô tả công việc ở nơi khác tên project trong filename | Filename/project gợi ý không xác định nơi chịu chi phí. Giữ phần chưa rõ trong hàng đợi đối chiếu. |
| Gói kho hoàn thành vẫn có giữ lại bảo hành | Completed không phải paid hoặc hết nghĩa vụ. Không áp tỷ lệ giữ lại của mẫu thành policy chung. |
| Tổng nguồn có nhiều cơ sở, phần còn lại trống, công thức/cached error, số làm tròn khác số gốc | Số theo nguồn là lớp đối chiếu riêng; thiếu dữ liệu không là 0. |
| Kỳ lịch sử có thể dài hơn 7 ngày, mô tả ngày không nhất quán, tên năm trong file khác kỳ thực tế | Giữ raw date/period, chuẩn hóa có căn cứ; không bó lịch sử theo lịch vận hành mới. |
| Tài khoản/bên chi có nhãn khác company đang quản lý hồ sơ | Nguồn chi khác chủ sở hữu dữ liệu; không tự sinh công nợ hay cấp quyền liên company. |

Đây là quan sát từ nguồn, không phải kết luận kế toán đã sai hoặc tiền đã chuyển. Hai mục giống nhau có thể là hai nghiệp vụ độc lập hoặc hai bản trình bày một nghiệp vụ; cần đối chiếu trước công bố. Các câu hỏi về số thực là việc chuẩn hóa nguồn, không phải blocker để thiết kế/build C1 bằng fixture tổng hợp.

## 3. D01 — Ranh giới module và cách tái sử dụng

Giữ modular monolith Nuxt/Nitro + PostgreSQL/Supabase. Không tạo workflow engine mới hoặc ERP/sổ cái kế toán tổng hợp.

```text
Taskovia core: Tenant / Company / Identity / RBAC / Audit / File storage
    |
    +-- Project register: công trình thật, độc lập Journey
    +-- External parties: tổ đội/công ty đối tác
    +-- Engagements: giao khoán/giao việc tại công trình
    |       +-- Components: hạng mục với cách tính riêng
    +-- Accounting sources: nguồn tổng hợp / phiên bản / phần được chọn
    |       +-- Reported figures: số nguồn để đối chiếu, không cộng sổ
    +-- Cost documents: sự kiện tài chính chuẩn + nhiều bằng chứng nguồn
    +-- Work records (C2): công và khối lượng
    +-- Settlements (C3): đối soát, duyệt chi, đóng hồ sơ kỳ

VQH configuration: tên gọi, quyền được gán, đơn vị tính, kỳ chốt,
                  policy tính/duyệt được áp dụng cho giao khoán.
```

Schema, API và rule kỹ thuật không chứa ID/tên VQH hoặc Eo Gió hard-coded. Dữ liệu khác company không tự chia sẻ kể cả cùng tenant hoặc cùng mã số thuế đối tác. Thầu phụ là đối tác của company, không tự trở thành company/tenant trong Taskovia.

## 4. D02 — Công trình và giao khoán độc lập Stage 01

Một project mới có thể hình thành từ Opportunity/Journey; project lịch sử được đăng ký trực tiếp với `origin=legacy_import`. Không tạo Opportunity giả, hoàn thành stage giả hoặc dùng ID fixture.

Một đối tác có nhiều giao khoán ở nhiều project; một giao khoán có nhiều component. Cách tính nằm ở component, không gắn duy nhất lên đối tác. Ví dụ một đội làm phần khoán và công phát sinh ngoài khoán: hai component/nguồn được phân biệt, không tính tiền hai lần.

Giao khoán chưa có tổng giá cố định được phép có giá trị cam kết chưa biết, không mặc định bằng 0. Trạng thái hoàn thành công việc khác trạng thái hết công nợ, hết bảo hành hoặc đã đóng kỳ.

Dữ liệu tổng không rõ hạng mục được giữ ở cấp giao khoán; không tạo chi tiết hạng mục giả để ép đủ trường.

## 5. D03 — C1: nguồn tổng hợp, số đối chiếu và sự kiện tài chính

C1 không chỉ là kho file, nhưng cũng không phải công cụ tự đọc mọi biểu mẫu Excel. Có ba lớp rõ ràng:

| Lớp | Lưu gì? | Khi chưa biết thầu/project | Tác động KPI tài chính |
| --- | --- | --- | --- |
| Nguồn kế toán | Nguồn logic, phiên bản file bất biến, phần nguồn được chọn và hàng đợi đối chiếu | Được lưu; chỉ bắt buộc tenant/company sở hữu nguồn | Không |
| Số theo báo cáo nguồn | Nhãn gốc, số/ô trống/lỗi, cơ sở tiền, phạm vi, kỳ và vị trí trong nguồn | Được lưu có nhãn chưa rõ; không giả định phạm vi theo tên file | Không; hiển thị riêng |
| Hồ sơ tài chính chuẩn | Giao khoán đã xác định, từng loại giá trị, ngày, hiệu lực và bằng chứng | Không tạo financial fact chưa xác định phạm vi; không dùng thầu giả | Chỉ khi đủ điều kiện công bố/xác nhận |

**Luồng chuẩn:** Sơn tiếp nhận workbook → chọn vùng có liên quan → ghi các điểm chưa rõ → xác định project/đối tác/giao khoán và ý nghĩa khoản → nhập số tối thiểu → đối chiếu → công bố. Có thể làm từng phần, không phải xử lý hết workbook mới lưu hoặc dùng phần hợp lệ. Không tạo tự động một row dữ liệu cho mỗi ô của workbook.

Chia sẻ file/số nguồn cho người được quyền đọc chỉ có nghĩa **nguồn đã sẵn sàng để xem**. Đây không phải công bố chi phí, xác nhận toàn bộ nội dung file hoặc duyệt chi. Công bố financial document là hành động riêng, cần nguồn/bản chất/phạm vi đúng. Nguồn unverified vẫn được lưu và đọc có nhãn; không tự tạo KPI đã xác nhận.

Phần nguồn chọn rõ một vai trò: khoản chi tiết, tổng/subtotal, bản trình bày lặp, hoặc bằng chứng/ngữ cảnh. Tổng nguồn không phải khoản chi mới. Cùng một khoản có nhiều source link; số dòng Excel và hash file không phải danh tính của nghiệp vụ qua các phiên bản.

Một file mới kế toán gửi được lưu thành version mới của nguồn logic. Không tự ghi nhận tất cả dòng một lần nữa, không thay bytes/giá trị của version cũ, không tự sửa các facts đã công bố. Đổi nội dung nghiệp vụ cần đối chiếu với fact cũ và xử lý bằng correction có lịch sử.

**Hiển thị file:** XLSX xem giá trị tĩnh, có nhãn sheet/dòng/cột ẩn và giới hạn preview; PDF/ảnh xem an toàn; XLS lưu/tải gốc. Không chạy macro, công thức, external link hoặc gửi file ra Office/AI bên ngoài.

**Ngoài C1:** parser tự đọc mọi layout, OCR sản xuất, sửa/tính workbook trực tuyến, import toàn bộ vật tư/doanh thu, C2 attendance, C3 rate/settlement engine, portal thầu, lương nội bộ, kế toán thuế và chuyển tiền.

## 6. D04 — Hai chế độ nhận dữ liệu, một nguồn báo cáo

### 6.1. Gói đã hoàn thành: tổng lịch sử đến ngày T

Nhập một hồ sơ tổng lịch sử, có ngày cắt T, các số lũy kế được nguồn xác nhận và trạng thái đầy đủ riêng từng nhóm số. Được phép chưa biết ngày bắt đầu hoặc chi tiết từng tháng.

Số này tham gia tổng lũy kế từ ngày T trở đi; không biến thành chi phí phát sinh tại ngày upload hoặc tự gán vào tháng T. Không xem chi tiết được trước T thì hiển thị giới hạn, không hiện số 0.

### 6.2. Gói đang thi công: từng chứng từ

Nhập từng đợt nghiệm thu/công, phát sinh, khoản chi, giữ lại và khấu trừ. Nếu thiếu phần trước ngày bắt đầu nhập chi tiết, dùng một tổng lịch sử đến T rồi chỉ nhận chi tiết sau T. Nếu có chi tiết từ đầu thì không tạo tổng lịch sử.

### 6.3. Chống đè phạm vi

Chỉ một họ hồ sơ tổng lịch sử đang có hiệu lực cho một giao khoán. Chặn nhập chi tiết vào phạm vi đã được tổng lịch sử bao phủ. Hồ sơ qua mốc cắt phải tách theo số nguồn có căn cứ; không tự chia đều. C1 chưa có chức năng bung tổng lịch sử thành toàn bộ chi tiết; sau này phải có thao tác thay thế phạm vi có đối soát, không cộng thêm.

Một workbook tổng hợp nhiều giao khoán có thể liên kết nhiều hồ sơ, nhưng mỗi financial document chịu trách nhiệm một giao khoán và một phần nguồn xác định. Không gom cả project thành một “thầu tổng”. Số nguồn chưa biết cutoff hoặc chưa biết thầu giữ ở lớp nguồn, không tạo opening giả. Ngày in/ký tổng hợp chỉ là căn cứ gợi ý, chưa tự là ngày cắt dữ liệu được xác nhận.

## 7. D05 — Định nghĩa tiền, thuế, giữ lại và khấu trừ

Phân biệt cam kết, giá trị xác nhận, tiền thực chi và số còn phải trả. Một hợp đồng và một biên bản nghiệm thu không phải hai lần chi phí; một bảng công và phiếu trả tiền không phải hai lần chi phí.

| Chỉ số | Cơ sở đề xuất |
| --- | --- |
| Giao khoán ban đầu | Giá trị cam kết nguồn, nếu biết. |
| Phát sinh cam kết | Phần tăng/giảm giao khoán được xác nhận. Không cộng thêm vào chi phí nếu nghiệm thu đã bao gồm. |
| Giá trị xác nhận theo cơ sở thanh toán | Giá trị công/khối lượng/đợt nghiệm thu được xác nhận, trước giữ lại và giảm trừ nghĩa vụ. Nhãn quản trị, không tuyên bố là chi phí hạch toán thuế. |
| Chi phí/giá trị trước thuế | Chỉ tổng hợp phần có số trước thuế đáng tin cậy. |
| Tiền ứng, tiền thanh toán, tiền chi chưa phân loại | Giao dịch tiền thực tế, phân loại riêng; tổng chi gộp cũng được hiển thị. |
| Ứng chưa phân bổ | Tiền ứng còn chưa được áp dụng vào giá trị phải trả nào, sau hoàn ứng. |
| Còn phải trả tổng | Nghĩa vụ xác nhận còn lại, bao gồm phần đang giữ lại. |
| Đang giữ lại | Khoản chưa được giải phóng, không phải giảm chi phí. |
| Còn phải trả ngoài giữ lại | Còn phải trả tổng trừ giữ lại; không đồng nghĩa đã đến hạn nếu chưa có dữ liệu hạn trả. |

Các số được lưu có cơ sở nguồn: trước thuế / sau thuế / nguồn không tách thuế / chưa rõ. Không tự dùng VAT 0%, 8% hoặc 10%; không đoán khả năng khấu trừ VAT. Số trước thuế chưa có số thuế không được xem là sau thuế. Nguồn không tách thuế không đồng nghĩa được miễn thuế.

Cho phép ghi riêng giá trị phải trả trước giữ lại/khấu trừ khi chính nguồn xác định được số này, dù chưa tách được VAT. UI phải nói rõ cơ sở của từng KPI. Số chưa chuẩn hóa được lưu và xem; không cộng lẫn các cơ sở thành một tổng trông có vẻ chính xác.

Khấu trừ phải có ý nghĩa: giảm giá trị công việc thì giảm chi phí/giá trị xác nhận; khoản chỉ giảm nghĩa vụ với thầu thì ghi giảm nghĩa vụ; giữ lại là khoản riêng; hoàn ứng là luồng tiền riêng. Không có một ô “khấu trừ” trừ tất cả nơi.

### 7.1. Công thức quản trị

Trong cùng tiền tệ và phạm vi có dữ liệu đầy đủ:

```text
C = giá trị thanh toán được xác nhận trước giữ lại/khấu trừ
K = khoản giảm nghĩa vụ với thầu (không bao gồm giữ lại)
P = tiền thanh toán thực tế đã phân bổ
A = tiền ứng đã áp dụng vào nghĩa vụ, không phải mọi tiền đã ứng
R = giữ lại chưa giải phóng

Nghĩa vụ ròng               = C - K
Còn phải trả tổng           = C - K - P - A
Còn phải trả ngoài giữ lại  = C - K - P - A - R
```

Ứng chưa phân bổ đứng riêng. Chi vượt nghĩa vụ được giữ thành tiền chưa phân bổ, không ép công nợ về 0. Hoàn tiền và đảo phân bổ có hồ sơ/liên kết riêng.

Nếu thiếu nhóm đầu vào, API trả số đã biết cùng `partial/unavailable`, không `COALESCE` số thiếu thành 0 để khẳng định tổng đúng. Số dư kế toán báo trực tiếp có thể hiển thị là **số nguồn**, nhưng không cộng thành một giao dịch hoặc trộn với số hệ thống tính.

### 7.2. Tổng theo Excel và tổng chuẩn hóa

Giữ được tổng công trình/tổng lương/tổng cam kết hoặc số “còn lại” chưa rõ bản chất dưới dạng `source_reported_figures`, không phải financial lines. Không cộng các total/subtotal với nhau hoặc vào C/P/A/K/R. Số toàn công trình không được kỳ vọng bằng KPI thầu phụ.

Chỉ tính chênh lệch khi đã xác định cùng phạm vi, tiền tệ, cơ sở tiền, khoảng kỳ/ngày cắt và cách làm tròn. Nếu chưa tương đương, trả `not_comparable` cùng lý do; không tính một số chênh rồi gọi đó là sai lệch kế toán. Số hệ thống partial vẫn phải giữ nhãn partial dù tình cờ bằng số Excel.

Chênh lệch làm tròn được giữ là điểm đối chiếu. Không tự chọn cột gốc/cột làm tròn làm cả cost và cash; không tự tạo adjustment để khớp. Chỉ khi nguồn xác nhận một khoản điều chỉnh nghĩa vụ/tiền thật mới ghi bằng loại tài chính đúng nghĩa.

### 7.3. Nguồn chi/bên trả khác chủ sở hữu dữ liệu

Cash line có thể lưu phương thức chi, nhãn nguồn/quỹ/tài khoản, nhãn bên chi và quan hệ bên chi với company sở hữu hồ sơ. Không bắt lập bank-account master hoặc tạo company/tenant cho nhãn tài khoản trong file.

Tiền bên khác chi hộ chỉ được phân bổ giảm nghĩa vụ khi có căn cứ company chấp nhận khoản chi đó. Nhãn “ĐNTT” hoặc số nằm trong cột tài khoản không tự chứng minh tiền thực chi. `cash_unclassified` chỉ là tiền đã có căn cứ thực chi nhưng chưa rõ ứng/thanh toán, không là nơi chứa yêu cầu chi chưa trả.

Báo cáo tách tiền company tự chi / bên khác chi / chưa rõ bên chi. Không gọi toàn bộ tiền theo nguồn là “company đã chuyển”. Không sinh công nợ liên công ty, bút toán hay ngân hàng thật trong C1.

## 8. D06 — Ngày chứng từ, ngày thực hiện và ngày ghi nhận

Lưu tách: ngày chứng từ; từ/đến ngày thực hiện; ngày báo cáo được nguồn/nhân viên xác định; thời điểm nạp/công bố trên hệ thống.

C1 mặc định báo cáo biến động theo **ngày báo cáo chứng từ**, ghi nhãn rõ. Tổng lịch sử được trình bày như phần trước mốc dữ liệu, không đưa vào biến động kỳ hiện tại. Không dùng ngày upload làm ngày nghiệp vụ.

C2/C3 có thể báo cáo theo ngày thực hiện khi có đủ nguồn chi tiết. Với kỳ 28/08–03/09, không lấy tổng × 4/7 và × 3/7. Công theo ngày, thưởng theo ngày/đợt nguồn và bồi dưỡng không rõ phân bổ được giữ riêng. Tổng ngày thực hiện và tổng theo chứng từ là hai góc nhìn, không cộng hai báo cáo với nhau.

Kỳ tuần vận hành mặc định gồm 7 ngày, bắt đầu ở ngày neo của component. Kỳ tháng dùng tháng lịch. Không mặc định tuần bắt đầu thứ Hai, không bắt mọi giao khoán cùng lịch. Thay policy áp dụng kỳ mới, không làm đổi các kỳ đã khóa.

C1 cho khoảng kỳ lịch sử bất kỳ có căn cứ, gồm kỳ ghép nhiều tuần; không có constraint mọi kỳ dài đúng 7 ngày. Mô tả ngày gốc được giữ. Ngày invalid hoặc mâu thuẫn có thể nằm trong vùng nguồn chờ đối chiếu, không được tự sửa năm/ngày hoặc thay bằng ngày upload. Financial delta vẫn cần reporting_date xác nhận; chưa đủ thì chưa kích hoạt.

C2/C3 có ngoại lệ gộp/rút kỳ trong cùng component theo khoảng ngày rõ, lý do và quyết định quản lý gắn hồ sơ trước khi duyệt. Không tạo hai kỳ có hiệu lực bao phủ cùng nguồn billable. Chi tiết command/schema ngoại lệ thuộc spec C2/C3, không implement rate/period engine ở C1.

## 9. D07 — C2: chuẩn bị roster và ghi nhận công/khối lượng

Kế toán (hoặc người được cấp quyền chuẩn bị) phải quản lý roster/hợp đồng tối thiểu ngay khi ra C2; không chờ đến C3 vì kỹ sư cần danh sách để chấm công.

`workers` là người lao động của đối tác, không phải `employees`, không cần tài khoản Auth. Quan hệ vào/ra đội có ngày hiệu lực. Mã nội bộ ổn định; tên/chức vụ hiển thị và ngữ cảnh roster được giữ theo phiên bản lịch sử.

Kỹ sư VQH chỉ ghi công trên project được giao, chọn người/ngày/component; hỗ trợ công lẻ. Trống = chưa chấm, 0 = đã ghi nhận không có công theo loại được chọn. Không suy từ roster rằng ai cũng có mặt; không suy từ ô trắng trên mẫu rằng đã nghỉ.

Mỗi thay đổi có revision, actor, thời gian, lý do khi sửa bản đã gửi. Bản đã được dùng trong kết toán không được sửa đè. Các thao tác gửi/sửa đều có kiểm soát phiên bản và idempotency để tránh nhấn lại khi mạng yếu.

Dữ liệu công của đội thầu không phải nguồn tính chính thức; nhân viên đối chiếu bên ngoài. Tài liệu phía thầu được gắn làm bằng chứng, không tự chép đè công của VQH.

Khối lượng đề xuất dùng measurement theo đơn vị và lượng tăng của lần xác nhận, không cộng các ảnh chụp số lũy kế. Với khoản khoán, attendance có thể `tracking_only`. Nguồn đã được đánh dấu nằm trong khoán không được tính thêm tiền công trừ khi có phạm vi phát sinh riêng.

C2 tạo nguồn thực hiện. Trong thời gian chưa có C3, Excel vẫn có thể là nguồn chi phí chính thức; C2 không tự sinh chi phí lần nữa.

## 10. D08 — C3: lập đối soát, duyệt chi và đóng kỳ

```text
Kế toán chuẩn bị hợp đồng, roster, đơn giá có hiệu lực
    -> Kỹ sư VQH ghi và gửi công/khối lượng
    -> Kế toán đối chiếu bên ngoài, lập hồ sơ kỳ
    -> Quản lý duyệt giá trị/duyệt chi hoặc trả lại
    -> Kế toán hoàn thiện hồ sơ, đóng kỳ
```

Một hồ sơ chốt cho một component và kỳ, rồi tổng hợp lên giao khoán/đội/project. Kỳ tuần và tháng khác component có thể cùng tồn tại. Không đưa lại cùng nguồn đã thanh toán/kết toán vào kỳ tháng như một chi phí mới.

**Mốc ghi nhận đề xuất:** quản lý duyệt thì tạo một chứng từ giá trị xác nhận vào cùng nguồn tài chính C1, gắn trạng thái hồ sơ “đã duyệt, chưa đóng”. Đóng kỳ xác nhận hoàn thiện và khóa hồ sơ, không tạo thêm chi phí. Trạng thái thanh toán là trục riêng: chưa trả/một phần/đủ căn cứ đã trả. Đóng kỳ không bắt mọi khoản phải trả đã bằng 0; bảo hành và trả chậm có thể còn.

Quản lý duyệt chi không phải bằng chứng đã chuyển tiền. Kế toán chỉ ghi khoản tiền thực chi khi có căn cứ; phiếu đề nghị chi không đủ. Hệ thống không chuyển tiền và không ký thay thầu.

Duyệt gắn chính xác revision công/khối lượng, đơn giá, các khoản thêm/bớt, người duyệt và policy snapshot. Thay đổi số ảnh hưởng sau khi lập phải lập lại revision và duyệt lại. Sau khóa dùng hồ sơ điều chỉnh liên kết kỳ gốc; không mở cửa sửa lịch sử.

Phiên bản C3 đầu tiên đề xuất mỗi dòng nguồn billable được dùng trọn vẹn trong tối đa một hồ sơ có hiệu lực. Cần chia nhỏ thì chia nguồn trước khi lập hồ sơ, không âm thầm lấy lại một phần. Nhập số lũy kế khối lượng phải chuyển thành phần tăng có đối soát.

## 11. D09 — Nguồn chi phí duy nhất và mốc chuyển tiếp

```text
C1: nguồn tổng hợp -> phần đã chuẩn hóa/xác nhận -> cost_documents
C2: công/khối lượng -> nguồn vận hành, chưa tự vào cost_documents
C3: hồ sơ kỳ được quản lý duyệt -> cost_documents
Director dashboard đọc cost_documents, không cộng thêm số từ work logs.
```

Mốc chuyển C1 sang C3 được xác định theo giao khoán/component và ngày/kỳ. Trước mốc là nguồn nhập; sau mốc là hồ sơ hệ thống. Kỳ qua mốc phải chọn ranh giới hoặc tách bằng số nguồn đủ căn cứ. Không tạo hai nguồn tài chính cùng bao phủ một phạm vi.

File kế toán được upload sau khi đã chốt C3 chỉ là bằng chứng/đối chiếu của hồ sơ có sẵn. Nếu có chênh lệch, tạo điều chỉnh theo luồng, không nhập thêm một giá trị xác nhận song song. C2 không bị coi là thay nguồn tài chính chỉ vì đã có attendance.

## 12. D10 — Quyền và bảo mật

C1 có người nạp (Sơn) và người xem tài chính (giám đốc). Quyền đọc nguồn tài chính toàn company (`cost.source.read`) tách khỏi quyền đọc facts (`cost.read`) và xem bytes (`cost.file.read`). Chia sẻ một workbook tổng hợp là chia sẻ toàn bộ nội dung file với actor có quyền nguồn toàn company, không hứa che được các sheet bằng cách chỉ trỏ tới một vùng. Không cấp `company_admin` chỉ để xem. Mapping tài khoản thật là thao tác onboarding sau khi có quyền thực hiện, không lấy tên trên chữ ký ảnh để tự gán account.

C2/C3 thêm quyền chuẩn bị roster, ghi/gửi thực hiện, lập đối soát, duyệt chi, đóng kỳ và ghi tiền thực chi. Mặc định kế toán lập và quản lý duyệt là hai actor khác nhau. Một nhân viên có thể kiêm nhiều chức năng, nhưng quyền tự duyệt hồ sơ của chính mình không tự phát sinh; ngoại lệ cần policy được duyệt.

Kỹ sư không được xem đơn giá và số tiền nếu chỉ có quyền chấm công, kể cả qua API, file Excel gốc, audit, endpoint tải file hoặc URL tài liệu. Một workbook chứa bảng lương là tài liệu tài chính, không dùng làm roster công khai cho kỹ sư. Roster C2 được xuất thành projection an toàn từ nguồn cấu trúc.

Tất cả FK liên quan giữ tenant/company/engagement đúng scope. Company cùng tenant vẫn cách ly. RLS và grants áp dụng cả table, RPC, view và storage; không chỉ ẩn nút ở frontend. Scope được resolve từ active membership phía server. Không dùng service-role trong request nghiệp vụ.

File private; xác thực trước cấp link. Link ký ngắn hạn vẫn là bearer URL đến khi hết hạn; không hứa thu hồi tức thời URL đã phát hành. Không public workbook, không gửi file lên dịch vụ xem Office/AI bên ngoài.

## 13. D11 — Những phần giữ lại và phần nâng cấp trong repo

Repo tại SHA trên dùng mixed repositories: project/Journey prototype còn mock; Opportunity, Workflow, Stage01, config và employees có đường HTTP. `employees.user_id` bắt buộc; client dữ liệu thường mang JWT người dùng. Đọc `AGENTS.md`, plugin và migrations làm source anchors, không xem README prototype là mô tả đầy đủ hiện trạng.

C1 thêm ProjectRegister domain/repository và màn hình `/costs`, không ép `ProjectDetail` prototype phải có workflow giả. Chỉ một bảng project canonical; hai projection UI không phải hai bản dữ liệu project. Prototype có thể tồn tại riêng trong phạm vi cũ; không fallback mock trong module chi phí.

Thêm điều hướng permission-first cho giám đốc chỉ có quyền chi phí. Repository mới resolve company ở mỗi request; cache và response đang chạy phải được vô hiệu hóa khi đổi company/logout. Không âm thầm sửa cả Stage01 để đạt việc này.

Tái sử dụng auth/RBAC/audit nền tảng. Audit tài chính chi tiết phải có quyền tài chính; audit dùng chung chỉ ghi metadata an toàn nếu các reader rộng hơn. File và contact dùng lại chỉ khi quyền phù hợp; C1 không bắt đọc Opportunity chỉ để xem nhà thầu.

## 14. Phân kỳ vật lý

| Giai đoạn | Xây thực tế | Không xây sớm |
| --- | --- | --- |
| C1 | Project/party/engagement/component; nguồn tổng hợp/version/phần chọn; số nguồn đối chiếu; tài chính có kiểu; nhiều bằng chứng; hàng đợi review; phân bổ tiền; coverage; file; dashboard; audit/quyền. | Roster đầy đủ, attendance engine, rate engine, settlement workflow, portal thầu. |
| C2 | Roster có hiệu lực, project assignment, attendance/measurement revisions, UI kỹ sư và chuẩn bị kế toán. | Tự hạch toán từ mọi work log; đối soát ngoài hệ thống của thầu. |
| C3 | Đơn giá/policy snapshot, hồ sơ kỳ, duyệt/đóng, liên kết nguồn, tài liệu và mốc chuyển nguồn. | Sổ cái, VAT filing, bảo hiểm/lương nội bộ, chuyển tiền. |

C2/C3 bổ sung bằng migration forward-only; không làm mất ID/giao khoán/số liệu C1. Không tạo bảng c1_*, c2_*, c3_* hoặc vqh_* cho các domain chung.

## 15. Tiêu chí chấp nhận tổng thể

C1 phải sử dụng độc lập được: giám đốc biết số đã nạp đến đâu, số nào đã xác nhận, còn thiếu gì, số theo nguồn hay do hệ thống tính, và mở được tài liệu gốc. Không yêu cầu dựng lịch sử chấm công gói cũ.

C2 không làm tăng chi phí chỉ vì thêm công. C3 không tạo lại chi phí khi đóng kỳ hoặc upload thêm bản Excel. Đơn giá mới không làm thay đổi kỳ cũ. Gói hoàn thành vẫn theo dõi khoản giữ lại và nợ chưa trả.

Test tối thiểu có hai tenant, hai company cùng tenant, actor kiêm vai trò, company switch đang chạy request, công lẻ, kỳ qua tháng/kỳ lịch sử khác 7 ngày, thưởng khác công, tiền trước/sau thuế, giữ lại/hoàn ứng, file hỏng, nhập lại, sửa có liên kết, và nâng cấp từ dữ liệu C1.

Bổ sung test nguồn tổng hợp chưa có giao khoán vẫn upload được; một cột nhiều nghĩa; một khoản nhiều sheet; project khác trong file; nguồn chi bên khác; số toàn project khác KPI thầu; sheet ẩn lỗi không chặn phần hợp lệ; file version mới không tự nhân đôi facts. Kiểm thử dữ liệu thực và production smoke là bước riêng có authorization; sự hiện diện workbook không phải kết quả test phần mềm.

## 16. Ranh giới phê duyệt và nguồn tham chiếu

Sơn đã chấp nhận hướng thiết kế và cập nhật v1.1. Hai tài liệu 01/02 v1.1 là cặp baseline thống nhất; CodeX không trộn schema/API v1.0 với phần mới. Việc lập kế hoạch và thực thi C1 là bước bàn giao riêng. Phê duyệt thiết kế không tự cho phép mutation Cloud DEV, nạp dữ liệu thật, deploy Production, merge branch hoặc tạo PR. CodeX phải xác minh execution base và migration chain; dừng nếu khác source anchor ảnh hưởng contract. Không yêu cầu resume B4 chỉ để làm C1 và không tuyên bố Stage01 đã nghiệm thu xong.

Không commit file Excel thật/ảnh, tên nhân công, số tiền thật hoặc tài liệu hợp đồng vào repository/test fixture. Dùng fixture tổng hợp, vô danh. Cấu hình/actor thật, file backup và môi trường pilot được phê duyệt riêng.

Nguồn repo đã đọc lại tại SHA trên: `AGENTS.md`; `app/plugins/repositories.client.ts`; `supabase/migrations/20260818033418_employee_management_rbac.sql`; `server/utils/supabase-client.ts`; `package.json`. Nguồn thiết kế đã đối chiếu trong hội thoại: Journey canonical, Stage01 business design, backend architecture, tenancy/workflow/opportunity migrations, repository contracts.

Nguồn workbook dùng cho v1.1: hai file kế toán Sơn gửi; tham chiếu chi tiết E01–E09 trong báo cáo tác động nội bộ ngày 2026-09-11. Các mục chưa rõ về PCCC, đợt kết cấu thép, dòng xưởng, tên đội, ngày/kỳ và số làm tròn phải tiếp tục đối chiếu trước công bố số thật; không được đóng giả định mặc định trong phần mềm.

Nguồn kỹ thuật chính thức kế thừa từ bản v1, ghi nhận kiểm tra 2026-09-10; không truy cập/xác minh lại trong lượt cập nhật tài liệu này (không xác định nghiệp vụ tài chính của VQH):

```text
https://supabase.com/docs/guides/database/postgres/row-level-security
https://supabase.com/docs/guides/storage/buckets/fundamentals
https://supabase.com/docs/guides/storage/serving/downloads
https://www.postgresql.org/docs/current/datatype-numeric.html
https://www.postgresql.org/docs/current/ddl-constraints.html
https://www.postgresql.org/docs/17/explicit-locking.html
```

## 17. Ma trận thay đổi 1.0 → 1.1

| Mã báo cáo tác động | Vị trí hợp nhất trong thiết kế | Phần vật lý/API/test trong spec C1 |
| --- | --- | --- |
| C01 | D03: nguồn độc lập trước khi có giao khoán | 5.14–5.16; luồng 4.0; sources API; A39–A40 |
| C02 | D05.2: tổng nguồn không cộng sổ | 5.17; báo cáo 7.4; A43–A44, A55 |
| C03 | D03/D09: nhiều nguồn/một khoản, file revisions | 5.18–5.19; 6.4; A42, A51, A53 |
| C04 | D02/D03: gán scope/bản chất từng phần | 5.16/5.19; 6.5; A41, A45–A46, A58 |
| C05 | D04/D05: opening theo từng giao khoán, giữ lại | 4.1, 5.7, 7.1; A05/A11 và A54 |
| C06 | D06/D05.2: kỳ lịch sử và chênh làm tròn | 5.16/5.17; 7.4/8.1; A47–A48 |
| C07 | D05.3: nhãn nguồn chi không đổi owner | 5.8/5.9; 7.1; A50 |
| C08 | D03/D10/D11: vùng dùng, review, file visibility | 8–10/12–14; A49, A52, A56–A57 |

Bản này thay thế các diễn đạt v1 “upload luôn cần cost document” và “chưa có workbook tổng hợp”. Không thay cách ly tenant/company, các bất biến tiền, luồng vai trò C2–C3 hoặc giới hạn không xây ERP.
