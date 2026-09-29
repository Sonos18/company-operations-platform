import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function hardeningSql() {
  const directory = resolve(process.cwd(), 'supabase/migrations')
  const names = readdirSync(directory).filter(name => name.endsWith('_c1_root_cause_hardening.sql'))
  expect(names).toHaveLength(1)
  return readFileSync(resolve(directory, names[0]!), 'utf8')
}

function detailCommandsSql() {
  return readFileSync(resolve(process.cwd(), 'supabase/tests/database/c1/c1_ordinary_cost_detail_commands.test.sql'), 'utf8')
}

describe('C1 root-cause hardening migration', () => {
  it('keeps the canonical parent uniqueness index and serializes every parent-identity mutation', () => {
    const sql = hardeningSql()

    expect(sql).toContain('private.c1_lock_project_cost_category')
    expect(sql).toContain('private.c1_resolve_or_create_ordinary_project_cost_item')
    expect(sql).toContain('c1_project_cost_parent_identity_guard')
    expect(sql).toContain('PROJECT_COST_CATEGORY_CONFLICT')
    expect(sql).not.toMatch(/create\s+(?:unique\s+)?index[\s\S]*c1fc_cost_item_one_category/iu)
  })

  it('uses one persisted-detail readiness decision for read, publish, and correction', () => {
    const sql = hardeningSql()
    const publish = sql.match(/create or replace function private\.c1_publish_project_cost_detail[\s\S]*?\n\$\$;/iu)?.[0] ?? ''

    expect(sql).toContain('private.c1_project_cost_detail_publish_readiness')
    expect(sql).toContain('private.c1_detail_validate_linked_sources')
    expect(publish).toContain('private.c1_project_cost_detail_publish_readiness')
    expect(publish).toMatch(/message\s*=\s*'COST_DETAIL_PUBLISH_NOT_READY'/u)
    expect(publish).not.toMatch(/v_detail\.amount_text\s+is\s+null/iu)
    expect(sql).toContain('COST_DETAIL_PUBLISH_NOT_READY')
    expect(sql).toContain('EVIDENCE_NOT_FINALIZED')
  })

  it('protects independently managed detail lifecycle state and relies on posting strategy', () => {
    const sql = hardeningSql()

    expect(sql).toContain('private.c1_project_cost_item_has_managed_detail_state')
    expect(sql).toContain("posting_strategy='subcontract_payment'")
    expect(sql).toContain('private.c1_assert_project_cost_operational_scope')
    expect(sql).toContain('revoke all on function private.c1_lock_project_cost_category')
  })

  it('preserves legacy parent evidence readiness while moving subcontract selection to posting strategy', () => {
    const sql = hardeningSql()
    const readiness = sql.match(/create or replace function private\.c1_project_cost_publish_readiness[\s\S]*?\n\$\$;/iu)?.[0] ?? ''

    expect(readiness).toContain('EVIDENCE_NOT_FINALIZED')
    expect(readiness).toContain("posting_strategy='subcontract_payment'")
    expect(readiness).not.toContain("category.code='subcontract_labor'")
  })

  it('does not take a category lock for a non-identity parent update', () => {
    const sql = hardeningSql()
    const guard = sql.match(/create function private\.c1_guard_project_cost_parent_identity\(\)[\s\S]*?\n\$\$;/iu)?.[0] ?? ''

    expect(guard).toMatch(/old\.tenant_id,old\.company_id,old\.project_id,old\.cost_category_id\)\s+is not distinct from\s+\(new\.tenant_id,new\.company_id,new\.project_id,new\.cost_category_id\)/iu)
    expect(guard.indexOf('is not distinct from')).toBeLessThan(guard.indexOf('private.c1_lock_project_cost_category'))
  })

  it('loads read and publish scope without preempting the canonical strategy blocker', () => {
    const sql = hardeningSql()
    const read = sql.match(/create or replace function private\.c1_read_project_cost_detail_draft[\s\S]*?\n\$\$;/iu)?.[0] ?? ''
    const publish = sql.match(/create or replace function private\.c1_publish_project_cost_detail[\s\S]*?\n\$\$;/iu)?.[0] ?? ''

    expect(sql).toContain('private.c1_detail_load_readiness_scope')
    expect(read).toContain('private.c1_detail_load_readiness_scope')
    expect(publish).toContain('private.c1_detail_load_readiness_scope')
  })

  it('replaces direct create-and-publish with one v0 published command history', () => {
    const sql = hardeningSql()
    const direct = sql.match(/create or replace function private\.c1_create_and_publish_project_cost_detail[\s\S]*?\n\$\$;/iu)?.[0] ?? ''
    const prepare = sql.match(/create or replace function private\.c1_prepare_project_cost_detail_financials[\s\S]*?\n\$\$;/iu)?.[0] ?? ''

    expect(sql).toContain('private.c1_detail_validate_financial_input')
    expect(prepare).toContain('private.c1_detail_validate_financial_input')
    expect(direct).toContain("private.c1_detail_context(target_company_id,'cost.manage')")
    expect(direct).toContain("private.c1_detail_context(target_company_id,'cost.prepare')")
    expect(direct).toContain("private.c1_detail_context(target_company_id,'cost.publish_import')")
    expect(direct).toContain('private.c1_resolve_or_create_ordinary_project_cost_item')
    expect(direct).toContain('private.c1_detail_validate_financial_input')
    expect(direct).toContain('private.c1_detail_replace_sources')
    expect(direct).toContain('private.c1_project_cost_detail_publish_readiness')
    expect(direct).toContain('private.c1_sync_project_cost_item_amount')
    expect(direct).toContain("'c1.project_cost_detail.created_and_published'")
    expect(direct).toContain("'project_cost_detail.create_and_publish'")
    expect(direct).not.toContain('private.c1_create_project_cost_detail_draft')
    expect(direct).not.toContain('private.c1_prepare_project_cost_detail_financials')
    expect(direct).not.toContain('private.c1_publish_project_cost_detail')
    expect(direct).not.toContain('jsonb_object_keys')
    expect(direct).not.toMatch(/update\s+public\.project_cost_item_details[\s\S]*?set\s+version\s*=\s*0/iu)
    expect(direct.indexOf('v_receipt:=private.c1_detail_receipt')).toBeLessThan(direct.indexOf('perform private.c1_detail_validate_financial_input'))
  })

  it('enforces strict RPC envelopes before financial casts while retaining direct replay precedence', () => {
    const sql = hardeningSql()
    const financial = sql.match(/create function private\.c1_detail_validate_financial_input[\s\S]*?\n\$\$;/iu)?.[0] ?? ''
    const directEnvelope = sql.match(/create function private\.c1_detail_validate_direct_create_input[\s\S]*?\n\$\$;/iu)?.[0] ?? ''
    const prepareEnvelope = sql.match(/create function private\.c1_detail_validate_prepare_financial_input[\s\S]*?\n\$\$;/iu)?.[0] ?? ''
    const direct = sql.match(/create or replace function private\.c1_create_and_publish_project_cost_detail[\s\S]*?\n\$\$;/iu)?.[0] ?? ''
    const prepare = sql.match(/create or replace function private\.c1_prepare_project_cost_detail_financials[\s\S]*?\n\$\$;/iu)?.[0] ?? ''

    expect(sql).toContain('private.c1_detail_validate_direct_create_input')
    expect(sql).toContain('private.c1_detail_validate_prepare_financial_input')
    expect(direct).toContain('perform private.c1_detail_validate_direct_create_input(target_input)')
    expect(prepare).toContain('private.c1_detail_validate_prepare_financial_input(target_input)')
    expect(financial).toContain("jsonb_typeof(target_input->'amount')<>'string'")
    expect(financial).toContain("jsonb_typeof(target_input->'retentionRateBps')<>'number'")
    expect(financial).toContain("jsonb_typeof(target_input->'unitCode')<>'string'")
    expect(financial.indexOf("jsonb_typeof(target_input->'amount')<>'string'")).toBeLessThan(financial.indexOf("target_input->>'amount'"))
    expect(directEnvelope).toMatch(/if jsonb_typeof\(target_input\) is distinct from 'object' then raise exception using errcode='P0001',message='INPUT_INVALID'; end if;/u)
    expect(prepareEnvelope).toMatch(/if jsonb_typeof\(target_input\) is distinct from 'object' then raise exception using errcode='P0001',message='INPUT_INVALID'; end if;/u)
    expect(directEnvelope.indexOf("jsonb_typeof(target_input) is distinct from 'object'")).toBeLessThan(directEnvelope.indexOf('jsonb_object_keys(target_input)'))
    expect(prepareEnvelope.indexOf("jsonb_typeof(target_input) is distinct from 'object'")).toBeLessThan(prepareEnvelope.indexOf('jsonb_object_keys(target_input)'))
    expect(direct.indexOf('v_receipt:=private.c1_detail_receipt')).toBeLessThan(direct.indexOf('perform private.c1_detail_validate_direct_create_input(target_input)'))
  })

  it('keeps volatile parent command calls out of assertion lookup predicates', () => {
    const sql = detailCommandsSql()

    expect(sql).not.toMatch(/where id=\(public\.c1_update_project_cost_draft/iu)
    expect(sql).not.toMatch(/where id=\(public\.c1_correct_published_project_cost/iu)
  })

  it('passes known draft versions into the publish-error fixture helper without bypassing RLS', () => {
    const sql = detailCommandsSql()
    const helper = sql.match(/create function pg_temp\.c1d_publish_error_detail[\s\S]*?\n\$\$;/iu)?.[0] ?? ''

    expect(helper).toContain('target_expected_version bigint')
    expect(helper).toContain("jsonb_build_object('expectedVersion',target_expected_version)")
    expect(helper).not.toMatch(/select version from public\.project_cost_item_details/iu)
    expect(sql).toContain("c1d_publish_error_detail((select (result->>'id')::uuid from c1d_sibling),1")
    expect(sql).toContain("c1d_publish_error_detail('c1d10000-0000-4000-8000-000000000806',0")
  })
})
