# Codex Completion Report

Codex dùng template này sau implementation hoặc fix round. GPT phải review remote diff trực tiếp; report cung cấp immutable handoff, evidence và risk, không thay thế code review.

## YAML template

```yaml
preflight:
  status: READY | READY_WITH_NON_MATERIAL_DRIFT | PACKET_STALE | BLOCKED
  summary:

status:
  value: COMPLETE | PARTIAL | BLOCKED | LOCAL_COMPLETE_PUSH_BLOCKED
  summary:

git:
  repository:
  base_ref:
  analysis_base_sha:
  remote_base_sha:
  execution_base_sha:
  implementation_branch:
  head_sha:
  remote_head_sha:
  push_verified:
  commits: []

changes:
  summary:
  important_files: []
  migrations_or_config: []
  out_of_scope_confirmation:

acceptance_criteria:
  - id:
    status: PASS | PARTIAL | FAIL | NOT_VERIFIED
    evidence:

validation:
  - command:
    side_effect_class:
    target:
    result:
    evidence:

risks:
  assumptions: []
  limitations: []
  deployment_impact:
  migration_or_rollback:
  remaining_risks: []

review_focus: []
```

## Reporting rules

- `analysis_base_sha`, `remote_base_sha`, `execution_base_sha`, `head_sha` và `remote_head_sha` phải là immutable SHAs, không chỉ là branch names.
- Chỉ dùng `COMPLETE` khi implementation branch đã push và remote query xác nhận `remote_head_sha == head_sha`.
- Nếu local commit hoàn tất nhưng push thất bại, dùng `LOCAL_COMPLETE_PUSH_BLOCKED` và cung cấp safe next step; không rewrite history hoặc force-push.
- Test/validation evidence phải đến từ fresh run trên reported tree. Command không chạy dùng `NOT_VERIFIED` hoặc được ghi rõ là không áp dụng.
- Nếu CI không tồn tại hoặc không quan sát được run, ghi `absent` hoặc `not observed`; không ghi pass.
- Chỉ tóm tắt important files vì GPT sẽ đọc remote diff đầy đủ.
- Mọi warning, flaky result, skipped check, known limitation và remaining risk phải được nêu rõ.
- Validation entry phải ghi side-effect class và target thực tế, đặc biệt với database hoặc external environment.
