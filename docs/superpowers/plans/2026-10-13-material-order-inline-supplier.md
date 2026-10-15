# Material Order Inline Supplier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Creating a material order resolves (reuse by code, then by name) or creates the supplier inside the same DB transaction, so the buyer no longer records the supplier separately.

**Architecture:** The order input replaces `supplierId` with a `supplier` descriptor. `private.c1_material_create_order` is replaced (`create or replace`, same signature) to resolve or insert the supplier after its existing proposal/evidence checks and before allocation checks. The Vue panel drops the separate supplier-record step and sends the descriptor in its single create-order call.

**Tech Stack:** Nuxt 3 / Vue 3 `<script setup lang="ts">`, Zod, Supabase Postgres (plpgsql, pgTAP), Vitest, decimal.js.

**Spec:** `docs/superpowers/specs/2026-10-13-material-order-inline-supplier-design.md`

## Global Constraints

- Worktree: `.worktrees/materials-a3-inline-supplier`, branch `codex/materials-a3-inline-supplier` (base `3432a76`). `node_modules` is a junction to the controller checkout; never run `pnpm install`.
- Run Node 24 directly: `& "$env:LOCALAPPDATA\nvm\v24.19.0\node.exe" node_modules/<tool>` (the controller's `enter-dev-context.ps1` refuses non-`dev` checkouts).
- No `any`. Match surrounding style. Vietnamese UI copy exactly as written in this plan.
- No Local DB, no Production. Cloud DEV (`gtgljlnhwvhqdnwrfdfj`) is touched only in Task 5 under a packet Sơn approves.
- Migration is forward-only; `create or replace` keeps signature `(uuid,uuid,uuid,jsonb,uuid,uuid)` so grants and generated DB types do not change.
- Name match normalisation (SQL and nowhere else): `lower(regexp_replace(btrim(x), '\s+', ' ', 'g'))`, `party_kind = 'organization'` only.
- Resolution order: code match wins; then name match; else insert. Existing suppliers are never updated.
- Creating a new supplier requires `material.supplier.record`; reusing one does not.
- New error codes: `SUPPLIER_AMBIGUOUS`, `SUPPLIER_UNAVAILABLE` (HTTP 409 via existing `workflowResponse` mapping).
- Cost choice (Sơn): no full suites; run only the targeted tests listed, `nuxt typecheck`, ESLint on changed files, `nuxt build`.

## Review Focus

- Order creation fails after a new supplier was inserted (e.g. allocation exceeded) → supplier insert must roll back; pinned in Task 2 pgTAP case "rollback".
- Same idempotency key replayed with a new-supplier payload → returns the original order and creates no second supplier; pinned in Task 2 pgTAP case "replay".
- Name typed with different case / extra spaces (`'  supplier   a '`) → reuses `Supplier A`; pinned in Task 2 pgTAP case "name match".
- Code belongs to a crew party or inactive organisation → `SUPPLIER_UNAVAILABLE`, never silently creates another supplier; pinned in Task 2 pgTAP cases "crew code" and "inactive code".
- Old clients still sending `supplierId` → `INPUT_INVALID` at both Zod and SQL layers; pinned in Task 1 schema test and Task 2 pgTAP case "legacy supplierId".

---

### Task 1: Shared order contract and error codes

**Files:**
- Modify: `shared/schemas/costs/material-procurement.ts:182-191` (`createMaterialOrderInputSchema`)
- Modify: `shared/schemas/api-error.ts` (enum, next to `MATERIAL_ALLOCATION_EXCEEDED`)
- Modify tests (replace the order-input `supplierId: ids.supplier` with the descriptor): `tests/unit/shared/material-procurement.spec.ts:119-121`, `tests/unit/server/material-orders.spec.ts:12-25`, `tests/unit/repositories/http-material-procurement-repository.spec.ts:55-67`, `tests/unit/server/material-procurement.routes.spec.ts:20-26`, `tests/unit/server/material-procurement.production-boundary.spec.ts:127-129`
- Do NOT touch `supplierId` in order **views** (`materialOrderViewSchema`), proposal-forgery tests (`material-proposals.spec.ts:168`, http repo spec `:266`) or `recordMaterialSupplierNameInputSchema`.

**Interfaces:**
- Produces: `materialOrderSupplierInputSchema` (exported) and `type MaterialOrderSupplierInput`; `CreateMaterialOrderInput['supplier']` = `{ code: string; displayName: string; taxIdentifier?: string; contactDisplayName?: string; contactPhone?: string }`. Error codes `'SUPPLIER_AMBIGUOUS' | 'SUPPLIER_UNAVAILABLE'` in `apiErrorCodeSchema`.

- [ ] **Step 1: Write the failing schema test** — in `tests/unit/shared/material-procurement.spec.ts`, inside the `'freezes split-order allocation and signed-contract inputs'` test, change the `order` constant and add assertions right after `expect(createMaterialOrderInputSchema.safeParse(order).success).toBe(true)`:

```ts
    const order = {
      approvedRevisionId: ids.proposalRevision,
      supplier: { code: 'NCC-0102030405', displayName: 'Cong ty A' },
      currencyCode: 'VND',
      unsignedQuotationEvidenceFileId: ids.unsignedQuotation,
      allocations: [split10Of20.allocations[0]],
    }

    expect(createMaterialOrderInputSchema.safeParse(order).success).toBe(true)
    expect(createMaterialOrderInputSchema.safeParse({
      ...order,
      supplier: { ...order.supplier, taxIdentifier: '0102030405', contactDisplayName: 'Mr. Phu', contactPhone: '0907333850' },
    }).success).toBe(true)
    expect(createMaterialOrderInputSchema.safeParse({ ...order, supplierId: ids.supplier }).success).toBe(false)
    expect(createMaterialOrderInputSchema.safeParse({ ...order, supplier: { displayName: 'Cong ty A' } }).success).toBe(false)
    expect(createMaterialOrderInputSchema.safeParse({ ...order, supplier: { code: 'NCC-1', displayName: '  ' } }).success).toBe(false)
    expect(createMaterialOrderInputSchema.safeParse({ ...order, supplier: { ...order.supplier, partyKind: 'organization' } }).success).toBe(false)
    const withoutSupplier = { ...order } as Record<string, unknown>
    delete withoutSupplier.supplier
    expect(createMaterialOrderInputSchema.safeParse(withoutSupplier).success).toBe(false)
```

Also add to `tests/unit/shared/material-procurement.spec.ts` (top-level, new `it` in the same `describe`):

```ts
  it('exposes supplier resolution conflicts as API error codes', () => {
    expect(apiErrorCodeSchema.safeParse('SUPPLIER_AMBIGUOUS').success).toBe(true)
    expect(apiErrorCodeSchema.safeParse('SUPPLIER_UNAVAILABLE').success).toBe(true)
  })
```

with `import { apiErrorCodeSchema } from '../../../shared/schemas/api-error'` added to the imports.

- [ ] **Step 2: Run to verify it fails**

Run: `& "$env:LOCALAPPDATA\nvm\v24.19.0\node.exe" node_modules/vitest/vitest.mjs run tests/unit/shared/material-procurement.spec.ts`
Expected: FAIL (descriptor rejected by `.strict()` / missing `supplierId`; unknown error codes).

- [ ] **Step 3: Implement the schema** — in `shared/schemas/costs/material-procurement.ts` replace the block at lines 182-191 with:

```ts
export const materialOrderSupplierInputSchema = z.object({
  code: shortText,
  displayName: shortText,
  taxIdentifier: text.optional(),
  contactDisplayName: text.optional(),
  contactPhone: text.optional(),
}).strict()

export const createMaterialOrderInputSchema = z.object({
  approvedRevisionId: workflowUuidSchema,
  supplier: materialOrderSupplierInputSchema,
  currencyCode: workflowCurrencySchema,
  unsignedQuotationEvidenceFileId: workflowUuidSchema,
  allocations: z.array(materialOrderAllocationInputSchema).min(1).max(1000),
}).strict().refine(
  value => uniqueBy(value.allocations, allocation => allocation.proposalLineId),
  { path: ['allocations'], message: 'Duplicate proposal line allocation' },
)
```

and next to `export type CreateMaterialOrderInput = ...` add `export type MaterialOrderSupplierInput = z.infer<typeof materialOrderSupplierInputSchema>`.

In `shared/schemas/api-error.ts` add after `'MATERIAL_ALLOCATION_EXCEEDED',`:

```ts
  'SUPPLIER_AMBIGUOUS',
  'SUPPLIER_UNAVAILABLE',
```

- [ ] **Step 4: Update the other order fixtures** — in each of these, replace `supplierId: ids.supplier,` **inside the order input constant only** with `supplier: { code: 'NCC-001', displayName: 'Supplier A' },`:
  - `tests/unit/server/material-orders.spec.ts` `orderInput` (line 14)
  - `tests/unit/repositories/http-material-procurement-repository.spec.ts` `orderInput` (line 57)
  - `tests/unit/server/material-procurement.routes.spec.ts` `orderInput` (line 22)
  - `tests/unit/server/material-procurement.production-boundary.spec.ts` line 128: `approvedRevisionId: ids.proposalRevision, supplier: { code: 'NCC-001', displayName: 'Supplier A' }, currencyCode: 'VND',`

  Leave `orderView`/view fixtures (`supplierId` + `supplierName`) unchanged. If any of these files asserts the exact RPC/HTTP body, the expectation already reuses `orderInput`, so no further edit is needed — confirm by reading the assertion.

- [ ] **Step 5: Run targeted tests**

Run: `& "$env:LOCALAPPDATA\nvm\v24.19.0\node.exe" node_modules/vitest/vitest.mjs run tests/unit/shared/material-procurement.spec.ts tests/unit/server/material-orders.spec.ts tests/unit/repositories/http-material-procurement-repository.spec.ts tests/unit/server/material-procurement.routes.spec.ts tests/unit/server/material-procurement.production-boundary.spec.ts`
Expected: PASS. If a failure is unrelated to the order input (e.g. it also fails with the file contents from `git show 3432a76:<file>`), report it instead of fixing it.

- [ ] **Step 6: Commit**

```bash
git add shared/schemas/costs/material-procurement.ts shared/schemas/api-error.ts tests/unit/shared/material-procurement.spec.ts tests/unit/server/material-orders.spec.ts tests/unit/repositories/http-material-procurement-repository.spec.ts tests/unit/server/material-procurement.routes.spec.ts tests/unit/server/material-procurement.production-boundary.spec.ts
git commit -m "feat(materials): accept supplier descriptor in order create input"
```

---

### Task 2: Migration replacing `private.c1_material_create_order` + pgTAP

**Files:**
- Create: `supabase/migrations/20261013120000_c1_material_order_inline_supplier.sql`
- Create: `supabase/tests/database/c1/c1_material_order_inline_supplier.test.sql`
- Modify: `supabase/tests/database/c1/c1_material_procurement.test.sql` (11 `create_order` calls)

**Interfaces:**
- Consumes: input shape from Task 1 (`supplier` object with keys `code`, `displayName`, optional `taxIdentifier`, `contactDisplayName`, `contactPhone`).
- Produces: SQL errors `SUPPLIER_AMBIGUOUS`, `SUPPLIER_UNAVAILABLE`, `PERMISSION_DENIED`, `INPUT_INVALID` (P0001 messages).

Note: pgTAP cannot run locally (no Local DB). Steps "run" below are executed only in Task 5 on Cloud DEV under Sơn's packet; in this task the implementer self-reviews the SQL against the existing function text.

- [ ] **Step 1: Write the new pgTAP file** `supabase/tests/database/c1/c1_material_order_inline_supplier.test.sql`:

```sql
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(20);

insert into auth.users(id,email) values
('c1300000-0000-4000-8000-000000000901','inline-engineer@test.invalid'),
('c1300000-0000-4000-8000-000000000902','inline-buyer@test.invalid'),
('c1300000-0000-4000-8000-000000000905','inline-buyer-no-supplier@test.invalid');
insert into public.tenants(id,code,name) values('c1300000-0000-4000-8000-000000000010','C1S','Inline supplier tenant');
insert into public.companies(id,tenant_id,code,name) values('c1300000-0000-4000-8000-000000000020','c1300000-0000-4000-8000-000000000010','C1S','Inline supplier company');
insert into public.tenant_memberships(user_id,tenant_id,roles)
select v.u,'c1300000-0000-4000-8000-000000000010',array['member'] from (values
 ('c1300000-0000-4000-8000-000000000901'::uuid),('c1300000-0000-4000-8000-000000000902'::uuid),('c1300000-0000-4000-8000-000000000905'::uuid)) v(u);
insert into public.company_memberships(user_id,tenant_id,company_id,roles,is_active)
select v.u,'c1300000-0000-4000-8000-000000000010','c1300000-0000-4000-8000-000000000020',array['member'],true from (values
 ('c1300000-0000-4000-8000-000000000901'::uuid),('c1300000-0000-4000-8000-000000000902'::uuid),('c1300000-0000-4000-8000-000000000905'::uuid)) v(u);
insert into public.roles(id,tenant_id,company_id,code,name,description,is_system) values
('c1300000-0000-4000-8000-000000000912','c1300000-0000-4000-8000-000000000010','c1300000-0000-4000-8000-000000000020','inline_buyer','Inline buyer','test',false),
('c1300000-0000-4000-8000-000000000915','c1300000-0000-4000-8000-000000000010','c1300000-0000-4000-8000-000000000020','inline_buyer_ns','Inline buyer no supplier','test',false);
insert into public.role_permissions(role_id,permission_code) values
('c1300000-0000-4000-8000-000000000912','material.read'),
('c1300000-0000-4000-8000-000000000912','material.manage'),
('c1300000-0000-4000-8000-000000000912','material.order.manage'),
('c1300000-0000-4000-8000-000000000912','material.supplier.record'),
('c1300000-0000-4000-8000-000000000915','material.read'),
('c1300000-0000-4000-8000-000000000915','material.order.manage');
insert into public.company_role_assignments(tenant_id,company_id,user_id,role_id,granted_by,grant_reason) values
('c1300000-0000-4000-8000-000000000010','c1300000-0000-4000-8000-000000000020','c1300000-0000-4000-8000-000000000902','c1300000-0000-4000-8000-000000000912','c1300000-0000-4000-8000-000000000902','test'),
('c1300000-0000-4000-8000-000000000010','c1300000-0000-4000-8000-000000000020','c1300000-0000-4000-8000-000000000905','c1300000-0000-4000-8000-000000000915','c1300000-0000-4000-8000-000000000902','test');
insert into public.company_cost_settings(company_id,tenant_id,enabled,created_by)
values('c1300000-0000-4000-8000-000000000020','c1300000-0000-4000-8000-000000000010',true,'c1300000-0000-4000-8000-000000000902');
insert into public.cost_workflow_companies(company_id,tenant_id,mode,notification_recipient_id)
values('c1300000-0000-4000-8000-000000000020','c1300000-0000-4000-8000-000000000010','document_backed_v1','c1300000-0000-4000-8000-000000000902');
insert into public.projects(id,tenant_id,company_id,code,name,location_text,operational_state,origin,created_by)
values('c1300000-0000-4000-8000-000000000101','c1300000-0000-4000-8000-000000000010','c1300000-0000-4000-8000-000000000020','INL-P','Inline project','Site A','active','manual','c1300000-0000-4000-8000-000000000902');
insert into public.business_parties(id,tenant_id,company_id,code,display_name,party_kind,is_active,created_by) values
('c1300000-0000-4000-8000-000000000201','c1300000-0000-4000-8000-000000000010','c1300000-0000-4000-8000-000000000020','SUP-A','Supplier A','organization',true,'c1300000-0000-4000-8000-000000000902'),
('c1300000-0000-4000-8000-000000000202','c1300000-0000-4000-8000-000000000010','c1300000-0000-4000-8000-000000000020','DUP-1','Duplicate Name','organization',true,'c1300000-0000-4000-8000-000000000902'),
('c1300000-0000-4000-8000-000000000203','c1300000-0000-4000-8000-000000000010','c1300000-0000-4000-8000-000000000020','DUP-2','duplicate  name','organization',true,'c1300000-0000-4000-8000-000000000902'),
('c1300000-0000-4000-8000-000000000204','c1300000-0000-4000-8000-000000000010','c1300000-0000-4000-8000-000000000020','INA-1','Inactive Co','organization',false,'c1300000-0000-4000-8000-000000000902'),
('c1300000-0000-4000-8000-000000000205','c1300000-0000-4000-8000-000000000010','c1300000-0000-4000-8000-000000000020','CREW-1','Crew One','crew',true,'c1300000-0000-4000-8000-000000000902');

create temporary table inline_ids(name text primary key,value uuid);
grant select,insert on inline_ids to authenticated;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1300000-0000-4000-8000-000000000902","role":"authenticated"}',true);
insert into inline_ids(name,value)
select 'material',(public.c1_material_create_item(
  'c1300000-0000-4000-8000-000000000020',
  '{"code":"INL-MAT","name":"Steel","specification":"D10","unit":"bag"}',
  'c1300000-0000-4000-8000-000000000601','c1300000-0000-4000-8000-000000000701'
)->>'resourceId')::uuid;

-- Approved proposal with one line of 100 and 12 finalized, scoped quotation PDFs (rollback-only fixtures).
set local role none;
insert into public.material_proposals(id,tenant_id,company_id,project_id,review_state,needed_on,delivery_address,version,created_by)
values('c1300000-0000-4000-8000-000000000401','c1300000-0000-4000-8000-000000000010','c1300000-0000-4000-8000-000000000020','c1300000-0000-4000-8000-000000000101','draft','2026-10-30','Site A',0,'c1300000-0000-4000-8000-000000000901');
insert into public.material_proposal_lines(id,tenant_id,company_id,project_id,proposal_id,material_id,quantity,created_by)
values('c1300000-0000-4000-8000-000000000301','c1300000-0000-4000-8000-000000000010','c1300000-0000-4000-8000-000000000020','c1300000-0000-4000-8000-000000000101','c1300000-0000-4000-8000-000000000401',(select value from inline_ids where name='material'),100,'c1300000-0000-4000-8000-000000000901');
insert into public.material_proposal_revisions(id,tenant_id,company_id,project_id,proposal_id,revision_no,needed_on,delivery_address,submitted_by)
values('c1300000-0000-4000-8000-000000000411','c1300000-0000-4000-8000-000000000010','c1300000-0000-4000-8000-000000000020','c1300000-0000-4000-8000-000000000101','c1300000-0000-4000-8000-000000000401',1,'2026-10-30','Site A','c1300000-0000-4000-8000-000000000901');
insert into public.material_proposal_revision_lines(revision_id,proposal_line_id,proposal_id,tenant_id,company_id,project_id,material_id,material_name,specification,unit,quantity)
values('c1300000-0000-4000-8000-000000000411','c1300000-0000-4000-8000-000000000301','c1300000-0000-4000-8000-000000000401','c1300000-0000-4000-8000-000000000010','c1300000-0000-4000-8000-000000000020','c1300000-0000-4000-8000-000000000101',(select value from inline_ids where name='material'),'Steel','D10','bag',100);
update public.material_proposals set review_state='approved',current_revision_id='c1300000-0000-4000-8000-000000000411',approved_revision_id='c1300000-0000-4000-8000-000000000411',version=2
where id='c1300000-0000-4000-8000-000000000401';
insert into public.cost_evidence_files(
  id,tenant_id,company_id,project_id,object_path,original_filename,
  declared_mime_type,declared_size_bytes,declared_sha256,
  verified_mime_type,verified_size_bytes,verified_sha256,status,intent_expires_at,
  created_by,finalized_by,finalized_at,version
)
select ('c1300000-0000-4000-8000-0000000005'||lpad(n::text,2,'0'))::uuid,
  'c1300000-0000-4000-8000-000000000010','c1300000-0000-4000-8000-000000000020','c1300000-0000-4000-8000-000000000101',
  'c1300000-0000-4000-8000-000000000010/c1300000-0000-4000-8000-000000000020/c1300000-0000-4000-8000-000000000101/inline-'||n,
  'inline-'||n||'.pdf','application/pdf',8,repeat(to_hex(n),64)::text,'application/pdf',8,repeat(to_hex(n),64)::text,'finalized',
  now()+interval '15 minutes','c1300000-0000-4000-8000-000000000902','c1300000-0000-4000-8000-000000000902',now(),1
from generate_series(1,12) n;
insert into public.material_evidence_scopes(evidence_file_id,tenant_id,company_id,project_id,target_kind,proposal_id,revision_id,evidence_role,created_by)
select ('c1300000-0000-4000-8000-0000000005'||lpad(n::text,2,'0'))::uuid,
  'c1300000-0000-4000-8000-000000000010','c1300000-0000-4000-8000-000000000020','c1300000-0000-4000-8000-000000000101',
  'material_proposal','c1300000-0000-4000-8000-000000000401','c1300000-0000-4000-8000-000000000411','unsigned_quotation','c1300000-0000-4000-8000-000000000902'
from generate_series(1,12) n;

-- Helper: build an order input for evidence n, supplier descriptor s, quantity q.
create function pg_temp.inline_order(n int, s jsonb, q text default '1.0000') returns jsonb language sql as $$
  select jsonb_build_object(
    'approvedRevisionId','c1300000-0000-4000-8000-000000000411',
    'supplier',s,
    'currencyCode','VND',
    'unsignedQuotationEvidenceFileId',('c1300000-0000-4000-8000-0000000005'||lpad(n::text,2,'0')),
    'allocations',jsonb_build_array(jsonb_build_object(
      'proposalLineId','c1300000-0000-4000-8000-000000000301','quantity',q,'unitPrice','1.0000',
      'quotationMaterialName','Steel','mappingConfirmed',true)))
$$;
create function pg_temp.inline_create(n int, s jsonb, q text default '1.0000') returns jsonb language sql as $$
  select public.c1_material_create_order(
    'c1300000-0000-4000-8000-000000000020','c1300000-0000-4000-8000-000000000101','c1300000-0000-4000-8000-000000000401',
    pg_temp.inline_order(n,s,q),
    ('c1300000-0000-4000-8000-0000000006'||lpad(n::text,2,'0'))::uuid,
    ('c1300000-0000-4000-8000-0000000007'||lpad(n::text,2,'0'))::uuid)
$$;
grant execute on function pg_temp.inline_order(int,jsonb,text), pg_temp.inline_create(int,jsonb,text) to authenticated;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1300000-0000-4000-8000-000000000902","role":"authenticated"}',true);

-- code match + no overwrite
insert into inline_ids(name,value) select 'byCode',(pg_temp.inline_create(1,'{"code":"SUP-A","displayName":"Other Name","taxIdentifier":"999"}')->>'resourceId')::uuid;
select is((select supplier_id from public.material_orders where id=(select value from inline_ids where name='byCode')),'c1300000-0000-4000-8000-000000000201'::uuid,'code match reuses the existing supplier');
set local role none;
select is((select display_name||'|'||coalesce(tax_identifier,'-') from public.business_parties where id='c1300000-0000-4000-8000-000000000201'),'Supplier A|-','reused supplier is not overwritten');
set local role authenticated;

-- name match (case and whitespace insensitive)
insert into inline_ids(name,value) select 'byName',(pg_temp.inline_create(2,'{"code":"NEW-CODE-X","displayName":"  supplier   a "}')->>'resourceId')::uuid;
select is((select supplier_id from public.material_orders where id=(select value from inline_ids where name='byName')),'c1300000-0000-4000-8000-000000000201'::uuid,'name match reuses the existing supplier');
set local role none;
select is((select count(*)::int from public.business_parties where code='NEW-CODE-X'),0,'name match does not create a supplier');
set local role authenticated;

-- create new
insert into inline_ids(name,value) select 'created',(pg_temp.inline_create(3,'{"code":"NCC-NEW","displayName":"Brand New Co","taxIdentifier":"0101","contactPhone":"0909"}')->>'resourceId')::uuid;
set local role none;
select is((select party_kind||'|'||display_name||'|'||tax_identifier||'|'||contact_phone||'|'||is_active::text from public.business_parties where company_id='c1300000-0000-4000-8000-000000000020' and code='NCC-NEW'),'organization|Brand New Co|0101|0909|true','unknown supplier is created as an active organization');
select is((select supplier_id from public.material_orders where id=(select value from inline_ids where name='created')),(select id from public.business_parties where company_id='c1300000-0000-4000-8000-000000000020' and code='NCC-NEW'),'order uses the new supplier id');
set local role authenticated;

-- replay: same key + payload, no second supplier
select is((pg_temp.inline_create(3,'{"code":"NCC-NEW","displayName":"Brand New Co","taxIdentifier":"0101","contactPhone":"0909"}')->>'replayed'),'true','replay returns the original order');
set local role none;
select is((select count(*)::int from public.business_parties where company_id='c1300000-0000-4000-8000-000000000020' and code='NCC-NEW'),1,'replay does not create another supplier');
set local role authenticated;

-- conflicts
select throws_ok($$ select pg_temp.inline_create(4,'{"code":"NO-MATCH","displayName":"Duplicate Name"}') $$,'P0001','SUPPLIER_AMBIGUOUS','several suppliers with the same normalised name are ambiguous');
select throws_ok($$ select pg_temp.inline_create(5,'{"code":"INA-1","displayName":"Anything"}') $$,'P0001','SUPPLIER_UNAVAILABLE','inactive code match is unavailable');
select throws_ok($$ select pg_temp.inline_create(6,'{"code":"NO-MATCH-2","displayName":"inactive co"}') $$,'P0001','SUPPLIER_UNAVAILABLE','inactive name match is unavailable');
select throws_ok($$ select pg_temp.inline_create(7,'{"code":"CREW-1","displayName":"Crew One"}') $$,'P0001','SUPPLIER_UNAVAILABLE','crew code match is unavailable');

-- rollback: new supplier is not kept when the order fails
select throws_ok($$ select pg_temp.inline_create(8,'{"code":"NCC-ROLLBACK","displayName":"Rollback Co"}','500.0000') $$,'P0001','MATERIAL_ALLOCATION_EXCEEDED','over-allocation still fails');
set local role none;
select is((select count(*)::int from public.business_parties where code='NCC-ROLLBACK'),0,'failed order rolls back the new supplier');
set local role authenticated;

-- input validation
select throws_ok($$ select pg_temp.inline_create(9,'{"displayName":"No Code"}') $$,'P0001','INPUT_INVALID','supplier code is required');
select throws_ok($$ select pg_temp.inline_create(9,'{"code":"X","displayName":"Y","partyKind":"organization"}') $$,'P0001','INPUT_INVALID','unknown supplier keys are rejected');
select throws_ok($$
  select public.c1_material_create_order(
    'c1300000-0000-4000-8000-000000000020','c1300000-0000-4000-8000-000000000101','c1300000-0000-4000-8000-000000000401',
    (pg_temp.inline_order(9,'{"code":"SUP-A","displayName":"Supplier A"}') - 'supplier') || jsonb_build_object('supplierId','c1300000-0000-4000-8000-000000000201'),
    'c1300000-0000-4000-8000-000000000699','c1300000-0000-4000-8000-000000000799')
$$,'P0001','INPUT_INVALID','legacy supplierId input is rejected');

-- permission: buyer without material.supplier.record
select set_config('request.jwt.claims','{"sub":"c1300000-0000-4000-8000-000000000905","role":"authenticated"}',true);
select lives_ok($$ select pg_temp.inline_create(10,'{"code":"SUP-A","displayName":"Supplier A"}') $$,'existing supplier works without supplier.record');
select throws_ok($$ select pg_temp.inline_create(11,'{"code":"NCC-DENIED","displayName":"Denied Co"}') $$,'P0001','PERMISSION_DENIED','creating a supplier requires supplier.record');
set local role none;
select is((select count(*)::int from public.business_parties where code='NCC-DENIED'),0,'denied supplier is not created');

select * from finish();
rollback;
```

Count check: `is`×10 + `throws_ok`×9 + `lives_ok`×1 = 20 = `plan(20)`. Recount after any edit.

- [ ] **Step 2: Write the migration** `supabase/migrations/20261013120000_c1_material_order_inline_supplier.sql`. Copy `private.c1_material_create_order` verbatim from `supabase/migrations/20261008125304_c1_material_procurement_commands.sql:1435-1662` (through its closing `$$;`), change `create function` to `create or replace function`, and apply exactly these edits:

1. Header lines before the function:

```sql
set local lock_timeout = '5s';
set local statement_timeout = '30s';
```

2. In `declare`, add after `v_supplier_id uuid;`:

```sql
  v_supplier_input jsonb;
  v_supplier_code text;
  v_supplier_name text;
  v_supplier_name_key text;
  v_supplier_match_count integer;
  v_supplier public.business_parties%rowtype;
```

3. Replace the first `require_keys` call and the `v_supplier_id := private.c1_material_uuid(target_input->'supplierId');` line with:

```sql
  perform private.c1_workflow_require_keys(
    target_input,
    array['approvedRevisionId','supplier','currencyCode','unsignedQuotationEvidenceFileId','allocations'],
    array['approvedRevisionId','supplier','currencyCode','unsignedQuotationEvidenceFileId','allocations']
  );
  v_revision_id := private.c1_material_uuid(target_input->'approvedRevisionId');
  v_supplier_input := target_input->'supplier';
  if jsonb_typeof(v_supplier_input) is distinct from 'object' then
    raise exception using errcode='P0001', message='INPUT_INVALID';
  end if;
  perform private.c1_workflow_require_keys(
    v_supplier_input,
    array['code','displayName'],
    array['code','displayName','taxIdentifier','contactDisplayName','contactPhone']
  );
  v_supplier_code := private.c1_material_short_text(v_supplier_input->'code');
  v_supplier_name := private.c1_material_short_text(v_supplier_input->'displayName');
  if v_supplier_input ? 'taxIdentifier' then perform private.c1_workflow_text(v_supplier_input->'taxIdentifier'); end if;
  if v_supplier_input ? 'contactDisplayName' then perform private.c1_workflow_text(v_supplier_input->'contactDisplayName'); end if;
  if v_supplier_input ? 'contactPhone' then perform private.c1_workflow_text(v_supplier_input->'contactPhone'); end if;
  v_supplier_name_key := lower(regexp_replace(btrim(v_supplier_name), '\s+', ' ', 'g'));
```

(keep the following `v_evidence_id := ...` line unchanged).

4. Replace the whole block `if not exists ( select 1 from public.business_parties as supplier where supplier.id = v_supplier_id ... ) then raise ... RESOURCE_NOT_FOUND; end if;` with nothing, and insert the following **immediately after** the `EVIDENCE_UPLOAD_MISMATCH` check's `end if;` (i.e. before the first allocation `for` loop):

```sql
  -- Resolve the externally chosen supplier: code first, then normalised name, else create.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'material.supplier:' || v_tenant_id::text || ':' || target_company_id::text || ':' || v_supplier_code,
    0
  ));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'material.supplier-name:' || v_tenant_id::text || ':' || target_company_id::text || ':' || v_supplier_name_key,
    0
  ));
  select supplier.* into v_supplier
  from public.business_parties as supplier
  where supplier.tenant_id = v_tenant_id
    and supplier.company_id = target_company_id
    and supplier.code = v_supplier_code;
  if found then
    if v_supplier.party_kind <> 'organization' or not v_supplier.is_active then
      raise exception using errcode='P0001', message='SUPPLIER_UNAVAILABLE';
    end if;
  else
    select count(*) into v_supplier_match_count
    from public.business_parties as supplier
    where supplier.tenant_id = v_tenant_id
      and supplier.company_id = target_company_id
      and supplier.party_kind = 'organization'
      and lower(regexp_replace(btrim(supplier.display_name), '\s+', ' ', 'g')) = v_supplier_name_key;
    if v_supplier_match_count > 1 then
      raise exception using errcode='P0001', message='SUPPLIER_AMBIGUOUS';
    elsif v_supplier_match_count = 1 then
      select supplier.* into v_supplier
      from public.business_parties as supplier
      where supplier.tenant_id = v_tenant_id
        and supplier.company_id = target_company_id
        and supplier.party_kind = 'organization'
        and lower(regexp_replace(btrim(supplier.display_name), '\s+', ' ', 'g')) = v_supplier_name_key;
      if not v_supplier.is_active then
        raise exception using errcode='P0001', message='SUPPLIER_UNAVAILABLE';
      end if;
    else
      if not private.c1_material_actor_has_permission(v_tenant_id, target_company_id, 'material.supplier.record') then
        raise exception using errcode='P0001', message='PERMISSION_DENIED';
      end if;
      insert into public.business_parties(
        tenant_id, company_id, code, display_name, party_kind,
        tax_identifier, contact_display_name, contact_phone, created_by
      ) values (
        v_tenant_id,
        target_company_id,
        v_supplier_code,
        v_supplier_name,
        'organization',
        case when v_supplier_input ? 'taxIdentifier' then private.c1_workflow_text(v_supplier_input->'taxIdentifier') end,
        case when v_supplier_input ? 'contactDisplayName' then private.c1_workflow_text(v_supplier_input->'contactDisplayName') end,
        case when v_supplier_input ? 'contactPhone' then private.c1_workflow_text(v_supplier_input->'contactPhone') end,
        auth.uid()
      )
      returning * into v_supplier;
    end if;
  end if;
  v_supplier_id := v_supplier.id;
```

Everything else (receipt check, project/proposal/evidence checks, `order by line.id ... for update`, allocation loops, inserts using `v_supplier_id`, `record_command` with `'supplierId', v_supplier_id`) stays byte-for-byte as in the source function. Do not add grant/revoke statements (signature unchanged).

- [ ] **Step 3: Update the existing pgTAP calls** in `supabase/tests/database/c1/c1_material_procurement.test.sql`: every `'supplierId','c1200000-0000-4000-8000-000000000201',` becomes `'supplier',jsonb_build_object('code','SUP-A','displayName','Supplier A'),` (5 `jsonb_build_object` calls at lines ~222, 291, 312, 333, 355) and every JSON literal `"supplierId":"c1200000-0000-4000-8000-000000000201"` becomes `"supplier":{"code":"SUP-A","displayName":"Supplier A"}` (lines ~410, 417, 425, 432 and any later occurrence). Verify with `git grep -n supplierId -- supabase/tests` → only non-order usages remain (expect none in `create_order` calls). `plan(60)` unchanged.

- [ ] **Step 4: Self-review the SQL** — extract the original function to a temp file and compare: `git show HEAD:supabase/migrations/20261008125304_c1_material_procurement_commands.sql` lines 1435-1662 vs the new migration body with `git diff --no-index <tmp-original.sql> <tmp-new-function.sql>`; confirm only the four edits above differ. Check: `\s+` inside the `$$` body is literal; every `raise` uses `errcode='P0001'`; `v_supplier_id` is assigned before its first use in `insert into public.material_orders`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261013120000_c1_material_order_inline_supplier.sql supabase/tests/database/c1/c1_material_order_inline_supplier.test.sql supabase/tests/database/c1/c1_material_procurement.test.sql
git commit -m "feat(materials): resolve or create supplier inside order create"
```

---

### Task 3: Order panel — drop supplier-record step, send descriptor (UI, AGY)

**Files:**
- Modify: `app/components/materials/MaterialOrderCreatePanel.vue`

**Interfaces:**
- Consumes: `CreateMaterialOrderInput` with `supplier: MaterialOrderSupplierInput` (Task 1); API error codes `SUPPLIER_AMBIGUOUS`, `SUPPLIER_UNAVAILABLE`, `PERMISSION_DENIED`.

- [ ] **Step 1: Remove the separate supplier-record step**
  - Template (~lines 250-380 of section "1. Nhà cung cấp đã chọn bên ngoài"): delete the resolved-supplier badge (`v-if="resolvedSupplierId"` ~257), the checkbox bound to `supplierAlreadyChosenAcknowledged` (~347), the "Ghi nhận nhà cung cấp / Ghi nhận lại nhà cung cấp" button (~368-374) and the `ID NCC:` span (~375-377).
  - Replace the section description with: `Nhập thông tin nhà cung cấp đã chọn bên ngoài. Khi tạo đơn, hệ thống dùng NCC có sẵn (trùng mã hoặc tên) hoặc tự tạo mới.`
  - Inputs Mã / Tên / MST / Người liên hệ / SĐT: `:disabled="isRegularControlDisabled"` (drop `|| !canRecordSupplier`).
  - Replace the `v-if="!canRecordSupplier"` hint (~267) text with: `Bạn chưa có quyền tạo nhà cung cấp mới; chỉ dùng được nhà cung cấp đã có (trùng mã hoặc tên).`
  - Script: delete `supplierAlreadyChosenAcknowledged`, `resolvedSupplierId`, `lastResolvedInputJson`, `supplierResolutionKey`, `isResolvingSupplier`, `supplierResolveError`, `onResolvedSupplierInvalidated`, `onSupplierAckChange`, `canTriggerSupplierResolve`, `handleResolveSupplier`, and their resets (~2279-2286, ~2709-2717). `onSupplierCodeInput` and `handleSupplierDescriptorChanged` keep only what still applies (AI ownership flags and analysis invalidation unrelated to supplier resolution); they must no longer clear `finalizedEvidenceFileId`, `uploadSession`, `uploadError` or call `resetLineConfirmations()` because of a supplier change.
  - `applyQuotationAnalysisDraft` (~1709) and `retractAiOwnedDrafts` (~1549): remove the `if (!resolvedSupplierId.value)` guard; keep the inner field logic.
  - Remove imports that become unused (e.g. `chosenSupplierInputSchema`, resolve repository call).

- [ ] **Step 2: Gate and send the descriptor**
  - `createValidationReason` (~2101): replace `if (!resolvedSupplierId.value) return 'Cần ghi nhận nhà cung cấp.'` with `if (!supplierCode.value.trim() || !supplierDisplayName.value.trim()) return 'Cần nhập mã và tên nhà cung cấp.'`; make `canCreateOrder` use the same condition instead of `resolvedSupplierId`.
  - `startCreateOrder` (~2136): remove `!resolvedSupplierId.value` from the guard and build:

```ts
  const supplierInput: MaterialOrderSupplierInput = {
    code: supplierCode.value.trim(),
    displayName: supplierDisplayName.value.trim(),
    ...(supplierTaxIdentifier.value.trim() ? { taxIdentifier: supplierTaxIdentifier.value.trim() } : {}),
    ...(supplierContactDisplayName.value.trim() ? { contactDisplayName: supplierContactDisplayName.value.trim() } : {}),
    ...(supplierContactPhone.value.trim() ? { contactPhone: supplierContactPhone.value.trim() } : {}),
  }
```

  and use `supplier: supplierInput,` in `inputPayload` instead of `supplierId`. Import `type MaterialOrderSupplierInput` from `../../../shared/schemas/costs/material-procurement`.

- [ ] **Step 3: Error messages** — in the create-order error handling (next to `errInfo.code === 'MATERIAL_ALLOCATION_EXCEEDED'` ~2211) add:

```ts
        } else if (errInfo.code === 'SUPPLIER_AMBIGUOUS') {
          createActionError.value = 'Có nhiều nhà cung cấp trùng tên trong hệ thống. Vui lòng nhập đúng mã nhà cung cấp.'
        } else if (errInfo.code === 'SUPPLIER_UNAVAILABLE') {
          createActionError.value = 'Nhà cung cấp này đã ngừng sử dụng hoặc không phải tổ chức.'
        } else if (errInfo.code === 'PERMISSION_DENIED') {
          createActionError.value = 'Bạn chưa có quyền tạo nhà cung cấp mới. Hãy nhập mã của nhà cung cấp đã có hoặc nhờ người có quyền.'
```

  These are non-retryable: do not add them to the retry list at ~1034.

- [ ] **Step 4: Verify (orchestrator, AGY cannot run commands)**

Run from the worktree:
`& "$env:LOCALAPPDATA\nvm\v24.19.0\node.exe" node_modules/nuxt/bin/nuxt.mjs typecheck` → exit 0
`& "$env:LOCALAPPDATA\nvm\v24.19.0\node.exe" node_modules/eslint/bin/eslint.js app/components/materials/MaterialOrderCreatePanel.vue` → no errors beyond the 11 pre-existing ones in this file on base `3432a76` (compare counts).
`git grep -n -E "resolvedSupplierId|supplierAlreadyChosenAcknowledged|handleResolveSupplier" -- app` → no matches.

- [ ] **Step 5: Commit**

```bash
git add app/components/materials/MaterialOrderCreatePanel.vue
git commit -m "feat(materials): create orders with inline supplier resolution"
```

---

### Task 4: Branch verification and review

**Files:** none new.

- [ ] **Step 1:** Run targeted unit tests from Task 1 Step 5 plus `tests/unit/utils/material-quantity-display.spec.ts` → PASS.
- [ ] **Step 2:** `nuxt typecheck` → exit 0; `nuxt build` (with `$env:NODE_OPTIONS='--max-old-space-size=6144'`) → "Build complete".
- [ ] **Step 3:** ESLint on all changed files → no new errors vs base.
- [ ] **Step 4:** Dispatch `reviewer` on `git diff 3432a76..HEAD` with focus: SQL transaction/rollback semantics, lock ordering vs `c1_material_resolve_supplier`, permission check placement, idempotency replay, no leftover UI coupling to supplier resolution, error mapping.
- [ ] **Step 5:** Fix confirmed findings, re-run Steps 1-3, commit `fix(materials): address inline supplier review`.

---

### Task 5: Cloud DEV migration + preview (operations — each needs Sơn's explicit approval)

- [ ] **Step 1 (read-only, needs Supabase auth via /mcp):** list Cloud DEV migration history; confirm `20261009140717_c1_material_order_currency` and `20261010072624_c1_material_evidence_policy_helper_acl` are applied and `20261013120000` is not.
- [ ] **Step 2 (packet, approval):** apply `20261013120000_c1_material_order_inline_supplier.sql` once; run `c1_material_order_inline_supplier.test.sql` and `c1_material_procurement.test.sql` (both rollback-only) if approved.
- [ ] **Step 3 (packet, approval):** push branch tip as `codex/materials-alpha-a3-inline-supplier-release-<sha>`; one `compute connect-repo ... --no-auto-deploy --port 3000 --branch site-engineer-material-request`; ≤8 observations; one GET `/materials`; write receipt next to the A3 checkpoints.
- [ ] **Step 4:** Sơn's manual acceptance on preview: (a) new supplier → order created and supplier created; (b) second order with same name in different case → reuses supplier; (c) same code with different MST → reuses supplier, MST unchanged.
