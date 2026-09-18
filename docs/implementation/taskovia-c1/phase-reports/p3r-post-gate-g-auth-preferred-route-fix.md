# C1-P3R Auth Preferred Route Fix

```yaml
status: PASS_POST_GATE_G_AUTH_PREFERRED_ROUTE_FIX
root_causes:
  stale_cost_preferred_route_mapping:
    resolved: true
  login_form_bypassed_company_state_policy:
    resolved: true
access_states:
  no_company: /no-access
  multiple_companies_unselected: /select-company
preferred_routes:
  project.read: /projects
  cost.read: /costs
  cost.source.read: /costs/sources
  cost.read_plus_cost.source.read: /costs
  fallback_with_valid_company: /forbidden
connection_error_e2e_observation:
  original_transient_failures: 2
  isolated_reproduction: false
  normal_full_suite: 16/16_PASS
  repeated_full_suite: 48/48_PASS
  root_cause_established: false
  classification: UNREPRODUCED_E2E_FLAKE
  production_fix_applied: false
  fixture_workaround_applied: false
security:
  middleware_guards_changed: false
  route_permissions_changed: false
  authorization_bypass: false
cloud:
  commands: 0
database:
  changes: 0
rbac:
  changes: 0
gates:
  gate_g: COMPLETE
  gate_h: NOT_STARTED_NOT_AUTHORIZED
```
