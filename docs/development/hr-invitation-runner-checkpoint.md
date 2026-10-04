# HR invitation retention diagnosis checkpoint — 2026-10-04
Engineering runs only on InstaCloud dev-worker-recovery through the laptop official CLI. Worktree /data/remote-worktrees/hr-invite-reissue; branch fix/hr-invite-reissue-profile; HEAD 88c74cf7b28eb5b58e8fb07e0866ad012692f316; base main 1011c2b9786448c687e1516e2c58afbbe59b8c06. Preserve unrelated work and the existing dependency link.

## Approved release decision
The user explicitly chose release based on passed rollback evidence, with multi-session concurrency deferred and zero committed fixtures/retained anchors. Only migration 20261004140132 and the HR application fix are authorized for this rollout. No cost-workflow migration or real-account/Auth-policy change is included. Historical retention inventory below explains the rejected persistent-fixture design; it is not authorization. Race actor/probe/committing builders have been excluded from release and preserved in the pre-finalization patch artifact.

## Current boundary
Only synthetic rollback testing is executable. No persistent fixture, migration application, publication, real-account/email operation, Auth-policy change, trigger bypass, or history deletion occurred. The original fix's prior validation remains in its original artifacts; new runner validation is separate.
Audit plus five anchors was approved. The additional 15 rows below and residual tenant visibility were not approved; the user selected zero retained fixtures. Permanent concurrency/cleanup and setup/reset/verify SQL builders fail before reading credentials or HTTP. The independent cleanup/verify SQL files also raise the role-history blocker. Only ordered-case builders are included; no concurrent actor/probe/committing builder is exported. This is not a completed committed-concurrency rollout gate.

## Complete retention closure for this fixture design
The hosted catalog was saved to /data/remote-jobs/hr-fixture-fk-trigger-closure-20261004.json and /data/remote-jobs/hr-retention-functions-policies-20261004.json.
Audit UPDATE/DELETE always raises AUDIT_EVENTS_APPEND_ONLY. Audit company FK is RESTRICT. Audit actor FK is SET NULL, but that UPDATE is forbidden.
Every company_role_assignments DELETE raises ROLE_ASSIGNMENT_HISTORY_REQUIRED, even when revoked. Assignment RESTRICT FKs preserve roles, company memberships, grantor/revoker Auth users; memberships preserve tenant memberships and subject Auth users; companies preserve tenants.
All incoming FKs to every fixture relation are checked using the entire composite-key join, before and after deactivation. Unexpected auth sessions/identities, private audit-token rows, cross-company references, or any other external dependency fail the rehearsal. The scoped triggers' definitions and functions are hashed before/after rollback and must match.

Successful full lifecycle predicts exactly 20 non-audit rows plus 66 audit rows owned by the single request_id:
| Relation | Count | Exact logical set / final condition |
| --- | ---: | --- |
| tenants | 2 | A/B; names mark the run |
| companies | 2 | A/B; no active memberships |
| auth.users | 3 | actor A, target A, actor B; synthetic .invalid emails, run metadata; no passwords, confirmations, sign-ins, sessions or provider identities |
| tenant_memberships | 3 | actor A→tenant A, target→tenant A, actor B→tenant B; retained existence and employee role array |
| company_memberships | 3 | same subjects in companies A/A/B; is_active=false |
| roles | 3 | employee A, operator A, operator B; is_active=false; all permission links removed; non-system/non-privileged |
| company_role_assignments | 4 | operator A, operator B, target original base grant, target regrant between offboard orders; all revoked |
| audit_events | 66 | successful setup/checks/ten sequential operation orders/deactivation; exact request_id, actor null or actor A; immutable |

UUID prefixes A=8a041004-0000-4000-8000-, B=8b041004-0000-4000-8000-.
Auth actor suffix 000000000001, target A suffix 000000000002; tenants suffix 000000000010; companies suffix 000000000020; employee role A suffix 000000000301; operator role A/B suffix 000000000302.
Assignment IDs are generated; identify the four histories by subject/role plus run-owned company and record them in the evidence. Target regrant is necessary to exercise both offboarding orders without deleting history.
Previously approved five anchors are two tenants, two companies, actor A. The other 15 non-audit rows are four assignments + three roles + three company memberships + three tenant memberships + target and actor B Auth users.
Employees, private details, departments, positions, and role-permission links are fully removed inside rehearsal before rollback.

## Disabled access conditions and residual visibility
All company memberships inactive, all assignments revoked, roles inactive, zero role permission links. For each of the three synthetic subjects, helper checks reject company membership and account.invite/employee.create. Actual authenticated-role RLS checks show zero companies, roles, assignments, or active company memberships.
Tenant membership has no is_active column. is_tenant_member remains true; authenticated RLS can read one own tenant, own tenant membership and own inactive company membership per subject. Do NOT claim no membership or zero database visibility. No supported fixture-only tenant deactivation exists under the current product contract. These identities cannot log in through the created fixture data: no password, confirmation, provider identity or session is provisioned. No new Auth policy or security change is proposed.

## Rollback verification
pnpm db:dev:hr:rehearse performs: empty/unapplied baseline → exact forward migration inside transaction → fixture + rejection assertions → ten sequential production-RPC operation orders → full FK closure → revoke/remove scoped business rows → exact retention and authenticated RLS checks → ROLLBACK → independent read-only zero-row verification.
The complete rehearsal already passed with run e84331f5-17a9-4496-979e-7c0ce17164c6, job 9a3c11ec-ec36-4116-b46e-c9a38596a484: predicted 20+66, all 13 scoped relation counts zero afterward, migration unapplied, function hash 38937d0dc8c398b1a921ad89006495b8 and scoped guard hash 596074d768e3946c7b1459ef972def04 unchanged. Final artifact validation will name its exact later source fingerprint.

Timeouts retained: lock 5s, statement 12s, transaction 15s, HTTP 20s including body consumption, total 180s; transaction-local settings only. The extra baseline/post-rollback requests fit the same total deadline. Any uncertain transport or failed reconciliation blocks publication.

## Smaller no-persistence concurrency assessment and release choice
A second connection cannot see the first transaction's uncommitted fixture rows. Exported snapshots also omit another transaction's own writes. Duplicate isolated fixtures test different employee rows; shared uncommitted parent IDs cause uniqueness/FK insertion waits and failure after rollback, not the required HR reissue-versus-edit contention. Merely observing a lock would not prove the intended production RPC race.
No existing real account/company may be reused under this task. Management API requests do not provide an owned pinned multi-request transaction session. No feasible equivalent no-committed-fixture test was found under these boundaries.
A smaller committed-only test could omit foreign tenant B (already covered by rollback assertions), but still needs unapproved assignment/membership/Auth parents; it is a different unvalidated design and not a zero-persistence solution. Do not silently change fixture scope.
Recommended parent choice: release using the original fix validation plus complete rollback lifecycle, explicitly defer multi-session concurrency, and retain no fixtures. Otherwise obtain one approval covering the complete 20-row set + successful 66-row audit bound and residual tenant visibility, then finish/review the committed concurrency lifecycle before executing it. Existing five-anchor approval is insufficient. The user selected the recommended zero-retention release; parent reserved the rollout window. Permanent fixture modes remain disabled.
