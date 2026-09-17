# C1 P3R Gate F1 Pre-Cloud Regression Hardening

**Status:** PASS_GATE_F1_PRE_CLOUD_READY

## Assessment matrix

~~~yaml
A_multi_project_isolation:
  classification: BEHAVIOR_PRESENT_TEST_MISSING
  evidence: ProjectCostRepository groups project_cost_items by project_id and sorts summaries.
  change: Added mixed-order two-project isolation and ordering regression.
B_deterministic_projection:
  classification: BEHAVIOR_PRESENT_TEST_MISSING
  evidence: Repository scopes breakdowns by tenant/company/project and orders created_at then id.
  change: Multi-project ordering regression adds summary projection coverage.
C_unknown_arithmetic:
  classification: ALREADY_COVERED
  evidence: Existing repository test covers zero accepted count and excludes unknown from tracked total; shared schema rejects totals that include unknown.
  change: None.
D_source_independence:
  classification: BEHAVIOR_PRESENT_TEST_MISSING
  evidence: Repository client type and read implementation address only project_cost_items.
  change: Added one-query regression proving aggregation does not query source/provenance tables.
E_read_authorization:
  classification: BEHAVIOR_PRESENT_TEST_MISSING
  evidence: Service requires cost.read for summary and breakdown; create/update/correct are separately guarded.
  change: Added cost.manage-only and cost.correct-only read-denial cases.
F_same_row_concurrency:
  classification: ALREADY_COVERED
  evidence: Existing synthetic rollback fixture covers same-row transition, VERSION_CONFLICT, and no additive successor behavior.
  change: None.
G_business_only_api:
  classification: BEHAVIOR_PRESENT_TEST_MISSING
  evidence: Strict shared response schemas and HTTP repository already reject source mechanics.
  change: Expanded forbidden response metadata cases for sourceFigureIds, paidAmount, invoice, and reconciliation.
~~~

## Scope and result

~~~yaml
production_code_changed: false
migration_created: false
cloud_executed: false
gate_e: COMPLETE / unchanged
post_gate_e_rbac: COMPLETE / unchanged
gate_f:
  f1: PRE_CLOUD_READY
  f2: NOT_AUTHORIZED
  complete: false
gate_g: NOT_STARTED / NOT_AUTHORIZED
~~~

The synthetic Cloud fixture was not modified because its existing transaction-wrapped rollback proof already covers same-row versioning and source reuse. No real VQH data, schema, RBAC, or Cloud operation is included in F1.
