import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { canonicalizeSourceText } from '../../helpers/canonical-source-text'

const root = resolve(import.meta.dirname, '../../..')
const read = (path: string) => canonicalizeSourceText(readFileSync(resolve(root, path), 'utf8'))
const forwardMigrationPath = 'supabase/migrations/20260907100000_isolate_b4_policy_acceptance_runtime.sql'

const protectedMigrationHashes = {
  'supabase/migrations/20260904050924_opportunity_decision_authority_slice1.sql': 'dcaa82eb9ae3c0c96c0336c65067dae8d395a687085220fe62a9edf90d3b9840',
  'supabase/migrations/20260904094243_opportunity_decision_authority_company_capability.sql': 'd281ad0ec6de7ed8428abac61541982f30307a4dc7cd1944ebfdda6abd5d13d9',
  'supabase/migrations/20260905124508_restore_opportunity_decision_final_history_invariants.sql': '2bff3bbc11332469142d5d8a364e88ebd08a39234348d19a6b28fae2b9e3ea71',
} as const

function functionBody(source: string, name: string): string {
  const marker = `create or replace function ${name}`
  const start = source.indexOf(marker)
  if (start === -1) throw new Error(`Missing ${name}`)
  const bodyStart = source.indexOf('$$', start)
  const bodyEnd = source.indexOf('$$', bodyStart + 2)
  if (bodyStart === -1 || bodyEnd === -1) throw new Error(`Missing dollar-quoted body for ${name}`)
  return source.slice(bodyStart + 2, bodyEnd)
}

describe('Stage01 production B4 isolation contract', () => {
  it('does not expose the B4 policy transition in the production decision controls', () => {
    expect(read('app/components/stage01-operational/Stage01EvaluationDecisionControls.vue'))
      .not.toContain('b4_acceptance_policy_transition')
  })

  it('does not expose the B4 policy transition schema in shared code', () => {
    expect(read('shared/schemas/opportunity-decision-authority.ts'))
      .not.toContain('transitionOpportunityDecisionPolicyInputSchema')
  })

  it('does not call the B4 policy transition RPC from the repository', () => {
    expect(read('server/features/stage01/stage01.repository.ts'))
      .not.toContain('transition_opportunity_decision_policy')
  })

  it('applies the active authority projection correction only through the forward migration', () => {
    const absoluteForwardMigrationPath = resolve(root, forwardMigrationPath)

    expect(existsSync(absoluteForwardMigrationPath)).toBe(true)

    const forwardMigration = read(forwardMigrationPath)
    const activeProjectionBody = functionBody(
      forwardMigration,
      'public.get_opportunity_decision_authority_projection',
    )

    expect(forwardMigration).toContain('revoke all on function public.transition_opportunity_decision_policy(uuid, uuid, uuid, jsonb) from public, anon, authenticated;')
    expect(forwardMigration).toContain('drop function public.transition_opportunity_decision_policy(uuid, uuid, uuid, jsonb);')
    expect(forwardMigration).toContain('create or replace function public.get_opportunity_decision_authority_projection')
    expect(activeProjectionBody).toContain('private.company_opportunity_decision_authority_enabled(tenant_id, target_company_id)')
    expect(activeProjectionBody).toContain("'policySnapshotId', cycle.decision_policy_snapshot_id")
    expect(activeProjectionBody).not.toContain('transitionEligible')
    expect(forwardMigration.toLowerCase()).not.toContain('b4')
    expect(forwardMigration).not.toContain('b4_acceptance_policy_transition')
    expect(forwardMigration).not.toMatch(/\b(insert|update|delete)\b/i)
    expect(forwardMigration).not.toMatch(/\b(backfill|rebind)\b/i)
  })

  it('keeps protected migrations byte-for-byte immutable', () => {
    for (const [path, expectedHash] of Object.entries(protectedMigrationHashes)) {
      const actualHash = createHash('sha256').update(read(path)).digest('hex')
      expect(actualHash).toBe(expectedHash)
    }
  })

  it('retains B4 acceptance-fixture authority configuration', () => {
    expect(read('scripts/stage01-b4-acceptance-fixture.mjs'))
      .toContain('ensureB4DecisionAuthorityConfiguration')
  })
})
