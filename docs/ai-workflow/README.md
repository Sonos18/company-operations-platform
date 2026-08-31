# Taskovia Three-Party AI Development Workflow v1.1

## 1. Mục đích và phạm vi

Tài liệu này là nguồn chuẩn cho quy trình phối hợp phát triển phần mềm của Taskovia:

> Sơn → GPT Chat → Codex → GPT review remote → Sơn quyết định merge

Quy trình áp dụng cho discovery, thiết kế, implementation, validation, review và vòng sửa. Quy tắc bền vững dành cho Codex nằm tại [root `AGENTS.md`](../../AGENTS.md); thông tin riêng của từng task nằm trong packet tương ứng.

## 2. Vai trò

- **Sơn — Product Owner và Merge Authority:** quyết định business behavior, approved architecture, scope, external side effects và merge.
- **GPT Chat — Analyst, Solution Designer, Packet Author và Final Reviewer:** đọc remote source, làm rõ yêu cầu, đề xuất giải pháp, tạo packet và review remote diff.
- **Codex — Implementation Agent:** technical preflight, implementation, test, validation, self-review, commit, push và Completion Report.

GPT đưa khuyến nghị review; Codex không merge; Sơn giữ quyết định cuối cùng.

## 3. Thứ tự nguồn sự thật

Khi có mâu thuẫn, áp dụng theo thứ tự:

1. System/runtime instructions và policy bắt buộc.
2. `AGENTS.md` áp dụng cho path đang làm việc.
3. Approved Implementation Packet hoặc Fix Packet của task.
4. Canonical workflow này.
5. Tài liệu tham khảo và gợi ý không mang tính bắt buộc.

Remote repository tại immutable SHA là nguồn source dùng cho GPT handoff và review. Packet là nguồn quyết định sản phẩm/thiết kế đã duyệt cho Codex; source hiện tại vẫn là nguồn sự thật kỹ thuật.

## 4. Phân loại task

- **Spike:** điều tra nguyên nhân hoặc tính khả thi; đầu ra là kết luận, chưa mặc định implementation.
- **Bounded:** thay đổi nhỏ hoặc trung bình trên flow đã tồn tại; packet được duyệt và internal checklist là đủ.
- **Architectural:** subsystem mới hoặc thay đổi lớn về architecture, contract, data hay permission; packet phải có `approved_design_ref` và `approved_execution_plan_ref`.

Spike chỉ chuyển thành implementation sau một quyết định mới của Sơn.

## 5. Sơn ↔ GPT: discovery và approval

1. Sơn đưa nhu cầu, bug hoặc vấn đề cần điều tra.
2. GPT đọc remote source, instruction, manifest, schema, migration, test, history và CI liên quan.
3. GPT ghi repository, base ref, `analysis_base_sha`, source anchors và assumptions.
4. GPT chỉ hỏi câu hỏi có thể đổi behavior, contract, permission, UX, migration, scope hoặc acceptance criteria.
5. GPT phân loại task, trình bày hiện trạng, gap, phương án, trade-off, scope, acceptance criteria và test strategy.
6. Sơn phê duyệt hoặc yêu cầu chỉnh sửa.
7. GPT tạo [Implementation Packet](templates/implementation-packet.md).

GPT không giao task implementation khi quyết định sản phẩm quan trọng còn bỏ ngỏ.

## 6. GPT → Codex: approved handoff

Packet có `approval.status: APPROVED` xác nhận product/design handoff. Việc Sơn gửi packet cho Codex là authorization để implement sau khi preflight đạt.

Codex không mở lại requirement discovery, không đề xuất lại approved architecture và không tạo product plan mới. Codex vẫn phải technical reasoning đầy đủ, dùng skill bắt buộc, quản lý checklist nội bộ và điều phối worker khi runtime yêu cầu.

## 7. Technical preflight

Trước khi sửa file, Codex kiểm tra:

- Repository, remote, base ref và packet prerequisites.
- Active branch, working tree, active worktrees và branch ownership.
- Local/remote divergence và branch collision.
- Source anchors, contract và dependency/runtime versions.
- Validation command, target và side effects.
- Push capability mà không in credential hoặc secret.

Preflight không phải product discovery mới. Nếu packet rõ và đạt `READY`, bounded task bắt đầu ngay, không cần approval vòng hai.

## 8. SHA model

