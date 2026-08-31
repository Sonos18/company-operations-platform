# VQH Stage 01 Operational UI — Design Specification

## Status

- Product/design status: **APPROVED by Sơn in chat on 2026-08-31**
- Approved approach: **A — Opportunity-centric Stage 01 Workspace**
- Design branch: `docs/vqh-stage-01-operational-ui-design`
- Analysis base: `main@431760676e446ae6dff3372acc7f20e31f093082`
- Implementation phase: **B3 — Stage 01 Operational UI**

## Goal

Build the real operational UI for VQH Stage 01 so authorized employees can create and manage Opportunities, operate Stage 01 sub-stages `01.1` Intake and `01.2` Evaluation, observe gates and workflow state, perform the approved operational commands, and review immutable decision history using the existing Stage 01 backend/workflow engine.

B3 is the UI/application layer over the already-implemented Opportunity, Workflow, and Stage01 repositories. It must not redesign the database or Workflow Engine.

---

## Product boundary

Stage 01 operates on an **Opportunity**, not on a Project.

Approved routes:

```text
/opportunities
/opportunities/:opportunityId/stage-01
```

The `Cơ hội` workspace is the entry point for pre-project business intake and evaluation.

Do not place Stage 01 operational work under `/projects` because an Opportunity may be rejected and never become a Project.

---

## Architectural approach

B3 uses one Opportunity-centric operational workspace for the complete Stage 01 lifecycle.

```text
Opportunity list
    ↓
Stage 01 workspace
    ├── Opportunity context
    ├── 01.1 Intake
    ├── 01.2 Evaluation
    └── History / completed / reactivation state
```

Do not create separate routes for `01.1` and `01.2`. The user should see Stage 01 progression and dependencies in one operational context.

Do not build a generic workflow renderer or generic workflow builder. B3 may use Stage-01-specific presentation over reusable Opportunity/Workflow APIs.

---

## Existing backend contracts

B3 must reuse the existing repositories.

### OpportunityRepository

Existing capabilities include:

- list Opportunities;
- get Opportunity detail;
- create/update Opportunity;
- create/update Contact and Contact Method;
- link/set-primary/end Opportunity Contact;
- add/retire Scope;
- add/set-primary/end Referrer;
- append/correct Intake Record;
- raise/resolve Duplicate Concern;
- invalidate/restore Opportunity.

### WorkflowRepository

Existing capabilities include:

- get workflow runtime for Opportunity;
- start node;
- complete node;
- reopen node;
- revalidate node;
- assign/end assignment;
- raise/resolve blocker.

### Stage01Repository

Existing capabilities include:

- get Stage 01 aggregate;
- evaluate criterion;
- submit recommendation;
- return for clarification;
- record final decision;
- reactivate Stage 01.

B3 must not duplicate these commands in a parallel client-side state machine.

---

## Required Stage01Detail contract extension

The operational UI must render taxonomy labels/options and criterion definitions from the exact workflow-definition snapshot bound to the Opportunity.

The current Stage01 repository already loads `workflow_definition_snapshots.definition` using `workflowRuntime.definitionSnapshotId` to calculate gates and capabilities. B3 must expose the relevant bound business definition through `Stage01Detail` rather than call the B2 latest-config API.

Approved extension:

```ts
interface Stage01Detail {
  opportunity: OpportunityDetail
  intake: {
    runtime: WorkflowNodeRuntime
    gates: GateReport
  }
  evaluation: {
    runtime: WorkflowNodeRuntime
    gates: GateReport
  }
  currentDecisionCycle: Stage01DecisionCycle
  actorCapabilities: string[]
  configuration: {
    taxonomies: Stage01BusinessTaxonomies
    criteria: Stage01Criteria
  }
}
```

Rules:

- `configuration` comes from the Opportunity's bound `workflow_definition_snapshots` row;
- do not call `Stage01ConfigRepository.get()` to populate operational controls;
- do not use `workflow_taxonomy_values` directly from application code;
- no database migration is required for this extension;
- only the Stage01 detail response/schema/repository mapping and affected tests may change for this contract extension;
- historical Opportunity instances continue to render the configuration they were created against even after administrators publish newer Stage 01 configuration.

This bound-snapshot rule is a hard B3 invariant.

---

## Primary navigation

Add a primary workspace link:

```text
Cơ hội → /opportunities
```

Permission:

```text
opportunity.read
```

This is operational navigation, so unlike B2 configuration it belongs in the primary workspace navigation model.

Mobile navigation may adapt its existing layout to accommodate the new workspace item, but B3 must not turn the navigation into a generic menu redesign.

---

## Opportunity list page

Route:

```text
/opportunities
```

### Read behavior

For users with `opportunity.read`:

- load real Opportunities through `OpportunityRepository.list()`;
- show primary customer name;
- need/summary where available;
- valid/invalid state;
- last-updated context;
- link to `/opportunities/:id/stage-01`;
- provide loading, empty, retry, and error states.

### Create behavior

For users with `opportunity.create`:

- expose `Tạo cơ hội`;
- minimum required input is the existing `CreateOpportunityInput` contract;
- user-facing form should prioritize `primaryCustomerName` and allow approved optional current Opportunity fields;
- taxonomy-backed selects must use configuration from the current published Stage 01 configuration only for **new Opportunity creation**;
- creation goes through `OpportunityRepository.create()`;
- on success navigate directly to the new Stage 01 workspace using returned `opportunityId`.

B3 may use `Stage01ConfigRepository.get()` on the create form because a newly created Opportunity must bind to the currently published Stage 01 definition. It must never use latest config to reinterpret an existing Opportunity.

---

## Stage 01 workspace page

Route:

```text
/opportunities/:opportunityId/stage-01
```

Minimum route permission:

```text
opportunity.read + journey.read
```

Use page metadata/access policy compatible with the existing global authorization middleware.

The page loads canonical data through `Stage01Repository.get(opportunityId)`.

Do not independently load Opportunity + Workflow + Stage01 and combine them in the page when `Stage01Detail` already represents the server-authoritative aggregate.

---

## Workspace information architecture

### 1. Opportunity header

Display:

- primary customer name;
- validity state;
- need summary;
- Opportunity version where useful for operational diagnostics;
- current Stage 01 progress;
- current decision cycle number;
- concise warning when workflow needs revalidation or a blocking condition exists.

Available top-level Opportunity actions depend on explicit permissions:

- edit Opportunity — `opportunity.update`;
- invalidate — `opportunity.invalidate`;
- restore — `opportunity.restore`;
- reactivate Stage 01 — `stage01.reactivate` plus valid backend state/capability.

### 2. Stage progression

Show both nodes:

```text
01.1 Tiếp nhận
01.2 Đánh giá
```

For each node show:

- state: locked / ready / active / blocked / completed / not applicable;
- execution number;
- revalidation indicator;
- accountable owner;
- blocking blocker count;
- gate satisfaction summary.

The progression is informational and navigates/scrolls within the same page; it does not invent client-side transitions.

### 3. Intake workspace — 01.1

The Intake section contains:

- current Opportunity information;
- contacts and Primary Contact;
- usable contact methods;
- scopes;
- referrers / Primary Referrer;
- intake record history and correction flow;
- duplicate concerns;
- validity state;
- owner/contributor assignments;
- blockers;
- current Intake gate report;
- node start/complete/reopen/revalidate actions where permitted.

### 4. Evaluation workspace — 01.2

The Evaluation section contains:

- criterion definitions from `Stage01Detail.configuration.criteria`;
- latest evaluation state per criterion plus revision history indication;
- recommendation history/current recommendation;
- clarification-return history;
- final decision state;
- decision authority context when exposed by the current cycle;
- owner/contributor assignments;
- blockers;
- current Evaluation gate report;
- node start/complete/reopen/revalidate actions where permitted.

