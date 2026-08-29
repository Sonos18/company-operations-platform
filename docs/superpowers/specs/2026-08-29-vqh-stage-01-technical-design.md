# VQH Project Journey — Stage 01 Technical Specification

> **Stage:** 01 — Tiếp nhận & đánh giá cơ hội  
> **Sub-stages:** 01.1 Tiếp nhận yêu cầu; 01.2 Đánh giá cơ hội & quyết định tiếp tục  
> **Status:** APPROVED
> **Authority scope:** VQH Stage 01 only  
> **Implementation authorization:** NONE  
> **Original technical spec approved:** 2026-08-29
> **Analysis base:** `Sonos18/company-operations-platform@f314ed7a4ff1d86e45cc29075ab0213ec6421ca1`
> **Correction source:** `origin/docs/vqh-stage-01-technical-spec@34c9a896c0fae78c9069f54406ee943864bf0852`
> **Correction approved:** 2026-08-29
>
> **Business authorities**
>
> 1. `docs/vqh/project-journey/README.md`
> 2. `docs/vqh/project-journey/stages/01-opportunity-intake.md`
>
> **Technical authorities**
>
> - `AGENTS.md`
> - `docs/ai-workflow/README.md`
> - `docs/superpowers/specs/2026-08-14-backend-architecture-design.md`
> - `docs/superpowers/specs/2026-08-18-employee-management-rbac-design.md`

---

## 1. Purpose

Technical Spec này chuyển approved Stage 01 business behavior thành contract kỹ thuật cho:

- domain model;
- PostgreSQL schema;
- workflow runtime;
- transaction/command semantics;
- API contracts;
- RLS và RBAC;
- audit;
- concurrency;
- repository boundaries;
- validation;
- testing.

Technical Spec không thay đổi business behavior đã duyệt.

Correction này đóng các khoảng trống implementation-contract của bản Technical Spec đã duyệt mà không thay đổi product/business behavior: atomic Opportunity bootstrap, published definition selection, mutation/API coverage, database-enforced immutability, completion-event ordering, Supabase privilege hardening, Phase A operational boundary, và business-to-technical traceability.

Authority chain:

```text
VQH Project Journey Canonical Reference
                    ↓
Approved Stage 01 Business Design
                    ↓
THIS TECHNICAL SPEC
                    ↓
Corrected Execution Plan
                    ↓
Implementation Packet
                    ↓
Codex implementation
```

---

# 2. Core architectural decision

## 2.1 Chosen approach

Stage 01 dùng:

```text
Reusable minimal Workflow Core
            +
Stage 01 Opportunity Domain
            +
Stage 01 Evaluation / Decision Domain
```

Không chọn hai cực sau:

### Rejected — full generic workflow engine first

Không xây toàn bộ engine cho Stage 01–11 trước khi Stage 02–11 được business-design.

Lý do:

- hierarchy mechanics vẫn chưa được approve;
- requirements của Stage 02–11 chưa tồn tại;
- dễ over-engineer;
- dễ biến giả định kỹ thuật thành business rule.

### Rejected — Stage 01 standalone workflow

Không hard-code một engine riêng chỉ cho Stage 01.

Lý do:

- blocker;
- Start / Complete;
- dependency;
- assignment;
- reopen;
- revalidation;
- audit

đều là shared VQH Journey semantics.

### Selected — thin reusable core + Stage 01 domain

Workflow Core chỉ implement những primitive Stage 01 thực sự cần và đã được canonical xác nhận.

```text
Workflow Core
├── node definition binding
├── node execution
├── dependencies
├── assignments
├── explicit Start
├── explicit Complete
├── blocker
├── effective state
├── reopen
├── needsRevalidation
└── audit/event history

Stage 01 Domain
├── Opportunity
├── Customer context
├── Contacts
├── Scopes
├── Referrer
├── Intake Records
├── Duplicate concerns
├── 01.1 completion baseline
├── Evaluation criteria
├── Recommendation history
├── Clarification history
├── Final Decision
└── Reactivation / decision cycles
```

---

# 3. Non-negotiable business invariants

Implementation MUST preserve:

```text
one real need
→ one canonical Opportunity

Primary Contact
!= Primary Customer by default

Referrer
!= Primary Contact by default

current Opportunity data
!= historical Intake Records
!= immutable 01.1 completion baseline

required information missing
!= automatically blocked

file missing in 01.1
!= blocker

unverified information
!= automatically invalid

invalid Opportunity
!= not_proceeding

criterion evaluated
!= criterion passed

unfavorable criterion
!= automatic not_proceeding

Overall Recommendation
!= Final Decision

Final Decision
!= workflow Complete

return for clarification
!= Final Decision

not_proceeding
!= delete Opportunity

reactivation
!= overwrite old cycle

proceed
!= automatically create Project

proceed
!= automatically start Stage 02
```

---

# 4. Scope

## 4.1 In scope

Technical Spec covers the complete **Phase A Stage 01 runtime foundation**:

```text
Create Opportunity
        ↓
Assign Intake Owner
        ↓
Start 01.1
        ↓
Collect / normalize intake
        ↓
Complete 01.1
        ↓
Immutable intake baseline
        ↓
01.2 becomes dependency-ready
        ↓
Assign Evaluation Owner
        ↓
Start 01.2
        ↓
Evaluate criteria
        ↓
Recommendation
        ↓
Decision review
   ↙ clarification
   ↘ Final Decision
        ↓
Complete 01.2
```

Also included:

- blockers;
- duplicates;
- invalidation/restore;
- corrections;
- reopen;
- revalidation;
- reactivation;
- immutable decision cycles.

Phase A proves the generic runtime and contracts. It is not an operational production Stage 01 release until the required company definition, taxonomies, evaluation configuration, authority resolution, and role mappings have passed their Business Decision Gates and have been published through an authorized follow-up.

## 4.2 Explicitly out of scope

This Technical Spec MUST NOT decide:

- Stage 02 start conditions;
- automatic creation of Project after `proceed`;
- Project Manager assignment;
- Stage 02–11 detailed definitions;
- complete Project Journey amendment UI;
- complete template migration UI;
- generic requirement engine features that Stage 01 does not use;
- generic parent Stage runtime semantics;
- UI visual layout.

## 4.3 Phase A operational boundary

Phase A creates the schema, commands, API contracts, repositories, and verification needed to run Stage 01 once a complete company definition is published. Phase A MUST NOT seed a concrete VQH definition or silently fill any value governed by `BDG-TAX-01`, `BDG-EVAL-01`, `BDG-AUTH-01`, or `BDG-HIER-01`.

Consequently:

```text
no complete published company definition
→ Create Opportunity returns STAGE01_DEFINITION_CONFIG_UNAVAILABLE
→ no Opportunity or workflow row is committed
```

A published row whose schema or required content is invalid returns `STAGE01_DEFINITION_CONFIG_INVALID`; bootstrap MUST NOT fall back silently to an older definition version.

Synthetic complete definitions are permitted only inside local automated tests. They MUST NOT be placed in production migration seeds or treated as approved VQH business configuration.

---

# 5. Opportunity is the Stage 01 aggregate root

Stage 01 MUST NOT require an existing `Project` database record.

Primary aggregate:

```text
Opportunity
```

An Opportunity exists before VQH has necessarily:

- verified Customer master;
- Project Manager;
- detailed brief;
- final address;
- budget;
- formal project commitment.

## 5.1 Atomic Opportunity/workflow bootstrap

Logical command:

```text
createStage01Opportunity()
```

Database RPC:

```text
public.create_stage01_opportunity(...)
```

The command executes in one PostgreSQL transaction:

```text
authenticate actor
        ↓
resolve active tenant/company membership
        ↓
require opportunity.create
        ↓
select highest template_version for
(company_id, workflow_key = 'vqh.stage01')
        ↓
validate definition schema and required content
        ↓
create Opportunity
        ↓
create Workflow Instance bound to the definition snapshot
        ↓
create exactly Node Instances 01.1 and 01.2
        ↓
create execution #1 for each node
        ↓
create Decision Cycle #1 bound 1:1 to execution 01.2 #1
        ↓
append bootstrap workflow events and audit event
        ↓
commit
```

Required snapshot content includes the two authoritative node definitions, the explicit `01.1 → 01.2` dependency, approved five-dimension framework, completion/gate semantics, taxonomy configuration, criterion configuration, N/A allowance, and capability references. Missing required content is invalid configuration rather than an empty/default configuration.

Failure at any step rolls back every write. The command MUST NOT leave an Opportunity without its workflow, node executions, or first Decision Cycle. It MUST NOT create a parent Stage 01 runtime, Project, Stage 02 runtime, or Project Manager assignment.

On success, the command returns the Opportunity ID, Workflow Instance ID, both Node Instance/execution IDs, Decision Cycle #1 ID, and their initial optimistic versions.

Therefore:

```text
Opportunity ID
!= Project ID
```

This spec MUST NOT overload the existing `ProjectRepository` to represent Opportunity.

Future Stage design may establish:

```text
Opportunity
        ↓
Project
```

but this transition is intentionally not defined here.

---

# 6. Workflow runtime representation

## 6.1 Canonical API states

