import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../../..')
const capabilityMigrationPath = resolve(root, 'supabase/migrations/20260904094243_opportunity_decision_authority_company_capability.sql')
const forwardMigrationPath = resolve(root, 'supabase/migrations/20260907100000_isolate_b4_policy_acceptance_runtime.sql')

function functionBody(source: string, name: string): string {
  const marker = `create or replace function ${name}`
  const start = source.indexOf(marker)
  if (start === -1) throw new Error(`Missing ${name}`)
  const bodyStart = source.indexOf('$$', start)
  const bodyEnd = source.indexOf('$$', bodyStart + 2)
  if (bodyStart === -1 || bodyEnd === -1) throw new Error(`Missing dollar-quoted body for ${name}`)
  return source.slice(bodyStart + 2, bodyEnd)
}

describe('Opportunity Decision company capability forward migration', () => {
  it('makes cycle policy binding conditional on an explicit company capability without B4 production branching', () => {
    const migration = readFileSync(capabilityMigrationPath, 'utf8')
    const binding = functionBody(migration, 'private.bind_new_stage01_decision_cycle_policy')

    expect(migration).toContain('create table public.company_opportunity_decision_capabilities')
    expect(migration).toContain("capability_key = 'opportunity.decision_authority'")
    const capabilityEnabled = functionBody(migration, 'private.company_opportunity_decision_authority_enabled')
    expect(capabilityEnabled).toContain('select capability.enabled')
    expect(capabilityEnabled).toContain('), false)')
    expect(binding).toContain('if not private.company_opportunity_decision_authority_enabled(new.tenant_id, new.company_id) then')
    expect(binding).toContain('return new;')
    expect(binding).toContain("raise exception using errcode = 'P0001', message = 'OPPORTUNITY_DECISION_POLICY_UNAVAILABLE'")
    expect(binding).not.toContain('b4000000-0000-4000-8000-000000000010')
    expect(binding).not.toContain('b4000000-0000-4000-8000-000000000020')
  })

  it('keeps Final Decision authority enforcement conditional on the same capability source', () => {
    const migration = readFileSync(capabilityMigrationPath, 'utf8')
    const finalDecision = functionBody(migration, 'private.record_opportunity_decision_final_decision')

    expect(finalDecision).toContain('authority_required := private.company_opportunity_decision_authority_enabled(tenant_id, target_company_id);')
    expect(finalDecision).toContain('if authority_required then')
    expect(finalDecision).toContain('STAGE01_DECISION_AUTHORITY_UNRESOLVED')
    expect(finalDecision).toContain('private.assert_opportunity_decision_authority_policy(policy_json)')
  })

  it('prepares B4 capability and policy bootstrap before B4 decision-cycle creation', () => {
    const fixture = readFileSync(resolve(root, 'scripts/stage01-b4-acceptance-fixture.mjs'), 'utf8')

    expect(fixture).toContain('ensureB4DecisionAuthorityConfiguration')
    expect(fixture.indexOf('await ensureB4DecisionAuthorityConfiguration(client, actors.decision.userId)'))
      .toBeLessThan(fixture.indexOf('await ensureRetainedProfiles(client, acceptanceSnapshot.id, acceptanceSnapshot.version, actors.operator.userId)'))
  })

  it('keeps generic companies out of authority assignment while allowing their normal final-decision permission', () => {
    const repository = readFileSync(resolve(root, 'server/features/stage01/stage01.repository.ts'), 'utf8')
    const controls = readFileSync(resolve(root, 'app/components/stage01-operational/Stage01EvaluationDecisionControls.vue'), 'utf8')

    expect(repository).toContain("decisionAuthority.policyBinding.status === 'not_required'")
    expect(controls).toContain("decisionAuthority.status === 'not_required'")
  })

  it('preserves generic company capability handling in the active authority projection', () => {
    const forwardMigration = readFileSync(forwardMigrationPath, 'utf8')
    const projection = functionBody(forwardMigration, 'public.get_opportunity_decision_authority_projection')

    expect(projection).toContain('if not private.company_opportunity_decision_authority_enabled(tenant_id, target_company_id) then')
    expect(projection).toContain("'status', 'not_required'")
    expect(projection).toContain("'policyBinding', jsonb_build_object('status', 'not_required', 'policySnapshotId', null)")
    expect(projection).toContain("'status', case when cycle.decision_policy_snapshot_id is null then 'legacy_unbound' else 'bound' end")
    expect(projection).toContain("'policySnapshotId', cycle.decision_policy_snapshot_id")
    expect(projection).not.toContain('transitionEligible')
  })

  it('covers disabled-company authority RPC rejection through the public contracts', () => {
    const authorityTests = readFileSync(resolve(root, 'supabase/tests/database/opportunity_decision_authority.test.sql'), 'utf8')
    const candidatesIndex = authorityTests.indexOf("public.list_opportunity_decision_authority_candidates('25000000-0000-4000-8000-000000000022'")
    const authenticatedRoleIndex = authorityTests.lastIndexOf('set local role authenticated', candidatesIndex)

    expect(candidatesIndex).toBeGreaterThan(-1)
    expect(authenticatedRoleIndex).toBeGreaterThan(-1)
    expect(authenticatedRoleIndex).toBeLessThan(candidatesIndex)
    expect(authorityTests).toContain("public.assign_opportunity_decision_authority('25000000-0000-4000-8000-000000000022'")
    expect(authorityTests).toContain("'OPPORTUNITY_DECISION_AUTHORITY_NOT_ENABLED'")
    expect(authorityTests).toContain("('25000000-0000-4000-8000-000000000107', 'opportunity.decision_authority.assign')")
  })
})
