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

type ReadResult =
  | { status: 'valid'; state: MockState }
  | { status: 'missing' | 'invalid' | 'error' }

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

  private readAt(key: string): ReadResult {
    let serialized: string | null
    try {
      serialized = this.storage.getItem(key)
    } catch {
      return { status: 'error' }
    }
    if (!serialized) return { status: 'missing' }
    try {
      const parsed = JSON.parse(serialized)
      validateMockState(parsed)
      return { status: 'valid', state: parsed as MockState }
    } catch {
      try {
        this.storage.removeItem(key)
      } catch {
        // Best effort cleanup for invalid data.
      }
      return { status: 'invalid' }
    }
  }

  read(): MockState | null {
    const current = this.readAt(MOCK_STORAGE_KEY)
    if (current.status === 'valid') {
      this.retryLegacyCleanup(current.state)
      return current.state
    }
    if (current.status === 'error') return null

    const legacy = this.readAt(LEGACY_MOCK_STORAGE_KEY)
    if (legacy.status !== 'valid') return null

    try {
      this.storage.setItem(MOCK_STORAGE_KEY, JSON.stringify(legacy.state))
    } catch {
      return legacy.state
    }

    try {
      this.storage.removeItem(LEGACY_MOCK_STORAGE_KEY)
    } catch {
      try {
        this.storage.removeItem(MOCK_STORAGE_KEY)
      } catch {
        // Keep both copies; a later canonical read retries legacy cleanup.
      }
    }
    return legacy.state
  }

  private retryLegacyCleanup(state: MockState): void {
    let legacy: string | null
    try {
      legacy = this.storage.getItem(LEGACY_MOCK_STORAGE_KEY)
    } catch {
      return
    }
    if (!legacy || legacy !== JSON.stringify(state)) return
    try {
      this.storage.removeItem(LEGACY_MOCK_STORAGE_KEY)
    } catch {
      // Retry on a later canonical read.
    }
  }

  write(state: MockState): void {
    this.storage.setItem(MOCK_STORAGE_KEY, JSON.stringify(state))
  }

  clear(): void {
    let firstError: unknown
    try {
      this.storage.removeItem(MOCK_STORAGE_KEY)
    } catch (error) {
      firstError = error
    }
    try {
      this.storage.removeItem(LEGACY_MOCK_STORAGE_KEY)
    } catch (error) {
      firstError ??= error
    }
    if (firstError) throw firstError
  }
}
