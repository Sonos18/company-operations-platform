# C1-P3R Gate G Project Cost Summary Currency Contract

```yaml
status: PASS_GATE_G_PROJECT_COST_SUMMARY_CURRENCY_CONTRACT

finding:
  source: gate_g_ui_review
  problem: hardcoded_VND_would_break_multi_currency_correctness

contract:
  project_cost_summary:
    currencyCode: required

aggregation:
  currency_source: persisted_project_cost_items
  mixed_currency_same_project: INTERNAL_ERROR
  different_projects_different_currencies: allowed

database:
  changes: 0

cloud:
  commands: 0

ui:
  changes: 0
  gate_g_feature_branch_fix_pending: true
```

Summary currency is derived from the non-empty persisted Project Cost rows.
No VND default, company-setting lookup, or currency conversion is introduced.