API exposes exactly the confirmed states:

```text
locked
ready
active
blocked
completed
not_applicable
```

## 6.2 Persisted implementation state

Database does not persist `blocked`, `ready`, or `locked` as independently mutable states.

Persist:

```text
workflow_internal_phase =
    not_started
    active
    completed
    not_applicable
```

Then derive:

```text
phase = not_started
+ dependency unsatisfied
→ locked

phase = not_started
+ dependencies satisfied
→ ready

phase = active
+ open blocking blocker
→ blocked

phase = active
+ no blocking blocker
→ active

phase = completed
→ completed

phase = not_applicable
→ not_applicable
```

This prevents state drift and enforces:

```text
Actor does not "mark node blocked".
Actor creates/resolves Blocker.
Engine derives blocked.
```

## 6.3 Current validity

Validity remains independent:

```ts
{
  state: 'completed',
  needsRevalidation: true
}
```

is valid technical representation.

A historical completion is not erased merely because its current validity changed.

---

# 7. Node execution generations

A stable workflow node and one execution of that node are separate.

```text
Workflow Node
    │
    ├── Execution #1
    │      completed
    │
    └── Execution #2
           ready / active / completed
```

This is required mainly for Stage 01 reactivation.

Example:

```text
01.2 execution #1
→ not_proceeding
→ completed

later Reactivation

01.2 execution #2
→ ready
→ explicit Start
→ new Decision Cycle
```

Old executions are never overwritten.

Generic reopen does NOT automatically create another execution. A normal reopen can transition the current completed execution back to `active` with an audit event.

A new execution is created only by a business operation that explicitly represents another business cycle, currently Stage 01 Reactivation.

---

# 8. Parent Stage hierarchy boundary

The approved business design does not yet answer whether:

```text
Stage 01
```

is itself a runtime node or only hierarchy/grouping around `01.1` and `01.2`.

Therefore this Technical Spec MUST NOT invent:

- parent completion;
- child-to-parent state propagation;
- child blocker → parent blocker;
- parent Start;
- parent N/A inheritance;
- child reopen → parent state change.

For this Technical Spec:

```text
01
= definition/hierarchy identity

01.1
= authoritative runtime node

01.2
= authoritative runtime node
```

No canonical persisted runtime state for parent `01` is introduced until Business Decision Gate `BDG-HIER-01` is approved.

UI may display Stage 01 as a grouping, but MUST NOT present a derived parent state as canonical business state.

---

# 9. Database conventions

All new tables MUST follow existing Taskovia conventions:

- UUID primary keys unless append-only sequence is materially more suitable;
- `tenant_id`;
- `company_id`;
- composite same-company foreign keys where applicable;
- `timestamptz`;
- RLS enabled;
- explicit grants;
- no direct unauthenticated access;
- immutable/history records not physically deleted through application routes;
- every Stage 01 business mutation through a controlled RPC/transaction boundary;
- audit events include `request_id`.

---

# 10. Core workflow tables

## 10.1 `workflow_instances`

Purpose: one workflow execution context for one Opportunity.

Core fields:

| Field | Type |
| --- | --- |
| `id` | uuid PK |
| `tenant_id` | uuid |
| `company_id` | uuid |
| `subject_type` | text |
| `subject_id` | uuid |
| `definition_snapshot_id` | uuid |
| `created_by` | uuid |
| `created_at` | timestamptz |

For Stage 01:

```text
subject_type = opportunity
subject_id   = opportunities.id
```

Unique:

```text
(company_id, subject_type, subject_id)
```

## 10.2 `workflow_definition_snapshots`

Immutable published definition used by the workflow instance.

Fields:

| Field | Type |
| --- | --- |
| `id` | uuid PK |
| `tenant_id` | uuid |
| `company_id` | uuid |
| `workflow_key` | text |
| `template_version` | integer |
| `schema_version` | integer |
| `definition` | jsonb |
| `definition_hash` | text |
| `created_at` | timestamptz |

No application UPDATE or DELETE.

Unique:

```text
(company_id, workflow_key, template_version)
```

In Phase A, inserting a complete immutable row is the publication operation. There is no application-facing draft/activation UI or configuration mutation API. Only an authorized migration or later approved configuration-release mechanism may publish a production definition.

Opportunity bootstrap selects the highest `template_version` for the target company and `workflow_key = 'vqh.stage01'`. If no row exists, bootstrap fails with `STAGE01_DEFINITION_CONFIG_UNAVAILABLE`. If the selected newest row fails schema/content validation, bootstrap fails with `STAGE01_DEFINITION_CONFIG_INVALID` and MUST NOT fall back to an older version.

The snapshot contains enough Stage 01 definition to reconstruct:

- node identity;
- hierarchy;
- dependency;
- completion rules;
- assignment rules;
- authority capability references;
- taxonomy values;
- evaluation framework;
- criterion configuration;
- N/A allowance;
- gate semantics.

The selected definition snapshot is bound to `workflow_instances.definition_snapshot_id` during bootstrap. The runtime MUST NOT query the latest company configuration to reinterpret an existing workflow.

```text
snapshot at creation
!= latest VQH configuration
```

"Snapshot at creation" means selected and bound atomically when the Opportunity workflow is created; it does not require duplicating an identical immutable definition row for every Opportunity.

## 10.3 `workflow_node_instances`

Stable binding of a snapshot node to the workflow instance.

Fields include:

```text
id
tenant_id
company_id
workflow_instance_id
node_key
node_type
parent_node_key
created_at
```

Stage 01 runtime nodes:

```text
01.1
01.2
```

Unique:

```text
(workflow_instance_id, node_key)
```

## 10.4 `workflow_node_executions`

Current and historical execution generation.

Fields:

```text
id
tenant_id
company_id
node_instance_id
execution_no
phase
needs_revalidation
started_by
started_at
completed_by
completed_at
superseded_at
version
created_at
```

`phase`:

```text
not_started
active
completed
not_applicable
```

One non-superseded execution per node.

Unique:

```text
(node_instance_id, execution_no)
```

Partial unique:

```text
one execution where superseded_at IS NULL
```

`version bigint` is used for optimistic concurrency.

## 10.5 `workflow_node_events`

Append-only workflow history.

Event examples:

```text
started
completed
reopened
marked_not_applicable
restored_applicability
revalidation_required
revalidated
execution_superseded
execution_created
```

Fields:

```text
id bigint
tenant_id
company_id
node_execution_id
event_type
actor_id
reason
payload jsonb
request_id
created_at
```

No application UPDATE or DELETE.

## 10.6 `workflow_node_assignments`

Runtime people assignment.

Fields:

```text
id
tenant_id
company_id
node_execution_id
assignment_kind
assignee_user_id
assigned_by
assigned_at
assignment_reason
ended_by
ended_at
end_reason
```

Initial Stage 01 assignment kinds:

```text
accountable_owner
contributor
```

Meaning:

```text
01.1 accountable_owner
= Intake Owner

01.2 accountable_owner
= Evaluation Owner
```

One active `accountable_owner` per execution.

Contributor is many-to-one.

Owner does not automatically grant:

- edit;
- start;
- complete;
- decision;
- blocker resolution.

Those remain RBAC/authority checks.

## 10.7 `workflow_blockers`

Fields:

```text
id
tenant_id
company_id
node_execution_id
effect
category_code
description
raised_by
raised_at
responsible_user_id
resolved_by
resolved_at
resolution
version
```

`effect`:

```text
blocking
non_blocking
```

Open:

```text
resolved_at IS NULL
```

Only:

```text
open + blocking
```

causes effective node state `blocked`.

---

# 11. Stage 01 Opportunity schema

## 11.1 `opportunities`

Fields:

```text
id uuid PK

tenant_id
company_id

validity_state
canonical_opportunity_id

primary_customer_name
customer_type_code

need_description

location_status
location_text

primary_lead_source_code
engagement_status_code

budget_status_code
budget_min
budget_max
currency_code
budget_note

timeline_status_code
timeline_start_date
timeline_end_date
timeline_note

priority_code

version bigint

created_by
created_at
updated_at
```

`validity_state`:

```text
valid
invalid
```

`location_status`:

```text
unknown
area_known
relative
exact
```

No field named:

```text
received_at
```

is introduced.

The official initial system intake time remains:

```text
opportunities.created_at
```

unless future approved business amendment changes that decision.

`canonical_opportunity_id` is normally null.

For a duplicate merged/linked to another canonical Opportunity:

```text
duplicate Opportunity
→ validity_state = invalid
→ canonical_opportunity_id = canonical Opportunity
```

No data is hard-deleted.

---

# 12. Configurable Stage 01 taxonomies

Exact business values remain configurable rather than TypeScript/PostgreSQL global enums.

## `stage01_taxonomy_values`

Fields:

```text
id
tenant_id
company_id
taxonomy_key
code
label
semantic_key
behavior jsonb
is_active
created_at
updated_at
```

Supported taxonomy keys include:

```text
customer_type
contact_relationship
scope
lead_source
referrer_type
engagement_status
invalid_reason
budget_status
timeline_status
priority
intake_channel
blocker_category
```

Example technical behavior:

```json
{
  "requiresReferrer": true
}
```

may be attached to a configured Lead Source.

The exact Lead Source code does not need to literally equal `"referral"`.

Runtime gates operate on semantic behavior:

```text
lead source behavior requiresReferrer
→ exactly one active Primary Referrer required
```

instead of hard-coding a source label.

Existing workflow instances use the taxonomy configuration captured in their immutable snapshot.

---

# 13. Contacts

Where Sections 13–15 use `reliability_state`, the field is data-quality metadata. `unverified`, `confirmed`, or `disputed` does not by itself create a Blocker, invalidate the Opportunity, or pass/fail a gate. Each gate evaluates the approved business property independently.

## 13.1 `contacts`

```text
id
tenant_id
company_id
display_name
notes
version
created_by
created_at
updated_at
```

Contact is independent from Customer.

## 13.2 `contact_methods`

```text
id
tenant_id
company_id
contact_id
method_type
value
is_usable
reliability_state
created_at
updated_at
```

`method_type` initially supports:

```text
phone
email
other
```

`reliability_state` is nullable:

```text
unverified
confirmed
disputed
```

For Contact Method, the approved gate means at least one method row with `is_usable = true`; reliability metadata does not replace that check. Phase A does not define a separate Contact Method lifecycle state, so the contract MUST NOT use an undefined `active` flag for this gate.

01.1 requires at least one usable method.

It does not require both phone and email.

## 13.3 `opportunity_contacts`

Fields:

```text
id
tenant_id
company_id
opportunity_id
contact_id
relationship_code
is_primary
reliability_state
created_by
created_at
ended_by
ended_at
end_reason
```

At most one active Primary Contact exists per Opportunity:

```text
unique opportunity_id
where is_primary = true
  and ended_at is null
```

01.1 completion requires exactly one such active Primary Contact relationship.

Changing Primary Contact:

```text
end old relationship
+
insert new relationship
+
audit
```

Do not rewrite the old relationship row into the new person.

---

# 14. Opportunity scopes

## `opportunity_scopes`

```text
id
tenant_id
company_id
opportunity_id
scope_code
note
reliability_state
created_by
created_at
retired_by
retired_at
retire_reason
```

At least one active scope is required to complete 01.1.

Multiple active scopes are allowed.

---

# 15. Referrer

## `opportunity_referrers`

```text
id
tenant_id
company_id
opportunity_id
referrer_type_code
display_name
contact_id nullable
note
reliability_state
is_primary
created_by
created_at
ended_by
ended_at
end_reason
```

At most one active Primary Referrer exists per Opportunity:

```text
unique opportunity_id
where is_primary = true
  and ended_at is null
```

When the configured Lead Source behavior requires a Referrer, 01.1 completion requires exactly one active Primary Referrer. Changing Primary Referrer ends the old row and inserts a new row in the same audited command; it never rewrites the old row into the new Referrer.

A Referrer:

```text
may reference Contact
but does not have to

Referrer
!= Primary Contact
```

---

# 16. Intake Records

## `opportunity_intake_records`

Append-only after creation.

Fields:

```text
id
tenant_id
company_id
opportunity_id
channel_code
summary
correction_of_record_id
correction_reason
created_by
created_at
```

At least one record is required for 01.1 completion.

Normal records:

```text
correction_of_record_id = null
```

Correction:

```text
new Intake Record
→ references old Intake Record
→ records correction reason
```

Existing Intake Record contents MUST NOT be silently overwritten.

Attachments are optional and do not affect 01.1 gate.

---

# 17. Duplicate concerns

## `opportunity_duplicate_concerns`

Fields:

```text
id
tenant_id
company_id
opportunity_id
suspected_duplicate_opportunity_id nullable
description
raised_by
raised_at

resolution
canonical_opportunity_id
resolution_note
resolved_by
resolved_at
```

`resolution`:

```text
same_need
different_need
```

Completion rule:

```text
any unresolved duplicate concern
→ 01.1 not completable
```

When `same_need`:

- one canonical Opportunity must be identified;
- duplicate record remains;
- duplicate history remains;
- noncanonical record may be invalidated using the approved duplicate-merged semantic;
- no automatic destructive merge.

---

# 18. 01.1 immutable completion baseline

## `stage01_intake_completion_baselines`

Fields:

```text
id
tenant_id
company_id
opportunity_id
node_execution_id
completion_event_id
baseline_version
snapshot jsonb
snapshot_hash
created_by
created_at
```

Append-only.

Unique:

```text
(node_execution_id, baseline_version)
(completion_event_id)
```

`completion_event_id` is required and establishes a one-to-one link from each baseline to the event that completed its execution.

An insertion guard verifies that the referenced event:

- is a `completed` event;
- belongs to the same `node_execution_id`, tenant, and company as the baseline;
- carries the preallocated baseline ID in its payload.

Database guards reject application `UPDATE` and `DELETE`. A baseline correction requires controlled reopen/revalidation and a new completion event/baseline version; it never edits the prior baseline.

The snapshot contains only information necessary to reconstruct why completion was valid:

```text
Primary Customer identity/context
Primary Contact relationship
usable Contact Method refs
active Scope refs
need description
Location status/value
Lead Source
conditional Referrer
engagement status
Intake Record IDs
Intake Owner assignment
duplicate-gate result
blocker-gate result
completion actor/time
```

Do not duplicate unrelated Opportunity fields.

Current Opportunity data may continue changing after completion.

---

# 19. 01.1 Start command

Logical command:

```text
startStage01Intake()
```

Atomic preconditions:

```text
Opportunity exists
AND validity_state = valid
AND current 01.1 execution effective state = ready
AND active Intake Owner exists
AND actor has journey.node.start
```

On success:

```text
execution.phase:
not_started → active

started_by = actor
started_at = now
version += 1

insert workflow_node_event
insert audit_event
```

Data such as Contact, Scope, Location or Lead Source is NOT required to Start.

---

# 20. 01.1 Complete command

Logical command:

```text
completeStage01Intake()
```

All checks occur again inside the same database transaction.

Required:

```text
Opportunity valid
Intake Owner assigned
Primary Customer identifiable
Customer Type present
Primary Contact present
Primary Contact relationship present
>= 1 usable Contact Method
>= 1 active Scope
meaningful need_description
Location status present
Primary Lead Source present
engagement status present
>= 1 Intake Record
no open blocking Blocker
no unresolved duplicate concern
conditional Referrer satisfied
actor has Completion Authority
execution currently active
```

Explicitly NOT required:

```text
budget
exact timeline
priority
files
fully verified Customer master
all values verified
Project Manager
second-person approval
```

Success transaction:

```text
lock Opportunity and current 01.1 execution
        ↓
verify expected versions and evaluate all gates
        ↓
phase active → completed
        ↓
increment execution version
        ↓
preallocated baseline UUID is included in completion-event payload
        ↓
insert completion event and capture completion_event_id
        ↓
insert immutable intake baseline using that completion_event_id
        ↓
insert audit event referencing both event and baseline
```

All steps occur in one transaction. The baseline MUST NOT be inserted before its referenced completion event exists. Any error rolls back the phase transition, event, baseline, and audit together.

01.2 readiness is derived from dependency evaluation.

No explicit `"unlock 01.2"` boolean is stored.

---

# 21. Stage 01 dependency

Snapshot contains exactly:

```text
01.1 --completed/current-valid--> 01.2
```

Dependency is satisfied only when current upstream execution is:

```text
phase = completed
AND needs_revalidation = false
```

`active` does not satisfy.

`blocked` does not satisfy.

`not_applicable` does not satisfy this edge because 01.1 is always applicable for a valid Opportunity.

---

# 22. Stage 01 Evaluation Framework

The immutable workflow definition contains the approved five dimensions:

```text
customer_need
scope_capability
resources_schedule
commercial_viability
risk_special_conditions
```

Exact individual criteria are configuration, not hard-coded application enums.

Each criterion definition contains:

```text
key
dimensionKey
label
description
criticality
applicabilityMode
allowsNotApplicable
displayOrder
```

`criticality`:

```text
required
optional
conditional
```

Initial supported applicability modes:

```text
always
manual
```

No general rules/expression engine is introduced in v1.

A future automated conditional-rule DSL requires separate technical approval.

---

# 23. Decision Cycle

## `stage01_decision_cycles`

Fields:

```text
id
tenant_id
company_id
opportunity_id
node_execution_id
cycle_no

decision_authority_user_id
authority_resolution_reference

reactivation_reason

final_outcome
final_decision_by
final_decision_at
final_rationale
final_recommendation_id
override_rationale

version

created_by
created_at
```

Unique:

```text
(opportunity_id, cycle_no)
(node_execution_id)
```

Opportunity bootstrap creates `cycle_no = 1` in the same transaction as execution `01.2 #1`. The cycle exists before 01.2 starts so every 01.2 execution has exactly one stable decision-cycle identity. Reactivation preserves the same rule by creating execution `N+1` and cycle `N+1` atomically.

`final_outcome`:

```text
proceed
not_proceeding
```

nullable until Final Decision.

A draft/in-progress cycle has zero Final Decisions. A cycle that has reached Final Decision has exactly one immutable Final Decision.

