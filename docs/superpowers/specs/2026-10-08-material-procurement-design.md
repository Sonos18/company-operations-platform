# Taskovia — Thiết kế yêu cầu vật tư, mua hàng và chi phí hợp đồng ký

Ngày: 2026-10-08 (Asia/Bangkok).
Trạng thái: bản thiết kế để người dùng review; chưa triển khai.
Nguồn nghiệp vụ: các quyết định trực tiếp của người dùng trong chat này.
Nguồn code đã đọc: origin/dev b00f0eb48effed49930f2aea6c090d77c2c175a5.
Nhánh task trước khi lưu tài liệu: codex/site-engineer-material-request tại 1da87fe988a7300de58d206b65af6c14283d7d24.

## 1. Phạm vi

Task hiện tại: vật tư chuẩn, phiếu kỹ sư, mua hàng xét duyệt, tách đơn, báo giá, hợp đồng ký, chi phí cam kết và thực chi vật tư.
Người dùng đã nêu định hướng bỏ quản lý duyệt từng đợt cho toàn bộ chi phí, nhưng sau đó giới hạn task không làm nhân công nội bộ/khoản không hợp đồng. Bản này triển khai phần vật tư có hợp đồng ký; áp dụng cho loại khác là follow-up F1, chưa tự mở rộng trong task này.
Không làm sourcing, đề xuất/xếp hạng NCC, thương lượng giá, lập hợp đồng tự động, kho/nhập xuất/giao nhận, chữ ký số tự động, nhân công nội bộ hay căn cứ chi phí không hợp đồng.
Không sửa quy tắc duyệt phụ lục hợp đồng, hoàn tiền hoặc correction vốn có chỉ vì bỏ duyệt từng đợt chi.
Không tạo sổ thanh toán thứ hai, không biến hồ sơ ký thành tiền đã chi.

## 2. Flow đã chốt

1. Kỹ sư lập và gửi phiếu yêu cầu vật tư.
2. Mua hàng duyệt, hoặc trả phiếu kèm lý do. Kỹ sư sửa và gửi lại; mua hàng không được sửa phiếu.
3. Mua hàng chốt NCC ngoài hệ thống, tạo các đơn và tải PDF báo giá chưa ký; đối chiếu với phần nhu cầu phân bổ cho từng đơn.
4. Kế toán lập hợp đồng bên ngoài hệ thống: một đơn có một hợp đồng riêng.
5. Kế toán lưu PDF hợp đồng và PDF báo giá đã ký. Hệ thống ghi một sự kiện hồ sơ ký và thông báo giám đốc.
6. Ghi giá trị hợp đồng ký một lần vào chi phí cam kết của dự án.
7. Kế toán xác nhận chuyển khoản với hóa đơn và chứng từ chuyển khoản: ghi thực chi; không có bước quản lý duyệt từng đợt trong flow vật tư mới.

Bước 5 và 6 có thể thực hiện trong cùng một command/transaction sau khi mọi tài liệu đã finalized. Chỉ báo thành công khi liên kết hồ sơ, căn cứ chi, cam kết và sự kiện thông báo đều được ghi nhất quán.

## 3. Danh mục và tên chứng từ

- Một vật tư chuẩn gồm mã nội bộ, tên chuẩn, quy cách và đơn vị chuẩn, trạng thái sử dụng.
- Một vật tư có nhiều tên của nhiều NCC; một NCC cũng có thể dùng nhiều tên cho cùng vật tư.
- Tên trên báo giá và tên trên hóa đơn là hai thuộc tính riêng, gắn với NCC và vật tư chuẩn.
- Lưu lịch sử tên thực tế trên dòng chứng từ. Cột tên trên hóa đơn được ghi từ hóa đơn thực tế, không bắt kỹ sư biết tên này trước khi chọn NCC.
- Chỉ liên kết tên khi người xử lý xác nhận cùng vật tư/quy cách/đơn vị. Không tự khẳng định tương đương bằng fuzzy matching.
- Chứng từ không tự sửa tên chuẩn/quy cách chuẩn trong danh mục.
- Dùng đơn vị chuẩn để phân bổ. Quy đổi đơn vị không tự động thực hiện trong phiên bản này; trường hợp khác đơn vị được đánh dấu cần xác nhận.

## 4. Phiếu đề xuất và quyền

