import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { validateC1CloudDevSql } from '../../../scripts/run-c1-cloud-dev-tests.mjs'

const root = resolve(import.meta.dirname, '../../..')
const names = readdirSync(resolve(root, 'supabase/migrations')).filter(name => /_c1_project_finance_metadata_reads\.sql$/u.test(name))
const sql = names.length === 1 ? readFileSync(resolve(root, 'supabase/migrations', names[0]!), 'utf8') : ''
const lifecycleNames = readdirSync(resolve(root, 'supabase/migrations')).filter(name => /_c1_project_finance_operational_state_read\.sql$/u.test(name))
const lifecycleSql = lifecycleNames.length === 1 ? readFileSync(resolve(root, 'supabase/migrations', lifecycleNames[0]!), 'utf8') : ''

describe('C1 finance metadata reads migration', () => {
  it('contains exactly one narrow forward metadata migration', () => {
    expect(names).toHaveLength(1)
    expect(sql).toMatch(/create function private\.c1_read_project_finance_directory/iu)
    expect(sql).toMatch(/create function public\.c1_read_project_finance_parties/iu)
  })

  it('keeps the helper read-only and grants only public wrappers to authenticated', () => {
    expect(sql).not.toMatch(/\b(?:insert|update|delete|alter table|create table)\b/iu)
    expect(sql).toMatch(/revoke all on function private\.c1_read_project_finance_directory/iu)
    expect(sql).toMatch(/grant execute on function public\.c1_read_project_finance_directory\([^)]*\)\s*\n?\s*to authenticated/iu)
    expect(sql).not.toMatch(/grant execute on function private\.c1_read_project_finance/iu)
  })

  it('allows only c104 synthetic identities in the rollback fixture', () => {
    expect(() => validateC1CloudDevSql('c1_project_finance_metadata_read.test.sql', "begin;\nselect 'c1040000-0000-4000-8000-000000000001';\nrollback;")).not.toThrow()
    expect(() => validateC1CloudDevSql('c1_project_finance_metadata_read.test.sql', "begin;\nselect 'c1010000-0000-4000-8000-000000000001';\nrollback;")).toThrow('Finance metadata SQL must use reserved c104 synthetic UUIDs')
  })
})

describe('C1 finance lifecycle read amendment', () => {
  it('prepares one narrow forward read helper without table grants or data changes', () => {
    expect(lifecycleNames).toEqual(['20260920082415_c1_project_finance_operational_state_read.sql'])
    expect(lifecycleSql).toMatch(/private\.c1_master_context\(target_company_id, 'cost\.read'\)/iu)
    expect(lifecycleSql).toMatch(/p\.tenant_id = v_tenant AND p\.company_id = target_company_id/iu)
    expect(lifecycleSql).toMatch(/cardinality\(target_project_ids\) > 100/iu)
    expect(lifecycleSql.indexOf('array_ndims(target_project_ids) IS DISTINCT FROM 1')).toBeGreaterThan(0)
    expect(lifecycleSql.indexOf('array_ndims(target_project_ids) IS DISTINCT FROM 1')).toBeLessThan(lifecycleSql.indexOf('array_position(target_project_ids'))
    expect(lifecycleSql).toMatch(/grant execute on function public\.c1_read_project_finance_operational_states/iu)
    expect(lifecycleSql).not.toMatch(/\b(?:insert|update|delete|alter table|create table|grant select)\b/iu)
  })

  it('keeps the pending rollback fixture synthetic and guarded', () => {
    const fixture = readFileSync(resolve(root, 'supabase/tests/database/c1/c1_project_finance_operational_state_read.test.sql'), 'utf8')
    expect(() => validateC1CloudDevSql('c1_project_finance_operational_state_read.test.sql', fixture)).not.toThrow()
    expect(fixture).toContain('C105_FINANCE_LIFECYCLE_MULTIDIMENSIONAL')
    expect(fixture).toContain('C105_FINANCE_LIFECYCLE_EXACT_SORTED_RESPONSE')
    expect(() => validateC1CloudDevSql('c1_project_finance_operational_state_read.test.sql', "begin;\nselect 'c1040000-0000-4000-8000-000000000001';\nrollback;")).toThrow('Finance lifecycle SQL must use reserved c105 synthetic UUIDs')
  })
})
