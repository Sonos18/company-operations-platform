# C1-P3R Gate G Project Metadata Read — Pre-Cloud

```yaml
status: PASS_GATE_G_PROJECT_METADATA_RPC_PRE_CLOUD_READY

gate_f: COMPLETE

gate_g:
  status: BLOCKED_PREFLIGHT
  blocker: PROJECT_COST_PROJECT_METADATA_CONTRACT
  backend_enabler: PRE_CLOUD_READY

security:
  permission: cost.read
  project_register_permission_added: false
  projects_rls_changed: false
  rbac_changed: false

cloud:
  applied: false
  queries: 0
  mutations: 0
```

The forward migration `20260917100209_c1_project_cost_project_metadata_read.sql`
adds a narrow `projectId`/`projectCode`/`projectName` projection. It resolves
the existing active Company and Cost-module context through `cost.read`, while
leaving direct Project Register reads under `project.register.manage`.

The static and rollback-safe synthetic contracts cover public-wrapper access,
private execute denial, unchanged direct Projects RLS, denied actors,
tenant/company filtering, and output minimization. This checkpoint changes no
application TypeScript contract and does not apply the migration to Cloud DEV.
