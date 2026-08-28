import type { AuthEmailFlow } from '../../../shared/schemas/auth'
import type { BrowserStorage } from './active-company.storage'

export interface RecoveryFlowMarker {
  type: AuthEmailFlow
  timestamp: number
}

export interface RecoveryFlowStorage {
  begin(type: AuthEmailFlow): void
  get(): RecoveryFlowMarker | null
  clear(): void
}

const storageKey = 'taskovia:recovery-flow'
const markerLifetimeMs = 15 * 60 * 1_000

function browserSessionStorage(): BrowserStorage | null {
  try {
    return globalThis.sessionStorage
  }
  catch {
    return null
  }
}

function isMarker(value: unknown): value is RecoveryFlowMarker {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const entries = Object.entries(value)
  if (entries.length !== 2) return false

  const candidate = value as Record<string, unknown>
  return (candidate.type === 'invite' || candidate.type === 'recovery')
    && typeof candidate.timestamp === 'number'
    && Number.isFinite(candidate.timestamp)
}

export function createRecoveryFlowStorage(options: {
  storage?: BrowserStorage
  now?: () => number
} = {}): RecoveryFlowStorage {
  const storage = options.storage ?? browserSessionStorage()
  const now = options.now ?? Date.now

  return {
    begin(type) {
      storage?.setItem(storageKey, JSON.stringify({ type, timestamp: now() }))
    },
    get() {
      const serialized = storage?.getItem(storageKey)
      if (!serialized) return null

      try {
        const marker: unknown = JSON.parse(serialized)
        if (!isMarker(marker) || marker.timestamp > now() || now() - marker.timestamp > markerLifetimeMs) {
          storage?.removeItem(storageKey)
          return null
        }
        return marker
      }
      catch {
        storage?.removeItem(storageKey)
        return null
      }
    },
    clear() {
      storage?.removeItem(storageKey)
    },
  }
}