Database constraints and a guard trigger enforce:

```text
final_outcome IS NULL
→ final_decision_by, final_decision_at, final_rationale,
  final_recommendation_id and override_rationale are NULL

final_outcome IS NOT NULL
→ final_decision_by, final_decision_at,
  final_recommendation_id and a meaningful final_rationale are NOT NULL
→ final_decision_by = decision_authority_user_id

outcome differs from referenced Recommendation
→ override_rationale is NOT NULL and meaningful

outcome matches referenced Recommendation
→ override_rationale IS NULL
```

The guard rejects any later change to a populated `final_*` field, `override_rationale`, `decision_authority_user_id`, or `authority_resolution_reference`, and rejects deletion of a Decision Cycle. It also verifies that `final_recommendation_id` belongs to the same `decision_cycle_id`; a Recommendation from another cycle is never a valid reference.

---

# 24. Criterion evaluations

## `stage01_criterion_evaluations`

Append-only versions.

Unique:

```text
(decision_cycle_id, criterion_key, revision)
```

Fields:

```text
id
tenant_id
company_id
decision_cycle_id
criterion_key
revision

applicability
result
rationale
evidence jsonb

evaluated_by
evaluated_at
```

`applicability`:

```text
applicable
not_applicable
```

`result` when applicable:

```text
fit
concern
not_fit
insufficient_information
```

N/A is represented by applicability, not mixed into result.

Database constraints and the controlled command enforce:

```text
applicability = applicable
→ result is one supported applicable result
→ meaningful rationale and/or evidence exists

applicability = not_applicable
→ result IS NULL
→ criterion definition permits N/A
→ meaningful rationale and/or evidence exists
```

The current evaluation for a criterion is the highest `revision` within that Decision Cycle. Gate evaluation and Recommendation submission use only this current revision set; inserting a later criterion revision makes every earlier Recommendation non-current until a new Recommendation is submitted.

A criterion with:

```text
result = insufficient_information
```

does NOT satisfy a required gate.

Gate-satisfying applicable result:

```text
fit
concern
not_fit
```

This preserves:

```text
evaluated != passed
```

and allows Decision Authority to accept known risk.

For `not_applicable`:

- criterion definition must allow N/A;
- reason/evidence is required;
- action is audited.

---

# 25. Recommendation

## `stage01_recommendations`

Append-only.

Unique:

```text
(decision_cycle_id, version)
```

Fields:

```text
id
tenant_id
company_id
decision_cycle_id
version
recommendation
rationale
evidence jsonb
submitted_by
submitted_at
```

Recommendation values:

```text
recommend_proceed
recommend_not_proceeding
```

Submission requires evaluation to be sufficient.

Existing Recommendation versions are never overwritten.

Current Recommendation:

```text
latest version
AND no later criterion evaluation revision exists
AND no later clarification return exists
```

---

# 26. Clarification return

## `stage01_clarification_returns`

Append-only.

Fields:

```text
id
tenant_id
company_id
decision_cycle_id
recommendation_id
reason
returned_by
returned_at
```

Only the authorized clarification-return capability may create the record.

After clarification:

```text
last clarification time
>
last recommendation time
```

means there is no current decision-ready Recommendation.

A new Recommendation must be submitted after clarification.

An insertion guard verifies that `recommendation_id` belongs to the same `decision_cycle_id`; a Clarification Return cannot reference a Recommendation from another cycle.

Clarification:

- does not end the cycle;
- does not create another Opportunity;
- does not create a new decision cycle;
- does not create `not_proceeding`.

## 26.1 Database-enforced history immutability

The following tables are append-only from every application role and command path:

```text
workflow_definition_snapshots
workflow_node_events
opportunity_intake_records
stage01_intake_completion_baselines
stage01_criterion_evaluations
stage01_recommendations
stage01_clarification_returns
```

RLS/grants deny normal mutation and database guard triggers reject `UPDATE` or `DELETE`, including accidental writes from a future privileged function. Correction creates a new history row with an explicit reference/revision; it never edits or removes the original evidence.

Lifecycle relationship tables such as Opportunity Contacts, Scopes, Referrers, Assignments, Blockers, and duplicate concerns are not rewritten into a different historical fact. Controlled commands may only populate their approved resolution/end/retirement fields and append audit history.

---

# 27. Final Decision command

Logical command:

```text
recordStage01FinalDecision()
```

Preconditions:

```text
01.2 active
Opportunity valid
all required applicable criteria gate-satisfied
latest valid Recommendation exists
no outstanding clarification after that Recommendation
Decision Authority resolved
actor == resolved Decision Authority
final decision not already recorded
```

Input:

```text
outcome
rationale
expectedCycleVersion
```

When outcome differs from Recommendation:

```text
override_rationale
```

is mandatory.

Example:

```text
recommend_proceed
+
Final Decision not_proceeding
+
override rationale
→ valid
```

No score or criterion result automatically writes Final Decision.

Final Decision is immutable under this Technical Spec.

A future requirement to correct an already-recorded Final Decision requires an approved business rule; implementation MUST NOT silently overwrite it.

---

# 28. 01.2 Complete command

Preconditions:

```text
01.2 active
all required applicable criteria satisfied
current Recommendation exists
Final Decision exists
no open blocking Blocker
01.1 dependency remains currently valid
01.2 needsRevalidation = false
actor has journey.node.complete
```

Success:

```text
phase active → completed
completion event
audit
```

Final Decision itself MUST NOT invoke this command automatically.

---

# 29. `proceed` downstream boundary

After:

```text
Final Decision = proceed
+
01.2 completed
```

the Stage 01 technical output is:

```text
valid Opportunity
+
completed Stage 01 child runtime
+
immutable intake baseline(s)
+
complete decision cycle history
+
canonical final outcome
```

This Technical Spec MUST NOT:

```text
INSERT Project automatically
assign Project Manager automatically
start Stage 02 automatically
complete parent Stage automatically
```

Those behaviors require downstream approved business design.

---

# 30. Invalid Opportunity

Controlled command:

```text
invalidateOpportunity()
```

Requires:

- `opportunity.invalidate`;
- approved structured reason;
- optional note;
- expected version;
- valid current Opportunity.

Effects:

```text
validity_state → invalid
audit
retain all Journey history
prevent new progression/actions requiring valid Opportunity
```

Restore:

```text
restoreOpportunity()
```

requires separate `opportunity.restore` permission.

Invalidate/restore history is reconstructable through append-only audit.

`duplicate_merged` restoration MUST NOT be allowed without explicit separation/correction evidence.

---

# 31. Reopen and revalidation

## 31.1 Reopen

Command:

```text
reopenNode()
```

requires:

- completed current execution;
- `journey.node.reopen`;
- reason;
- expected version.

Effects:

```text
completed → active
retain previous completion event
insert reopen event
propagate needsRevalidation to dependency descendants
```

No downstream historical completion is rolled back.

## 31.2 Revalidation

Command:

```text
revalidateNode()
```

requires:

- node marked `needsRevalidation`;
- `journey.node.revalidate`;
- reason/evidence;
- currently valid prerequisites.

Effects:

```text
needsRevalidation true → false
append revalidation event
audit
```

If actual business correction/work is necessary, node must be reopened rather than merely clearing the flag.

---

# 32. Reactivation

Reactivation is Stage 01-specific and distinct from generic reopen.

Allowed when:

```text
Opportunity remains valid
latest completed Decision Cycle outcome = not_proceeding
no newer active Decision Cycle
actor has stage01.reactivate
reason supplied
01.1 completion basis currently valid
```

If 01.1 requires revalidation:

```text
REACTIVATION
→ reject with STAGE01_INTAKE_REVALIDATION_REQUIRED
```

After intake is valid, reactivation transaction:

```text
supersede completed 01.2 execution #N
        ↓
create 01.2 execution #(N+1)
phase = not_started
        ↓
create Decision Cycle #(N+1)
        ↓
record reactivation reason/audit
```

01.2 then follows its normal:

```text
ready
→ explicit Start
→ evaluation
```

No prior cycle is modified.

---

# 33. Permission codes

Add stable permission contracts.

## Opportunity

```text
opportunity.read
opportunity.create
opportunity.update
opportunity.contact.manage
opportunity.scope.manage
opportunity.referrer.manage
opportunity.intake_record.create
opportunity.duplicate.raise
opportunity.duplicate.resolve
opportunity.invalidate
opportunity.restore
```

## Generic Journey

```text
journey.read
journey.assignment.manage
journey.node.start
journey.node.complete
journey.node.reopen
journey.node.revalidate
journey.blocker.raise
journey.blocker.resolve
```

## Stage 01 evaluation

```text
stage01.evaluation.update
stage01.recommendation.submit
stage01.clarification.return
stage01.decision.record
stage01.reactivate
```

No wildcard permission.

Command-to-permission mapping:

| Command group | Required permission |
| --- | --- |
| Opportunity bootstrap | `opportunity.create` |
| Current Opportunity field update | `opportunity.update` |
| Contact, Contact Method, Opportunity Contact, Primary Contact | `opportunity.contact.manage` |
| Scope add/retire | `opportunity.scope.manage` |
| Referrer add/set/end | `opportunity.referrer.manage` |
| Intake Record append/correction | `opportunity.intake_record.create` |
| Duplicate concern raise | `opportunity.duplicate.raise` |
| Duplicate concern resolution | `opportunity.duplicate.resolve` |
| Invalidate / restore | `opportunity.invalidate` / `opportunity.restore` |
| Assignment / reassignment / end | `journey.assignment.manage` |
| Start / Complete / reopen / revalidate | corresponding `journey.node.*` permission |
| Blocker raise / resolve | `journey.blocker.raise` / `journey.blocker.resolve` |
| Criterion / Recommendation / clarification / Final Decision | corresponding `stage01.*` permission |
| Reactivation | `stage01.reactivate` |

Opportunity aggregate reads, including Stage 01 Contact/Scope/Referrer data, require `opportunity.read`; Workflow runtime reads require `journey.read`. Phase A does not introduce a separate general-purpose Contact-directory read contract.

Permissions MUST be added to:

```text
shared/constants/permissions.ts
public.permissions
```

Role mapping is governed by `BDG-AUTH-01`.

`company_admin` may retain the existing Taskovia principle of receiving the complete explicit permission catalog, but assignment of Stage 01 business authorities to operational roles is not inferred here.

---

# 34. Decision Authority resolution

Technical interface:

```ts
interface DecisionAuthorityResolver {
  resolve(input: {
    companyId: string
    opportunityId: string
    workflowInstanceId: string
    decisionCycleId: string
  }): Promise<ResolvedAuthority | null>
}
```

Resolved result:

```ts
interface ResolvedAuthority {
  userId: string
  ruleReference: string
}
```

Final Decision requires both:

```text
actor has stage01.decision.record
AND
actor == decisionAuthorityUserId
```

RBAC permission alone does not make someone Decision Authority.

Until `BDG-AUTH-01` is resolved, the resolver MUST NOT invent a person from department, title, creator or owner.

---

# 35. RLS and mutation security

All new company-scoped tables enable RLS. Migrations MUST declare grants explicitly and MUST NOT depend on Supabase project defaults for automatic Data API exposure.

## Read

At minimum:

```text
active company membership
+
appropriate read permission
```

Use the existing:

```text
private.has_company_permission(...)
```

pattern.

Readable public tables receive only the required `SELECT` grant for `authenticated`, followed by company-scoped RLS policies. `anon` receives no Stage 01 table access. Grants determine whether the role can reach an object; RLS independently determines which rows it may read.

If an exposed view is introduced, PostgreSQL 15+ requires:

```sql
WITH (security_invoker = true)
```

Otherwise the view MUST remain in an unexposed schema with no `anon`/`authenticated` access.

## Mutation

Normal authenticated clients MUST NOT receive unrestricted:

```text
INSERT
UPDATE
DELETE
```

grants over protected Stage 01 runtime tables.

Every Stage 01 business mutation uses a controlled RPC/function. This includes single-row append operations as well as multi-table workflow transitions, so permission, versioning, history, and audit behavior do not split across competing write models.

Required existing repository pattern:

```text
Public SECURITY INVOKER wrapper
        ↓
private SECURITY DEFINER transaction function
SET search_path = ''
        ↓
auth.uid() + active membership + tenant/company
+ permission + state + version + invariant re-check
        ↓
mutation + audit
```

All relation and function references inside a `SECURITY DEFINER` body are schema-qualified. `user_metadata` and stale client-provided role claims are never authorization inputs.

Function privileges are deny-by-default and signature-specific:

```text
REVOKE EXECUTE from PUBLIC and anon
REVOKE unintended EXECUTE from authenticated
GRANT only the required public wrappers to authenticated
GRANT private schema USAGE and exact private-function EXECUTE to authenticated
only where the SECURITY INVOKER wrapper requires it
```

The last grant is required by PostgreSQL for the invoker wrapper to call the private implementation. The `private` schema MUST remain outside Supabase `exposed_schemas`, so it is not a PostgREST RPC surface. Direct PostgreSQL invocation under `authenticated` is still safe only because the private function performs the same `auth.uid()`, membership, company, permission, state, version, and invariant checks; wrapper-only trust is forbidden.

Nitro permission checks improve UX and reject early.

Database transaction remains final authority for critical transitions.

`service_role` MUST NOT be used for normal Stage 01 request paths.

---

# 36. Atomic database commands

The controlled command set includes at minimum:

```text
create_stage01_opportunity
update_opportunity_current_data

create_contact
update_contact
add_contact_method
update_contact_method
link_opportunity_contact
set_opportunity_primary_contact
end_opportunity_contact

add_opportunity_scope
retire_opportunity_scope
add_opportunity_referrer
set_opportunity_primary_referrer
end_opportunity_referrer

append_opportunity_intake_record
correct_opportunity_intake_record
raise_opportunity_duplicate_concern
resolve_opportunity_duplicate

assign_workflow_node
end_workflow_assignment
raise_workflow_blocker
resolve_workflow_blocker

start_workflow_node
complete_stage01_intake
invalidate_opportunity
restore_opportunity
reopen_workflow_node
revalidate_workflow_node

record_stage01_criterion_evaluation
submit_stage01_recommendation
return_stage01_for_clarification
record_stage01_final_decision
complete_stage01_evaluation
reactivate_stage01
```

Each function call is one transaction, including commands whose current implementation writes one business row. Multi-write effects such as bootstrap, Primary Contact replacement, Primary Referrer replacement, reassignment, duplicate resolution, completion, Final Decision, reopen/revalidation, and Reactivation either commit completely with their event/audit history or roll back completely.

Supabase request-level code MUST NOT simulate these transactions by issuing several unrelated client queries. No generic client-selected RPC proxy is introduced.

---

# 37. Concurrency

Mutable aggregate records use:

```text
version bigint
```

Mutation input contains the version of the aggregate it changes:

```text
Opportunity current data, contacts, scopes, referrers,
intake, duplicate or validity
→ expectedOpportunityVersion

Contact or Contact Method
→ expectedContactVersion

assignment, blocker or workflow transition
→ expectedExecutionVersion

criterion, Recommendation, clarification or Final Decision
→ expectedCycleVersion
```

Transaction:

```sql
SELECT ... FOR UPDATE
```

then checks current version.

Contact Method commands lock and increment the owning Contact version. Opportunity relationship/history commands lock and increment the Opportunity version. Assignment/blocker commands lock and increment the current Node Execution version. Completion 01.1 checks both `expectedOpportunityVersion` and `expectedExecutionVersion` before capturing the baseline.

Mismatch:

```text
409 VERSION_CONFLICT
```

Examples protected:

- two users completing 01.1 simultaneously;
- Final Decision double submit;
- two different Decision Authority actions;
- duplicate resolution race;
- simultaneous Primary Contact edits;
- Reactivation double click.

---

# 38. API structure

Follow existing company-scoped Nitro convention.

## Opportunity

```text
GET    /api/companies/:companyId/opportunities
POST   /api/companies/:companyId/opportunities

GET    /api/companies/:companyId/opportunities/:opportunityId
PATCH  /api/companies/:companyId/opportunities/:opportunityId
```

`POST` maps only to `create_stage01_opportunity`. `PATCH` updates current Opportunity fields only; it MUST NOT accept nested Contact, Scope, Referrer, Intake Record, assignment, blocker, or decision writes.

## Contacts and Opportunity contact relationships

```text
POST  /api/companies/:companyId/contacts
PATCH /api/companies/:companyId/contacts/:contactId

POST  /api/companies/:companyId/contacts/:contactId/methods
PATCH /api/companies/:companyId/contacts/:contactId/methods/:methodId

POST /api/companies/:companyId/opportunities/:opportunityId/contacts
POST /api/companies/:companyId/opportunities/:opportunityId/primary-contact
POST /api/companies/:companyId/opportunities/:opportunityId/contacts/:opportunityContactId/end
```

Setting Primary Contact accepts an existing company-scoped `contactId`, relationship code, and `expectedOpportunityVersion`. It atomically ends the active Primary Contact relationship and inserts the new relationship. Creating a new Contact is a separate Contact command; no route body performs an unbounded nested aggregate mutation.

Contact and Contact Method mutations use `expectedContactVersion`; relationship mutations use `expectedOpportunityVersion`.

## Scopes and Referrers

```text
POST /api/companies/:companyId/opportunities/:opportunityId/scopes
POST /api/companies/:companyId/opportunities/:opportunityId/scopes/:scopeId/retire

POST /api/companies/:companyId/opportunities/:opportunityId/referrers
POST /api/companies/:companyId/opportunities/:opportunityId/primary-referrer
POST /api/companies/:companyId/opportunities/:opportunityId/referrers/:referrerId/end
```

Each route is a history-preserving command and requires `expectedOpportunityVersion`. Setting Primary Referrer ends the prior active primary row and inserts a new primary row atomically.

## Intake

