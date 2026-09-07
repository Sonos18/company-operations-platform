import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../../..')
const migrationPath = resolve(root, 'supabase/migrations/20260905124508_restore_opportunity_decision_final_history_invariants.sql')

function functionBody(source: string, name: string): string {
  const marker = `create or replace function ${name}`
  const start = source.indexOf(marker)
  if (start === -1) throw new Error(`Missing ${name}`)
  const bodyStart = source.indexOf('$$', start)
  const bodyEnd = source.indexOf('$$', bodyStart + 2)
  if (bodyStart === -1 || bodyEnd === -1) throw new Error(`Missing dollar-quoted body for ${name}`)
  return source.slice(bodyStart + 2, bodyEnd)
}

describe('Stage 01 Final Decision history forward migration', () => {
  it('restores recommendation lineage and override validation in the current guard', () => {
    const migration = readFileSync(migrationPath, 'utf8')
    const guard = functionBody(migration, 'private.guard_stage01_decision_cycle')

    expect(guard).toContain('recommendation.decision_cycle_id = new.id')
    expect(guard).toContain('recommendation.tenant_id = new.tenant_id')
    expect(guard).toContain('recommendation.company_id = new.company_id')
    expect(guard).toContain('STAGE01_FINAL_RECOMMENDATION_CYCLE_MISMATCH')
    expect(guard).toContain('STAGE01_DECISION_OVERRIDE_INVALID')
    expect(guard).toContain('STAGE01_OVERRIDE_RATIONALE_REQUIRED')
  })

  it('retains current Decision Authority and Decision Policy pointer invariants', () => {
    const migration = readFileSync(migrationPath, 'utf8')
    const guard = functionBody(migration, 'private.guard_stage01_decision_cycle')

    expect(guard).toContain('OPPORTUNITY_DECISION_POLICY_POINTER_IMMUTABLE')
    expect(guard).toContain('OPPORTUNITY_DECISION_POLICY_POINTER_INVALID')
    expect(guard).toContain('OPPORTUNITY_DECISION_AUTHORITY_POINTER_INVALID')
    expect(guard).toContain('public.opportunity_decision_policy_snapshots')
    expect(guard).toContain('public.opportunity_decision_authority_events')
  })

  it('keeps the pre-A25 history regression fixture coverage for both negative and positive cases', () => {
    const history = readFileSync(resolve(root, 'supabase/tests/database/stage01_history.test.sql'), 'utf8')

    expect(history).toContain("final_recommendation_id = '53000000-0000-4000-8000-000000000121'")
    expect(history).toContain("'STAGE01_FINAL_RECOMMENDATION_CYCLE_MISMATCH'")
    expect(history).toContain("override_rationale = 'Unnecessary override'")
    expect(history).toContain("'STAGE01_DECISION_OVERRIDE_INVALID'")
    expect(history).toContain("'STAGE01_OVERRIDE_RATIONALE_REQUIRED'")
    expect(history).toContain("final_rationale = 'Valid direct-history override'")
    expect(history).toContain("override_rationale = 'Different outcome is deliberately approved'")
    expect(history).toContain("raise exception 'DB-S01-HIST valid differing-outcome override was not persisted'")
    expect(history).toContain("final_rationale = 'Immutable final decision'")
  })
})
