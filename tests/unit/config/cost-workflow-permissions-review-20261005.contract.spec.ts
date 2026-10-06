// Owned review regression specifications. These two expectations expose known
// source gaps; they do not execute SQL or prove live RLS enforcement.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { workflowNotificationViewSchema } from '../../../shared/schemas/costs/cost-workflow'

describe('owned permissions review: unresolved design regressions', () => {
  it('requires fresh account authority before the historical Storage fallback', () => {
    const sql = readFileSync('supabase/migrations/20261004210400_c1_cost_workflow_cash_commands.sql', 'utf8')
    const begin = sql.lastIndexOf('create or replace function private.c1_can_select_evidence_object(')
    expect(begin).toBeGreaterThanOrEqual(0)
    const fn = sql.slice(begin, sql.indexOf('$$;', begin) + 3)
    // The owner closes the gap with an outer account predicate covering ALL
    // historical and workflow branches. Requiring one specific helper call
    // inside the legacy branch would incorrectly reject that valid fix.
    const outerGuard = fn.slice(0, fn.indexOf('(not f.workflow_origin'))
    expect(outerGuard).toContain('and exists(select 1 from auth.users account')
    expect(outerGuard).toContain('account.id=(select auth.uid())')
    expect(outerGuard).toContain('account.banned_until is null or account.banned_until<=now()')
    expect(outerGuard).toContain('and (')

  })

  it('exposes the exact approved request/version and kind for a scoped notification link', () => {
    const id = 'c1f50000-0000-4000-8000-000000000001'
    expect(workflowNotificationViewSchema.safeParse({
      id, projectId: id, decisionId: id, recipientId: id,
      requestId: id, submittedVersionId: id, kind: 'installment',
      deliveryState: 'available', readAt: null, createdAt: '2026-10-05T00:00:00.000Z',
    }).success).toBe(true)
  })
})