```text
POST /api/companies/:companyId/opportunities/:opportunityId/intake-records
POST /api/companies/:companyId/opportunities/:opportunityId/intake-records/:recordId/corrections

POST /api/companies/:companyId/opportunities/:opportunityId/duplicate-concerns
POST /api/companies/:companyId/opportunities/:opportunityId/duplicate-concerns/:concernId/resolve

POST /api/companies/:companyId/opportunities/:opportunityId/invalidate
POST /api/companies/:companyId/opportunities/:opportunityId/restore
```

## Stage 01 aggregate

```text
GET /api/companies/:companyId/opportunities/:opportunityId/stage-01
```

Returns:

```text
Opportunity current data
01.1 runtime
01.1 gate report
01.2 runtime
current Decision Cycle
history summaries
actor capabilities
```

## Node actions

```text
POST /api/companies/:companyId/workflow-nodes/:nodeExecutionId/start
POST /api/companies/:companyId/workflow-nodes/:nodeExecutionId/complete
POST /api/companies/:companyId/workflow-nodes/:nodeExecutionId/reopen
POST /api/companies/:companyId/workflow-nodes/:nodeExecutionId/revalidate
```

The generic HTTP `complete` route dispatches by bound node identity: `01.1` calls `complete_stage01_intake`; `01.2` calls `complete_stage01_evaluation`. It MUST NOT implement gate or transaction logic in the route adapter.

## Assignments / blockers

```text
POST /api/companies/:companyId/workflow-nodes/:nodeExecutionId/assignments
POST /api/companies/:companyId/workflow-assignments/:assignmentId/end

POST /api/companies/:companyId/workflow-nodes/:nodeExecutionId/blockers
POST /api/companies/:companyId/workflow-blockers/:blockerId/resolve
```

Posting a new accountable-owner assignment atomically ends the prior active assignment of the same kind and inserts the replacement. Assignment and Blocker commands require `expectedExecutionVersion`.

## Evaluation

```text
POST /api/companies/:companyId/opportunities/:opportunityId/stage-01/evaluations/:criterionKey/revisions

POST /api/companies/:companyId/opportunities/:opportunityId/stage-01/recommendations

POST /api/companies/:companyId/opportunities/:opportunityId/stage-01/clarification-returns

POST /api/companies/:companyId/opportunities/:opportunityId/stage-01/final-decision

POST /api/companies/:companyId/opportunities/:opportunityId/stage-01/reactivate
```

---

# 39. Gate-report API

UI may request/read server-calculated readiness:

```ts
interface GateReport {
  satisfied: boolean

  checks: Array<{
    code: string
    status: 'satisfied' | 'missing' | 'blocked' | 'needs_revalidation'
    message: string
    resourceRef?: string
  }>
}
```

Example 01.1 codes:

```text
OPPORTUNITY_VALID
INTAKE_OWNER_ASSIGNED
PRIMARY_CUSTOMER_PRESENT
CUSTOMER_TYPE_PRESENT
PRIMARY_CONTACT_PRESENT
CONTACT_METHOD_USABLE
CONTACT_RELATIONSHIP_PRESENT
SCOPE_PRESENT
NEED_DESCRIPTION_PRESENT
LOCATION_STATUS_PRESENT
LEAD_SOURCE_PRESENT
REFERRER_PRESENT_IF_REQUIRED
ENGAGEMENT_STATUS_PRESENT
INTAKE_RECORD_PRESENT
NO_OPEN_BLOCKING_BLOCKER
NO_UNRESOLVED_DUPLICATE
```

Gate report is informational for UI.

Mutation command MUST calculate gates again atomically.

---

# 40. API error codes

Extend `shared/schemas/api-error.ts`.

Required stable codes include:

```text
OPPORTUNITY_NOT_FOUND
OPPORTUNITY_INVALID

STAGE01_DEFINITION_CONFIG_UNAVAILABLE
STAGE01_DEFINITION_CONFIG_INVALID

WORKFLOW_NODE_NOT_READY
WORKFLOW_NODE_NOT_ACTIVE
WORKFLOW_OWNER_REQUIRED
WORKFLOW_NODE_BLOCKED
WORKFLOW_REVALIDATION_REQUIRED

STAGE01_INTAKE_INCOMPLETE
STAGE01_DUPLICATE_UNRESOLVED

STAGE01_EVALUATION_CONFIG_UNAVAILABLE
STAGE01_EVALUATION_INCOMPLETE
STAGE01_RECOMMENDATION_REQUIRED
STAGE01_CLARIFICATION_PENDING

STAGE01_DECISION_AUTHORITY_UNRESOLVED
STAGE01_DECISION_AUTHORITY_MISMATCH
STAGE01_FINAL_DECISION_EXISTS
STAGE01_OVERRIDE_RATIONALE_REQUIRED

STAGE01_REACTIVATION_NOT_ALLOWED
STAGE01_INTAKE_REVALIDATION_REQUIRED

STAGE01_HISTORY_IMMUTABLE
STAGE01_RESOURCE_ALREADY_ENDED
STAGE01_RESOURCE_ALREADY_RETIRED

VERSION_CONFLICT
```

`STAGE01_DEFINITION_CONFIG_*` applies only to aggregate bootstrap. `STAGE01_EVALUATION_CONFIG_UNAVAILABLE` applies to an already-bound workflow whose immutable snapshot cannot supply a supported evaluation definition; the runtime MUST fail closed and MUST NOT substitute the company's latest configuration.

Use:

```text
400 → malformed/semantically invalid request
401 → authentication
403 → permission
404 → scoped resource not found
409 → state, gate, configuration availability/validity, concurrency or transition conflict
500 → unexpected internal failure
```

A resource outside the resolved company scope returns the same scoped `404` as a missing resource. APIs MUST NOT reveal cross-company existence through different error codes or details.

Error details may contain:

```json
{
  "missingGates": [],
  "currentVersion": 7,
  "expectedVersion": 6,
  "currentState": "active"
}
```

No secret or cross-tenant information.

---

# 41. Audit

Reuse existing append-only:

```text
audit_events
```

Every controlled Stage 01 mutation records:

```text
actor
tenant/company
action
resource type
resource id
request id
before summary
after summary
timestamp
```

Minimum audited Stage 01 events:

```text
Opportunity created
published definition snapshot bound
current Opportunity fields changed
Primary Customer corrected
Primary Contact changed
Scope added/retired
Referrer changed
Intake Record added/corrected
Intake Owner assigned/reassigned
Evaluation Owner assigned/reassigned
duplicate concern raised/resolved
Blocker raised/resolved
01.1 Start
01.1 Complete
01.1 reopen/revalidation
Opportunity invalidated/restored
criterion evaluation revision
Recommendation submitted
clarification returned
Decision Authority resolved
Final Decision
01.2 Complete
01.2 reopen/revalidation
Reactivation
new Decision Cycle
```

Audit log supplements domain history.

It does not replace domain-specific immutable records such as:

- Intake Records;
- completion baselines;
- Recommendations;
- decision cycles.

---

# 42. Repository boundaries

Current `ProjectRepository` MUST NOT absorb Opportunity behavior.

Add:

```ts
interface OpportunityRepository
interface WorkflowRepository
interface Stage01Repository
```

Conceptually:

```ts
interface OpportunityRepository {
  list(): Promise<OpportunitySummary[]>
  getById(id: string): Promise<OpportunityDetail | null>
  create(input: CreateOpportunityInput): Promise<OpportunityDetail>
  update(id: string, input: UpdateOpportunityInput): Promise<OpportunityDetail>

  createContact(...): Promise<Contact>
  updateContact(...): Promise<Contact>
  addContactMethod(...): Promise<ContactMethod>
  updateContactMethod(...): Promise<ContactMethod>
  linkContact(...): Promise<OpportunityContact>
  setPrimaryContact(...): Promise<OpportunityContact>
  endContactRelationship(...): Promise<void>

  addScope(...): Promise<OpportunityScope>
  retireScope(...): Promise<void>
  addReferrer(...): Promise<OpportunityReferrer>
  setPrimaryReferrer(...): Promise<OpportunityReferrer>
  endReferrer(...): Promise<void>

  addIntakeRecord(...): Promise<IntakeRecord>
  correctIntakeRecord(...): Promise<IntakeRecord>
  raiseDuplicateConcern(...): Promise<DuplicateConcern>
  resolveDuplicateConcern(...): Promise<void>
  invalidate(...): Promise<void>
  restore(...): Promise<void>
}

interface WorkflowRepository {
  getForOpportunity(opportunityId: string): Promise<WorkflowRuntime>
  startNode(...): Promise<WorkflowNodeRuntime>
  completeNode(...): Promise<WorkflowNodeRuntime>
  reopenNode(...): Promise<WorkflowNodeRuntime>
  revalidateNode(...): Promise<WorkflowNodeRuntime>
  assign(...): Promise<void>
  endAssignment(...): Promise<void>
  raiseBlocker(...): Promise<void>
  resolveBlocker(...): Promise<void>
}

interface Stage01Repository {
  get(opportunityId: string): Promise<Stage01Detail>
  evaluateCriterion(...): Promise<void>
  submitRecommendation(...): Promise<void>
  returnForClarification(...): Promise<void>
  recordFinalDecision(...): Promise<void>
  reactivate(...): Promise<void>
}
```

Mock repository shapes are not authoritative for these interfaces.

