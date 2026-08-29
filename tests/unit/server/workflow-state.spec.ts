import { describe, expect, it } from 'vitest'
import { deriveWorkflowNodeState } from '../../../server/features/workflow/workflow-state'

describe('deriveWorkflowNodeState', () => {
  it.each([
    {
      input: { phase: 'not_started' as const, dependenciesSatisfied: false, hasOpenBlockingBlocker: false },
      expected: 'locked',
    },
    {
      input: { phase: 'not_started' as const, dependenciesSatisfied: true, hasOpenBlockingBlocker: false },
      expected: 'ready',
    },
    {
      input: { phase: 'active' as const, dependenciesSatisfied: true, hasOpenBlockingBlocker: false },
      expected: 'active',
    },
    {
      input: { phase: 'active' as const, dependenciesSatisfied: true, hasOpenBlockingBlocker: true },
      expected: 'blocked',
    },
    {
      input: { phase: 'completed' as const, dependenciesSatisfied: false, hasOpenBlockingBlocker: true },
      expected: 'completed',
    },
    {
      input: { phase: 'not_applicable' as const, dependenciesSatisfied: true, hasOpenBlockingBlocker: true },
      expected: 'not_applicable',
    },
  ])('derives $expected from the persisted phase and runtime facts', ({ input, expected }) => {
    expect(deriveWorkflowNodeState(input)).toBe(expected)
  })

  it('does not derive blocked for a node that has not started', () => {
    expect(deriveWorkflowNodeState({
      phase: 'not_started',
      dependenciesSatisfied: true,
      hasOpenBlockingBlocker: true,
    })).toBe('ready')
  })
})
