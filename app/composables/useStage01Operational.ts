import { computed, ref, type Ref } from 'vue'
import { ClientError } from '../errors/client-error'
import type { Stage01OperationalDetail } from '../features/stage01/stage01.types'
import type { Stage01Repository } from '../repositories/contracts'
import { blockedContactRecovery, contactRecoveryEntrySchema, type ContactRecoveryEntry } from '../features/stage01-operational/contact-recovery'

export type Stage01OperationalOperation = 'load' | 'command' | null

export interface Stage01CanonicalRecoveryEntry {
  detail: Stage01OperationalDetail | null
  operation: Stage01OperationalOperation
  error: unknown | null
  canonicalSyncRequired: boolean
  contactRecovery: ContactRecoveryEntry | null
}

export interface Stage01OperationalOptions {
  companyId?: string
  actorId?: string
  recoveryState?: Ref<Record<string, Stage01CanonicalRecoveryEntry>>
}

const contactRecoveryStoragePrefix = 'taskovia.stage01-contact-recovery.v1'

function contactRecoveryStorageKey(resourceKey: string): string {
  return `${contactRecoveryStoragePrefix}:${resourceKey}`
}

function storageForRecovery(): { storage: Storage | null, unavailable: boolean } {
  if (typeof window === 'undefined') return { storage: null, unavailable: false }
  try {
    return { storage: window.sessionStorage, unavailable: false }
  } catch {
    return { storage: null, unavailable: true }
  }
}

function storageFailureEntry(value?: ContactRecoveryEntry | null): ContactRecoveryEntry {
  const fallback = value ?? blockedContactRecovery({
    displayName: '', relationshipCode: '', methodType: 'phone', methodValue: '', isPrimary: false,
  }, 'Không thể đọc trạng thái khôi phục trong phiên làm việc. Không thể tiếp tục tự động để tránh tạo trùng liên hệ.')
  return {
    ...fallback,
    phase: 'blocked_unknown',
    reason: 'Không thể lưu hoặc đọc trạng thái khôi phục trong phiên làm việc. Không thể tiếp tục tự động để tránh tạo trùng liên hệ.',
  }
}

