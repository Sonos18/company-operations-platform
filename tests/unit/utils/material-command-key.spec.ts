import { describe, expect, it } from 'vitest'
import { createCommandKeyKeeper } from '../../../app/utils/materials/command-key'

describe('createCommandKeyKeeper', () => {
  it('reuses the key for an identical payload and issues a new key when it changes', () => {
    const keeper = createCommandKeyKeeper()
    const first = keeper.keyFor({ total: '110', rows: [1, 2] })
    expect(keeper.keyFor({ total: '110', rows: [1, 2] })).toBe(first)
    const changed = keeper.keyFor({ total: '120', rows: [1, 2] })
    expect(changed).not.toBe(first)
    expect(keeper.keyFor({ total: '120', rows: [1, 2] })).toBe(changed)
  })

  it('issues a fresh key after reset', () => {
    const keeper = createCommandKeyKeeper()
    const first = keeper.keyFor({ a: 1 })
    keeper.reset()
    expect(keeper.keyFor({ a: 1 })).not.toBe(first)
  })

  it('produces UUIDs', () => {
    expect(createCommandKeyKeeper().keyFor({})).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})
