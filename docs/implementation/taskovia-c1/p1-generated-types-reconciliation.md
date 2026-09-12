# P1 generated database-types reconciliation

## Scope and evidence

- Generated target: `shared/types/database.types.ts`.
- Generator: Supabase CLI `2.114.0`, invoked through the guarded command `pnpm db:dev:types`, which runs `supabase gen types typescript --linked` without an explicit schema override.
- Guarded Cloud DEV status on 2026-09-12 reported all 33 local migrations applied remotely.
- The tracked types snapshot last changed at `ae29c838645f29eca75107e4004fa039e2df64d8` (2026-09-01), before the September decision-authority migrations.
- Applied P1 migration: `20260911145035_taskovia_c1_foundation.sql`, SHA-256 `538025216FEC8B67A8A94226D67B35F723D005069AEA00B003FB4DCE6089C556`.

## Reconciled generated changes

| Generated symbol or change | Classification | Source and applied-schema evidence | Disposition |
| --- | --- | --- | --- |
| `company_cost_settings`, `projects`, `business_parties`, `project_engagements`, `engagement_components`, `cost_document_events`, `cost_command_receipts`, including their rows, inserts, updates, and relationships | P1 | `20260911145035_taskovia_c1_foundation.sql` creates the seven tables and their composite foreign keys. | Keep generated output. |
| `c1_create_project`, `c1_create_business_party`, `c1_create_engagement`, `c1_create_engagement_component`, `c1_update_project`, `c1_update_business_party`, `c1_update_engagement`, `c1_update_engagement_component` | P1 | `20260911145035_taskovia_c1_foundation.sql` defines these eight public RPCs with the generated UUID/JSON argument shapes and JSON return. | Keep generated output. |
| `opportunity_contacts` and `opportunities` blocks | Generator re-emission of pre-existing Stage 01 schema | `20260829120300_stage01_opportunity_domain.sql` creates `opportunity_contacts`; normalized generated blocks match the tracked snapshot and carry no semantic type change. | Keep generated output. |
| `opportunity_decision_authority_events`, `opportunity_decision_policy_snapshots`, `opportunity_decision_policy_binding_events`, their relationships, and `stage01_decision_cycles.authority_resolution_event_id` / `decision_policy_snapshot_id` | Pre-existing Stage 01 | `20260904050924_opportunity_decision_authority_slice1.sql` creates the tables, foreign keys, and decision-cycle columns. `20260905124508_restore_opportunity_decision_final_history_invariants.sql` relies on both decision-cycle columns in the restored guard. | Keep generated output. |
| `company_opportunity_decision_capabilities` | Pre-existing Stage 01 | `20260904094243_opportunity_decision_authority_company_capability.sql` creates the table and company foreign key. | Keep generated output. |
| `assign_opportunity_decision_authority`, `get_opportunity_decision_authority_projection`, `list_opportunity_decision_authority_candidates` | Pre-existing Stage 01 | Initially defined by `20260904050924_opportunity_decision_authority_slice1.sql`; later identifier-only fixes are `20260907140004_fix_opportunity_decision_authority_projection_identifier.sql` and `20260907143419_fix_opportunity_decision_authority_candidates_identifier.sql`. The generator exposes their current UUID/JSON signatures. | Keep generated output. |
| Added `stage01_decision_cycles` relationship metadata | Pre-existing Stage 01 | The decision-authority foreign keys originate in `20260904050924_opportunity_decision_authority_slice1.sql`. | Keep generated output. |
| Parenthesized conditional generic constraints in `Tables`, `TablesInsert`, `TablesUpdate`, `Enums`, and `CompositeTypes` | Generator-only | Produced by Supabase CLI `2.114.0`; no table, column, relationship, or RPC contract changed. | Keep generated output. |

## Conclusion

Every semantic generated change is attributable either to the applied P1 foundation migration or to pre-existing Stage 01 migrations already present in the approved integration base and confirmed in the guarded 33/33 Cloud DEV history. No generated definition was manually added, removed, or pruned.
