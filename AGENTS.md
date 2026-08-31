# Taskovia repository instructions

## Scope and canonical references

- This file applies repository-wide unless a more specific nested `AGENTS.md` applies.
- System and runtime instructions have higher precedence.
- The canonical collaboration workflow is [docs/ai-workflow/README.md](docs/ai-workflow/README.md).
- Approved task requirements arrive through the [Implementation Packet template](docs/ai-workflow/templates/implementation-packet.md).
- Delivery reports use the [Completion Report template](docs/ai-workflow/templates/completion-report.md), and review fixes use the [Fix Packet template](docs/ai-workflow/templates/fix-packet.md).
- A task packet MAY narrow task scope but MUST NOT silently bypass safety, Git, or environment rules.

## Approved handoff

- A packet with `approval.status: APPROVED` is the approved product and design handoff from Sơn and GPT.
- Sơn sending that packet authorizes Codex to implement after technical preflight succeeds.
- Codex MUST NOT reopen requirement discovery, approved business behavior, or approved architecture.
- Codex MUST NOT create another product plan.
- A bounded task MAY use an internal technical checklist without another approval cycle.
- An architectural task MUST provide `approved_design_ref` and `approved_execution_plan_ref`; otherwise Codex MUST return `BLOCKED`.
- Mandatory runtime skills, TDD, technical planning state, and worker or subagent coordination remain allowed.
- Internal technical reasoning is not a new product approval cycle.

## Source of truth and SHA model

Codex MUST distinguish:

- `analysis_base_sha`: remote commit GPT analyzed.
- `remote_base_sha`: base ref after Codex fetches it.
- `execution_base_sha`: commit from which implementation starts.
- `head_sha`: local implementation HEAD.
- `remote_head_sha`: pushed implementation branch HEAD.

Codex MUST fetch the remote base before implementation. The fetched remote base is the execution source of truth. Codex MUST NOT branch from a local base containing undeclared unpushed commits. A local-only commit MAY be used only when the approved packet lists it as a prerequisite.

## Technical preflight

Use one preflight status:

- `READY`: packet and fetched source match.
- `READY_WITH_NON_MATERIAL_DRIFT`: drift exists but does not invalidate the packet.
- `PACKET_STALE`: material drift requires GPT to refresh the packet.
- `BLOCKED`: safe execution requires a missing decision, permission, or workspace change.

Preflight MUST inspect the repository and remote, base ref, active branch, working tree, active worktrees and branch ownership, local and remote divergence, packet prerequisites, source anchors, dependency and runtime versions, validation command availability, validation targets and side effects, branch collisions, and push capability.

## Material source drift

Drift is material when it changes or invalidates any of these:

- Source anchors or packet assumptions.
- API or data contracts.
- Schema or migration order.
- Authentication, authorization, RLS, or permission behavior.
- Dependency versions or lockfile assumptions.
- Validation commands or applicable `AGENTS.md` instructions.
- Generated types or acceptance criteria.

Non-material drift MAY continue as `READY_WITH_NON_MATERIAL_DRIFT` and MUST be reported. Unrelated formatting, documentation, or isolated code changes do not automatically make a packet stale.

## Git and worktree safety

- One implementation task MUST use one branch.
- Codex MUST NOT commit or push directly to the base branch.
- Codex MUST NOT merge or force-push.
- Codex MUST NOT stash, reset, clean, delete, or overwrite changes outside the approved task.
- Codex SHOULD default to the current clean checkout.
- Codex MUST NOT create a new worktree unless the packet explicitly permits it.
- An existing platform-managed worktree MAY be used only for its exact task.
- If the relevant checkout is dirty, branch ownership is unclear, or another task would be disturbed, Codex MUST return `BLOCKED`.
- Fix rounds MUST continue on the same implementation branch.
- Codex MUST NOT hide a blocker by switching to another checkout or creating an unauthorized worktree.

## Codex decision boundary