- Chọn công trình thuộc phạm vi công ty/dự án được phép; nạp mặc định nơi giao từ projects.location_text.
- Kỹ sư sửa nơi giao trên phiếu; không sửa địa chỉ gốc của dự án bằng thao tác này.
- Nếu thiếu địa chỉ mặc định, phải nhập nơi giao trước khi gửi.
- Phiếu lưu ngày cần, ghi chú, người tạo từ phiên đăng nhập, project/company/tenant từ scope server.
- Dòng phiếu có identity ổn định, vật tư chuẩn, số lượng decimal string dương.
- Gửi tạo snapshot bất biến: tên, quy cách, đơn vị, số lượng, địa chỉ, ngày cần và phiên bản.
- Trạng thái xét duyệt: draft -> submitted -> approved hoặc returned -> submitted.
- Engineer chỉ sửa phiếu của mình ở draft/returned; mua hàng có read/decide/order, không có update-proposal.
- Return bắt buộc lý do; thao tác dùng expectedVersion và idempotency key.
- Quyền này được kiểm tra ở API, RPC và RLS, không chỉ ẩn nút.
- Trạng thái tiến độ mua hàng là dữ liệu tổng hợp các đơn/phân bổ, không giả thành trạng thái thanh toán.

## 5. Tách đơn, phân bổ và báo giá

- Một phiếu có nhiều đơn; một dòng phiếu chia nhiều đơn/NCC.
- Ví dụ nhu cầu 20.0000 bao -> đơn A 10.0000 + đơn B 10.0000. 11.0000 + 10.0000 bị từ chối.
- Tổng phân bổ active cho identity dòng, qua các phiên bản liên quan, không vượt phiên bản phiếu có hiệu lực.
- SQL khóa các dòng theo thứ tự ổn định để chống hai lệnh cùng phân bổ vượt số lượng.
- Báo giá của đơn A so với 10 bao phân bổ cho A, không so với toàn bộ 20 bao.
- Giữ tên NCC dùng, số lượng, đơn vị, đơn giá, tiền tệ, dòng phiếu và bản PDF gốc.
- Có thể dùng OCR hiện có để hỗ trợ nhập. Người xử lý phải xác nhận dữ liệu/mapping; kết quả OCR không tự cấp quyền mua hay chi.
- Sai phiếu: mua hàng trả về; engineer sửa, gửi lại và mua hàng duyệt lại.
- Tài liệu/đơn cũ giữ liên kết đến revision gốc. Các đơn chưa ký bị đình chỉ khi phiếu bị trả; chỉ giải phóng phân bổ bằng thao tác hủy có audit, trước khi phân bổ lại.
- Phần đã có hợp đồng ký bất biến: sửa revision không được xóa/đổi vật tư hay giảm dưới số lượng đã cam kết của identity đó. Phần còn lại có thể đưa vào dòng mới và xét lại.
- Không xóa hồ sơ ký hoặc tự giảm cam kết để làm cho phiếu chỉnh sửa hợp lệ.

## 6. Hợp đồng, cam kết và thông báo

- Mỗi đơn có tối đa một hợp đồng active; hoàn tất đơn yêu cầu đúng một hợp đồng. Hợp đồng không dùng chung cho nhiều đơn trong task này.
- Dùng nền cost_workflow_contracts và contract_versions, bổ sung liên kết một-một đến đơn mua.
- Hồ sơ ký cần hai file finalized/scoped: hợp đồng PDF và báo giá PDF đã ký; báo giá chưa ký được giữ riêng.
- Kế toán xác nhận tình trạng ký của tài liệu; hệ thống không tuyên bố đã kiểm chứng chữ ký số/chữ ký tay bằng OCR.
- Signed value/currency lấy từ hợp đồng đã kiểm tra, không tự lấy tổng dự đoán từ OCR.
- Ghi cam kết theo identity hợp đồng, không cộng theo cả phiếu, báo giá và hợp đồng.
- Receipt/idempotency và unique source bảo vệ retries: cùng key trả cùng kết quả; payload khác cùng key bị conflict.
- Thông báo giám đốc phát sinh đúng một lần từ hồ sơ hợp đồng ký. Recipient chưa hợp lệ: giữ trạng thái undelivered như pattern hiện có.
- Thông báo này không phải bước giám đốc duyệt lại.

## 7. Thanh toán và tương thích