export function useStage01Operational(
  repository: Stage01Repository,
  opportunityId: string,
  options: Stage01OperationalOptions = {},
) {
  const recoveryState = options.recoveryState ?? ref<Record<string, Stage01CanonicalRecoveryEntry>>({})
  const resourceKey = `${options.actorId ?? 'unknown-user'}:${options.companyId ?? 'unknown-company'}:${opportunityId}`
  if (!recoveryState.value[resourceKey]) {
    recoveryState.value[resourceKey] = {
      detail: null,
      operation: null,
      error: null,
      canonicalSyncRequired: false,
      contactRecovery: null,
    }
  }
  const entry = recoveryState.value[resourceKey]!
  const storageState = storageForRecovery()
  const storage = storageState.storage
  const contactRecoveryStorageBlocked = ref(storageState.unavailable)
  if (storageState.unavailable && entry.contactRecovery === null) entry.contactRecovery = storageFailureEntry()
  if (storage && entry.contactRecovery === null) {
    try {
      const stored = storage.getItem(contactRecoveryStorageKey(resourceKey))
      if (stored !== null) {
        const parsed = contactRecoveryEntrySchema.safeParse(JSON.parse(stored))
        entry.contactRecovery = parsed.success ? parsed.data : storageFailureEntry()
        contactRecoveryStorageBlocked.value = !parsed.success
      }
    } catch {
      entry.contactRecovery = storageFailureEntry()
      contactRecoveryStorageBlocked.value = true
    }
  }
  const detail = computed({ get: () => entry.detail, set: value => { entry.detail = value } })
  const operation = computed({ get: () => entry.operation, set: value => { entry.operation = value } })
  const error = computed({ get: () => entry.error, set: value => { entry.error = value } })
  const canonicalSyncRequired = computed(() => entry.canonicalSyncRequired)
  const contactRecovery = computed(() => entry.contactRecovery)
  const contactRecoveryStorageAvailable = computed(() => !contactRecoveryStorageBlocked.value)
  const pending = computed(() => entry.operation !== null)

  function setContactRecovery(value: ContactRecoveryEntry | null): boolean {
    if (contactRecoveryStorageBlocked.value) {
      entry.contactRecovery = storageFailureEntry(entry.contactRecovery ?? value)
      return false
    }
    entry.contactRecovery = value
    if (!storage) return true
    try {
      const key = contactRecoveryStorageKey(resourceKey)
      if (value === null) storage.removeItem(key)
      else storage.setItem(key, JSON.stringify(value))
      contactRecoveryStorageBlocked.value = false
      return true
    } catch {
      contactRecoveryStorageBlocked.value = true
      entry.contactRecovery = storageFailureEntry(value)
      return false
    }
  }

  function reconcileContactRecovery(nextDetail: Stage01OperationalDetail): void {
    const recovery = entry.contactRecovery
    if (!recovery?.contactId) return
    if (!recovery.methodCompleted) return
    const relationshipExists = nextDetail.opportunity.contacts.some(contact => (
      contact.contactId === recovery.contactId
      && contact.endedAt === null
      && contact.relationshipCode === recovery.draft.relationshipCode
      && contact.isPrimary === recovery.draft.isPrimary
    ))
    if (!relationshipExists) {
      if (recovery.phase === 'link_complete_pending_reload') {
        const blocked = blockedContactRecovery(
          recovery.draft,
          'Thao tác liên kết đã trả về thành công nhưng dữ liệu chính tắc chưa xác nhận liên hệ. Không thể tiếp tục tự động để tránh tạo trùng liên hệ.',
          recovery.contactId,
          recovery.contactVersion,
        )
        blocked.methodCompleted = recovery.methodCompleted
        setContactRecovery(blocked)
      }
      return
    }
    const related = nextDetail.relatedContacts.find(contact => contact.id === recovery.contactId)
    const methodExists = !recovery.draft.methodValue || related?.methods.some(method => (
      method.methodType === recovery.draft.methodType
      && method.value === recovery.draft.methodValue
      && method.isUsable
    ))
    if (methodExists) {
      setContactRecovery(null)
    }
    else if (recovery.phase === 'link_complete_pending_reload') {
      const blocked = blockedContactRecovery(
        recovery.draft,
        'Dữ liệu chính tắc chưa xác nhận phương thức liên hệ đã hoàn tất. Không thể tiếp tục tự động để tránh tạo trùng liên hệ.',
        recovery.contactId,
        recovery.contactVersion,
      )
      blocked.methodCompleted = recovery.methodCompleted
      setContactRecovery(blocked)
    }
  }

  function canonicalReloadRequired(): ClientError {
    return new ClientError({
      kind: 'network',
      code: 'CANONICAL_RELOAD_REQUIRED',
      message: 'Thao tác có thể đã được thực hiện, nhưng chưa tải được dữ liệu chính tắc. Vui lòng tải lại dữ liệu trước khi tiếp tục.',
      retryable: true,
    })
  }

  async function run<T>(nextOperation: Exclude<Stage01OperationalOperation, null>, action: () => Promise<T>): Promise<T> {
    if (nextOperation === 'command' && canonicalSyncRequired.value) {
      const recoveryError = canonicalReloadRequired()
      error.value = recoveryError
      throw recoveryError
    }

    if (operation.value !== null) {
      throw new ClientError({
        kind: 'validation',
        code: 'VALIDATION_FAILED',
        message: 'Một thao tác Stage 01 đang được xử lý. Vui lòng chờ hoàn tất.',
        retryable: false,
      })
    }

    operation.value = nextOperation
    error.value = null
    try {
      return await action()
    }
    catch (caught) {
      error.value = caught
      throw caught
    }
    finally {
      operation.value = null
    }
  }

  async function fetchCanonicalDetail(): Promise<Stage01OperationalDetail> {
    const nextDetail = await repository.get(opportunityId)
    detail.value = nextDetail
    reconcileContactRecovery(nextDetail)
    entry.canonicalSyncRequired = false
    return nextDetail
  }

  async function load(): Promise<Stage01OperationalDetail> {
    return run('load', fetchCanonicalDetail)
  }

  async function runAndReload<T>(action: () => Promise<T>): Promise<T> {
    return run('command', async () => {
      const result = await action()
      entry.canonicalSyncRequired = true
      try {
        const nextDetail = await repository.get(opportunityId)
        detail.value = nextDetail
        reconcileContactRecovery(nextDetail)
        entry.canonicalSyncRequired = false
      }
      catch {
        throw canonicalReloadRequired()
      }
      return result
    })
  }

  return {
    detail,
    operation,
    error,
    pending,
    canonicalSyncRequired,
    contactRecovery,
    contactRecoveryStorageAvailable,
    setContactRecovery,
    load,
    runAndReload,
  }
}
