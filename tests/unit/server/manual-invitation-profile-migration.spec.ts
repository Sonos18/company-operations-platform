import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
const root = resolve(import.meta.dirname, '../../..')
const baseline = readFileSync(resolve(root, 'supabase/migrations/20261003074553_hr_manual_invitation_terminated_guard.sql'), 'utf8')
const name = readdirSync(resolve(root, 'supabase/migrations')).find(name => name.endsWith('_hr_invitation_profile_guard.sql'))
const migration = name ? readFileSync(resolve(root, 'supabase/migrations', name), 'utf8') : baseline
const declarations = '  v_existing_full_name text;\n  v_existing_department_id uuid;\n  v_existing_position_id uuid;\n  v_existing_hire_date date;\n'
const guard = `    if pg_catalog.btrim(v_existing_full_name) is distinct from pg_catalog.btrim(target_full_name)
       or v_existing_department_id is distinct from target_department_id
       or v_existing_position_id is distinct from target_position_id
       or v_existing_hire_date is distinct from target_hire_date then
      raise exception using errcode = 'P0001', message = 'EMPLOYEE_EMAIL_CONFLICT';
    end if;
`
describe('locked invitation profile guard migration', () => {
 it('rejects every changed profile field within the existing employee row lock', () => {
  const lock = migration.indexOf('for update;')
  expect(migration).toContain(guard)
  expect(migration.indexOf(guard)).toBeGreaterThan(lock)
  expect(migration.indexOf(guard)).toBeLessThan(migration.indexOf('  else\n    insert into public.employees'))
  expect(migration).not.toMatch(/exception\s+when/i)
 })
 it('keeps all existing actor, tenant, role and terminated guards and onboarding writes', () => {
  const withoutGuard = migration
   .replace(declarations, '')
   .replace(', employee.full_name, employee.department_id, employee.position_id, employee.hire_date', '')
   .replace(', v_existing_full_name, v_existing_department_id, v_existing_position_id, v_existing_hire_date', '')
   .replace(guard, '')
  expect(withoutGuard).toBe(baseline)
 })
})
