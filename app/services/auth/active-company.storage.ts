export interface BrowserStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface ActiveCompanyStorage {
  get(userId: string, validCompanyIds: readonly string[]): string | null
  set(userId: string, companyId: string): void
  clear(userId: string): void
}

function browserLocalStorage(): BrowserStorage | null {
  try {
    return globalThis.localStorage
  }
  catch {
    return null
  }
}

function storageKey(userId: string): string {
  return `taskovia:active-company:${userId}`
}

export function createActiveCompanyStorage(options: { storage?: BrowserStorage } = {}): ActiveCompanyStorage {
  const storage = options.storage ?? browserLocalStorage()

  return {
    get(userId, validCompanyIds) {
      if (!storage || !userId) return null

      const key = storageKey(userId)
      const companyId = storage.getItem(key)
      if (companyId && validCompanyIds.includes(companyId)) return companyId

      if (companyId) storage.removeItem(key)
      return null
    },
    set(userId, companyId) {
      if (storage && userId && companyId) storage.setItem(storageKey(userId), companyId)
    },
    clear(userId) {
      if (storage && userId) storage.removeItem(storageKey(userId))
    },
  }
}
