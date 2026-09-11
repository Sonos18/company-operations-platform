# Taskovia — C1 Detailed Spec: hồ sơ kế toán và báo cáo chi phí thầu phụ

**Phiên bản:** 1.1 — 2026-09-11  
**Trạng thái:** DESIGN_BASELINE_V1_1 — hợp nhất phạm vi cập nhật Sơn đã chấp nhận; dùng làm baseline lập kế hoạch/bàn giao C1, không phải lệnh chạy code hoặc mutation môi trường.  
**Thay thế:** spec v1.0; giữ bản v1.0 để truy vết. Không trộn hai phiên bản.  
**Tài liệu cha:** [01-taskovia-c1-c3-design-v1.1.md](01-taskovia-c1-c3-design-v1.1.md).  
**Áp dụng đầu:** VQH, Eo Gió; người nạp là Sơn; giám đốc xem.  
**Analysis base:** `Sonos18/company-operations-platform@3d021b35b1228ffdd46a8dbb9884a59c00ab6c89`. Anchor kế thừa từ v1, không là HEAD vừa xác minh. Không có xác nhận live DB, test pass hoặc deploy trong lượt cập nhật tài liệu này.

Từ khóa **bắt buộc** là hợp đồng của baseline C1 v1.1. Sơn đã chấp nhận hướng thiết kế và cập nhật theo hai workbook; việc chấp nhận không xác nhận tính đúng của từng số nguồn, không cho phép tự triển khai C2/C3, và không thay thế authorization thực thi/môi trường.

## 0. Thay đổi của bản 1.1

Bổ sung `accounting_sources`/versions, `source_selections`, `source_reported_figures`, `cost_line_source_links` và `source_review_issues`. Tách tiếp nhận/chia sẻ nguồn khỏi công bố tài chính; giữ FK project/giao khoán bắt buộc ở facts. Thay `reported_balance` trong financial lines bằng số nguồn không posting dùng chung. Cập nhật đồng bộ API, quyền file, source identity, coverage, UI và ma trận A01–A62.

Các bảng/cột/endpoint ở đây là thiết kế đích, không bằng chứng chúng đã tồn tại. Nếu execution tree/DB có C1 khác baseline, CodeX phải báo khác biệt và lập migration tương thích thay vì giả định database trống. C1 vẫn không có auto-mapping toàn workbook hoặc engine kỳ/đơn giá.

## 1. Mục tiêu, phạm vi và non-goals

C1 phải giúp giám đốc trả lời: Eo Gió có những giao khoán/thầu nào đã được nạp; giao khoán bao nhiêu, phát sinh bao nhiêu, giá trị xác nhận bao nhiêu, chi/ứng bao nhiêu, còn phải trả và giữ lại bao nhiêu; mỗi số đến từ đâu và đủ dữ liệu đến ngày nào.

### 1.1. In scope

Đăng ký project/đối tác/giao khoán/component tối thiểu; tiếp nhận nguồn tổng hợp độc lập, phiên bản file, phần chọn và hàng đợi đối chiếu; upload/lưu file gốc thật; xem tài liệu; ghi số nguồn không posting và nhập số liệu chuẩn bằng form; công bố số liệu theo nguồn; tiếp nhận gói tổng lịch sử và hồ sơ chi tiết; ghi nhận ứng/chi thực tế và phân bổ có căn cứ; thuế theo nguồn; giữ lại/khấu trừ; coverage và thiếu dữ liệu; báo cáo; sửa bằng hồ sơ điều chỉnh; quyền/RLS/storage/audit; HTTP repositories và test tương ứng.

Upload một workbook không tự biến nó thành số liệu báo cáo. C1 dùng **file nguyên bản + form số liệu có cấu trúc**, không yêu cầu chuẩn hóa từng nhân công của bảng công cũ. Không yêu cầu kế toán đăng nhập/duyệt C1. Sơn vừa nhập vừa công bố; đây là công bố dữ liệu nguồn, không phải duyệt chi thay quản lý.

### 1.2. Out of scope

Tự đọc mọi mẫu Excel, OCR sản xuất, chạy lại công thức/macro, sửa workbook online, import hàng loạt có mapping tùy ý, sinh công chính thức từ ảnh, roster/attendance engine C2, rate/settlement engine C3, quyền truy cập cho thầu, chuyển tiền ngân hàng, payroll nhân viên nội bộ, bút toán sổ cái, kê khai thuế, triển khai toàn bộ Journey hoặc reset dữ liệu prototype ngoài phạm vi.

C1 không cần generic ETL `import_batches/import_rows`: các nguồn và phần chọn chỉ được tạo có chủ đích, không persist mọi ô/dòng của workbook. `accounting_source_versions` là lịch sử file, không một batch tạo tự động mọi transaction. Parser tương lai chỉ đề xuất các phần/hồ sơ theo cùng hợp đồng chuẩn và vẫn phải qua đối chiếu.

## 2. Kết quả người dùng nhìn thấy

### 2.1. Giám đốc

`/costs` có bộ lọc company hiện hành, project, đối tác/giao khoán, ngày báo cáo và trạng thái đầy đủ. Công bố tổng quan trước, truy xuống từng hồ sơ và file nguồn. Không hiển thị draft của người nạp trong số liệu tài chính chính thức.

Các khối thông tin: giao khoán ban đầu; phát sinh cam kết; giá trị xác nhận theo cơ sở thanh toán; số trước thuế đã biết; tổng tiền chi và phần ứng; ứng/tiền chưa phân bổ; còn phải trả tổng; giữ lại; còn phải trả ngoài giữ lại. Không cộng các thẻ này với nhau thành “tổng chi phí”.

Mỗi KPI có `basis`, `asOf`, `status`, `knownAmount`, `unknownCount`, `coverageNote`; phần metadata tổng hợp có `unscopedSourceIssueCount` nếu còn issue chưa xác định project/engagement trong phạm vi company mà actor được xem. Khi dữ liệu không đủ, nhãn chính là “Số đã nạp/Chưa đủ dữ liệu”, không hiển thị known subtotal như tổng hoàn chỉnh.

Trong Eo Gió ban đầu, danh mục thầu chưa được xác nhận đầy đủ. Header phải ghi “Phạm vi đã nạp”, kèm số đội/giao khoán có dữ liệu; không khẳng định toàn bộ thầu của công trình đã được quản lý.

### 2.2. Sơn

Có thể upload nguồn tổng hợp khi chưa có project/đối tác/giao khoán; gợi ý project là tùy chọn. Chọn từng phần nguồn, giữ số/nhãn gốc và vấn đề cần đối chiếu; chỉ tạo financial document khi gán được phạm vi và ý nghĩa. Có thể tạo danh mục tối thiểu, nhập tổng lịch sử/chi tiết, xem tác động và công bố từng hồ sơ hợp lệ mà không xử lý hết workbook. Nguồn chỉ tham khảo hoặc chưa rõ không buộc tạo một thầu giả.

Sơn chia sẻ version nguồn/số đối chiếu bằng hành động riêng; giám đốc có quyền nguồn được xem nhãn “Theo báo cáo nguồn — chưa chuẩn hóa” ngay cả khi KPI chưa có số. Chia sẻ nguồn không phải confirmed_external hoặc publish financial facts. Có thể bổ sung bằng chứng và sửa số đã công bố bằng correction, không viết đè.

### 2.3. Các role khác

Không tự nhận quyền vì mang tên accountant/technical_staff/company_admin. Permission mới được gán tường minh. Kỹ sư không có quyền C1 mặc định; C2 sau này chỉ nhận dữ liệu roster/thực hiện cần thiết.

## 3. Đơn vị nghiệp vụ

| Khái niệm | Nghĩa bắt buộc |
| --- | --- |
| Project | Công trình thật, độc lập Opportunity/Journey. |
| Business party | Tổ đội hoặc công ty đối tác thuộc danh mục của company sử dụng Taskovia. |
| Engagement | Một quan hệ giao việc/giao khoán xác định giữa company và đối tác tại một project. Một đối tác có thể có nhiều engagement trong cùng project. |
| Component | Phạm vi/hạng mục trong engagement, có cách tính riêng. Không phải Stage. |
| Accounting source/version | Tập nguồn logic theo company và mỗi phiên bản file nguyên bản; không cần engagement. |
| Source selection | Vùng nguồn được chọn có locator, vai trò, phạm vi và tình trạng đối chiếu. Không phải financial fact. |
| Source reported figure | Số/nhãn người nạp chép từ nguồn, gồm total/subtotal/balance chưa rõ, chỉ để đọc/đối chiếu. |
| Source review issue | Điểm chưa rõ/trùng/khác phạm vi hoặc lỗi cần đối chiếu; không tự là lỗi tài chính đã xác nhận. |
| Cost document | Hồ sơ có nguồn và vòng đời công bố. Dù tên có “cost”, hồ sơ phân biệt cam kết, giá trị thực hiện, tiền và khoản giữ lại. |
| Financial line | Một số liệu có loại tác động cố định. Không phải bút toán kế toán tổng hợp. |
| Cash allocation | Gắn một phần tiền đã chi/ứng với một giá trị phải trả có căn cứ. Không tạo tiền mới, không tạo chi phí mới. |
| Opening cumulative | Số tổng lịch sử đến ngày cắt, không phải phát sinh vào ngày nạp. |
| Coverage | Lời xác nhận có nguồn về độ đầy đủ của từng nhóm dữ liệu; không tự suy từ việc có vài file. |

## 4. Luồng C1

### 4.0. Tiếp nhận nguồn tổng hợp trước khi xác định đủ giao khoán

Tạo `accounting_source` ở company hiện hành → tạo version và upload → finalize file → chọn phần nguồn cần dùng → ghi nhãn/số nguồn và review issues → chia sẻ nguồn cho actor được quyền khi người nạp sẵn sàng. Chưa biết đối tác, project, ngày hoặc cơ sở tiền vẫn lưu được nguồn, không có tác động vào số chính thức.

Mỗi phần chọn có quyết định `pending | ready_for_normalization | reference_only | excluded`. Quyết định này thuộc phần nguồn, không áp cho cả workbook. Chỉ phần `ready_for_normalization` với project/engagement xác định và không có blocking issue được đưa làm căn cứ tạo hồ sơ tài chính. `reference_only`/`excluded` không được dùng làm căn cứ tăng tiền. Nguồn chưa được chọn không đồng nghĩa đã kiểm tra toàn bộ; không tự đánh completeness.

Khi một khoản đã có financial fact, phần nguồn mới được liên kết bổ sung vào fact đó (luồng evidence), không clone fact. Bản Excel mới có thể vừa có phần cũ vừa có phần mới: version mới không tự supersede facts hoặc tổng nguồn cũ. Không có nút “nhập tất cả ô có số”.

### 4.1. Nhập gói đã hoàn thành

Từ phần nguồn đã chọn, tạo/chọn engagement thật, ghi execution_state phù hợp; chọn **Tổng lịch sử**; xác nhận cutoff; liên kết version/vùng nguồn; nhập các nhóm số biết được; phân biệt tiền đã trả, ứng và phân bổ; khai báo các nhóm chưa biết; xem bảng đối chiếu và tác động; công bố.

File nhiều thầu tạo nhiều opening theo từng engagement; không tạo “thầu tổng công trình”. Chưa biết cutoff/đội thì giữ ở sources/reported figures, chưa tạo opening. Giá trị nghiệm thu/giao khoán không tự được gán bằng nhau. `completed` không đồng nghĩa công nợ 0 hoặc không còn giữ lại. Không bắt nhập từng chứng từ/nhân công quá khứ.

### 4.2. Nhập đội đang thi công

Từ phần nguồn đã xác định phạm vi: tạo/chọn engagement; chọn loại hồ sơ; ngày chứng từ, khoảng thực hiện, ngày báo cáo; bằng chứng và các dòng tài chính đúng ý nghĩa; công bố. Một bảng công có thể chỉ cần một dòng tổng được xác nhận hoặc ba dòng công/thưởng/bồi dưỡng. Tổng và chi tiết không đồng thời là các dòng chi phí cộng được.

Phiếu chuyển tiền tạo cash line khi nguồn chứng minh thực chi; bảng công/phiếu đề nghị chi không tự tạo cash line.

### 4.3. Hai bước lưu và công bố

`draft -> published`; `draft -> canceled` được phép, giữ metadata lịch sử. Published không quay lại draft. Công bố unverified/evidence-only được phép khi nghĩa và phạm vi hồ sơ đã xác định, nhưng không vào thẻ giá trị xác nhận/tiền thực chi đã xác nhận. Khoản chưa biết bản chất/phạm vi phải ở lớp source, không gán line_kind tùy ý rồi chọn unverified để né validation. Chia sẻ version nguồn không yêu cầu tạo cost_document và không thay trạng thái nguồn tài chính.

Mỗi hồ sơ có trạng thái nguồn riêng `unverified | confirmed_external | disputed`. C1 không nhận `confirmed_in_system`; C3 mới bổ sung trạng thái/nguồn tương ứng bằng migration và command có chứng cứ phê duyệt thật.

Công bố hồ sơ tài chính `confirmed_external` cần ghi tham chiếu hoặc ghi chú nguồn xác nhận của người nạp. Đây là khai báo của người có quyền, không phải suy luận từ chữ ký hay file tồn tại. Hồ sơ đang disputed không được tham gia số xác nhận; nếu dispute xảy ra với số đã công bố cần hồ sơ điều chỉnh/đánh dấu tranh chấp và cập nhật trạng thái KPI, không âm thầm ẩn khoản nợ đã ghi.

### 4.4. Xác nhận nguồn sau khi đã lưu/công bố

Hồ sơ published nhưng chưa được xác nhận có command **Xác nhận theo nguồn**: thêm event có actor/reference, kiểm tra lại các invariant tài chính/coverage và quyền đối với từng loại dòng. Không copy các dòng sang một hồ sơ chi phí thứ hai. Header lưu trạng thái tại lần công bố; projection trạng thái hiện hành đọc events.

Mỗi document chỉ có một lần kích hoạt tác động tài chính thành công: tại publish nếu confirmed_external, hoặc tại event xác nhận đầu tiên. Các lần xác nhận lại không cộng tiền thêm. Document gốc đã bị thay toàn bộ bằng correction không được kích hoạt muộn. Đánh dấu tranh chấp sau khi đã kích hoạt không xóa tác động cũ; số được giữ và gắn conflicted, xử lý bằng correction có căn cứ. Document chưa từng được xác nhận thì không có tác động chính thức.