### 5. History and completed state

Historical records remain visible and immutable.

Display at minimum:

- prior criterion revisions where available from the aggregate;
- recommendation versions;
- clarification returns;
- final decision and rationale;
- reactivation reason/current cycle number;
- prior completed state context provided by runtime/cycle data.

B3 does not add a history-edit API.

---

## Opportunity editing in Intake

The operational page must expose existing Opportunity data without replacing the backend aggregate model.

Editable current fields may include the existing schema fields such as:

- customer type;
- customer/need text;
- location;
- lead source;
- engagement status;
- budget status/range/note;
- timeline status/range/note;
- priority.

Taxonomy controls must render code → label using `Stage01Detail.configuration.taxonomies`.

Save through `OpportunityRepository.update()` with `expectedOpportunityVersion` from the latest canonical detail.

After success, reload canonical Stage01 detail.

Do not locally patch the Stage01 aggregate as if it were authoritative.

---

## Contacts

Use the existing Contact/Opportunity relationship APIs.

The UI supports:

- create Contact;
- add/update Contact Method;
- link Contact to Opportunity;
- select Primary Contact;
- end contact relationship.

Permissions:

- Contact relationship operations: `opportunity.contact.manage`;
- read-only users see current relationships but no mutation controls.

Primary Contact and usable Contact Method requirements must be explained by Intake gate messages rather than duplicated as hidden frontend rules.

---

## Scopes

Use existing scope commands.

UI supports:

- add scope;
- optional note/reliability where allowed by current schema;
- retire active scope with explicit reason;
- retain retired scope history read-only.

Permission:

```text
opportunity.scope.manage
```

Scope taxonomy options come from the bound `configuration.taxonomies.scope`.

---

## Referrers

Use existing referrer commands.

UI supports:

- add referrer;
- choose referrer type;
- optional linked Contact;
- set Primary Referrer;
- end referrer relationship.

Permission:

```text
opportunity.referrer.manage
```

When bound `lead_source` behavior requires a referrer, show that requirement using the bound definition and/or gate report. Do not use latest B2 config.

---

## Intake records

Intake Records are append/correct history rather than freely editable rows.

UI supports:

- append intake record with channel + summary;
- correct an existing record by creating the approved correction record;
- display correction relationship/history.

Permission:

```text
opportunity.intake_record.create
```

The UI must not rewrite a historical Intake Record in place.

---

## Duplicate concerns

UI supports:

- raise a duplicate concern;
- optionally identify the suspected duplicate Opportunity;
- resolve as `same_need` or `different_need`;
- when `same_need`, require canonical Opportunity according to the existing schema;
- display resolved concerns read-only.

Permissions:

```text
opportunity.duplicate.raise
opportunity.duplicate.resolve
```

Use server validation as authority.

---

## Opportunity invalidation / restore

Invalidation uses:

```text
opportunity.invalidate
```

Restore uses:

```text
opportunity.restore
```

Invalidation must require the existing reason inputs and use taxonomy-backed invalid-reason options from the bound configuration when operating an existing Opportunity.

Invalid Opportunities remain inspectable. Mutation controls follow backend state and permissions.

---

## Workflow node actions

Workflow actions use `WorkflowRepository` and exact runtime versions.

Permissions:

| Action | Permission |
| --- | --- |
| assign/end assignment | `journey.assignment.manage` |
| start | `journey.node.start` |
| complete | `journey.node.complete` |
| reopen | `journey.node.reopen` |
| revalidate | `journey.node.revalidate` |
| raise blocker | `journey.blocker.raise` |
| resolve blocker | `journey.blocker.resolve` |

### Start

Send `expectedExecutionVersion` from the current node runtime.

### Complete 01.1 Intake

Send:

```text
expectedExecutionVersion
expectedOpportunityVersion
```

Do not send a Decision Cycle version for Intake completion.

### Complete 01.2 Evaluation

Send:

```text
expectedExecutionVersion
expectedCycleVersion
```

