import { describe, expect, it } from 'vitest'
import { INITIAL_MOCK_STATE } from '../../../app/repositories/mock/fixtures'
import {
  BrowserStateStore,
  type StorageLike,
} from '../../../app/repositories/mock/state-store'

const CANONICAL_KEY = 'taskovia:tenant-vqh:company-vqh:prototype:v1'
const LEGACY_KEY = 'company-operations-platform:tenant-vqh:company-vqh:prototype:v1'

class TestStorage implements StorageLike {
  private readonly values = new Map<string, string>()

  constructor(initial: Record<string, string> = {}, private readonly failOnSetKey?: string) {
    for (const [key, value] of Object.entries(initial)) this.values.set(key, value)
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    if (key === this.failOnSetKey) throw new Error('storage write failed')
    this.values.set(key, value)
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }
}

const serializedState = JSON.stringify(INITIAL_MOCK_STATE)

describe('BrowserStateStore TASKOVIA namespace', () => {
  it('writes new state under the TASKOVIA namespace', () => {
    const storage = new TestStorage()

    new BrowserStateStore(storage).write(INITIAL_MOCK_STATE)

    expect(JSON.parse(storage.getItem(CANONICAL_KEY)!)).toEqual(INITIAL_MOCK_STATE)
    expect(storage.getItem(LEGACY_KEY)).toBeNull()
  })

  it('prefers canonical data when both keys exist', () => {
    const canonical = structuredClone(INITIAL_MOCK_STATE)
    canonical.companies[0]!.name = 'Canonical company'
    const storage = new TestStorage({
      [CANONICAL_KEY]: JSON.stringify(canonical),
      [LEGACY_KEY]: serializedState,
    })

    const state = new BrowserStateStore(storage).read()

    expect(state?.companies[0]?.name).toBe('Canonical company')
    expect(storage.getItem(LEGACY_KEY)).toBe(serializedState)
  })

  it('migrates valid legacy data and removes the old key after writing', () => {
    const storage = new TestStorage({ [LEGACY_KEY]: serializedState })

    const state = new BrowserStateStore(storage).read()

    expect(state).toEqual(INITIAL_MOCK_STATE)
    expect(JSON.parse(storage.getItem(CANONICAL_KEY)!)).toEqual(INITIAL_MOCK_STATE)
    expect(storage.getItem(LEGACY_KEY)).toBeNull()
  })

  it('removes invalid legacy data and returns no state', () => {
    const storage = new TestStorage({ [LEGACY_KEY]: '{"projects":"invalid"}' })

    expect(new BrowserStateStore(storage).read()).toBeNull()
    expect(storage.getItem(LEGACY_KEY)).toBeNull()
    expect(storage.getItem(CANONICAL_KEY)).toBeNull()
  })

  it('keeps valid legacy data when the canonical write fails', () => {
    const storage = new TestStorage(
      { [LEGACY_KEY]: serializedState },
      CANONICAL_KEY,
    )

    expect(new BrowserStateStore(storage).read()).toEqual(INITIAL_MOCK_STATE)
    expect(storage.getItem(LEGACY_KEY)).toBe(serializedState)
    expect(storage.getItem(CANONICAL_KEY)).toBeNull()
  })

  it('clears canonical and legacy data together', () => {
    const storage = new TestStorage({
      [CANONICAL_KEY]: serializedState,
      [LEGACY_KEY]: serializedState,
    })

    new BrowserStateStore(storage).clear()

    expect(storage.getItem(CANONICAL_KEY)).toBeNull()
    expect(storage.getItem(LEGACY_KEY)).toBeNull()
  })
})