### 4.5. Chỉnh sửa

Draft sửa bằng expectedVersion. Published chỉ có command điều chỉnh có lý do, nguồn mới và preview phụ thuộc. Sửa lỗi chép nguồn C1 là thay thế toàn bộ financial document đã công bố (không thay toàn bộ workbook/accounting source): giữ bản gốc, đảo các tác động đã kích hoạt và tạo bản thay trong một transaction; không cung cấp sửa trực tiếp từng row published. Phát sinh nghiệp vụ mới có thể chỉ điều chỉnh các dòng liên quan bằng chứng từ mới. Phân biệt **sửa lỗi chép nguồn** với **phát sinh nghiệp vụ mới**. Sửa nguồn giữ ngày nghiệp vụ gốc và ghi thời điểm sửa hiện tại; phát sinh mới có ngày nghiệp vụ của phát sinh.

Đính kèm giấy tờ mới cho hồ sơ đã công bố tạo evidence document liên kết hồ sơ gốc; evidence document mang source links đến các financial line cũ. Khi publish evidence, chỉ thêm provenance/claims đã review, không kích hoạt lại tiền. File/link nguồn cũ giữ nguyên; mọi kết thúc quan hệ vì correction giữ lịch sử theo 5.18.

Sửa source metadata/locator/số đối chiếu đã chia sẻ dùng revision/hồ sơ đối chiếu riêng, không phát sinh financial reversal. Chỉ correction đối với financial document mới thay tác động tài chính. Đổi mapping nguồn không được làm facts cũ tự đổi project/giao khoán hoặc số tiền.

## 5. Database vật lý C1

### 5.1. Quy ước chung

Mỗi bảng nghiệp vụ mới có `tenant_id uuid`, `company_id uuid`; entity ID là UUID. Event/receipt có thể dùng UUID trong module này; không đổi bigint của nền tảng. `version bigint` được dùng khi có bản ghi mutable. `created_by` lấy từ actor xác thực, không tin request body.

Mỗi entity được tham chiếu có unique `(id, tenant_id, company_id)`. Các liên kết cần thêm `engagement_id`/`project_id` vào khóa tương ứng để không thể gắn chứng từ cùng company nhưng sai giao khoán/project. Scope được xác minh bằng FK và command, không chỉ filter UI.

Tiền: `numeric(20,4)`; lượng: `numeric(18,4)`; đơn giá tham chiếu: `numeric(20,6)`. API dùng chuỗi decimal, không dấu ngăn hàng nghìn. Không dùng JS Number cho giá trị tiền chuẩn, kể cả đường đọc từ PostgreSQL: projection/RPC cast numeric thành text trước khi serialize JSON. Từ chối NaN/Infinity và độ dài/scale vượt giới hạn; không âm thầm để DB làm tròn tiền nguồn.

VQH mặc định VND, scale hiển thị/nhập tiền 0; giá trị nguồn có phần lẻ chưa được cấu hình hỗ trợ phải báo lỗi/cảnh báo cần xử lý, không cắt bỏ. Đây là cấu hình hiển thị/độ chính xác nhập, không phải quy tắc làm tròn tới nghìn. Không kết luận mọi nguồn kế toán có cùng cách làm tròn. Company khác có currency/scale riêng. Không đổi đơn vị/currency của dữ liệu đã công bố khi đổi config. Không quy đổi tiền tệ tự động.

Ngày nghiệp vụ là `date`; thời điểm hệ thống là `timestamptz`. Múi giờ mặc định VQH: `Asia/Ho_Chi_Minh`. C1 không cần kỳ chốt database C3.

### 5.2. `projects`

| Cột | Kiểu / yêu cầu |
| --- | --- |
| id, tenant_id, company_id | UUID, bắt buộc. |
| code, name | Text không rỗng; code unique theo company. |
| client_display_name, location_text | Text nullable; không ép tạo customer master. |
| operational_state | `active \| completed \| paused \| unknown`. Không phản ánh thanh toán. |
| origin | `legacy_import \| manual \| opportunity_conversion`; C1 chỉ tạo hai loại đầu. |
| source_opportunity_id | UUID nullable, scope FK khi có; không tạo Opportunity giả. |
| financial_scope_inventory_status | `unconfirmed \| partial \| confirmed`; mặc định unconfirmed. |
| financial_scope_inventory_as_of | Date nullable; required khi confirmed. |
| version, created_by, created_at, updated_at | Metadata; thay phạm vi completeness cần audit/lý do. |

Không có stage bắt buộc, currentStageId giả hay tổng tiền sửa tay trên project.

### 5.3. `business_parties`

`id/scope`, `code`, `display_name`, `party_kind = crew | organization`, `tax_identifier nullable`, `contact_display_name nullable`, `contact_phone nullable`, `is_active`, `version`, metadata actor/time. Code unique company; tên và phone không unique. Tax identifier nếu có được kiểm tra trùng để cảnh báo trong company, không tự merge toàn tenant. Không chứa roster nhân công hoặc đòi `auth.users`. Đối tác cấp danh mục không tự là bên nhận thanh toán cho mọi dòng trong workbook; mapping phải theo giao khoán có căn cứ.

C1 contact tối thiểu nằm trong party, không buộc dùng policy `opportunity.read`. Một module contact dùng chung sau này có thể thay bằng quan hệ được kiểm soát, không tạo scope đọc sai trong C1.

### 5.4. `project_engagements`

`id/scope`, `project_id`, `party_id`, `code`, `name`, `execution_state = active | completed | paused | unknown`, `currency_code`, `initial_data_mode = historical_total | source_documents`, `contract_reference nullable`, `version`, metadata.

Code unique `(company_id, project_id, code)`. Không unique cặp project-party. Foreign key project/party cùng scope. Currency, project_id và party_id khóa khi đã có số công bố; không di chuyển engagement sang project/đối tác khác để làm thay đổi lịch sử. Giá trị giao khoán là financial line, không một cột total mutable trên engagement.

### 5.5. `engagement_components`

`id/scope`, `engagement_id`, `code`, `name`, `pricing_method = time | quantity | fixed | milestone | unknown`, `unit_code nullable`, `is_active`, `version`, metadata. Code unique engagement. Không di chuyển một component đã được tham chiếu sang engagement khác. C1 cho phép source ở cấp engagement với component_id null; không bắt chia một gói tổng thành các hạng mục bịa đặt. C2/C3 bổ sung policy/rates theo quan hệ riêng, không tạo cột chờ toàn bộ bảng công C1.

### 5.6. `company_cost_settings`

Một row/company: `scope`, `enabled`, `default_currency_code`, `money_scale` 0–4, `time_zone`, `version`, actor/time. C1 chưa có công thức hay workflow JSON tùy ý. Thay config không hồi tố số nguồn; currency từng engagement và dữ liệu đã ghi vẫn giữ nguyên. Bật module không tự cấp permission.

### 5.7. `cost_documents`

| Cột | Kiểu / yêu cầu |
| --- | --- |
| id/scope/project_id/engagement_id | UUID; một document chỉ thuộc một engagement. |
| document_kind | `contract \| variation \| valuation \| cash \| withholding \| historical_snapshot \| evidence \| correction`. |
| source_type | `accounting_import \| historical_import`; C3 mở rộng `system_settlement` bằng migration/command riêng. |
| title | Text không rỗng. |
| project_label_at_recording, party_label_at_recording, engagement_label_at_recording | Snapshot text của nhãn tại publish; tên nguồn trong file giữ nguyên. Đổi tên master không rewrite snapshot. |
| source_system, source_document_key | Text; identity của chứng từ/sự kiện nghiệp vụ, không là tên/hash file, source_version_id hoặc số dòng Excel. Nếu không có số nguồn thì cấp mã nội bộ bền vững và hiển thị là mã nội bộ; lần gửi workbook sau đối chiếu/reuse mã này. |
| partition_key | Text default `whole`; phân biệt phần nghiệp vụ của cùng chứng từ/đợt, không thay theo địa chỉ dòng khi workbook chèn dòng. Locator vật lý nằm ở source selection/link. |
| document_date | Date nullable nếu chưa biết. |
| service_from, service_to | Date nullable, nếu có cả hai thì from <= to. |
| reporting_date | Date required cho published delta có tác động; do người nạp xác nhận, không dùng created_at. |
| record_mode | `delta \| opening_cumulative`; historical_snapshot dùng opening_cumulative. |
| cutoff_date | Required cho opening_cumulative; không có cho delta thông thường. |
| baseline_root_document_id | Nullable; chỉ họ opening/correction opening; scope và cutoff phải khớp. |
| correction_of_document_id, related_document_id | Nullable FK scope; không tự tham chiếu, không vòng lặp. |
| source_confirmation | `unverified \| confirmed_external \| disputed`. |
| confirmation_reference | Required khi confirmed_external có dòng tác động. |
| status | `draft \| published \| canceled`; immutable published trừ metadata sự kiện không tác động số qua command chuyên biệt. |
| currency_code | Bắt buộc bằng engagement, không đổi khi published. |
| version, created_by/at, published_by/at | Pair fields đúng trạng thái; ghi bằng server. |

Unique business identity cho document gốc: `(company_id, source_system, source_document_key, engagement_id, partition_key)`. Hồ sơ correction có source key riêng và liên kết bản gốc; không lách identity bằng upsert. Draft bị hủy không tái dùng key như một bản khác; khôi phục draft hủy chỉ bằng command có audit hoặc dùng revision/correction rõ ràng.

Chỉ một original opening snapshot/engagement được published. Có thể có các correction cùng baseline_root, không có original opening thứ hai. Cutoff của họ snapshot không được thay trong C1.

### 5.8. `cost_document_lines`

Mỗi dòng có `id/scope`, `document_id`, `engagement_id`, `component_id nullable`, `line_no`, `description`, `line_kind`, `source_amount`, `tax_basis`, `net_amount nullable`, `tax_amount nullable`, `gross_amount nullable`, `liability_amount nullable`, `quantity nullable`, `unit_rate nullable`, `unit_code nullable`, `cost_category nullable`, `target_line_id nullable`, `reverses_line_id nullable`.

Cash line thêm `cash_method = cash | bank_transfer | other | unknown`, `payer_relation = own_company | third_party | unknown`, `payer_label nullable`, `funding_source_label nullable`, `external_payment_reference nullable`, `payment_note nullable`. Các trường này null với non-cash. Căn cứ chấp nhận dùng khoản chi hộ để giảm nghĩa vụ được lưu trên allocation, không bắt sửa cash line đã bất biến. Nhãn nguồn tiền không chứa account secret; không bắt nhập số tài khoản đầy đủ. `payer_relation` không thay tenant/company owner. Không tạo bank-account master, cross-company FK hoặc bút toán liên công ty.

v1.1 không lưu `source_locator` đơn trên line: provenance dùng quan hệ `cost_line_source_links` (5.18). `reported_balance`, `reported_balance_kind` và `reported_signed_amount` được chuyển khỏi financial lines sang `source_reported_figures` (5.17); chỉ có một nguồn lưu số đối chiếu. Đây là thay đổi thiết kế trước triển khai, không là chỉ thị sửa migration đã áp dụng.

`line_no` unique trong document. Các số tài chính thông thường là magnitude không âm; dòng 0 hợp lệ để thể hiện số được xác nhận bằng 0. Dòng nghiệp vụ do người nạp tạo phải có ít nhất một source selection xác định đúng bản chất của dòng; reversal tự sinh chỉ mirror dòng gốc và kế thừa bằng chứng/reason của correction, không tự chiếm một occurrence thứ hai; không lưu tiền/quyền/trạng thái chính trong JSON tự do. Một vị trí nguồn không bị nhân thành nhiều khoản cùng bản chất bằng cách đổi tên file hoặc source key.

Các loại và tác động cố định:

| line_kind | Tác động | Liên kết/điều kiện |
| --- | --- | --- |
| commitment_base | + giá giao khoán gốc | Không là chi phí. |
| commitment_increase / commitment_decrease | +/- phát sinh cam kết | Căn cứ thay đổi; không tự cộng vào cost. |
| recognized_cost | + giá trị xác nhận / nghĩa vụ khi liability_amount biết | category gồm labor, bonus, allowance, quantity, fixed, other. Không tự là cash. |
| cost_decrease | - giá trị xác nhận / nghĩa vụ | target recognized_cost; căn cứ giảm giá trị công việc. Không đồng thời trừ vào payable_offset cho cùng tác động. |
| cash_advance | + tiền ứng đã chi | Số tiền mặt thực tế source_amount, không basis VAT. |
| cash_payment | + tiền thanh toán đã chi | Chưa giảm một khoản phải trả cụ thể cho đến khi có allocation. |
| cash_unclassified | + tiền thực chi chưa phân loại | Cần cho tổng lịch sử nguồn chỉ ghi “đã chi”; không tự gọi toàn bộ là ứng. |
| cash_refund | - tiền thực chi ròng | target cash gốc; hoàn lại không vượt phần tiền còn sau phân bổ, hoặc đảo phân bổ liên quan trong cùng transaction. |
| retention_hold / retention_release | +/- khoản đang giữ lại | target recognized_cost; giữ lại không giảm recognized_cost. |
| payable_offset / payable_offset_release | +/- khoản giảm nghĩa vụ K | target recognized_cost; ghi lý do và bản chất. Không thay thế tính toán/ghi sổ thuế. |

Cash/retention/offset dùng basis `not_applicable_to_cash_or_balance`, không mô tả chúng là trước/sau thuế; tên enum được giữ để tránh đổi không cần thiết. Số dư nguồn nằm riêng ở 5.17. Với commitment/cost, tax_basis = `exclusive | inclusive | not_separated | unknown`.

Quy tắc amount của commitment/cost:

