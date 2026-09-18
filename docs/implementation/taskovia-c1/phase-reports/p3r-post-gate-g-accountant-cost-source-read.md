# C1-P3R VQH Accountant Cost Source Read

```yaml
status: PRE_CLOUD_READY
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
  applied: false
gates:
  gate_g: COMPLETE
  gate_h: NOT_STARTED_NOT_AUTHORIZED
```
