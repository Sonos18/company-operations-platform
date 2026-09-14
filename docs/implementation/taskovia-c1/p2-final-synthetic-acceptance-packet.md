# Taskovia C1 P2 final technical-acceptance readiness packet

Status: `BLOCKED — DEPLOYMENT_REQUIRED; SETUP AND ACCEPTANCE NOT AUTHORIZED`

Prepared read-only on 2026-09-14. This packet authorizes no deployment, Cloud write, HTTP controlled-import request, concurrency operation, adapter registration, grant, module enablement, real VQH import, Production/Local DB work, P3 work, PR, or merge.

## 1. Verified source and database baseline

| Item | Read-only result |
| --- | --- |
| Branch | `feat/taskovia-c1` |
| Readiness source/pre-documentation local HEAD | `7f433b55195fdc63bb13b08e560e1074d0781278` |
| Pre-documentation remote feature HEAD | `7f433b55195fdc63bb13b08e560e1074d0781278` |
| `origin/main` | `b2731f4ef72c10cbcafe9f176cc1e2b54b9c8cfd` |
| Reviewed executable implementation | `6fae1e255d59dc104308cd9d5cd899cc914cb064`; direct parent of HEAD |
| Drift after reviewed implementation | One documentation-only commit; no executable-source delta |
| Frozen P2.1 | `8eb675fced49eedf2d0967ae6622ca2a161248eb`; frozen schema and manifest fixture are byte-unchanged |
| Runtime | Node `v24.19.0`; pnpm `10.29.3`; repository Supabase CLI `2.114.0` |
| Cloud DEV | `gtgljlnhwvhqdnwrfdfj`; target guard passed; project `ACTIVE_HEALTHY` |
| Migration parity | 35 local / 35 remote; no unexpected migration |

Immutable migration hashes match the accepted values:

- P1 `20260911145035_taskovia_c1_foundation.sql`: `538025216FEC8B67A8A94226D67B35F723D005069AEA00B003FB4DCE6089C556`.
- P2 `20260913082034_taskovia_c1_controlled_import.sql`: `C82FFC2426239A815EFD50BC01C874A7038A61FE2E5EAE662A828E024E26FB7F`.
- Canonical-order correction `20260913151754_taskovia_c1_canonical_order_fix.sql`: `37FF2F59F732785724E0433DDECBBE0621BBF8D595913D5FAF5EAD2955C1AFB7`.

## 2. Application deployment boundary

| Field | Result |
| --- | --- |
| Reviewed-code deployment | Successful Vercel Preview for repository SHA `7f433b55195fdc63bb13b08e560e1074d0781278`, which contains `6fae1e2...` |
| Immutable Preview origin | `https://company-operations-platform-8t5i5d6u7-vqh.vercel.app` |
| Vercel deployment identity | GitHub deployment `6429141322`; Vercel deployment `kx35VcegX2dNe9kSFS6FU7EmnwoK` |
| Runtime reachability | Unsuitable: unauthenticated `GET /api/health` returns `302` to Vercel SSO; the reviewed CLI uses `redirect: 'error'` and would record `UNEXPECTED_REDIRECT`/UNKNOWN |
| Cloud DEV association | `UNKNOWN`; GitHub proves repository SHA/origin only. The connected Vercel account cannot inspect the `vqh` team project or its Preview environment variables. Naming is not accepted as association evidence. |
| Latest observed Production SHA | `b2731f4ef72c10cbcafe9f176cc1e2b54b9c8cfd`; it predates P2 and belongs to the separate Production boundary |

Result: `DEPLOYMENT_REQUIRED`. The future destination must be a newly approved HTTPS deployment of `7f433b...` or an explicitly reviewed successor, bound by inspectable evidence to Cloud DEV `gtgljlnhwvhqdnwrfdfj`, and reachable by the reviewed CLI without redirect/protection interception. Do not use the Supabase URL as the application origin and do not repurpose Production.

## 3. Synthetic prerequisite matrix

The bounded Cloud query inspected only the reserved C1 synthetic UUIDs/codes, the two C1 permission codes, the two candidate adapter tuples, and catalog relation names. It did not inspect VQH or unrelated business rows.