- `exclusive`: source_amount = net_amount; gross chỉ biết khi nguồn cung cấp đủ net/tax/gross đối chiếu được.
- `inclusive`: source_amount = gross_amount; net/tax có thể chưa biết.
- `not_separated`: giữ source_amount; không tự đặt tax_amount=0. Liability_amount có thể biết nếu nguồn xác định đây là tổng phải trả trước giữ lại/khấu trừ.
- `unknown`: giữ số nguồn; không tự gán net/gross. Liability_amount chỉ được nhập nếu có căn cứ riêng xác định đúng nghĩa.
- Khi cả net/tax/gross có, bắt buộc net + tax = gross ở độ chính xác nguồn; chênh lệch phải được giải thích/ghi dòng nguồn riêng, không tự làm tròn để qua.
- Với recognized_cost/cost_decrease, liability_amount là giá trị nghĩa vụ trước R/K của chính dòng. Nếu dựa vào gross thì hai số phải khớp; trường hợp nguồn dùng cơ sở khác phải có reference riêng và được UI gắn nhãn, không mô tả là đã giải quyết kế toán thuế.
- Không tạo dòng tổng và dòng thành phần đều có tác động cho cùng một khoản. Tổng đối chiếu của document là dữ liệu kiểm tra, không financial line recognized_cost thêm.

`reverses_line_id` chỉ được command sửa nguồn tạo, phải mirror chính xác loại/scope/currency/magnitude/tax của dòng gốc; tác động là âm của phần tác động tài chính đã được kích hoạt của dòng gốc; gốc chưa từng được kích hoạt thì không sinh tác động âm. Thay thế gốc chưa xác nhận đồng thời chặn kích hoạt muộn trên gốc. Chỉ một reversal có hiệu lực cho một dòng; không đảo một reversal rồi gây chuỗi khó hiểu. Sửa tiếp phải nhắm dòng replacement mới. Điều chỉnh nghiệp vụ giảm tiền dùng kind có nghĩa rõ ràng, không nhập tùy tiện dấu âm.

### 5.9. `cash_allocations`

`id/scope`, `engagement_id`, `document_id` (hồ sơ căn cứ phân bổ), `cash_line_id`, `cost_line_id`, `amount numeric(20,4)>0`, `allocation_kind = payment | advance_application | unclassified_application`, `effective_date`, `source_reference`, `company_acceptance_reference nullable`, `reverses_allocation_id nullable`, actor/time.

Cash và cost cùng currency/engagement/scope; cash phải đúng kind; cost phải là recognized_cost có liability_amount. Cash bên thứ ba hoặc chưa rõ bên trả chỉ được allocate khi `company_acceptance_reference` của chính allocation có căn cứ company chấp nhận tiền đó thanh toán nghĩa vụ thầu; nhãn cột tài khoản không đủ. Khi chưa có căn cứ, giữ tiền đã có bằng chứng thực chi ở nhóm nguồn phù hợp nhưng không giảm nghĩa vụ bằng allocation. Kind được suy từ cash gốc, không tin body client. Opening cumulative có thể dùng allocation tổng dựa vào xác nhận kế toán; luôn gắn nhãn tổng lịch sử, không giả lập invoice cụ thể.

Tổng allocation có hiệu lực không vượt tiền cash còn sau refund; tổng áp dụng vào từng cost không vượt nghĩa vụ còn sau cost_decrease/K/R. R phải giải phóng trước khi phân bổ tiền vào phần giữ lại. Khóa cash và cost/engagement trước kiểm tra tổng để chống race.

Đảo allocation là row mới mirror toàn bộ amount; sửa một phần bằng đảo row cũ rồi tạo các row mới trong cùng transaction. Không sửa/xóa row đã công bố. Allocation chỉ có hiệu lực khi document của nó đã published và đã kích hoạt tác động theo mục4.4, đồng thời các financial source liên quan có hiệu lực. Dispute về sau giữ các tác động đã ghi và gắn conflicted cho projection; không xóa phân bổ ngầm.

### 5.10. `file_objects` và `cost_document_files`

`file_objects`: `id/scope`, `access_class = company_financial`, `storage_provider`, `bucket`, `object_key`, `original_name`, `mime_type`, `byte_size`, `sha256`, `state = pending | ready | rejected | abandoned`, `preview_state = available | limited | unsupported | failed`, `uploaded_by`, `created_at`, `finalized_at`, `version`. Các byte_size/sha256/mime xác minh phía server được nullable khi pending; ready phải có bộ metadata xác minh đầy đủ và finalized_at. Không lưu public URL/signed URL làm dữ liệu bền vững. `object_key` unique trong bucket; file ready không overwrite.

`cost_document_files`: `id/scope`, `document_id`, `file_id`, `relation_kind = primary_source | supporting`, `source_partition_note`, actor/time. Unique cặp document-file; cả hai cùng scope. Cùng file có thể liên kết nhiều document đúng quyền; không dedup hoặc tiết lộ hash tồn tại qua company.

Mỗi file C1 được đăng ký trong một source version trước khi tạo provenance. `cost_document_files` là liên kết từ financial/evidence document đến file của những source selection được dùng; command đồng bộ liên kết này, không bắt người dùng nhập trùng. Publish đòi file ready và source version shared; không tự chia sẻ workbook bằng cách lách qua file link.

Published file link không xóa/sửa; bổ sung dùng evidence document. Quyền đọc một financial document hoặc một vùng không tự cấp đọc toàn file; `access_class=company_financial` yêu cầu quyền nguồn toàn company và quyền file (mục9). Không dựa chỉ vào prefix object key.

### 5.11. `cost_coverage_assertions`

Append-only: `id/scope`, `engagement_id`, `stream = commitments | costs | cash | allocations | retention | offsets`, `coverage_basis = from_inception | opening_plus_details | range_only`, `from_date nullable`, `through_date`, `status = complete | partial | unavailable`, `opening_document_id nullable`, `source_document_id`, `note`, `revision_no`, `asserted_by/at`.

Unique engagement-stream-revision. Command khóa engagement và cấp revision; read chọn revision mới nhất cho góc nhìn hiện hành, không tự chọn claim cũ chỉ vì claim mới báo partial. Muốn báo cáo trạng thái được biết tại một thời điểm trước đây phải có snapshot riêng, không hứa C1 làm đầy đủ bitemporal reporting.

Complete + không có dòng cho stream trong phạm vi có nghĩa người có quyền đã xác nhận không có phát sinh; vì vậy giá trị 0 có căn cứ. Không có assertion hoặc partial không được hiểu là 0. Complete phải có source và không tồn tại hồ sơ pending/disputed hay review issue mở có thể ảnh hưởng stream/phạm vi chưa xử lý. Chia sẻ workbook, chọn vài vùng hoặc giải quyết một issue không tự tạo coverage complete. Quy tắc gắn/hạ trạng thái khi có source issue mới ở 6.5. Correction ảnh hưởng coverage bắt buộc cập nhật assertion hoặc hạ completeness trong cùng transaction.

### 5.12. `cost_document_events`

Append-only: `id/scope`, `document_id nullable`, `resource_type`, `resource_id`, `event_kind`, `actor_id`, `request_id`, `reason`, `before_summary`, `after_summary`, `created_at`. Event hỗ trợ resource_type của accounting source/version/selection/figure/review issue/source link bên cạnh financial document. Quyền đọc event theo chính resource và visibility: source events cần `cost.source.read`; financial events cần `cost.read`; draft còn cần `cost.prepare`. Trước/sau có số hoặc mô tả nguồn không được lộ qua cost.read nếu actor không có quyền nguồn tương ứng. Reader chỉ xem published/shared không thấy draft qua event. Bảng audit nền tảng chỉ nhận metadata an toàn khi reader rộng hơn; không ghi amount/payroll vào log chung.

### 5.13. `cost_command_receipts`

`id/scope`, `actor_id`, `command_name`, `idempotency_key uuid`, `request_hash`, `result_resource_id`, `result_version`, `created_at`; unique `(company_id, actor_id, command_name, idempotency_key)`. Hash gồm scope, nội dung command và targets. Receipt commit cùng số liệu/events. Event commands so expectedEventId với event tail dưới row lock của document/engagement; không sửa version của các dòng tiền đã bất biến. Retry cùng key/payload trả cùng kết quả; cùng key khác payload trả 409. Auth/quyền hiện hành vẫn được kiểm tra trước replay; không trả dữ liệu cached cho actor bị thu hồi quyền. Không dùng requestId log như idempotency key ngầm.

### 5.14. `accounting_sources`

`id/scope`, `code`, `title`, `source_system`, `suggested_project_id nullable`, `is_archived`, `version`, `created_by/at`, `updated_at`. Code unique company. Suggested project có FK scope nhưng chỉ là gợi ý chọn nguồn, không là cost owner mặc định. Không có engagement_id bắt buộc hoặc implicit party. Một nguồn logic có thể chứa nhiều project/giao khoán cùng company.

Archive chỉ ẩn khỏi danh sách nhận nguồn đang hoạt động, không xóa source version, file, số đã chia sẻ hoặc facts. Project/title gợi ý thay bằng expectedVersion và audit, không hồi tố phạm vi facts/figures. Quyền create/update: cost.prepare.

### 5.15. `accounting_source_versions`

`id/scope`, `source_id`, `version_no`, `file_id`, `source_version_label nullable`, `source_period_text nullable`, `source_as_of_text nullable`, `received_at`, `status = draft | shared`, `shared_by/at nullable`, `version`, `created_by/at`. Unique `(source_id, version_no)`. Scope FK đến source và file; version_no do command cấp dưới khóa source, không tin client. File version mới luôn có immutable object mới, hoặc reuse file ready cùng company sau kiểm tra quyền; không upsert bytes.

Tạo version trước upload, command cấp pending file_id cùng transaction. Finalize file không tự share version. `draft -> shared` yêu cầu file ready và cost.publish_import; action ghi rõ người có `cost.source.read`/quyền file toàn company có thể thấy toàn workbook. Source period/as-of là mô tả gốc, không tự trở thành cutoff/reporting_date.

Shared version giữ file/link và nhãn nguồn bất biến. Sai file/nhãn nguồn thì thêm version mới có audit/reference; không đổi version cũ đang được facts trỏ tới. “Phiên bản nguồn mới nhất” chọn theo version_no trong nguồn logic, không suy từ năm trong filename; UI không dùng nó để thay số cũ. Source share không share draft figures, không kích hoạt financial facts và không tạo trạng thái confirmed_external.

### 5.16. `source_selections`

`id/scope`, `source_version_id`, `locator`, `locator_key`, `source_role = unknown | detail | subtotal | report_total | duplicate_presentation | supporting`, `handling = pending | ready_for_normalization | reference_only | excluded`, `raw_description nullable`, `raw_date_text nullable`, `date_review_status = unknown | checked | needs_review`, `mapped_project_id nullable`, `mapped_engagement_id nullable`, `mapped_component_id nullable`, `handling_reason nullable`, `version`, actor/time.

`locator` có schema cố định: `{kind: cell_range | page_range | whole_file, sheetName?, range?, fromPage?, toPage?, note?}`. Sheet name giữ nguyên Unicode và khoảng trắng đầu/cuối; A1 range được chuẩn hóa chữ hoa/thứ tự bounds. Page range là số trang >=1, from<=to. Không cho payload tùy ý/công thức làm locator. `locator_key` do server chuẩn hóa; unique `(source_version_id, locator_key)` tránh cùng vùng chính xác có hai selection-ID khác nhau. Hai vùng chỉ chồng một phần được đưa vào review nếu dùng cùng số/bản chất, không tự cho là trùng nghiệp vụ. Preview limited không được coi vùng ngoài preview không tồn tại; locator ngoài khả năng xem phải có ghi chú người nạp kiểm tra nguồn bên ngoài.

Mapped engagement nếu có phải cùng project/scope; component thuộc engagement; project chỉ được gán sau khi người nạp xác nhận, không tự lấy từ suggested_project. `ready_for_normalization` đòi mapping project/engagement đầy đủ và bản chất source_role đã biết; review issues liên quan được xử lý trước financial publish. `excluded`/`reference_only` cần reason. Phần chưa có đủ thông tin dùng pending, không điền placeholder thầu.

Locator và mô tả nguồn bị khóa khi đã được shared figure hoặc published document tham chiếu. Sai locator dùng selection mới ở vị trí đúng, liên kết lý do qua review issue và correction/evidence workflow. Sai phần mô tả đã chép nhưng locator đúng thì giữ raw_description cũ, thêm ghi chú đính chính có actor/reference qua resolution_note của review issue; UI trình bày cả bản gốc và đính chính, không tạo locator alias hoặc sửa ngầm fact. Số/mapping sai dùng correction của đúng lớp, không chỉ sửa ghi chú để thay tác động tiền. Mapping có thể được bổ sung từ unknown khi review có căn cứ, nhưng figure đã shared giữ snapshot scope riêng. Sau khi đã dùng cho financial fact, mapping/sự kiện nguồn của phần đó không được đổi ngầm: mở issue và correction/evidence workflow. Nếu mapping nguồn đã dùng là sai, command correction phải kết thúc claims cũ, ghi mapping trước/sau và thiết lập quan hệ đúng có kiểm soát; facts/figures cũ giữ scope snapshot, không rewrite bằng mapping mới. Không reset handling=excluded để loại một khoản đã ghi khỏi KPI.

Chỉ lưu phần người nạp chủ động chọn. Không yêu cầu tạo danh mục cho mọi sheet/ô. Source role tổng/subtotal mặc định reference_only. Ngoại lệ: tổng của đúng một giao khoán/kỳ có thể làm căn cứ cho một opening hoặc một valuation tổng kỳ khi phạm vi/cutoff đã được xác nhận và không có chi tiết/baseline khác đang tính cùng giá trị. Khi đó giữ source_role là tổng như trong nguồn, chuyển handling sang ready_for_normalization với lý do; không đổi nó thành “detail” để che nguồn tổng. Tổng toàn project nhiều thầu không được dùng ngoại lệ này. Mỗi financial fact vẫn cần căn cứ đủ rõ và chống overlap.

### 5.17. `source_reported_figures` — số nguồn không posting

Mỗi figure lưu `id/scope`, `source_selection_id`, `figure_family_id`, `revision_no`, `replaces_figure_id nullable`, `label`, `metric_kind = cost_total | labor_total | commitment_total | cash_total | reported_balance | unclassified`, `balance_kind nullable = total_outstanding | outside_retention | unallocated_cash | unknown`, `raw_value_text`, `value_state = known | blank | formula_error | missing_cached | not_numeric`, `amount numeric(20,4) nullable`, `currency_code nullable`, `basis = net | gross | payable_basis | cash | mixed | unknown`, `rounding_basis = exact | source_rounded | unknown`, `rounding_note nullable`, `period_basis = activity_range | cumulative_as_of | unknown`, `period_from/to nullable`, `as_of_date nullable`, `project_id nullable`, `engagement_id nullable`, `scope_kind = subcontractors_only | whole_project | mixed | unknown`, `scope_description`, `confirmation = unverified | confirmed_external | disputed`, `confirmation_reference nullable`, `status = draft | shared`, `version`, actor/share time.