- Một ledger canonical: cost_workflow_payments và consumptions; không tạo material_payments.
- Thêm căn cứ chi trực tiếp signed_contract cho flow vật tư. Nó có identity, signed value, currency, evidence, người ghi và audit bất biến.
- Phân biệt authority_source manager_decision (lịch sử) và direct_authorization (mới); không tạo quyết định/phân công quản lý giả.
- Mỗi hợp đồng ký mới tạo một payment window toàn giá trị; thanh toán có thể chia nhiều đợt trong cửa sổ này.
- Nhánh thanh toán trực tiếp không yêu cầu quản lý được phân công hay phê duyệt từng đợt.
- Chỉ kế toán có cost.record_cash được xác nhận thực chi; mua hàng/engineer không có quyền này.
- Mỗi xác nhận vật tư mới cần hóa đơn và payment proof finalized, cùng scope, và proof đúng target; ghi tên vật tư trên hóa đơn theo NCC.
- Một proof chuyển khoản không dùng cho nhiều payment records trong task này; không thêm chia giao dịch ngân hàng.
- Tổng gross consumption không vượt signed cap/authorization và currency phải khớp; khóa contract/authority khi ghi.
- Refund/correction không tự phục hồi capacity.
- Không sửa lịch sử request, decision, approval và cash cũ.
- Nếu chuyển một hợp đồng vật tư cũ sang authority mới: tạo transition/absorption row, chặn chi tiếp trên window cũ, tính opening capacity bằng cap trừ payments đã có.
- Case bắt buộc: cap 100, approved cũ 30, paid cũ 10 -> cam kết 100, available trực tiếp 90; trả thêm 90 -> paid 100, available 0; cả window cũ và mới đều không chi thêm được.
- Hồ sơ vật tư cũ chưa duyệt không được auto-approve; chỉ chuyển khi kế toán cung cấp căn cứ hợp đồng ký đã kiểm tra. Không backfill hàng loạt không có chứng từ.
- Cutover vật tư được ghi rõ theo công ty và nguồn: dữ liệu lịch sử vẫn đọc được; dòng mới đi qua flow mới. Chính sách loại chi phí khác giữ nguyên trong task này.

## 8. Báo cáo

- Vật tư: giá trị hợp đồng đã ký (cam kết), đã chi gross, phần cam kết chưa sử dụng, hoàn tiền thực nhận và chi ròng nếu có.
- Partial case: signed 100, bank-confirmed 30 -> cam kết 100, đã chi 30; không cộng 100+30 thành một số thực chi.
- Cam kết vật tư không được trình bày như coverage đầy đủ các loại chi phí khác chưa đưa vào task.
- approvedUnspent lịch sử giữ nghĩa gốc; window đã absorption không được hiển thị là quyền chi còn active.
- Báo cáo dự án tổng hợp từ source canonical; dữ liệu commitment_total nhập tham khảo không được cộng trùng với hợp đồng đã ghi.

## 9. Môi trường và giới hạn thực thi

- Git task: codex/site-engineer-material-request.
- InstaCloud branch: site-engineer-material-request, ID 1c1f8abe-4b48-410f-a011-480cfbc0499e.
- Worker: dev-worker-recovery, ID 359eddc6-1589-412e-b35b-35063cb73382.
- Worktree remote: /tmp/taskovia-site-engineer-material-request; Node 24.x, pnpm 10.29.3.
- Preview branch service ID 8d44e96c-85cf-4671-9d9d-cebaec25b455, Git source manual/auto_deploy=false.
- Source/tests/build chỉ trên remote workflow; local controller giữ dev, không sửa công việc của agy.
- Nhánh InstaCloud tách compute, không chứng minh Supabase Cloud DEV là database tách riêng.
- Cloud DEV only; guarded db:dev:*; mutation cần authorization riêng về target/operation/SHA/run allowance.
- Migration forward-only; dùng supabase migration new để sinh filename; không sửa applied migration.
- Không production, reset/seed/repair, merge dev/main hoặc tạo services/branches mới ngoài phạm vi.

## 10. Những quyết định thực hiện trong bản đề xuất

Giữ hai chiều riêng: review state phiếu và tiến độ đơn; identity dòng ổn định qua revisions; phần đã ký không bị viết lại.
Đơn chưa ký bị đình chỉ khi phiếu trả về, tránh tiếp tục dùng báo giá trên revision đã mất hiệu lực.
Kế toán xác nhận tài liệu ký; không thêm engine kiểm tra chữ ký.
Scope loại chi phí khác được ghi thành follow-up F1, không bỏ sót hoặc coi đã triển khai.
Các quyết định trên là chi tiết triển khai đề xuất để người dùng review cùng flow đã chốt.
