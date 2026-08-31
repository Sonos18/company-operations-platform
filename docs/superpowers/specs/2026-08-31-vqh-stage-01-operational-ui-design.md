# VQH Stage 01 Operational UI — Design Specification

## Status

- Product/design status: **APPROVED by Sơn in chat on 2026-08-31**
- Approved approach: **A — Opportunity-centric Stage 01 Workspace**
- Design branch: `docs/vqh-stage-01-operational-ui-design`
- Analysis base: `main@431760676e446ae6dff3372acc7f20e31f093082`
- Implementation phase: **B3 — Stage 01 Operational UI**

## Goal

Build the real operational UI for VQH Stage 01 so authorized employees can create and manage Opportunities, operate sub-stages `01.1` Intake and `01.2` Evaluation, observe gates/workflow state, execute existing approved commands, and review immutable decision history.

B3 is the UI/application layer over the already-implemented Opportunity, Workflow, and Stage01 backends. It must not redesign the database or Workflow Engine.

---

## Product boundary

Stage 01 operates on an **Opportunity**, not on a Project.

Approved routes:

```text
/opportunities
/opportunities/:opportunityId/stage-01
```

The `Cơ hội` workspace is the entry point for pre-project business intake and evaluation. Do not place Stage 01 operational work under `/projects` because an Opportunity may be rejected and never become a Project.

---

## Architectural approach

B3 uses one Opportunity-centric workspace for the complete Stage 01 lifecycle.

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

Do not build a generic workflow renderer or generic workflow builder. Stage-specific presentation is acceptable over reusable Opportunity/Workflow APIs.

---

## Existing backend contracts

B3 must reuse the existing repositories.

### OpportunityRepository

Existing capabilities include:

- list/get/create/update Opportunity;
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
- start/complete/reopen/revalidate node;
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

## Required operational detail contract extension

The operational UI must render taxonomy labels/options and criterion definitions from the exact workflow-definition snapshot bound to the Opportunity.

The server repository already loads `workflow_definition_snapshots.definition` using `workflowRuntime.definitionSnapshotId` to calculate gates and actor capabilities. B3 must expose the relevant bound business definition in the Stage 01 operational response rather than call the B2 latest-config API.

Approved response shape:

```ts
interface Stage01OperationalDetail extends Stage01Detail {
  configuration: {
    taxonomies: Stage01BusinessTaxonomies
    criteria: Stage01Criteria
  }
}
```

### Shared-schema composition rule

`shared/schemas/stage01-config.ts` currently imports definitions from `shared/schemas/stage01.ts`. Therefore B3 **must not** solve the response extension by importing `stage01-config.ts` back into `stage01.ts`, which would create a circular schema dependency.

Preferred composition:

```text
shared/schemas/stage01.ts
        ↓
shared/schemas/stage01-config.ts

stage01.ts ─────────────┐
                       ├─> shared/schemas/stage01-operational.ts
stage01-config.ts ─────┘
```

Preferred new composition schema:

```ts
// conceptual contract
export const stage01OperationalDetailSchema = stage01DetailSchema.extend({
  configuration: z.object({
    taxonomies: stage01BusinessTaxonomiesSchema,
    criteria: stage01CriteriaSchema,
  }).strict(),
}).strict()

export type Stage01OperationalDetail = z.infer<typeof stage01OperationalDetailSchema>
```

`Stage01Repository.get()` and the Stage01 GET route may move to `Stage01OperationalDetail` while existing lower-level Stage01 schema exports remain compatible.

Do not broadly relocate shared schemas unless implementation proves the narrow composition file is insufficient.

### Bound-snapshot rules

- `configuration` comes from the Opportunity's bound `workflow_definition_snapshots` row;
- do not call `Stage01ConfigRepository.get()` to populate controls for an existing Opportunity;
- do not use `workflow_taxonomy_values` directly from application code;
- no database migration is required;
- historical Opportunities continue to render the configuration they were created against after newer Stage 01 configuration is published;
- server tests must prove that a newer published definition does not reinterpret an older bound Opportunity.

This is a hard B3 invariant.

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

Unlike B2 configuration, this is operational navigation and belongs in the primary workspace model. Mobile navigation may adapt its layout to accommodate the new item without becoming a generic navigation redesign.

---

## Opportunity list page

Route:

```text
/opportunities
```

### Read behavior

For users with `opportunity.read`:

- load real Opportunities through `OpportunityRepository.list()`;
- show primary customer name, need/summary where available, valid/invalid state, and last-updated context;
- link each row/card to `/opportunities/:id/stage-01`;
- provide loading, empty, retry, and error states.

### Create behavior

For users with `opportunity.create`:

- expose `Tạo cơ hội`;
- use the existing `CreateOpportunityInput` contract;
- prioritize `primaryCustomerName` and expose approved optional current Opportunity fields;
- taxonomy-backed selects for **new Opportunity creation** may use the currently published Stage 01 configuration from `Stage01ConfigRepository.get()`;
- creation goes through `OpportunityRepository.create()`;
- on success navigate directly to the returned `opportunityId` Stage 01 workspace.

The latest config may be used only to help create a new Opportunity. Existing Opportunities must use their bound snapshot from `Stage01OperationalDetail.configuration`.

---

## Stage 01 workspace page

Route:

```text
/opportunities/:opportunityId/stage-01
```

Minimum route permissions:

```text
opportunity.read
journey.read
```

Use existing page-meta/access middleware semantics.

Load canonical data through `Stage01Repository.get(opportunityId)`. Do not independently load Opportunity + Workflow + Stage01 and recombine them in the page when the Stage01 operational detail is already server-authoritative.

---

## Workspace information architecture

### 1. Opportunity header

Display:

- primary customer name;
- validity state;
- need summary;
- current Stage 01 progress;
- current decision cycle number;
- warning when revalidation or a blocking condition exists.

Top-level actions are permission-specific:

- edit — `opportunity.update`;
- invalidate — `opportunity.invalidate`;
- restore — `opportunity.restore`;
- reactivate Stage 01 — `stage01.reactivate` plus valid backend state/capability.

### 2. Stage progression

Show both nodes:

```text
01.1 Tiếp nhận
01.2 Đánh giá
```

For each node show canonical state, execution number, revalidation state, accountable owner, blocking blocker count, and gate summary.

Progression is informational/navigation within the same page; it does not invent transitions.

### 3. Intake workspace — 01.1

Contains:

- current Opportunity information;
- Contacts / Primary Contact / usable methods;
- Scopes;
- Referrers / Primary Referrer;
- Intake Records and correction history;
- Duplicate Concerns;
- validity state;
- assignments;
- blockers;
- Intake gate report;
- permitted node start/complete/reopen/revalidate actions.

### 4. Evaluation workspace — 01.2

Contains:

- criterion definitions from bound configuration;
- latest evaluation per criterion and revision/history context;
- recommendation history/current recommendation;
- clarification-return history;
- final decision;
- decision-authority context exposed by the cycle;
- assignments;
- blockers;
- Evaluation gate report;
- permitted node start/complete/reopen/revalidate actions.

### 5. History / completed state

Historical records remain visible and immutable:

- criterion revisions;
- recommendation versions;
- clarification returns;
- final decision/rationale;
- reactivation reason/current cycle number;
- completed execution/cycle context available from current contracts.

B3 does not add a history-edit API.

---

## Opportunity editing in Intake

Editable current fields may include existing Opportunity schema fields such as customer type, need, location, lead source, engagement status, budget, timeline, and priority.

Taxonomy controls must render code → label from `Stage01OperationalDetail.configuration.taxonomies`.

Save through `OpportunityRepository.update()` with `expectedOpportunityVersion` from the latest canonical detail. After success reload the Stage01 operational detail.

Do not locally patch gates/runtime/cycle data as if client state were authoritative.

---

## Contacts

Support existing Contact/Opportunity relationship flows:

- create Contact;
- add/update Contact Method;
- link Contact;
- set Primary Contact;
- end contact relationship.

Mutation permission:

```text
opportunity.contact.manage
```

Read-only users see relationships but no mutation controls. Intake gate messages explain missing Primary Contact/usable method requirements.

---

## Scopes

Support add/retire scope using existing contracts. Preserve retired history read-only.

Permission:

```text
opportunity.scope.manage
```

Scope options come from bound `configuration.taxonomies.scope`.

---

## Referrers

Support add, set-primary, and end referrer relationship.

Permission:

```text
opportunity.referrer.manage
```

Referrer-type options and lead-source behavior come from the bound definition. Do not use latest B2 config for an existing Opportunity.

---

## Intake Records

Intake Records are append/correct history, not freely mutable rows.

Support:

- append channel + summary;
- correct an existing record through the existing correction contract;
- display correction relationship/history.

Permission:

```text
opportunity.intake_record.create
```

Do not rewrite historical records in place.

---

## Duplicate Concerns

Support raise/resolve flows through existing contracts.

Permissions:

```text
opportunity.duplicate.raise
opportunity.duplicate.resolve
```

For `same_need`, canonical Opportunity remains required by the existing schema. Server validation is authoritative.

---

## Opportunity invalidation / restore

Permissions:

```text
opportunity.invalidate
opportunity.restore
```

