# C1 P3R Post-Gate-E RBAC Hardening Pre-Cloud

**Status:** PRE_CLOUD_READY / NOT_APPLIED

## Scope

Starting SHA: 820691ca3c9a0c7dccfa989b6a79d52cdb84ec36

Migration: 20260917090000_c1_vqh_project_cost_rbac_hardening.sql

This forward migration is limited to public.role_permissions. It fails closed if the canonical VQH role IDs, permission catalog, or exact pre-hardening permission sets differ. Cloud application is not authorized by this checkpoint.

## Intended permission delta

~~~yaml
before:
  accountant:
    - accounting_document.read
    - accounting_document.update
    - supplier.read
    - inventory_value.read
  c1_vqh_cost_operator:
    - project.register.manage
    - party.manage
    - engagement.manage
    - cost.source.read
    - cost.prepare
    - cost.correct
    - cost.config.manage
    - cost.manage
after:
  accountant:
    - accounting_document.read
    - accounting_document.update
    - supplier.read
    - inventory_value.read
    - cost.read
  c1_vqh_cost_operator:
    - cost.manage
    - cost.correct
~~~

The accountant role does not receive cost.manage or cost.correct. The dedicated operator does not receive cost.read. The accountant actor keeps both existing role assignments; this change alters capabilities, not actor topology.

## Safety

~~~yaml
cloud_applied: false
gate_e_data_changed: false
project_cost_items_changed: false
provenance_changed: false
receipts_changed: false
audit_events_changed: false
actor_assignments_changed: false
auth_changed: false
gate_e: COMPLETE
gate_f: NOT_STARTED / NOT_AUTHORIZED
~~~
