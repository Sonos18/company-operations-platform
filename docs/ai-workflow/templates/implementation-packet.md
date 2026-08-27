# Codex Implementation Packet

Template này chuyển một task đã được Sơn phê duyệt từ GPT sang Codex. Packet chỉ chứa quyết định và thông tin riêng của task; quy tắc repository-wide nằm tại [root `AGENTS.md`](../../../AGENTS.md) và [canonical workflow](../README.md).

## YAML template

```yaml
task:
  id:
  name:
  class: bounded | architectural

repository:
  remote:
  base_ref:
  analysis_base_sha:

approval:
  status: APPROVED
  approved_by: Son
  approval_reference:
  approved_scope_version:

goal:
current_state_summary:

approved_decisions: []
forbidden_changes: []

scope:
  in: []
  out: []
  allowed_refactors: []

source_anchors:
  paths_or_symbols: []
  assumptions: []

contracts:
  api:
  data:
  auth_permission_security:
  migration_rollout:

acceptance_criteria:
  - id:
    requirement:
    evidence_expected:

validation:
  required: []
  optional: []
  side_effect_authorization:
    workspace_mutating: false
    local_db_destructive: false
    cloud_dev_mutating: false
    production_mutating: false

required_capabilities: []
preferred_tools: []
runtime_mandated_workflows: []

delivery:
  branch_name:
  push: true
  create_pr: false
  merge: false
  force_push: false
  create_worktree: false

task_specific_stop_conditions: []
review_focus: []
known_risks: []

# Required only when task.class is architectural:
approved_design_ref:
approved_execution_plan_ref:
```

## Trường bắt buộc

- `task`, `repository`, `approval`, `goal`, `approved_decisions`, `scope`, `source_anchors`, `contracts`, `acceptance_criteria`, `validation`, `delivery` và `task_specific_stop_conditions`.
- `analysis_base_sha` phải là immutable remote commit GPT đã đọc.
- Mỗi acceptance criterion cần có ID, testable requirement và expected evidence.
- Contract không liên quan phải ghi rõ `none`, không để Codex tự đoán.
- Architectural task bắt buộc có `approved_design_ref` và `approved_execution_plan_ref`; thiếu một trong hai dẫn tới `BLOCKED`.

## Trường tùy chọn

- `current_state_summary`, `forbidden_changes`, `allowed_refactors`, `required_capabilities`, `preferred_tools`, `runtime_mandated_workflows`, `review_focus` và `known_risks` có thể ngắn hoặc rỗng khi không liên quan.
- `source_anchors` là bằng chứng/hướng dẫn điều tra, không phải lệnh cấm Codex đọc thêm source cần thiết.
- `branch_name` có thể theo convention repository nếu task không cần tên cố định.

## Approval

`approval.status: APPROVED` và việc Sơn gửi packet xác nhận product/design approval và authorization để Codex bắt đầu sau preflight. Codex không mở lại product discovery hoặc tạo product plan mới. Approval không tự động cho phép destructive, Cloud DEV hoặc production action; các quyền đó nằm trong `side_effect_authorization` và policy repository.

## Validation side effects

Phân loại từng command:

- `read_only`: không thay đổi tracked workspace hoặc external data.
- `workspace_mutating`: có thể cập nhật tracked/generated files; diff phải được review.
- `local_db_destructive`: reset/xóa/thay đổi destructive trên local database.
- `cloud_dev_mutating`: thay đổi shared Cloud DEV.
- `production_mutating`: thay đổi production hoặc deployment.

Giá trị `true` chỉ authorize đúng class trong scope và target đã mô tả; không authorize operation rộng hơn. Production mutation vẫn cần authorization riêng và hiện tại của Sơn tại thời điểm thực hiện.

## Không đưa vào packet

- Generic Git/safety rules đã có trong `AGENTS.md`.
- Full source dump hoặc toàn bộ discovery narrative.
- Machine path, credential, secret hoặc transient working-tree state.
- Model name, reasoning tier hoặc exact subagent routing.
- Danh sách mọi skill/plugin có thể dùng.
- Implementation detail như variable name hoặc helper layout, trừ khi đó là approved contract.
- Yêu cầu bỏ qua system/runtime instruction hoặc mandatory workflow.

GPT nên mô tả capability cần thiết thay vì hard-code model/subagent. Codex chịu trách nhiệm chọn runtime workflow phù hợp và báo `BLOCKED` nếu essential capability không khả dụng.