Known cần amount finite đúng scale; các trạng thái còn lại để amount null, giữ raw token/mô tả gốc. Figure có thể signed (ví dụ dư nợ âm theo nguồn), không vì vậy tạo financial line âm. Balance kind unknown hợp lệ khi nguồn chỉ ghi “còn lại”. Không tự điền currency, basis, năm/kỳ hoặc project từ filename; form có gợi ý cấu hình nhưng phải được xác nhận. Engagement nếu có phải đúng project/scope.

Nguồn total/subtotal/balance có thể lưu ở cấp toàn project hoặc chưa rõ engagement. Figure không tham gia bất kỳ SUM nào của cam kết/cost/cash/payable/retention. Phần so sánh chuẩn ở mục7.4; `confirmation=confirmed_external` của figure chỉ xác nhận số đã được nguồn công nhận, không xác nhận nó bằng một nghĩa vụ hoặc giao dịch thực chi.

`share` cần source version shared, raw source immutable, cost.publish_import và không gửi draft khác kèm theo ngầm. Shared figure giữ nguyên amount/scope/basis/locator. Sửa bằng revision mới cùng family, unique family-revision; khóa family trước publish revision. Family root dùng chính ID của figure revision đầu (`figure_family_id=id`, revision_no=1, replaces null), FK cùng scope đến root; revision sau trỏ cùng root và replaces một revision đã shared cùng family. Share revision cần replaces_figure_id bằng shared tail hiện hành dưới khóa root; stale predecessor trả VERSION_CONFLICT, không chỉ so version của draft. Chỉ một shared revision hiện hành/family trong projection (shared revision_no lớn nhất); history vẫn đọc được theo quyền. Không tự chọn toàn bộ figures của source version mới và làm mất bản cũ; người nạp tạo revision chỉ khi đã xác nhận cùng metric/phạm vi, không dùng revision để biến một metric độc lập thành metric khác. Làm rõ scope/basis trước đây unknown được phép bằng revision có lý do/căn cứ, giữ bản unknown cũ; không tự lấy mapping hiện hành để đổi scope của bản đã share.

v1.1 bỏ reported_balance khỏi financial line enum/API; số dư và các số tổng nguồn đều dùng bảng này. Nếu CodeX phát hiện đã có dữ liệu thực của v1, chuyển đổi phải giữ source references và không sinh financial effect; không drop dữ liệu hoặc sửa migration đã áp dụng.

### 5.18. `cost_line_source_links` — nhiều bằng chứng, một tác động

`id/scope`, `evidence_document_id`, `financial_line_id`, `source_selection_id`, `economic_role`, `link_use = establishes_fact | same_fact | context`, `state = draft | active | ended`, `ended_by/at/reason nullable`, actor/time. Economic role do server suy từ loại financial line (`commitment | valuation | cash | retention | offset`); không lấy tùy ý từ client. Financial line và evidence document cùng engagement/scope; source selection/version/file cùng company. Link file được command bảo đảm trong cost_document_files của evidence document.

Khi tạo fact lần đầu, evidence document chính là document chứa line; cần ít nhất một establishes_fact hợp lệ. Sau publish, nguồn bổ sung đi qua evidence document mới trỏ tới line cũ, chỉ thêm same_fact/context; không tạo recognized_cost/cash lần nữa. Link active chỉ khi carrier document published; economic effect vẫn chỉ từ financial line đã kích hoạt theo mục4.4.

Với establishes_fact/same_fact, một occurrence nguồn và economic_role chỉ được gắn với một line đang hiệu lực: partial unique `(source_selection_id,economic_role)` khi state=active và link_use khác context; unique cặp carrier-line-selection-use ngăn retry trùng. Chính sách này ngăn tái sử dụng một vị trí đã xác nhận cho cùng loại tiền. Cùng vùng có thể chứng minh commitment và cash khác nhau nếu có căn cứ riêng; không đồng nhất chúng. Context không chiếm occurrence nhưng không đủ một mình làm căn cứ ghi tiền.

Mỗi selection nên xác định đúng phần mang số. Không dùng cả file làm establishes_fact cho nhiều giao khoán khác nhau để né identity; whole_file là context trừ khi nguồn thực sự là một chứng từ đơn với một khoản/ý nghĩa xác định. Muốn nhiều khoản hợp lệ thì chia vùng hoặc tham chiếu chứng từ khác rõ ràng. Không tự chia giá trị một ô cho nhiều thầu.

Source selection ở version khác là một occurrence khác, không tự là sự kiện mới. Phải đối chiếu cùng business key/các candidate trước publish. Cùng số tiền không đủ để merge; nhiều source đã được xác nhận cùng fact thì nối same_fact tới line cũ. Known duplicate đang mở chặn posting mới; hai facts đã cùng kích hoạt chỉ được sửa bằng correction, không chỉ đổi links.

Financial source correction giữ dòng cũ, reversal tự sinh không chiếm occurrence, kết thúc claims/link hiệu lực cũ bằng ended fields + audit và nối lại replacement trong cùng transaction; không xóa link cũ hoặc cho cả hai cùng active. Economic role/locator/line target của active link không sửa trực tiếp. Kết thúc link không tự đảo tiền; phải là thành phần của correction hợp lệ hoặc correction bằng chứng không làm mất mọi căn cứ của fact. Evidence-only correction không cho phép thay amount/scope của fact.

### 5.19. `source_review_issues`

`id/scope`, `source_selection_id`, `related_selection_id nullable`, `candidate_financial_line_id nullable`, `issue_kind = scope_uncertain | party_uncertain | semantics_uncertain | date_conflict | rounding_difference | formula_error | possible_duplicate | coverage_overlap | other`, `description`, `affected_project_id nullable`, `affected_engagement_id nullable`, `affected_streams` từ tập coverage streams, `impact = blocks_normalization | comparison_only`, `status = open | resolved`, `resolution = link_existing | independent_events | corrected | alternative_evidence | reference_only | excluded | not_comparable` nullable, `resolution_note/reference nullable`, `version`, opened/resolved actor/time.

Các FK cùng scope; affected engagement khớp project. Nếu chưa xác định phạm vi thì nullable, không tự gán theo filename. Một issue ảnh hưởng nhiều project được thể hiện bằng những issue liên quan theo từng scope đã xác định, không có cross-company target. Permission review dùng cost.prepare; kết luận ảnh hưởng fact published cần cost.correct và command tương ứng. Issue resolved đòi note/reference; “để xử lý sau” vẫn open.

Impact không là một cờ user tùy ý tắt: command bắt buộc blocks_normalization cho chưa rõ project/thầu/bản chất/ngày báo cáo cần có, possible duplicate/coverage overlap chưa giải quyết và lỗi ở ô đang được dùng làm số. comparison_only dành cho việc so tổng khác phạm vi hoặc rounding đã rõ bản chất không ảnh hưởng số đưa vào fact; nếu còn chưa rõ số nào là nghĩa vụ/tiền thì phải mở semantics issue blocking. Các metadata này không cho phép cấp quyền bỏ qua invariant. Lỗi ở vùng không chọn/ngoài phạm vi không chặn file share hoặc fact khác có bằng chứng đúng. Rounding difference/not-comparable có thể được giải thích mà không tạo financial adjustment; nếu chưa rõ số nào là nghĩa vụ/tiền thì vẫn là semantics issue mở.

Resolution link_existing phải tạo evidence link tới fact cũ; không chỉ đổi status để né duplicate. Independent_events phải nêu căn cứ phân biệt nghiệp vụ; không vượt unique claim trên cùng occurrence/role bằng nút bỏ qua. Correction financial cần transaction quy định; issue chỉ được resolved khi kết quả liên kết/sửa đã commit. Để không tạo vòng lặp “phải resolve trước mới publish evidence, nhưng resolve lại cần evidence”: publish/evidence/correction nhận `reviewResolutions[]` dự kiến (issueId, expectedVersion, resolution, target, reason/reference). Transaction kiểm tra tính hợp lệ của kết quả liên kết/sửa, áp source links/facts và đóng đúng issues cùng lúc. Issue khác chưa giải quyết vẫn blocking. POST resolve độc lập chỉ được link_existing/corrected khi kết quả evidence/correction đã published; nếu còn draft thì chưa đóng. Mọi mở/đóng issue ghi audit, có optimistic version/idempotency; mở issue mới trên nguồn đã ghi phải cập nhật status/coverage theo 6.5.

## 6. Các invariant nghiệp vụ và transaction

| ID | Invariant |
| --- | --- |
| I01 | Tenant/company của actor và mọi entity phải khớp FK. Financial facts bắt buộc project/engagement đúng; nguồn company-level được chưa có mapping. Không ép file hỗn hợp có duy nhất một cost project. |
| I02 | Không published financial mutation bằng direct table INSERT/UPDATE/DELETE của authenticated. Commands có permission/scope check và DB constraints. |
| I03 | Published facts, shared source versions/figures, file nguồn và history không sửa đè. Thay metadata source không hồi tố scope/amount của facts. |
| I04 | Chỉ một opening baseline gốc/engagement; chi tiết thông thường không trùng phạm vi baseline. |
| I05 | Không tính baseline như phát sinh của ngày upload hoặc tháng cutoff. |
| I06 | Nguồn unverified/disputed không tự biến thành confirmed; ảnh/chữ ký không tự là bằng chứng paid. |
| I07 | Tiền ứng và trả không đồng thời là cost; allocation không làm tăng tổng cash. |
| I08 | Phát sinh tăng hợp đồng không tự là giá trị thực hiện; cost bao gồm phát sinh không cộng lại biến động hợp đồng. |
| I09 | Không trộn cơ sở thuế/currency; không làm mất unknown. |
| I10 | Không hoàn/release/allocate vượt số còn hiệu lực; không cho hai publish đua tạo trùng hoặc double allocation. |
| I11 | Tổng dòng là nguồn hệ thống; total đối chiếu không được cộng lại. |
| I12 | Công bố + line/allocations + audit + receipt + coverage thay đổi là một transaction database. |
| I13 | Storage upload không atomic với DB; chỉ công bố document khi tất cả source link cần thiết trỏ tới object ready/immutable. |
| I14 | Đổi company/logout không được để response cũ xuất hiện hoặc gửi mutation sang company mới từ form cũ. |
| I15 | Tiếp nhận/share nguồn hoặc reported figure không có financial posting; không tự gán confirmed hay thầu giả. |
| I16 | Financial activation cần bản chất/phạm vi đã xác định, nguồn ready/shared và issues liên quan được xử lý; source confirmed một mình không đủ. |
| I17 | Một occurrence/role chỉ một active claim; một fact nhiều source links không nhân tiền; file version mới không tạo event mới tự động. |
| I18 | Total/subtotal/report figure không vào SUM tài chính; computed/source không đủ đồng phạm vi/cơ sở thì not_comparable. |
| I19 | Review issue mới có thể làm coverage partial/conflicted; không âm thầm loại fact cũ hoặc giữ complete sai. |
| I20 | File hỗn hợp yêu cầu quyền nguồn toàn company; đọc một document/selection không tự cấp quyền bytes toàn file. |
| I21 | Kỳ lịch sử không bị giới hạn 7 ngày; raw date/lỗi/rounding giữ nguyên, không tự biến thành ngày hoặc adjustment. |
| I22 | Nhãn bên/nguồn chi không đổi owner; third-party/unknown payer allocation cần căn cứ chấp nhận. |
| I23 | Source link/evidence bổ sung chỉ thay provenance; không kích hoạt lại document đã ghi tiền. |
| I24 | Thay reported figure bằng revision giữ nguồn cũ; không tồn tại hai nguồn lưu balance song song trong financial lines và reported figures. |

### 6.1. Quy trình publish

Xác thực actor/module/company; kiểm tra quyền từng loại dòng và source visibility; kiểm tra idempotency; khóa theo thứ tự chung bên dưới; so expectedVersion; kiểm tra business key, scope, normalization, review issues, source confirmation, amounts, source version shared/file ready, occurrence claims, cutoff và allocations; ghi published metadata, source links/claims, events/receipt; cập nhật coverage; commit; trả canonical IDs/version. UI reload nguồn canonical, không chỉ sửa KPI ở client.

Các command có thể thay đổi financial effect, occurrence claims, mapping/review của nguồn đã dùng hoặc coverage dùng cùng thứ tự khóa: `company_cost_settings` của company → các accounting_sources liên quan → các engagement → các document → selections/line targets theo UUID ổn định trong từng nhóm. C1 chấp nhận serialize các mutation này trong một company để bảo đảm nguồn/tiền/coverage không race; company khác không dùng chung khóa. Không giữ DB lock trong lúc upload/preview/phân tích file. Những update draft đơn lẻ không tác động liên aggregate dùng row lock/version của chính draft và không được lấy khóa ngược thứ tự. CodeX không tự bỏ cơ chế serialize khi chưa có kiểm thử tương đương.

Share source/figure và publish financial là hai lệnh khác nhau. Publish không tự share nguồn draft để vượt kiểm tra visibility; UI hướng dẫn share nguồn với cảnh báo quyền toàn workbook trước. Source version mới hoặc issue mới xuất hiện giữa validate và publish phải được xét lại dưới lock.

Việc đọc aggregate phải quan sát snapshot nhất quán. Dùng một query tổng hợp/projection trong DB khi phù hợp; không đọc riêng nhiều tổng tại các thời điểm khác nhau rồi ghép thành số dư có thể sai khi đang publish.

### 6.2. Sửa nguồn đã có phân bổ/giữ lại

Preview liệt kê dependent allocations/retention/offsets. Transaction phải đảo các quan hệ không còn đúng và thay vào targets mới được người nạp xác nhận. Không tự làm mất một khoản ứng/chi đã ghi. Nếu replacement không đủ nghĩa vụ để giữ phân bổ cũ, trả lỗi yêu cầu phân bổ lại; phần cash còn dư vẫn là cash chưa phân bổ, không bị xóa.