| Trường | Ý nghĩa |
| --- | --- |
| `analysis_base_sha` | Remote commit GPT đã phân tích |
| `remote_base_sha` | Base ref sau khi Codex fetch |
| `execution_base_sha` | Commit Codex dùng để tạo implementation branch |
| `head_sha` | Local implementation HEAD sau commit |
| `remote_head_sha` | HEAD của remote implementation branch |

Codex không branch từ local base có undeclared unpushed commits. Local-only commit chỉ được dùng khi packet ghi nó là prerequisite.

## 9. Preflight state machine

```text
Packet + fetch
    |
    +-- source khớp, workspace an toàn ------------> READY
    |
    +-- drift không ảnh hưởng packet --------------> READY_WITH_NON_MATERIAL_DRIFT
    |
    +-- drift làm packet không còn đúng -----------> PACKET_STALE
    |
    +-- thiếu quyết định/quyền/workspace an toàn --> BLOCKED
```

- `READY`: bắt đầu implementation.
- `READY_WITH_NON_MATERIAL_DRIFT`: bắt đầu từ fetched remote base và báo drift.
- `PACKET_STALE`: GPT đọc lại remote source và cập nhật packet.
- `BLOCKED`: Codex cung cấp bằng chứng, ảnh hưởng và safe resolution; không tự workaround ngoài scope.

## 10. Material source drift

Drift là material khi thay đổi hoặc làm vô hiệu source anchor, packet assumption, API/data contract, schema/migration order, authentication, authorization, RLS/permission, dependency/lockfile assumption, validation command, applicable `AGENTS.md`, generated type hoặc acceptance criteria.

Unrelated formatting, documentation hoặc isolated code change không tự động làm packet stale. Non-material drift được phép tiếp tục nhưng phải xuất hiện trong preflight và Completion Report.

Nếu `analysis_base_sha` không cùng lịch sử với fetched base, repository/base sai hoặc history bị rewrite, Codex không được tự suy đoán execution base.

## 11. Git và no-new-worktree default

- Mỗi implementation task dùng một branch.
- Branch tạo từ `execution_base_sha`, không từ undeclared local base.
- Không commit/push trực tiếp base branch; không merge; không force-push.
- Không stash, reset, clean, xóa hoặc overwrite thay đổi ngoài task.
- Mặc định dùng current clean checkout.
- Không tạo worktree mới nếu packet không cho phép.
- Existing platform-managed worktree chỉ dùng cho đúng task của nó.
- Dirty relevant checkout, unclear branch ownership hoặc nguy cơ làm phiền task khác dẫn tới `BLOCKED`.
- Fix round tiếp tục trên cùng implementation branch.

Worktree có thể được packet cho phép cho parallel/background/long-running isolation. Đây là ngoại lệ có chủ đích, không phải ceremony mặc định.

## 12. Ranh giới quyết định của Codex

Codex được tự quyết định implementation order, naming cục bộ, helper boundary, file/function decomposition, test organization, scoped refactor cần cho acceptance criteria, skill usage, worker routing và validation selection trong phạm vi được phép.

Codex phải dừng khi cần đổi approved business behavior/architecture/contract, mở rộng scope đáng kể, thêm major dependency chưa duyệt, chạy unauthorized destructive database/Cloud DEV action, thực hiện production mutation/deployment chưa được Sơn cho phép riêng, tự giải quyết acceptance criteria mâu thuẫn hoặc đi tiếp qua material drift.

## 13. Validation side-effect classes

| Class | Quyền mặc định |
| --- | --- |
| `read_only` | Được phép |
| `workspace_mutating` | Chỉ khi task cần; tracked diff phải được review |
| `cloud_dev_mutating` | Mặc định false; packet phải cho phép rõ |
| `production_mutating` | Luôn cần authorization riêng và hiện tại của Sơn |

`package.json` là nguồn command chuẩn. Root `AGENTS.md` giữ command matrix hiện hành. Test result chỉ hợp lệ khi được chạy mới trên tree được báo cáo; command chưa chạy phải ghi `NOT_VERIFIED`.

## 14. Cloud DEV và production boundary

Supabase Cloud DEV là database environment duy nhất được hỗ trợ cho development và validation. Nếu task cần Cloud DEV nhưng access không khả dụng hoặc không được authorize, Codex phải `BLOCKED`, không dùng Local DB hay database environment khác làm fallback. Supabase Cloud DEV và production là hai authorization boundary độc lập. Normal implementation packet không mặc định cho phép production database mutation, deployment hoặc destructive production operation.

Codex không in/commit secret. Generated types được review như mọi tracked change. Dependency production mới cần packet approval. Command thay đổi Cloud DEV hoặc production phải đúng target và đúng authorization class.

