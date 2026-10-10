# A1 Line Notes and Form Columns — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Preserve the agreed ownership: Codex backend, AGY UI.

**Goal:** Ghi chú tùy chọn được lưu theo từng dòng/snapshot; form có cột tên dự kiến riêng; cả kỹ sư và mua hàng xem cột ghi chú.

**Architecture:** Mở rộng JSON dòng, hai bảng hiện có và các hàm create/update/submit/read. Dùng endpoint, version, idempotency và quyền hiện có. AGY nối UI vào contract đã đóng băng; không tạo subsystem mới.

**Tech Stack:** Nuxt/Vue, TypeScript/Zod, Supabase PostgreSQL; không thêm dependency.

**Spec:** `docs/superpowers/specs/2026-10-10-a1-line-notes-and-form-columns-design.md`, đã duyệt tại commit `0c0408f2798a57dfd735b32c91b7531f5ca5a483`.

## Global Constraints

- Ghi chú dòng tùy chọn, tối đa **2.000 ký tự**; trim hai đầu, giữ xuống dòng bên trong, trắng thành `null`. Ghi chú chung của phiếu độc lập.
- Dòng mới thiếu trường → `null`; dòng đã có khi update thiếu trường → giữ dữ liệu; `null`/trắng → xóa.
- Chỉ kỹ sư có quyền sửa phiếu nháp/trả về được sửa ghi chú. Buyer chỉ xem; không đổi quyền, RLS, floor số lượng hoặc lịch sử bất biến.
- Codex làm contract/DB/API; AGY làm Vue và mock UI liên quan. Không giao phần UI cho Codex worker.
- Theo chỉ đạo của Sơn: bỏ chạy automated tests, lint/typecheck; không cài runtime để chạy các vòng kiểm thử. Các ca dưới đây là alpha thủ công sau rollout được duyệt, không phải lệnh cho agent chạy ngay.
- Source và commit trên worker `dev-worker-recovery`, branch môi trường `site-engineer-material-request`; controller không checkout/build. Giữ mọi worktree và thay đổi ngoài phạm vi.
- Cloud DEV duy nhất: `gtgljlnhwvhqdnwrfdfj`; migration forward-only. Không gọi Cloud, build/deploy, sửa fixture Cloud, merge hoặc Production trong giai đoạn triển khai nguồn này.

## Review Focus

| Điều kiện dễ lỗi | Kết quả cần có | Bước kiểm tra |
| --- | --- | --- |
| Caller bỏ trường so với gửi `null` | Giữ dữ liệu so với xóa; hash lệnh không đánh đồng | T1 rà nhánh update; ca alpha 3 |
| Chuỗi trắng/tab/xuống dòng, 2.000/2.001 ký tự | Chuẩn hóa/giới hạn ở API và SQL; giữ nội dung nhiều dòng | T1 rà helper; ca alpha 2 |
| Phiếu trả về rồi gửi lại | Revision cũ không đổi, revision mới có ghi chú mới | T1 rà submit/read; ca alpha 5 |
| Payload có ghi chú nhưng input/view dùng chung schema | View bắt buộc `notes`, input vẫn cho omission | T1 rà Zod; T2 hydrate/signature; ca alpha 1, 4 |
| Đổi company/route hoặc reload thất bại | Ngữ cảnh mới không nhận phản hồi cũ; lỗi lưu giữ input ở ngữ cảnh còn hiệu lực; guard/retry còn nguyên | T2/T3 rà nguồn; ca alpha 6 |

## T0 — Chốt nền tích hợp và worktree (Codex)

**Files:** Spec và plan này; các ledger handoff hiện có chỉ đọc.

**Interfaces:** Nhận spec đã duyệt; xuất `EXECUTION_BASE_SHA` trong báo cáo triển khai. Nguồn khảo sát A3 là `b4172ce930d6a2044ea20423522953295e7678de`; đây không phải xác nhận deploy/alpha đạt.