Chọn nhầm giao khoán sau công bố không được sửa engagement_id trực tiếp. C1 xử lý bằng hồ sơ đảo ở phạm vi gốc rồi hồ sơ mới ở phạm vi đúng, liên kết lý do/nguồn; trong thời gian chưa hoàn tất, coverage liên quan phải partial để không khẳng định báo cáo hoàn chỉnh. Không tự chuyển tiền đã phân bổ giữa các giao khoán; sai phạm vi company/tenant không có chức năng move trong C1.

C1 bắt buộc có luồng correction tối thiểu đủ dùng cho hồ sơ đã công bố. Không thay bằng quyền SQL admin sửa trực tiếp. Tính thu hồi/chi mới thực tế là hồ sơ nghiệp vụ, không disguised source correction.

### 6.3. Dispute sau công bố

Trạng thái nguồn để xét số liệu hiện hành gồm trạng thái công bố và event xác nhận/kích hoạt theo mục4.4; không chỉ filter source_confirmation của header. Đánh dấu tranh chấp bằng event/hồ sơ evidence có quyền `cost.correct`, reference và reason. Số đã công bố được giữ; KPI gắn `conflicted`, hiển thị số nguồn hiện hành và phần tranh chấp riêng, không lặng lẽ loại khỏi obligation. Giải quyết bằng correction/confirmation event có căn cứ. Metadata dispute effective được suy từ events, không rewrite financial lines.

### 6.4. Chống trùng giữa phần nguồn và các phiên bản file

Preview tìm candidate trong company theo identity nghiệp vụ đã có, engagement/contract reference, economic role, ngày/kỳ và số tiền; kết quả là gợi ý, không auto-merge. Không quét dùng tên file/sheet như luật phân loại. Khi source_selection hoặc related source đã biết là cùng sự kiện, chỉ được nối vào fact hiện có bằng evidence workflow.

Các command claim occurrence dùng unique constraint và khóa chung, không chỉ client warning. Cùng exact locator/version không thể tạo hai selection để né claim. Hai vùng khác nhau có cùng số chưa chắc là cùng event: user chọn link_existing hoặc independent_events với căn cứ. Vùng nguồn làm context/tổng đối chiếu không được biến thành một fact mới chỉ để khỏi conflict.

Các phần đã review ở version cũ giữ ID/location cũ. Version mới có vị trí mới được người nạp review; reuse fact cũ qua source links khi tương đương, correction nếu nguồn sửa giá trị, hoặc tạo fact mới nếu là nghiệp vụ mới có identity riêng. Không tự copy toàn bộ dòng tiền trên version upgrade. C1 không hứa phát hiện mọi trùng ngữ nghĩa; completeness không được nâng lên chỉ vì không có candidate được phát hiện.

### 6.5. Review issues và completeness

Issue tác động trên source selection chưa được công bố giữ nó pending/blocked cho normalization; upload, share file và phần nguồn khác hợp lệ vẫn làm được. Issue chưa rõ scope không được gán tùy ý cho project trong tên file; company summary hiển thị có nguồn chưa xác định phạm vi, không khẳng định toàn company đã đầy đủ. Nếu có explicit affected_project/engagement/stream thì áp ảnh hưởng ở đó.

Chỉ issue/selection đã được người nạp xác nhận có liên quan phạm vi báo cáo mới ảnh hưởng coverage đó; không suy mọi sheet chưa chọn đều blocking mọi project. Issue metadata nhạy cảm vẫn theo source permissions; financial-only summary chỉ nhận cảnh báo đã lược nội dung để không giấu trạng thái partial. Issue mới trên bằng chứng đã dùng cho fact kích hoạt không tự xóa tiền. Command mở issue và append event cùng transaction; hạ coverage của phạm vi biết được về partial hoặc gắn conflicted khi nghi ngờ giá trị đã ghi. Summary còn kiểm active issues tại read-time, không chỉ đọc assertion complete cũ. Issue chưa map engagement nhưng có affected_project giữ project summary partial; dữ liệu project khác không tự bị coi sai.

Resolution của issue không tự khôi phục complete. Người có cost.coverage.assert cần căn cứ và assertion mới; nếu muốn thực hiện cùng lúc thì command kiểm tra quyền và commit atomic. Excluded/reference_only chỉ hợp lệ với phần thật sự ngoài phạm vi hoặc không tạo facts; không dùng để che nguồn còn nghĩa vụ chưa xử lý. Phần chưa chọn không yêu cầu có một issue/row cho mọi ô, nhưng upload không chứng minh inventory đã đủ.

## 7. Quy tắc báo cáo

### 7.1. Các loại tổng

Cam kết = base + increases - decreases sau reversal; giá trị xác nhận = recognized_cost - cost_decrease sau reversal; cash ròng = advances + payments + unclassified - refunds; P/A lấy từ allocations đúng loại; K/R lấy từ các khoản hold/release có hiệu lực.

Báo cáo công nợ dùng liability_amount, không lấy source_amount trước thuế rồi trừ tiền trả sau thuế. Commitment cũng phải so trên cùng cơ sở với giá trị thực hiện nếu muốn cảnh báo vượt; thiếu cơ sở thì không có cảnh báo vượt giả.

Công thức trong tài liệu 01 áp dụng khi đủ normalization và coverage. Phần unclassified_application được cộng vào P khi tính nghĩa vụ nhưng hiển thị riêng nhãn tiền không phân loại; không gọi nó là advance. “Đã thanh toán phân bổ” và “Tổng tiền đã chi” là hai con số khác nhau.

Số nguồn còn phải trả khi chưa đủ allocation được lưu ở source_reported_figures (metric_kind=reported_balance), không trong cost_document_lines. Không tự sinh dòng tiền/phân bổ để khớp số nguồn. Chỉ hiển thị chênh lệch khi điều kiện 7.4 thỏa; không overwrite số nguồn.

Cash totals tách own_company / third_party / unknown payer. Tổng gộp mang nhãn “tiền chi cho giao khoán theo nguồn”; không gọi đó là tiền company tự chuyển. Phần third_party/unknown chưa có căn cứ chấp nhận đứng ngoài allocations; không tự tạo công nợ giữa các bên. Giữ riêng actual cash chưa biết ứng/thanh toán với đề nghị chi chưa có actual cash.

### 7.2. Output contract cho một KPI

`status = complete | partial | unavailable | conflicted`, `knownAmount` chuỗi decimal nullable, `currencyCode`, `basis`, `asOf`, `unknownCount`, `warnings[]`, `sourceDocumentCount`. Không dùng số 0 làm placeholder cho unknown.

Complete chỉ khi phạm vi project/engagement được xác nhận phù hợp và các stream cần thiết đủ đến asOf. Với partial, `knownAmount` là số các phần đã biết, UI phải ghi “đã nạp”; không khẳng định đó là cận dưới nếu có thể còn thiếu điều chỉnh âm.

Các số dư tính từ kỳ có baseline:

- asOf >= cutoff: baseline có hiệu lực + delta sau cutoff đến asOf.
- asOf < cutoff: baseline không cho phép tái dựng lịch sử; status unavailable/partial theo dữ liệu thật.
- báo cáo biến động [from,to]: chỉ delta có reporting_date trong kỳ. Baseline hiển thị ở mục lịch sử/đầu phạm vi, không làm tăng biến động kỳ.
- source correction có reporting_date gốc có thể làm thay đổi báo cáo hiện hành của kỳ cũ; UI cho biết dữ liệu đã được sửa và thời điểm sửa. C1 không hứa tái tạo một file báo cáo từng được xem trước đây nếu chưa có report snapshot.

### 7.3. Các ví dụ nghiệm thu số học (giả lập)

| Case | Dữ liệu | Kỳ vọng |
| --- | --- | --- |
| F01 | C=100 triệu, K=5, P=40, A=20, R=10 | Còn phải trả tổng=35; ngoài giữ lại=25. Nếu tổng ứng=30 thì ứng chưa phân bổ=10. |
| F02 | C=100, chi thực=120, phân bổ=100 | Nghĩa vụ còn=0; cash chưa phân bổ=20. Không negative payable bị clamp hoặc xóa 20. |
| F03 | Nguồn net=100; tax chưa biết; chưa có liability nguồn | Giữ net=100; không suy gross=100; KPI cơ sở thanh toán và công nợ incomplete. |
| F04 | Source gross=110; nguồn cho net=100,tax=10 | Giữ đúng cả ba; phép cộng thuế ở đây là dữ liệu ví dụ, không thuế suất mặc định. |
| F05 | Baseline xác nhận=200 đến 31/08; delta=30 ngày báo cáo 05/09 | Lũy kế đến 05/09=230; phát sinh tháng 9=30; không gán 200 vào tháng 8 như một phát sinh. |
| F06 | Commitment tăng20; đợt nghiệm thu120 đã gồm phần tăng20 | Chi phí xác nhận120, không140. |
| F07 | Ví dụ tổng hợp: công18 triệu + thưởng2 + bồi dưỡng0,3 =20,3 triệu | Nhập tổng hoặc thành phần, không cả hai; không tự paid, không tự xác định thuế. Không dùng số/nhân công thật của ảnh làm fixture commit. |
| F08 | Khoản giữ lại10 được giải phóng; chưa chuyển tiền | R giảm10, tổng nghĩa vụ chưa đổi, cash không đổi. |
| F09 | Ứng30, áp dụng20, hoàn ứng10 | Ứng chưa phân bổ0; thực chi ròng20; áp dụng20 không bị trừ lần hai. |
| F10 | P/A hoặc coverage chưa rõ; nguồn báo còn phải trả50 | Hiển thị “50 — theo nguồn” và computed unavailable; không tự tạo allocation để ra50. |

### 7.4. Output contract đối chiếu số nguồn

Response đối chiếu gồm `sourceFigureId`, `sourceRevision`, `sourceAmount`, `sourceValueState`, `sourceLabel`, `sourceLocator`, `scope`, `period`, `basis`, `roundingBasis`, `computedKpi` nullable, `comparisonStatus = comparable_complete | comparable_partial | not_comparable`, `difference` nullable, `reasonCodes[]` và `explanation`.

Server kiểm tra cùng company, project/engagement/phạm vi thầu, currency, net/gross/payable/cash basis, kỳ hoạt động hay lũy kế/ngày cắt và cách làm tròn. source scope whole_project/mixed/unknown không tự so với KPI thầu. KPI do server chọn từ enum và filter đã xác minh; không nhận arbitrary SQL/công thức từ request.

Chỉ tính `difference = sourceAmount - computedKpi.knownAmount` khi đồng phạm vi/cơ sở đã xác nhận, amount known, kỳ hợp lệ và cách làm tròn so sánh được. Comparable_partial phải hiển thị “chênh so với phần đã chuẩn hóa”, không khẳng định sai lệch kế toán cuối cùng. Thiếu một điều kiện thì difference=null, not_comparable, nêu reason (scope_mismatch, basis_unknown, period_unknown, rounding_unresolved, source_value_unavailable...). Missing không là zero. Chênh lệch không tự tạo adjustment hoặc nâng coverage.

Nếu chỉ biết hai cột số gốc/làm tròn khác nhau, lưu hai figure độc lập với cùng ngữ cảnh và rounding_note; có thể hiển thị cạnh nhau nhưng không suy một cột là tiền đã trả hoặc quy tắc làm tròn toàn company. C1 không có rounding engine tự động. Source figure mới cùng metric cần revision rõ ràng; file version mới không tự cập nhật sourceAmount của so sánh cũ.

## 8. File upload và xem nguồn

### 8.1. Định dạng/phạm vi C1

XLSX, XLS, PDF, PNG, JPG/JPEG; tối đa 20 MiB/file. XLSX preview giá trị tĩnh theo sheet, giữ tên sheet/cell reference. XLS lưu/tải bản gốc và cảnh báo không có preview. XLSM/XLSB không thuộc định dạng C1. Không convert workbook qua dịch vụ bên ngoài. Đã có hai workbook tổng hợp để kiểm chứng cấu trúc nguồn; vẫn không có template/parser tài chính tự động được duyệt. Workbook bảng công ngày chi tiết không được suy từ sheet lương tổng hợp.

Danh sách sheet ghi đúng tên (kể cả trailing space), thứ tự và trạng thái visible/hidden/veryHidden; mặc định mở sheet visible, actor đủ quyền nguồn có thể chọn sheet ẩn có nhãn. Dòng/cột ẩn cũng được đánh dấu nếu xuất hiện trong vùng preview, không tự coi chúng là dữ liệu cần nhập. Không cần render layout Excel giống bản in.

Giá trị formula cached trong XLSX chỉ là giá trị lưu trong file, có thể cũ; đánh dấu. Không cache thì ô báo không có giá trị tính sẵn. Ô error như #REF!/#DIV/0! giữ error token; không thay thành0. Không tính lại và không lấy kết quả preview làm dữ liệu tài chính chính thức. Lỗi nằm ngoài phần dùng không chặn source share/phần hợp lệ. Lỗi ô dùng làm số cần source_review_issue, bằng chứng khác có xác nhận hoặc giữ pending; không bịa số để pass. Preview không đầy đủ format/in ấn như Excel, không phải bản dựng pixel-perfect.

Giới hạn preview: tối đa 20 sheets, 200.000 ô đọc, 100 MiB tổng giải nén; một page tối đa 200 hàng × 50 cột. Hitting limit trả `limited` và chỉ rõ phạm vi; không giả vờ hết dữ liệu. Parser chạy với giới hạn tài nguyên; không thực thi script, hyperlink tự động, OLE hay embedded content; escape nội dung ô. Workbook lỗi/mã hóa được lưu nguyên bản khi hợp lệ định dạng nhưng preview unsupported/failed; người nạp vẫn có thể dùng form theo nguồn đã kiểm tra bên ngoài. MIME/đuôi giả bị reject, không chỉ báo preview lỗi.

PDF/ảnh hiển thị qua viewer cô lập; tắt active content, không render HTML nhúng dưới origin ứng dụng. Đối với bản gốc download, không khẳng định hệ thống đã quét sạch malware nếu chưa có scanner. Tài liệu nguồn không được gửi tới Office online hoặc AI bên ngoài.

### 8.2. Upload lifecycle và visibility nguồn