## 15. Implementation và delivery flow

1. Codex trả preflight status.
2. Nếu ready, tạo implementation branch từ `execution_base_sha`.
3. Lập checklist kỹ thuật nội bộ và dùng mandatory workflow/skill.
4. Behavior change thực hiện theo TDD, trừ approved exception hợp lệ.
5. Implement đúng scope và existing pattern; không refactor ngoài mục tiêu.
6. Chạy validation tương ứng với acceptance criteria và side-effect authorization.
7. Self-review toàn bộ diff, scope, secret, permission, migration và error handling liên quan.
8. Fetch base lần cuối để phát hiện drift mới.
9. Commit logic theo repository convention.
10. Push implementation branch; không tự tạo PR trừ khi packet cho phép.
11. Xác minh `remote_head_sha == head_sha`.
12. Trả [Completion Report](templates/completion-report.md).

## 16. Completion Report

Completion status:

- `COMPLETE`: work được commit, push và remote HEAD xác minh khớp local HEAD.
- `PARTIAL`: một phần scope hoặc verification chưa hoàn tất.
- `BLOCKED`: không thể tiến hành an toàn do blocker chưa giải quyết.
- `LOCAL_COMPLETE_PUSH_BLOCKED`: local commit hoàn tất nhưng remote delivery thất bại.

Report phải có immutable SHAs, important changes, từng acceptance criterion, command thực sự đã chạy, side-effect target, risk và review focus. Không được nói CI pass khi CI không tồn tại hoặc không quan sát được run.

## 17. GPT remote review

GPT không chỉ tin Completion Report. GPT fetch remote branch, xác minh immutable SHAs và review `execution_base_sha..head_sha` về correctness, scope, architecture, convention, tests, security, permission, migration, error handling, UX và deployment impact khi liên quan.

Canonical machine identifiers và user-facing labels:

- `MERGE`
- `MERGE_WITH_FOLLOW_UP` — “MERGE WITH FOLLOW-UP”
- `CHANGES_REQUIRED` — “CHANGES REQUIRED”
- `DO_NOT_MERGE` — “DO NOT MERGE”

`MERGE_WITH_FOLLOW_UP` không dùng cho correctness, security hoặc data-loss risk.

## 18. Fix Packet loop

Khi verdict là `CHANGES_REQUIRED`, GPT tạo [Fix Packet](templates/fix-packet.md) tham chiếu exact reviewed `head_sha`. Sơn gửi packet để authorize fix round.

Codex kiểm tra same branch và exact reviewed HEAD, chỉ sửa findings, validate phần liên quan, self-review delta, commit, push và gửi report bổ sung. Không tạo branch mới, không mở rộng scope và không redesign im lặng. Nếu original design sai, task quay lại Sơn và GPT.

## 19. Final merge authority

GPT chỉ đưa review recommendation. Codex không merge. Sơn quyết định merge, yêu cầu sửa thêm, hoãn, đóng branch, đổi phương án hoặc bỏ task.

## 20. Skill, plugin và MCP

- GPT ưu tiên mô tả required capability và risk; exact tool thường chỉ là hint.
- Codex tự chọn skill/plugin/MCP theo runtime, `AGENTS.md` và task.
- Process skill được dùng trước implementation skill khi runtime yêu cầu.
- Không gọi mọi tool trong mọi task và không lặp lại analysis GPT đã hoàn tất.
- Exact skill chỉ bắt buộc khi Sơn yêu cầu, repository policy yêu cầu hoặc approved workflow phụ thuộc vào nó.
- Missing optional tool không chặn task. Missing essential capability dẫn tới `BLOCKED` kèm safe resolution.
- Không tự cài plugin/dependency hoặc tác động external system ngoài authorization.

## 21. Maintenance và versioning

Workflow này mang version `v1.1`. Khi thay đổi rule bền vững:

1. Cập nhật canonical document và root `AGENTS.md` nếu rule ảnh hưởng Codex.
2. Cập nhật template liên quan trong cùng change.
3. Kiểm tra identifier, link và command matrix nhất quán.
4. Ghi version mới nếu decision boundary hoặc state machine thay đổi đáng kể.
5. Không ghi machine/session state vào tài liệu chuẩn.

## 22. Templates

- [Codex Implementation Packet](templates/implementation-packet.md)
- [Codex Completion Report](templates/completion-report.md)
- [Codex Fix Packet](templates/fix-packet.md)