Do not send an Opportunity version for Evaluation completion.

### Reopen

Require explicit reason and current execution version.

### Revalidate

Require explicit reason, non-empty evidence, and current execution version.

After every workflow command, reload Stage01 detail.

---

## Assignment UI

Assignments are runtime history, not a single mutable owner field.

Display active accountable owner and contributors separately from ended assignments.

The UI may select an assignee from existing company employee/directory data if a current repository already supports the required read. B3 must not invent a new employee identity store.

Use `assign()` and `endAssignment()` with exact current execution version.

Do not assume that current frontend user is always the owner.

---

## Blockers

For each node show open and resolved blockers.

Raise blocker fields:

- effect: blocking / non-blocking;
- category code from bound `blocker_category` taxonomy;
- description;
- optional responsible user;
- current execution version.

Resolve requires resolution text + current execution version.

Do not infer node blocked state solely from UI blocker collection; render canonical runtime state from server after reload.

---

## Criterion evaluation

Criterion definitions come from the bound snapshot.

For each criterion show:

- label;
- description;
- dimension;
- criticality;
- applicability rules;
- latest evaluation;
- revision number/history indicator.

Mutation permission:

```text
stage01.evaluation.update
```

Command fields follow the existing schema:

```text
expectedCycleVersion
applicability
result
rationale
evidence
```

UI rules mirror shared schema for immediate validation but backend remains authoritative.

Important states:

- applicable → result required;
- not applicable → result must be null;
- rationale or evidence required;
- `allowsNotApplicable` must be respected from bound criterion definition.

After successful evaluation, reload canonical Stage01 detail and use returned cycle state/version.

---

## Recommendation

Permission:

```text
stage01.recommendation.submit
```

Support:

```text
recommend_proceed
recommend_not_proceeding
```

Require rationale and current `expectedCycleVersion`.

Evidence may be represented through the existing evidence contract; B3 does not invent persistent file uploads unless an already-supported evidence representation exists.

Recommendation history remains visible.

---

## Return for clarification

Permission:

```text
stage01.clarification.return
```

Requires:

- current recommendation ID;
- reason;
- current cycle version.

Clarification does not edit the previous recommendation. It records a new clarification return and canonical state is reloaded.

---

## Final decision

Permission:

```text
stage01.decision.record
```

Outcomes:

```text
proceed
not_proceeding
```

Require final rationale and current cycle version.

If backend requires `overrideRationale`, UI surfaces that error/condition and collects it explicitly. Do not auto-generate override rationale.

Once final decision is recorded, it is displayed as historical/final state and not edited in place.

---

## Reactivation

Permission:

```text
stage01.reactivate
```

Reactivation uses exact canonical versions:

```text
expectedOpportunityVersion
expectedExecutionVersion
expectedCycleVersion
reason
```

Successful reactivation creates a new execution/cycle according to backend behavior.

UI must reload canonical Stage01 detail and show the new execution/cycle. It must not overwrite the previous cycle UI history.

---

## Actor capabilities

`Stage01Detail.actorCapabilities` is workflow-definition capability information resolved against the current actor's permissions.

Use it only when the corresponding action is capability-bound by the workflow definition.

Do not replace explicit permission checks with one generic `actorCapabilities.length > 0` check.

Frontend action visibility should require both:

1. required explicit permission where applicable;
2. required bound actor capability where the backend definition models that capability.

The server remains authoritative if UI state becomes stale.

---

## Canonical reload model

B3 uses a command → reload pattern.

```text
Canonical Stage01Detail
      ↓
user command
      ↓
Opportunity / Workflow / Stage01 repository
      ↓
command succeeds
      ↓
Stage01Repository.get(opportunityId)
      ↓
replace rendered aggregate
```

Do not manually mutate gate results, runtime phases, cycle versions, blockers, recommendations, or final decision state after commands.

Local form fields may remain local while being edited, but canonical aggregate state comes only from server responses.