Invalidation uses bound invalid-reason taxonomy for an existing Opportunity. Invalid Opportunities remain inspectable.

---

## Workflow node actions

Use `WorkflowRepository` and exact runtime versions.

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

Send `expectedExecutionVersion` from current node runtime.

### Complete 01.1

Send exactly:

```text
expectedExecutionVersion
expectedOpportunityVersion
```

### Complete 01.2

Send exactly:

```text
expectedExecutionVersion
expectedCycleVersion
```

### Reopen

Require explicit reason + current execution version.

### Revalidate

Require explicit reason + non-empty evidence + current execution version.

After every successful workflow command, reload Stage01 operational detail.

---

## Assignment UI

Assignments are runtime history, not a single mutable owner field.

Display active accountable owner and contributors separately from ended assignments.

Use existing employee/directory data if available for assignee selection; do not invent another identity store.

Do not assume the current frontend user is the owner.

---

## Blockers

Show open and resolved blockers for each node.

Raise fields:

- effect;
- category from bound `blocker_category` taxonomy;
- description;
- optional responsible user;
- current execution version.

Resolve with resolution text and the required current version.

Canonical node state must come from server reload, not from a local blocker calculation.

---

## Criterion evaluation

Definitions come from the bound snapshot.

Display label, description, dimension, criticality, applicability rules, latest evaluation, and revision/history context.

Permission:

```text
stage01.evaluation.update
```

Command fields:

```text
expectedCycleVersion
applicability
result
rationale
evidence
```

UI may mirror shared-schema validation for immediate feedback, including:

- applicable → result required;
- not applicable → result null;
- rationale or evidence required;
- `allowsNotApplicable` respected from the bound criterion.

Backend remains authoritative.

---

## Recommendation

Permission:

```text
stage01.recommendation.submit
```

Values:

```text
recommend_proceed
recommend_not_proceeding
```

Require rationale and current cycle version. Preserve recommendation history.

B3 does not invent file-upload evidence storage.

---

## Return for clarification

Permission:

```text
stage01.clarification.return
```

Requires current recommendation ID, reason, and cycle version. Clarification records a new history item; it does not edit the previous recommendation.

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

Require rationale and cycle version. If backend requires `overrideRationale`, collect it explicitly; do not auto-generate it.

Recorded final decision is immutable in B3 UI.

---

## Reactivation

Permission:

```text
stage01.reactivate
```

Use exact canonical versions:

```text
expectedOpportunityVersion
expectedExecutionVersion
expectedCycleVersion
reason
```

After success reload canonical detail and show the new execution/cycle while keeping prior history intact.

---

## Actor capabilities

`actorCapabilities` reflects bound workflow capability mapping for the current actor.

Use explicit permissions for action visibility and additionally require a bound actor capability where the workflow definition models that action.

Do not replace permission checks with a generic capability-array check. Server authorization remains authoritative.

---

## Canonical reload model

B3 follows command → reload:

```text
Stage01OperationalDetail
      ↓
user command
      ↓
Opportunity / Workflow / Stage01 repository
      ↓
success
      ↓
Stage01Repository.get(opportunityId)
      ↓
replace canonical rendered aggregate
```

Do not manually mutate gate results, runtime phases, versions, blockers, recommendation/final-decision state after commands.

Local form input may be temporary; canonical aggregate state comes from the server.

---

## Optimistic concurrency

Use the version owned by the aggregate/runtime being mutated:

- Opportunity update → `opportunity.version`;
- node operations → `runtime.version`;
- evaluation/recommendation/decision → `currentDecisionCycle.version`;
- reactivation → Opportunity + execution + cycle versions.

On `VERSION_CONFLICT`:

- never auto-retry/overwrite;
- show clear conflict feedback;
- allow explicit canonical reload;
- preserve local form input until user intentionally reloads/discards where safe.

---

## Gate presentation

Show overall gate satisfaction plus each server-returned check:

```text
satisfied
missing
blocked
needs_revalidation
```

Display message and useful resource reference.

UI may disable obviously invalid completion from current gate report, but server command result remains authoritative.

---

## Error handling

- initial load failure → blocking error + retry;
- not found → meaningful state + route back to Opportunity list;
- permission changed → authorization feedback + existing access revalidation behavior;
- version conflict → explicit canonical-reload flow;
- business gate/validation error → show near attempted action and preserve relevant input;
- network/server failure → keep user-entered form data.

Do not render fabricated empty operational state after a failed canonical load.

---

## Form/dialog strategy

Prefer focused forms/dialogs/drawers for one operation at a time instead of one giant form.

Examples:

- edit Opportunity;
- add Contact/Method;
- add Scope/Referrer/Intake Record;
- raise Duplicate Concern;
- assign owner/contributor;
- raise blocker;
- evaluate criterion;
- submit recommendation;
- final decision.

