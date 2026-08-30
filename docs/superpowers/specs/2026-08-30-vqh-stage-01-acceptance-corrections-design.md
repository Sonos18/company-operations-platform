# VQH Stage 01 Phase A Acceptance Corrections — Technical Design

> **Status:** APPROVED — reviewed by Sơn on 2026-08-30
> **Approved direction:** Forward-only corrective migration and real acceptance evidence
> **Reviewed implementation:** `feat/vqh-stage-01-foundation@78bf5151f3c46527f53350edd18a79f7f1778677`
> **Scope:** Correct the four verified runtime defects and one concurrency-evidence gap only

## 1. Purpose

This correction closes five findings without redesigning the approved VQH Stage 01 Phase A architecture:

1. the Cloud DEV concurrency harness proves only advisory-lock contention, not Stage 01 optimistic concurrency;
2. Opportunity taxonomy codes are not checked against the immutable definition bound to the workflow;
3. the immutable 01.1 completion baseline omits evidence used by the completion gates;
4. revalidation evidence cannot pass through the strict HTTP contract and is optional in PostgreSQL;
5. an Opportunity invalidated with `duplicate_merged` semantics can be restored without explicit separation or correction evidence.

The correction preserves Opportunity as the Stage 01 aggregate root, the reusable Workflow Core, immutable definition snapshots, explicit public RPCs, user-scoped Supabase request paths, RLS, permission checks, and append-only history.

## 2. Non-goals and boundaries

The correction does not:

- resolve or infer `BDG-TAX-01`, `BDG-EVAL-01`, `BDG-AUTH-01`, or `BDG-HIER-01`;
- publish production taxonomy values or a production company definition;
- create Project, Project Manager assignment, Stage 02 runtime, or canonical parent Stage 01 runtime;
- redesign or migrate the Project Journey or Stage 01 UI;
- add a concrete Decision Authority resolver or operational role mapping;
- add a generic RPC proxy or use `service_role` on normal request paths;
- edit migrations `20260829120100` through `20260829120800`;
- mutate production or deploy the application.

## 3. Delivery strategy

All database corrections are delivered in one new forward-only migration created with the repository's Supabase migration command. One migration avoids exposing the shared Cloud DEV project to an intermediate state in which contracts and replacement functions disagree.

The migration may:

- add current invalidation metadata columns and constraints to `public.opportunities`;
- add private taxonomy lookup/assertion helpers;
- replace the affected private command implementations with `create or replace function`;
- preserve every existing public RPC name and SQL signature;
- add or replace private guards required by the corrected contracts.

It must not rewrite an existing immutable completion baseline. Previously committed baseline rows remain historical facts. The corrected snapshot format applies to new 01.1 completions and carries an explicit `schemaVersion`.

Shared TypeScript schemas, services, repositories, route adapters, fixed Cloud DEV SQL fixtures, generated database types, and focused tests are updated in the same fix round.

## 4. Cross-cutting invariants

Every corrected command continues to:

- authenticate the actor from PostgreSQL request claims;
- resolve active tenant/company membership and permission at execution time;
- scope every resource by tenant and company;
- lock the owning aggregate before checking its expected version;
- return `VERSION_CONFLICT` for a stale owning version;
- write the domain event and audit record in the same transaction;
- expose no direct authenticated DML on protected Stage 01 relations;
- use the workflow's bound immutable definition, never the company's latest definition, for in-flight runtime behavior.

No new stable public error code is introduced. A supplied taxonomy code that does not exist in the bound definition is a semantically invalid request and returns `INVALID_COMMAND_INPUT`.

## 5. Real Stage 01 concurrency evidence

### 5.1 Harness contract

The fixed Cloud DEV concurrency harness continues to use separate Management API database-query requests so each actor receives a distinct PostgreSQL session. Advisory locks are removed from actor behavior.

Each actor SQL file must:

1. begin a transaction;
2. set the fixed authenticated actor claims locally;
3. call the same public Stage 01 RPC as the competing actor;
4. supply the same deterministic aggregate ID and expected version;
5. commit only if the public RPC succeeds.

The JavaScript harness runs both actors concurrently. It requires:

- exactly one successful database-query response;
- exactly one failed response whose parsed, allowlisted database message is `VERSION_CONFLICT`;
- no logging of the raw Management API response body;
- a successful final-state assertion;
- mandatory cleanup in `finally`, with cleanup failure taking precedence over the race result.