---

## Optimistic concurrency and conflicts

Every mutation must use the version owned by the corresponding current aggregate/runtime object.

Examples:

- Opportunity update → `opportunity.version`;
- node action → `runtime.version`;
- Stage01 evaluation/decision → `currentDecisionCycle.version`;
- blocker resolution → latest node execution version as required by existing repository contract.

On `VERSION_CONFLICT`:

- do not retry automatically;
- do not overwrite newer canonical data;
- show a clear Vietnamese conflict message;
- allow reload of latest Stage01 detail;
- preserve local form input where safe until user explicitly reloads/discards it.

---

## Gate presentation

Gate reports are explanations, not just red/green status.

For Intake and Evaluation show:

- overall satisfied state;
- each gate check message;
- status: satisfied / missing / blocked / needs_revalidation;
- resource reference when useful.

Node completion buttons must not rely only on local gate calculations. The UI may disable obvious invalid completion based on the current server gate report, but server command response remains authoritative.

---

## Error handling

### Initial Stage01 load failure

Show a blocking workspace error with retry. Do not render fabricated empty state.

### Not found

Display a meaningful Opportunity/Stage 01 not-found state and route back to Opportunity list.

### Permission changed

Show authorization feedback and allow existing auth/access revalidation behavior to handle navigation.

### Version conflict

Follow the explicit canonical-reload flow above.

### Business gate/validation errors

Surface backend error message/code near the attempted operation and preserve relevant local inputs.

### Network/server errors

Do not clear user-entered form data merely because the command failed.

---

## Form/dialog strategy

B3 contains many small mutations. Prefer focused forms or dialogs/drawers for one business operation at a time instead of one giant edit form.

Examples:

- Edit Opportunity details;
- Add Contact;
- Add Contact Method;
- Add Scope;
- Add Referrer;
- Append Intake Record;
- Raise Duplicate Concern;
- Assign Owner;
- Raise Blocker;
- Evaluate Criterion;
- Submit Recommendation;
- Final Decision.

Each form owns temporary local input and calls a parent/orchestration command on submit.

Do not place repository calls inside generic leaf display components.

---

## Suggested frontend boundaries

Exact filenames may follow existing project conventions, but responsibilities should remain separated.

### Opportunity list page

Responsible for list/create/navigation.

### Stage01 workspace page

Responsible for canonical aggregate loading, global error/reload state, and composing operational sections.

### Operational orchestration composable

Responsible for:

- one mutation at a time;
- command execution;
- error state;
- canonical reload after success;
- reusable version/conflict handling.

It must not contain visual rendering.

### Intake section

Responsible for Intake-specific business presentation and dispatching approved commands upward.

### Evaluation section

Responsible for criteria/recommendation/decision presentation and dispatching commands upward.

### Workflow runtime panel

Responsible for node state, gate report, assignments, blockers, and lifecycle-action presentation.

### History panel

Responsible for immutable recommendation/clarification/final-decision/cycle context.

Keep components focused enough that repository behavior can be unit-tested separately from rendered UI.

---

## Permission model

The UI must use exact existing permission codes.

Opportunity:

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

Workflow:

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

Stage 01 evaluation/decision:

```text
stage01.evaluation.update
stage01.recommendation.submit
stage01.clarification.return
stage01.decision.record
stage01.reactivate
```

Do not infer these capabilities from role names.

---

## Responsive design

Desktop:

- Stage progression and primary context remain visible without overwhelming operational forms;
- sections may use two-column layouts where data density benefits.

Tablet/mobile:

- stack operational sections;
- use dialogs/drawers/forms that fit viewport;
- avoid horizontal scrolling for core operations;
- preserve accessible 44px-class interaction targets;
- primary navigation remains usable after adding `Cơ hội`.

B3 is not desktop-only.

---

## Accessibility

Requirements:

