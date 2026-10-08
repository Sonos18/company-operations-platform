# AGY — T5 UI kỹ sư yêu cầu vật tư

Trạng thái: READY cho T5, từ SHA nền bên dưới. T3 API và contract đã review; repository `materialProcurement` đã đăng ký. Typecheck/lint/build đã chạy thành công trên tree này. T2 SQL vẫn đang review, chưa áp dụng Cloud DEV; kiểm thử UI bằng HTTP/auth mocks.

## Mục tiêu và nền

Triển khai UI T5 theo `docs/superpowers/specs/2026-10-08-material-procurement-design.md` và `docs/superpowers/plans/2026-10-08-material-procurement-plan.md`.
Nhánh tích hợp Git: `codex/site-engineer-material-request`. InstaCloud: `site-engineer-material-request`, worker `dev-worker-recovery`.
SHA nền đã review: `7960ba4f506312d7a0281bb336ceae94d81cce67`. Checkout worktree riêng từ SHA này và ghi lại base/head khi bàn giao.
Giữ nguyên công việc UI đang làm trên parent `dev-preview`; làm nhánh/worktree riêng từ SHA được bàn giao, không reset/stash/clean công việc khác.
Source/tests/build theo remote workflow đã được duyệt. Không dùng local DB, seed, migration push, cấp permission, deploy/promote hoặc tác động Production. Các kiểm thử UI dùng HTTP/auth fixtures; Cloud DEV chưa áp dụng migrations.

## Phạm vi file

Tạo:
- `app/pages/materials/index.vue`
- `app/pages/materials/[projectId]/proposals/index.vue`
- `app/pages/materials/[projectId]/proposals/new.vue`
- `app/pages/materials/[projectId]/proposals/[proposalId].vue`
- `app/components/materials/MaterialMasterPanel.vue`
- `app/components/materials/MaterialProposalForm.vue`
- `tests/e2e/material-proposal.spec.ts`, fixture riêng khi cần.

Có thể thêm component nhỏ trong `app/components/materials/` nếu có reuse thực tế. Không sửa backend, migrations, frozen schemas, registry/plugin, shared navigation, auth, permission grants, package/lockfile hoặc các màn chi phí cũ. Báo gap API cho Codex; không tự thay contract hay fake dữ liệu runtime.

## Luồng và dữ liệu bắt buộc

1. Danh mục vật tư là tên/quy cách/đơn vị chuẩn của công ty, không phải catalog một nhà cung cấp. Engineer được đọc; tạo/sửa chỉ với `material.manage`. T5 không có chức năng tìm/gợi ý/chọn nhà cung cấp.
2. Engineer chọn công trình từ `listProjects()`: projectId/code/name/locationText. Phiếu mới nạp `locationText` vào “Nơi giao”, cho sửa trên phiếu; không cập nhật địa chỉ project. Nếu project không có địa chỉ, yêu cầu nhập. Khi đang sửa phiếu, giữ địa chỉ đã lưu; đổi project không được âm thầm xóa địa chỉ người dùng đã nhập.
3. Phiếu gồm ngày cần vật tư, nơi giao, ghi chú và dòng vật tư chuẩn + số lượng dương. Không có nhà cung cấp, giá mua, hóa đơn hoặc bước duyệt của quản lý dự án.
4. Mỗi dòng giữ UUID `lineId` ổn định khi sửa và gửi lại. Dùng decimal string theo schema, không chuyển tiền/số lượng qua phép tính Number; không cộng tổng số lượng các đơn vị khác nhau.
5. Lưu nháp rồi gửi mua hàng. `createProposal/updateProposal` và `submitProposal` là hai command riêng: dùng version trả về hoặc canonical GET sau lưu; không retry create thành phiếu trùng. Mỗi hành động có UUID idempotency key: retry cùng payload giữ key, thay payload tạo key mới.
6. Chỉ người tạo có `material.proposal.submit` được sửa trạng thái draft/returned. Quyền UI dựa vào permission thực + authenticated user ID so với createdBy, không hardcode role name. Submitted/approved chỉ đọc. Buyer không được edit proposal, dù có quyền xem/duyệt. Các nút approve/return thuộc T7, không thực hiện trong T5.
7. Returned: hiển thị `returnReason` từ API; kỹ sư sửa rồi gửi lại. Contract bắt buộc lý do không rỗng khi returned, và null ở các trạng thái khác. Response sai shape phải hiện lỗi, không tự bịa lý do.
8. Hiển thị trạng thái “Nháp / Đã gửi / Đã duyệt / Cần sửa” và tiến độ orderCount/signedOrderCount. Mỗi dòng hiển thị allocatedQuantity/signedQuantity/remainingQuantity khi có. Với dòng đã ký, hướng dẫn không xóa/đổi vật tư/quy cách/đơn vị hoặc giảm dưới signedQuantity; server là nơi bảo vệ cuối cùng.
9. Loading/empty/permission/network/error/409 có thông báo tiếng Việt. 409 giữ bản người dùng nhập, tải canonical version để đối chiếu, không tự overwrite/retry với version mới. Ngăn submit hai lần. Đổi active company hoặc project phải bỏ response cũ và xóa dữ liệu tenant trước.