The harness no longer treats one fulfilled and one rejected Promise as sufficient evidence by itself.

### 5.2 Required fixed race scenarios

The acceptance inventory covers the concurrency cases named by the approved Technical Spec:

- stale Opportunity update;
- simultaneous Primary Contact replacement;
- simultaneous Primary Referrer replacement;
- duplicate-resolution race;
- stale Contact mutation;
- double 01.1 Complete;
- stale Node Execution mutation, including assignment or blocker mutation;
- double Final Decision;
- double Reactivation.

Each scenario owns deterministic setup, actor A, actor B, assertion, and cleanup SQL. The runner accepts no operator-provided SQL path, identifier, project ref, or extra argument.

### 5.3 Final-state assertions

Every scenario asserts, as applicable:

- the owning version increased exactly once;
- exactly one current relationship, assignment, decision, completion, or new cycle exists;
- the losing mutation left no event, audit, baseline, history, or partial aggregate row;
- prior immutable history remains unchanged;
- every namespaced fixture row is removed after the test.

This evidence replaces the prior advisory-lock claim and is required before `AC-S01-09` can return to `PASS`.

## 6. Immutable-definition taxonomy validation

### 6.1 Runtime authority

TypeScript continues to represent company-configurable codes as non-empty strings. Zod does not attempt to build a global enum from unresolved business catalogs.

PostgreSQL is the final authority. A private helper resolves a taxonomy entry from a supplied immutable definition:

```text
private.stage01_taxonomy_entry(
  definition jsonb,
  taxonomy_key text,
  supplied_code text
) -> jsonb
```

For a non-null supplied code, the helper requires:

- the taxonomy key exists as an array in the bound snapshot;
- exactly one entry has the supplied code;
- the entry has a non-empty code and label;
- its optional `semanticKey` and `behavior` retain their snapshotted meaning.

Missing keys, missing codes, or duplicate matches fail closed with `INVALID_COMMAND_INPUT`. Null remains valid only where the command contract makes the field optional.

### 6.2 Field mapping

The database command boundary validates these mappings whenever the corresponding field is supplied:

| Input or persisted field | Snapshot taxonomy key |
| --- | --- |
| `customerTypeCode` | `customer_type` |
| `relationshipCode` | `contact_relationship` |
| `scopeCode` | `scope` |
| `primaryLeadSourceCode` | `lead_source` |
| `referrerTypeCode` | `referrer_type` |
| `engagementStatusCode` | `engagement_status` |
| `invalidReasonCode` | `invalid_reason` |
| `budgetStatusCode` | `budget_status` |
| `timelineStatusCode` | `timeline_status` |
| `priorityCode` | `priority` |
| `channelCode` | `intake_channel` |
| blocker `categoryCode` | `blocker_category` |

Bootstrap validates input codes against the definition selected and bound within the bootstrap transaction. Every later Opportunity, relationship, intake, blocker, invalidation, and restore command resolves the definition through the existing Opportunity workflow instance.

### 6.3 Completion defense in depth

Complete 01.1 resolves the persisted Lead Source entry from the bound snapshot before evaluating its behavior. An unknown persisted code is never interpreted as `requiresReferrer = false`.

The completion command also revalidates every gate-relevant persisted taxonomy code. This protects historical or privileged test data even when normal commands already prevent invalid codes from entering the aggregate.

## 7. Versioned explicit 01.1 baseline

### 7.1 Snapshot shape

New completion baselines use a deterministic payload with `schemaVersion: 1`:

```json
{
  "schemaVersion": 1,
  "opportunity": {
    "id": "uuid",
    "primaryCustomerName": "text",
    "customerTypeCode": "code",
    "needDescription": "text",
    "locationStatus": "unknown",
    "primaryLeadSourceCode": "code",
    "engagementStatusCode": "code"
  },
  "primaryContact": {
    "relationshipId": "uuid",
    "contactId": "uuid",
    "relationshipCode": "code"
  },
  "usableContactMethods": [
    {
      "contactMethodId": "uuid",
      "contactId": "uuid",
      "methodType": "phone",
      "isUsableAtCompletion": true
    }
  ],
  "activeScopes": [
    { "scopeId": "uuid", "scopeCode": "code" }
  ],
  "primaryReferrer": null,
  "intakeRecordRefs": [
    { "intakeRecordId": "uuid", "channelCode": "code", "createdAt": "timestamp" }
  ],
  "intakeOwnerAssignment": {
    "assignmentId": "uuid",
    "assigneeUserId": "uuid",
    "assignedAt": "timestamp"
  },
  "gates": {
    "opportunityValid": true,
    "meaningfulNeed": true,
    "hasPrimaryContact": true,
    "hasUsableContactMethod": true,
    "hasActiveScope": true,
    "hasIntakeRecord": true,
    "noOpenBlockingBlocker": true,
    "noUnresolvedDuplicateConcern": true,
    "leadSourceRequiresReferrer": false,
    "conditionalReferrerSatisfied": true,
    "actorHadCompletionPermission": true,
    "executionWasActive": true
  },
  "completion": {
    "actorId": "uuid",
    "completedAt": "timestamp",
    "opportunityVersion": 1,
    "executionVersion": 3
  }
}
```

The actual snapshot contains no Contact Method value such as a phone number or email address. References, method type, and `isUsableAtCompletion` are sufficient evidence and minimize duplicated personal data.

### 7.2 Determinism and atomicity

The command captures one `completion_at` timestamp and uses it for the execution transition, completion event, baseline evidence, and audit context. Arrays use explicit stable ordering by creation timestamp and ID. Optional values are represented consistently as `null` or an empty array, never omitted unpredictably.

The existing event-first order remains unchanged:

1. lock Opportunity and execution;
2. check versions and all gates;
3. capture the explicit snapshot in local variables;
4. transition the execution;
5. insert the completion event carrying the preallocated baseline ID;
6. insert the immutable baseline linked to that event;
7. insert audit evidence;
8. commit atomically.

The SHA-256 hash continues to cover the complete JSONB snapshot.

### 7.3 Historical proof test

After a successful completion, a rollback-wrapped database test changes the Contact Method through its public RPC so it is no longer usable. It may also end the Intake Owner assignment or introduce a later Blocker where state permits. The test proves:

- the prior snapshot and hash are byte-for-byte unchanged;
- the snapshot still names the Contact Method that was usable at completion;
- the owner and gate results remain reconstructable;
- later mutable state cannot rewrite the reason the earlier completion was valid.

## 8. Required revalidation evidence

The shared revalidation input becomes:

```text
reason: non-empty string
evidence: non-empty array
expectedExecutionVersion: non-negative integer
```

`evidence` uses the existing JSON evidence model and does not introduce a new business evidence taxonomy. The array must contain at least one JSON value; future work may narrow individual evidence-item structure through a separately approved contract.

The HTTP repository and Nitro adapter forward the validated payload unchanged. PostgreSQL:

- includes `evidence` in allowed and required keys;
- requires `jsonb_typeof(evidence) = 'array'`;
- requires `jsonb_array_length(evidence) > 0`;
- removes the empty-array fallback;
- records the supplied evidence in the revalidation event and audit context.

Tests cover valid HTTP forwarding, strict rejection of missing or empty evidence, negative public-RPC behavior, and successful revalidation with current valid prerequisites. E2E flow 31 no longer acts as the only evidence because it bypasses the HTTP boundary.

## 9. Duplicate-merged restoration

### 9.1 Current invalidation state

`public.opportunities` gains current invalidation metadata sufficient for a restore decision:

```text
current_invalid_reason_code text null
current_invalid_reason_semantic_key text null
current_invalidation_reason text null
invalidated_by uuid null
invalidated_at timestamptz null
```

Valid Opportunities have all current invalidation fields null. New invalid Opportunities have a complete current invalidation tuple. Append-only audit remains the long-term transition history.

Before adding strict current-state constraints, the migration performs a guarded precondition check for existing invalid Opportunities. It may backfill metadata only when the latest append-only invalidation or same-need duplicate-resolution audit identifies the transition unambiguously. If any invalid row cannot be reconstructed, the migration aborts and reports the affected IDs; it does not invent a reason, semantic key, canonical Opportunity, actor, or timestamp.

### 9.2 Invalidation rules

`invalidate_opportunity` validates `invalidReasonCode` against the bound snapshot and captures its `semanticKey`. If the semantic key is `duplicate_merged`, a valid same-company canonical Opportunity is required.