| Prerequisite | State | Evidence / required resolution |
| --- | --- | --- |
| Dedicated synthetic tenant | `MISSING` | Reserved tenant `c1000000-0000-4000-8000-000000000010` absent. |
| Primary synthetic company | `MISSING` | Reserved company `c1000000-0000-4000-8000-000000000020` absent. |
| Cross-company denial target | `MISSING` | Reserved same-tenant company `c1000000-0000-4000-8000-000000000021` absent. |
| Authenticated scoped importer | `MISSING` | No reserved synthetic Auth user, tenant/company membership, role, or assignment exists. Must have exactly `cost.source.read` + `cost.prepare`; `company_admin`/`service_role` is not a substitute. |
| Capability-negative actor | `MISSING` | Create a separate active member with `cost.source.read` only and intentionally no `cost.prepare`. |
| Authentication-negative identity | `READY` | Use no valid application identity and preselect `401 AUTH_INVALID` with a deliberately invalid private bearer value. The CLI cannot emit a request with no bearer value. |
| Active memberships | `MISSING` | No reserved synthetic tenant/company memberships exist. |
| C1 module enablement | `MISSING` | No `company_cost_settings` row exists for either reserved company. Enable only the primary synthetic company for the normal ledger. |
| `cost.source.read` catalog permission | `READY` | Permission code exists. Actor binding is missing. |
| `cost.prepare` catalog permission | `READY` | Permission code exists. Actor binding is missing. |
| VQH-family adapter allowlist | `MISSING` | No registration for `taskovia-vqh-project-cost-workbooks-v1` / `taskovia-vqh-project-cost-workbooks` / `0.1.0-candidate`. |
| Executable synthetic workbook/manifest | `MISSING` | The repository contains only a contract fixture with placeholder hashes and no XLSX bytes; it is not executable through the VQH-family prepare command. A reviewed synthetic-only workbook and two company-bound canonical manifests are required. |
| Fixed destination association | `UNKNOWN` | Requires the deployment action/evidence above. |
| Existing collision/residue | `READY` | Zero reserved runs, sources, versions, selections, figures, issues, receipts, import events, or import audits; zero proposed source/run/key collisions were observed. |

## 4. Future setup mutations — separate from acceptance requests

These are prerequisites, not part of the `6 POST + 1 GET` ledger. They require a dedicated Cloud DEV setup authorization and durable readback.

1. Deploy exact SHA `7f433b...` or an explicitly reviewed successor to one canonical HTTPS origin associated with Cloud DEV; remove any redirect/protection behavior that the reviewed CLI cannot satisfy, without exposing the site broadly beyond the approved mechanism.
2. Create one synthetic Auth importer and one synthetic Auth capability-negative actor through the approved Cloud DEV Auth administration path; keep generated actor IDs and credentials in the private execution packet.
3. Insert the reserved synthetic tenant and companies above; create active tenant membership for both actors and active primary-company membership for both. Do not give the importer membership in the cross-company target.
4. Create one non-privileged primary-company importer role with exactly `cost.source.read` and `cost.prepare`; create one non-privileged negative role with only `cost.source.read`; assign them to the corresponding actors. Do not use `company_admin` or `service_role`.
5. Insert one enabled `company_cost_settings` row for the primary synthetic company. No P3/financial setting or activation is added.
6. Register exactly the VQH-family/version tuple above in `private.controlled_import_adapter_versions`.
7. Create and independently review synthetic-only XLSX inputs accepted by the reviewed adapter. Freeze every input SHA-256 and every company/scenario-bound canonical manifest digest, including primary-company, cross-company, and concurrency variants. Use distinct synthetic source codes for the normal and three concurrency ledgers.
8. Read back every setup row and prove the actor capability union, missing capability, cross-company non-membership, module state, adapter tuple, and zero pre-existing run/source collisions before any acceptance POST.

No cleanup/delete operation is authorized or implied.

## 5. Final HTTP command-path ledger

Private values must be frozen before authorization: `authorizationReference`, actor IDs/tokens, final application origin/association reference, per-scenario `runId`/`idempotencyKey`, manifest/input digests, and new attempt directories. They are `UNKNOWN` while deployment and the executable synthetic artifact are missing; do not invent them in the repository.