---

# 43. Server module boundaries

Target:

```text
server/features/
├── opportunities/
│   ├── opportunity.routes.ts
│   ├── opportunity.service.ts
│   └── opportunity.repository.ts
│
├── workflow/
│   ├── workflow.routes.ts
│   ├── workflow.service.ts
│   ├── workflow.repository.ts
│   ├── workflow-state.ts
│   └── workflow-gates.ts
│
└── stage01/
    ├── stage01.routes.ts
    ├── stage01.service.ts
    ├── stage01.repository.ts
    ├── stage01-gates.ts
    └── stage01.types.ts
```

Nitro route files remain thin adapters.

Business transition logic MUST NOT live directly inside Vue components or route handlers.

---

# 44. Shared schema boundary

Add Zod schemas under:

```text
shared/schemas/
├── opportunities.ts
├── workflow.ts
└── stage01.ts
```

Shared schemas own:

- request validation;
- response validation;
- persisted/API enums that this Technical Spec approves;
- API payload contracts.

Server/domain code MUST NOT trust unparsed client payloads.

---

# 45. Existing prototype migration boundary

Current prototype types such as:

```text
StageStatus =
completed
active
upcoming
incomplete
not_applicable
```

are not migrated directly into production state.

Target API state:

```text
locked
ready
active
blocked
completed
not_applicable
```

Likewise:

```text
ownerName
ownerDepartment
records[]
```

from fixtures are not production governance primitives.

The implementation MUST add target domain types rather than reinterpret old fixture fields as business truth.

Existing mock Journey may coexist temporarily behind repository/config boundaries while Stage 01 backend is introduced.

---

# 46. File support

Supporting files are optional in 01.1.

Therefore Storage integration is NOT a blocker for Stage 01 core release.

When generic Taskovia Files module exists:

```text
Opportunity
or
Intake Record
        ↓
File link
        ↓
private Supabase Storage object
```

No completion gate may use:

```text
file count > 0
```

for 01.1.

---

# 47. Testing strategy

## Domain/unit tests

Test:

- effective node-state derivation;
- dependency satisfaction;
- blockers;
- 01.1 gates;
- 01.2 gates;
- criterion applicability;
- Recommendation validity;
- clarification sequencing;
- Decision override;
- reactivation;
- revalidation propagation.

## Database/RLS tests

At least two tenants/companies.

Prove:

```text
DB-S01-BOOT-001  no definition → bootstrap rejects and leaves zero aggregate rows
DB-S01-BOOT-002  newest invalid definition → rejects without older-version fallback
DB-S01-BOOT-003  synthetic valid definition → exact aggregate shape and Cycle #1

DB-S01-SEC-001   Company A cannot read or mutate Company B Stage 01
DB-S01-SEC-002   anon has no Stage 01 table/function access
DB-S01-SEC-003   authenticated has explicit SELECT only on readable tables
DB-S01-SEC-004   direct protected-table INSERT/UPDATE/DELETE is denied
DB-S01-SEC-005   public wrappers and private implementations have exact grants
DB-S01-SEC-006   direct private invocation cannot bypass authorization checks
DB-S01-SEC-007   revoked permission is rejected on the next command

DB-S01-HIST-001  append-only tables reject UPDATE and DELETE
DB-S01-HIST-002  Final Decision/authority fields cannot be changed after first write
DB-S01-HIST-003  Final Decision and Clarification Return references must belong to the same cycle
DB-S01-HIST-004  criterion revision, Recommendation version, and baseline keys are unique
DB-S01-HIST-005  criterion applicability/result constraints and Recommendation currency are enforced
```

Tests MUST exercise both grants and RLS because either layer alone is incomplete. Test fixtures may publish a synthetic complete definition only inside the rolled-back local test context.

## Transaction/concurrency tests

Test:

```text
double 01.1 Complete
double Final Decision
double Reactivation
duplicate resolution race
stale Opportunity update
stale node execution mutation
simultaneous Primary Contact replacement
simultaneous Primary Referrer replacement
simultaneous reassignment
```

Exactly one valid mutation succeeds.

`DB-S01-COMP-001` proves that Complete 01.1 inserts the completion event, captures its ID, inserts the baseline referencing that ID, and rolls every effect back on forced failure.

## API contract tests

Every Nitro route validates:

- IDs;
- body;
- response;
- stable error shape.

`API-S01-001` covers the complete route matrix in Section 38, including command mapping, company scope, expected aggregate version, authenticated user-scoped Supabase client use, and cross-company scoped `404`. `API-S01-002` proves no server repository or request path constructs a `service_role` client.

## E2E acceptance flows

Required flows:

1. Without a published definition, Create Opportunity returns `STAGE01_DEFINITION_CONFIG_UNAVAILABLE` and commits nothing.
2. An invalid newest definition returns `STAGE01_DEFINITION_CONFIG_INVALID` without falling back.
3. A synthetic valid definition creates exactly one Opportunity, one Workflow Instance, two node instances/executions, and Decision Cycle #1, with no Project or parent Stage runtime.
4. 01.1 cannot Start without Intake Owner.
5. 01.1 Start does not require complete intake data.
6. Create and change Primary Contact while preserving prior relationship history.
7. Add/retire Scope and set/end Primary Referrer while preserving history.
8. Append an Intake Record and append a correction without editing the original.
9. 01.1 cannot Complete with missing required minimum.
10. Budget, timeline, files and PM may be absent.
11. Referral-like Lead Source requires Referrer.
12. Raised duplicate concern prevents 01.1 completion.
13. Resolve duplicate as different need and complete.
14. Resolve duplicate as same need without deleting history.
15. Complete 01.1 creates immutable baseline linked to its completion event.
16. 01.2 remains locked before valid 01.1 completion.
17. 01.2 cannot Start without Evaluation Owner.
18. Required evaluation with `insufficient_information` cannot proceed.
19. `concern` or `not_fit` does not mechanically decide outcome.
20. Submit Recommendation.
21. Return for clarification.
22. Submit a new Recommendation.
23. Final Decision matching Recommendation.
24. Final Decision overriding Recommendation requires rationale.
25. Final Decision cannot be edited or submitted twice.
26. Final Decision does not auto-complete 01.2.
27. Complete 01.2 explicitly.
28. `not_proceeding` Opportunity remains queryable.
29. Reactivation creates Decision Cycle 2 and leaves Cycle 1 unchanged.
30. Invalidation remains distinct from `not_proceeding`.
31. Reopen/revalidation preserves old completion history.
32. Blocking Blocker derives effective `blocked`.
33. Non-blocking issue does not derive `blocked`.

---

# 48. Migration delivery order

Logical migration order:

```text
1. permission catalog additions

2. workflow core tables
   + RLS
   + indexes

3. opportunity domain tables
   + contacts
   + scopes
   + intake
   + duplicate concerns

4. Stage 01 baseline/evaluation/decision tables

5. private transactional functions
   + public RPC wrappers

6. policies / grants

7. approved VQH Stage 01 definition/config publication
   (Phase B only, after relevant BDGs)

8. generated database types

9. HTTP repository + server feature integration

10. UI integration
```

Phase A stops before step 7. Synthetic test definitions are fixtures, not migration step 7.

Exact timestamped migration filenames belong to Implementation Plan.

No Cloud DEV mutation is authorized merely by approving this spec.

---

# 49. Business Decision Gates

These are not implementation details.

## BDG-HIER-01 — Parent Stage runtime

Need approved decision for:

```text
Does parent Stage 01 have runtime state?
How does it start/complete?
How do child states affect it?
```

Until resolved:

```text
01.1 and 01.2 are authoritative runtime nodes.
No canonical parent runtime is created.
```

## BDG-EVAL-01 — VQH evaluation configuration

Must approve before enabling 01.2 production:

- individual criteria in five dimensions;
- required/optional/conditional classification;
- which criteria permit N/A;
- detailed conditional applicability rules;
- detailed risk taxonomy.

Technical engine supports these values but MUST NOT invent them.

## BDG-TAX-01 — VQH Stage 01 catalogs

Approve actual configuration values for:

- Customer Type;
- Contact Relationship;
- Scope;
- Lead Source;
- Referrer Type;
- Engagement Status;
- Invalid Reason;
- optional operational taxonomies.

They remain company configuration, not Taskovia-global enums.

## BDG-AUTH-01 — Authority resolution

Approve:

- Intake Owner resolution/default;
- Evaluation Owner resolution/default;
- Decision Authority rule;
- operational role → permission mapping;
- clarification-return authority;
- Completion Authority policy where needed.

Technical permissions are defined by this spec.

The business assignment to concrete roles/users is not.

---

# 50. Implementation blocking policy

Technical work can be decomposed around the open gates.

Safe before gates are resolved:

```text
generic schemas
Opportunity model
Contacts
Scopes
Intake Records
workflow runtime foundation
blockers
audit
RLS infrastructure
transaction patterns
HTTP repository infrastructure
```

The bootstrap command itself is safe to implement before the gates: local tests use synthetic definitions, while any environment without an approved complete published definition fails closed. Safe foundation work does not imply operational Opportunity creation is enabled in production.

MUST NOT be production-finalized before relevant gates:

```text
Stage 01 taxonomy seed
evaluation criteria seed
Decision Authority resolver
operational role mappings
parent Stage runtime
```

Codex MUST return `BLOCKED` rather than invent these when an implementation task reaches them without an approved decision.

---

# 51. Technical Decision Registry

| ID | Decision | Status |
| --- | --- | --- |
| `VQH-S01-T001` | Use minimal reusable Workflow Core + Stage 01 | APPROVED |
| `VQH-S01-T002` | Opportunity is Stage 01 aggregate; do not reuse Project as Opportunity | APPROVED |
| `VQH-S01-T003` | API canonical state is derived from internal phase + dependencies + blockers | APPROVED |
| `VQH-S01-T004` | `blocked` is never manually persisted/toggled | APPROVED |
| `VQH-S01-T005` | Preserve historical node executions; Reactivation creates new 01.2 execution generation | APPROVED |
| `VQH-S01-T006` | 01.1 completion basis uses immutable JSONB snapshot/reference | APPROVED |
| `VQH-S01-T007` | In-flight runtime uses immutable definition/config snapshot | APPROVED |
| `VQH-S01-T008` | Critical transitions execute in PostgreSQL transaction functions/RPC | APPROVED |
| `VQH-S01-T009` | Nitro + DB both check authorization; DB is final mutation authority | APPROVED |
| `VQH-S01-T010` | Optimistic version + row lock protects concurrent mutation | APPROVED |
| `VQH-S01-T011` | Stage 01 taxonomies are company-configurable, not global hard-coded lists | APPROVED |
| `VQH-S01-T012` | Criterion N/A is separate from evaluation result | APPROVED |
| `VQH-S01-T013` | Final Decision is one immutable record per decision cycle | APPROVED |
| `VQH-S01-T014` | `proceed` does not create Project or start Stage 02 | APPROVED |
| `VQH-S01-T015` | Current prototype Journey types are not production domain authority | APPROVED |
| `VQH-S01-T016` | Generic parent Stage runtime remains outside this spec until BDG-HIER-01 | APPROVED |
| `VQH-S01-T017` | Opportunity bootstrap fails closed without a valid published definition and atomically creates the complete aggregate plus Decision Cycle #1 | APPROVED |
| `VQH-S01-T018` | Every Stage 01 business mutation uses an explicit controlled RPC and HTTP command/resource contract | APPROVED |
| `VQH-S01-T019` | History immutability, Final Decision immutability, same-cycle references, and revision/version uniqueness are database-enforced | APPROVED |
| `VQH-S01-T020` | Complete 01.1 creates the completion event before inserting the baseline that references it | APPROVED |
| `VQH-S01-T021` | Supabase grants, RLS, exposed schemas, and SECURITY DEFINER privileges are explicit and deny-by-default | APPROVED |
| `VQH-S01-T022` | Mutation concurrency is checked against the version of the Opportunity, Contact, Node Execution, or Decision Cycle aggregate being changed | APPROVED |
| `VQH-S01-T023` | `reliability_state` is data-quality metadata and never creates a gate or Blocker by itself | APPROVED |
| `VQH-S01-T024` | Phase A is a verified runtime foundation but remains non-operational in production until required BDGs are approved and a complete definition is published | APPROVED |

---

# 52. Business-to-technical traceability

The corrected Execution Plan uses the planned task numbers below. Evidence IDs are defined in Section 47 and remain stable when individual test files are reorganized. In this matrix, `Tnnn` is shorthand for `VQH-S01-Tnnn` in Section 51.

| Business decision | Technical decisions | Spec sections | Corrected plan tasks | Primary evidence |
| --- | --- | --- | --- | --- |
| `VQH-S01-001` | T002, T005, T013 | 5, 23, 30, 32 | 5, 10, 15 | E2E 28–29 |
| `VQH-S01-002` | T003, T013 | 6, 27–28 | 7, 10 | E2E 26–27 |
| `VQH-S01-003` | T001, T016, T017 | 2, 5.1, 8, 21 | 3, 8–9 | DB-S01-BOOT-003; E2E 3, 16 |
| `VQH-S01-004` | T008, T009, T013, T018 | 25–28, 33–38 | 10–12 | API-S01-001; E2E 20–27 |
| `VQH-S01-005` | T006, T011, T018 | 11–20, 36, 38 | 1, 4, 8–9 | E2E 6–15 |
| `VQH-S01-006` | T002, T014, T017 | 3–5.1, 20, 29 | 3, 7, 9, 15 | E2E 3, 10 |
| `VQH-S01-007` | T014, T017 | 4–5.1, 29 | 3, 15 | E2E 3, 10 |
| `VQH-S01-008` | T013 | 23, 27–28 | 5, 10 | E2E 23–28 |
| `VQH-S01-009` | T007, T011, T012 | 22, 24, 27 | 5, 7, 10 | E2E 18–24 |
| `VQH-S01-010` | T012 | 22, 24 | 5, 7, 10 | E2E 18–19 |
| `VQH-S01-011` | T005, T008 | 32, 36 | 10 | E2E 29 |
| `VQH-S01-012` | T005, T013, T019 | 23–27, 32 | 5, 10 | DB-S01-HIST-002; E2E 29 |
| `VQH-S01-013` | T002, T008, T018 | 5, 17, 36, 38 | 4, 8–9 | E2E 12–14 |
| `VQH-S01-014` | T006, T019, T020 | 16, 18, 20, 26.1 | 4, 9 | DB-S01-HIST-001; DB-S01-COMP-001; E2E 8, 15 |
| `VQH-S01-015` | T003, T008, T009 | 19–20, 33–36 | 7, 9 | E2E 4–5, 15 |
| `VQH-S01-016` | T006, T011, T023 | 12–20 | 4, 7, 9 | E2E 9–11 |
| `VQH-S01-017` | T002, T008, T019 | 30, 36 | 4, 9 | E2E 30 |
| `VQH-S01-018` | T003, T007, T016, T017 | 5.1, 8, 21 | 3, 7–9 | DB-S01-BOOT-003; E2E 16–17 |
| `VQH-S01-019` | T007, T011, T017 | 5.1, 10.2, 22 | 3, 5, 7–8 | DB-S01-BOOT-001..003; E2E 18 |
| `VQH-S01-020` | T012, T013, T019 | 24, 27 | 5, 7, 10 | DB-S01-HIST-003..005; E2E 18–19, 23–25 |
| `VQH-S01-021` | T013, T019 | 25–26.1 | 5, 10 | DB-S01-HIST-001; E2E 20–22 |
| `VQH-S01-022` | T009, T013, T019 | 27 | 5, 10 | DB-S01-HIST-002..003; E2E 23–26 |
| `VQH-S01-023` | T003, T008, T009 | 28, 33–36 | 7, 10 | E2E 26–27 |
| `VQH-S01-024` | T005, T006, T019 | 18, 20, 31 | 4, 9–10 | DB-S01-HIST-001; E2E 31 |
| `VQH-S01-025` | T005, T008, T013 | 23, 32, 36 | 5, 10 | E2E 29 |
| `VQH-S01-026` | T005, T006, T009, T019, T020, T021 | 10, 16, 18, 23–41 | 3–15 | DB-S01-SEC-001..007; DB-S01-HIST-001..005; DB-S01-COMP-001 |

---

# 53. Technical acceptance boundary

The corrected Technical Spec is approved with the following conditions:

```text
[x] Architecture and domain boundaries approved
[x] VQH-S01-T001..T016 preserved
[x] VQH-S01-T017..T024 correction design approved
[x] No known conflict with Canonical Journey
[x] No known conflict with Approved Stage 01 Business Design
[x] BDG items acknowledged as business gates
[x] No implementation behavior may silently resolve a BDG
[x] Corrected written Technical Spec reviewed and approved
```

When the corrected written Technical Spec is approved, that approval means:

```text
Technical Design approved
```

It does NOT mean:

```text
Implementation authorized
Cloud DEV mutation authorized
Production mutation authorized
Deployment authorized
```

After Technical Spec approval, the required next artifact is:

```text
Technical Spec — APPROVED
        ↓
Implementation / Execution Plan
        ↓
Approved Implementation Packet
        ↓
Codex technical preflight
        ↓
Implementation
```

---

# 54. Final technical invariant

The implementation must always be able to answer, from persisted data alone:

```text
What Opportunity was considered?

Which published definition version was bound at bootstrap?

Why was bootstrap allowed, and which aggregate rows were created atomically?

What information did VQH have when 01.1 was completed?

Who owned 01.1 at that time?

Why was 01.1 allowed to complete?

What changed afterward?

Was the old completion still currently valid?

What criteria were used for this exact decision cycle?

Who evaluated them?

What Recommendations existed and in which order?

Was the case returned for clarification?

Who was the resolved Decision Authority?

What was the Final Decision?

Did it override the Recommendation, and why?

Who explicitly completed 01.2?

Was the Opportunity later invalidated, reopened,
revalidated or reactivated?

If reactivated, what happened in every prior cycle?
```

If any of those questions cannot be reconstructed without guessing from current mutable data, the implementation does not satisfy this Technical Spec.
