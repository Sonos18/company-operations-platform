import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
const root = resolve(import.meta.dirname, '../../..')
const name = readdirSync(resolve(root, 'supabase/migrations')).find(name => name.endsWith('_hr_manual_invitation_terminated_guard.sql'))!
const migration = readFileSync(resolve(root, 'supabase/migrations', name), 'utf8')
describe('manual invitation terminated employee guard migration', () => {
 it('rejects terminated employees while holding their row lock so membership updates roll back', () => {
  expect(migration).toContain('create or replace function private.complete_employee_onboarding(')
  expect(migration).toContain("if v_existing_employment_status = 'terminated' then")
  const lock = migration.indexOf('for update;')
  const guard = migration.indexOf("if v_existing_employment_status = 'terminated' then")
  expect(lock).toBeGreaterThan(0)
  expect(guard).toBeGreaterThan(lock)
  expect(migration.slice(guard, migration.indexOf('end if;', guard))).toContain("message = 'EMPLOYEE_EMAIL_CONFLICT'")
  expect(migration).not.toMatch(/exception\s+when/i)
 })
 it('preserves the existing private onboarding implementation except for the terminated guard', () => {
  const baseline = readFileSync(resolve(root, 'supabase/migrations/20260818074118_harden_employee_onboarding_permissions.sql'), 'utf8').split('create or replace function public.complete_employee_onboarding(')[0]!.trim()
  const withoutGuard = migration
    .replace('  v_existing_employment_status text;\n', '')
    .replace(', employee.employment_status', '')
    .replace(', v_existing_employment_status', '')
    .replace("    if v_existing_employment_status = 'terminated' then\n      raise exception using errcode = 'P0001', message = 'EMPLOYEE_EMAIL_CONFLICT';\n    end if;\n", '')
    .trim()
  expect(withoutGuard).toBe(baseline)
 })
})
