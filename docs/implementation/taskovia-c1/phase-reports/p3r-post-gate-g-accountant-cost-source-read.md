# C1-P3R VQH Accountant Cost Source Read

```yaml
status: PASS_VQH_ACCOUNTANT_COST_SOURCE_READ_CLOUD_VERIFIED
scope:
  role: accountant
  added_permission: cost.source.read
before:
  permissions:
    - accounting_document.read
    - accounting_document.update
    - cost.read
    - inventory_value.read
    - supplier.read
target:
  permissions:
    - accounting_document.read
    - accounting_document.update
    - cost.read
    - cost.source.read
    - inventory_value.read
    - supplier.read
operator:
  unchanged:
    - cost.correct
    - cost.manage
cloud:
  migration: 20260918034150_c1_vqh_accountant_cost_source_read
  applied: true
  parity_clean: true
accountant_user:
  authenticated: true
  project_cost_read: PASS
  cost_source_read: PASS
integrity:
  project_cost_items: 9
  project_cost_item_sources: 15
  business_data_delta: 0
snapshot_helper:
  classification: LOCAL_READ_ONLY_HELPER_BUG
  corrected: true
gates:
  gate_g: COMPLETE
  gate_h: NOT_STARTED_NOT_AUTHORIZED
```
