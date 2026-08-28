import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createCompanyAccessStore } from '../../../app/stores/company/company-access.store'
import { createActiveCompanyStorage } from '../../../app/services/auth/active-company.storage'
import type { SessionResponse } from '../../../app/repositories/http/http-session-repository'

const firstCompany = {
  tenantId: '10000000-0000-4000-8000-000000000001',
  companyId: '10000000-0000-4000-8000-000000000002',
  companyCode: 'TASKOVIA',
  companyName: 'Taskovia',
  roles: ['company_admin'],
  permissions: ['project.read', 'employee.read_directory'] as const,
}

const secondCompany = {
  ...firstCompany,
  companyId: '10000000-0000-4000-8000-000000000003',
  companyCode: 'OTHER',
  companyName: 'Other company',
}

const thirdCompany = {
  ...firstCompany,
  companyId: '10000000-0000-4000-8000-000000000004',
  companyCode: 'THIRD',
  companyName: 'Third company',
}

function createStorage() {
  const values = new Map<string, string>()
  return {
    values,
    storage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
  }
}

describe('company access store', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('resolves zero, one, and many companies using only the latest validated app session', () => {
    const fakeStorage = createStorage()
    const useCompanyAccessStore = createCompanyAccessStore({
      activeCompanyStorage: createActiveCompanyStorage({ storage: fakeStorage.storage }),
    })
    const store = useCompanyAccessStore()
    const base: SessionResponse = { user: { id: 'user-1', email: 'member@example.com' }, companies: [] }

    expect(store.applySession(base)).toBeNull()
    expect(store.activeCompanyId).toBeNull()

    expect(store.applySession({ ...base, companies: [firstCompany] })).toBe(firstCompany.companyId)
    expect(store.activeCompany).toEqual(firstCompany)

    store.clearRuntime()
    expect(store.applySession({ ...base, companies: [firstCompany, {
      ...firstCompany,
      companyId: '10000000-0000-4000-8000-000000000003',
      companyCode: 'OTHER',
    }] })).toBe(firstCompany.companyId)
    expect(store.activeCompanyId).toBe(firstCompany.companyId)
  })

  it('restores a valid stored selection and exposes permission helpers without persisting roles or permissions', () => {
    const fakeStorage = createStorage()
    const activeCompanyStorage = createActiveCompanyStorage({ storage: fakeStorage.storage })
    activeCompanyStorage.set('user-1', '10000000-0000-4000-8000-000000000002')
    const store = createCompanyAccessStore({ activeCompanyStorage })()

    store.applySession({ user: { id: 'user-1', email: 'member@example.com' }, companies: [firstCompany] })

    expect(store.hasPermission('project.read')).toBe(true)
    expect(store.hasAnyPermission(['employee.read_all', 'employee.read_directory'])).toBe(true)
    expect([...fakeStorage.values.values()].join(' ')).not.toContain('company_admin')
    expect([...fakeStorage.values.values()].join(' ')).not.toContain('employee.read_directory')
  })

  it('preserves a valid selected company through runtime clear and restores it from the next session', () => {
    const fakeStorage = createStorage()
    const store = createCompanyAccessStore({
      activeCompanyStorage: createActiveCompanyStorage({ storage: fakeStorage.storage }),
    })()
    const session: SessionResponse = {
      user: { id: 'user-1', email: 'member@example.com' },
      companies: [firstCompany, secondCompany],
    }

    store.applySession(session)
    expect(store.selectCompany(secondCompany.companyId)).toBe(true)

    store.clearRuntime()
    expect(store.activeCompanyId).toBeNull()

    expect(store.applySession(session)).toBe(secondCompany.companyId)
    expect(store.activeCompanyId).toBe(secondCompany.companyId)
  })

  it('keeps selections isolated when the active session switches users', () => {
    const fakeStorage = createStorage()
    const store = createCompanyAccessStore({
      activeCompanyStorage: createActiveCompanyStorage({ storage: fakeStorage.storage }),
    })()
    const userASession: SessionResponse = {
      user: { id: 'user-a', email: 'a@example.com' },
      companies: [firstCompany, secondCompany],
    }
    const userBSession: SessionResponse = {
      user: { id: 'user-b', email: 'b@example.com' },
      companies: [firstCompany, secondCompany],
    }

    store.applySession(userASession)
    store.selectCompany(secondCompany.companyId)
    store.applySession(userBSession)
    store.selectCompany(firstCompany.companyId)

    expect(store.applySession(userASession)).toBe(secondCompany.companyId)
    expect(store.applySession(userBSession)).toBe(firstCompany.companyId)
  })

  it('removes a stored selection when the current session no longer grants that company', () => {
    const fakeStorage = createStorage()
    const store = createCompanyAccessStore({
      activeCompanyStorage: createActiveCompanyStorage({ storage: fakeStorage.storage }),
    })()
    const user = { id: 'user-1', email: 'member@example.com' }

    store.applySession({ user, companies: [firstCompany, secondCompany] })
    store.selectCompany(secondCompany.companyId)

    expect(store.applySession({ user, companies: [firstCompany, thirdCompany] })).toBeNull()
    expect(fakeStorage.values.has('taskovia:active-company:user-1')).toBe(false)
  })
})