- [ ] Xác nhận HEAD/cleanliness của nguồn tích hợp A2/A3 và đọc các thay đổi sau mốc khảo sát nếu có. Dùng nguồn mới nhất đã chốt có chứa `b4172ce`; nếu lineage phân kỳ hoặc contract khác spec thì báo điểm xung đột trước sửa nguồn.
- [ ] Tạo worktree riêng và nhánh `codex/materials-a1-line-notes-impl` từ nền đó, ghi full SHA. Mang **chỉ** commit tài liệu spec/plan từ nhánh `codex/materials-a1-line-notes`; không reset nguồn về A1 `c5c456a`.
- [ ] Kiểm tra migration timestamp lớn nhất và nested `AGENTS.md`. Không đổi worktree A1/A2/A3 hiện có. Dành tên migration `supabase/migrations/20261010130000_c1_material_proposal_line_notes.sql`; nếu timestamp đã dùng/không còn đứng cuối, chọn timestamp chưa dùng lớn hơn và ghi tên thật trong handoff.

## T1 — Contract và lưu/đọc snapshot (Codex backend worker)

**Files:**

- Modify: `shared/schemas/costs/material-procurement.ts`.
- Create: migration đã chốt ở T0.
- Read callers: `app/repositories/material-procurement.contracts.ts`, `app/repositories/http/http-material-procurement-repository.ts`, `server/features/costs/material-procurement/{service,repository,routes}.ts` và proposal API handlers. Chỉ sửa caller nếu có mapping tường minh làm rơi `notes`; pass-through hiện có không cần đổi.
- Update existing mock view objects that require the new field: `tests/unit/shared/material-procurement.spec.ts`, `tests/unit/server/material-proposals.spec.ts`, `tests/unit/repositories/http-material-procurement-repository.spec.ts`, và fixture view thực tế tìm thấy qua các caller schema. Không thêm framework/bộ test mới; không chạy suite.
- Defer generated `shared/types/database.types.ts` tới packet Cloud/types được duyệt; không giả lập kết quả generate.

**Interfaces:**

- `materialProposalLineInputSchema`: thêm `notes?: string | null`, trim/max 2000/blank → `null`, không default omission thành `null`.
- `materialProposalLineViewSchema`: override trường kế thừa thành `notes: string | null` bắt buộc, giới hạn 2000. Các type `MaterialProposalInput`, `UpdateMaterialProposalInput`, `MaterialProposalView` tiếp tục derive từ schema.
- SQL helper `private.c1_material_line_notes(target_value jsonb) returns text`: chỉ chấp nhận string/JSON null/SQL null, chuẩn hóa ghi chú, sai kiểu/quá dài → `INPUT_INVALID`. Helper immutable, `search_path=''`, revoke quyền gọi trực tiếp theo pattern private hiện có.
- Giữ chữ ký: `private.c1_material_create_proposal(uuid,uuid,jsonb,uuid,uuid)`, `private.c1_material_update_proposal(uuid,uuid,uuid,jsonb,uuid,uuid)`, `private.c1_material_submit_proposal(uuid,uuid,uuid,jsonb,uuid,uuid)`, `private.c1_material_proposal_json(uuid,uuid,uuid,uuid)`.

- [ ] Thêm schema input và view đúng Interfaces; giữ strict, tên HĐ 200 ký tự, quantity và header notes hiện hành. Rà API parse và HTTP parse đều dùng schema này, không strip ghi chú/omission.
- [ ] Thêm `notes text null` và CHECK chuẩn hóa/độ dài cho `material_proposal_lines`, `material_proposal_revision_lines`; dữ liệu cũ để null. Thêm helper dùng chung cho create/update, giữ xuống dòng bên trong.
- [ ] Trong migration mới, dùng pattern patch `pg_get_functiondef` có guard drift của migration tên HĐ. Kiểm tra mỗi anchor xuất hiện đúng một lần rồi sửa **định nghĩa hiện hành sau mọi migration trước**, giữ Buyer override/A2/A3. Anchor thiếu hoặc trùng phải raise trước mutation; không ghi đè toàn hàm từ foundation cũ.
- [ ] Create: whitelist thêm `notes`, insert giá trị helper. Update: whitelist thêm `notes`; dòng mới insert helper; dòng cũ dùng `v_line ? 'notes'` để phân biệt explicit clear với omission, lấy `v_existing_line.notes` khi bỏ trường. Giữ row locks, identity/floor checks, hash toàn `target_input`, receipt và actor scope.
- [ ] Submit: insert revision column/value `notes` từ `line.notes`. Read JSON: thêm `'notes'` từ `snapshot.notes` khi submitted/approved, từ `line.notes` khi draft/returned; không fallback sang mutable nếu snapshot null. Giữ cách chọn revision hiện hành.
- [ ] Rà các mock view hiện có và thêm `notes: null` ở dòng thiếu; giữ fixture input omission để không vô tình bỏ ca tương thích. Không sửa Vue/E2E.
- [ ] Rà diff đối chiếu Review Focus và chạy `git diff --check` (exit 0, không output lỗi). Commit chỉ schema/migration/mock contract cần thiết; ghi kiểm tra chưa chạy. Chốt full `BACKEND_SHA` cho AGY, kèm diff range và contract omission/null/max2000.