| Scenario | Actor / target | Stable identity and payload | Expected response | Durable/database evidence | Stop condition |
| --- | --- | --- | --- | --- | --- |
| A. Initial import | Scoped importer / primary synthetic company | New private run/key; primary manifest/input digests | `200`, exact run, `replayed=false` | `attempt.json` then `outcome.json=SUCCEEDED`; one run/receipt/import-event/audit and the manifest's exact source-layer rows | Stop on any non-200, redirect, identity mismatch, malformed result, or evidence failure |
| B. Same-key/same-payload replay | Same importer/company | Exact A packet, preparation, run, key, and digests | `200`, identical canonical IDs, `replayed=true` | New attempt directory; no new database row or version | Stop if IDs differ, replay is false, or any cardinality increases |
| C. Same-key/different-payload | Same importer/company | A key with a different fixed runId; all other reviewed payload fields unchanged | `409 IDEMPOTENCY_CONFLICT` with sanitized requestId | `outcome.json=REJECTED`; no database effect | Stop on dispatch ambiguity, non-409/code mismatch, or any row change |
| D. Authentication negative | Invalid bearer / primary company | Separate run/key; exact primary preparation/digests | `401 AUTH_INVALID` with sanitized requestId | Definite rejection; no RPC/run/source effect | Stop on redirect, non-401/code mismatch, or any row change |
| E. Capability negative | Active source-only actor / primary company | Separate run/key; exact primary preparation/digests | `403 PERMISSION_DENIED` | Route/service rejection; no RPC/run/source effect | Stop on non-403/code mismatch or any row change |
| F. Cross-company negative | Scoped importer / cross-company target | Separate run/key; cross-company manifest digest and same reviewed synthetic input digest | `403 COMPANY_FORBIDDEN` | Context rejection; no target-company write or disclosure | Stop on non-403/code mismatch, disclosure, or any target row |
| G. Canonical read-back | Scoped importer / primary company | Exact A runId | `200`, A canonical IDs/result | Read only; result identity exact | Stop on not-found, identity/cardinality mismatch, or malformed result |

Normal authorization count: exactly **6 POST + 1 GET**. Each invocation uses a new private attempt directory. If a POST is UNKNOWN, never resend it; the one same-identity get-result GET replaces G. Any additional mutation requires an amendment.

## 6. Separate simultaneous-session concurrency packet

Normative anchor: v1.1 detailed spec §6.1 lines 362–368. The database implementation uses one company-scoped advisory transaction lock before idempotency/source resolution. Sequential replay and unit mocks do not satisfy this gate.

| Case | Exactly simultaneous operations | Expected unordered result pair | Expected retained delta | Invariant and observation |
| --- | --- | --- | --- | --- |
| 1. Same company + same key + same payload | **2 POST** released from one barrier with the same new run/key/manifest/input | `{200 replayed=false, 200 replayed=true}` with identical canonical IDs | 1 run, 1 source, 1 version, 1 section, 1 receipt, 1 import event, 1 audit; no duplicate | Company lock serializes the first commit before replay lookup; observe exact run/key/source/version cardinality |
| 2. Same company + same key + different payload | **2 POST** from one barrier; same new key, distinct fixed runIds, same reviewed manifest/input | `{200 replayed=false, 409 IDEMPOTENCY_CONFLICT}` | Only the winner: 1 run/source/version/section and one receipt/event/audit | Company lock makes one payload authoritative; observe loser left no partial row |
| 3. Same company + different keys + same source code | **2 POST** from one barrier; distinct run/key pairs and two reviewed manifests with identical source identity but distinct input identities | `{200 replayed=false, 200 replayed=false}` | 2 runs, 1 source, 2 ordered versions, 2 sections, 2 receipts/events/audits | Company lock serializes source lookup/version allocation; observe one source and version numbers `[1,2]` |

Concurrency authorization count: exactly **6 POST total**, two per case, plus three read-only post-observation SQL queries. Each process owns a new attempt directory and separate stdout/stderr/status capture. Record barrier-release time, terminal exit, HTTP status/code/requestId, canonical result, and database observation for both sessions.

No POST retry follows an UNKNOWN. A separately authorized same-identity recovery GET may be used once per distinct unknown run identity: maximum 1 GET in case 1, 2 in case 2, and 2 in case 3. If recovery cannot prove the result, stop with unreconciled UNKNOWN and do not start the next case.

## 7. Retained synthetic-data lifecycle and postflight

No dedicated persistent synthetic company exists today. Future setup rows and successful HTTP transactions are retained; the SQL fixtures' outer `ROLLBACK` does not cover them. Immutability stays enabled and no teardown is invented.

The executable synthetic manifest should be the minimum adapter-valid, non-posting shape: one input, one source, one version, one pending source section, zero figures, zero review issues, and no project/party/engagement/component mapping. On that frozen shape:

- Normal ledger retained scope: 1 run, 1 source, 1 version, 1 section, 0 figures/issues, 3 descriptor-map rows, and 1 receipt/import-event/audit.
- All three concurrency cases add: 4 runs, 3 sources, 4 versions, 4 sections, 0 figures/issues, 12 descriptor-map rows, and 4 receipts/import-events/audits.
- Final combined acceptance scope: 5 runs, 4 sources, 5 versions, 5 sections, 0 figures/issues, 15 descriptor-map rows, and 5 receipts/import-events/audits.

