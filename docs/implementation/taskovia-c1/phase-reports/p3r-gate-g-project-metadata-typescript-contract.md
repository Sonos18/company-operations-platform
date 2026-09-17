# C1-P3R Gate G Project Metadata — TypeScript Read Contract

```yaml
status: PASS_GATE_G_PROJECT_METADATA_TYPESCRIPT_CONTRACT

database_metadata_enabler: CLOUD_VERIFIED

typescript_read_model:
  summary:
    projectId: required
    projectCode: required
    projectName: required
  breakdown:
    projectId: required
    projectCode: required
    projectName: required

security:
  permission: cost.read
  project_register_dependency: false
  cost_source_dependency: false
  rbac_changed: false

cloud:
  commands: 0

ui:
  implemented: false
  ready_to_resume: true
```

The server reads Project Cost rows, batches the distinct Project IDs into the
Cloud-verified metadata RPC, and fails closed on missing, duplicate, unexpected,
or malformed metadata. Empty Project Cost lists remain empty; a detail request
without a scoped Project Cost item returns `RESOURCE_NOT_FOUND`.

The HTTP repository uses the shared strict schemas, so clients receive metadata
in the existing Project Cost responses without a Project Register or source read.