## T2 — Form và cột xem lại (AGY)

**Files:**

- Modify: `app/components/materials/MaterialProposalForm.vue`.
- Modify: `app/pages/materials/[projectId]/proposals/[proposalId].vue`.
- Align existing mock routes/defaults if needed: `tests/e2e/material-proposal.spec.ts`; không chạy E2E.

**Interfaces:** Bắt đầu từ đúng `BACKEND_SHA` của T1. Form gửi `lines[].notes` explicit string đã trim hoặc null; nhận `MaterialProposalView.lines[].notes`. Dùng `repo.createProposal`/`repo.updateProposal` hiện có, không endpoint ghi chú riêng.

- [ ] Codex viết prompt handoff chứa full nền backend SHA, hai file Vue, spec/plan và các acceptance dưới đây để Sơn chuyển cho AGY. Không nhắn một chat ngoài khi chưa có ủy quyền trực tiếp.
- [ ] AGY thêm `FormLine.notes: string`, mặc định `''` cho dòng mới; hydrate `l.notes ?? ''` trong `initFromProposal` và mọi đường khởi tạo/reset line. Validation >2000 hiện lỗi tại dòng, giữ nội dung người dùng; normalize vào payload và **cả** `proposalPayloadSignature`/`formPayloadSignature`.
- [ ] Chuyển input tên dự kiến thành TD riêng ngay sau Vật tư chuẩn. Thêm TD Ghi chú sau Số lượng; giữ thứ tự các cột lịch sử/xóa áp dụng. Textarea gọn, maxlength 2000, nhãn truy cập theo dòng, disabled theo save/submit; không nhập ghi chú bắt buộc.
- [ ] Detail/review dùng chung cho hai vai: thêm TH/TD Ghi chú sau Còn lại, hiển thị `line.notes ?? '—'` bằng interpolation với wrap/giữ xuống dòng; không `v-html`, không nút sửa cho Buyer. Chỉnh colspan nếu có và giữ cuộn ngang.
- [ ] Giữ nguyên tên HĐ fallback, icon editor, `unresolvedBuyer`/retry tracker, token/context guard, receipt key và canonical reload của nguồn A3. Không thay panel đơn hàng hoặc phần A2/A3 khác.
- [ ] Nếu chạm mock E2E, default canonical dòng `notes: null`; create/update mock phản ánh omission-preserve/explicit-clear. Đây là giữ contract của harness, không kết quả kiểm thử runtime.
- [ ] `git diff --check` phải exit 0; commit/push nhánh AGY và báo full immutable HEAD, base, phạm vi file. Không Cloud/build/deploy.

## T3 — Rà nguồn và tích hợp (Codex)

**Interfaces:** Nhận HEAD AGY trên `BACKEND_SHA`; xuất `INTEGRATION_SHA` và báo cáo source review. Không coi báo cáo AGY là bằng chứng đã chạy test.