Leaf display/form components must not own repository networking directly.

---

## Suggested frontend boundaries

### Opportunity list page

List/create/navigation.

### Stage01 workspace page

Canonical load, global error/reload, compose operational sections.

### Operational orchestration composable

One mutation at a time, command execution, canonical reload, conflict/error state, version input assembly.

### Intake section

Opportunity/Contact/Scope/Referrer/Intake/Duplicate presentation and command dispatch.

### Evaluation section

Criterion/recommendation/clarification/final-decision presentation and command dispatch.

### Workflow runtime panel

Node state, gates, assignments, blockers, lifecycle actions.

### History panel

Immutable recommendation/clarification/final-decision/cycle context.

Keep components focused enough to test orchestration separately from rendering.

---

## Permission model

Use exact existing codes.

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

Stage 01:

```text
stage01.evaluation.update
stage01.recommendation.submit
stage01.clarification.return
stage01.decision.record
stage01.reactivate
```

Do not infer permissions from role names.

---

## Responsive and accessibility requirements

B3 must work in the existing authenticated responsive shell.

- desktop may use denser two-column operational layouts;
- tablet/mobile stack sections and avoid horizontal scrolling for core operations;
- primary navigation remains usable with `Cơ hội`;
- one clear `h1` per page;
- semantic section headings;
- programmatic labels for fields;
- gate/state meaning not conveyed by color alone;
- keyboard-accessible dialogs;
- explicit confirmation for destructive actions;
- alert semantics for errors;
- pending/busy states;
- preserve reduced-motion behavior.

---

## Testing strategy

### Unit/shared/server

Cover at minimum:

- operational detail composition schema;
- bound-snapshot configuration mapping;
- newer published definition does not alter an older bound Opportunity response;
- Stage01 existing mutation contracts remain unchanged;
- permission/action visibility helpers;
- operational command → canonical reload behavior;
- version selection for Opportunity/Workflow/Stage01 commands;
- conflict handling;
- taxonomy code → label helpers.

### E2E

Use deterministic API interception where practical.

Cover the main journey:

```text
Create Opportunity
→ open Stage 01
→ complete required Intake data
→ assign/start/complete 01.1
→ evaluate criteria
→ submit recommendation
→ optional clarification
→ final decision
→ complete 01.2
→ inspect completed/history state
```

Also cover read-only permissions, missing action permissions, blocker behavior, conflict, invalid/restore, reactivation, and mobile/no-horizontal-overflow behavior.

B3 verifies feature behavior; B4 remains the final operational acceptance/hardening phase.

---

## Out of scope

B3 must not:

- rename/generalize Stage 01 Decision Runtime tables;
- generalize completion baseline storage;
- redesign Workflow Engine dispatch for `01.1` / `01.2`;
- introduce Stage 02;
- build a generic workflow UI framework;
- add direct application access to taxonomy catalog tables;
- change B2 Business Configuration semantics;
- add production deployment work;
- absorb B4 final operational acceptance.

---

## Database and environment boundary

Expected B3 implementation requires **no database migration**.

The approved server change is only to expose bound taxonomies/criteria already read from the immutable workflow-definition snapshot in the Stage 01 operational detail response.

Cloud DEV mutation is not required merely to implement B3.

If an approved operational action cannot be implemented with existing API/schema contracts, stop and report the missing contract rather than silently adding database/runtime architecture.

---

## Definition of Done

B3 is complete when:

1. `/opportunities` uses real OpportunityRepository data and supports authorized creation;
2. `/opportunities/:opportunityId/stage-01` renders the real Stage01 operational aggregate;
3. existing Opportunity, Workflow, and Stage01 commands are operable through permission-aware UI;
4. Intake and Evaluation gates/state are understandable and actionable;
5. taxonomy/criteria controls use the Opportunity's bound workflow snapshot;
6. operational detail exposes bound `configuration.taxonomies + configuration.criteria` without DB migration or schema import cycle;
7. command success reloads canonical Stage01 detail;
8. concurrency conflicts never auto-overwrite;
9. historical decision records are visible and immutable;
10. responsive/accessibility-critical paths are covered;
11. no Decision Runtime, completion-baseline, Stage 02, generic workflow-builder, or DB architecture refactor leaks into B3;
12. fresh unit/server/E2E/application verification passes;
13. implementation is pushed and remote SHA verified for independent GPT review.

---

## Next phase

After B3 is merged, proceed to **B4 — Stage 01 Operational Acceptance & Hardening**. B4 validates the complete business journey against Cloud DEV and real operational scenarios; B3 should not expand to absorb that phase.