## API và pattern hiện có

Dùng `useRepositories().materialProcurement` — không gọi Supabase/SQL trực tiếp.
Đọc types/method signatures từ:
- `shared/schemas/costs/material-procurement.ts`
- `app/repositories/material-procurement.contracts.ts`
- `app/repositories/http/http-material-procurement-repository.ts`

T5 chỉ dùng listProjects/listMaterials/createMaterial/updateMaterial/listProposals/readProposal/createProposal/updateProposal/submitProposal.
Các method order/contract/evidence chưa có runtime ở checkpoint T3 và ngoài T5.
Reuse Nuxt UI/layout/design tokens trên nhánh nền; đọc `app/pages/costs/index.vue`, các pages costs/requests, `app/utils/costs/async-request-tracker.ts`, `tests/e2e/fixtures/auth-routes.ts`, `tests/e2e/auth.setup.ts`, `playwright.config.ts`.
Gắn page permission `material.read` theo pattern hiện có. Có `material.read` không tự suy ra edit/submit/manage.
Native date input; label rõ, lỗi gắn field, keyboard/focus, mobile không tràn ngang.

## Kiểm thử và bàn giao

Dùng mock HTTP fixtures typed đúng schemas, không mock repository thành dữ liệu bỏ qua auth boundary. Bao gồm:
- Địa chỉ mặc định từ project; sửa địa chỉ phiếu không đổi project; edit không bị auto nạp đè.
- Engineer own draft -> lưu -> canonical GET -> gửi -> canonical GET -> DOM “Đã gửi”.
- Returned -> thấy lý do -> sửa -> gửi lại, giữ lineId.
- Buyer/người khác không có form/nút sửa; submitted/approved không sửa.
- 403, 409 và retry cùng payload/key; không có supplier/price inputs.
- Đổi công ty trong lúc request cũ còn chờ không hiển thị dữ liệu cũ.
Pre-arm POST/PATCH + canonical GET trước click; chờ fresh DOM, không dùng sleep cố định.

Chạy focused E2E trên remote, port riêng:
`PLAYWRIGHT_PORT=4321 pnpm exec playwright test tests/e2e/material-proposal.spec.ts --project=chromium`.
Chạy lint/typecheck/build theo package.json, tuần tự với Codex để tránh heavy checks trùng. Chỉ báo PASS khi command thật exit0 trên exact head.
Full unit baseline tại checkpoint 69761c6 còn 86 failures không thuộc feature; không disable/sửa ngoài scope hoặc gọi full suite green.

Bàn giao: task ID, base/head SHA, branch, danh sách file, commands/exit, E2E evidence/screenshots, API gaps, claim nào chỉ chứng minh bằng mocks. Commit riêng file T5; không merge/push dev/main hoặc deploy. Codex review diff trước tích hợp.

## Các prompt tiếp theo

T7 (mua hàng): chỉ sau T4 reviewed và T5 diff đã tích hợp. Duyệt/trả phiếu, phân bổ nhiều NCC đã chốt, PDF báo giá, đối chiếu số lượng và xác nhận tên/quy cách/đơn vị thủ công. Không sửa phiếu kỹ sư.
T8 (kế toán): chỉ sau T6 reviewed. Mỗi order một contract, hai signed PDF riêng; committed cost rồi canonical payments có hóa đơn/proof. Không manager installment approval trong direct material flow.
T9 UI (báo cáo/thông báo): chỉ sau API/report T9 reviewed. Tách chi phí cam kết/thực chi; không tự cộng thêm từ reference/import totals.
Mỗi phần có prompt riêng ghi exact SHA và contract đã review; không triển khai ba phần sau bằng suy đoán từ bản T5.
