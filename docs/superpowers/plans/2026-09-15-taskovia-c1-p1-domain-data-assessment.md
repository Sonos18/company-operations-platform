# C1 Phase 1 — domain and data assessment

**Authority:** [active C1 plan](2026-09-13-taskovia-c1-v1.2-implementation.md). This assessment is repository evidence only; Cloud DEV was not accessed.

## Executive verdict

`SCHEMA_SUFFICIENCY: SUFFICIENT_WITH_MINIMAL_EXTENSION` for the approved two-Project boundary at the current source layer: `projects`, `business_parties`, `project_engagements`, source selections, and source figures already have tenant/company/project identifiers. Financial Actual/Paid/confirmed-obligation domain records are not implemented in the inspected C1 source slice, so their future representation needs a business-concept assessment rather than an Excel-shaped table.

`READY_FOR_PHASE_2` for a non-destructive correction map; destructive remapping remains blocked pending row-level ownership evidence.

## Current project model

| Item | Repository evidence | Assessment |
| --- | --- | --- |
| VQH | `companies`, tenant/company composite scope throughout C1 migrations | Company boundary is generalized and reusable. |
| Eo Gió | Real-data handoff documents and current `/costs` project grouping use project ID `7e7e3904-…874a` | Proven persisted Project in prior repository evidence. |
| Yong Mei | Current C1 handoff/source UI describes Yong Mei as a mapped party/contractor and engagement below Eo Gió | Not proven as an independent Project; conflicts with approved baseline. |
| Relationships | `project_engagements` references `projects` and `business_parties`; selections/figures store `project_id`, `engagement_id`, `party_id` and mapped equivalents | Existing generalized model can distinguish Project from Party, but current mapping can collapse Yong Mei into Eo Gió hierarchy. |

## Domain inventory

| Entity | Key columns | Current C1 use | Reusable |
| --- | --- | --- | --- |
| companies / tenants | `id`, `tenant_id`, `company_id` | VQH isolation | YES |
| projects | `id`, `tenant_id`, `company_id`, `code`, `name` | Source mapping and hierarchy | YES |
| business_parties | `id`, scope, `code`, `display_name`, `party_kind` | Contractor mapping | YES |
| project_engagements | scope, `project_id`, `party_id` | Current Eo Gió/Yong Mei link | PARTIAL |
| source_selections | scope, source version, mapped project/engagement/party, locator | Imported-source mapping/provenance | YES, internal only |
| source_reported_figures | scope, selection, project/engagement/party, decimal text, confirmation | Non-posting source figures | PARTIAL |
| source_review_issues | selection, issue/status | Source uncertainty | YES, internal evidence |
| accounting sources/versions | scope, source identity/version | Provenance | YES, not business UI |
| financial documents, cash, receivables/payables | no implemented C1 financial activation found | P3/P4 future boundary | GAP: assess business concepts, not Excel columns |

## Financial semantics and ownership

Current `source_reported_figures` exposes decimal strings, `value_state`, `confirmation`, `basis`, `scope_kind`, and mapping state. It is explicitly non-posting source evidence. No inspected code proves Actual revenue, Actual cost, paid cash, received cash, confirmed receivable, or confirmed payable. Therefore all such business meanings remain **Unknown** until normalized evidence exists.

Unsafe inference risks: source amount as business actual, cost as paid, null as zero, and source totals as project totals. No inspected source-read service calculates budget, forecast, or profit.

Ownership currently reaches figures through `project_id`/`engagement_id`/`party_id` with fallback selection mappings; source/version identity and locators are also carried. Workbook/sheet/range are preparation/provenance metadata, but current UI/API presents source-centric fields, making them an inappropriate business ownership proxy.

## Correction map

| Current item | Target | Action | Evidence / phase |
| --- | --- | --- | --- |
| Eo Gió Project | Independent VQH Eo Gió Project | KEEP | Existing project mapping; Phase 2 |
| Yong Mei Party/contractor | Preserve only if legitimate Party; create/use independent Yong Mei Project separately | NEEDS BUSINESS CONFIRMATION | Current party/engagement linkage; Phase 2 |
| Yong Mei-under-Eo-Gió engagement | Not Project identity | RETIRE from Project-identity role; preserve only valid contractual meaning | Phase 2 |
| Source figures mapped to Eo Gió | DB-backed project-owned financial facts only when semantic evidence supports it | REMAP / EXCLUDE / UNRESOLVED per row | Phases 2–4 |
| Copied Eo Gió content in Yong Mei source | Excluded until ownership proven | DUPLICATE_EXCLUDE | Source documents describe overlap risk; Phase 1–2 |
| Sheet/range/locator | Internal provenance only | KEEP internal; REMOVE from business UI | Phase 5 |
| Source reconciliation UI | Project Thu/Chi financial overview | RETIRE from Director workflow | Phase 5 |

## Yong Mei identity and duplicate risk

`YONG_MEI_IDENTITY: UNRESOLVED`. Repository evidence supports a current Party/contractor identity, but cannot establish whether it remains independently legitimate. Project Yong Mei must never be represented solely by that Party.

Known risk: source selections use workbook-originated locators and mappings; copied Eo Gió blocks in Yong Mei material must be classified `DUPLICATE_EXCLUDE` unless explicit business evidence establishes `YONG_MEI`. No row-level ownership was inferred.

## Category mapping

No canonical financial category mapping is implemented in the inspected C1 source slice. Workbook labels and source `label` fields are `UNRESOLVED`, not permanent categories. Future mapping must use an existing canonical category when business meaning is proven.

## API, UI, tests, and runtime coupling

Current read path is `source_reported_figures` -> source-read repository/service -> company-scoped `/costs` API -> `/costs` UI. It scopes company and project IDs, but groups source figures and displays raw/source, mapping, locator, scope, and review concepts. Future Project financial aggregation must be `company_id + project_id` DB-backed and remove source-reconciliation concepts from Director UI.

`vqh-workbook-family-adapter.ts`, `import-manifest.ts`, locator tests, and source UI fixtures encode workbook/sheet/range behavior. They are preparation/fixture evidence, not an approved runtime Excel dependency; future phases must retain only needed internal provenance and replace business-facing reconciliation assumptions.

## Unresolved business facts

| Question | Evidence needed | Phase 2 blocker |
| --- | --- | --- |
| Which Yong Mei party identity remains valid? | Approved business-party evidence | Yes for destructive remap |
| Which ambiguous figures belong to each Project? | Approved ownership/correction map | Yes for remap |
| Is any cost paid or revenue received? | Payment/cash evidence | No; keep Unknown |
| Are obligations confirmed? | Contract/obligation evidence | No; keep Unknown |
| What categories are canonical? | Business classification evidence | No; keep unresolved |

## Phase 2 readiness

`READY_FOR_PHASE_2` for assessment and correction-plan work only. Phase 2 must not remap/delete records until the Yong Mei Party and ambiguous row ownership evidence is supplied.