Codex MAY decide implementation order, local naming, helper boundaries, file and function decomposition, test organization, scoped refactors required by acceptance criteria, mandatory skill usage, worker or subagent routing, and validation selection within authorized boundaries.

Codex MUST stop when implementation requires:

- Changing approved business behavior, architecture, or API, data, or security contracts.
- Expanding scope materially or adding an unapproved major dependency.
- Running an unauthorized destructive database operation or Cloud DEV mutation.
- Running any production mutation or deployment without separate, current authorization from Sơn.
- Resolving contradictory acceptance criteria by assumption.
- Proceeding despite material source drift.

## Testing and verification

- Behavior changes MUST follow TDD unless the approved packet contains a valid exception.
- Documentation-only tasks do not require synthetic production tests.
- Completion claims MUST have fresh verification evidence.
- Codex MUST NOT claim a command passed if it was not run.
- Baseline failures MUST be distinguished from task-introduced failures.
- Validation MUST be proportionate to task scope.

## Validation side-effect classes

- `read_only`: allowed by default.
- `workspace_mutating`: allowed only when required by the task; resulting tracked changes MUST be reviewed.
- `cloud_dev_mutating`: defaults to false and requires explicit packet authorization.
- `production_mutating`: always requires separate, current authorization from Sơn.
- Deployment and destructive production operations always require separate authorization.

Current command matrix:

| Command | Minimum class | Notes |
| --- | --- | --- |
| `pnpm test:unit` | `read_only` | Local application verification |
| `pnpm test:e2e` | `read_only` | Local browser verification |
| `pnpm typecheck` | `read_only` | Local application verification |
| `pnpm lint` | `read_only` | Local application verification |
| `pnpm build` | `read_only` | Writes ignored build output only |
| `pnpm verify:app` | `read_only` | Unit, typecheck, lint, and build |
| `pnpm db:dev:types` | `workspace_mutating` | May update tracked generated database types |
| `pnpm verify:dev` | `workspace_mutating` | May update tracked generated database types |
| `pnpm db:dev:push` | `cloud_dev_mutating` | Pushes migrations to Supabase Cloud DEV |

`package.json` is the command source of truth. Update this matrix when scripts change.

## Environment safety

- Supabase Cloud DEV is the only supported development database target. If required Cloud DEV access is unavailable or unauthorized, Codex must BLOCK rather than fall back to a Local DB.
- Supabase Cloud DEV and production are separate authorization boundaries.
- A normal implementation packet never implies production database, deployment, or destructive production authorization.
- Secrets MUST NOT be printed or committed.
- A new production dependency requires packet approval.
- Generated files MUST be reviewed when a command updates them.

## Delivery and completion

Default delivery is:

```yaml
push: true
create_pr: false
merge: false
force_push: false
```

Use one completion status:

- `COMPLETE`: approved work is committed, pushed, and remotely verified.
- `PARTIAL`: some approved work or verification remains incomplete.
- `BLOCKED`: safe progress requires an unresolved decision or prerequisite.
- `LOCAL_COMPLETE_PUSH_BLOCKED`: local commits are complete but remote delivery failed.

`COMPLETE` requires `git ls-remote` or an equivalent query to confirm `remote_head_sha == head_sha`. A push failure after a valid local commit MUST use `LOCAL_COMPLETE_PUSH_BLOCKED`. Codex MUST NOT claim CI passed when CI does not exist or no run was observed.

## Review loop

- GPT performs independent remote review using immutable SHAs and reviews `execution_base_sha..head_sha`.
- Canonical review identifiers are `MERGE`, `MERGE_WITH_FOLLOW_UP` ("MERGE WITH FOLLOW-UP"), `CHANGES_REQUIRED` ("CHANGES REQUIRED"), and `DO_NOT_MERGE` ("DO NOT MERGE").
- Codex MUST NOT merge.
- A Fix Packet MUST continue on the same branch and reference the exact reviewed `head_sha`.
- Sơn retains the final merge decision.
