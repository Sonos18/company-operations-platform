# VQH Project Journey — Stage 01 Technical Specification

> **Stage:** 01 — Tiếp nhận & đánh giá cơ hội  
> **Sub-stages:** 01.1 Tiếp nhận yêu cầu; 01.2 Đánh giá cơ hội & quyết định tiếp tục  
> **Status:** APPROVED TECHNICAL SPEC  
> **Authority scope:** VQH Stage 01 only  
> **Implementation authorization:** NONE  
> **Approved:** 2026-08-29  
> **Analysis base:** `Sonos18/company-operations-platform@f314ed7a4ff1d86e45cc29075ab0213ec6421ca1`
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

Authority chain:

```text
VQH Project Journey Canonical Reference
                    ↓
Approved Stage 01 Business Design
                    ↓
THIS TECHNICAL SPEC
                    ↓
Future Implementation Plan
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

Technical Spec covers complete Stage 01 runtime:

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
- sensitive mutations through controlled RPC/transaction boundaries;
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

Immutable definition used by the workflow instance.

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

The runtime MUST NOT query the latest company configuration to reinterpret an existing workflow.

```text
snapshot at creation
!= latest VQH configuration
```

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
→ active Referrer required
```

instead of hard-coding a source label.

Existing workflow instances use the taxonomy configuration captured in their immutable snapshot.

---

# 13. Contacts

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

One active Primary Contact per Opportunity.

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
created_by
created_at
ended_by
ended_at
end_reason
```

One active primary Referrer is sufficient for Stage 01.

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
evaluate all gates
        ↓
create immutable intake baseline
        ↓
phase active → completed
        ↓
insert completion event
        ↓
audit
```

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

`final_outcome`:

```text
proceed
not_proceeding
```

nullable until Final Decision.

Exactly one Final Decision exists per cycle.

---

# 24. Criterion evaluations

## `stage01_criterion_evaluations`

Append-only versions.

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

Clarification:

- does not end the cycle;
- does not create another Opportunity;
- does not create a new decision cycle;
- does not create `not_proceeding`.

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
opportunity.intake_record.create
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

All new company-scoped tables enable RLS.

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

## Mutation

Normal authenticated clients MUST NOT receive unrestricted:

```text
INSERT
UPDATE
DELETE
```

grants over protected Stage 01 runtime tables.

Business commands use controlled RPC/functions.

Recommended existing pattern:

```text
Public SECURITY INVOKER wrapper
        ↓
private SECURITY DEFINER transaction function
        ↓
membership + permission + invariant re-check
        ↓
mutation + audit
```

Nitro permission checks improve UX and reject early.

Database transaction remains final authority for critical transitions.

`service_role` MUST NOT be used for normal Stage 01 request paths.

---

# 36. Atomic database commands

The following operations MUST execute atomically:

```text
Start node

Complete 01.1
+ create immutable baseline

Complete 01.2

Final Decision

Resolve duplicate as same need
+ link canonical Opportunity
+ invalidate duplicate when applicable

Invalidate / Restore

Reopen

Revalidate

Resolve blocker

Reactivate
+ supersede execution
+ create execution
+ create decision cycle
```

Supabase request-level code MUST NOT simulate these transactions by issuing several unrelated client queries.

---

# 37. Concurrency

Mutable aggregate records use:

```text
version bigint
```

Mutation input contains:

```text
expectedVersion
```

Transaction:

```sql
SELECT ... FOR UPDATE
```

then checks current version.

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

## Intake

```text
POST /api/companies/:companyId/opportunities/:opportunityId/intake-records

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

## Assignments / blockers

```text
POST /api/companies/:companyId/workflow-nodes/:nodeExecutionId/assignments

POST /api/companies/:companyId/workflow-nodes/:nodeExecutionId/blockers
POST /api/companies/:companyId/workflow-blockers/:blockerId/resolve
```

## Evaluation

```text
PUT  /api/companies/:companyId/opportunities/:opportunityId/stage-01/evaluations/:criterionKey

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
OPPORTUNITY_VERSION_CONFLICT

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

VERSION_CONFLICT
```

Use:

```text
400 → malformed/semantically invalid request
401 → authentication
403 → permission
404 → scoped resource not found
409 → state, gate, concurrency or transition conflict
500 → unexpected internal failure
```

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

Every critical action records:

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
  addIntakeRecord(...): Promise<IntakeRecord>
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
Company A cannot read Company B Opportunity
Company A cannot mutate Company B Stage 01
unauthorized user cannot call mutation RPC
revoked role loses permission on next request
```

## Transaction/concurrency tests

Test:

```text
double 01.1 Complete
double Final Decision
double Reactivation
duplicate resolution race
stale Opportunity update
stale node execution mutation
```

Exactly one valid mutation succeeds.

## API contract tests

Every Nitro route validates:

- IDs;
- body;
- response;
- stable error shape.

## E2E acceptance flows

Required flows:

1. Create Opportunity with minimal preliminary information.
2. 01.1 cannot Start without Intake Owner.
3. 01.1 Start does not require complete intake data.
4. 01.1 cannot Complete with missing required minimum.
5. Budget, timeline, files and PM may be absent.
6. Referral-like Lead Source requires Referrer.
7. Raised duplicate concern prevents 01.1 completion.
8. Resolve duplicate as different need and complete.
9. Resolve duplicate as same need without deleting history.
10. Complete 01.1 creates immutable baseline.
11. 01.2 remains locked before valid 01.1 completion.
12. 01.2 cannot Start without Evaluation Owner.
13. Required evaluation with `insufficient_information` cannot proceed.
14. `concern` or `not_fit` does not mechanically decide outcome.
15. Submit Recommendation.
16. Return for clarification.
17. Submit a new Recommendation.
18. Final Decision matching Recommendation.
19. Final Decision overriding Recommendation requires rationale.
20. Final Decision does not auto-complete 01.2.
21. Complete 01.2 explicitly.
22. `not_proceeding` Opportunity remains queryable.
23. Reactivation creates Decision Cycle 2 and leaves Cycle 1 unchanged.
24. Invalidation remains distinct from `not_proceeding`.
25. Reopen/revalidation preserves old completion history.
26. Blocking Blocker derives effective `blocked`.
27. Non-blocking issue does not derive `blocked`.

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

7. approved VQH Stage 01 configuration seed

8. generated database types

9. HTTP repository + server feature integration

10. UI integration
```

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

---

# 52. Technical acceptance boundary

This Technical Spec is technically approved with the following confirmed conditions:

```text
[x] Architecture and domain boundaries approved
[x] VQH-S01-T001..T016 accepted
[x] No known conflict with Canonical Journey
[x] No known conflict with Approved Stage 01 Business Design
[x] BDG items acknowledged as business gates
[x] No implementation behavior may silently resolve a BDG
```

Approval of this Technical Spec means:

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

# 53. Final technical invariant

The implementation must always be able to answer, from persisted data alone:

```text
What Opportunity was considered?

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
