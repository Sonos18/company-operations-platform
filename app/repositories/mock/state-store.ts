import type { MockState } from './schemas'

export const MOCK_STORAGE_KEY = 'company-operations-platform:tenant-vqh:company-vqh:prototype:v1'

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
  read(): MockState | null {
    const serialized = localStorage.getItem(MOCK_STORAGE_KEY)
    if (!serialized) return null
    try {
      return JSON.parse(serialized) as MockState
    } catch {
      localStorage.removeItem(MOCK_STORAGE_KEY)
      return null
    }
  }

  write(state: MockState): void {
    localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(state))
  }

  clear(): void {
    localStorage.removeItem(MOCK_STORAGE_KEY)
  }
}