Tạo accounting_source → tạo source_version + pending file row/path cố định → upload private bucket không upsert → finalize xác minh object/size/MIME/hash phía server → file ready → người nạp share version → tạo/chia sẻ figures hoặc chọn phần nguồn để lập financial document → publish financial document sau kiểm tra riêng. Không cần engagement lúc upload.

Đường bắt đầu từ engagement là shortcut: UI tạo/chọn accounting_source và giữ engagement như lựa chọn mapping của người nạp, dùng cùng upload/selection API. Không duy trì endpoint upload bắt buộc cost_document ở bản C1 đầu tiên. File đang pending chỉ được finalize bằng actor của intent còn quyền hiện hành; mất quyền thì không finalize/share/publish.

Retry finalize cùng intent idempotent. Server không tin client tự báo sha/size/mime. Ready bytes bất biến; thay file là source version/object mới. Upload và DB không atomic; orphan pending cleanup cần policy/authorization riêng, không tự xóa file nguồn shared/published. Preview hạn chế/hỏng không tự làm file ready thành nguồn số đúng; file giả MIME bị reject.

Quyền raw bytes/preview/signed URL yêu cầu active membership + module enabled + cost.file.read + cost.source.read toàn company. Ngoài ra version phải shared, hoặc actor có cost.prepare để xem draft/intent được phép. Sự tồn tại cost_document_files không bỏ qua kiểm tra nguồn. cost.read hoặc quyền project/engineering không tự cho đọc workbook hỗn hợp. RLS trên storage.objects và metadata áp cùng semantics, không chỉ endpoint UI; không lộ file name/hash/preview của source không được phép.

Signed read URL TTL 60 giây; endpoint cấp link trả Cache-Control private,no-store; không log token. URL đã cấp có thể dùng đến expiry, logout/revoke chặn cấp mới nhưng không hứa hủy tức thì. Object key không phải public URL. Cache preview có key file version/hash + scope và authorization mỗi lần đọc; không chia cache qua company. Không lưu signed URL bền vững trong DB hoặc state khi đổi company.

### 8.3. Trùng lặp

Hash trùng trong company giúp cảnh báo/reuse file nếu actor có quyền đầy đủ; không tiết lộ sự tồn tại hash của company khác. Reuse file không tạo automatic figure/financial fact. Save workbook mới có thể thay hash nhưng giữ nghiệp vụ cũ; filename không là identity.

Các mức kiểm tra gồm unique source version/locator, business key financial document, active occurrence claims, candidate về nghiệp vụ và review resolution có căn cứ. Một sự kiện có thể được trình bày ở nhiều sheet/file; chọn same_fact để thêm bằng chứng qua evidence document. Không đổi tên file/partition hoặc tạo locator alias để bỏ qua known duplicate.

Một ô tổng có thể chứng minh tổng lịch sử nếu đúng giao khoán/cutoff; không đồng thời dùng các chi tiết đã nằm trong tổng làm delta. Total/subtotal/report-only chỉ dùng đối chiếu. Nguồn ĐNTT hoặc đề nghị chi không tự là cash, bất kể nằm trong cột tiền mặt/tài khoản.

C1 không bảo đảm tự phát hiện mọi trùng ngữ nghĩa, không tự merge hai giao khoán có tên tương tự. Hai mục hợp đồng giống/khác số phải giữ trong review khi chưa biết độc lập hay thay thế. Validate lại khi publish; quyết định independent_events phải có căn cứ chứ không một nút “bỏ qua tất cả”.

## 9. Permission, RLS và scope

### 9.1. Permission mới

| Permission | Trách nhiệm |
| --- | --- |
| project.register.manage | Tạo/sửa project register, không sửa Journey. |
| party.manage | Tạo/sửa đối tác trong company. |
| engagement.manage | Tạo/sửa engagement/component metadata. |
| cost.read | Đọc financial facts/hồ sơ published trong company được cấp; không mặc nhiên đọc nguồn thô. |
| cost.source.read | Đọc hồ sơ nguồn/số đối chiếu shared toàn company; quyền này không tự là quyền đọc bytes nếu thiếu cost.file.read. |
| cost.prepare | Tạo/sửa sources, source versions, selections, review issues, figures draft và financial drafts; đọc nháp trong company theo quyền của resource; kiểm soát version. |
| cost.publish_import | Share version/figure hoặc publish financial import bằng command tách biệt; không là quyền duyệt chi C3. |
| cost.record_cash | Cho phép nguồn tác động cash/allocations; phải có prepare/publish tương ứng. |
| cost.correct | Tạo và công bố sửa nguồn/điều chỉnh/ghi dispute; không sửa thẳng row. |
| cost.file.read | Đọc bytes/preview/URL nguồn tài chính khi đồng thời có cost.source.read và visibility source version tương ứng. Không dùng document link để vượt quyền raw source. |
| cost.coverage.assert | Xác nhận phạm vi đầy đủ, phải có nguồn và audit. |
| cost.config.manage | Quản lý config module theo company, không tự cấp role. |

Role `cost_importer` theo baseline cho Sơn: bộ quyền tác nghiệp C1 cần thiết, gán explicit trong VQH. Role `cost_viewer` cho giám đốc: cost.read + cost.source.read + cost.file.read; project/party/engagement metadata được đọc qua projection tài chính với cost.read, không buộc cấp quyền quản trị.

Không chạy migration `cross join permissions` để âm thầm cấp tất cả quyền mới cho mọi company_admin. Giữ quyền cũ; mapping mới được duyệt và chạy qua onboarding hiện có. Role union có hiệu lực: account đang có quyền admin rộng không trở thành read-only chỉ vì thêm cost_viewer.

### 9.2. Enforcement

Module enabled + active membership + permission + object scope + state/source guards. Read các source entity dùng cost.source.read; xem draft cần thêm cost.prepare. Mutation nguồn cần cost.source.read + cost.prepare, share thêm cost.publish_import; đọc bytes/preview thêm cost.file.read. Không để cost.prepare một mình thành đường đọc raw source nằm ngoài quyền được cấp. Financial preparation/reading giữ quyền riêng tương ứng, không gộp tự động tất cả capability. Tenant được resolve từ company phía server; payload không được override tenant/actor. Không tin tên giám đốc/kế toán in trên ảnh để resolve account.

Bật RLS và revoke public/anon/direct writes khi tạo bảng. Chỉ grant SELECT khi có policy đúng; command/RPC authenticated kiểm tra auth.uid/scope/quyền rõ ràng. SECURITY DEFINER nếu cần phải đặt search_path an toàn, qualify objects và không đọc rộng trước khi kiểm tra actor. `service_role` không nằm request path thường.

Views tổng hợp dùng security_invoker khi môi trường hỗ trợ, hoặc projection được bảo vệ tương đương; không public materialized totals. Source/version/selection/reported-figure/review metadata và history có thể chứa tiền/PII, nên dùng source permissions/visibility, không cost.read đơn lẻ. File metadata, storage.objects, download, event history và summary đều theo cùng scope. API fact detail cho người không có cost.source.read chỉ trả bằng chứng đã lược dữ liệu nguồn (ID opaque và nhãn có quyền), không raw description/file name/cell text. C1 cost_viewer được cấp cả nguồn nên xem được nguyên file; C2 không được thừa hưởng quyền này từ project assignment. Project.read hiện có không cấp cost.read.

C1 cost.read và cost.source.read đều company-wide vì hai actor đầu dùng phạm vi toàn company được cấp; hai capability vẫn tách để không gán raw source cho người chỉ cần facts. C2 project-scoped engineering access bổ sung bằng assignment và projection thực hiện riêng; không buộc cấp tài chính để chấm công. Không triển khai giả project-RBAC cho mọi module cũ trong C1.

## 10. API contract

Base: `/api/companies/:companyId`. Tất cả routes dùng auth/company context thật và schema request/response strict theo pattern repo. Mutations có `idempotencyKey`, `expectedVersion` khi sửa mutable row; server-generated actor/time.

| Method + path | Mục đích / kết quả |
| --- | --- |
| GET /costs/project-options | Project metadata cho module chi phí; không fixture. |
| POST /projects; PATCH /projects/:id | Project register create/update. |
| GET/POST /business-parties; PATCH /business-parties/:id | Danh mục đối tác; list có pagination. |
| GET/POST /projects/:projectId/engagements; PATCH /engagements/:id | Giao khoán; list/detail đúng scope. |
| GET/POST /engagements/:id/components; PATCH /engagement-components/:id | Hạng mục tối thiểu. |
| GET/POST /cost-documents | List/create draft; filter project/engagement/status, cursor. |
| GET/PATCH /cost-documents/:id | Read/update draft document + lines; input revision kiểm soát. |
| POST /cost-documents/:id/cancel | Hủy nháp, không hard delete. |
| POST /cost-documents/:id/validate | Preview lỗi/cảnh báo và tác động; không công bố. |
| POST /cost-documents/:id/publish | Transaction công bố nhập nguồn. |
| POST /cost-documents/:id/correction-draft | Tạo draft correction và dependency preview; publish qua cùng endpoint. |
| POST /cost-documents/:id/evidence-draft | Hồ sơ bổ sung bằng chứng, không financial effect. |
| POST /cost-documents/:id/source-confirmations | Xác nhận nguồn published chưa kích hoạt; kiểm tra lại invariant; expectedEventId chống stale state. |
| POST /cost-documents/:id/disputes | Append event đánh dấu/giải quyết tranh chấp, reason/reference và expectedEventId của event tail. |
| POST /files/:id/finalize | Verify bytes của intent/source version; trả file metadata/preview status, không share hoặc publish tiền. |
| POST /cost-documents/:id/file-links | Link file ready có source version shared cùng scope; draft only; không cấp raw-read permission. |
| GET /files/:id/preview | Giá trị tĩnh/metadata; giới hạn page/sheet, không thực thi file. |
| POST /files/:id/read-url | Cấp signed URL sau kiểm tra cost.source.read + cost.file.read + source version visibility. |
| POST /cost-documents/:id/allocations | Chuẩn bị allocations trong draft; publish kiểm tra lại toàn bộ. |
| GET /engagements/:id/coverage; POST /engagements/:id/coverage | Read/append assertion; source document bắt buộc published, permission riêng. |
| GET /costs/summary | KPI + coverage; query projectId, engagementId, from, to, asOf, basis. |
| GET /costs/engagements/:id | Detail giao khoán, các nhóm số và nguồn. |
| GET /cost-documents/:id/history | Financial history theo visibility/quyền. |
| GET/POST /accounting-sources; GET/PATCH /accounting-sources/:id | Nguồn logic, suggested project optional; list/source metadata theo source read hoặc prepare thích hợp. |
| POST /accounting-sources/:id/versions | Tạo version + pending file + upload intent trong một command, cấp version_no; nhận metadata file, không cần engagement. |
| GET /accounting-source-versions/:id | Version/file status, selections/figures theo quyền; không tự latest-financial. |
| POST /accounting-source-versions/:id/share | Chia sẻ version nguồn ready; kiểm quyền toàn workbook, không tạo tiền hoặc share draft figures. |
| GET/POST /accounting-source-versions/:id/selections | Đọc/tạo vùng nguồn chủ động chọn; locator fixed schema và unique. |
| GET/PATCH /source-selections/:id | Read/review mapping, role, handling; expectedVersion, không rewrite locator đã dùng. |
| GET/POST /source-selections/:id/reported-figures | Số nguồn không posting; tạo draft figure hoặc revision theo family có khóa. |
| PATCH /source-reported-figures/:id | Chỉ sửa figure draft bằng expectedVersion. |
| POST /source-reported-figures/:id/share | Share figure snapshot; source version phải shared; không thay KPI. |
| POST /source-reported-figures/:id/revision-draft | Tạo replacement draft cùng family; bản shared cũ giữ nguyên. |
| GET /source-reported-figures/:id/comparison | So với KPI server-validated; trả not_comparable khi khác scope/basis/kỳ. |
| GET /source-review-issues; POST /source-selections/:id/review-issues | Hàng đợi có filter scope/status; tạo issue, hạ coverage/conflicted khi cần trong cùng transaction. |
| POST /source-review-issues/:id/resolve | Quyết định có note/reference và side effect liên kết/correction hợp lệ; không tự complete coverage. |
| GET /source-selections/:id/fact-candidates | Candidate trong company để review, không auto-merge và không trả dữ liệu chéo quyền. |
| POST /cost-documents/:id/source-links | Chuẩn bị các links trong document/evidence draft; server suy economic_role, publish mới chiếm claim. |
| GET /accounting-sources/:id/history | Source/version/selection/figure/review history theo source permissions; không financial activation. |

List response `{items, nextCursor}`; entity response `{item}`; preview `{errors,warnings,impact,validatedVersion}`; publish `{documentId,version,publishedAt}`. Không route trả array trần khi shared schema yêu cầu envelope.

`validatedVersion` chỉ giúp UI; publish phải revalidate ở server/DB vì dữ liệu có thể đổi giữa preview và click. Save input không nhận computed balance cuối cùng như giá trị đáng tin; source_reported_figures có luồng riêng để lưu số nguồn. Source mutations/revision/share/review dùng idempotencyKey và expectedVersion/expectedEventId phù hợp; auth kiểm lại trước replay. Figure share trả `{figureId,revisionNo,sharedAt}`, source share trả `{sourceVersionId,version,sharedAt}`; không trả published financial IDs giả.

v1.1 là API đích cho C1 chưa triển khai: không tạo endpoint upload bắt buộc cost_document hoặc enum financial reported_balance để tương thích giả với bản v1 tài liệu. Nếu có implementation cũ thực tế, phải trình phương án tương thích/migration trước thay đổi. Aggregate summary có thể trả source totals trong trường riêng chỉ khi actor có cost.source.read; chúng không đi vào knownAmount của KPI.

`GET summary`: asOf là date; khi vắng dùng to hoặc ngày hiện tại trong timezone company và trả asOf thực tế trong response. from/to chỉ lọc biến động, không cắt baseline khỏi lũy kế. basis cố định trong một KPI: `payable_basis | net | gross | source_partitioned`; không cộng lẫn basis.

## 11. Errors và trạng thái không lỗi

