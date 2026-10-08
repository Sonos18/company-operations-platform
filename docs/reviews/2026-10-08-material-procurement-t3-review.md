# Wave 1 T3 review - material procurement API/client

Verdict: READY

This verdict covers immutable T3 `69761c66d9b32d0b0ca0761ff57a775e067ee90c..c8b11cf7c169be6170687b99cf92287b841735b9` only when integrated with reviewed contract follow-ups `032ab06cb9ba106cc22b62d3c5fbd556b9f8dfb1` and `5f5bd30bbb6ae3eabbc83f3aec05c626068931d2`. Do not integrate the T3 commit alone.

## Finding disposition

### [P1][resolved] Returned proposals exposed state without the buyer reason

- Changed consumers: `server/features/costs/material-procurement/repository.ts:101-105` and `app/repositories/http/http-material-procurement-repository.ts:72-73`.
- Original contract evidence: `shared/schemas/costs/material-procurement.ts:129-144` had strict proposal views with `reviewState` but no return reason.
- Impact: an engineer could see `returned` but could not learn what to revise; adding the SQL field alone would have failed strict server/client parsing.
- Resolution: `032ab06` adds required nullable `returnReason`; `5f5bd30` enforces returned => non-null reason and every other state => null. Focused tests cover missing, blank, null-on-returned, and stale reason on submitted payloads.
- Remaining owner: T2 must return the current returned revision's latest decision reason and null otherwise from both list/read RPCs.

No other correctness or security finding remains in the reviewed T3 diff.

## Reviewed behavior

- All 13 consumed RPC names and argument names match the frozen manifest; no aliases or premature order/contract/evidence routes were added.
- Company and actor context comes from authenticated `c1RequestContext`; route UUIDs are validated; proposal bodies cannot supply tenant, company, actor, supplier, or price.
- Engineer writes and buyer decisions use separate permissions; purchasing has no blanket proposal edit or finance permission in this change.
- Server and HTTP boundaries use strict schemas, UUID idempotency keys, decimal strings, user-bound Supabase RPCs, and `AuthenticatedHttpClient`.
- Deferred order, contract, and evidence client methods fail explicitly before transport.

## Fresh verification

T3 head `c8b11cf7c169be6170687b99cf92287b841735b9`:

`env -u TASKOVIA_DEV_CONFIG_SOURCE -u SUPABASE_DEV_ACCESS_TOKEN -u NUXT_PUBLIC_SUPABASE_URL -u NUXT_PUBLIC_SUPABASE_ANON_KEY pnpm exec vitest run tests/unit/server/material-proposals.spec.ts tests/unit/repositories/http-material-procurement-repository.spec.ts`

Result: exit 0, 2 files and 16 tests passed; worktree remained clean.

Contract follow-up head `5f5bd30bbb6ae3eabbc83f3aec05c626068931d2`:

`env -u TASKOVIA_DEV_CONFIG_SOURCE -u SUPABASE_DEV_ACCESS_TOKEN -u NUXT_PUBLIC_SUPABASE_URL -u NUXT_PUBLIC_SUPABASE_ANON_KEY pnpm exec vitest run tests/unit/shared/material-procurement.spec.ts`

Result: exit 0, 1 file and 11 tests passed. `git diff --check 032ab06..5f5bd30` also exited 0.

## Evidence limits

The T3 tests use mocked repositories/RPC responses. They prove permission and schema wiring, exact RPC arguments, response/error parsing, and authenticated HTTP request construction. They do not prove database ownership/state enforcement, wrong-company isolation, persisted idempotency/replay, or live SQL response shape. Those claims remain with T2/T10 and an explicitly authorized Cloud DEV run.

## Separate integration-draft sanity

The uncommitted `app/repositories/contracts.ts` and `app/plugins/repositories.client.ts` changes correctly add the required registry member, exclude it from the prototype registry, and bind the HTTP repository to the existing active-company getter. They need the normal focused typecheck after T3 is integrated; they were not part of the immutable T3 verdict.
