import { describe, expect, it } from 'vitest'
import {
  createActiveCompanyStorage,
} from '../../../app/services/auth/active-company.storage'
import {
  createRecoveryFlowStorage,
} from '../../../app/services/auth/recovery-flow.storage'

function createStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  }
}

describe('auth browser storage', () => {
  it('uses a user-scoped active-company key and rejects a company absent from the latest session', () => {
    const storage = createStorage()
    const activeCompany = createActiveCompanyStorage({ storage })

    activeCompany.set('user-a', 'company-a')
    activeCompany.set('user-b', 'company-b')

    expect(activeCompany.get('user-a', ['company-a'])).toBe('company-a')
    expect(activeCompany.get('user-a', ['company-c'])).toBeNull()
    expect(storage.getItem('taskovia:active-company:user-a')).toBeNull()
    expect(activeCompany.get('user-b', ['company-b'])).toBe('company-b')
  })

  it('keeps only a short-lived non-secret recovery marker in session storage', () => {
    const storage = createStorage()
    const recovery = createRecoveryFlowStorage({ storage, now: () => 1_000 })

    recovery.begin('recovery')

    expect(recovery.get()).toEqual({ type: 'recovery', timestamp: 1_000 })
    expect(storage.getItem('taskovia:recovery-flow')).toBe('{"type":"recovery","timestamp":1000}')

    const expired = createRecoveryFlowStorage({ storage, now: () => 901_001 })
    expect(expired.get()).toBeNull()
    expect(storage.getItem('taskovia:recovery-flow')).toBeNull()
  })
})