- one clear page `h1`;
- semantic headings for Intake/Evaluation/history;
- every field has programmatic label;
- state/gate information not encoded by color alone;
- dialogs keyboard accessible;
- destructive actions require explicit confirmation where appropriate;
- operation pending state is announced/disabled appropriately;
- error feedback uses alert semantics;
- focus returns to useful context after modal actions where practical;
- respect reduced-motion behavior already used by the application shell.

---

## Testing strategy

B3 requires deterministic unit and E2E coverage.

### Unit tests

Cover at minimum:

- bound-snapshot `Stage01Detail.configuration` schema/repository mapping;
- permission/action visibility helpers;
- operational orchestration command → reload behavior;
- version selection for Opportunity, Workflow, and Stage01 commands;
- conflict handling;
- taxonomy code → label helpers;
- latest criterion evaluation/recommendation presentation helpers if introduced.

### Server tests

Because `Stage01Detail` contract changes, update relevant Stage01 repository/service/route/shared-schema tests.

Prove:

- configuration returned by Stage01 detail is from `workflowRuntime.definitionSnapshotId`;
- newer published config does not alter an older bound Opportunity detail;
- existing Stage01 mutation contracts remain unchanged.

### E2E

Use deterministic API interception where possible.

Cover the main operational journey:

```text
Create Opportunity
→ open Stage 01
→ complete required Intake data
→ assign/start/complete 01.1
→ evaluate criteria
→ submit recommendation
→ optional clarification path
→ final decision
→ complete 01.2
→ inspect completed/history state
```

Also cover:

- read-only permissions;
- missing permissions per action;
- blocker preventing completion;
- VERSION_CONFLICT;
- invalid/restore state;
- reactivation;
- mobile layout/no horizontal overflow.

B3 verifies operational UI behavior but does not replace B4 final acceptance/hardening.

---

## Out of scope

B3 must not:

- rename/generalize `stage01_decision_cycles`, `stage01_criterion_evaluations`, `stage01_recommendations`, or `stage01_clarification_returns`;
- generalize `stage01_intake_completion_baselines`;
- redesign Workflow Engine dispatch for node keys `01.1` / `01.2`;
- introduce Stage 02;
- build a generic workflow UI framework;
- add direct application access to workflow taxonomy catalog tables;
- change B2 Business Configuration semantics;
- add production deployment work;
- implement B4 final operational acceptance as a substitute for B3 feature work.

---

## Database and environment boundary

Expected B3 implementation should require **no database migration**.

The only approved server contract change is exposing bound `taxonomies + criteria` already read from the workflow-definition snapshot in `Stage01Detail`.

Cloud DEV mutation is not required merely to build B3 UI.

If implementation discovers that an approved operational command cannot be performed with the existing API/schema, stop and return the missing contract as a blocker rather than silently adding database/runtime architecture.

---

## Definition of Done

B3 is complete when:

1. `/opportunities` uses real OpportunityRepository data and supports authorized creation;
2. `/opportunities/:opportunityId/stage-01` renders the real Stage01 aggregate;
3. existing Opportunity, Workflow, and Stage01 commands are operable through permission-aware UI;
4. Intake and Evaluation gates/state are understandable and actionable;
5. taxonomy/criteria controls use the Opportunity's bound workflow snapshot;
6. Stage01 detail exposes bound `configuration.taxonomies + configuration.criteria` without a DB migration;
7. command success always reloads canonical Stage01 detail;
8. concurrency conflicts never auto-overwrite;
9. historical decision records are visible and not edited in place;
10. responsive/accessibility-critical paths are covered;
11. no Decision Runtime, completion-baseline, Stage 02, generic workflow-builder, or database architecture refactor leaks into B3;
12. fresh unit/server/E2E/application verification passes;
13. implementation is pushed and remote SHA verified for independent GPT review.

---

## Next phase

After B3 is merged, proceed to **B4 — Stage 01 Operational Acceptance & Hardening**.

B4 should validate the complete business journey against Cloud DEV and real operational scenarios; B3 should not expand to absorb that final acceptance phase.