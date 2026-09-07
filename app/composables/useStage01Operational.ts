import { computed, ref, type Ref } from 'vue'
import { ClientError } from '../errors/client-error'
import type { Stage01OperationalDetail } from '../features/stage01/stage01.types'
import type { Stage01Repository } from '../repositories/contracts'

export type Stage01OperationalOperation = 'load' | 'command' | null

export interface Stage01CanonicalRecoveryEntry {
  detail: Stage01OperationalDetail | null
  operation: Stage01OperationalOperation
  error: unknown | null
  canonicalSyncRequired: boolean
}

export interface Stage01OperationalOptions {
  companyId?: string
  recoveryState?: Ref<Record<string, Stage01CanonicalRecoveryEntry>>
}

export function useStage01Operational(
  repository: Stage01Repository,
  opportunityId: string,
  options: Stage01OperationalOptions = {},
) {
  const recoveryState = options.recoveryState ?? ref<Record<string, Stage01CanonicalRecoveryEntry>>({})
  const resourceKey = `${options.companyId ?? 'unknown-company'}:${opportunityId}`
  if (!recoveryState.value[resourceKey]) {
    recoveryState.value[resourceKey] = {
      detail: null,
      operation: null,
      error: null,
      canonicalSyncRequired: false,
    }
  }
  const entry = recoveryState.value[resourceKey]!
  const detail = computed({ get: () => entry.detail, set: value => { entry.detail = value } })
  const operation = computed({ get: () => entry.operation, set: value => { entry.operation = value } })
  const error = computed({ get: () => entry.error, set: value => { entry.error = value } })
  const canonicalSyncRequired = computed(() => entry.canonicalSyncRequired)
  const pending = computed(() => entry.operation !== null)

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
        entry.canonicalSyncRequired = false
      }
      catch {
        throw canonicalReloadRequired()
      }
      return result
    })
  }

  return { detail, operation, error, pending, canonicalSyncRequired, load, runAndReload }
}
