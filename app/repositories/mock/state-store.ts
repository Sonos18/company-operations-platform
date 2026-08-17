import { PRODUCT_BRAND } from '../../../shared/constants/product-brand'
import { validateMockState } from './schemas'
import type { MockState } from './schemas'

export const MOCK_STORAGE_KEY = `${PRODUCT_BRAND.storageNamespace}:tenant-vqh:company-vqh:prototype:v1`
export const LEGACY_MOCK_STORAGE_KEY = 'company-operations-platform:tenant-vqh:company-vqh:prototype:v1'

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface StateStore {
  read(): MockState | null
  write(state: MockState): void
  clear(): void
}

export class MemoryStateStore implements StateStore {
  private state: MockState | null = null

  read(): MockState | null {
    return this.state ? structuredClone(this.state) : null
  }

  write(state: MockState): void {
    this.state = structuredClone(state)
  }

  clear(): void {
    this.state = null
  }
}

export class BrowserStateStore implements StateStore {
  constructor(private readonly storage: StorageLike = localStorage) {}

  private readAt(key: string): MockState | null {
    const serialized = this.storage.getItem(key)
    if (!serialized) return null
    try {
      const parsed = JSON.parse(serialized)
      validateMockState(parsed)
      return parsed as MockState
    } catch {
      this.storage.removeItem(key)
      return null
    }
  }

  read(): MockState | null {
    const current = this.readAt(MOCK_STORAGE_KEY)
    if (current) return current

    const legacy = this.readAt(LEGACY_MOCK_STORAGE_KEY)
    if (!legacy) return null

    try {
      this.storage.setItem(MOCK_STORAGE_KEY, JSON.stringify(legacy))
      this.storage.removeItem(LEGACY_MOCK_STORAGE_KEY)
    } catch {
      return legacy
    }
    return legacy
  }

  write(state: MockState): void {
    this.storage.setItem(MOCK_STORAGE_KEY, JSON.stringify(state))
  }

  clear(): void {
    this.storage.removeItem(MOCK_STORAGE_KEY)
    this.storage.removeItem(LEGACY_MOCK_STORAGE_KEY)
  }
}
