import { describe, expect, it } from 'vitest'
import { createAsyncRequestTracker } from '../../../app/utils/costs/async-request-tracker'

describe('async-request-tracker (R02, R03)', () => {
  it('increments generation and captures immutable identity on start', () => {
    const tracker = createAsyncRequestTracker<{ contractorId: string; page: number }>()

    const token1 = tracker.start({ contractorId: 'c1', page: 1 })
    expect(token1.generation).toBe(1)
    expect(token1.identity).toEqual({ contractorId: 'c1', page: 1 })
    expect(token1.isCurrent()).toBe(true)

    const token2 = tracker.start({ contractorId: 'c2', page: 1 })
    expect(token2.generation).toBe(2)
    expect(token2.identity).toEqual({ contractorId: 'c2', page: 1 })
    expect(token2.isCurrent()).toBe(true)
    // token1 is now stale!
    expect(token1.isCurrent()).toBe(false)
  })

  it('controls response order deterministically when resolving B before A', async () => {
    const tracker = createAsyncRequestTracker<{ partyId: string }>()

    const state = { activeParty: '', activeAmount: '' }

    // User selects contractor A (slow request)
    const tokenA = tracker.start({ partyId: 'contractor-A' })
    const promiseA = new Promise<{ id: string; amount: string }>((resolve) => {
      setTimeout(() => resolve({ id: 'contractor-A', amount: '100,000' }), 50)
    })

    // User quickly switches to contractor B (faster request)
    const tokenB = tracker.start({ partyId: 'contractor-B' })
    const promiseB = new Promise<{ id: string; amount: string }>((resolve) => {
      setTimeout(() => resolve({ id: 'contractor-B', amount: '200,000' }), 10)
    })

    // Resolve B first
    const resB = await promiseB
    if (tokenB.isCurrent()) {
      state.activeParty = resB.id
      state.activeAmount = resB.amount
    }
    expect(state.activeParty).toBe('contractor-B')
    expect(state.activeAmount).toBe('200,000')

    // Then A finishes later
    const resA = await promiseA
    if (tokenA.isCurrent()) {
      state.activeParty = resA.id
      state.activeAmount = resA.amount
    }

    // State MUST NOT be overwritten by A!
    expect(state.activeParty).toBe('contractor-B')
    expect(state.activeAmount).toBe('200,000')
  })

  it('invalidates immediately when selection clears or unmounts', () => {
    const tracker = createAsyncRequestTracker<{ query: string }>()
    const token = tracker.start({ query: 'wood' })
    expect(token.isCurrent()).toBe(true)

    tracker.invalidate()
    expect(token.isCurrent()).toBe(false)
    expect(tracker.identity).toBeNull()
  })

  it('does not allow failed stale requests to set error state', async () => {
    const tracker = createAsyncRequestTracker<{ query: string }>()
    let uiError: string | null = null

    // Request 1 fails after 30ms
    const token1 = tracker.start({ query: 'stale-search' })
    const promise1 = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Stale fail')), 30)
    })

    // Request 2 initiated at 10ms
    const token2 = tracker.start({ query: 'new-search' })
    expect(token1.isCurrent()).toBe(false)
    expect(token2.isCurrent()).toBe(true)

    try {
      await promise1
    }
    catch (err: unknown) {
      if (token1.isCurrent()) {
        uiError = err instanceof Error ? err.message : String(err)
      }
    }

    // Stale error must be discarded
    expect(uiError).toBeNull()
  })
})
