# Codex Fix Packet

GPT dùng template này khi remote review trả `CHANGES_REQUIRED`. Fix Packet chỉ authorize sửa findings trên cùng implementation branch; nó không mở một task hoặc product design mới.

## YAML template

```yaml
task:
  original_task_id:
  fix_round:
  implementation_branch:

review:
  verdict: CHANGES_REQUIRED
  reviewed_head_sha:
  reviewed_by: GPT
  review_reference:

authorization:
  status: APPROVED_FOR_FIX
  approved_by: Son

scope:
  findings_only: true
  prohibited_scope_expansion: true

findings:
  - id:
    severity:
    path_or_symbol:
    evidence:
    impact:
    required_change:
    verification_required:

validation:
  required: []
  side_effect_authorization:
    workspace_mutating: false
    local_db_destructive: false
    cloud_dev_mutating: false
    production_mutating: false

delivery:
  same_branch: true
  push: true
  create_pr: false
  merge: false
  force_push: false

stop_conditions: []
```

## Rules

- Codex phải dùng đúng `implementation_branch`; không tạo branch mới cho fix round.
- `reviewed_head_sha` phải là exact remote HEAD GPT đã review. Nếu branch đã thay đổi ngoài expected fix flow, Codex dừng và báo blocker/drift.
- Findings chỉ authorize thay đổi cần thiết để xử lý finding và validation liên quan; không authorize unrelated refactor hoặc scope expansion.
- Codex self-review delta, commit và push lên cùng branch, rồi xác minh remote HEAD.
- Side-effect authorization không được suy rộng từ original packet nếu Fix Packet đặt lại thành `false`.
- Nếu finding chứng minh original design hoặc approved contract sai, Codex không redesign im lặng; task quay lại Sơn và GPT để ra quyết định mới.