| HTTP / code | Hành vi |
| --- | --- |
| 400 INPUT_INVALID | Payload/date/scale/line kind sai; chỉ trả field errors an toàn. |
| 401 AUTH_REQUIRED | Chưa có phiên hợp lệ. |
| 403 COMPANY_ACCESS_DENIED / PERMISSION_DENIED / MODULE_DISABLED | Context hoặc quyền không hợp lệ, không lộ dữ liệu resource. |
| 404 RESOURCE_NOT_FOUND | ID không nằm trong phạm vi nhìn thấy; không tiết lộ ID company khác. |
| 409 VERSION_CONFLICT | Giữ bản nháp trên UI, reload/so sánh; không silent overwrite. |
| 409 SOURCE_ALREADY_REGISTERED | Business identity đã dùng; mở hồ sơ hiện có nếu được quyền. |
| 409 IDEMPOTENCY_CONFLICT | Key dùng với payload khác. |
| 409 HISTORY_IMMUTABLE | Gọi sửa trực tiếp số published. |
| 409 SOURCE_COVERAGE_OVERLAP | Detail trùng opening/cutover phạm vi. |
| 409 FINANCIAL_DEPENDENCY_CONFLICT | Reversal/correction còn allocation/hold phụ thuộc không được giải quyết. |
| 409 ALLOCATION_EXCEEDS_AVAILABLE / RETENTION_EXCEEDS_OUTSTANDING | Không công bố trạng thái sai; file/nháp vẫn giữ. |
| 409 SOURCE_FILE_NOT_READY | Không share/công bố khi object chưa được finalize. |
| 409 SOURCE_VERSION_NOT_SHARED | Financial publish/figure share cần source version shared; không tự mở quyền file. |
| 409 SOURCE_REVIEW_REQUIRED | Phần nguồn còn blocking issue hoặc chưa rõ bản chất/phạm vi; file và source figures vẫn được lưu. |
| 409 SOURCE_SELECTION_SCOPE_MISMATCH | Mapping trong company không khớp fact target; nguồn khác company vẫn trả404/403 phù hợp để không lộ tồn tại. |
| 409 SOURCE_OCCURRENCE_ALREADY_USED | Occurrence/role đã có active claim; trả fact được quyền để bổ sung evidence, không nhân tiền. |
| 409 SOURCE_FIGURE_IMMUTABLE | Shared figure phải sửa bằng revision, không update trực tiếp. |
| 409 THIRD_PARTY_ACCEPTANCE_REQUIRED | Không phân bổ tiền bên khác/chưa rõ bên chi vào nghĩa vụ khi thiếu căn cứ chấp nhận. |
| 413 FILE_TOO_LARGE | File vượt cấu hình. |
| 415 FILE_TYPE_UNSUPPORTED | MIME/định dạng không thuộc phạm vi. |

Thiếu thuế, thiếu số tiền chi, preview unsupported hoặc coverage partial là trạng thái dữ liệu có thể lưu, không lỗi500. Chênh lệch đồng phạm vi/cơ sở trả kết quả so sánh có nhãn phù hợp; khác phạm vi/cơ sở là not_comparable với difference=null, không500 và không false discrepancy. Không sửa giá trị nguồn hoặc ẩn nhãn không đủ. Sai ngày trong raw text có thể lưu; sai date field của fact trả400. Lỗi cached cell không bị COALESCE thành0.

## 12. UI chi tiết

Bốn khu vực: **Tổng quan chi phí**, **Giao khoán**, **Hồ sơ nguồn**, **Nhập dữ liệu** (actor tác nghiệp). Hàng đợi đối chiếu là tab trong Hồ sơ nguồn, không một ERP module riêng. Mobile giám đốc ưu tiên KPI/nguồn; bảng cuộn trong vùng, không tràn toàn trang.

Wizard nguồn: (1) tạo/chọn source company, project gợi ý optional; (2) upload version và xem file/sheet trạng thái; (3) chọn phần cần dùng hoặc lưu để tiếp tục sau; (4) chia sẻ version/số nguồn rõ quyền toàn workbook. Lưu nguồn không đòi biết thầu. Upload mới không tự chia sẻ và không tự nhập lại facts.

Wizard financial: từ vùng nguồn → chọn đúng project/party/engagement và opening/detail → xác định ngày/cutoff và identity nghiệp vụ → nhập số/type/basis → xem candidate/lỗi/chênh lệch → công bố. User đi từ giao khoán vẫn dùng chung sources/versions bên dưới. Nếu chưa đủ nghĩa/phạm vi có nút “Để đối chiếu” đưa về source, không ép điền0 hoặc một thầu giả.

Màn nguồn hiển thị file/version; vùng đã chọn với role/handling; source figures; issues; fact đã liên kết. Không hiển thị “đã chuẩn hóa toàn file” chỉ vì vài vùng đã xử lý. Nút liên kết fact có sẵn tạo evidence draft, không sao chép amount. Các duplicate candidate không gộp tự động; quyết định độc lập phải có lý do.

Dashboard tách **Số Taskovia đã chuẩn hóa** và **Số theo báo cáo kế toán**. Số nguồn khác phạm vi toàn công trình không đặt như KPI thầu; comparison chỉ có difference khi đủ điều kiện. Bảng dư nợ trống/unknown có nhãn, không0. Khoản tiền bên khác chi có nhãn nguồn chi riêng, không đồng nghĩa company tự trả.

Màn bảng công C1 nhập tổng kỳ hoặc công/thưởng/bồi dưỡng; không là form chấm từng nhân công. Nguồn kỳ lương tổng hợp không trở thành roster. C2 sau này có projection nhân công an toàn, không đưa raw workbook có tiền cho kỹ sư.

Published financial detail giữ các nhãn nguồn/confirmation/opening/delta/disputed và lịch sử. Source figure/shared version được trình bày riêng, không gọi người nạp là người duyệt chi hoặc người ký nguồn. Sửa số đã chốt dùng correction/revision phù hợp từng lớp.

Company switch: cảnh báo draft chưa lưu; hủy/ignore response theo scope generation; clear project/engagement/source selection, preview, signed URL và candidates; resolve company mỗi request. Key cache gồm actor/company/source version/project/filter cần thiết. Không dùng PROTOTYPE_CONFIG fallback khi chưa chọn company.

## 13. Tích hợp source và migration