- [ ] Xác minh lineage, đọc diff backend/UI và rà từng mục Review Focus. Đối chiếu đủ 6 tiêu chí spec, chú ý đường tạo dòng, mở lại, xóa ghi chú, no-op và snapshot null.
- [ ] Đối chiếu `git diff --name-only EXECUTION_BASE_SHA..HEAD`, bảo đảm phần A2/A3 ngoài phạm vi không bị đổi/loại bỏ. Tích hợp commit AGY đã rà vào nhánh riêng; không merge main.
- [ ] Chạy `git diff --check EXECUTION_BASE_SHA..HEAD`; ghi exact SHA và source-review findings. Nếu lỗi UI, gửi prompt sửa cho AGY qua Sơn; Codex không tự sửa Vue.
- [ ] Chuẩn bị packet rollout với đúng SHA, migration filename/hash/order, target Cloud DEV và preview; liệt kê tests/lint/typecheck đã bỏ, types chưa generate, alpha chưa chạy. Chỉ xin duyệt sau khi nguồn cụ thể đã sẵn sàng.

## T4 — Packet Cloud/preview và alpha (chỉ sau duyệt riêng)

Không chạy các bước này từ việc duyệt kế hoạch. Packet phải pin exact source SHA và allowances trước khi Sơn duyệt.

- [ ] Packet Cloud nêu trình tự guarded `pnpm db:dev:auth-check` → link nếu worktree cần → `db:dev:target` → `db:dev:status` → `db:dev:dry-run`; chỉ push một lần khi đúng lịch sử nền và đúng một migration ghi chú mới pending. Nếu có migration ngoài packet thì dừng để đối chiếu, không push kèm.
- [ ] Sau push được duyệt: status, `pnpm db:dev:types`, review diff generated types của hai bảng (Row nullable; Insert/Update optional nullable) và mọi thay đổi khác. Chốt source SHA chứa types trước packet deploy; không lặng lẽ deploy SHA khác SHA đã duyệt.
- [ ] Packet preview pin SHA hoàn chỉnh vào `dev-preview`/`site-engineer-material-request`, giữ auto-deploy off, nêu một lượt build/deploy, dừng lỗi đầu tiên không retry. Không sửa fixture hay thực hiện thao tác Production.
- [ ] Sau rollout, Sơn alpha trên tài khoản kỹ sư/Buyer hiện có và phiếu thử riêng. Lưu kết quả theo bảng dưới; phần kiểm tra caller omission được đánh dấu chưa xác minh nếu alpha UI không tạo được input thiếu trường, không thực hiện probe Cloud bổ sung khi chưa được duyệt.

| Ca alpha | Thao tác và kết quả |
| --- | --- |
| 1 | Dòng trống ghi chú vẫn lưu/gửi; form có cột tên HĐ riêng; mở lại/cả hai vai xem “—” |
| 2 | Nhập nhiều dòng/tiếng Việt, trim hai đầu; 2000 nhận, 2001 bị chặn; chuỗi trắng → null |
| 3 | Lưu ghi chú rồi explicit clear → null; omission khi update giữ giá trị (source review trước, probe chỉ nếu được duyệt) |
| 4 | Mở phiếu có ghi chú rồi lưu nguyên trạng không PATCH; đổi riêng ghi chú phát đúng lệnh; retry cùng lệnh không trùng |
| 5 | Gửi → trả về → sửa ghi chú → gửi lại; revision cũ giữ nguyên, cả hai vai xem ghi chú revision hiện tại |
| 6 | Lỗi lưu/reload giữ input ở ngữ cảnh còn hiệu lực; đổi company/route trong lúc lưu không nhận phản hồi cũ; Buyer edit tên HĐ vẫn đúng |
| 7 | Số lượng dương, hiển thị không đuôi zero; tên HĐ fallback/override, lịch sử/đơn hàng A2/A3 không đổi |

## Execution Handoff

Theo phân công đã duyệt và định tuyến trong AGENTS.md: Codex điều phối một worker backend Terra/high cho T1; AGY thực hiện T2 qua prompt Sơn chuyển; Codex rà/tích hợp T3. Không chạy hai worker trên cùng migration/contract, không spawn để viết spec/plan.

Plan này cần Sơn rà và duyệt trước T0–T3. Sau đó nguồn được làm tới packet reviewable; T4 vẫn cần duyệt riêng theo exact SHA/target. Không cần chọn lại người chịu trách nhiệm UI.