`resolve_opportunity_duplicate` with `resolution = same_need` records the technical `duplicate_merged` semantic and canonical Opportunity as part of the same atomic mutation. This semantic comes from the approved duplicate-resolution behavior and does not choose a business-facing taxonomy code.

### 9.3 Restore rules

The restore input becomes:

```text
reason: non-empty string
evidence: optional array
expectedOpportunityVersion: non-negative integer
```

For ordinary invalidation semantics, the existing reason and version requirements remain sufficient. For `duplicate_merged` semantics:

- `evidence` is required and non-empty;
- the evidence explicitly supports separation or correction;
- restore atomically clears `canonical_opportunity_id`, clears current invalidation state, changes validity to `valid`, increments the Opportunity version, and writes the evidence to audit.

Missing current invalidation metadata, missing separation evidence, a stale version, or an invalid canonical relationship fails closed. The command never infers separation from a free-text reason alone.

## 10. Test strategy

Implementation follows TDD for each finding.

### 10.1 Focused red tests

- concurrency actors contain a real public RPC and the harness rejects an unexpected loser error;
- every supplied taxonomy code absent from the bound snapshot is rejected;
- an unknown Lead Source cannot satisfy 01.1 completion or bypass the Referrer gate;
- the baseline contains every approved evidence group and remains unchanged after later mutable updates;
- revalidation evidence is required by shared schema, HTTP adapter, and public RPC;
- `duplicate_merged` restore without evidence fails and restore with separation evidence succeeds atomically.

### 10.2 Cloud DEV database verification

The fixed rollback-safe Stage 01 SQL suite verifies schema, definition, security, history, commands, and all public-RPC flows. The fixed multi-session harness verifies the real races separately because they require distinct committed sessions.

Cloud DEV setup and cleanup use deterministic namespaced fixtures. No reset, seed, migration repair, dashboard mutation, arbitrary SQL path, Docker, or local Supabase is part of the correction workflow.

### 10.3 Full regression verification

After the corrective migration and tests are complete, verification includes:

```text
guarded Cloud DEV target/auth/status/dry-run/push
Stage 01 rollback-safe SQL suite
real Stage 01 concurrency suite
Cloud DEV generated database types
security and performance advisors
unit tests, typecheck, lint, build
existing browser E2E suite
boundary scan and diff check
remote branch SHA verification
```

## 11. Acceptance impact

The prior result is reclassified until correction evidence exists:

| Acceptance criterion | Current corrective status | Required evidence to restore PASS |
| --- | --- | --- |
| `AC-S01-05` | REOPENED | explicit immutable baseline and post-completion mutation proof |
| `AC-S01-08` | REOPENED | unknown taxonomy cannot alter derived conditional gates |
| `AC-S01-09` | NOT_VERIFIED | real public-RPC multi-session races and final-state assertions |
| `AC-S01-10` | REOPENED | Lead Source and every 01.1 gate fail closed against the bound snapshot |
| `AC-S01-14` | REOPENED | evidence survives shared HTTP contract and is required by DB |
| `AC-S01-19` | REOPENED | regenerated types and fresh full verification after correction |
| `AC-S01-20` | REOPENED | final scope and side-effect audit after the corrective migration |
| `AC-S01-21` | REOPENED | new corrected local and remote HEAD equality |

The implementation branch remains review status `CHANGES_REQUIRED` and delivery status `PARTIAL` until all reopened evidence passes on the corrected remote HEAD.

## 12. Review focus

Review should concentrate on:

- use of the bound immutable definition rather than latest company configuration;
- absence of hard-coded business taxonomy values while preserving technical semantic keys;
- row-lock and version-check order in every real race scenario;
- exact loser error and one-winner persisted state;
- completeness and minimal-PII content of baseline schema version 1;
- preservation of historical baselines, events, audits, cycles, and executions;
- conditional duplicate restore evidence and atomic canonical clearing;
- user-scoped request paths, RLS, direct-private invocation safety, and lack of `service_role`;
- deterministic Cloud DEV cleanup and disclosure of any residue.

## 13. Approval boundary

Approval of this written design authorizes preparation of a corrective execution plan. It does not by itself authorize a Cloud DEV migration push, production mutation, deployment, merge, force-push, or implementation outside the five findings above.