| Vùng | Thay đổi dự kiến |
| --- | --- |
| app/features/project-register, business-parties, engagements, costs | Types/presenters gồm sources/figures/review trong costs; không làm ProjectDetail prototype có workflow giả. |
| app/repositories/contracts.ts | Bổ sung ProjectRegister/Party/Engagement/AccountingSource/SourceReview/SourceFigure/CostDocument/CostReport/File contracts. |
| app/repositories/http/* | HTTP implementations, dùng authenticated client và scope động. |
| app/plugins/repositories.client.ts | Inject các repository mới; không fallback mock cho C1. |
| app/pages/costs/**; app/components/costs/** | Dashboard, engagement/document detail, nguồn/version/vùng chọn/đối chiếu và hai luồng nguồn–financial. |
| app/services/auth/access-policy.ts; app/components/app/navigation-permissions.ts; shell | Permission-aware nav/home cho cost-only actor; không phá routes hiện có. |
| server/features/project-register, business-parties, engagements, costs, files | Route/service/repository tách nhiệm vụ; files module không thành parser mọi biểu mẫu. |
| server/api/companies/[companyId]/** | Thin routes theo contract mục10. |
| shared/schemas/*; shared/constants/permissions.ts | Schemas, decimal-string contracts, enums và permission mới. |
| supabase/migrations/* | Forward-only schema/FK/index/RLS/commands; giữ migration cũ nguyên vẹn. |
| shared/types/database.types.ts | Generate qua Cloud DEV guard khi có authorization; review diff. |
| tests/unit, tests/e2e, supabase/tests/database | Bộ test C1 và regression bề mặt dùng chung bị sửa. |

Index thêm source company/status/received_at, version `(source_id,version_no)`, selection version/locator_key/handling, issue scope/status, figure family/revision, source-links occurrence/role/active và reverse lookup financial_line/source_selection. Các unique/partial unique và FK nêu trong5.14–5.19 là bắt buộc; không chỉ code validate.

Index tài chính ưu tiên `(tenant_id,company_id,project_id/engagement_id,reporting_date,id)` trên đường đọc, `(tenant_id,company_id,status,created_at)` trên documents, target_line/cash_line/cost_line trên allocation/adjustment, company/source business key, file object key và coverage engagement-stream-revision. Không load toàn bộ file bytes vào summary API. Pagination mặc định50, max100; history và preview có phân trang riêng. Không N+1 cho danh sách engagement.

Không tự nâng cấp engine PostgreSQL/framework hay dùng phiên bản package mới nhất tùy ý. Dependency preview XLSX/decimal được CodeX chọn/pin từ tài liệu chính thức và kiểm tra an toàn/license trong implementation; chức năng và giới hạn phải đúng spec bất kể thư viện nào. Đã có workbook tổng hợp làm nguồn khám phá, chưa có xác nhận parser tự hiểu đúng tiền/thuế. Không tuyên bố real-source acceptance PASS chỉ từ đọc file hoặc unit test bằng mock. Source-only entities/permissions phải được tạo và bật RLS trước khi triển khai các route mới; chúng không nới FK của financial entities.

Execution base phải được CodeX xác minh với working tree, branch, remote và migration chain. Analysis SHA không tự cho phép reset/checkout/merge/cherry-pick. Source main và nhánh checkpoint khác nhau; không bỏ migration đã có trên Cloud chỉ vì bắt đầu từ main. Khi cần thay đổi base/integration ngoài nhiệm vụ, báo blocker và xin quyền, không tự giải quyết bằng repair/reset.

### 13.1. Rollout permission tương thích

Ở analysis base, `authorization.service.ts` parse bộ permission trả về bằng shared permission schema. Vì vậy code hiểu permission mới phải được triển khai/khởi động ở đúng môi trường trước khi gán các permission đó cho tài khoản; không để DB trả mã mới cho backend/frontend cũ chưa hiểu chúng.

Tạo schema/catalog với module chưa bật và chưa cấp role mới; chuẩn bị code/schema response tương thích; chỉ sau khi xác minh app đang chạy đúng bản mới thì cấp role/enable module bằng thao tác được phép. Nếu deployment cần thứ tự khác vì type generation, vẫn giữ nguyên ranh giới: chưa cấp permission mới hoặc bật đường sử dụng cho app cũ. Điều này không cho phép deploy Production trong task thiết kế.

## 14. Acceptance matrix C1

| ID | Tình huống | Kỳ vọng |
| --- | --- | --- |
| A01 | Company VQH có project Eo Gió chưa có Journey | Tạo project/register và chi phí không cần Opportunity/stage giả. |
| A02 | Một thầu, nhiều engagement/component | ID và số liệu không bị gộp/ghi đè. |
| A03 | Upload source không cần cost document, chưa shared/publish financial | File/version draft lưu; KPI chưa đổi. |
| A04 | Publish nguồn unverified | Visible có nhãn; không vào confirmed/cash thực chi đã xác nhận. |
| A05 | Gói hoàn thành nhập opening | Lũy kế đúng; không phát sinh chi phí vào ngày nạp; nghĩa vụ có thể còn. |
| A06 | Chứng từ qua cutoff hoặc detail trước cutoff | Block overlap, không tự chia số. |
| A07 | Nhập tổng cùng chi tiết của một bảng | Validation không cho cộng hai lần cùng khoản. |
| A08 | Công + thưởng + bồi dưỡng | Các loại tách; không suy thưởng từ công; no auto paid. |
| A09 | Kỳ tuần qua tháng | Giữ service dates; default báo cáo theo ngày nguồn; không prorate. |
| A10 | Trước/sau/không tách/chưa rõ thuế | Không trộn basis/đoán VAT; unknown giữ nguyên. |
| A11 | Giữ lại bảo hành và khấu trừ | Đúng công thức F01/F08; không giảm chi phí do retention. |
| A12 | Ứng, áp dụng ứng, hoàn ứng | Đúng F09; allocation không phát sinh cash/cost. |
| A13 | Chi vượt nghĩa vụ | Cash dư chưa phân bổ, không clamp/xóa. |
| A14 | Nguồn chỉ có số còn phải trả | Số nguồn riêng, computed incomplete; không tự tạo phân bổ. |
| A15 | Coverage thiếu một stream/project chưa đủ thầu | KPI partial/unavailable, không giả total công trình. |
| A16 | Cùng source key/file retry | Không hồ sơ tác động trùng; hash chỉ kiểm trong company. |
| A17 | Retry publish cùng key; key khác payload | Một kết quả/một event sequence; payload khác409. |
| A18 | Hai actor sửa draft | ExpectedVersion ngăn stale overwrite. |
| A19 | Hai transaction phân bổ cùng cash | Tổng không vượt tiền; một request thất bại/được serialize đúng. |
| A20 | Sửa published có allocation/retention | History giữ; dependencies được xử lý atomic hoặc conflict. |
| A21 | Upload file thay/bổ sung | Original bytes/link giữ; số không tự thay. |
| A22 | Giám đốc chỉ cost_viewer | Đến được /costs; xem financial/source shared và download với cost.source.read+cost.file.read, không mutate qua API/RPC. |
| A23 | Kỹ sư/employee chỉ project.read | Không đọc amounts, payrollfile, events tài chính hoặc summary. |
| A24 | Hai company cùng tenant; hai tenant | Đọc/ghi/FK/file/summary/RPC đều cách ly; ID chéo không leak. |
| A25 | Đổi company khi request/draft còn | Không stale response/mutation sang scope sai. |
| A26 | Revoked membership/permission | Mọi command/replay/link mới từ chối; không hứa revoke URL cũ trước expiry. |
| A27 | File giả MIME/quá lớn/XLSM | Reject đúng code; không execute. |
| A28 | XLSX formula cached/missing, hidden content, zipbomb/oversized | Tĩnh, escape, limits, warning; không tự ghi tiền từ preview. |
| A29 | Upload thành công, finalize/publish thất bại | Không orphan được xem như source ready, không số liệu nửa chừng. |
| A30 | Numeric trên giới hạn JS safe integer; decimals | Round-trip exact bằng string; scale invalid bị reject, không silent rounding. |
| A31 | Source bị disputed sau published | Số/lịch sử không biến mất; KPI conflicted, resolution có căn cứ. |
| A32 | Contract variation20 và valuation120 bao gồm nó | Cost120, không140. |
| A33 | Audit và logs | Reader rộng không nhìn được tiền/PII qua metadata/log/shared audit. |
| A34 | C1 dữ liệu tồn tại trước migration mở rộng thử nghiệm | ID, file linkage, cumulative totals và source references giữ nguyên. Test migration C2/C3 thực phải bổ sung khi đến giai đoạn đó. |
| A35 | Có workbook thật nhưng chưa chạy pipeline/actor smoke được phép | Fixture tổng hợp kiểm core/form/file rules; không báo import/pilot thật PASS chỉ vì đã có file hoặc phân tích cấu trúc. |
| A36 | Role union | Thêm cost_viewer không được mô tả là read-only nếu actor có quyền khác; kiểm capability thực tế. |
| A37 | App cũ chưa hiểu permission mới | Rollout không cấp quyền/bật module trước app tương thích; auth hiện có không bị lỗi parse. |
| A38 | Published unverified được xác nhận sau | Cùng document/line IDs được kích hoạt một lần; retry không nhân đôi; gốc bị thay không được kích hoạt muộn. |

### 14.1. Tình huống bổ sung từ workbook, A39–A62

| ID | Tình huống | Kỳ vọng |
| --- | --- | --- |
| A39 | Upload file nhiều project/thầu chưa có engagement | Source/version/file lưu; không sinh project/party placeholder hoặc facts. |
| A40 | Share version và figure, chưa publish financial | Giám đốc có quyền source đọc được đúng nhãn; KPI không đổi; shared không tự confirmed. |
| A41 | Một cột có hợp đồng, ứng, nghiệm thu; header ứng nhưng mô tả thanh toán | Phân loại từng khoản bằng căn cứ; không map toàn cột/sheet. |
| A42 | Một khoản nằm hai sheet và một subtotal | Sau review, một fact nhiều links; subtotal đối chiếu không cộng thêm. |
| A43 | Nguồn tổng toàn project so với KPI thầu | Giữ source amount; not_comparable, difference=null; không kết luận sai lệch kế toán. |
| A44 | Source/computed cùng scope/basis nhưng normalized coverage partial | Comparable_partial khi các điều kiện khác rõ; difference ghi “so với phần đã chuẩn hóa”, không nâng complete. |
| A45 | Một dòng mô tả nơi khác tên file | Không auto-map project; pending hoặc mapping được xác nhận, không move company theo nhãn. |
| A46 | Chưa rõ thầu/bản chất trong một vùng, vùng khác đủ | Chặn normalization/activation vùng chưa rõ; vẫn upload/share và publish phần hợp lệ. |
| A47 | Kỳ lịch sử14 ngày, qua năm, raw date invalid | Không constraint7 ngày/năm filename; raw giữ; financial date cần xác nhận, không auto-repair. |
| A48 | Hai cột số gốc và rounded chênh nhau (fixture giả) | Giữ hai nguồn, rounding issue/note; không tạo cash/adjustment hoặc áp làm tròn toàn company. |
| A49 | Sheet ẩn lỗi và sheet visible hợp lệ | Metadata/preview chỉ rõ hidden/error; vùng không dùng không chặn phần hợp lệ; error vùng dùng không thành0. |
| A50 | Chi có nhãn bên khác/unknown payer | Owner nguyên company; cash tách nguồn; allocation cần company_acceptance_reference; không sinh công nợ liên company. |
| A51 | Workbook v2 chèn dòng, thêm một khoản, lặp phần cũ | File version mới bất biến; fact cũ reuse/evidence, khoản mới identity riêng; không repost toàn file. |
| A52 | Actor chỉ cost.read hoặc chỉ project assignment cố tải file qua linked document | Raw metadata/preview/URL/storage bị chặn nếu thiếu source/file rights; project link không nâng quyền toàn workbook. |
| A53 | Hai publish claim cùng selection/role; đổi locator alias | Unique+lock ngăn hai active claims; normalize locator giữ trailing sheet name chính xác; retry không nhân tiền. |
| A54 | Một file nhiều gói hoàn thành còn giữ lại | Opening riêng theo thầu đúng; không thầu tổng giả, không auto-paid; ngày ký nguồn không auto-cutoff. |
| A55 | Client gửi financial line reported_balance theo spec cũ | Schema từ chối; số này dùng source_reported_figures; không tồn tại hai sổ đối chiếu cùng tác động. |
| A56 | Sửa/shared source figure revision, đổi mapping source | Shared snapshot giữ; revision mới có history; fact/figure cũ không tự đổi scope hoặc amount. |
| A57 | Mở issue trên nguồn đã dùng khi coverage complete | Số cũ không biến mất; coverage partial/conflicted và read-time guard; resolve không tự complete. |
| A58 | Dòng có ĐNTT hoặc hợp đồng trừ ứng nhưng chưa có nghiệm thu | Không auto-cash hoặc còn-phải-trả; số theo nguồn giữ không posting khi thiếu ý nghĩa/căn cứ. |
| A59 | Thêm ảnh/chứng từ vào fact published qua evidence draft | Thêm source links/file links/claims và audit; không kích hoạt lại cost/cash. |
| A60 | Nguồn confirmed_external nhưng selection chưa rõ scope/semantics | Xác nhận file không vượt normalization guard; source figures xem được có nhãn, không tạo fact chính thức. |
| A61 | Có tổng lịch sử nhưng chưa biết cutoff hoặc thầu | Lưu source/figure; không fake cutoff/upload date hoặc engagement; không opening có hiệu lực. |
| A62 | Sau publish phát hiện hai facts có thể trùng | Issue mở, KPI conflicted; sửa bằng correction đủ dependencies; không xóa link/hide một fact cho tổng tự giảm. |

Không A34/A47 yêu cầu implement C2/C3 ngay; C1 cung cấp fixtures và contracts để mở rộng sau. Các fixture commit phải đổi tên/giá trị/dates nhận dạng, chỉ giữ dạng quan hệ và kết quả kiểm tra tương đương; không copy workbook thật hoặc ảnh vào Git. A01–A62 là tiêu chí cần chạy sau implementation, không phải báo cáo kết quả đã PASS.

## 15. Kiểm thử, môi trường và giao cho CodeX

CodeX thực hiện unit/contract/E2E theo scope; smoke auth/nav và regression các phần repository registry/schema bị sửa. Các lệnh đang có tại analysis base: `pnpm test:unit`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test:e2e`, `pnpm verify:app`; database thao tác qua nhóm guarded `db:dev:*` trong `package.json`.

Bộ DB test C1 cần guard Cloud DEV thực tế. `db:dev:stage01:test` không mặc nhiên là runner cho module mới; CodeX phải dùng command phù hợp đã được xác minh hoặc thêm runner guarded C1 trong phạm vi implementation được duyệt. Không dựng Local DB thay Cloud DEV, không khẳng định pgTAP đã chạy khi chỉ chạy unit test/mock.

Không chạy migration, seed, nạp file thật, test ghi Cloud hoặc Production từ việc duyệt tài liệu này. Mỗi thao tác môi trường cần authorization hiện hành theo AGENTS. Dữ liệu mẫu tests là synthetic; file hợp đồng/bảng lương thật không vào Git. Backup metadata và file bytes đều cần trong runbook pilot; không xóa nguồn kế toán bên ngoài sau upload.

Hồ sơ bàn giao implementation phải nêu execution SHA, diff theo module, migration thêm, checks đã chạy và log, limitations, permission mapping được cấp thực tế, và chưa làm gì. Test pass không tự bằng `READY_FOR_VQH_PILOT`; actor, cấu hình, nguồn mẫu thật và môi trường đưa giám đốc sử dụng được kiểm chứng riêng.

## 16. Baseline quyết định v1.1 và ranh giới bàn giao

| ID | Hành vi phần mềm theo baseline |
| --- | --- |
| D-C1-01 | File nguyên bản + Sơn nhập số tối thiểu; không auto-parser mọi Excel. |
| D-C1-02 | XLSX preview tĩnh/hidden metadata; XLS download-only; không XLSM/XLSB; giới hạn mục8. |
| D-C1-03 | Tổng lịch sử theo giao khoán có cutoff xác nhận; không gán về ngày upload, không bung chi tiết lịch sử trong C1. |
| D-C1-04 | Số nguồn và số chuẩn hóa khác lớp; chưa đủ normalization/coverage không tự bằng0. |
| D-C1-05 | KPI chính theo giá trị xác nhận cơ sở thanh toán, nhãn rõ; net hiển thị riêng, không tuyên bố chi phí hạch toán thuế. |
| D-C1-06 | Share nguồn/file/figure không công bố tiền; financial published unverified không kích hoạt tiền, confirmed cũng cần nghĩa/phạm vi đúng. |
| D-C1-07 | Allocation có căn cứ để tính còn phải trả; thiếu thì xem số nguồn, không bù allocation giả. |
| D-C1-08 | Quyền importer/viewer explicit, gồm quyền nguồn toàn company; không gán từ tên nhân sự/company_admin. |
| D-C1-09 | C3 quản lý duyệt mới sinh giá trị xác nhận; đóng kỳ không sinh lần hai/không chứng minh paid. |
| D-C1-10 | Nguồn tổng hợp độc lập engagement; mỗi phần có role/handling/mapping/review, không tạo thầu giả. |
| D-C1-11 | Source figures thay reported_balance trong financial lines; comparison chỉ tính khi đồng phạm vi/cơ sở/kỳ. |
| D-C1-12 | Một fact nhiều occurrence nguồn, claims/dedup/revisions có kiểm soát; source version mới không tự repost. |
| D-C1-13 | Nhãn nguồn chi không đổi owner; chi hộ phân bổ cần căn cứ, không kế toán liên công ty. |
| D-C1-14 | C1 giữ kỳ lịch sử bất kỳ có căn cứ và raw date/rounding; C2/C3 tuần mặc định có ngoại lệ kiểm soát, không rate engine C1. |

Sơn đã chấp nhận định hướng và cập nhật v1.1, nhưng không vì vậy xác nhận số thực trong workbook đã đúng nghĩa/thuế/paid. Hai file tổng hợp đã được cung cấp và đối chiếu trong báo cáo nguồn; không còn giả định “chưa có workbook tổng hợp”. Không có mapping/auto-parser tài chính nào được duyệt chỉ từ sự hiện diện của mẫu.

Các vấn đề số thật (phạm vi xưởng, tên thầu chưa rõ, hai mục PCCC, thứ tự đợt thầu thép, duplicate candidate, cutoff/ngày và số làm tròn) là công việc đối chiếu trước công bố từng phần. Chúng không chặn build/test bằng fixture tổng hợp, không được silently resolved bằng giả định kế toán trong code.

Chỉ dùng cặp tài liệu v1.1 cho kế hoạch C1. Giữ v1.0 và báo cáo tác động để truy vết; không thay migration cũ hoặc coi user chấp nhận tài liệu là quyền DB/deploy. Các kiểm tra execution base, môi trường, quyền actor và dữ liệu pilot vẫn theo mục13/15.

## 17. Source anchors

Repo tại SHA đầu tài liệu: `AGENTS.md`; `app/plugins/repositories.client.ts`; `supabase/migrations/20260818033418_employee_management_rbac.sql`; `server/utils/supabase-client.ts`; `server/features/authorization/authorization.service.ts`; `package.json`. Các contracts/tenancy/audit/Journey và Stage01 docs đã được đọc trong phân tích trước trong cùng hội thoại. Khi implementation phải đọc lại bề mặt bị sửa ở execution SHA, không lấy tên bảng thiết kế trong spec làm bằng chứng DB hiện đã tồn tại.

Nguồn nghiệp vụ: câu trả lời tám nhóm của Sơn, ảnh Chú 8 và hai workbook tổng hợp Eo Gió/kho Yong Mei trong hội thoại; báo cáo nội bộ `03-taskovia-accounting-workbooks-impact-review.md` ngày2026-09-11 giữ địa chỉ sheet/ô. E01–E09 được tích hợp qua C01–C08. Source anchors này là chứng cứ thiết kế, không là dữ liệu seed/pilot được cho phép. Ảnh/file không cấp quyền actor, không quyết định tax policy hoặc chứng minh paid.

Các ví dụ kiểm thử tiền trong spec dùng số tổng hợp. File nguồn, danh tính người lao động, hợp đồng và số thật trong báo cáo tác động không thuộc bộ bàn giao commit; giữ ngoài Git. Nếu CodeX cần đọc chúng để mapping thật, phải có quyền/phạm vi dữ liệu cụ thể và không đưa vào fixture/log.

Tài liệu kỹ thuật chính thức kế thừa từ v1, ghi nhận kiểm tra 2026-09-10; không được kiểm tra web lại trong lượt biên tập v1.1:

```text
https://supabase.com/docs/guides/database/postgres/row-level-security
https://supabase.com/docs/guides/storage/buckets/fundamentals
https://supabase.com/docs/guides/storage/serving/downloads
https://www.postgresql.org/docs/current/datatype-numeric.html
https://www.postgresql.org/docs/current/ddl-constraints.html
https://www.postgresql.org/docs/17/explicit-locking.html
```

## 18. Traceability các thay đổi đã hợp nhất

| Mã | Schema/contract chính | Luồng/invariant | Kiểm thử |
| --- | --- | --- | --- |
| C01 | 5.14–5.16, source version upload/share API | 4.0, 8.2, I15–I16 | A39–A40, A61 |
| C02 | 5.17, reported-figure comparison API; bỏ reported_balance ở financial enum | 7.4, I18/I24 | A43–A44, A48, A55–A56 |
| C03 | 5.18–5.19, fact-candidates/source-links/evidence | 6.4, I17/I23 | A42, A51, A53, A59, A62 |
| C04 | 5.16/5.19, mapping/review resolution | 4.0, 6.5, I16/I19 | A41, A45–A46, A57–A58, A60 |
| C05 | Opening/document/source link hiện có, không thầu tổng | 4.1, I04–I05 | A05, A11, A54, A61 |
| C06 | Raw dates/figures/rounding, period đề xuất C2/C3 | 7.4, 8.1, I21 | A09, A47–A48 |
| C07 | Cash metadata + company_acceptance_reference | 5.9, 7.1, I22 | A50 |
| C08 | Source permissions, review state, preview metadata | 8–10/12, I19–I20 | A49, A52, A56–A57 |

Đây là thay đổi tích hợp, không phải phụ lục ghi đè spec cũ. Mọi route/UI/schema và tiêu chí ở trên đều dùng mô hình v1.1.