Postflight must prove those exact values or the final reviewed manifest equivalents; no duplicate source/version; every rejected request has zero effect; zero project, party, engagement, or component effect beyond separately authorized setup; zero financial documents/lines/payments/cash allocations; zero KPI/financial activation; and no unrelated master-data/audit effect. At this pre-P3 baseline the named financial relations do not exist, which is current evidence only, not a substitute for the future postflight.

## 8. P2 technical-close matrix

| Gate | Current state | Close requirement |
| --- | --- | --- |
| P2.1 frozen contract unchanged | `READY` | Recheck exact frozen files before execution |
| P2.2 reviewed implementation | `READY` | Deployed SHA must contain `6fae1e2...` or approved successor |
| P2.3 database fixtures | `READY` | Preserve accepted evidence and 35/35 parity |
| Suitable Cloud DEV application deployment | `BLOCKED` | Exact non-redirecting origin/SHA/build/Cloud DEV association |
| Synthetic prerequisites/artifact | `BLOCKED` | All setup rows, adapter and frozen digests read back |
| Final HTTP ledger | `NOT_RUN` | Exact 6 POST + 1 GET all pass; reconcile every UNKNOWN |
| Simultaneous concurrency | `NOT_RUN` | Exact 6 simultaneous POST evidence and cardinalities pass |
| No financial activation | `CURRENTLY ZERO / FINAL CHECK PENDING` | Final postflight proves all zero-effect assertions |
| Fresh application verification | `PENDING` | Run on the final deployed source immediately before close |
| Unresolved technical blocker | `BLOCKED` | All blockers above closed |

P2 cannot be marked technically closed now. After technical close, the fixed sequence remains: P2.4 real VQH onboarding → real source-layer validation → final P2 handoff → P3 start.

## 9. Private P2.4 pre-fill — still not authorized

Status: `NOT_AUTHORIZED`.

| Field | Value |
| --- | --- |
| Target | VQH; company `10000000-0000-4000-8000-000000000020` |
| Workbook family | `taskovia-vqh-project-cost-workbooks-v1` |
| Adapter | `taskovia-vqh-project-cost-workbooks@0.1.0-candidate` |
| Reviewed manifest digest | `7dbc1545a78b7a8671384caedb86817840e47c069fa7ed258d5159493b37d315` |
| Eo Gio SHA-256 | `1b1f21bcd6b6cda6b6a97cdfbb6d10f2f60f1d62b65276b4732dd2a1391c0586` |
| Yong Mei SHA-256 | `f5801e41e3f81f4c28455f30959db6a1d89fa5519d56b8dd373270356461d961` |
| Expected source layer | 2 inputs; 2 sources; 2 versions; 29 sections; 43 figures; 22 review issues; 27 duplicate candidates; 18 pending sections; 41 pending figures; 11,690 evidence occurrences; 8,113 distinct source cells |
| Deployed destination | `UNKNOWN`; current Preview is unsuitable and Production predates P2 |
| Authenticated VQH importer | `UNKNOWN`; not queried in this readiness task |
| VQH membership/module/permissions | `UNKNOWN`; not queried in this readiness task |
| Adapter registration | `MISSING` at the read-only inspection time |
| Real authorizationReference/runId/idempotencyKey | `UNKNOWN`; must be fixed only in a separately approved private packet |

Expected P2.4 success is one canonical run with exactly the reviewed source-layer counts and `replayed=false`; an explicitly authorized same-payload replay must return the same canonical IDs with `replayed=true` and no new rows. Both require zero financial/master-data activation. Stop on destination/identity mismatch, any pending mapping presented as confirmed meaning, count/digest difference, definite unexpected rejection, UNKNOWN response/evidence failure, or any financial/unrelated effect. Do not automatically retry an unknown POST; use only the same-identity read-back permitted by the future private packet.

## 10. Exact next reviewer authorization

The immediate next authorization is a **deployment-only authorization** to deploy exact SHA `7f433b55195fdc63bb13b08e560e1074d0781278` (or a named reviewable successor) to a canonical non-redirecting HTTPS acceptance origin bound to Cloud DEV `gtgljlnhwvhqdnwrfdfj`, then return origin/SHA/build/environment-association evidence. It must explicitly exclude Production, database/Auth mutations, HTTP acceptance requests, concurrency, and P2.4.

After that evidence is reviewed, separate authorizations are required in order for: (1) the exact synthetic/Auth/RBAC/module/adapter/artifact setup mutations and readback; (2) the fixed normal `6 POST + 1 GET` ledger; and (3) the separate 6-POST simultaneous concurrency packet. P2.4 remains a later private authorization after P2 technical close.
